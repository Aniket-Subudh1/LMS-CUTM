import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { addEngagement, computeOfferingEngagement } from '@/lib/data/engagement';
import { explainStudentEngagement, getHomeEngagement, getStudentEngagement } from '@/lib/data/engagement-views';
import { db } from '@/lib/db';
import { engagementScore, engagementSignals } from '@/lib/domain/engagement';
import { istDayKey } from '@/lib/domain/time';
import { env } from '@/lib/env';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import { User } from '@/lib/models/user';
import { computeQueue } from '@/lib/queue';
import { ENGAGEMENT_BANDS, ENGAGEMENT_TRENDS } from '@/lib/schemas/engagement';
import { startComputeWorker } from '@/worker/jobs/compute';
import { enroll, makeAssessment, makeOffering, makeUser, newId, signInAs } from '../factories';

// M10 T8 (07 §7, AC-M10-01..03): one class with known records, worked out by hand below; the AI is replaced so the
// test sees exactly what it would be told.
const { explain } = vi.hoisted(() => ({
  explain: vi.fn(async (input: { metrics: Record<string, number>; band: string; trend: string }) =>
    input.band ? 'A short summary.' : null,
  ),
}));
vi.mock(import('@/lib/integrations/ai'), async (importOriginal) => ({
  ...(await importOriginal()),
  aiConfigured: () => true,
  explainEngagement: explain,
}));

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [
      Assessment,
      Attendance,
      EngagementDaily,
      Enrollment,
      Lesson,
      LessonProgress,
      LiveSession,
      Offering,
      Setting,
      Submission,
      User,
    ].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
  worker = startComputeWorker(env().REDIS_URL);
  queueEvents = new QueueEvents('compute', {
    connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }),
  });
  await queueEvents.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), queueEvents.close(), computeQueue().close()]);
});

// Three active students over the last few days:
// - steady: both live classes, the whole video, the assessment on time, 10 practice runs on 4 days;
// - patchy: one class of two, a quarter of the video, the assessment late, 5 runs on 2 days;
// - silent: nothing at all, so the class's P90s count their zeros.
async function world() {
  const now = new Date();
  const departmentId = newId();
  const faculty = await makeUser({ roles: ['faculty'], name: 'Ritu Faculty' });
  const hod = await makeUser({ roles: ['hod'], departmentId });
  const otherHod = await makeUser({ roles: ['hod'], departmentId: newId() });
  const [steady, patchy, silent] = await Promise.all(
    ['Asha Steady', 'Bikash Patchy', 'Chitra Silent'].map((name, i) =>
      makeUser({ roles: ['student'], name, rollNo: `ENG${String(departmentId).slice(-5)}${i}` }),
    ),
  );
  const offering = await makeOffering({
    departmentId,
    facultyIds: [faculty._id],
    title: `CUTM9999 · Engagement ${String(departmentId).slice(-4)}`,
  });
  const offeringId = String(offering._id);
  await Promise.all([steady, patchy, silent].map((s) => enroll(offering._id, s._id)));

  const sessions = await LiveSession.create(
    [2, 3].map((days) => ({
      offeringId: offering._id,
      kind: 'class' as const,
      title: `Class ${days} days ago`,
      scheduledStart: new Date(now.getTime() - days * DAY_MS),
      scheduledEnd: new Date(now.getTime() - days * DAY_MS + HOUR_MS),
      status: 'ended' as const,
      roomName: `room-${String(newId())}`,
      attendanceMode: 'manual' as const,
      createdBy: faculty._id,
    })),
  );
  await Attendance.create(
    sessions.flatMap((session, i) =>
      [
        { studentId: steady._id, status: 'present' as const },
        { studentId: patchy._id, status: i === 0 ? ('present' as const) : ('absent' as const) },
      ].map((row) => ({ ...row, sessionId: session._id, offeringId: offering._id, source: 'manual' as const })),
    ),
  );

  const video = await Lesson.create({
    offeringId: offering._id,
    moduleId: newId(),
    order: 1,
    kind: 'video',
    title: 'Pointers',
    durationSec: 600,
    published: true,
  });
  await LessonProgress.create([
    { lessonId: video._id, offeringId: offering._id, studentId: steady._id, watchedSec: 600, progressPct: 100 },
    { lessonId: video._id, offeringId: offering._id, studentId: patchy._id, watchedSec: 150, progressPct: 25 },
  ]);

  const closesAt = new Date(now.getTime() - DAY_MS);
  const quiz = await makeAssessment({
    offeringId: offering._id,
    opensAt: new Date(closesAt.getTime() - DAY_MS),
    closesAt,
  });
  await Submission.create(
    [
      { studentId: steady._id, submittedAt: new Date(closesAt.getTime() - HOUR_MS) },
      { studentId: patchy._id, submittedAt: new Date(closesAt.getTime() + HOUR_MS) },
    ].map((s) => ({
      ...s,
      assessmentId: quiz._id,
      offeringId: offering._id,
      attemptNo: 1,
      status: 'submitted' as const,
      startedAt: new Date(closesAt.getTime() - 2 * HOUR_MS),
      deadlineAt: closesAt,
    })),
  );

  const at = (days: number) => new Date(now.getTime() - days * DAY_MS);
  await addEngagement([
    ...[3, 3, 2, 2].map((quizAttempts, i) => ({
      offeringId,
      studentId: String(steady._id),
      at: at(i + 1),
      inc: { quizAttempts, videoSec: 150 },
    })),
    ...[3, 2].map((codeRuns, i) => ({
      offeringId,
      studentId: String(patchy._id),
      at: at(i + 1),
      inc: { codeRuns, liveSec: 1_800 },
    })),
  ]);
  return { now, offering, offeringId, faculty, hod, otherHod, steady, patchy, silent };
}

describe('computeOfferingEngagement', () => {
  it('works out each student’s signals, score, band and trend as 07 §7 does by hand', async () => {
    const w = await world();
    const result = await computeOfferingEngagement(w.offeringId, w.now);
    // P90 by nearest rank over [0, 5, 10] and [0, 2, 4].
    expect(result.classP90s).toEqual({ practice: 10, activity: 4 });
    const of = (id: { toString(): string }) => result.students.find((s) => s.studentId === String(id));

    expect(of(w.steady._id)).toMatchObject({
      raw: { classesAttended: 2, classesHeld: 2, closedOnTime: 1, closed: 1, practice: 10, activeDays: 4 },
      signals: { attendance: 1, video: 1, timeliness: 1, practice: 1, activity: 1 },
      score: 100,
      band: 'high',
      // The previous window has only the videos (counted since the course began): 100 then, 100 now.
      previousScore: 100,
      trend: 'steady',
    });
    // (30 × 0.5 + 20 × 0.25 + 25 × 0 + 15 × 0.5 + 10 × 0.5) / 100 = 32.5 → 33.
    expect(of(w.patchy._id)).toMatchObject({
      raw: { classesAttended: 1, classesHeld: 2, closedOnTime: 0, closed: 1, practice: 5, activeDays: 2 },
      signals: { attendance: 0.5, video: 0.25, timeliness: 0, practice: 0.5, activity: 0.5 },
      score: 33,
      band: 'low',
    });
    // No attendance row, so attendance does not apply and its weight is shared out over the rest: 0.
    expect(of(w.silent._id)).toMatchObject({
      signals: { attendance: null, video: 0, timeliness: 0, practice: 0, activity: 0 },
      score: 0,
      band: 'low',
    });
  });
});

describe('the nightly snapshot', () => {
  it('writes every active student’s snapshot once a day, and Home counts the low band from it', async () => {
    const w = await world();
    const nightly = async () => (await computeQueue().add('engagementNightly', {})).waitUntilFinished(queueEvents);
    await nightly();
    const jobId = `eng-${w.offeringId}-${istDayKey(new Date())}`;
    await (await computeQueue().getJob(jobId))?.waitUntilFinished(queueEvents);
    const done = (await computeQueue().getJob(jobId))?.finishedOn;
    expect(done).toBeTypeOf('number');
    const first = await Enrollment.find({ offeringId: w.offering._id }, { studentId: 1, engagement: 1 }).lean();
    expect(first).toHaveLength(3);
    const bandOf = (id: { toString(): string }) =>
      first.find((e) => String(e.studentId) === String(id))?.engagement?.band;
    expect([bandOf(w.steady._id), bandOf(w.patchy._id), bandOf(w.silent._id)]).toEqual(['high', 'low', 'low']);

    // A second nightly run the same day finds the day's job and adds nothing.
    await nightly();
    expect((await computeQueue().getJob(jobId))?.finishedOn).toBe(done);
    const second = await Enrollment.find({ offeringId: w.offering._id }, { engagement: 1 }).lean();
    expect(second.map((e) => e.engagement?.computedAt.getTime())).toEqual(
      first.map((e) => e.engagement?.computedAt.getTime()),
    );

    await signInAs(w.faculty);
    expect((await getHomeEngagement()).teaching).toContainEqual({
      id: w.offeringId,
      title: w.offering.title,
      students: 3,
      scored: 3,
      low: 2,
    });
    await signInAs(w.hod);
    expect((await getHomeEngagement()).department).toEqual([
      { id: w.offeringId, title: w.offering.title, students: 3, scored: 3, low: 2 },
    ]);
  });
});

describe('getStudentEngagement', () => {
  it('shows the records behind each signal, from which the score is worked out again', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const view = await getStudentEngagement(w.offeringId, String(w.patchy._id));
    expect(view.classes.map((c) => c.present)).toEqual([false, true]);
    expect(view.assessments).toHaveLength(1);
    expect(view.assessments[0].handedInAt?.getTime()).toBeGreaterThan(view.assessments[0].closesAt.getTime());
    expect(view.videos).toEqual([{ title: 'Pointers', durationSec: 600, watchedSec: 150 }]);
    expect(view.daily).toHaveLength(view.window.days);
    expect(view.daily.filter((d) => d.minutes === 30)).toHaveLength(2);
    // AC-M10-01: the shown numbers and the class's P90s give the shown score.
    const { settings } = await computeOfferingEngagement(w.offeringId, w.now);
    const live = view.live ?? { raw: null, classP90s: null, score: null };
    expect(live.raw && live.classP90s && engagementScore(engagementSignals(live.raw, live.classP90s), settings)).toBe(
      33,
    );
    expect(live.score).toBe(33);
  });

  it('is not found for a student, even about themselves, and for a head of another department', async () => {
    const w = await world();
    await signInAs(w.steady);
    await expect(getStudentEngagement(w.offeringId, String(w.steady._id))).rejects.toThrow(NOT_FOUND);
    await expect(getStudentEngagement(w.offeringId, String(w.patchy._id))).rejects.toThrow(NOT_FOUND);
    await signInAs(w.otherHod);
    await expect(getStudentEngagement(w.offeringId, String(w.patchy._id))).rejects.toThrow(NOT_FOUND);
    await signInAs(w.hod);
    expect((await getStudentEngagement(w.offeringId, String(w.patchy._id))).student.name).toBe('Bikash Patchy');
  });
});

describe('explainStudentEngagement', () => {
  it('tells the AI only numbers under plain labels, with the band and trend, and changes nothing', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const view = await getStudentEngagement(w.offeringId, String(w.patchy._id));
    expect(await explainStudentEngagement(view)).toEqual({ text: 'A short summary.' });
    const input = explain.mock.calls.at(-1)?.[0];
    expect(input).toBeDefined();
    expect(Object.values(input?.metrics ?? {}).every((v) => typeof v === 'number')).toBe(true);
    expect(input?.metrics).toMatchObject({
      'engagement score out of 100': 33,
      'live classes held': 2,
      'live classes attended': 1,
      'assessments handed in on time': 0,
    });
    expect(ENGAGEMENT_BANDS).toContain(input?.band);
    expect(ENGAGEMENT_TRENDS).toContain(input?.trend);
    const told = JSON.stringify(input);
    const patchy = await User.findById(w.patchy._id, { name: 1, email: 1, rollNo: 1 }).lean();
    for (const value of [patchy?.name, patchy?.email, patchy?.rollNo, w.offering.title, w.faculty.name]) {
      expect(value).toBeTruthy();
      expect(told).not.toContain(value);
    }
    expect(told).not.toContain(String(w.patchy._id));
    // The score the page shows is unchanged by asking.
    expect((await getStudentEngagement(w.offeringId, String(w.patchy._id))).live?.score).toBe(33);
  });
});
