import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import { requireViewer } from '@/lib/auth/session';
import { STALE_RUN_MS } from '@/lib/data/imports';
import { incompleteStudents, type Incomplete } from '@/lib/data/locks';
import { db } from '@/lib/db';
import { formatCredits } from '@/lib/domain/catalog';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { EndSemMark } from '@/lib/models/end-sem-mark';
import { Enrollment } from '@/lib/models/enrollment';
import { GradeSheet, type GradeSheetDoc } from '@/lib/models/grade-sheet';
import { InternalMark } from '@/lib/models/internal-mark';
import { Offering, type OfferingDoc } from '@/lib/models/offering';
import { SyncRun } from '@/lib/models/sync-run';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';
import type { Component, GradeSheetStatus } from '@/lib/schemas/exams';

// M08 pages: the term's batches (/admin/exams), one batch's four steps (/admin/exams/<batchId>), one student's sheet,
// and a student's own Results. Admins only, but for the last.

type Option = { id: string; label: string };
type TermRef = { _id: Types.ObjectId; code: string; name: string; status: string };

// The term asked for, else the current one, else the newest.
async function terms(termId?: string): Promise<{ options: Option[]; term: TermRef | null }> {
  const all = await Term.find({}, { code: 1, name: 1, status: 1 }).sort({ code: -1 }).limit(100).lean();
  const term = all.find((t) => String(t._id) === termId) ?? all.find((t) => t.status === 'current') ?? all[0] ?? null;
  return { options: all.map((t) => ({ id: String(t._id), label: `${t.code} · ${t.name}` })), term };
}

// A term's credit courses that have started, the whole university's or one batch's.
const creditCourses = (termId: Types.ObjectId, batchId?: Types.ObjectId): QueryFilter<OfferingDoc> => ({
  termId,
  category: 'ugc',
  status: { $ne: 'draft' },
  ...(batchId ? { batchId } : {}),
});

async function countBy(
  model: typeof Enrollment | typeof EndSemMark,
  offeringIds: readonly Types.ObjectId[],
  match: Record<string, unknown> = {},
) {
  const rows = await model.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { offeringId: { $in: offeringIds }, ...match } },
    { $group: { _id: '$offeringId', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

async function sheetCounts(termId: Types.ObjectId, batchIds: readonly Types.ObjectId[]) {
  const rows = await GradeSheet.aggregate<{ _id: { b: Types.ObjectId; s: GradeSheetStatus }; n: number }>([
    { $match: { termId, batchId: { $in: batchIds } } },
    { $group: { _id: { b: '$batchId', s: '$status' }, n: { $sum: 1 } } },
  ]);
  const out = new Map<string, Record<GradeSheetStatus, number>>();
  for (const row of rows) {
    const counts = out.get(String(row._id.b)) ?? { incomplete: 0, draft: 0, published: 0 };
    counts[row._id.s] = row.n;
    out.set(String(row._id.b), counts);
  }
  return out;
}

export type ExamsTerm = {
  terms: Option[];
  termId: string | null;
  totals: { batches: number; courses: number; locked: number; ready: number; published: number };
  rows: {
    id: string;
    name: string;
    students: number;
    courses: number;
    locked: number;
    marks: { done: number; of: number };
    sheets: Record<GradeSheetStatus, number>;
  }[];
  total: number;
};

// /admin/exams: every batch with credit courses in the term, ten a page by name.
export async function getExamsTerm(termId: string | undefined, page: number): Promise<ExamsTerm> {
  await requireViewer(['admin']);
  await db();
  const { options, term } = await terms(termId);
  const empty = { terms: options, termId: term ? String(term._id) : null, rows: [], total: 0 };
  if (!term) return { ...empty, totals: { batches: 0, courses: 0, locked: 0, ready: 0, published: 0 } };
  const offerings = await Offering.find(creditCourses(term._id), { batchId: 1, lockedAt: 1 }).lean();
  const batchIds = [...new Set(offerings.map((o) => String(o.batchId)))];
  const [batches, ready, published] = await Promise.all([
    Batch.find({ _id: { $in: batchIds } }, { name: 1 })
      .sort({ name: 1 })
      .lean(),
    GradeSheet.countDocuments({ termId: term._id, status: 'draft' }),
    GradeSheet.countDocuments({ termId: term._id, status: 'published' }),
  ]);
  const shown = batches.slice((page - 1) * pageSize, page * pageSize);
  const shownOfferings = offerings.filter((o) => shown.some((b) => b._id.equals(o.batchId)));
  const ids = shownOfferings.map((o) => o._id);
  const [students, enrolled, marked, sheets] = await Promise.all([
    User.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { batchId: { $in: shown.map((b) => b._id) }, roles: 'student', status: { $ne: 'disabled' } } },
      { $group: { _id: '$batchId', n: { $sum: 1 } } },
    ]),
    countBy(Enrollment, ids, { status: 'active' }),
    countBy(EndSemMark, ids),
    sheetCounts(
      term._id,
      shown.map((b) => b._id),
    ),
  ]);
  const studentsOf = new Map(students.map((s) => [String(s._id), s.n]));
  return {
    ...empty,
    totals: {
      batches: batches.length,
      courses: offerings.length,
      locked: offerings.filter((o) => o.lockedAt).length,
      ready,
      published,
    },
    rows: shown.map((b) => {
      const mine = shownOfferings.filter((o) => o.batchId.equals(b._id));
      const sum = (counts: Map<string, number>) => mine.reduce((n, o) => n + (counts.get(String(o._id)) ?? 0), 0);
      return {
        id: String(b._id),
        name: b.name,
        students: studentsOf.get(String(b._id)) ?? 0,
        courses: mine.length,
        locked: mine.filter((o) => o.lockedAt).length,
        marks: { done: sum(marked), of: sum(enrolled) },
        sheets: sheets.get(String(b._id)) ?? { incomplete: 0, draft: 0, published: 0 },
      };
    }),
    total: batches.length,
  };
}

type Run = {
  status: 'running' | 'stopped' | 'succeeded' | 'partial' | 'failed';
  at: Date;
  by: string;
  stats: { rows: number | null; applied: number; skipped: number; failed: number };
  failures: { row: number | null; key: string | null; message: string }[];
  failureCount: number;
};

export type BatchCourse = {
  id: string;
  code: string;
  title: string;
  section: string | null;
  credits: string;
  faculty: string[];
  students: number;
  complete: number;
  incomplete: Incomplete[];
  // No class recorded in the LMS, so nobody's attendance part is filled (Q-58).
  noClasses: boolean;
  locked: { at: Date; by: string } | null;
  endSem: number;
};

export type SheetRow = {
  studentId: string;
  name: string;
  rollNo: string;
  credits: number;
  sgpa: number | null;
  flags: string[];
  missing: string[];
};

export type ExamBatch = {
  batch: { id: string; name: string; sections: string[] };
  terms: Option[];
  term: { id: string; code: string; name: string };
  students: number;
  courses: BatchCourse[];
  lockRun: Run | null;
  exportRun: Run | null;
  importRun: Run | null;
  sheetRun: Run | null;
  sheets: { counts: Record<GradeSheetStatus, number>; status: GradeSheetStatus; rows: SheetRow[]; total: number };
};

// /admin/exams/<batchId>: the batch's credit courses this term, the last run of each kind, and a page of its sheets.
export async function getExamBatch(
  batchId: string,
  filter: { termId?: string; status?: GradeSheetStatus; page: number },
): Promise<ExamBatch> {
  await requireViewer(['admin']);
  if (!isValidObjectId(batchId)) notFound();
  await db();
  const [batch, { options, term }] = await Promise.all([
    Batch.findById(batchId, { name: 1, sections: 1 }).lean(),
    terms(filter.termId),
  ]);
  if (!batch || !term) notFound();
  const offerings = await Offering.find(creditCourses(term._id, batch._id), {
    courseId: 1,
    section: 1,
    credits: 1,
    facultyIds: 1,
    lockedAt: 1,
    lockedBy: 1,
    title: 1,
  })
    .sort({ title: 1 })
    .limit(200)
    .lean();
  const ids = offerings.map((o) => o._id);
  const [courses, people, enrolled, completes, marked, students, runs] = await Promise.all([
    Course.find({ _id: { $in: offerings.map((o) => o.courseId) } }, { code: 1, title: 1 }).lean(),
    User.find(
      { _id: { $in: offerings.flatMap((o) => [...o.facultyIds, ...(o.lockedBy ? [o.lockedBy] : [])]) } },
      { name: 1 },
    ).lean(),
    countBy(Enrollment, ids, { status: 'active' }),
    InternalMark.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { offeringId: { $in: ids }, complete: true } },
      { $group: { _id: '$offeringId', n: { $sum: 1 } } },
    ]),
    countBy(EndSemMark, ids),
    User.countDocuments({ batchId: batch._id, roles: 'student', status: { $ne: 'disabled' } }),
    Promise.all(
      (['marks_lock', 'exam_push_csv', 'exam_pull_csv', 'grade_sheets'] as const).map((kind) =>
        SyncRun.findOne({ kind, termId: term._id, batchId: batch._id })
          .sort({ startedAt: -1 })
          .lean()
          .then(
            (run) =>
              run && {
                status: run.status,
                startedAt: run.startedAt,
                updatedAt: run.updatedAt,
                actorId: run.actorId ?? null,
                stats: {
                  rows: run.stats.rows ?? null,
                  applied: run.stats.applied,
                  skipped: run.stats.skipped,
                  failed: run.stats.failed,
                },
                failureCount: run.failures.length,
                failures: run.failures
                  .slice(0, 20)
                  .map((f) => ({ row: f.row ?? null, key: f.key ?? null, message: f.message })),
              },
          ),
      ),
    ),
  ]);
  const courseOf = new Map(courses.map((c) => [String(c._id), c]));
  const nameOf = new Map(people.map((p) => [String(p._id), p.name]));
  const completeOf = new Map(completes.map((c) => [String(c._id), c.n]));
  const rows = await Promise.all(
    offerings.map(async (o): Promise<BatchCourse> => {
      const students = enrolled.get(String(o._id)) ?? 0;
      const complete = completeOf.get(String(o._id)) ?? 0;
      const gaps = !o.lockedAt && complete < students ? await incompleteStudents(String(o._id), 20) : null;
      const noClasses =
        gaps !== null &&
        o.credits.theory > 0 &&
        !(await InternalMark.exists({
          offeringId: o._id,
          parts: { $elemMatch: { key: 'attendance', count: { $gt: 0 } } },
        }));
      const course = courseOf.get(String(o.courseId));
      return {
        id: String(o._id),
        code: course?.code ?? '—',
        title: course?.title ?? o.title,
        section: o.section ?? null,
        credits: formatCredits(o.credits),
        faculty: o.facultyIds.flatMap((id) => nameOf.get(String(id)) ?? []),
        students,
        complete,
        incomplete: gaps?.students ?? [],
        noClasses,
        locked: o.lockedAt ? { at: o.lockedAt, by: nameOf.get(String(o.lockedBy)) ?? 'an administrator' } : null,
        endSem: marked.get(String(o._id)) ?? 0,
      };
    }),
  );
  const [lockRun, exportRun, importRun, sheetRun] = await Promise.all(runs.map((run) => runOf(run)));
  const counts = (await sheetCounts(term._id, [batch._id])).get(String(batch._id)) ?? {
    incomplete: 0,
    draft: 0,
    published: 0,
  };
  // Ready first, then whatever there is.
  const status =
    filter.status ??
    (['draft', 'incomplete', 'published'] as const).find((s) => counts[s] > 0) ??
    ('draft' satisfies GradeSheetStatus);
  return {
    batch: { id: String(batch._id), name: batch.name, sections: batch.sections },
    terms: options,
    term: { id: String(term._id), code: term.code, name: term.name },
    students,
    courses: rows,
    lockRun,
    exportRun,
    importRun,
    sheetRun,
    sheets: { counts, status, ...(await sheetPage(term._id, batch._id, status, filter.page)) },
  };
}

async function runOf(
  run: {
    status: Run['status'];
    startedAt: Date;
    updatedAt: Date;
    actorId?: Types.ObjectId | null;
    stats: Run['stats'];
    failures: Run['failures'];
    failureCount: number;
  } | null,
): Promise<Run | null> {
  if (!run) return null;
  const by = run.actorId ? (await User.findById(run.actorId, { name: 1 }).lean())?.name : null;
  return {
    status: run.status === 'running' && Date.now() - run.updatedAt.getTime() > STALE_RUN_MS ? 'stopped' : run.status,
    at: run.startedAt,
    by: by ?? 'an administrator',
    stats: run.stats,
    failures: run.failures,
    failureCount: run.failureCount,
  };
}

// One page of the batch's sheets in one state, by roll number.
async function sheetPage(termId: Types.ObjectId, batchId: Types.ObjectId, status: GradeSheetStatus, page: number) {
  const ids = await GradeSheet.distinct('studentId', { termId, batchId, status });
  const students = await User.find({ _id: { $in: ids } }, { name: 1, rollNo: 1 })
    .sort({ rollNo: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  const sheets = await GradeSheet.find(
    { termId, studentId: { $in: students.map((s) => s._id) } },
    { studentId: 1, credits: 1, sgpa: 1, rows: 1, missing: 1 },
  ).lean();
  const sheetOf = new Map(sheets.map((s) => [String(s.studentId), s]));
  return {
    total: ids.length,
    rows: students.map((s) => {
      const sheet = sheetOf.get(String(s._id));
      return {
        studentId: String(s._id),
        name: s.name,
        rollNo: s.rollNo ?? '—',
        credits: sheet?.credits ?? 0,
        sgpa: sheet?.sgpa ?? null,
        // What a checker looks at first: a failed or absent course.
        flags: (sheet?.rows ?? []).flatMap((row) =>
          row.gradePoint === 0 ? [`${row.grade} in ${row.courseCode}`] : [],
        ),
        missing: sheet?.missing ?? [],
      };
    }),
  };
}

export type SheetView = {
  term: { code: string; name: string };
  student: { name: string; rollNo: string; batch: string };
  status: GradeSheetStatus;
  publishedAt: Date | null;
  credits: number;
  sgpa: number | null;
  missing: string[];
  rows: {
    code: string;
    title: string;
    credits: string;
    creditTotal: number;
    pct: number;
    grade: string;
    gradePoint: number;
    components: {
      component: Component;
      internal: number;
      internalMax: number;
      external: number | null;
      externalMax: number;
      absent: boolean;
      marks: number;
    }[];
  }[];
};

function viewOf(
  sheet: Pick<GradeSheetDoc, 'status' | 'publishedAt' | 'credits' | 'sgpa' | 'missing' | 'rows'>,
  term: { code: string; name: string },
  student: SheetView['student'],
): SheetView {
  return {
    term,
    student,
    status: sheet.status,
    publishedAt: sheet.publishedAt ?? null,
    credits: sheet.credits,
    sgpa: sheet.sgpa ?? null,
    missing: sheet.missing,
    rows: sheet.rows.map((row) => ({
      code: row.courseCode,
      title: row.courseTitle,
      credits: formatCredits(row.credits),
      creditTotal: row.credits.theory + row.credits.practice + row.credits.project,
      pct: row.pct,
      grade: row.grade,
      gradePoint: row.gradePoint,
      components: row.components.map((c) => ({
        component: c.component,
        internal: c.internal,
        internalMax: c.internalMax,
        external: c.external ?? null,
        externalMax: c.externalMax,
        absent: c.absent,
        marks: c.marks,
      })),
    })),
  };
}

// An admin's look at one student's sheet in any state, laid out as the student will see it (mock-up E4 → E5).
export async function getBatchSheet(
  batchId: string,
  studentId: string,
  termId: string | undefined,
): Promise<SheetView> {
  await requireViewer(['admin']);
  if (!isValidObjectId(batchId) || !isValidObjectId(studentId) || !termId || !isValidObjectId(termId)) notFound();
  await db();
  const [sheet, term, student, batch] = await Promise.all([
    GradeSheet.findOne({ termId, studentId, batchId }).lean(),
    Term.findById(termId, { code: 1, name: 1 }).lean(),
    User.findById(studentId, { name: 1, rollNo: 1 }).lean(),
    Batch.findById(batchId, { name: 1 }).lean(),
  ]);
  if (!sheet || !term || !student || !batch) notFound();
  return viewOf(sheet, term, { name: student.name, rollNo: student.rollNo ?? '—', batch: batch.name });
}

// DSH-07: a student's own published sheets, newest term first (09 §3: `studentId = me`, `published`).
export async function getMyResults(): Promise<SheetView[]> {
  const viewer = await requireViewer(['student']);
  await db();
  const sheets = await GradeSheet.find({ studentId: viewer.id, status: 'published' }).limit(20).lean();
  const [found, me, batches] = await Promise.all([
    Term.find({ _id: { $in: sheets.map((s) => s.termId) } }, { code: 1, name: 1, startsOn: 1 }).lean(),
    User.findById(viewer.id, { rollNo: 1 }).lean(),
    Batch.find({ _id: { $in: sheets.map((s) => s.batchId) } }, { name: 1 }).lean(),
  ]);
  const termOf = new Map(found.map((t) => [String(t._id), t]));
  const batchOf = new Map(batches.map((b) => [String(b._id), b.name]));
  return sheets
    .flatMap((sheet) => {
      const term = termOf.get(String(sheet.termId));
      return term ? [{ sheet, term }] : [];
    })
    .sort((a, b) => b.term.startsOn.getTime() - a.term.startsOn.getTime())
    .map(({ sheet, term }) =>
      viewOf(sheet, term, {
        name: viewer.name,
        rollNo: me?.rollNo ?? '—',
        batch: batchOf.get(String(sheet.batchId)) ?? '',
      }),
    );
}
