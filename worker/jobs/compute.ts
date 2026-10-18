import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { handInAttempts } from '@/lib/data/attempts';
import { addEngagement, type EngagementRow } from '@/lib/data/engagement';
import { notify } from '@/lib/data/notify';
import { deriveAttendance } from '@/lib/domain/attendance';
import { assessmentPath } from '@/lib/domain/test-links';
import { closeRoom, muteMicrophone, roomPeople, setRights, tell } from '@/lib/integrations/live';
import { deleteObjects } from '@/lib/integrations/storage';
import { formatDateTime } from '@/lib/format';
import { log } from '@/lib/log';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import { TestGrant } from '@/lib/models/test-grant';
import { queueLiveFinalize } from '@/lib/queue';
import {
  AssessmentSweepJob,
  FinalizeLiveJob,
  LiveControlJob,
  LiveSweepJob,
  ProctorRetentionJob,
} from '@/lib/schemas/jobs';
import { ALL_RIGHTS } from '@/lib/schemas/live';
import { SETTINGS } from '@/lib/schemas/settings';

type ComputeName = 'finalizeLiveSession' | 'liveSweep' | 'liveControl' | 'assessmentSweep' | 'proctorRetention';
type ComputeData = FinalizeLiveJob | LiveSweepJob | LiveControlJob | AssessmentSweepJob | ProctorRetentionJob;
type Ops = Parameters<typeof Attendance.bulkWrite>[0];

const MINUTE_MS = 60_000;

// 07 §10 (ATT-03, LIV-04). The claim and every write commit together: a crash rolls the claim back so the retry
// redoes the work, and a second run finds nothing to claim.
async function finalizeLiveSession({ sessionId }: FinalizeLiveJob): Promise<void> {
  // getSettings is cached for the web process; the worker reads the key itself.
  const stored = await Setting.findById('attendance', { value: 1 }).lean();
  const { liveThresholdPct } = SETTINGS.attendance.schema.parse(stored?.value ?? {});
  const students = await mongoose.connection.transaction(async (session) => {
    const live = await LiveSession.findOneAndUpdate(
      { _id: sessionId, status: 'ended', finalizedAt: null },
      { $set: { finalizedAt: new Date() } },
      { session, projection: { offeringId: 1, startedAt: 1, endedAt: 1, attendanceMode: 1 } },
    ).lean();
    // Already finalized, or a class that never started: no attendance.
    if (!live?.startedAt || !live.endedAt) return 0;
    const { startedAt, endedAt, offeringId, attendanceMode } = live;
    const [enrolled, rows] = await Promise.all([
      Enrollment.distinct('studentId', { offeringId, status: 'active' }).session(session),
      Attendance.find({ sessionId }, { studentId: 1, presence: 1 }).session(session).lean(),
    ]);
    const presence = new Map(
      rows.map((row) => [
        String(row.studentId),
        row.presence.map(({ joinedAt, leftAt }) => ({ joinedAt, leftAt: leftAt ?? null })),
      ]),
    );
    const ops: Ops = [];
    const engagement: EngagementRow[] = [];
    for (const studentId of enrolled) {
      const key = { sessionId, studentId };
      const derived = deriveAttendance(presence.get(String(studentId)) ?? [], startedAt, endedAt, liveThresholdPct);
      ops.push({
        updateOne: {
          filter: key,
          update: {
            $set: { presenceSec: derived.presenceSec },
            $setOnInsert: { offeringId, source: 'derived', presence: [], focusedSec: 0 },
          },
          upsert: true,
        },
      });
      // AC-M03-03: a teacher's mark is never overwritten. In a manual class only unmarked students get a status.
      ops.push({
        updateOne:
          attendanceMode === 'derived'
            ? { filter: { ...key, source: { $ne: 'manual' } }, update: { $set: { status: derived.status } } }
            : { filter: { ...key, status: { $exists: false } }, update: { $set: { status: 'absent' } } },
      });
      engagement.push({
        offeringId: String(offeringId),
        studentId: String(studentId),
        at: startedAt,
        inc: { liveSec: derived.presenceSec },
      });
    }
    // Ordered, so each student's row exists before its status is set.
    if (ops.length > 0) await Attendance.bulkWrite(ops, { session });
    await addEngagement(engagement, session);
    return enrolled.length;
  });
  log.info('live session finalized', { sessionId, students });
}

// The hourly scheduler `liveSweep` (02 §8): classes nobody ended, and ended classes whose finalize never ran.
async function liveSweep(now: Date): Promise<void> {
  const overdue = await LiveSession.find(
    { status: 'live', scheduledEnd: { $lt: new Date(now.getTime() - 30 * MINUTE_MS) } },
    { roomName: 1, scheduledEnd: 1 },
  )
    .limit(100)
    .lean();
  for (const { _id, roomName, scheduledEnd } of overdue) {
    await closeRoom(roomName);
    await LiveSession.updateOne({ _id, status: 'live' }, { $set: { status: 'ended', endedAt: scheduledEnd } });
  }
  const unfinalized = await LiveSession.find(
    { status: 'ended', finalizedAt: null, endedAt: { $lt: new Date(now.getTime() - 10 * MINUTE_MS) } },
    { _id: 1 },
  )
    .limit(100)
    .lean();
  for (const { _id } of [...overdue, ...unfinalized]) await queueLiveFinalize(String(_id));
  log.info('live sweep', { ended: overdue.length, finalizing: unfinalized.length });
}

// M03c T2: once the class has ended there is no room to change.
async function liveControl(job: LiveControlJob): Promise<void> {
  const live = await LiveSession.findOne(
    { _id: job.sessionId, status: 'live' },
    { roomName: 1, studentsMay: 1 },
  ).lean();
  if (!live) return;
  const people = await roomPeople(live.roomName);
  if (job.op === 'rights') {
    const rights = { ...ALL_RIGHTS, ...live.studentsMay };
    await Promise.all(people.filter((p) => !p.host).map((p) => setRights(live.roomName, p.identity, rights)));
    return;
  }
  const others = people.filter((p) => p.identity !== job.byId);
  await Promise.all(others.map((p) => muteMicrophone(live.roomName, p.identity, p.microphones)));
  if (others.length > 0) {
    await tell(
      live.roomName,
      'notice',
      `${job.byName} muted everyone`,
      others.map((p) => p.identity),
    );
  }
}

// The hourly scheduler `assessmentSweep` (02 §8, M04 T8): the 24-hour reminder (COM-03) to students who have not
// handed in (for a standalone test, those its links let in, M04b), claimed once per assessment by `dueNotifiedAt`; then every attempt whose deadline passed more than five
// minutes ago (a closed tab) is handed in, in batches, through the same path as the student's Submit.
async function assessmentSweep(now: Date): Promise<void> {
  const due = await Assessment.find(
    {
      status: 'published',
      closesAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 60 * MINUTE_MS) },
      dueNotifiedAt: null,
    },
    { offeringId: 1, title: 1, closesAt: 1 },
  )
    .limit(100)
    .lean();
  let reminded = 0;
  for (const assessment of due) {
    const claimed = await Assessment.updateOne(
      { _id: assessment._id, dueNotifiedAt: null },
      { $set: { dueNotifiedAt: now } },
    );
    if (claimed.modifiedCount === 0) continue;
    const offeringId = assessment.offeringId ? String(assessment.offeringId) : null;
    const [takers, handedIn, offering] = await Promise.all([
      offeringId
        ? Enrollment.distinct('studentId', { offeringId, status: 'active' })
        : TestGrant.distinct('userId', { assessmentId: assessment._id }),
      Submission.distinct('studentId', { assessmentId: assessment._id, status: { $in: ['submitted', 'graded'] } }),
      offeringId ? Offering.findById(offeringId, { title: 1 }).lean() : null,
    ]);
    const done = new Set(handedIn.map(String));
    const title = `Due ${formatDateTime(assessment.closesAt)}: ${assessment.title}${offering ? ` (${offering.title})` : ''}`;
    await notify(
      takers.map(String).filter((id) => !done.has(id)),
      {
        kind: 'assessment.dueSoon',
        title: title.length > 160 ? `${title.slice(0, 159)}…` : title,
        href: assessmentPath(offeringId, String(assessment._id)),
      },
    );
    reminded++;
  }
  let handedIn = 0;
  for (let batch = 0; batch < 20; batch++) {
    const expired = await Submission.find(
      { status: 'in_progress', deadlineAt: { $lt: new Date(now.getTime() - 5 * MINUTE_MS) } },
      { _id: 1 },
    )
      .limit(500)
      .lean();
    if (expired.length === 0) break;
    handedIn += await handInAttempts(
      expired.map((s) => String(s._id)),
      now,
    );
    if (expired.length < 500) break;
  }
  log.info('assessment sweep', { reminded, handedIn });
}

// The daily scheduler `proctorRetention` (05 §8, M04b TP-08): the camera snapshots of tests whose results went out
// more than `snapshotRetentionDays` ago are deleted from storage, then from their attempts, and the test is marked
// done. Storage goes first, so a crash between the two only repeats a deletion.
async function proctorRetention(now: Date): Promise<void> {
  const stored = await Setting.findById('proctoring', { value: 1 }).lean();
  const { snapshotRetentionDays } = SETTINGS.proctoring.schema.parse(stored?.value ?? {});
  const tests = await Assessment.find(
    {
      'proctoring.camera': true,
      snapshotsDeletedAt: null,
      resultsPublishedAt: { $lt: new Date(now.getTime() - snapshotRetentionDays * 24 * 60 * MINUTE_MS) },
    },
    { _id: 1 },
  )
    .limit(50)
    .lean();
  let deleted = 0;
  for (const test of tests) {
    // At most PROCTOR_LIMITS.snapshots keys per attempt, so a batch of 100 attempts is at most 24,000 keys.
    for (let batch = 0; batch < 1000; batch++) {
      const attempts = await Submission.find(
        { assessmentId: test._id, 'proctor.snapshots.0': { $exists: true } },
        { proctor: 1 },
      )
        .limit(100)
        .lean();
      if (attempts.length === 0) break;
      const keys = attempts.flatMap((attempt) => attempt.proctor?.snapshots.map((snapshot) => snapshot.key) ?? []);
      await deleteObjects(keys);
      await Submission.updateMany(
        { _id: { $in: attempts.map((attempt) => attempt._id) } },
        { $set: { 'proctor.snapshots': [] } },
      );
      deleted += keys.length;
    }
    await Assessment.updateOne({ _id: test._id }, { $set: { snapshotsDeletedAt: now } });
  }
  log.info('proctor retention', { tests: tests.length, deleted });
}

async function run(job: Job<ComputeData, void, ComputeName>): Promise<void> {
  if (job.name === 'finalizeLiveSession') return finalizeLiveSession(FinalizeLiveJob.parse(job.data));
  if (job.name === 'liveControl') return liveControl(LiveControlJob.parse(job.data));
  if (job.name === 'assessmentSweep') {
    AssessmentSweepJob.parse(job.data);
    return assessmentSweep(new Date());
  }
  if (job.name === 'proctorRetention') {
    ProctorRetentionJob.parse(job.data);
    return proctorRetention(new Date());
  }
  LiveSweepJob.parse(job.data);
  return liveSweep(new Date());
}

export function startComputeWorker(redisUrl: string): Worker<ComputeData, void, ComputeName> {
  const worker = new Worker<ComputeData, void, ComputeName>('compute', run, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    concurrency: 4,
  });
  worker.on('failed', (job, error) =>
    log.error('job failed', { queue: 'compute', id: job?.id, attemptsMade: job?.attemptsMade, error }),
  );
  return worker;
}
