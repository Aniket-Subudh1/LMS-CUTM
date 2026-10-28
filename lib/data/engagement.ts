import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import {
  engagementBand,
  engagementScore,
  engagementSignals,
  engagementTrend,
  engagementWindows,
  p90,
  type EngagementRaw,
  type EngagementSignals,
} from '@/lib/domain/engagement';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { LiveSession } from '@/lib/models/live-session';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import type { EngagementBand, EngagementTrend } from '@/lib/schemas/engagement';
import { SETTINGS, type SettingsValue } from '@/lib/schemas/settings';
import { MAX_ENROLLMENTS } from '@/lib/schemas/structure';

const KEEP_MS = 400 * 86_400_000;

type Counter =
  | 'videoSec'
  | 'liveSec'
  | 'focusedSec'
  | 'lessonsCompleted'
  | 'quizAttempts'
  | 'codeRuns'
  | 'submissions'
  | 'onTimeSubmissions';
export type EngagementRow = { offeringId: string; studentId: string; at: Date; inc: Partial<Record<Counter, number>> };

// 05 §7.1: per-day counters (IST day of `at`), only ever `$inc` upserts (04 §3 S9). The live-class finalize job and the
// assessment sweep write them as well as requests, and the engagement snapshot (M10) reads them in the worker, so this
// file imports nothing from next/* or the session.
export async function addEngagement(rows: readonly EngagementRow[], session?: ClientSession): Promise<void> {
  const ops: Parameters<typeof EngagementDaily.bulkWrite>[0] = [];
  for (const { offeringId, studentId, at, inc } of rows) {
    const counters = Object.fromEntries(Object.entries(inc).filter(([, n]) => n > 0));
    if (Object.keys(counters).length === 0) continue;
    const day = istDayKey(at);
    ops.push({
      updateOne: {
        filter: { offeringId, studentId, day },
        update: { $inc: counters, $setOnInsert: { expiresAt: new Date(istDateToDate(day).getTime() + KEEP_MS) } },
        upsert: true,
      },
    });
  }
  if (ops.length > 0) await EngagementDaily.bulkWrite(ops, { session, ordered: false });
}

type Config = SettingsValue<'engagement'>;

// The worker reads settings without Next's cache (02 §5); a stored value a tightened rule refuses counts as the
// defaults, as `saveSettings` treats it.
export async function engagementSettings(): Promise<Config> {
  const stored = await Setting.findById('engagement', { value: 1 }).lean();
  const parsed = SETTINGS.engagement.schema.safeParse(stored?.value ?? {});
  return parsed.success ? parsed.data : SETTINGS.engagement.schema.parse({});
}

export type StudentEngagement = {
  studentId: string;
  // The current window's numbers behind the signals (the drill-down shows them).
  raw: EngagementRaw;
  signals: EngagementSignals;
  score: number | null;
  band: EngagementBand | null;
  previousScore: number | null;
  trend: EngagementTrend;
};

export type OfferingEngagement = {
  settings: Config;
  window: { firstDay: string; lastDay: string };
  // Over every active student of the offering, zeros included (07 §7).
  classP90s: { practice: number; activity: number };
  students: StudentEngagement[];
};

type Window = { from: Date; to: Date; firstDay: string; lastDay: string };
const inWindow = (at: Date, w: Window) => at >= w.from && at < w.to;

// T2 (07 §7): every active student's signals, score, band and trend for the current and the previous window, from
// five index-backed reads of the offering. With `onlyStudentId` (the drill-down) the class's daily counters are still
// read whole, for the P90s, and the other reads are that student's.
export async function computeOfferingEngagement(
  offeringId: string,
  now: Date,
  onlyStudentId?: string,
): Promise<OfferingEngagement> {
  const settings = await engagementSettings();
  const { current, previous } = engagementWindows(now, settings.windowDays);
  const offering = new Types.ObjectId(offeringId);
  const enrolled = await Enrollment.find({ offeringId, status: 'active' }, { studentId: 1 })
    .limit(MAX_ENROLLMENTS)
    .lean();
  const allIds = enrolled.map((e) => String(e.studentId));
  const ids = onlyStudentId ? allIds.filter((id) => id === onlyStudentId) : allIds;
  const studentFilter = onlyStudentId ? { studentId: new Types.ObjectId(onlyStudentId) } : {};

  const [daily, sessions, videos, closed] = await Promise.all([
    // 1. Practice and active days per student and window (index { offeringId, day }).
    EngagementDaily.aggregate<{ _id: { s: Types.ObjectId; current: boolean }; practice: number; activeDays: number }>([
      { $match: { offeringId: offering, day: { $gte: previous.firstDay, $lte: current.lastDay } } },
      {
        $group: {
          _id: { s: '$studentId', current: { $gte: ['$day', current.firstDay] } },
          practice: { $sum: { $add: ['$quizAttempts', '$codeRuns'] } },
          activeDays: {
            $sum: {
              $cond: [
                {
                  $gt: [
                    {
                      $add: [
                        '$videoSec',
                        '$liveSec',
                        '$focusedSec',
                        '$lessonsCompleted',
                        '$quizAttempts',
                        '$codeRuns',
                        '$submissions',
                      ],
                    },
                    0,
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    // 2. The class's live classes in the two windows (index { offeringId, scheduledStart }).
    LiveSession.find(
      { offeringId, kind: 'class', scheduledStart: { $gte: previous.from, $lt: now } },
      { scheduledStart: 1 },
    ).lean(),
    // 3. Published video lessons with a length (index { offeringId, published }).
    Lesson.find({ offeringId, published: true, kind: 'video', durationSec: { $gt: 0 } }, { durationSec: 1 }).lean(),
    // 4. Assessments that closed in the two windows (index { offeringId, status, closesAt }).
    Assessment.find(
      {
        offeringId,
        status: { $in: ['published', 'results_published'] },
        closesAt: { $gte: previous.from, $lt: now },
      },
      { closesAt: 1 },
    ).lean(),
  ]);

  const [attendance, progress, firstHandIns] = await Promise.all([
    sessions.length === 0
      ? []
      : Attendance.find(
          { sessionId: { $in: sessions.map((s) => s._id) }, status: { $in: ['present', 'absent'] }, ...studentFilter },
          { sessionId: 1, studentId: 1, status: 1 },
        ).lean(),
    videos.length === 0
      ? []
      : LessonProgress.find(
          { offeringId, lessonId: { $in: videos.map((v) => v._id) }, ...studentFilter },
          { lessonId: 1, studentId: 1, watchedSec: 1 },
        ).lean(),
    closed.length === 0
      ? []
      : Submission.aggregate<{ _id: { a: Types.ObjectId; s: Types.ObjectId }; first: Date }>([
          {
            $match: { assessmentId: { $in: closed.map((a) => a._id) }, submittedAt: { $ne: null }, ...studentFilter },
          },
          { $group: { _id: { a: '$assessmentId', s: '$studentId' }, first: { $min: '$submittedAt' } } },
        ]),
  ]);

  const dailyOf = new Map(daily.map((d) => [`${String(d._id.s)}:${d._id.current}`, d]));
  const sessionAt = new Map(sessions.map((s) => [String(s._id), s.scheduledStart]));
  const attendanceOf = Map.groupBy(
    attendance.flatMap((a) => {
      const at = sessionAt.get(String(a.sessionId));
      return at ? [{ studentId: String(a.studentId), at, present: a.status === 'present' }] : [];
    }),
    (a) => a.studentId,
  );
  const watchedOf = new Map(progress.map((p) => [`${String(p.studentId)}:${String(p.lessonId)}`, p.watchedSec]));
  const firstOf = new Map(firstHandIns.map((h) => [`${String(h._id.a)}:${String(h._id.s)}`, h.first]));

  const rawOf = (studentId: string, w: Window, isCurrent: boolean): EngagementRaw => {
    const mine = (attendanceOf.get(studentId) ?? []).filter((a) => inWindow(a.at, w));
    const due = closed.filter((a) => inWindow(a.closesAt, w));
    const counters = dailyOf.get(`${studentId}:${isCurrent}`);
    return {
      classesAttended: mine.filter((a) => a.present).length,
      classesHeld: mine.length,
      // 07 §7: videos count since the course began, so both windows read them as they are now.
      videos: videos.map((v) => ({
        watchedSec: watchedOf.get(`${studentId}:${String(v._id)}`) ?? 0,
        durationSec: v.durationSec ?? 0,
      })),
      closedOnTime: due.filter((a) => {
        const first = firstOf.get(`${String(a._id)}:${studentId}`);
        return first !== undefined && first <= a.closesAt;
      }).length,
      closed: due.length,
      practice: counters?.practice ?? 0,
      activeDays: counters?.activeDays ?? 0,
    };
  };
  // The P90s are over the whole class, whoever is asked about.
  const p90sOf = (isCurrent: boolean) => ({
    practice: p90(allIds.map((id) => dailyOf.get(`${id}:${isCurrent}`)?.practice ?? 0)),
    activity: p90(allIds.map((id) => dailyOf.get(`${id}:${isCurrent}`)?.activeDays ?? 0)),
  });
  const classP90s = p90sOf(true);
  const previousP90s = p90sOf(false);

  return {
    settings,
    window: { firstDay: current.firstDay, lastDay: current.lastDay },
    classP90s,
    students: ids.map((studentId) => {
      const raw = rawOf(studentId, current, true);
      const signals = engagementSignals(raw, classP90s);
      const score = engagementScore(signals, settings);
      const previousScore = engagementScore(
        engagementSignals(rawOf(studentId, previous, false), previousP90s),
        settings,
      );
      return {
        studentId,
        raw,
        signals,
        score,
        band: engagementBand(score, settings),
        previousScore,
        trend: engagementTrend(score, previousScore, settings.trendDelta),
      };
    }),
  };
}

// T3: the nightly snapshot (06 §6 `compute/engagementSnapshot`): every active student's latest engagement on their
// enrolment, in one bulkWrite, so lists and reports read one document per student.
export async function snapshotEngagement(offeringId: string, now: Date): Promise<{ students: number }> {
  const { students } = await computeOfferingEngagement(offeringId, now);
  if (students.length > 0) {
    await Enrollment.bulkWrite(
      students.map((s) => ({
        updateOne: {
          filter: { offeringId, studentId: s.studentId },
          update: {
            $set: {
              engagement: {
                score: s.score,
                band: s.band,
                trend: s.trend,
                signals: s.signals,
                computedAt: now,
              },
            },
          },
        },
      })),
      { ordered: false },
    );
  }
  return { students: students.length };
}
