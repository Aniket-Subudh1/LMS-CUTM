import { inflateRawSync, inflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import {
  gradeSubmission,
  publishResults,
  requestTestFile,
  saveResultRules,
} from '@/app/(app)/courses/[offeringId]/assessments/actions';
import {
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { GET as download } from '@/app/api/files/[...key]/route';
import { getAssessmentPage, getTestResults } from '@/lib/data/assessments';
import { getCertificate } from '@/lib/data/results';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Assessment, type AssessmentDoc } from '@/lib/models/assessment';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Notification } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { TestFile } from '@/lib/models/test-file';
import { TestStats } from '@/lib/models/test-stats';
import type { TestFileKind } from '@/lib/schemas/assessment';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import { startComputeWorker } from '@/worker/jobs/compute';
import { enroll, form, makeAssessment, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

// TP-12: the worker's files land here instead of storage.
const { objects, deleted } = vi.hoisted(() => ({ objects: new Map<string, Buffer>(), deleted: [] as string[] }));
vi.mock('@/lib/integrations/storage', () => ({
  uploadFromFile: async (key: string, path: string) => {
    const { readFile } = await import('node:fs/promises');
    objects.set(key, await readFile(path));
  },
  deleteObjects: async (keys: string[]) => {
    deleted.push(...keys);
  },
  presignDownload: async (key: string) => `https://storage.test/get/${key}`,
}));

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const MIN = 60_000;
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const ESSAY =
  'A binary search tree keeps every key in the left subtree smaller than the node and every key in the right subtree larger, so an inorder walk visits the keys in ascending order and a search halves the work at each step.';

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, AuditLog, Course, Enrollment, Notification, Offering, Submission, TestStats, TestFile].map(
      async (m) => {
        await m.createCollection();
        await m.createIndexes();
      },
    ),
  );
  worker = startComputeWorker(env().REDIS_URL);
  queueEvents = new QueueEvents('compute', { connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }) });
  await queueEvents.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), queueEvents.close(), computeQueue().close(), mailQueue().close()]);
  await redis().quit();
});

// A course with CO1 and CO2, taught by `faculty`, with four students and a head of department; a published quiz with
// two one-answer questions (2 marks each, CO1 and CO2, with explanations) and a written one (2 marks, CO2).
async function world(over: Partial<AssessmentDoc> = {}) {
  const [co1, co2] = [newId(), newId()];
  const course = await makeCourse({
    cos: [
      { _id: co1, code: 'CO1', statement: 'Explain.' },
      { _id: co2, code: 'CO2', statement: 'Apply.' },
    ],
  });
  const faculty = await makeUser({ roles: ['faculty'] });
  const offering = await makeOffering({ courseId: course._id, facultyIds: [faculty._id], category: 'skill' });
  const students = await Promise.all(Array.from({ length: 4 }, () => makeUser()));
  const hod = await makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId });
  await Promise.all(students.map((s) => enroll(offering._id, s._id)));
  const [q1, q2, q3, right1, wrong1, right2, wrong2] = Array.from({ length: 7 }, newId);
  const quiz = await makeAssessment({
    offeringId: offering._id,
    createdBy: faculty._id,
    maxMarks: 6,
    items: [
      {
        _id: q1,
        type: 'mcq',
        prompt: doc('Which traversal sorts a BST?'),
        maxMarks: 2,
        coIds: [co1],
        explanation: doc('Inorder visits left, root, right.'),
        options: [
          { _id: right1, text: 'Inorder' },
          { _id: wrong1, text: 'Preorder' },
        ],
        answer: { optionId: right1 },
      },
      {
        _id: q2,
        type: 'mcq',
        prompt: doc('What is 7 / 2 in C?'),
        maxMarks: 2,
        coIds: [co2],
        options: [
          { _id: right2, text: '3' },
          { _id: wrong2, text: '3.5' },
        ],
        answer: { optionId: right2 },
      },
      { _id: q3, type: 'text', prompt: doc('Explain a BST.'), maxMarks: 2, coIds: [co2] },
    ],
    ...over,
  });
  return {
    faculty,
    hod,
    students,
    offering,
    aid: String(quiz._id),
    q: { q1: String(q1), q2: String(q2), q3: String(q3) },
    o: { right1: String(right1), wrong1: String(wrong1), right2: String(right2), wrong2: String(wrong2) },
  };
}
type World = Awaited<ReturnType<typeof world>>;

// `who` takes the quiz with these answers and hands in; the written answer is then marked `written` by faculty.
async function take(
  w: World,
  who: { _id: Types.ObjectId; sessionVersion: number },
  answers: { q1: string; q2: string; text: string },
  written: number,
) {
  await signInAs(who);
  await expect(startAttempt({ assessmentId: w.aid })).rejects.toMatchObject({
    digest: expect.stringContaining('/attempt'),
  });
  const sid = String((await Submission.findOne({ assessmentId: w.aid, studentId: who._id }).lean())?._id);
  await saveAnswer({ submissionId: sid, itemId: w.q.q1, answer: { type: 'mcq', optionId: answers.q1 } });
  await saveAnswer({ submissionId: sid, itemId: w.q.q2, answer: { type: 'mcq', optionId: answers.q2 } });
  await saveAnswer({
    submissionId: sid,
    itemId: w.q.q3,
    answer: { type: 'text', text: JSON.stringify(doc(answers.text)) },
  });
  await expect(submitAttempt({ submissionId: sid })).rejects.toMatchObject({ digest: expect.any(String) });
  await signInAs(w.faculty);
  const scores = (await Submission.findById(sid).lean())?.scores ?? {};
  await gradeSubmission({
    submissionId: sid,
    'item[]': [w.q.q1, w.q.q2, w.q.q3],
    'marks[]': [String(scores[w.q.q1]?.marks ?? 0), String(scores[w.q.q2]?.marks ?? 0), String(written)],
    'comment[]': ['', '', ''],
    'criterion[]': [],
    'criterionMarks[]': [],
  });
  return sid;
}

async function statsFor(aid: string, after = new Date(0)) {
  await expect
    .poll(async () => (await TestStats.findById(aid).lean())?.computedAt?.getTime() ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(after.getTime());
  return TestStats.findById(aid).lean();
}

const rules = (w: World, over: Record<string, string | string[]> = {}) =>
  form({
    assessmentId: w.aid,
    release: 'manual',
    'bandLabel[]': ['Recommended', 'Waitlist'],
    'bandMin[]': ['75', '50'],
    ...over,
  });

describe('result rules (TP-11)', () => {
  it('are saved by whoever manages the test, with bands highest first', async () => {
    const w = await world();
    await signInAs(w.hod);
    await expect(saveResultRules(rules(w))).rejects.toMatchObject({ digest: NOT_FOUND });
    await signInAs(w.faculty);
    expect(await saveResultRules(rules(w, { 'bandMin[]': ['75', ''] }))).toMatchObject({ code: 'VALIDATION' });
    expect(await saveResultRules(rules(w, { 'bandMin[]': ['60', '60'] }))).toMatchObject({ code: 'VALIDATION' });
    expect(
      await saveResultRules(
        rules(w, { leaderboard: 'true', 'bandLabel[]': ['Waitlist', 'Recommended'], 'bandMin[]': ['50', '75'] }),
      ),
    ).toMatchObject({ ok: true });
    expect((await Assessment.findById(w.aid).lean())?.results).toMatchObject({
      release: 'manual',
      leaderboard: true,
      showAnswers: false,
      bands: [
        { label: 'Recommended', minPct: 75 },
        { label: 'Waitlist', minPct: 50 },
      ],
      setBy: w.faculty._id,
    });
  });

  it('show a person their marks at once only with the "at once" rule, and the key only when allowed', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveResultRules(rules(w, { release: 'instant' }));
    await take(w, w.students[0], { q1: w.o.wrong1, q2: w.o.right2, text: 'A tree.' }, 1);
    await signInAs(w.students[0]);
    const page = await getAssessmentPage(w.aid);
    const result = page.view === 'student' ? page.result : null;
    expect(result).toMatchObject({ total: 3, pct: 50, band: 'Waitlist', standing: null, leaderboard: null });
    expect(result?.items[0]).toMatchObject({ given: 'Preorder', correct: null, explanation: null });

    await signInAs(w.faculty);
    await saveResultRules(rules(w, { release: 'instant', showAnswers: 'true', showExplanations: 'true' }));
    await signInAs(w.students[0]);
    const shown = await getAssessmentPage(w.aid);
    expect(shown.view === 'student' && shown.result?.items[0]).toMatchObject({
      given: 'Preorder',
      correct: 'Inorder',
      explanation: doc('Inorder visits left, root, right.'),
    });
    expect(shown.view === 'student' && shown.result?.outcomes).toEqual([
      { code: 'CO1', statement: 'Explain.', marks: 0, maxMarks: 2 },
      { code: 'CO2', statement: 'Apply.', marks: 3, maxMarks: 4 },
    ]);

    const manual = await world();
    await take(manual, manual.students[0], { q1: manual.o.right1, q2: manual.o.right2, text: 'A tree.' }, 2);
    await signInAs(manual.students[0]);
    const hidden = await getAssessmentPage(manual.aid);
    expect(hidden.view === 'student' && hidden.result).toBeNull();
  });
});

describe('published results (TP-11, 07 §19)', () => {
  it('rank everyone, analyse each question, flag alike answers and show the leaderboard', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveResultRules(rules(w, { leaderboard: 'true' }));
    const [a, b, c, d] = w.students;
    await take(w, a, { q1: w.o.right1, q2: w.o.right2, text: ESSAY }, 2);
    await take(w, b, { q1: w.o.right1, q2: w.o.wrong2, text: ESSAY.toUpperCase() }, 2);
    await take(w, c, { q1: w.o.wrong1, q2: w.o.right2, text: 'It is a tree.' }, 1);
    await take(w, d, { q1: w.o.wrong1, q2: w.o.wrong2, text: 'I do not know.' }, 0);
    await Assessment.updateOne({ _id: w.aid }, { $set: { closesAt: new Date(Date.now() - MIN) } });
    await signInAs(w.faculty);
    expect(await publishResults({ assessmentId: w.aid })).toMatchObject({ ok: true });
    const stats = await statsFor(w.aid);
    expect(stats).toMatchObject({ takers: 4, highestPct: 100, flagged: 2, histogram: [1, 0, 0, 0, 0, 1, 1, 0, 0, 1] });
    expect(stats?.items.find((item) => String(item.key) === w.q.q1)).toMatchObject({
      correctPct: 50,
      wrongPick: { text: 'Preorder', pct: 50 },
    });
    expect(stats?.leaderboard.map((row) => [row.rank, row.total])).toEqual([
      [1, 6],
      [2, 4],
      [3, 3],
      [4, 0],
    ]);

    await signInAs(c);
    const page = await getAssessmentPage(w.aid);
    expect(page.view === 'student' && page.result).toMatchObject({
      standing: { rank: 3, of: 4, percentile: 38 },
      band: 'Waitlist',
    });
    expect(page.view === 'student' && page.result?.leaderboard?.find((row) => row.you)).toMatchObject({ rank: 3 });

    // The analysis is the staff's; HoD reads it, a student does not.
    await signInAs(w.hod);
    expect((await getTestResults(w.aid)).stats?.takers).toBe(4);
    await signInAs(a);
    await expect(getTestResults(w.aid)).rejects.toMatchObject({ digest: NOT_FOUND });
    expect((await Submission.findOne({ assessmentId: w.aid, studentId: a._id }).lean())?.similar).toMatchObject([
      { score: 1 },
    ]);
  }, 60_000);

  it('follow a regrade after they are out', async () => {
    const w = await world();
    const [a, b] = w.students;
    await take(w, a, { q1: w.o.right1, q2: w.o.right2, text: 'x' }, 2);
    const sid = await take(w, b, { q1: w.o.wrong1, q2: w.o.right2, text: 'y' }, 0);
    await Assessment.updateOne({ _id: w.aid }, { $set: { closesAt: new Date(Date.now() - MIN) } });
    await signInAs(w.faculty);
    await publishResults({ assessmentId: w.aid });
    const first = await statsFor(w.aid);
    expect((await Submission.findById(sid).lean())?.rank).toBe(2);
    // Two marks more, given at once, put b level with a.
    await gradeSubmission({
      submissionId: sid,
      'item[]': [w.q.q1, w.q.q2, w.q.q3],
      'marks[]': ['2', '2', '2'],
      'comment[]': ['', '', ''],
      'criterion[]': [],
      'criterionMarks[]': [],
    });
    await statsFor(w.aid, first?.computedAt);
    expect((await Submission.findById(sid).lean())?.rank).toBe(1);
  }, 60_000);

  it('go out by themselves once closed and fully marked, in the name of whoever chose that', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveResultRules(rules(w, { release: 'on_close' }));
    const sid = await take(w, w.students[0], { q1: w.o.right1, q2: w.o.right2, text: 'x' }, 2);
    await Assessment.updateOne({ _id: w.aid }, { $set: { closesAt: new Date(Date.now() - MIN) } });
    // A hand-in still waiting for marks holds them back.
    await Submission.updateOne({ _id: sid }, { $set: { status: 'submitted' } });
    const sweep = async () => {
      const job = await computeQueue().add('assessmentSweep', {}, { jobId: `test-sweep-${crypto.randomUUID()}` });
      await job.waitUntilFinished(queueEvents);
    };
    await sweep();
    expect((await Assessment.findById(w.aid).lean())?.status).toBe('published');
    await Submission.updateOne({ _id: sid }, { $set: { status: 'graded' } });
    await sweep();
    expect((await Assessment.findById(w.aid).lean())?.status).toBe('results_published');
    expect(await AuditLog.findOne({ entityId: w.aid, action: 'assessment.results_published' }).lean()).toMatchObject({
      actorId: w.faculty._id,
      reason: 'Published by its release rule',
    });
    expect(await Notification.exists({ kind: 'results.published', userId: w.students[0]._id })).toBeTruthy();
  });
});

// The text a PDF prints: pdfkit writes it as hex strings inside its compressed content streams.
function pdfText(pdf: Buffer): string {
  const parts: string[] = [];
  for (let at = pdf.indexOf('stream\n'); at !== -1; at = pdf.indexOf('stream\n', at + 1)) {
    if (pdf.subarray(at - 3, at).toString() === 'end') continue;
    const body = inflateSync(pdf.subarray(at + 7, pdf.indexOf('\nendstream', at))).toString('latin1');
    for (const match of body.matchAll(/<([\da-f]+)>/g)) parts.push(Buffer.from(match[1], 'hex').toString('latin1'));
  }
  return parts.join('');
}

// Every file in an .xlsx (a zip), read through its central directory.
function unzip(zip: Buffer): string {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const texts: string[] = [];
  for (let at = zip.readUInt32LE(end + 16), n = zip.readUInt16LE(end + 10); n > 0; n--) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const local = zip.readUInt32LE(at + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    texts.push((method === 8 ? inflateRawSync(data) : data).toString('utf8'));
    at += 46 + zip.readUInt16LE(at + 28) + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return texts.join('\n');
}

const get = (key: string) =>
  download(new Request(`http://localhost:3000/api/files/${key}`), { params: Promise.resolve({ key: key.split('/') }) });

async function madeFile(
  filter: { assessmentId: string; kind: TestFileKind; submissionId: string | null },
  after?: Date,
) {
  await expect
    .poll(
      async () => {
        const file = await TestFile.findOne(filter).lean();
        return file?.status === 'ready' && (!after || (file.madeAt?.getTime() ?? 0) > after.getTime());
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const file = await TestFile.findOne(filter).lean();
  const bytes = objects.get(file?.key ?? '');
  if (!file?.key || !bytes) throw new Error('The file was not stored.');
  return { file, key: file.key, bytes };
}

describe('files made from the results (TP-12)', () => {
  it('give a taker a scorecard and, above the threshold, a certificate anyone can check', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveResultRules(rules(w, { certificateFrom: '75' }));
    const [a, b] = w.students;
    const sid = await take(w, a, { q1: w.o.right1, q2: w.o.right2, text: ESSAY }, 2);
    await take(w, b, { q1: w.o.wrong1, q2: w.o.right2, text: 'A tree.' }, 1);
    await Assessment.updateOne({ _id: w.aid }, { $set: { closesAt: new Date(Date.now() - MIN) } });
    await signInAs(w.faculty);
    await publishResults({ assessmentId: w.aid });
    await statsFor(w.aid);
    const certificate = { assessmentId: w.aid, kind: 'certificate' } as const;
    const scorecard = { assessmentId: w.aid, kind: 'scorecard' } as const;

    // Staff export, but scorecards and certificates are for the people who took it; 50 % earns none.
    expect(await requestTestFile(form(certificate))).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(b);
    const low = await getAssessmentPage(w.aid);
    expect(low.view === 'student' && low.result?.files).toEqual({
      scorecard: { state: 'ask', failed: false },
      certificate: null,
    });
    expect(await requestTestFile(form(certificate))).toMatchObject({ code: 'FORBIDDEN' });
    expect(await requestTestFile(form({ assessmentId: w.aid, kind: 'results_xlsx' }))).toMatchObject({
      code: 'FORBIDDEN',
    });

    await signInAs(a);
    expect(await requestTestFile(form(certificate))).toMatchObject({ ok: true });
    expect(await requestTestFile(form(scorecard))).toMatchObject({ ok: true });
    const cert = await madeFile({ ...certificate, submissionId: sid });
    const card = await madeFile({ ...scorecard, submissionId: sid });
    expect(cert.key).toMatch(new RegExp(`^test-file/${w.aid}/${a._id}/[\\w-]+\\.pdf$`));
    const code = (await Submission.findById(sid).lean())?.certificateCode ?? '';
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(cert.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const printed = pdfText(cert.bytes);
    expect(printed).toContain('CERTIFICATE OF ACHIEVEMENT');
    expect(printed).toContain(a.name);
    expect(printed).toContain('and scored 100%, ranking 1st of 2 students, with the rating');
    expect(printed).toContain('Recommended.');
    expect(printed).toContain(`/v/${code}`);
    const scored = pdfText(card.bytes);
    expect(scored).toContain('Scorecard');
    expect(scored).toContain('6 / 6');
    expect(scored).toContain('Which traversal sorts a BST?');
    // The rules hide the right answers, so the scorecard does too.
    expect(scored).not.toContain('Right answer');

    const page = await getAssessmentPage(w.aid);
    expect(page.view === 'student' && page.result?.files).toEqual({
      scorecard: { state: 'ready', href: `/api/files/${card.key}`, madeAt: card.file.madeAt },
      certificate: { state: 'ready', href: `/api/files/${cert.key}`, madeAt: cert.file.madeAt },
    });
    expect(await getCertificate(code)).toMatchObject({
      name: a.name,
      pct: 100,
      band: 'Recommended',
      standing: { rank: 1, of: 2 },
      valid: true,
    });

    // The person and the test's staff download it; another taker does not.
    expect((await get(cert.key)).headers.get('location')).toBe(`https://storage.test/get/${cert.key}`);
    await signInAs(w.faculty);
    expect((await get(cert.key)).status).toBe(302);
    await signInAs(b);
    expect((await get(cert.key)).status).toBe(404);

    // A regrade to 4 / 6 (67 %) leaves the scorecard out of date and the certificate no longer earned.
    await signInAs(w.faculty);
    await gradeSubmission({
      submissionId: sid,
      'item[]': [w.q.q1, w.q.q2, w.q.q3],
      'marks[]': ['2', '2', '0'],
      'comment[]': ['', '', ''],
      'criterion[]': [],
      'criterionMarks[]': [],
    });
    await signInAs(a);
    const after = await getAssessmentPage(w.aid);
    expect(after.view === 'student' && after.result?.files).toEqual({
      scorecard: { state: 'ask', failed: false },
      certificate: null,
    });
    expect(await requestTestFile(form(certificate))).toMatchObject({ code: 'FORBIDDEN' });
    expect(await getCertificate(code)).toMatchObject({ pct: 66.67, valid: false });
    expect(await getCertificate('AAAAA-AAAAA')).toBeNull();
  }, 60_000);

  it('give the staff every result in Excel and every hand-in in one PDF, made anew on request', async () => {
    const w = await world();
    const [a, b] = w.students;
    await take(w, a, { q1: w.o.right1, q2: w.o.right2, text: ESSAY }, 2);
    await take(w, b, { q1: w.o.wrong1, q2: w.o.right2, text: 'A tree.' }, 1);
    const xlsx = { assessmentId: w.aid, kind: 'results_xlsx' } as const;
    const reports = { assessmentId: w.aid, kind: 'reports_pdf' } as const;

    await signInAs(w.hod);
    expect(await requestTestFile(form(reports))).toMatchObject({ ok: true });
    await signInAs(w.faculty);
    expect(await requestTestFile(form(xlsx))).toMatchObject({ ok: true });
    const sheet = await madeFile({ ...xlsx, submissionId: null });
    const pdf = await madeFile({ ...reports, submissionId: null });

    expect(sheet.bytes.subarray(0, 2).toString()).toBe('PK');
    const cells = unzip(sheet.bytes);
    for (const text of ['Rank', 'Percentage', a.name, b.name, a.email, 'Marked']) expect(cells).toContain(text);
    // The questions sheet waits for the analysis, which has not run.
    expect(cells).not.toContain('name="Questions"');
    const printed = pdfText(pdf.bytes);
    for (const text of ['Attempt reports', a.name, b.name, 'Which traversal sorts a BST?']) {
      expect(printed).toContain(text);
    }
    expect(pdf.bytes.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(3);

    const view = await getTestResults(w.aid);
    expect(view.files?.results_xlsx).toEqual({
      state: 'ready',
      href: `/api/files/${sheet.key}`,
      madeAt: sheet.file.madeAt,
    });
    await signInAs(a);
    expect((await get(sheet.key)).status).toBe(404);

    // Made again, the new file replaces the old one, which is deleted.
    await signInAs(w.faculty);
    await requestTestFile(form(xlsx));
    const again = await madeFile({ ...xlsx, submissionId: null }, sheet.file.madeAt ?? undefined);
    expect(again.key).not.toBe(sheet.key);
    expect(deleted).toContain(sheet.key);
    expect((await get(sheet.key)).status).toBe(404);
  }, 60_000);
});
