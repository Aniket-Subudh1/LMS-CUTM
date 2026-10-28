import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId, Types } from 'mongoose';
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
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { InternalMark } from '@/lib/models/internal-mark';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { Project } from '@/lib/models/project';
import { Submission } from '@/lib/models/submission';
import { User } from '@/lib/models/user';
import { limit } from '@/lib/rate-limit';
import type { EngagementSignal } from '@/lib/schemas/engagement';
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
