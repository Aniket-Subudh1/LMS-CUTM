import 'server-only';
import { notFound } from 'next/navigation';
import { Types, type QueryFilter } from 'mongoose';
import { offeringAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { escapeRegex } from '@/lib/data/courses';
import { classesOf, gradedAttempts, policyOf } from '@/lib/data/internal-marks';
import { db } from '@/lib/db';
import { countedAttempt } from '@/lib/domain/attempts';
import { RUBRICS, reviewAverages, rubricMax, type RubricCriteria } from '@/lib/domain/evaluation';
import { CRITERION_LABEL, PART_LABEL } from '@/lib/format';
import { Assessment } from '@/lib/models/assessment';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { InternalMark, type InternalMarkDoc } from '@/lib/models/internal-mark';
import { Offering, type OfferingDoc } from '@/lib/models/offering';
import { ProjectReview } from '@/lib/models/project-review';
import { RubricMark } from '@/lib/models/rubric-mark';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { ASSESSMENT_LIMITS, type AssessmentMode, type AttemptPolicy } from '@/lib/schemas/assessment';
import { pageSize } from '@/lib/schemas/common';
import { THEORY_PARTS, type RubricComponent, type TheoryPart, type Trend } from '@/lib/schemas/marks';
import type { SettingsValue } from '@/lib/schemas/settings';
import { MAX_ENROLLMENTS } from '@/lib/schemas/structure';

type Policy = SettingsValue<'evaluation'>;
type Component = 'theory' | 'practice' | 'project';
const PART_FIELD = {
  midTerm1: 'theoryMidTerm1',
  midTerm2: 'theoryMidTerm2',
  assignment: 'theoryAssignment',
  attendance: 'theoryAttendance',
} as const satisfies Record<TheoryPart, keyof Policy>;

// The components a credit offering has, with each one's internal maximum by its copy of the policy (07 §2).
function componentsOf(credits: OfferingDoc['credits'], policy: Policy): { key: Component; max: number }[] {
  return [
    ...(credits.theory > 0
      ? [{ key: 'theory' as const, max: THEORY_PARTS.reduce((sum, part) => sum + policy[PART_FIELD[part]], 0) }]
      : []),
    ...(['practice', 'project'] as const).flatMap((key) =>
      credits[key] > 0 ? [{ key, max: rubricMax(policy, key) }] : [],
    ),
  ];
}

async function creditOffering(offeringId: string) {
  const offering = await Offering.findById(offeringId, { category: 1, credits: 1, evaluation: 1, lockedAt: 1 }).lean();
  if (!offering || offering.category !== 'ugc') notFound();
  return { offering, policy: await policyOf(offering.evaluation) };
}

// The active students of an offering, a page at a time by roll number, optionally searched and narrowed (A-83 bounds it).
async function studentPage(offeringId: string, ids: Types.ObjectId[], q: string | undefined, page: number) {
  const query = q?.trim();
  const filter: QueryFilter<{ _id: Types.ObjectId }> = {
    _id: { $in: ids },
    ...(query
      ? {
          $or: [
            { rollNo: { $regex: `^${escapeRegex(query)}`, $options: 'i' } },
            { name: { $regex: escapeRegex(query), $options: 'i' } },
          ],
        }
      : {}),
  };
  const [students, total] = await Promise.all([
    User.find(filter, { name: 1, rollNo: 1 })
      .sort({ rollNo: 1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { students, total };
}

// M07 decision 2: each student's project criteria, averaged over their project reviews (07 §2).
async function reviewCriteriaOf(
  offeringId: string,
  studentIds: Types.ObjectId[],
): Promise<Map<string, RubricCriteria>> {
  const reviews = await ProjectReview.find({ offeringId, 'marks.studentId': { $in: studentIds } }, { marks: 1 }).lean();
  const byStudent = new Map<string, RubricCriteria[]>();
  for (const review of reviews) {
    for (const mark of review.marks) {
      const key = String(mark.studentId);
      byStudent.set(key, [...(byStudent.get(key) ?? []), mark.criteria ?? {}]);
    }
  }
  return new Map([...byStudent].map(([key, list]) => [key, reviewAverages(list)]));
}

const activeIds = (offeringId: string) =>
  Enrollment.find({ offeringId, status: 'active' }, { studentId: 1 })
    .limit(MAX_ENROLLMENTS)
    .lean()
    .then((rows) => rows.map((row) => row.studentId));

// `state`: a draft, published with no results yet, or with its results out (only those count, A-20).
export type CountingAssessment = {
  id: string;
  title: string;
  mode: AssessmentMode;
  maxMarks: number;
  state: 'draft' | 'published' | 'results';
};

export type MarksSheet = {
  canTeach: boolean;
  locked: boolean;
  computedAt: Date | null;
  components: { key: Component; max: number }[];
  parts: { key: TheoryPart; label: string; max: number }[];
  // What feeds each theory part: the assessments set to count toward it (drafts too, so a teacher sees their choice).
  counting: Record<Exclude<TheoryPart, 'attendance'>, CountingAssessment[]>;
  notCounted: number;
  classesHeld: number;
  bands: { minPct: number; marks: number }[];
  counts: { students: number; complete: number; dropping: number; averagePct: number | null };
  rows: {
    id: string;
    name: string;
    rollNo: string;
    parts: Partial<Record<TheoryPart, number | null>>;
    components: Partial<Record<Component, number | null>>;
    internalPct: number | null;
    complete: boolean;
    trend: Trend | null;
    points: number[];
  }[];
  total: number;
};

export type MarksFilter = { q?: string; show?: 'dropping' | 'incomplete' };

// M06 T4 (CE-09, DSH-02): the class's internal marks for whoever teaches or oversees it, ten students a page.
export async function getMarksSheet(offeringId: string, filter: MarksFilter, page: number): Promise<MarksSheet> {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  if (access === 'learn') notFound();
  await db();
  const { offering, policy } = await creditOffering(offeringId);
  const id = new Types.ObjectId(offeringId);
  const [ids, assessments, summary, held] = await Promise.all([
    activeIds(offeringId),
    Assessment.find({ offeringId }, { title: 1, mode: 1, maxMarks: 1, status: 1, countsToward: 1 })
      .sort({ closesAt: 1, _id: 1 })
      .limit(ASSESSMENT_LIMITS.perOffering)
      .lean(),
    InternalMark.aggregate<{ complete: number; dropping: number; averagePct: number | null; computedAt: Date }>([
      { $match: { offeringId: id } },
      {
        $group: {
          _id: null,
          complete: { $sum: { $cond: ['$complete', 1, 0] } },
          dropping: { $sum: { $cond: [{ $eq: ['$trend', 'dropping'] }, 1, 0] } },
          averagePct: { $avg: '$internalPct' },
          computedAt: { $max: '$computedAt' },
        },
      },
    ]),
    classesOf(offeringId).then((rows) => Math.max(0, ...[...rows.values()].map((row) => row.held))),
  ]);
  const narrowed = filter.show
    ? await InternalMark.distinct('studentId', {
        offeringId: id,
        ...(filter.show === 'dropping' ? { trend: 'dropping' } : { complete: true }),
      })
    : null;
  // "Not complete" also takes students the recompute has not reached yet.
  const shown = !narrowed
    ? ids
    : filter.show === 'dropping'
      ? ids.filter((s) => narrowed.some((n) => n.equals(s)))
      : ids.filter((s) => !narrowed.some((n) => n.equals(s)));
  const { students, total } = await studentPage(offeringId, shown, filter.q, page);
  const marks = await InternalMark.find({ offeringId: id, studentId: { $in: students.map((s) => s._id) } }).lean();
  const markOf = new Map(marks.map((row) => [String(row.studentId), row]));
  const counting: MarksSheet['counting'] = { midTerm1: [], midTerm2: [], assignment: [] };
  for (const a of assessments) {
    if (!a.countsToward) continue;
    counting[a.countsToward].push({
      id: String(a._id),
      title: a.title,
      mode: a.mode,
      maxMarks: a.maxMarks,
      state: a.status === 'results_published' ? 'results' : a.status,
    });
  }
  const s = summary[0];
  return {
    canTeach: access === 'teach' || viewer.roles.includes('admin'),
    locked: Boolean(offering.lockedAt),
    computedAt: s?.computedAt ?? null,
    components: componentsOf(offering.credits, policy),
    parts:
      offering.credits.theory > 0
        ? THEORY_PARTS.map((key) => ({ key, label: PART_LABEL[key], max: policy[PART_FIELD[key]] }))
        : [],
    counting,
    notCounted: assessments.filter((a) => !a.countsToward && a.status === 'results_published').length,
    classesHeld: held,
    bands: ([1, 2, 3, 4] as const).map((n) => ({ minPct: policy[`band${n}Pct`], marks: policy[`band${n}Marks`] })),
    counts: {
      students: ids.length,
      complete: s?.complete ?? 0,
      dropping: s?.dropping ?? 0,
      averagePct: s?.averagePct ?? null,
    },
    rows: students.map((student) => {
      const row: InternalMarkDoc | undefined = markOf.get(String(student._id));
      return {
        id: String(student._id),
        name: student.name,
        rollNo: student.rollNo ?? '—',
        parts: Object.fromEntries((row?.parts ?? []).map((p) => [p.key, p.marks ?? null])),
        components: row?.components ?? {},
        internalPct: row?.internalPct ?? null,
        complete: row?.complete ?? false,
        trend: row?.trend ?? null,
        points: row?.points ?? [],
      };
    }),
    total,
  };
}

export type RubricSheet = {
  canEdit: boolean;
  // M07 decision 2: the project rubric is the reviews' average, read only here.
  fromReviews: boolean;
  locked: boolean;
  component: RubricComponent;
  criteria: { key: (typeof RUBRICS)[RubricComponent][number]; label: string; max: number }[];
  max: number;
  rows: {
    id: string;
    name: string;
    rollNo: string;
    marks: Partial<Record<string, number>>;
    // REC-04, for the Record criterion: the mean percentage of the student's published lab records.
    labRecordPct: number | null;
  }[];
  total: number;
};

// M06 T4 (M2 A): the practice or project rubric grid, ten students a page. Teachers fill it; a head of department reads.
export async function getRubricSheet(
  offeringId: string,
  component: RubricComponent,
  q: string | undefined,
  page: number,
): Promise<RubricSheet> {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  if (access === 'learn') notFound();
  await db();
  const { offering, policy } = await creditOffering(offeringId);
  if (offering.credits[component] === 0) notFound();
  const { students, total } = await studentPage(offeringId, await activeIds(offeringId), q, page);
  const studentIds = students.map((s) => s._id);
  const fromReviews = component === 'project';
  const [stored, labRecords] = await Promise.all([
    fromReviews
      ? reviewCriteriaOf(offeringId, studentIds)
      : RubricMark.find({ offeringId, component, studentId: { $in: studentIds } }, { studentId: 1, criteria: 1 })
          .lean()
          .then((rows) => new Map(rows.map((row) => [String(row.studentId), row.criteria]))),
    component === 'practice'
      ? Assessment.find(
          { offeringId, mode: 'lab_record', status: 'results_published' },
          { maxMarks: 1, attemptPolicy: 1 },
        )
          .limit(ASSESSMENT_LIMITS.perOffering)
          .lean()
      : [],
  ]);
  const attempts = await gradedAttempts(labRecords, studentIds);
  return {
    canEdit: !fromReviews && (access === 'teach' || viewer.roles.includes('admin')) && !offering.lockedAt,
    fromReviews,
    locked: Boolean(offering.lockedAt),
    component,
    criteria: RUBRICS[component].map((key) => ({ key, label: CRITERION_LABEL[key], max: policy[key] })),
    max: rubricMax(policy, component),
    rows: students.map((student) => {
      const key = String(student._id);
      const pcts = labRecords.map(
        (a) =>
          (100 * (countedAttempt(attempts.get(`${String(a._id)}:${key}`) ?? [], a.attemptPolicy)?.total ?? 0)) /
          a.maxMarks,
      );
      return {
        id: key,
        name: student.name,
        rollNo: student.rollNo ?? '—',
        marks: stored.get(key) ?? {},
        labRecordPct: pcts.length > 0 ? pcts.reduce((sum, p) => sum + p, 0) / pcts.length : null,
      };
    }),
    total,
  };
}

export type MyMarks = {
  computedAt: Date | null;
  components: { key: Component; max: number; marks: number | null }[];
  parts: {
    key: TheoryPart;
    label: string;
    max: number;
    marks: number | null;
    // The published assessments behind a part; `counted` null when the student did not hand one in (it counts 0).
    assessments: { title: string; counted: number | null; maxMarks: number }[];
  }[];
  attendance: { attended: number; held: number; pct: number | null };
  rubrics: { component: RubricComponent; criteria: { label: string; max: number; marks: number | null }[] }[];
  internalPct: number | null;
  complete: boolean;
  trend: Trend | null;
  points: number[];
};

// M06 T4 (M3): a student's own internal marks, with the assessments and classes behind each part (09 §3: their own only).
export async function getMyMarks(offeringId: string): Promise<MyMarks> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) !== 'learn') notFound();
  await db();
  const { offering, policy } = await creditOffering(offeringId);
  const me = new Types.ObjectId(viewer.id);
  const [row, published, rubrics, classes] = await Promise.all([
    InternalMark.findOne({ offeringId, studentId: me }).lean(),
    Assessment.find(
      { offeringId, status: 'results_published', countsToward: { $ne: null } },
      { title: 1, maxMarks: 1, attemptPolicy: 1, countsToward: 1 },
    )
      .sort({ closesAt: 1, _id: 1 })
      .limit(ASSESSMENT_LIMITS.perOffering)
      .lean(),
    RubricMark.find({ offeringId, studentId: me, component: 'practice' }, { criteria: 1 }).lean(),
    classesOf(offeringId),
  ]);
  const projectCriteria = (await reviewCriteriaOf(offeringId, [me])).get(viewer.id) ?? {};
  const attempts = await gradedAttempts(published, [me]);
  const counted = (a: { _id: Types.ObjectId; attemptPolicy: AttemptPolicy }) =>
    countedAttempt(attempts.get(`${String(a._id)}:${viewer.id}`) ?? [], a.attemptPolicy)?.total ?? null;
  const mine = classes.get(viewer.id) ?? { attended: 0, held: 0 };
  const components = componentsOf(offering.credits, policy);
  return {
    computedAt: row?.computedAt ?? null,
    components: components.map((c) => ({ ...c, marks: row?.components?.[c.key] ?? null })),
    parts:
      offering.credits.theory > 0
        ? THEORY_PARTS.map((key) => ({
            key,
            label: PART_LABEL[key],
            max: policy[PART_FIELD[key]],
            marks: row?.parts.find((p) => p.key === key)?.marks ?? null,
            assessments: published
              .filter((a) => a.countsToward === key)
              .map((a) => ({ title: a.title, counted: counted(a), maxMarks: a.maxMarks })),
          }))
        : [],
    attendance: { ...mine, pct: row?.attendancePct ?? null },
    rubrics: (['practice', 'project'] as const)
      .filter((component) => offering.credits[component] > 0)
      .map((component) => {
        const criteria = component === 'project' ? projectCriteria : (rubrics[0]?.criteria ?? {});
        return {
          component,
          criteria: RUBRICS[component].map((key) => ({
            label: CRITERION_LABEL[key],
            max: policy[key],
            marks: criteria[key] ?? null,
          })),
        };
      }),
    internalPct: row?.internalPct ?? null,
    complete: row?.complete ?? false,
    trend: row?.trend ?? null,
    points: row?.points ?? [],
  };
}

export type CeReport = {
  admin: boolean;
  terms: { id: string; label: string }[];
  termId: string | null;
  departments: { id: string; label: string }[];
  departmentId: string | null;
  totals: { offerings: number; students: number; averagePct: number | null; dropping: number };
  rows: {
    id: string;
    title: string;
    faculty: string[];
    students: number;
    averagePct: number | null;
    completePct: number | null;
    dropping: number;
  }[];
  total: number;
};

type Totals = {
  _id: Types.ObjectId | null;
  students: number;
  complete: number;
  dropping: number;
  averagePct: number | null;
};
const totalsBy = (offeringIds: Types.ObjectId[], perOffering: boolean) =>
  InternalMark.aggregate<Totals>([
    { $match: { offeringId: { $in: offeringIds } } },
    {
      $group: {
        _id: perOffering ? '$offeringId' : null,
        students: { $sum: 1 },
        complete: { $sum: { $cond: ['$complete', 1, 0] } },
        dropping: { $sum: { $cond: [{ $eq: ['$trend', 'dropping'] }, 1, 0] } },
        averagePct: { $avg: '$internalPct' },
      },
    },
  ]);

// M06 T4 (DSH-02, M5): internal marks across a term's credit offerings — a head of department's own department, or
// any for an admin. Ten offerings a page; the tiles count the whole selection (A-80).
export async function getCeReport(filter: { termId?: string; departmentId?: string }, page: number): Promise<CeReport> {
  const viewer = await requireViewer(['hod', 'admin']);
  const admin = viewer.roles.includes('admin');
  await db();
  const [terms, departments] = await Promise.all([
    Term.find({}, { code: 1, name: 1, status: 1 }).sort({ code: -1 }).limit(100).lean(),
    admin ? Department.find({}, { code: 1, name: 1 }).sort({ code: 1 }).limit(200).lean() : [],
  ]);
  const termId =
    terms.find((t) => String(t._id) === filter.termId)?._id ??
    terms.find((t) => t.status === 'current')?._id ??
    terms[0]?._id ??
    null;
  const departmentId = admin
    ? (departments.find((d) => String(d._id) === filter.departmentId)?._id ?? null)
    : viewer.departmentId
      ? new Types.ObjectId(viewer.departmentId)
      : null;
  const base = {
    admin,
    terms: terms.map((t) => ({ id: String(t._id), label: `${t.code} · ${t.name}` })),
    termId: termId ? String(termId) : null,
    departments: departments.map((d) => ({ id: String(d._id), label: `${d.code} · ${d.name}` })),
    departmentId: departmentId ? String(departmentId) : null,
  };
  // A head of department without a department oversees none.
  if (!termId || (!admin && !departmentId)) {
    return { ...base, totals: { offerings: 0, students: 0, averagePct: null, dropping: 0 }, rows: [], total: 0 };
  }
  const query: QueryFilter<OfferingDoc> = {
    termId,
    category: 'ugc',
    status: { $ne: 'draft' },
    ...(departmentId ? { departmentId } : {}),
  };
  // One term's credit offerings, the department's or the university's (index { departmentId, termId } / { termId, status }).
  const [ids, offerings] = await Promise.all([
    Offering.find(query, { _id: 1 })
      .lean()
      .then((rows) => rows.map((row) => row._id)),
    Offering.find(query, { title: 1, facultyIds: 1 })
      .sort({ title: 1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);
  const [all, perOffering, faculty] = await Promise.all([
    totalsBy(ids, false),
    totalsBy(
      offerings.map((o) => o._id),
      true,
    ),
    User.find({ _id: { $in: offerings.flatMap((o) => o.facultyIds) } }, { name: 1 }).lean(),
  ]);
  const nameOf = new Map(faculty.map((f) => [String(f._id), f.name]));
  const totalsOf = new Map(perOffering.map((t) => [String(t._id), t]));
  return {
    ...base,
    totals: {
      offerings: ids.length,
      students: all[0]?.students ?? 0,
      averagePct: all[0]?.averagePct ?? null,
      dropping: all[0]?.dropping ?? 0,
    },
    rows: offerings.map((o) => {
      const t = totalsOf.get(String(o._id));
      return {
        id: String(o._id),
        title: o.title,
        faculty: o.facultyIds.flatMap((f) => nameOf.get(String(f)) ?? []),
        students: t?.students ?? 0,
        averagePct: t?.averagePct ?? null,
        completePct: t && t.students > 0 ? (100 * t.complete) / t.students : null,
        dropping: t?.dropping ?? 0,
      };
    }),
    total: ids.length,
  };
}
