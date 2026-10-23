import 'server-only';
import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { countedScore } from '@/lib/domain/attempts';
import { computeInternalMarks, reviewAverages, type RubricCriteria } from '@/lib/domain/evaluation';
import { computeTrend } from '@/lib/domain/trend';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { InternalMark } from '@/lib/models/internal-mark';
import { Offering } from '@/lib/models/offering';
import { ProjectReview } from '@/lib/models/project-review';
import { RubricMark } from '@/lib/models/rubric-mark';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import { ASSESSMENT_LIMITS, type AttemptPolicy, type CountsToward } from '@/lib/schemas/assessment';
import { PROJECT_LIMITS } from '@/lib/schemas/projects';
import { SETTINGS, type SettingsKey, type SettingsValue } from '@/lib/schemas/settings';
import { MAX_ENROLLMENTS } from '@/lib/schemas/structure';

// The worker reads settings without Next's cache (02 §5 covers the web process only).
const stored = async (key: SettingsKey) => (await Setting.findById(key, { value: 1 }).lean())?.value ?? {};

// The offering's own copy of the evaluation policy decides (05 §3.8); one made before it had the field uses today's.
export async function policyOf(evaluation: unknown): Promise<SettingsValue<'evaluation'>> {
  const copy = SETTINGS.evaluation.schema.safeParse(evaluation);
  return copy.success ? copy.data : SETTINGS.evaluation.schema.parse(await stored('evaluation'));
}

// Each active student's finalized live classes in an offering (A-72), by student id.
export async function classesOf(offeringId: string): Promise<Map<string, { attended: number; held: number }>> {
  const rows = await Attendance.aggregate<{ _id: Types.ObjectId; attended: number; held: number }>([
    { $match: { offeringId: new Types.ObjectId(offeringId), status: { $in: ['present', 'absent'] } } },
    {
      $group: {
        _id: '$studentId',
        attended: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        held: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

type Published = {
  _id: Types.ObjectId;
  maxMarks: number;
  attemptPolicy: AttemptPolicy;
  countsToward?: CountsToward | null;
};

// Each student's graded attempts at the given assessments, by `<assessmentId>:<studentId>`, for `countedScore`.
export async function gradedAttempts(
  assessments: readonly Published[],
  studentIds: readonly Types.ObjectId[],
): Promise<Map<string, { attemptNo: number; status: string; total: number | null }[]>> {
  if (assessments.length === 0 || studentIds.length === 0) return new Map();
  const groups = await Submission.aggregate<{
    _id: { a: Types.ObjectId; s: Types.ObjectId };
    attempts: { attemptNo: number; status: string; total: number | null }[];
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
        attempts: { $push: { attemptNo: '$attemptNo', status: '$status', total: '$total' } },
      },
    },
  ]);
  return new Map(groups.map((g) => [`${String(g._id.a)}:${String(g._id.s)}`, g.attempts]));
}

// T2 (07 §2–3): every active student's internal marks in a credit offering, worked out again from the published
// results, the finalized classes and the rubrics, and written whole. Safe to run in the worker and to run twice.
export async function recomputeInternalMarks(
  offeringId: string,
  now: Date,
): Promise<{ skipped: 'missing' | 'skill' | 'locked' } | { students: number }> {
  await db();
  const offering = await Offering.findById(offeringId, { category: 1, credits: 1, evaluation: 1, lockedAt: 1 }).lean();
  if (!offering) return { skipped: 'missing' };
  if (offering.category === 'skill') return { skipped: 'skill' };
  // 05 §3.8: nothing moves while marks are locked.
  if (offering.lockedAt) return { skipped: 'locked' };
  const [policy, trendSettings, assessments, enrolments, practiceRows, reviews, classes] = await Promise.all([
    policyOf(offering.evaluation),
    stored('ceTrend').then((value) => SETTINGS.ceTrend.schema.parse(value)),
    Assessment.find(
      { offeringId, status: 'results_published' },
      { maxMarks: 1, attemptPolicy: 1, countsToward: 1, closesAt: 1 },
    )
      .sort({ closesAt: 1, _id: 1 })
      .limit(ASSESSMENT_LIMITS.perOffering)
      .lean(),
    Enrollment.find({ offeringId, status: 'active' }, { studentId: 1 }).limit(MAX_ENROLLMENTS).lean(),
    // M07 decision 2: only the practice rubric is typed; the project internal comes from the project reviews.
    RubricMark.find({ offeringId, component: 'practice' }, { studentId: 1, criteria: 1 }).limit(MAX_ENROLLMENTS).lean(),
    ProjectReview.find({ offeringId }, { marks: 1 })
      .limit(PROJECT_LIMITS.perOffering * PROJECT_LIMITS.reviews)
      .lean(),
    classesOf(offeringId),
  ]);
  const studentIds = enrolments.map((e) => e.studentId);
  const attempts = await gradedAttempts(assessments, studentIds);
  const practiceOf = new Map(practiceRows.map((row) => [String(row.studentId), row.criteria]));
  const reviewsOf = new Map<string, RubricCriteria[]>();
  for (const review of reviews) {
    for (const mark of review.marks) {
      const key = String(mark.studentId);
      reviewsOf.set(key, [...(reviewsOf.get(key) ?? []), mark.criteria ?? {}]);
    }
  }
  const writes = studentIds.map((studentId) => {
    const key = String(studentId);
    const scores = assessments.map((a) => ({
      assessment: a,
      counted: countedScore(attempts.get(`${String(a._id)}:${key}`) ?? [], a.attemptPolicy),
    }));
    const marks = computeInternalMarks({
      credits: offering.credits,
      policy,
      counted: scores.flatMap(({ assessment, counted }) =>
        assessment.countsToward ? [{ part: assessment.countsToward, counted, maxMarks: assessment.maxMarks }] : [],
      ),
      attendance: classes.get(key) ?? { attended: 0, held: 0 },
      rubrics: { practice: practiceOf.get(key) ?? {}, project: reviewAverages(reviewsOf.get(key) ?? []) },
    });
    // Every published assessment, counted toward a part or not, oldest first (07 §3).
    const points = scores.map(({ assessment, counted }) => (100 * counted) / assessment.maxMarks);
    const { trend, slope } = computeTrend(points, trendSettings);
    return {
      updateOne: {
        filter: { offeringId: offering._id, studentId },
        update: {
          $set: { ...marks, trend, slope, points: points.slice(-trendSettings.window), computedAt: now },
        },
        upsert: true,
      },
    };
  });
  if (writes.length > 0) await InternalMark.bulkWrite(writes, { ordered: false });
  await InternalMark.deleteMany({ offeringId: offering._id, studentId: { $nin: studentIds } });
  return { students: writes.length };
}
