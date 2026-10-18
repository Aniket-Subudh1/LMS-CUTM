import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { Types } from 'mongoose';
import { createUpload } from '@/app/(app)/actions';
import { deleteCo } from '@/app/(app)/catalog/actions';
import {
  createAssessment,
  deleteAssessment,
  gradeSubmission,
  publishAssessment,
  publishResults,
  reorderItems,
  saveItem,
  updateAssessmentSettings,
} from '@/app/(app)/courses/[offeringId]/assessments/actions';
import {
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { GET as download } from '@/app/api/files/[...key]/route';
import {
  getAssessmentPage,
  getAttemptForStudent,
  getBuilder,
  getRecordsGrid,
  getSubmissionForGrading,
  listDueSoon,
  listOfferingAssessments,
  listSubmissions,
  listToGrade,
  toStudentItem,
} from '@/lib/data/assessments';
import { listRoster } from '@/lib/data/workspace';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Assessment } from '@/lib/models/assessment';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { Notification } from '@/lib/models/notification';
import { Offering, type OfferingDoc } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import { startComputeWorker } from '@/worker/jobs/compute';
import { enroll, makeAssessment, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

const { presignUpload, presignDownload } = vi.hoisted(() => ({
  presignUpload: vi.fn(async (key: string) => `https://storage.test/put/${key}`),
  presignDownload: vi.fn(async (key: string) => `https://storage.test/get/${key}`),
}));
vi.mock('@/lib/integrations/storage', () => ({ presignUpload, presignDownload, deleteObjects: vi.fn() }));

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const MIN = 60_000;
const redirectsTo = (path: string) => ({ digest: expect.stringMatching(new RegExp(`;${path};`)) });
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
// An IST wall time `minutes` from now, as <input type="datetime-local"> sends it.
const istLocal = (minutes: number) => new Date(Date.now() + minutes * MIN + 330 * MIN).toISOString().slice(0, 16);

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, AuditLog, Course, EngagementDaily, Enrollment, Notification, Offering, Submission].map(async (m) => {
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

async function world(over: Partial<OfferingDoc> = {}) {
  const coId = newId();
  const course = await makeCourse({
    cos: [{ _id: coId, code: 'CO1', statement: 'Explain the basic constructs of C.' }],
  });
  const faculty = await makeUser({ roles: ['faculty'] });
  const offering = await makeOffering({ courseId: course._id, facultyIds: [faculty._id], ...over });
  const [student, second, outsider, other, admin] = await Promise.all([
    makeUser(),
    makeUser(),
    makeUser(),
    makeUser({ roles: ['faculty'] }),
    makeUser({ roles: ['admin'] }),
  ]);
  const hod = await makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId });
  await Promise.all([enroll(offering._id, student._id), enroll(offering._id, second._id)]);
  return {
    course,
    coId,
    faculty,
    offering,
    offeringId: String(offering._id),
    student,
    second,
    outsider,
    other,
    admin,
    hod,
  };
}
type World = Awaited<ReturnType<typeof world>>;

// One answer, a number with a margin and a written answer with a two-criterion rubric (11 marks).
function questions(coIds: Types.ObjectId[]) {
  const wrong = newId();
  const right = newId();
  const pick = {
    _id: newId(),
    type: 'mcq',
    prompt: doc('Which is a valid identifier?'),
    maxMarks: 2,
    coIds,
    options: [
      { _id: wrong, text: '2nd_value' },
      { _id: right, text: '_total' },
    ],
    answer: { optionId: right },
  };
  const num = {
    _id: newId(),
    type: 'numeric',
    prompt: doc('A value?'),
    maxMarks: 3,
    coIds,
    answer: { value: 271828.5, tolerance: 0.5 },
  };
  const loop = newId();
  const style = newId();
  const essay = {
    _id: newId(),
    type: 'text',
    prompt: doc('Write a loop.'),
    maxMarks: 6,
    coIds,
    rubric: [
      { _id: loop, criterion: 'Correct loop', maxMarks: 4 },
      { _id: style, criterion: 'Readable', maxMarks: 2 },
    ],
  };
  return { pick, num, essay, right, wrong, loop, style };
}

async function quiz(w: World, over: Record<string, unknown> = {}) {
  const q = questions([w.coId]);
  const a = await makeAssessment({
    offeringId: w.offering._id,
    items: [q.pick, q.num, q.essay],
    maxMarks: 11,
    ...over,
  });
  return { ...q, a, aid: String(a._id) };
}

async function started(w: World, aid: string, who = w.student) {
  await signInAs(who);
  await expect(startAttempt({ assessmentId: aid })).rejects.toMatchObject(
    redirectsTo(`/courses/${w.offeringId}/assessments/${aid}/attempt`),
  );
  const attempt = await Submission.findOne({ assessmentId: aid, studentId: who._id, status: 'in_progress' }).lean();
  if (!attempt) throw new Error('no attempt');
  return String(attempt._id);
}

describe('building an assessment (T4)', () => {
  it('creates a draft with the type’s settings and opens the builder next', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const result = await createAssessment({
      offeringId: w.offeringId,
      mode: 'quiz',
      title: 'Quiz 2 · Arrays',
      opensAt: istLocal(60),
      closesAt: istLocal(120),
    });
    expect(result.ok).toBe(true);
    const created = await Assessment.findOne({ offeringId: w.offering._id }).lean();
    expect(created).toMatchObject({
      status: 'draft',
      durationMin: 30,
      attemptsAllowed: 1,
      shuffleItems: true,
      maxMarks: 0,
    });
    expect(result).toEqual({ ok: true, data: { next: `/courses/${w.offeringId}/assessments/${created?._id}/edit` } });
    expect(
      await createAssessment({
        offeringId: w.offeringId,
        mode: 'quiz',
        title: 'Bad',
        opensAt: istLocal(60),
        closesAt: istLocal(30),
      }),
    ).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { closesAt: ['Close it after it opens.'] },
    });
  });

  it('is for the class’s teachers only', async () => {
    const w = await world();
    const input = {
      offeringId: w.offeringId,
      mode: 'quiz' as const,
      title: 'Quiz',
      opensAt: istLocal(60),
      closesAt: istLocal(120),
    };
    await signInAs(w.student);
    expect(await createAssessment(input)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    for (const who of [w.other, w.hod]) {
      await signInAs(who);
      await expect(createAssessment(input)).rejects.toThrow(NOT_FOUND);
    }
    const { aid } = await quiz(w, { status: 'draft' });
    await signInAs(w.hod);
    expect((await getBuilder(aid)).canEdit).toBe(false);
    await expect(
      saveItem({
        assessmentId: aid,
        type: 'text',
        prompt: JSON.stringify(doc('Q')),
        maxMarks: '2',
        'cos[]': [String(w.coId)],
        'criterion[]': [],
        'criterionMarks[]': [],
      }),
    ).rejects.toThrow(NOT_FOUND);
    await signInAs(w.outsider);
    await expect(getBuilder(aid)).rejects.toThrow(NOT_FOUND);
  });

  it('saves a question with the course’s outcomes, a type of the mode and a rubric that adds up', async () => {
    const w = await world();
    const a = await makeAssessment({ offeringId: w.offering._id, mode: 'assignment', status: 'draft' });
    const aid = String(a._id);
    const base = {
      offeringId: w.offeringId,
      assessmentId: aid,
      prompt: JSON.stringify(doc('Explain.')),
      maxMarks: '6',
    };
    await signInAs(w.faculty);
    expect(
      await saveItem({ ...base, type: 'text', 'cos[]': [], 'criterion[]': [], 'criterionMarks[]': [] }),
    ).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { 'cos[]': ['Tick at least one course outcome.'] },
    });
    expect(
      await saveItem({ ...base, type: 'text', 'cos[]': [String(newId())], 'criterion[]': [], 'criterionMarks[]': [] }),
    ).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { 'cos[]': ['Pick outcomes of this course only.'] },
    });
    expect(
      await saveItem({ ...base, type: 'mcq', 'cos[]': [String(w.coId)], 'option[]': ['a', 'b'], correct: '0' }),
    ).toMatchObject({ code: 'VALIDATION' });
    expect(
      await saveItem({
        ...base,
        type: 'text',
        'cos[]': [String(w.coId)],
        'criterion[]': ['Loop', 'Style'],
        'criterionMarks[]': ['4', '1'],
      }),
    ).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { 'criterion[]': ['The criteria add up to 5; the question has 6 marks.'] },
    });
    expect(
      await saveItem({
        ...base,
        type: 'text',
        'cos[]': [String(w.coId)],
        'criterion[]': ['Loop', 'Style'],
        'criterionMarks[]': ['4', '2'],
      }),
    ).toEqual({ ok: true, data: undefined });
    const saved = await Assessment.findById(aid).lean();
    expect(saved?.maxMarks).toBe(6);
    const itemId = String(saved?.items[0]._id);
    await saveItem({
      ...base,
      itemId,
      type: 'file',
      maxMarks: '2.5',
      'cos[]': [String(w.coId)],
      'criterion[]': [],
      'criterionMarks[]': [],
    });
    const edited = await Assessment.findById(aid).lean();
    expect(edited?.items.map((i) => [String(i._id), i.type])).toEqual([[itemId, 'file']]);
    expect(edited?.maxMarks).toBe(2.5);
  });

  it('reorders the questions, and fixes them once a student has started', async () => {
    const w = await world();
    const { aid, pick, num, essay } = await quiz(w);
    await signInAs(w.faculty);
    const ids = [essay, pick, num].map((i) => String(i._id));
    expect(await reorderItems({ assessmentId: aid, 'ids[]': ids })).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await Assessment.findById(aid).lean())?.items.map((i) => String(i._id))).toEqual(ids);
    await started(w, aid);
    await signInAs(w.faculty);
    expect(await reorderItems({ assessmentId: aid, 'ids[]': ids.reverse() })).toMatchObject({
      code: 'CONFLICT',
      message: 'Questions cannot change after students have started.',
    });
    // Only the title and dates change now; the time limit stays.
    expect(
      await updateAssessmentSettings({
        assessmentId: aid,
        title: 'Renamed',
        opensAt: istLocal(-60),
        closesAt: istLocal(90),
        durationMin: '5',
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(await Assessment.findById(aid).lean()).toMatchObject({ title: 'Renamed', durationMin: null });
  });

  it('publishes only when every question of a credit course has an outcome (AC-M04-01)', async () => {
    const w = await world();
    const third = await makeUser();
    await enroll(w.offering._id, third._id, 'dropped');
    const q = questions([w.coId]);
    const a = await makeAssessment({
      offeringId: w.offering._id,
      status: 'draft',
      items: [q.pick, { ...q.num, coIds: [] }],
      maxMarks: 5,
    });
    const ref = { assessmentId: String(a._id) };
    await signInAs(w.faculty);
    expect(await publishAssessment(ref)).toMatchObject({
      code: 'VALIDATION',
      message: 'Tag question 2 with a course outcome before publishing.',
    });
    await Assessment.updateOne({ _id: a._id }, { $set: { 'items.1.coIds': [w.coId] } });
    expect(await publishAssessment(ref)).toEqual({ ok: true, data: undefined });
    expect(await Assessment.findById(a._id).lean()).toMatchObject({ status: 'published' });
    expect(await AuditLog.find({ action: 'assessment.published', entityId: a._id }).lean()).toMatchObject([
      { before: { status: 'draft' }, after: { status: 'published' } },
    ]);
    const told = await Notification.find({ kind: 'assessment.published' }).lean();
    expect(told.map((n) => String(n.userId)).sort()).toEqual([String(w.student._id), String(w.second._id)].sort());
    expect(await publishAssessment(ref)).toMatchObject({ code: 'CONFLICT' });
  });

  it('deletes only a draft', async () => {
    const w = await world();
    const { aid } = await quiz(w);
    await signInAs(w.faculty);
    expect(await deleteAssessment({ assessmentId: aid })).toMatchObject({ code: 'CONFLICT' });
    await Assessment.updateOne({ _id: aid }, { $set: { status: 'draft' } });
    await expect(deleteAssessment({ assessmentId: aid })).rejects.toMatchObject(
      redirectsTo(`/courses/${w.offeringId}/assessments`),
    );
    expect(await Assessment.exists({ _id: aid })).toBeNull();
  });
});

describe('secrecy (09 §10, AC-M04-02)', () => {
  it('never puts a key in what a student receives', async () => {
    const w = await world();
    const { a, aid, right } = await quiz(w);
    const keys = [String(right), '271828.5', '"answer"', '"coIds"', 'Correct loop'];
    const read = await Assessment.findById(a._id).lean();
    if (!read) throw new Error('missing');
    const dto = JSON.stringify(read.items.map((item) => toStudentItem(item, 'seed', false)));
    for (const key of keys.slice(1)) expect(dto).not.toContain(key);
    // The correct option is one of the options, so its id is there; nothing marks it.
    expect(dto).toContain(String(right));
    await started(w, aid);
    const attempt = JSON.stringify(await getAttemptForStudent(aid));
    const page = JSON.stringify(await getAssessmentPage(aid));
    const list = JSON.stringify(await listOfferingAssessments(w.offeringId, {}, 1));
    for (const text of [attempt, page, list]) for (const key of keys.slice(1)) expect(text).not.toContain(key);
  });

  it('shows a student only their own attempt and never the hand-ins', async () => {
    const w = await world();
    const { aid } = await quiz(w);
    const submissionId = await started(w, aid);
    await signInAs(w.second);
    expect(await getAttemptForStudent(aid)).toBeNull();
    expect(
      await saveAnswer({
        submissionId,
        itemId: String(newId()),
        answer: { type: 'numeric', value: 1 },
      }),
    ).toMatchObject({ code: 'NOT_FOUND' });
    await expect(getSubmissionForGrading(aid, submissionId)).rejects.toThrow(NOT_FOUND);
    await expect(listSubmissions(aid, {}, 1)).rejects.toThrow(NOT_FOUND);
    await signInAs(w.outsider);
    await expect(listOfferingAssessments(w.offeringId, {}, 1)).rejects.toThrow(NOT_FOUND);
  });

  it('lists published assessments only, and marks only after results', async () => {
    const w = await world();
    await quiz(w, { status: 'draft' });
    const { aid } = await quiz(w);
    await Submission.create({
      assessmentId: aid,
      offeringId: w.offering._id,
      studentId: w.student._id,
      attemptNo: 1,
      status: 'graded',
      startedAt: new Date(),
      deadlineAt: new Date(),
      submittedAt: new Date(),
      total: 9,
    });
    await signInAs(w.student);
    const before = await listOfferingAssessments(w.offeringId, {}, 1);
    expect(before.rows.map((r) => [r.id, 'mine' in r ? r.mine : null])).toEqual([
      [aid, { status: 'submitted', attemptsUsed: 1, counted: null }],
    ]);
    await Assessment.updateOne({ _id: aid }, { $set: { status: 'results_published' } });
    const after = await listOfferingAssessments(w.offeringId, {}, 1);
    expect(after.rows[0]).toMatchObject({ mine: { status: 'graded', counted: 9 } });
  });
});

describe('attempting (T5)', () => {
  it('starts once, resumes on a second start and counts a quiz attempt once', async () => {
    const w = await world();
    const { aid } = await quiz(w);
    await started(w, aid);
    await started(w, aid);
    expect(await Submission.countDocuments({ assessmentId: aid })).toBe(1);
    expect(
      await EngagementDaily.findOne({ offeringId: w.offering._id, studentId: w.student._id }).lean(),
    ).toMatchObject({ quizAttempts: 1 });
    const closed = await quiz(w, {
      opensAt: new Date(Date.now() - 2 * 60 * MIN),
      closesAt: new Date(Date.now() - 60 * MIN),
    });
    expect(await startAttempt({ assessmentId: closed.aid })).toMatchObject({
      code: 'CLOSED',
    });
    await signInAs(w.faculty);
    expect(await startAttempt({ assessmentId: aid })).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('saves an answer per question and checks its options', async () => {
    const w = await world();
    const { aid, pick, num, right } = await quiz(w);
    const submissionId = await started(w, aid);
    const save = (
      itemId: Types.ObjectId,
      answer: Parameters<typeof saveAnswer>[0] extends infer I ? (I extends { answer: infer A } ? A : never) : never,
    ) => saveAnswer({ submissionId, itemId: String(itemId), answer });
    expect(await save(pick._id, { type: 'mcq', optionId: String(right) })).toMatchObject({ ok: true });
    expect(await save(pick._id, { type: 'mcq', optionId: String(newId()) })).toMatchObject({ code: 'VALIDATION' });
    expect(await save(pick._id, { type: 'numeric', value: 1 })).toMatchObject({ code: 'VALIDATION' });
    expect(await save(num._id, { type: 'numeric', value: 271828.7 })).toMatchObject({ ok: true });
    expect(await save(num._id, { type: 'numeric', value: null })).toMatchObject({ ok: true });
    const attempt = await Submission.findById(submissionId).lean();
    expect(String(attempt?.answers?.[String(pick._id)]?.optionId)).toBe(String(right));
    expect(attempt?.answers?.[String(num._id)]).toBeUndefined();
  });

  it('hands in at the server’s deadline and keeps what was saved (AC-M04-03)', async () => {
    const w = await world();
    const { aid, pick, right } = await quiz(w);
    const submissionId = await started(w, aid);
    await saveAnswer({
      submissionId,
      itemId: String(pick._id),
      answer: { type: 'mcq', optionId: String(right) },
    });
    const deadline = new Date(Date.now() - 10_000);
    await Submission.updateOne({ _id: submissionId }, { $set: { deadlineAt: deadline } });
    expect(
      await saveAnswer({
        submissionId,
        itemId: String(pick._id),
        answer: { type: 'mcq', optionId: null },
      }),
    ).toMatchObject({ ok: false, code: 'CLOSED', message: 'Time is up — your answers were submitted.' });
    const attempt = await Submission.findById(submissionId).lean();
    expect(attempt).toMatchObject({ status: 'submitted', autoSubmitted: true, late: false, submittedAt: deadline });
    expect(attempt?.scores?.[String(pick._id)]).toMatchObject({ marks: 2, by: 'auto' });
  });

  it('marks objective questions on submit and counts the hand-in once (AC-M04-05)', async () => {
    const w = await world();
    const { aid, pick, num, essay, right } = await quiz(w);
    const submissionId = await started(w, aid);
    await saveAnswer({
      submissionId,
      itemId: String(pick._id),
      answer: { type: 'mcq', optionId: String(right) },
    });
    await saveAnswer({
      submissionId,
      itemId: String(num._id),
      answer: { type: 'numeric', value: 271829.2 },
    });
    const summary = `/courses/${w.offeringId}/assessments/${aid}`;
    await expect(submitAttempt({ submissionId })).rejects.toMatchObject(redirectsTo(summary));
    await expect(submitAttempt({ submissionId })).rejects.toMatchObject(redirectsTo(summary));
    const attempt = await Submission.findById(submissionId).lean();
    expect(attempt).toMatchObject({ status: 'submitted', total: null, autoSubmitted: false, late: false });
    expect(attempt?.scores?.[String(pick._id)]?.marks).toBe(2);
    expect(attempt?.scores?.[String(num._id)]?.marks).toBe(0);
    expect(attempt?.scores?.[String(essay._id)]).toBeUndefined();
    expect(
      await EngagementDaily.findOne({ offeringId: w.offering._id, studentId: w.student._id }).lean(),
    ).toMatchObject({
      quizAttempts: 1,
      submissions: 1,
      onTimeSubmissions: 1,
    });
    const objective = questions([w.coId]);
    const only = await makeAssessment({ offeringId: w.offering._id, items: [objective.pick], maxMarks: 2 });
    const second = await started(w, String(only._id));
    await expect(submitAttempt({ submissionId: second })).rejects.toMatchObject(
      redirectsTo(`/courses/${w.offeringId}/assessments/${only._id}`),
    );
    expect(await Submission.findById(second).lean()).toMatchObject({ status: 'graded', total: 0 });
  });

  it('takes uploads only for a running attempt, of the student’s own files (AC-M04-04)', async () => {
    const w = await world();
    const file = { _id: newId(), type: 'file', prompt: doc('Upload your sheet.'), maxMarks: 5, coIds: [w.coId] };
    const a = await makeAssessment({ offeringId: w.offering._id, mode: 'assignment', items: [file], maxMarks: 5 });
    const aid = String(a._id);
    const upload = {
      purpose: 'submission' as const,
      contextId: aid,
      fileName: 'page 1.pdf',
      contentType: 'application/pdf',
      size: 24_000_000,
    };
    await signInAs(w.student);
    expect(await createUpload(upload)).toMatchObject({ code: 'FORBIDDEN' });
    const submissionId = await started(w, aid);
    const ticket = await createUpload(upload);
    if (!ticket.ok) throw new Error(ticket.message);
    expect(ticket.data.key).toMatch(new RegExp(`^submission/${aid}/${w.student._id}/`));
    expect(await createUpload({ ...upload, contentType: 'image/heic', fileName: 'photo.heic' })).toMatchObject({
      ok: true,
    });
    const files = [{ key: ticket.data.key, fileName: 'page 1.pdf', contentType: 'application/pdf', size: 24_000_000 }];
    const save = (f: typeof files) =>
      saveAnswer({
        submissionId,
        itemId: String(file._id),
        answer: { type: 'file', files: f },
      });
    expect(await save(files)).toMatchObject({ ok: true });
    expect(await save([{ ...files[0], key: `submission/${aid}/${w.second._id}/x.pdf` }])).toMatchObject({
      code: 'VALIDATION',
    });
    const get = (key: string) =>
      download(new Request(`http://localhost:3000/api/files/${key}`), {
        params: Promise.resolve({ key: key.split('/') }),
      });
    expect((await get(ticket.data.key)).status).toBe(302);
    expect(presignDownload).toHaveBeenLastCalledWith(ticket.data.key, 'page 1.pdf');
    await signInAs(w.faculty);
    expect((await get(ticket.data.key)).status).toBe(302);
    await signInAs(w.second);
    expect((await get(ticket.data.key)).status).toBe(404);
  });
});

describe('grading and results (T6)', () => {
  async function handedIn(w: World, over: Record<string, unknown> = {}) {
    const q = await quiz(w, over);
    const submission = await Submission.create({
      assessmentId: q.a._id,
      offeringId: w.offering._id,
      studentId: w.student._id,
      attemptNo: 1,
      status: 'submitted',
      startedAt: new Date(Date.now() - 30 * MIN),
      deadlineAt: new Date(Date.now() - 5 * MIN),
      submittedAt: new Date(Date.now() - 10 * MIN),
      // The paper the attempt was given (M04b): the quiz's own questions.
      paper: q.a.items,
      answers: { [String(q.essay._id)]: { text: doc('for (i = 0; i < n; i++) s += a[i];') } },
      scores: { [String(q.pick._id)]: { marks: 2, by: 'auto' }, [String(q.num._id)]: { marks: 0, by: 'auto' } },
    });
    return { ...q, submissionId: String(submission._id) };
  }
  const grade = (
    w: World,
    s: Awaited<ReturnType<typeof handedIn>>,
    marks: string[],
    criteria: string[],
    comment = '',
  ) =>
    gradeSubmission({
      submissionId: s.submissionId,
      'item[]': [s.pick, s.num, s.essay].map((i) => String(i._id)),
      'marks[]': marks,
      'comment[]': ['', '', comment],
      'criterion[]': [`${s.essay._id}:${s.loop}`, `${s.essay._id}:${s.style}`],
      'criterionMarks[]': criteria,
    });

  it('marks a rubric question by its criteria, refuses marks above the maximum and audits each change (AC-M04-07)', async () => {
    const w = await world();
    const s = await handedIn(w);
    await signInAs(w.student);
    expect(await grade(w, s, ['2', '0', ''], ['3', '1'])).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(w.faculty);
    expect(await grade(w, s, ['2', '4', ''], ['3', '1'])).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { [`marks-${s.num._id}`]: ['Use 0 to 3.'] },
    });
    expect(await grade(w, s, ['2', '0', ''], ['3', ''])).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { [`marks-${s.essay._id}`]: ['Mark every criterion, or leave them all empty.'] },
    });
    expect(await grade(w, s, ['2', '0', ''], ['3', '1'], 'Name the loop counter.')).toEqual({
      ok: true,
      data: undefined,
    });
    const graded = await Submission.findById(s.submissionId).lean();
    expect(graded).toMatchObject({ status: 'graded', total: 6 });
    expect(graded?.scores?.[String(s.essay._id)]).toMatchObject({
      marks: 4,
      by: String(w.faculty._id),
      comment: 'Name the loop counter.',
    });
    expect(graded?.scores?.[String(s.pick._id)]?.by).toBe('auto');
    expect(await AuditLog.find({ action: 'submission.graded', entityId: s.submissionId }).lean()).toMatchObject([
      { before: { [String(s.essay._id)]: null }, after: { [String(s.essay._id)]: 4 } },
    ]);
    // Saving the same marks again changes nothing and writes no entry.
    await grade(w, s, ['2', '0', ''], ['3', '1'], 'Name the loop counter.');
    expect(await AuditLog.countDocuments({ action: 'submission.graded', entityId: s.submissionId })).toBe(1);
    const view = await getSubmissionForGrading(s.aid, s.submissionId);
    expect(view.items.find((item) => item.id === String(s.pick._id))?.key).toEqual({ optionIds: [String(s.right)] });
  });

  it('publishes results once the window has closed and every hand-in is marked (AC-M04-06)', async () => {
    const w = await world();
    const third = await makeUser();
    await enroll(w.offering._id, third._id);
    const s = await handedIn(w);
    await Submission.create({
      assessmentId: s.a._id,
      offeringId: w.offering._id,
      studentId: w.second._id,
      attemptNo: 1,
      status: 'in_progress',
      startedAt: new Date(Date.now() - 40 * MIN),
      deadlineAt: new Date(Date.now() - 20 * MIN),
      paper: s.a.items,
    });
    const ref = { assessmentId: s.aid };
    await signInAs(w.faculty);
    expect(await publishResults(ref)).toMatchObject({ code: 'CLOSED' });
    await Assessment.updateOne({ _id: s.a._id }, { $set: { closesAt: new Date(Date.now() - MIN) } });
    expect(await publishResults(ref)).toMatchObject({
      code: 'VALIDATION',
      message: '2 submissions still need grading.',
    });
    // The expired attempt was handed in by the publish, at its own deadline.
    expect(await Submission.findOne({ studentId: w.second._id }).lean()).toMatchObject({
      status: 'submitted',
      autoSubmitted: true,
    });
    await grade(w, s, ['2', '0', ''], ['4', '2']);
    await Submission.updateOne({ studentId: w.second._id }, { $set: { status: 'graded', total: 0 } });
    expect(await publishResults(ref)).toEqual({ ok: true, data: undefined });
    expect(await Assessment.findById(s.a._id).lean()).toMatchObject({ status: 'results_published' });
    const told = await Notification.find({ kind: 'results.published' }).lean();
    expect(told.map((n) => String(n.userId)).sort()).toEqual([String(w.student._id), String(w.second._id)].sort());
    expect(await AuditLog.countDocuments({ action: 'assessment.results_published', entityId: s.a._id })).toBe(1);

    // A regrade after publication is allowed and audited.
    expect(await grade(w, s, ['2', '1', ''], ['4', '2'])).toEqual({ ok: true, data: undefined });
    expect(
      await AuditLog.find({ action: 'submission.graded', entityId: s.submissionId }).sort({ at: 1 }).lean(),
    ).toHaveLength(2);
    await signInAs(w.student);
    const page = await getAssessmentPage(s.aid);
    expect(page).toMatchObject({ view: 'student', result: { total: 9 } });
    if (page.view !== 'student' || !page.result) throw new Error('no result');
    expect(page.result.items[2]).toMatchObject({
      marks: 6,
      criteria: [
        { criterion: 'Correct loop', marks: 4, maxMarks: 4 },
        { criterion: 'Readable', marks: 2, maxMarks: 2 },
      ],
    });
  });

  it('changes no mark and publishes nothing while marks are locked', async () => {
    const w = await world();
    const s = await handedIn(w, { closesAt: new Date(Date.now() - MIN) });
    await Offering.updateOne({ _id: w.offering._id }, { $set: { lockedAt: new Date() } });
    await signInAs(w.faculty);
    expect(await grade(w, s, ['2', '0', ''], ['4', '2'])).toMatchObject({ code: 'LOCKED' });
    expect(await publishResults({ assessmentId: s.aid })).toMatchObject({ code: 'LOCKED' });
  });

  it('lists hand-ins, the oldest first, and finds the next to grade', async () => {
    const w = await world();
    const s = await handedIn(w);
    const later = await Submission.create({
      assessmentId: s.a._id,
      offeringId: w.offering._id,
      studentId: w.second._id,
      attemptNo: 1,
      status: 'submitted',
      startedAt: new Date(),
      deadlineAt: new Date(),
      submittedAt: new Date(),
      late: true,
    });
    await signInAs(w.faculty);
    const list = await listSubmissions(s.aid, {}, 1);
    expect(list.rows.map((r) => r.id)).toEqual([s.submissionId, String(later._id)]);
    expect(list.counts).toMatchObject({ enrolled: 2, handedIn: 2, toGrade: 2, late: 1 });
    expect((await listSubmissions(s.aid, { late: true }, 1)).rows.map((r) => r.id)).toEqual([String(later._id)]);
    expect((await getSubmissionForGrading(s.aid, s.submissionId)).nextToGradeId).toBe(String(later._id));
    await signInAs(w.hod);
    expect((await getSubmissionForGrading(s.aid, s.submissionId)).canGrade).toBe(false);
  });
});

describe('records (T7)', () => {
  it('shows each student’s latest record attempt to the class’s staff', async () => {
    const w = await world();
    const item = { _id: newId(), type: 'text', prompt: doc('Write up the experiment.'), maxMarks: 10, coIds: [w.coId] };
    const lab = await makeAssessment({
      offeringId: w.offering._id,
      mode: 'lab_record',
      items: [item],
      maxMarks: 10,
      opensAt: new Date(Date.now() - 3 * 60 * MIN),
      closesAt: new Date(Date.now() - 60 * MIN),
    });
    await Submission.create({
      assessmentId: lab._id,
      offeringId: w.offering._id,
      studentId: w.student._id,
      attemptNo: 1,
      status: 'graded',
      startedAt: new Date(),
      deadlineAt: new Date(),
      submittedAt: new Date(),
      total: 8,
    });
    await quiz(w);
    await signInAs(w.faculty);
    const grid = await getRecordsGrid(w.offeringId, 1);
    expect(grid.columns.map((c) => c.id)).toEqual([String(lab._id)]);
    const cells = Object.fromEntries(grid.rows.map((r) => [r.id, r.cells[String(lab._id)]]));
    expect(cells[String(w.student._id)]).toMatchObject({ kind: 'graded', total: 8, maxMarks: 10 });
    expect(cells[String(w.second._id)]).toEqual({ kind: 'missing' });
    await signInAs(w.student);
    await expect(getRecordsGrid(w.offeringId, 1)).rejects.toThrow(NOT_FOUND);
    expect((await listOfferingAssessments(w.offeringId, { records: true }, 1)).rows.map((r) => r.id)).toEqual([
      String(lab._id),
    ]);
  });
});

describe('the hourly sweep (T8)', () => {
  it('reminds students who have not handed in, once, and hands in expired attempts', async () => {
    const w = await world();
    const { aid } = await quiz(w, { closesAt: new Date(Date.now() + 2 * 60 * MIN) });
    await Submission.create({
      assessmentId: aid,
      offeringId: w.offering._id,
      studentId: w.student._id,
      attemptNo: 1,
      status: 'graded',
      startedAt: new Date(),
      deadlineAt: new Date(),
      submittedAt: new Date(),
      total: 2,
    });
    const other = await quiz(w);
    const expired = await Submission.create({
      assessmentId: other.a._id,
      offeringId: w.offering._id,
      studentId: w.second._id,
      attemptNo: 1,
      status: 'in_progress',
      startedAt: new Date(Date.now() - 40 * MIN),
      deadlineAt: new Date(Date.now() - 10 * MIN),
      paper: other.a.items,
    });
    for (let run = 0; run < 2; run++) {
      const job = await computeQueue().add('assessmentSweep', {}, { jobId: `test-sweep-${crypto.randomUUID()}` });
      await job.waitUntilFinished(queueEvents);
    }
    const reminded = await Notification.find({
      kind: 'assessment.dueSoon',
      href: `/courses/${w.offeringId}/assessments/${aid}`,
    }).lean();
    expect(reminded.map((n) => String(n.userId))).toEqual([String(w.second._id)]);
    expect((await Assessment.findById(aid).lean())?.dueNotifiedAt).toBeInstanceOf(Date);
    expect(await Submission.findById(expired._id).lean()).toMatchObject({ status: 'submitted', autoSubmitted: true });
    expect(await EngagementDaily.findOne({ offeringId: w.offering._id, studentId: w.second._id }).lean()).toMatchObject(
      { submissions: 1 },
    );
  });
});

describe('outcomes in use (05 §3.6)', () => {
  it('keeps a course outcome that a question is tagged with', async () => {
    const w = await world();
    await quiz(w, { title: 'Quiz 2 · Arrays' });
    await signInAs(w.admin);
    expect(await deleteCo({ courseId: String(w.course._id), coId: String(w.coId) })).toMatchObject({
      code: 'CONFLICT',
      message: 'CO1 is used by questions in Quiz 2 · Arrays. Take it off those questions first.',
    });
    expect((await Course.findById(w.course._id).lean())?.cos).toHaveLength(1);
  });
});

describe('Home and the skill roster', () => {
  it('lists what is due for a student and what waits for marks for a teacher', async () => {
    const w = await world();
    const due = await quiz(w, { closesAt: new Date(Date.now() + 2 * 24 * 60 * MIN) });
    const done = await quiz(w);
    await quiz(w, { closesAt: new Date(Date.now() + 9 * 24 * 60 * MIN) });
    const elsewhere = await makeOffering();
    await makeAssessment({ offeringId: elsewhere._id });
    await Submission.create({
      assessmentId: done.a._id,
      offeringId: w.offering._id,
      studentId: w.student._id,
      attemptNo: 1,
      status: 'submitted',
      startedAt: new Date(),
      deadlineAt: new Date(),
      submittedAt: new Date(),
    });
    await signInAs(w.student);
    expect((await listDueSoon()).map((r) => r.id)).toEqual([due.aid]);
    await signInAs(w.faculty);
    expect(await listToGrade()).toEqual([expect.objectContaining({ id: done.aid, toGrade: 1 })]);
  });

  it('counts quizzes attempted and the quiz average on a skill course (SKL-02)', async () => {
    const w = await world({ category: 'skill' });
    const item = {
      _id: newId(),
      type: 'numeric',
      prompt: doc('2 + 2?'),
      maxMarks: 10,
      coIds: [],
      answer: { value: 4, tolerance: 0 },
    };
    const published = await makeAssessment({
      offeringId: w.offering._id,
      items: [item],
      maxMarks: 10,
      status: 'results_published',
    });
    const running = await makeAssessment({ offeringId: w.offering._id, items: [item], maxMarks: 10 });
    const attempt = (
      assessmentId: Types.ObjectId,
      attemptNo: number,
      total: number | null,
      status: 'in_progress' | 'graded',
    ) =>
      Submission.create({
        assessmentId,
        offeringId: w.offering._id,
        studentId: w.student._id,
        attemptNo,
        status,
        startedAt: new Date(),
        deadlineAt: new Date(),
        total,
      });
    await attempt(published._id, 1, 6, 'graded');
    await attempt(published._id, 2, 8, 'graded');
    await attempt(running._id, 1, null, 'in_progress');
    await signInAs(w.faculty);
    const roster = await listRoster(w.offeringId, 1);
    const skill = Object.fromEntries(roster.rows.map((r) => [r.email, r.skill]));
    expect(skill[w.student.email]).toMatchObject({ quizzesAttempted: 2, quizAvgPct: 80 });
    expect(skill[w.second.email]).toMatchObject({ quizzesAttempted: 0, quizAvgPct: 0 });
  });
});
