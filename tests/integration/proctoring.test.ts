import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import { createUpload } from '@/app/(app)/actions';
import {
  endAttempt,
  extendAttempts,
  gradeSubmission,
  messageTakers,
  saveProctoring,
  setExtraTime,
  waivePenalty,
} from '@/app/(app)/courses/[offeringId]/assessments/actions';
import {
  addSnapshot,
  proctorBeat,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { GET as download } from '@/app/api/files/[...key]/route';
import { getAssessmentPage, getMonitor, getSubmissionForGrading } from '@/lib/data/assessments';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Assessment, type AssessmentDoc } from '@/lib/models/assessment';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import type { ReportedEvent } from '@/lib/schemas/assessment';
import { startComputeWorker } from '@/worker/jobs/compute';
import { enroll, makeAssessment, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

const { presignUpload, presignDownload, deleteObjects } = vi.hoisted(() => ({
  presignUpload: vi.fn(async (key: string) => `https://storage.test/put/${key}`),
  presignDownload: vi.fn(async (key: string) => `https://storage.test/get/${key}`),
  deleteObjects: vi.fn(async (keys: string[]) => void keys),
}));
vi.mock('@/lib/integrations/storage', () => ({ presignUpload, presignDownload, deleteObjects }));

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const MIN = 60_000;
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const RULES = { fullscreen: true, camera: false, snapshotEverySec: 60, blockCopy: true, hardLimit: 3, penaltyEach: 0 };

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, AuditLog, Course, Enrollment, Offering, Submission].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
  worker = startComputeWorker(env().REDIS_URL);
  queueEvents = new QueueEvents('compute', { connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }) });
  await queueEvents.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), queueEvents.close(), computeQueue().close(), mailQueue().close()]);
  await redis().quit();
});

// A course taught by `faculty` with two students and a head of department, and a published quiz with one question
// worth 5 marks; proctored with `proctoring` (null: not proctored).
async function world(proctoring: Partial<typeof RULES> | null = RULES, over: Partial<AssessmentDoc> = {}) {
  const course = await makeCourse();
  const faculty = await makeUser({ roles: ['faculty'] });
  const offering = await makeOffering({ courseId: course._id, facultyIds: [faculty._id], category: 'skill' });
  const [student, second] = await Promise.all([makeUser(), makeUser()]);
  const hod = await makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId });
  await Promise.all([enroll(offering._id, student._id), enroll(offering._id, second._id)]);
  const right = newId();
  const itemId = newId();
  const quiz = await makeAssessment({
    offeringId: offering._id,
    createdBy: faculty._id,
    maxMarks: 5,
    items: [
      {
        _id: itemId,
        type: 'mcq',
        prompt: doc('Pick yes.'),
        maxMarks: 5,
        options: [
          { _id: newId(), text: 'No' },
          { _id: right, text: 'Yes' },
        ],
        answer: { optionId: right },
      },
    ],
    proctoring: proctoring && { ...RULES, ...proctoring },
    ...over,
  });
  return {
    faculty,
    offering,
    student,
    second,
    hod,
    aid: String(quiz._id),
    itemId: String(itemId),
    right: String(right),
  };
}
type World = Awaited<ReturnType<typeof world>>;

// Starts an attempt as `who` and returns its id.
async function start(w: World, who: { _id: Types.ObjectId; sessionVersion: number }) {
  await signInAs(who);
  await expect(startAttempt({ assessmentId: w.aid, agree: 'true' })).rejects.toMatchObject({
    digest: expect.stringContaining('/attempt'),
  });
  const attempt = await Submission.findOne({ assessmentId: w.aid, studentId: who._id }).lean();
  return String(attempt?._id);
}

const beat = (submissionId: string, sessionId: string, events: ReportedEvent[] = []) =>
  proctorBeat({ submissionId, sessionId, events });
// Moves the last counted serious warning back, as if it happened a minute ago.
const aMinuteLater = (submissionId: string) =>
  Submission.updateOne({ _id: submissionId }, { $set: { 'proctor.lastHardAt': new Date(Date.now() - MIN) } });

describe('proctoring settings (TP-08)', () => {
  it('are set by whoever manages the test, and fixed once anyone has started', async () => {
    const w = await world(null);
    const input = {
      assessmentId: w.aid,
      enabled: 'true',
      fullscreen: 'true',
      camera: 'true',
      snapshotEverySec: '45',
      blockCopy: 'false',
      hardLimit: '2',
      penaltyEach: '0.5',
    };
    await signInAs(w.hod);
    await expect(saveProctoring(input)).rejects.toMatchObject({ digest: NOT_FOUND });
    await signInAs(w.faculty);
    expect(await saveProctoring({ ...input, penaltyEach: '0.555' })).toMatchObject({ code: 'VALIDATION' });
    expect(await saveProctoring({ ...input, snapshotEverySec: '10' })).toMatchObject({ code: 'VALIDATION' });
    expect(await saveProctoring(input)).toMatchObject({ ok: true });
    expect((await Assessment.findById(w.aid).lean())?.proctoring).toEqual({
      fullscreen: true,
      camera: true,
      snapshotEverySec: 45,
      blockCopy: false,
      hardLimit: 2,
      penaltyEach: 0.5,
    });
    expect(await saveProctoring({ assessmentId: w.aid })).toMatchObject({ ok: true });
    expect((await Assessment.findById(w.aid).lean())?.proctoring).toBeNull();
    await start(w, w.student);
    await signInAs(w.faculty);
    expect(await saveProctoring(input)).toMatchObject({ code: 'CONFLICT' });
  });

  it('are shown to the taker before they start, and reach the runner', async () => {
    const w = await world({ penaltyEach: 1 });
    await signInAs(w.student);
    const page = await getAssessmentPage(w.aid);
    expect(page.view === 'student' && page.assessment.proctoring).toMatchObject({ hardLimit: 3, penaltyEach: 1 });
  });

  it('start nothing until the taker ticks that they read them (AC-M05-06)', async () => {
    const w = await world();
    await signInAs(w.student);
    expect(await startAttempt({ assessmentId: w.aid })).toMatchObject({
      code: 'VALIDATION',
      message: 'Tick that you have read the rules, then start.',
    });
    expect(await Submission.countDocuments({ assessmentId: w.aid })).toBe(0);
    await start(w, w.student);
    // Continuing the running attempt asks nothing.
    await expect(startAttempt({ assessmentId: w.aid })).rejects.toMatchObject({
      digest: expect.stringContaining('/attempt'),
    });
    expect(await Submission.countDocuments({ assessmentId: w.aid })).toBe(1);
  });
});

describe('the beat (07 §15)', () => {
  it('counts serious warnings, merges close ones and hands the attempt in at the limit', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    const tab = crypto.randomUUID();
    expect(await beat(sid, tab)).toMatchObject({ ok: true, data: { state: 'live', hard: 0 } });
    expect(await beat(sid, tab, ['fullscreen_exit', 'left_page'])).toMatchObject({ data: { state: 'live', hard: 1 } });
    await aMinuteLater(sid);
    expect(await beat(sid, tab, ['paste', 'left_page'])).toMatchObject({ data: { state: 'live', hard: 2 } });
    const running = await Submission.findById(sid).lean();
    expect(running?.proctor?.soft).toBe(1);
    expect(running?.proctor?.events.map((e) => [e.type, e.counted])).toEqual([
      ['fullscreen_exit', true],
      ['left_page', false],
      ['paste', false],
      ['left_page', true],
    ]);
    await aMinuteLater(sid);
    expect(await beat(sid, tab, ['left_page'])).toMatchObject({ data: { state: 'ended', endedBy: 'warnings' } });
    expect(await Submission.findById(sid).lean()).toMatchObject({
      status: 'graded',
      endedBy: 'warnings',
      autoSubmitted: false,
      total: 0,
    });
    expect(await beat(sid, tab)).toMatchObject({ data: { state: 'ended', endedBy: 'warnings' } });
  });

  it('keeps a proctored attempt to one tab or device', async () => {
    const w = await world({ hardLimit: 0 });
    const sid = await start(w, w.student);
    const [first, second] = [crypto.randomUUID(), crypto.randomUUID()];
    await beat(sid, first);
    expect(await beat(sid, second)).toMatchObject({ data: { state: 'blocked', hard: 1 } });
    // The same tab trying again is recorded once.
    expect(await beat(sid, second, ['left_page'])).toMatchObject({ data: { state: 'blocked', hard: 1 } });
    expect(await beat(sid, first)).toMatchObject({ data: { state: 'live', hard: 1 } });
    // Once the first has been quiet for 45 s, the second takes over.
    await Submission.updateOne({ _id: sid }, { $set: { 'proctor.lastBeatAt': new Date(Date.now() - 50_000) } });
    expect(await beat(sid, second)).toMatchObject({ data: { state: 'live', hard: 1 } });
    await aMinuteLater(sid);
    expect(await beat(sid, first)).toMatchObject({ data: { state: 'blocked', hard: 2 } });
    const events = (await Submission.findById(sid).lean())?.proctor?.events ?? [];
    expect(events.map((e) => e.type)).toEqual(['second_device', 'second_device']);
  });

  it('records a lost connection, and nothing but the beat on an unproctored test', async () => {
    const proctored = await world();
    const sid = await start(proctored, proctored.student);
    const tab = crypto.randomUUID();
    await beat(sid, tab);
    await Submission.updateOne({ _id: sid }, { $set: { 'proctor.lastBeatAt': new Date(Date.now() - 90_000) } });
    await beat(sid, tab);
    const gap = (await Submission.findById(sid).lean())?.proctor;
    expect(gap?.events).toMatchObject([{ type: 'connection_gap', counted: false, detail: '90 s' }]);
    expect(gap?.soft).toBe(1);

    const open = await world(null);
    const other = await start(open, open.student);
    await beat(other, crypto.randomUUID(), ['left_page', 'paste']);
    expect(await beat(other, crypto.randomUUID())).toMatchObject({ data: { state: 'live', hard: 0 } });
    const quiet = (await Submission.findById(other).lean())?.proctor;
    expect(quiet).toMatchObject({ hard: 0, soft: 0, events: [] });
    expect(quiet?.lastBeatAt).toBeInstanceOf(Date);
  });

  it('answers only the attempt’s own taker', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    await signInAs(w.second);
    expect(await beat(sid, crypto.randomUUID())).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('the penalty for serious warnings (07 §15)', () => {
  it('comes off the total; a grader waives it or puts it back, audited, and the taker sees it', async () => {
    const w = await world({ penaltyEach: 1.5, hardLimit: 0 });
    const sid = await start(w, w.student);
    await saveAnswer({ submissionId: sid, itemId: w.itemId, answer: { type: 'mcq', optionId: w.right } });
    const tab = crypto.randomUUID();
    await beat(sid, tab, ['left_page']);
    await aMinuteLater(sid);
    await beat(sid, tab, ['left_page']);
    await expect(submitAttempt({ submissionId: sid })).rejects.toMatchObject({ digest: expect.any(String) });
    expect(await Submission.findById(sid).lean()).toMatchObject({ status: 'graded', total: 2 });

    await signInAs(w.student);
    expect(await waivePenalty({ submissionId: sid, waived: 'true' })).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(w.hod);
    await expect(waivePenalty({ submissionId: sid, waived: 'true' })).rejects.toMatchObject({ digest: NOT_FOUND });
    await signInAs(w.faculty);
    const view = await getSubmissionForGrading(w.aid, sid);
    expect(view.proctor).toMatchObject({ hard: 2, penalty: 3, waived: false });
    expect(await waivePenalty({ submissionId: sid, waived: 'true' })).toMatchObject({ ok: true });
    expect(await Submission.findById(sid).lean()).toMatchObject({ total: 5, proctor: { waived: true } });
    expect(await AuditLog.findOne({ entityId: sid, action: 'submission.penalty_waived' }).lean()).toMatchObject({
      before: { waived: false, total: 2 },
      after: { waived: true, total: 5 },
    });
    expect(await waivePenalty({ submissionId: sid, waived: 'false' })).toMatchObject({ ok: true });
    expect(await Submission.findById(sid).lean()).toMatchObject({ total: 2, proctor: { waived: false } });
    // Regrading keeps the penalty.
    await gradeSubmission({
      submissionId: sid,
      'item[]': [w.itemId],
      'marks[]': ['4'],
      'comment[]': [''],
      'criterion[]': [],
      'criterionMarks[]': [],
    });
    expect(await Submission.findById(sid).lean()).toMatchObject({ total: 1 });

    await Assessment.updateOne(
      { _id: w.aid },
      { $set: { status: 'results_published', resultsPublishedAt: new Date() } },
    );
    await signInAs(w.student);
    const page = await getAssessmentPage(w.aid);
    expect(page.view === 'student' && page.result).toMatchObject({ total: 1, warnings: 2, penalty: 3 });
  });

  it('has nothing to waive without warnings or a penalty', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    await expect(submitAttempt({ submissionId: sid })).rejects.toMatchObject({ digest: expect.any(String) });
    await signInAs(w.faculty);
    expect(await waivePenalty({ submissionId: sid, waived: 'true' })).toMatchObject({ code: 'VALIDATION' });
  });
});

describe('the live monitor (TP-08)', () => {
  it('shows who is writing, and the test’s staff add time, send messages and end attempts', async () => {
    const w = await world({ hardLimit: 0 });
    const [a, b] = [await start(w, w.student), await start(w, w.second)];
    await signInAs(w.student);
    await saveAnswer({ submissionId: a, itemId: w.itemId, answer: { type: 'mcq', optionId: w.right } });
    await beat(a, crypto.randomUUID(), ['left_page']);
    await Submission.updateOne({ _id: b }, { $set: { 'proctor.lastBeatAt': new Date(Date.now() - 2 * MIN) } });

    await signInAs(w.faculty);
    const monitor = await getMonitor(w.aid, 1);
    expect(monitor.canAct).toBe(true);
    expect(monitor.counts).toEqual({ writing: 2, handedIn: 0, warned: 1, lost: 1 });
    expect(monitor.rows.find((row) => row.id === a)).toMatchObject({
      answered: 1,
      questions: 1,
      hard: 1,
      warnings: ['left_page'],
    });

    const deadlineOf = async (id: string) => (await Submission.findById(id).lean())?.deadlineAt.getTime() ?? 0;
    const [aBefore, bBefore] = [await deadlineOf(a), await deadlineOf(b)];
    expect(await extendAttempts({ assessmentId: w.aid, submissionId: a, minutes: '10' })).toMatchObject({ ok: true });
    expect(await extendAttempts({ assessmentId: w.aid, minutes: '5' })).toMatchObject({ ok: true });
    expect(await deadlineOf(a)).toBe(aBefore + 15 * MIN);
    expect(await deadlineOf(b)).toBe(bBefore + 5 * MIN);
    expect((await getMonitor(w.aid, 1)).rows.find((row) => row.id === a)?.extraMin).toBe(15);
    expect(await AuditLog.countDocuments({ action: 'assessment.time_added', actorId: w.faculty._id })).toBe(2);

    expect(await messageTakers({ assessmentId: w.aid, text: 'Ten minutes left.' })).toMatchObject({ ok: true });
    expect(await messageTakers({ assessmentId: w.aid, submissionId: a, text: 'Stay on the page.' })).toMatchObject({
      ok: true,
    });
    await signInAs(w.student);
    const heard = await beat(a, crypto.randomUUID());
    expect(heard.ok && heard.data.state !== 'ended' && heard.data.messages.map((m) => m.text)).toEqual([
      'Ten minutes left.',
      'Stay on the page.',
    ]);
    expect(heard.ok && heard.data.state !== 'ended' && heard.data.deadlineAt.getTime()).toBe(aBefore + 15 * MIN);

    await signInAs(w.faculty);
    expect(await endAttempt({ submissionId: b })).toMatchObject({ ok: true });
    expect(await Submission.findById(b).lean()).toMatchObject({ status: 'graded', endedBy: 'teacher' });
    expect(await AuditLog.findOne({ entityId: b, action: 'submission.ended' }).lean()).toBeTruthy();
    expect(await endAttempt({ submissionId: b })).toMatchObject({ code: 'CONFLICT' });
    expect(await extendAttempts({ assessmentId: w.aid, submissionId: b, minutes: '5' })).toMatchObject({
      code: 'CONFLICT',
    });
    await signInAs(w.second);
    expect(await beat(b, crypto.randomUUID())).toMatchObject({ data: { state: 'ended', endedBy: 'teacher' } });
  });

  it('lets a head of department watch but not act, and nobody else in', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    await signInAs(w.hod);
    expect((await getMonitor(w.aid, 1)).canAct).toBe(false);
    await expect(extendAttempts({ assessmentId: w.aid, minutes: '5' })).rejects.toMatchObject({ digest: NOT_FOUND });
    await expect(endAttempt({ submissionId: sid })).rejects.toMatchObject({ digest: NOT_FOUND });
    await signInAs(w.second);
    await expect(getMonitor(w.aid, 1)).rejects.toMatchObject({ digest: NOT_FOUND });
    expect(await messageTakers({ assessmentId: w.aid, text: 'Hi' })).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('camera snapshots (TP-08, 09 §11)', () => {
  const upload = (contextId: string) =>
    createUpload({
      purpose: 'proctor-snapshot',
      contextId,
      fileName: 'snapshot.jpg',
      contentType: 'image/jpeg',
      size: 20_000,
    });
  const get = (key: string) =>
    download(new Request(`http://localhost:3000/api/files/${key}`), {
      params: Promise.resolve({ key: key.split('/') }),
    });

  it('are taken only on a test that asks, kept with the attempt and seen only by staff', async () => {
    const off = await world();
    const quiet = await start(off, off.student);
    expect(await upload(quiet)).toMatchObject({ code: 'FORBIDDEN' });

    const w = await world({ camera: true });
    const sid = await start(w, w.student);
    const ticket = await upload(sid);
    if (!ticket.ok) throw new Error(ticket.message);
    expect(ticket.data.key).toMatch(new RegExp(`^proctor-snapshot/${sid}/${w.student._id}/`));
    expect(
      await addSnapshot({ submissionId: sid, key: `proctor-snapshot/${quiet}/${w.student._id}/x.jpg` }),
    ).toMatchObject({ code: 'VALIDATION' });
    expect(await addSnapshot({ submissionId: sid, key: ticket.data.key })).toMatchObject({ ok: true });
    expect(await addSnapshot({ submissionId: sid, key: ticket.data.key })).toMatchObject({ code: 'CONFLICT' });
    expect((await Submission.findById(sid).lean())?.proctor?.snapshots.map((s) => s.key)).toEqual([ticket.data.key]);
    expect((await get(ticket.data.key)).status).toBe(404);
    await signInAs(w.second);
    expect(await upload(sid)).toMatchObject({ code: 'FORBIDDEN' });
    expect((await get(ticket.data.key)).status).toBe(404);
    await signInAs(w.faculty);
    expect((await get(ticket.data.key)).status).toBe(302);
    expect((await getSubmissionForGrading(w.aid, sid)).proctor?.snapshots).toHaveLength(1);
    await signInAs(w.hod);
    expect((await get(ticket.data.key)).status).toBe(302);
  });

  it('are deleted by the daily job once results are older than the retention period', async () => {
    const w = await world({ camera: true });
    const sid = await start(w, w.student);
    const ticket = await upload(sid);
    if (!ticket.ok) throw new Error(ticket.message);
    await addSnapshot({ submissionId: sid, key: ticket.data.key });
    const run = async () => {
      const job = await computeQueue().add('proctorRetention', {}, { jobId: `test-retention-${crypto.randomUUID()}` });
      await job.waitUntilFinished(queueEvents);
    };
    await Assessment.updateOne(
      { _id: w.aid },
      { $set: { status: 'results_published', resultsPublishedAt: new Date(Date.now() - 80 * 24 * 60 * MIN) } },
    );
    await run();
    expect((await Submission.findById(sid).lean())?.proctor?.snapshots).toHaveLength(1);
    await Assessment.updateOne(
      { _id: w.aid },
      { $set: { resultsPublishedAt: new Date(Date.now() - 91 * 24 * 60 * MIN) } },
    );
    deleteObjects.mockClear();
    await run();
    expect(deleteObjects).toHaveBeenCalledWith([ticket.data.key]);
    expect((await Submission.findById(sid).lean())?.proctor?.snapshots).toEqual([]);
    expect((await Assessment.findById(w.aid).lean())?.snapshotsDeletedAt).toBeInstanceOf(Date);
    await run();
    expect(deleteObjects).toHaveBeenCalledTimes(1);
  });
});

describe('late hand-ins and extra time', () => {
  it('is not late within the person’s extra time, and late after the closing time without it', async () => {
    const w = await world(null, { lateUntil: new Date(Date.now() + 120 * MIN) });
    const [a, b] = [await start(w, w.student), await start(w, w.second)];
    await signInAs(w.faculty);
    await setExtraTime({ assessmentId: w.aid, who: w.student.email, minutes: '30' });
    // The window closed five minutes ago; both are still writing.
    await Assessment.updateOne({ _id: w.aid }, { $set: { closesAt: new Date(Date.now() - 5 * MIN) } });
    await Submission.updateMany({ _id: { $in: [a, b] } }, { $set: { deadlineAt: new Date(Date.now() + 20 * MIN) } });
    await signInAs(w.student);
    await expect(submitAttempt({ submissionId: a })).rejects.toMatchObject({ digest: expect.any(String) });
    await signInAs(w.second);
    await expect(submitAttempt({ submissionId: b })).rejects.toMatchObject({ digest: expect.any(String) });
    expect(await Submission.findById(a).lean()).toMatchObject({ late: false });
    expect(await Submission.findById(b).lean()).toMatchObject({ late: true });
  });
});
