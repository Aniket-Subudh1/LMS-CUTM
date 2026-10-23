import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import {
  addFromBank,
  gradeSubmission,
  rerunCode,
  saveItem,
} from '@/app/(app)/courses/[offeringId]/assessments/actions';
import {
  runCode,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { getAttemptForStudent, getSubmissionForGrading, listSubmissions } from '@/lib/data/assessments';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { RunJob, RunResult } from '@/lib/integrations/code-runner';
import { Assessment } from '@/lib/models/assessment';
import { AuditLog } from '@/lib/models/audit-log';
import { BankItem } from '@/lib/models/bank-item';
import { Course } from '@/lib/models/course';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import { startComputeWorker } from '@/worker/jobs/compute';
import { enroll, makeAssessment, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

// The runner, played by the source: `sum` adds the numbers it reads, `five` always prints 5, `broken` does not
// compile and `slow` runs out of time.
const { runBatch } = vi.hoisted(() => ({
  runBatch: vi.fn(async (jobs: readonly RunJob[]) =>
    jobs.map((job): RunResult => {
      const base = { stderr: '', compileOutput: '', timeMs: 12, memoryKb: 3_100 };
      if (job.source === 'broken') return { ...base, status: 'compile_error', stdout: '', compileOutput: 'error: ;' };
      if (job.source === 'slow') return { ...base, status: 'time_limit', stdout: '' };
      const sum = job.stdin
        .split(/\s+/)
        .filter(Boolean)
        .reduce((total, n) => total + Number(n), 0);
      return { ...base, status: 'accepted', stdout: job.source === 'five' ? '5\n' : `${sum}\n` };
    }),
  ),
}));
vi.mock('@/lib/integrations/code-runner', () => ({ runBatch, listLanguages: vi.fn(async () => []) }));

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const prompt = (text: string) => JSON.stringify(doc(text));
const HIDDEN_INPUT = '1000 2345';
const HIDDEN_OUTPUT = '3345';

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, AuditLog, BankItem, Course, EngagementDaily, Enrollment, Offering, Submission].map(async (m) => {
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

// A coding test on a skill course with one code question worth 8 marks: a visible test (weight 1) and two hidden
// ones (weights 1 and 2), C and C++, three runs; and a written question, so a hand-in waits for a grader.
async function world(over: { runLimit?: number } = {}) {
  const course = await makeCourse();
  const faculty = await makeUser({ roles: ['faculty'] });
  const offering = await makeOffering({ courseId: course._id, facultyIds: [faculty._id], category: 'skill' });
  const [student, second] = await Promise.all([makeUser(), makeUser()]);
  await Promise.all([enroll(offering._id, student._id), enroll(offering._id, second._id)]);
  const itemId = newId();
  const writtenId = newId();
  const test = await makeAssessment({
    offeringId: offering._id,
    mode: 'coding_test',
    createdBy: faculty._id,
    maxMarks: 10,
    items: [
      {
        _id: itemId,
        type: 'code',
        prompt: doc('Add two numbers.'),
        maxMarks: 8,
        code: {
          languages: ['c', 'cpp'],
          starter: [{ language: 'c', source: '#include <stdio.h>\n' }],
          timeLimitSec: 2,
          memoryKb: 128_000,
          runLimit: over.runLimit ?? 3,
          testCases: [
            { input: '2 3', expected: '5', hidden: false, weight: 1 },
            { input: HIDDEN_INPUT, expected: HIDDEN_OUTPUT, hidden: true, weight: 1 },
            { input: '-1 1', expected: '0', hidden: true, weight: 2 },
          ],
        },
      },
      { _id: writtenId, type: 'text', prompt: doc('Explain your code.'), maxMarks: 2 },
    ],
  });
  return { course, faculty, offering, student, second, aid: String(test._id), itemId: String(itemId), writtenId };
}
type World = Awaited<ReturnType<typeof world>>;

async function start(w: World, who: { _id: Types.ObjectId; sessionVersion: number }) {
  await signInAs(who);
  await expect(startAttempt({ assessmentId: w.aid, agree: 'true' })).rejects.toMatchObject({
    digest: expect.stringContaining('/attempt'),
  });
  return String((await Submission.findOne({ assessmentId: w.aid, studentId: who._id }).lean())?._id);
}

async function handIn(sid: string) {
  await expect(submitAttempt({ submissionId: sid })).rejects.toMatchObject({ digest: expect.any(String) });
  const job = await computeQueue().getJob(`code-${sid}`);
  await job?.waitUntilFinished(queueEvents);
}

describe('code questions in the builder (TP-09)', () => {
  const question = (w: World, over: Record<string, unknown> = {}) => ({
    assessmentId: w.aid,
    type: 'code' as const,
    prompt: prompt('Reverse a string.'),
    maxMarks: '5',
    'cos[]': [],
    'language[]': ['cpp'],
    'starterLanguage[]': [],
    'starter[]': [],
    'caseInput[]': ['abc'],
    'caseExpected[]': ['cba'],
    'caseWeight[]': [],
    'caseHidden[]': [],
    ...over,
  });

  it('offers only languages the setting has, holds at most five, and only in a coding mode', async () => {
    const w = await world();
    await Submission.deleteMany({ assessmentId: w.aid });
    await signInAs(w.faculty);
    expect(await saveItem(question(w, { 'language[]': ['cobol'] }))).toMatchObject({ code: 'VALIDATION' });
    for (let i = 0; i < 4; i++) expect(await saveItem(question(w))).toMatchObject({ ok: true });
    expect(await saveItem(question(w))).toMatchObject({ code: 'CONFLICT' });
    const saved = (await Assessment.findById(w.aid).lean())?.items.find(
      (item) => item.type === 'code' && item.maxMarks === 5,
    );
    expect(saved?.code?.testCases[0]).toMatchObject({ input: 'abc', expected: 'cba', hidden: false, weight: 1 });
    expect(saved?.code?.testCases[0]._id).toBeTruthy();

    const quiz = await makeAssessment({ offeringId: w.offering._id, status: 'draft', createdBy: w.faculty._id });
    expect(await saveItem(question(w, { assessmentId: String(quiz._id) }))).toMatchObject({ code: 'VALIDATION' });
  });

  it('copies a code question from the bank with its tests', async () => {
    const w = await world();
    await Submission.deleteMany({ assessmentId: w.aid });
    const draft = await makeAssessment({
      offeringId: w.offering._id,
      mode: 'lab_test',
      status: 'draft',
      createdBy: w.faculty._id,
    });
    const banked = await BankItem.create({
      courseId: w.course._id,
      type: 'code',
      prompt: doc('Square a number.'),
      maxMarks: 4,
      code: {
        languages: ['c'],
        timeLimitSec: 1,
        memoryKb: 64_000,
        runLimit: 5,
        testCases: [{ input: '3', expected: '9', hidden: false, weight: 1 }],
      },
      createdBy: w.faculty._id,
    });
    await signInAs(w.faculty);
    expect(await addFromBank({ assessmentId: String(draft._id), 'bankItemIds[]': [String(banked._id)] })).toMatchObject(
      { ok: true },
    );
    expect((await Assessment.findById(draft._id).lean())?.items[0].code?.testCases[0]).toMatchObject({ expected: '9' });
  });
});

describe('taking a code question (TP-09, 09 §10)', () => {
  it('never sends a hidden test to the person taking it', async () => {
    const w = await world();
    await start(w, w.student);
    const attempt = await getAttemptForStudent(w.aid);
    const sent = JSON.stringify(attempt);
    expect(sent).not.toContain(HIDDEN_INPUT);
    expect(sent).not.toContain(HIDDEN_OUTPUT);
    expect(attempt?.items.find((item) => item.id === w.itemId)?.code).toMatchObject({
      languages: ['c', 'cpp'],
      samples: [{ input: '2 3', expected: '5' }],
      hidden: 2,
      runLimit: 3,
    });
    expect(attempt?.languages.map((l) => l.key)).toEqual(['c', 'cpp', 'java']);
  });

  it('saves and runs the code on the visible tests only, within the run limit and the wait between runs', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    const run = (source: string, language = 'c') => runCode({ submissionId: sid, itemId: w.itemId, language, source });
    expect(await run('sum', 'java')).toMatchObject({ code: 'VALIDATION' });
    const first = await run('sum');
    expect(first).toMatchObject({
      ok: true,
      data: { runsLeft: 2, results: [{ status: 'accepted', stdout: '5\n', timeMs: 12 }] },
    });
    expect(JSON.stringify(first)).not.toContain(HIDDEN_OUTPUT);
    expect(runBatch).toHaveBeenLastCalledWith([expect.objectContaining({ stdin: '2 3', runnerLanguageId: 50 })]);
    expect(await run('five')).toMatchObject({ code: 'RATE_LIMITED' });
    const stored = await Submission.findById(sid).lean();
    expect(stored?.answers?.[w.itemId]?.code).toEqual({ language: 'c', source: 'sum' });
    expect(stored?.runs).toMatchObject([{ passed: 1, total: 1 }]);
    expect(
      await EngagementDaily.findOne({ offeringId: w.offering._id, studentId: w.student._id }).lean(),
    ).toMatchObject({ codeRuns: 1 });
    // The limit counts the runs kept with the attempt.
    await Submission.updateOne(
      { _id: sid },
      { $push: { runs: { $each: [1, 2].map(() => ({ itemId: w.itemId, at: new Date(), passed: 0, total: 1 })) } } },
    );
    expect(await run('sum')).toMatchObject({ code: 'CONFLICT' });
    // Saving keeps the code as typed; a language the question does not offer is refused.
    expect(
      await saveAnswer({
        submissionId: sid,
        itemId: w.itemId,
        answer: { type: 'code', language: 'cpp', source: 'five' },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await saveAnswer({
        submissionId: sid,
        itemId: w.itemId,
        answer: { type: 'code', language: 'java', source: 'x' },
      }),
    ).toMatchObject({ code: 'VALIDATION' });
  });

  it('lets only the attempt’s own taker run it', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    await signInAs(w.second);
    expect(await runCode({ submissionId: sid, itemId: w.itemId, language: 'c', source: 'sum' })).toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('grading code (TP-09, LAB-05, 07 §14)', () => {
  it('runs every test after hand-in and marks by the weight passed, once', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    await saveAnswer({ submissionId: sid, itemId: w.itemId, answer: { type: 'code', language: 'c', source: 'five' } });
    // Two earlier runs of the sample test, kept with the attempt as runCode keeps them.
    await Submission.updateOne(
      { _id: sid },
      { $push: { runs: { $each: [0, 1].map((passed) => ({ itemId: w.itemId, at: new Date(), passed, total: 1 })) } } },
    );
    runBatch.mockClear();
    await handIn(sid);
    // `five` passes the visible test (weight 1 of 4): 8 × 1/4 = 2.
    const graded = await Submission.findById(sid).lean();
    expect(graded?.scores?.[w.itemId]).toMatchObject({ marks: 2, by: 'auto' });
    expect(graded?.results.map((r) => r.status)).toEqual(['accepted', 'wrong_answer', 'wrong_answer']);
    expect(graded).toMatchObject({ status: 'submitted', total: null });
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(runBatch.mock.calls[0][0]).toHaveLength(3);

    await signInAs(w.faculty);
    const view = await getSubmissionForGrading(w.aid, sid);
    expect(view.submission.results[w.itemId]).toHaveLength(3);
    // M05 T6: the hand-ins list shows the runs, the best one and the code marks.
    const list = await listSubmissions(w.aid, {}, 1);
    expect(list.assessment.codeMarks).toBe(8);
    expect(list.rows).toMatchObject([{ code: { runs: 2, best: { passed: 1, total: 1 }, marks: 2 } }]);
    expect(view.items.find((item) => item.id === w.itemId)?.tests).toHaveLength(3);
    // An empty code mark keeps the tests' mark; the written answer is marked by hand.
    await gradeSubmission({
      submissionId: sid,
      'item[]': [w.itemId, String(w.writtenId)],
      'marks[]': ['', '2'],
      'comment[]': ['', ''],
      'criterion[]': [],
      'criterionMarks[]': [],
    });
    expect(await Submission.findById(sid).lean()).toMatchObject({ status: 'graded', total: 4 });
  });

  it('keeps a grader’s mark when the tests run again, and audits the request', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    await saveAnswer({ submissionId: sid, itemId: w.itemId, answer: { type: 'code', language: 'cpp', source: 'sum' } });
    await handIn(sid);
    expect((await Submission.findById(sid).lean())?.scores?.[w.itemId]).toMatchObject({ marks: 8, by: 'auto' });
    await signInAs(w.faculty);
    await gradeSubmission({
      submissionId: sid,
      'item[]': [w.itemId, String(w.writtenId)],
      'marks[]': ['6', '1'],
      'comment[]': ['Hard-coded the edge case.', ''],
      'criterion[]': [],
      'criterionMarks[]': [],
    });
    expect(await rerunCode({ submissionId: sid })).toMatchObject({ ok: true });
    await (await computeQueue().getJob(`code-${sid}`))?.waitUntilFinished(queueEvents);
    expect(await Submission.findById(sid).lean()).toMatchObject({ total: 7, status: 'graded' });
    expect((await Submission.findById(sid).lean())?.scores?.[w.itemId]).toMatchObject({ marks: 6 });
    expect(await AuditLog.findOne({ entityId: sid, action: 'submission.code_rerun' }).lean()).toBeTruthy();
    await signInAs(w.student);
    expect(await rerunCode({ submissionId: sid })).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('scores code that does not compile, and an unanswered question, 0', async () => {
    const w = await world();
    const [a, b] = [await start(w, w.student), await start(w, w.second)];
    await signInAs(w.student);
    await saveAnswer({ submissionId: a, itemId: w.itemId, answer: { type: 'code', language: 'c', source: 'broken' } });
    await handIn(a);
    await signInAs(w.second);
    await handIn(b);
    const [broken, empty] = await Promise.all([Submission.findById(a).lean(), Submission.findById(b).lean()]);
    expect(broken?.scores?.[w.itemId]).toMatchObject({ marks: 0 });
    expect(broken?.results.every((r) => r.status === 'compile_error')).toBe(true);
    expect(empty?.scores?.[w.itemId]).toMatchObject({ marks: 0 });
    expect(empty?.results).toEqual([]);
  });

  it('is read only by the test’s staff', async () => {
    const w = await world();
    const sid = await start(w, w.student);
    await handIn(sid);
    await signInAs(w.second);
    await expect(getSubmissionForGrading(w.aid, sid)).rejects.toMatchObject({ digest: NOT_FOUND });
  });
});
