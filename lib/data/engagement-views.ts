import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import { offeringAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  computeOfferingEngagement,
  readSnapshot,
  type EngagementSnapshot,
  type StudentEngagement,
} from '@/lib/data/engagement';
import { engagementWindows, signalWeights } from '@/lib/domain/engagement';
import { roundHalfUp } from '@/lib/domain/round';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { aiConfigured, explainEngagement } from '@/lib/integrations/ai';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { Department } from '@/lib/models/department';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { InternalMark } from '@/lib/models/internal-mark';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { LiveSession } from '@/lib/models/live-session';
import { Offering, type OfferingDoc } from '@/lib/models/offering';
import { Project } from '@/lib/models/project';
import { Submission } from '@/lib/models/submission';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { limit } from '@/lib/rate-limit';
import { ASSESSMENT_LIMITS } from '@/lib/schemas/assessment';
import { pageSize } from '@/lib/schemas/common';
import type { EngagementBand, EngagementSignal } from '@/lib/schemas/engagement';
import type { Trend } from '@/lib/schemas/marks';

const DAY_MS = 86_400_000;

export type StudentEngagementView = {
  student: { id: string; name: string; rollNo: string; email: string; status: 'active' | 'dropped' };
  category: 'ugc' | 'skill';
  window: { firstDay: string; lastDay: string; days: number };
  // Worked out now from the records (AC-M10-01); null for a dropped student, who is not counted.
  live: (StudentEngagement & { classP90s: { practice: number; activity: number } }) | null;
  snapshot: EngagementSnapshot | null;
  weights: Record<EngagementSignal, number>;
  // Active minutes ((videoSec + liveSec) / 60) on every day of the window, oldest first.
  daily: { day: string; minutes: number }[];
  classes: { title: string; at: Date; present: boolean }[];
  assessments: { title: string; closesAt: Date; handedInAt: Date | null }[];
  videos: { title: string; durationSec: number; watchedSec: number }[];
  marks: { internalPct: number | null; complete: boolean; trend: Trend; points: number[] } | null;
  project: { id: string; title: string; dueOn: Date; status: string } | null;
  aiReady: boolean;
};

// T5 (ENG-02): one student's engagement for whoever teaches or oversees the class, with the records behind each
// signal. A student never opens it (09 §2: engagement is not shown to students), nor anyone outside the class.
export async function getStudentEngagement(offeringId: string, studentId: string): Promise<StudentEngagementView> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) === 'learn' || !isValidObjectId(studentId)) notFound();
  await db();
  const [offering, enrolment, user] = await Promise.all([
    Offering.findById(offeringId, { category: 1 }).lean(),
    Enrollment.findOne({ offeringId, studentId }, { status: 1, engagement: 1 }).lean(),
    User.findById(studentId, { name: 1, rollNo: 1, email: 1 }).lean(),
  ]);
  if (!offering || !enrolment || !user) notFound();
  const now = new Date();
  const computed = await computeOfferingEngagement(offeringId, now, studentId);
  const { settings } = computed;
  const { current } = engagementWindows(now, settings.windowDays);
  const mine = { offeringId, studentId };
  const [days, sessions, closed, lessons, progress, mark, project] = await Promise.all([
    EngagementDaily.find(
      { ...mine, day: { $gte: current.firstDay, $lte: current.lastDay } },
      { day: 1, videoSec: 1, liveSec: 1 },
    ).lean(),
    LiveSession.find(
      { offeringId, kind: 'class', scheduledStart: { $gte: current.from, $lt: now } },
      { title: 1, scheduledStart: 1 },
    )
      .sort({ scheduledStart: 1 })
      .lean(),
    Assessment.find(
      {
        offeringId,
        status: { $in: ['published', 'results_published'] },
        closesAt: { $gte: current.from, $lt: now },
      },
      { title: 1, closesAt: 1 },
    )
      .sort({ closesAt: 1 })
      .lean(),
    Lesson.find({ offeringId, published: true, kind: 'video', durationSec: { $gt: 0 } }, { title: 1, durationSec: 1 })
      .sort({ moduleId: 1, order: 1 })
      .lean(),
    LessonProgress.find(mine, { lessonId: 1, watchedSec: 1 }).lean(),
    offering.category === 'ugc'
      ? InternalMark.findOne(mine, { internalPct: 1, complete: 1, trend: 1, points: 1 }).lean()
      : null,
    Project.findOne({ offeringId, memberIds: studentId }, { title: 1, dueOn: 1, status: 1 }).lean(),
  ]);
  const [marked, handIns] = await Promise.all([
    sessions.length === 0
      ? []
      : Attendance.find(
          { sessionId: { $in: sessions.map((s) => s._id) }, studentId, status: { $in: ['present', 'absent'] } },
          { sessionId: 1, status: 1 },
        ).lean(),
    closed.length === 0
      ? []
      : Submission.aggregate<{ _id: Types.ObjectId; first: Date }>([
          {
            $match: {
              assessmentId: { $in: closed.map((a) => a._id) },
              studentId: new Types.ObjectId(studentId),
              submittedAt: { $ne: null },
            },
          },
          { $group: { _id: '$assessmentId', first: { $min: '$submittedAt' } } },
        ]),
  ]);
  const minutesOf = new Map(days.map((d) => [d.day, (d.videoSec + d.liveSec) / 60]));
  const statusOf = new Map(marked.map((a) => [String(a.sessionId), a.status]));
  const firstOf = new Map(handIns.map((h) => [String(h._id), h.first]));
  const watchedOf = new Map(progress.map((p) => [String(p.lessonId), p.watchedSec]));
  const live = computed.students[0];
  return {
    student: {
      id: studentId,
      name: user.name,
      rollNo: user.rollNo ?? '—',
      email: user.email,
      status: enrolment.status,
    },
    category: offering.category,
    window: { firstDay: current.firstDay, lastDay: current.lastDay, days: settings.windowDays },
    live: live ? { ...live, classP90s: computed.classP90s } : null,
    snapshot: readSnapshot(enrolment.engagement),
    weights: signalWeights(settings),
    daily: Array.from({ length: settings.windowDays }, (_, i) => {
      const day = istDayKey(new Date(istDateToDate(current.firstDay).getTime() + i * DAY_MS));
      return { day, minutes: roundHalfUp(minutesOf.get(day) ?? 0, 0) };
    }),
    classes: sessions.flatMap((s) => {
      const status = statusOf.get(String(s._id));
      return status ? [{ title: s.title, at: s.scheduledStart, present: status === 'present' }] : [];
    }),
    assessments: closed.map((a) => ({
      title: a.title,
      closesAt: a.closesAt,
      handedInAt: firstOf.get(String(a._id)) ?? null,
    })),
    videos: lessons.map((l) => ({
      title: l.title,
      durationSec: l.durationSec ?? 0,
      watchedSec: Math.min(watchedOf.get(String(l._id)) ?? 0, l.durationSec ?? 0),
    })),
    marks: mark
      ? { internalPct: mark.internalPct ?? null, complete: mark.complete, trend: mark.trend, points: mark.points }
      : null,
    project: project
      ? { id: String(project._id), title: project.title, dueOn: project.dueOn, status: project.status }
      : null,
    aiReady: aiConfigured(),
  };
}

export type EngagementReport = {
  admin: boolean;
  terms: { id: string; label: string }[];
  termId: string | null;
  departments: { id: string; label: string }[];
  departmentId: string | null;
  category: 'ugc' | 'skill' | null;
  totals: { offerings: number; students: number; averageScore: number | null; low: number; falling: number };
  rows: {
    id: string;
    title: string;
    category: 'ugc' | 'skill';
    faculty: string[];
    students: number;
    averageScore: number | null;
    bands: Record<EngagementBand, number>;
    falling: number;
    // Skill offerings (DSH-05): the share of published lessons completed, which is also their attendance (SKL-04), and
    // the quizzes each student attempted, on average.
    skill: { completedPct: number | null; quizzesAttempted: number | null } | null;
  }[];
  total: number;
};

type BandTotals = {
  _id: Types.ObjectId | null;
  students: number;
  averageScore: number | null;
  high: number;
  medium: number;
  low: number;
  falling: number;
};
const countWhen = (field: string, value: string) => ({ $sum: { $cond: [{ $eq: [field, value] }, 1, 0] } });
const bandTotals = (offeringIds: Types.ObjectId[], perOffering: boolean) =>
  Enrollment.aggregate<BandTotals>([
    { $match: { offeringId: { $in: offeringIds }, status: 'active' } },
    {
      $group: {
        _id: perOffering ? '$offeringId' : null,
        students: { $sum: 1 },
        averageScore: { $avg: '$engagement.score' },
        high: countWhen('$engagement.band', 'high'),
        medium: countWhen('$engagement.band', 'medium'),
        low: countWhen('$engagement.band', 'low'),
        falling: countWhen('$engagement.trend', 'falling'),
      },
    },
  ]);

// T6 (DSH-01, DSH-05): the nightly snapshot across a term's offerings — a head of department's own department, any
// for an admin — optionally credit or skill only. Ten offerings a page; the tiles count the whole selection. A skill
// page adds lesson completion and quizzes attempted, from two more reads of the page's offerings.
export async function getEngagementReport(
  filter: { termId?: string; departmentId?: string; category?: 'ugc' | 'skill' },
  page: number,
): Promise<EngagementReport> {
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
  const category = filter.category ?? null;
  const base = {
    admin,
    terms: terms.map((t) => ({ id: String(t._id), label: `${t.code} · ${t.name}` })),
    termId: termId ? String(termId) : null,
    departments: departments.map((d) => ({ id: String(d._id), label: `${d.code} · ${d.name}` })),
    departmentId: departmentId ? String(departmentId) : null,
    category,
  };
  if (!termId || (!admin && !departmentId)) {
    return {
      ...base,
      totals: { offerings: 0, students: 0, averageScore: null, low: 0, falling: 0 },
      rows: [],
      total: 0,
    };
  }
  const query: QueryFilter<OfferingDoc> = {
    termId,
    status: { $ne: 'draft' },
    ...(category ? { category } : {}),
    ...(departmentId ? { departmentId } : {}),
  };
  const [ids, offerings] = await Promise.all([
    Offering.find(query, { _id: 1 })
      .lean()
      .then((rows) => rows.map((row) => row._id)),
    Offering.find(query, { title: 1, category: 1, facultyIds: 1 })
      .sort({ title: 1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);
  const pageIds = offerings.map((o) => o._id);
  const skillIds = offerings.filter((o) => o.category === 'skill').map((o) => o._id);
  const [all, perOffering, faculty, published, quizzes, active] = await Promise.all([
    bandTotals(ids, false),
    bandTotals(pageIds, true),
    User.find({ _id: { $in: offerings.flatMap((o) => o.facultyIds) } }, { name: 1 }).lean(),
    skillIds.length === 0
      ? []
      : Lesson.find({ offeringId: { $in: skillIds }, published: true }, { offeringId: 1 }).lean(),
    skillIds.length === 0
      ? []
      : Assessment.find({ offeringId: { $in: skillIds }, mode: 'quiz', status: { $ne: 'draft' } }, { offeringId: 1 })
          .limit(skillIds.length * ASSESSMENT_LIMITS.perOffering)
          .lean(),
    skillIds.length === 0 ? [] : Enrollment.distinct('studentId', { offeringId: { $in: skillIds }, status: 'active' }),
  ]);
  // Only active students count, as in the averages' denominators.
  const [completed, attempted] = await Promise.all([
    published.length === 0
      ? []
      : LessonProgress.aggregate<{ _id: Types.ObjectId; n: number }>([
          {
            $match: {
              lessonId: { $in: published.map((l) => l._id) },
              studentId: { $in: active },
              completedAt: { $ne: null },
            },
          },
          { $group: { _id: '$offeringId', n: { $sum: 1 } } },
        ]),
    quizzes.length === 0
      ? []
      : Submission.aggregate<{ _id: Types.ObjectId; n: number }>([
          { $match: { assessmentId: { $in: quizzes.map((q) => q._id) }, studentId: { $in: active } } },
          { $group: { _id: { o: '$offeringId', a: '$assessmentId', s: '$studentId' } } },
          { $group: { _id: '$_id.o', n: { $sum: 1 } } },
        ]),
  ]);
  const nameOf = new Map(faculty.map((f) => [String(f._id), f.name]));
  const totalsOf = new Map(perOffering.map((t) => [String(t._id), t]));
  const lessonsOf = Map.groupBy(published, (l) => String(l.offeringId));
  const completedOf = new Map(completed.map((c) => [String(c._id), c.n]));
  const attemptedOf = new Map(attempted.map((a) => [String(a._id), a.n]));
  return {
    ...base,
    totals: {
      offerings: ids.length,
      students: all[0]?.students ?? 0,
      averageScore: all[0]?.averageScore ?? null,
      low: all[0]?.low ?? 0,
      falling: all[0]?.falling ?? 0,
    },
    rows: offerings.map((o) => {
      const id = String(o._id);
      const t = totalsOf.get(id);
      const students = t?.students ?? 0;
      const lessons = lessonsOf.get(id)?.length ?? 0;
      return {
        id,
        title: o.title,
        category: o.category,
        faculty: o.facultyIds.flatMap((f) => nameOf.get(String(f)) ?? []),
        students,
        averageScore: t?.averageScore ?? null,
        bands: { high: t?.high ?? 0, medium: t?.medium ?? 0, low: t?.low ?? 0 },
        falling: t?.falling ?? 0,
        skill:
          o.category === 'skill'
            ? {
                completedPct:
                  lessons > 0 && students > 0 ? (100 * (completedOf.get(id) ?? 0)) / (lessons * students) : null,
                quizzesAttempted: students > 0 ? (attemptedOf.get(id) ?? 0) / students : null,
              }
            : null,
      };
    }),
    total: ids.length,
  };
}

// The numbers the AI is told (06 §4.7, 09 §12): counts, percentages and the class's P90s, under plain labels. No name,
// roll number, email or course is in it.
export function engagementMetrics(view: StudentEngagementView): Record<string, number> {
  const live = view.live;
  if (!live) return {};
  const { raw, signals } = live;
  const pct = (value: number | null) => (value === null ? [] : [roundHalfUp(100 * value, 0)]);
  const videoSec = raw.videos.reduce((sum, v) => sum + v.durationSec, 0);
  return Object.fromEntries(
    [
      ['days looked at', [view.window.days]],
      ['engagement score out of 100', live.score === null ? [] : [live.score]],
      ['score in the previous period', live.previousScore === null ? [] : [live.previousScore]],
      ['live classes held', [raw.classesHeld]],
      ['live classes attended', [raw.classesAttended]],
      ['video minutes published', [roundHalfUp(videoSec / 60, 0)]],
      ['videos watched %', pct(signals.video)],
      ['assessments that closed', [raw.closed]],
      ['assessments handed in on time', [raw.closedOnTime]],
      ['quiz attempts and code runs', [raw.practice]],
      ['quiz attempts and code runs of the most active 10% of the class', [live.classP90s.practice]],
      ['days with any study', [raw.activeDays]],
      ['days with any study of the most active 10% of the class', [live.classP90s.activity]],
    ].flatMap(([label, value]) => (value.length === 0 ? [] : [[label, value[0]]])),
  );
}

// "Explain with AI" (T5, ADR-16): a summary of the numbers above, which it never changes. The page shows the text or
// says why there is none.
export async function explainStudentEngagement(
  view: StudentEngagementView,
): Promise<{ text: string } | { text: null; reason: string }> {
  const viewer = await requireViewer();
  if (!view.live?.band) return { text: null, reason: 'There is no score to explain yet.' };
  try {
    await limit('ai', viewer.id, 30, 60 * 60_000);
    const text = await explainEngagement({
      metrics: engagementMetrics(view),
      band: view.live.band,
      trend: view.live.trend,
    });
    return text ? { text } : { text: null, reason: 'No summary available right now.' };
  } catch (error) {
    if (error instanceof AppError) return { text: null, reason: error.message };
    throw error;
  }
}
