import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { istDayKey } from '@/lib/domain/time';
import { creditTotal, type Credits } from '@/lib/domain/catalog';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Department } from '@/lib/models/department';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { pageSize } from '@/lib/schemas/common';
import { OUTCOME_CODES, type BASKET_SCOPES } from '@/lib/schemas/structure';

const skip = (page: number) => (page - 1) * pageSize;

export async function getStructureCounts(): Promise<{ departments: number; programs: number; terms: number }> {
  await requireViewer(['admin']);
  await db();
  const [departments, programs, terms] = await Promise.all([
    Department.estimatedDocumentCount(),
    Program.estimatedDocumentCount(),
    Term.estimatedDocumentCount(),
  ]);
  return { departments, programs, terms };
}

export type DepartmentRow = { id: string; code: string; name: string; status: 'active' | 'archived' };

export async function listDepartments(page: number): Promise<{ rows: DepartmentRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    Department.find({}, { code: 1, name: 1, status: 1 }).sort({ code: 1 }).skip(skip(page)).limit(pageSize).lean(),
    Department.estimatedDocumentCount(),
  ]);
  return { rows: docs.map((d) => ({ id: String(d._id), code: d.code, name: d.name, status: d.status })), total };
}

// Departments are few (dozens); the cap keeps a select bounded all the same.
export async function listDepartmentsForSelect(): Promise<{ id: string; label: string }[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await Department.find({ status: 'active' }, { code: 1, name: 1 }).sort({ code: 1 }).limit(200).lean();
  return docs.map((d) => ({ id: String(d._id), label: `${d.code} · ${d.name}` }));
}

export type ProgramRow = {
  id: string;
  code: string;
  name: string;
  // null: the programme came from the course list and has no department yet (A-61).
  departmentCode: string | null;
  durationSemesters: number | null;
  status: 'active' | 'archived';
};

export async function listPrograms(page: number): Promise<{ rows: ProgramRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    Program.find({}, { code: 1, name: 1, departmentId: 1, durationSemesters: 1, status: 1 })
      .sort({ code: 1 })
      .skip(skip(page))
      .limit(pageSize)
      .lean(),
    Program.estimatedDocumentCount(),
  ]);
  const departments = await Department.find(
    { _id: { $in: docs.flatMap((p) => p.departmentId ?? []) } },
    { code: 1 },
  ).lean();
  const codes = new Map(departments.map((d) => [String(d._id), d.code]));
  return {
    rows: docs.map((p) => ({
      id: String(p._id),
      code: p.code,
      name: p.name,
      departmentCode: p.departmentId ? (codes.get(String(p.departmentId)) ?? null) : null,
      durationSemesters: p.durationSemesters ?? null,
      status: p.status,
    })),
    total,
  };
}

export type BasketSummary = {
  id: string;
  name: string;
  title: string | null;
  scope: (typeof BASKET_SCOPES)[number] | null;
  minCredits: number | null;
  courses: number;
  credits: number;
};

export type ProgramDetail = {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  durationSemesters: number | null;
  status: 'active' | 'archived';
  outcomes: { code: (typeof OUTCOME_CODES)[number]; title: string }[];
  baskets: BasketSummary[];
  // Courses listed with no basket.
  unbasketed: { courses: number; credits: number };
};

export async function getProgram(id: string): Promise<ProgramDetail> {
  await requireViewer(['admin']);
  if (!isValidObjectId(id)) notFound();
  await db();
  const p = await Program.findById(id).lean();
  if (!p) notFound();
  // A programme lists at most 1,000 courses, so its totals come from two bounded reads.
  const entries = await CurriculumEntry.find({ programId: id }, { courseId: 1, basket: 1 }).limit(1000).lean();
  const courses = await Course.find({ _id: { $in: entries.map((e) => e.courseId) } }, { credits: 1 }).lean();
  const credits = new Map(courses.map((c) => [String(c._id), creditTotal(c.credits)]));
  const totals = (basket: string | null) => {
    const listed = entries.filter((e) => (e.basket ?? null) === basket);
    return {
      courses: listed.length,
      credits: listed.reduce((sum, e) => sum + (credits.get(String(e.courseId)) ?? 0), 0),
    };
  };
  const titles = new Map(p.outcomeTitles.map((o) => [o.code, o.title]));
  return {
    id: String(p._id),
    code: p.code,
    name: p.name,
    departmentId: p.departmentId ? String(p.departmentId) : null,
    durationSemesters: p.durationSemesters ?? null,
    status: p.status,
    outcomes: OUTCOME_CODES.map((code) => ({ code, title: titles.get(code) ?? '' })),
    baskets: p.baskets.map((b) => ({
      id: String(b._id),
      name: b.name,
      title: b.title ?? null,
      scope: b.scope ?? null,
      minCredits: b.minCredits ?? null,
      ...totals(b.name),
    })),
    unbasketed: totals(null),
  };
}

export type CurriculumRow = {
  courseId: string;
  code: string;
  title: string;
  credits: Credits;
  basket: string | null;
  courseType: string | null;
};

export async function listCurriculum(
  programId: string,
  page: number,
  basket: string | undefined,
): Promise<{ rows: CurriculumRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const filter = { programId, ...(basket !== undefined ? { basket: basket || null } : {}) };
  const [entries, total] = await Promise.all([
    CurriculumEntry.find(filter, { courseId: 1, basket: 1, courseType: 1 })
      .sort({ basket: 1, courseCode: 1 })
      .skip(skip(page))
      .limit(pageSize)
      .lean(),
    CurriculumEntry.countDocuments(filter),
  ]);
  const courses = await Course.find(
    { _id: { $in: entries.map((e) => e.courseId) } },
    { code: 1, title: 1, credits: 1 },
  ).lean();
  const byId = new Map(courses.map((c) => [String(c._id), c]));
  return {
    rows: entries.flatMap((e) => {
      const course = byId.get(String(e.courseId));
      return course
        ? [
            {
              courseId: String(course._id),
              code: course.code,
              title: course.title,
              credits: course.credits,
              basket: e.basket ?? null,
              courseType: e.courseType ?? null,
            },
          ]
        : [];
    }),
    total,
  };
}

export type BatchRow = {
  id: string;
  name: string;
  startYear: number;
  sections: string[];
  status: 'active' | 'graduated';
};

export async function listBatches(programId: string, page: number): Promise<{ rows: BatchRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    Batch.find({ programId }, { name: 1, startYear: 1, sections: 1, status: 1 })
      .sort({ startYear: -1 })
      .skip(skip(page))
      .limit(pageSize)
      .lean(),
    Batch.countDocuments({ programId }),
  ]);
  return {
    rows: docs.map((b) => ({
      id: String(b._id),
      name: b.name,
      startYear: b.startYear,
      sections: b.sections,
      status: b.status,
    })),
    total,
  };
}

export type TermRow = {
  id: string;
  code: string;
  name: string;
  academicYear: string;
  startsOn: string;
  endsOn: string;
  status: 'upcoming' | 'current' | 'closed';
};

const termRow = (t: {
  _id: unknown;
  code: string;
  name: string;
  academicYear: string;
  startsOn: Date;
  endsOn: Date;
  status: TermRow['status'];
}): TermRow => ({
  id: String(t._id),
  code: t.code,
  name: t.name,
  academicYear: t.academicYear,
  startsOn: istDayKey(t.startsOn),
  endsOn: istDayKey(t.endsOn),
  status: t.status,
});

const termFields = { code: 1, name: 1, academicYear: 1, startsOn: 1, endsOn: 1, status: 1 };

export async function listTerms(page: number): Promise<{ rows: TermRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    Term.find({}, termFields).sort({ code: -1 }).skip(skip(page)).limit(pageSize).lean(),
    Term.estimatedDocumentCount(),
  ]);
  return { rows: docs.map(termRow), total };
}
