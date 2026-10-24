import 'server-only';
import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { countedAttempt } from '@/lib/domain/attempts';
import {
  computeOfferingAttainment,
  externalPct,
  missedItems,
  type AssessedItem,
  type SeeResult,
} from '@/lib/domain/attainment';
import { Assessment } from '@/lib/models/assessment';
import { Attainment } from '@/lib/models/attainment';
import { Course } from '@/lib/models/course';
import { EndSemMark } from '@/lib/models/end-sem-mark';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import { ASSESSMENT_LIMITS, type AttemptPolicy } from '@/lib/schemas/assessment';
import { SETTINGS, type SettingsValue } from '@/lib/schemas/settings';
import { MAX_ENROLLMENTS } from '@/lib/schemas/structure';

type Config = SettingsValue<'attainment'>;

// T2 (M09): working attainment out, in the worker; `attainment-views.ts` reads it for the pages. The worker reads
// settings without Next's cache (02 §5); a stored value a tightened rule refuses counts as the
// defaults, as `saveSettings` treats it.
export async function attainmentSettings(): Promise<Config> {
  const stored = await Setting.findById('attainment', { value: 1 }).lean();
  const parsed = SETTINGS.attainment.schema.safeParse(stored?.value ?? {});
  return parsed.success ? parsed.data : SETTINGS.attainment.schema.parse({});
}

type Published = {
  _id: Types.ObjectId;
  title: string;
  attemptPolicy: AttemptPolicy;
  items: { coIds: Types.ObjectId[]; maxMarks: number }[];
  sections: { draw?: { coIds: Types.ObjectId[]; count: number; marksEach: number } | null }[];
};
type PaperRow = {
  _id: Types.ObjectId;
  paper: { _id: Types.ObjectId; maxMarks: number; coIds: Types.ObjectId[] }[];
  scores: { k: string; m: number }[];
};

// Each student's counted attempt at each assessment (07 §14), by `<assessmentId>:<studentId>`.
async function countedAttempts(
  assessments: readonly Published[],
  studentIds: readonly Types.ObjectId[],
): Promise<Map<string, Types.ObjectId>> {
  if (assessments.length === 0 || studentIds.length === 0) return new Map();
  const groups = await Submission.aggregate<{
    _id: { a: Types.ObjectId; s: Types.ObjectId };
    attempts: { id: Types.ObjectId; attemptNo: number; status: string; total: number | null }[];
  }>([
    {
      $match: {
        assessmentId: { $in: assessments.map((a) => a._id) },
        status: 'graded',
        studentId: { $in: studentIds },
      },
    },
    {
      $group: {
        _id: { a: '$assessmentId', s: '$studentId' },
        attempts: { $push: { id: '$_id', attemptNo: '$attemptNo', status: '$status', total: '$total' } },
      },
    },
  ]);
  const policyOf = new Map(assessments.map((a) => [String(a._id), a.attemptPolicy]));
  const out = new Map<string, Types.ObjectId>();
  for (const group of groups) {
    const counted = countedAttempt(group.attempts, policyOf.get(String(group._id.a)) ?? 'best');
    if (counted) out.set(`${String(group._id.a)}:${String(group._id.s)}`, counted.id);
  }
  return out;
}

// The counted attempts' papers, slim: each question's outcomes and maximum, and the marks it scored. Read 500 at a
// time, as the `testStats` job reads them.
async function papersOf(ids: readonly Types.ObjectId[]): Promise<Map<string, AssessedItem[]>> {
  const out = new Map<string, AssessedItem[]>();
  for (let at = 0; at < ids.length; at += 500) {
    const rows = await Submission.aggregate<PaperRow>([
      { $match: { _id: { $in: ids.slice(at, at + 500) } } },
      {
        $project: {
          paper: {
            $map: {
              input: '$paper',
              as: 'p',
              in: { _id: '$$p._id', maxMarks: '$$p.maxMarks', coIds: { $ifNull: ['$$p.coIds', []] } },
            },
          },
          scores: {
            $map: {
              input: { $objectToArray: { $ifNull: ['$scores', {}] } },
              as: 's',
              in: { k: '$$s.k', m: '$$s.v.marks' },
            },
          },
        },
      },
    ]);
    for (const row of rows) {
      const marks = new Map(row.scores.map((s) => [s.k, s.m]));
      out.set(
        String(row._id),
        row.paper.map((item) => ({
          coIds: item.coIds.map(String),
          maxMarks: item.maxMarks,
          marks: marks.get(String(item._id)) ?? 0,
        })),
      );
    }
  }
  return out;
}

// T2 (07 §4): a credit offering's attainment worked out again from its published results, its end-semester marks and
// its course's map, and its record written whole. Safe in the worker and safe to run twice. Locked offerings are
// worked out too: nothing here changes a mark.
export async function recomputeAttainment(
  offeringId: string,
  now: Date,
  actorId?: string,
): Promise<{ skipped: 'missing' | 'skill' } | { students: number; warnings: number }> {
  await db();
  const offering = await Offering.findById(offeringId, {
    category: 1,
    credits: 1,
    courseId: 1,
    programId: 1,
    batchId: 1,
    termId: 1,
  }).lean();
  if (!offering) return { skipped: 'missing' };
  if (offering.category === 'skill') return { skipped: 'skill' };
  const [settings, course, assessments, enrolments, endSem] = await Promise.all([
    attainmentSettings(),
    Course.findById(offering.courseId, { 'cos._id': 1, 'cos.code': 1, 'cos.statement': 1, coMap: 1 }).lean(),
    Assessment.find(
      { offeringId: offering._id, status: 'results_published' },
      { title: 1, attemptPolicy: 1, 'items.coIds': 1, 'items.maxMarks': 1, 'sections.draw': 1 },
    )
      .limit(ASSESSMENT_LIMITS.perOffering)
      .lean<Published[]>(),
    Enrollment.find({ offeringId: offering._id, status: 'active' }, { studentId: 1 }).limit(MAX_ENROLLMENTS).lean(),
    EndSemMark.find({ offeringId: offering._id }, { studentId: 1, externals: 1 }).limit(MAX_ENROLLMENTS).lean(),
  ]);
  const studentIds = enrolments.map((e) => e.studentId);
  const counted = await countedAttempts(assessments, studentIds);
  const papers = await papersOf([...counted.values()]);
  const seeOf = new Map(
    endSem.map((row) => [
      String(row.studentId),
      externalPct(
        offering.credits,
        row.externals.map((e) => ({ component: e.component, marks: e.marks ?? null, max: e.max, absent: e.absent })),
      ),
    ]),
  );

  const missed = new Map(
    assessments.map((a) => [
      String(a._id),
      missedItems({
        items: a.items.map((item) => ({ coIds: item.coIds.map(String), maxMarks: item.maxMarks })),
        draws: a.sections.flatMap((s) =>
          s.draw ? [{ coIds: s.draw.coIds.map(String), count: s.draw.count, marksEach: s.draw.marksEach }] : [],
        ),
      }),
    ]),
  );
  const students = studentIds.map((studentId) => ({
    items: assessments.flatMap((a) => {
      const attempt = counted.get(`${String(a._id)}:${String(studentId)}`);
      return (attempt ? papers.get(String(attempt)) : missed.get(String(a._id))) ?? [];
    }),
    see: (seeOf.get(String(studentId)) ?? null) satisfies SeeResult,
  }));

  const cos = (course?.cos ?? []).map((co) => ({ id: String(co._id), code: co.code, statement: co.statement }));
  const known = new Set(cos.map((co) => co.id));
  const cells = (course?.coMap ?? [])
    .filter((cell) => known.has(String(cell.coId)))
    .map((cell) => ({ coId: String(cell.coId), outcome: cell.outcome, level: cell.level }));
  const result = computeOfferingAttainment({ cos, cells, students, settings });

  // What the record cannot see in the marks: draws with no outcome filter, and questions with no outcome.
  const unfiltered = assessments.filter((a) => a.sections.some((s) => s.draw && s.draw.coIds.length === 0));
  const untagged = [...papers.values()].reduce((n, items) => n + items.filter((i) => i.coIds.length === 0).length, 0);
  const warnings = [
    ...result.warnings,
    ...unfiltered.map(
      (a) => `“${a.title}” draws questions with no outcome filter, so a student who missed it adds nothing for it.`,
    ),
    ...(untagged > 0
      ? [`${untagged} question${untagged === 1 ? '' : 's'} on students’ papers carry no outcome and count toward none.`]
      : []),
  ].slice(0, 50);

  await Attainment.updateOne(
    { offeringId: offering._id },
    {
      $set: {
        courseId: offering.courseId,
        programId: offering.programId,
        batchId: offering.batchId,
        termId: offering.termId,
        config: settings,
        cos: result.cos.map((co) => ({ ...co, coId: new Types.ObjectId(co.coId) })),
        see: result.see,
        cells: cells.map((cell) => ({ ...cell, coId: new Types.ObjectId(cell.coId) })),
        outcomes: result.outcomes,
        warnings,
        computedAt: now,
        computedBy: actorId ? new Types.ObjectId(actorId) : null,
      },
    },
    { upsert: true },
  );
  return { students: students.length, warnings: warnings.length };
}
