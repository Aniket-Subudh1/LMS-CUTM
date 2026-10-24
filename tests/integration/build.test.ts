import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import {
  addFromBank,
  deleteSection,
  gradeSubmission,
  publishAssessment,
  saveItem,
  saveSection,
  setExtraTime,
} from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { copyToBank, deleteBankItem, importBankCsv, saveBankItem } from '@/app/(app)/tests/bank/actions';
import {
  enterSection,
  flagItem,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { getAttemptForStudent, getBuilder, getSubmissionForGrading } from '@/lib/data/assessments';
import { getBank } from '@/lib/data/bank';
import { db } from '@/lib/db';
import { Assessment } from '@/lib/models/assessment';
import { AuditLog } from '@/lib/models/audit-log';
import { BankItem } from '@/lib/models/bank-item';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { mailQueue, redis } from '@/lib/queue';
import { enroll, makeAssessment, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const MIN = 60_000;
const prompt = (text: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, AuditLog, BankItem, Course, Enrollment, Offering, Submission].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
});

afterAll(async () => {
  await mailQueue().close();
  await redis().quit();
});

// A non-credit course (no CO needed) with CO1 and CO2, taught by `faculty`, with two students and a head of
// department; and a draft quiz in it with no questions.
async function world() {
  const co1 = newId();
  const co2 = newId();
  const course = await makeCourse({
    cos: [
      { _id: co1, code: 'CO1', statement: 'Explain.' },
      { _id: co2, code: 'CO2', statement: 'Apply.' },
    ],
  });
  const faculty = await makeUser({ roles: ['faculty'] });
  const offering = await makeOffering({ courseId: course._id, facultyIds: [faculty._id], category: 'skill' });
  const [student, second] = await Promise.all([makeUser({ rollNo: `R${newId().toHexString()}` }), makeUser()]);
  const hod = await makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId });
  await Promise.all([enroll(offering._id, student._id), enroll(offering._id, second._id)]);
  const quiz = await makeAssessment({ offeringId: offering._id, status: 'draft', createdBy: faculty._id });
  return {
    co1,
    co2,
    course,
    faculty,
    offering,
    offeringId: String(offering._id),
    student,
    second,
    hod,
    aid: String(quiz._id),
  };
}
type World = Awaited<ReturnType<typeof world>>;

async function bankQuestion(w: World, difficulty: 'easy' | 'medium' | 'hard', topic = 'arrays') {
  const right = newId();
  return BankItem.create({
    courseId: w.course._id,
    type: 'mcq',
    prompt: doc(`A ${difficulty} question`),
    maxMarks: 1,
    coIds: [w.co1],
    difficulty,
    topic,
    options: [
      { _id: newId(), text: 'No' },
      { _id: right, text: 'Yes' },
    ],
    answer: { optionId: right },
    createdBy: w.faculty._id,
  });
}

async function started(aid: string) {
  await expect(startAttempt({ assessmentId: aid, agree: 'true' })).rejects.toMatchObject({
    digest: expect.stringContaining('/attempt'),
  });
}

describe('the M04b question types (TP-06)', () => {
  it('stores true or false, blanks, matching and ordering with their keys', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const base = { assessmentId: w.aid, maxMarks: '2', 'cos[]': [] };
    for (const input of [
      { ...base, type: 'true_false', prompt: prompt('A stack is LIFO.'), truth: 'true' },
      {
        ...base,
        type: 'fill_blank',
        prompt: prompt('Fill in the blanks.'),
        template: 'A function that calls itself is ___; the case that stops it is the ___ case.',
        'accepted[]': ['recursive | Recursion', 'base'],
        partialCredit: 'true',
      },
      {
        ...base,
        type: 'matching',
        prompt: prompt('Match.'),
        'left[]': ['Stack', 'Queue', ''],
        'right[]': ['Undo', 'Printer', ''],
      },
      {
        ...base,
        type: 'ordering',
        prompt: prompt('Order the steps.'),
        'option[]': ['First', 'Second', 'Third'],
        negativeMarks: '0.5',
      },
    ] as const) {
      expect(await saveItem(input)).toEqual({ ok: true, data: undefined });
    }
    expect(
      await saveItem({
        ...base,
        type: 'fill_blank',
        prompt: prompt('x'),
        template: 'No blank here.',
        'accepted[]': [],
      }),
    ).toMatchObject({ code: 'VALIDATION', fieldErrors: { template: [expect.stringContaining('___')] } });
    const items = (await Assessment.findById(w.aid).lean())?.items ?? [];
    expect(items.map((item) => item.type)).toEqual(['true_false', 'fill_blank', 'matching', 'ordering']);
    expect(items[0].answer?.truth).toBe(true);
    expect(items[1].blanks?.map((b) => b.accepted)).toEqual([['recursive', 'Recursion'], ['base']]);
    expect(items[1].partialCredit).toBe(true);
    expect(items[2].pairs?.map((p) => [p.left, p.right])).toEqual([
      ['Stack', 'Undo'],
      ['Queue', 'Printer'],
    ]);
    expect(items[2].pairs?.every((p) => !p._id.equals(p.rightId))).toBe(true);
    expect(items[3].answer?.optionIds?.map(String)).toEqual(items[3].options?.map((o) => String(o._id)));
    expect(items[3].negativeMarks).toBe(0.5);
    expect((await Assessment.findById(w.aid).lean())?.maxMarks).toBe(8);
  });
});

describe('sections (TP-06)', () => {
  it('takes in the questions there are, counts drawn marks, and goes only when empty', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveItem({
      assessmentId: w.aid,
      type: 'true_false',
      prompt: prompt('Q'),
      maxMarks: '1',
      'cos[]': [],
      truth: 'false',
    });
    expect(
      await saveSection({
        assessmentId: w.aid,
        'drawCos[]': [],
        title: 'Aptitude',
        locked: 'true',
        durationMin: '15',
        passage: '',
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(
      await saveSection({
        assessmentId: w.aid,
        title: 'Drawn',
        drawCount: '4',
        easy: '50',
        medium: '50',
        hard: '0',
        marksEach: '2',
        negativeEach: '0.5',
        'drawCos[]': [String(w.co1)],
        drawTopics: 'Arrays, loops',
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(
      await saveSection({
        assessmentId: w.aid,
        'drawCos[]': [],
        title: 'Bad mix',
        drawCount: '2',
        marksEach: '1',
        easy: '40',
      }),
    ).toMatchObject({ code: 'VALIDATION', fieldErrors: { easy: [expect.any(String)] } });
    const read = await Assessment.findById(w.aid).lean();
    const [aptitude, drawn] = read?.sections ?? [];
    expect(read?.items[0].sectionId?.equals(aptitude._id)).toBe(true);
    expect(drawn.draw).toMatchObject({
      count: 4,
      easy: 50,
      medium: 50,
      marksEach: 2,
      negativeEach: 0.5,
      topics: ['arrays', 'loops'],
    });
    expect(read?.maxMarks).toBe(9);
    expect(await deleteSection({ assessmentId: w.aid, sectionId: String(aptitude._id) })).toMatchObject({
      code: 'CONFLICT',
    });
    expect(await deleteSection({ assessmentId: w.aid, sectionId: String(drawn._id) })).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await Assessment.findById(w.aid).lean())?.maxMarks).toBe(1);
  });
});

describe('the question bank (TP-05)', () => {
  it('is the course’s for every offering, edited by its teachers and read by the head of department', async () => {
    const w = await world();
    const otherOffering = await makeOffering({ courseId: w.course._id, facultyIds: [w.faculty._id] });
    const fields = {
      type: 'mcq' as const,
      prompt: prompt('Which is LIFO?'),
      maxMarks: '1',
      'option[]': ['Queue', 'Stack'],
      correct: '1',
    };
    await signInAs(w.faculty);
    expect(await saveBankItem({ ...fields, offeringId: w.offeringId, 'cos[]': [String(newId())] })).toMatchObject({
      code: 'VALIDATION',
    });
    expect(
      await saveBankItem({
        ...fields,
        offeringId: w.offeringId,
        'cos[]': [String(w.co1)],
        difficulty: 'easy',
        topic: 'Stacks',
      }),
    ).toEqual({ ok: true, data: undefined });
    const shared = await getBank(String(otherOffering._id), {}, 1);
    expect(shared).toMatchObject({
      canEdit: true,
      total: 1,
      stats: { total: 1, easy: 1 },
      rows: [{ coCodes: ['CO1'], topic: 'stacks' }],
    });
    expect(await saveBankItem({ ...fields, 'cos[]': [String(w.co1)] })).toMatchObject({ code: 'VALIDATION' });
    expect(await saveBankItem({ ...fields, 'cos[]': [] })).toEqual({ ok: true, data: undefined });
    expect((await getBank(undefined, {}, 1)).total).toBe(1);

    await signInAs(w.hod);
    expect((await getBank(w.offeringId, {}, 1)).canEdit).toBe(false);
    expect(await deleteBankItem({ offeringId: w.offeringId, bankItemId: shared.rows[0].id })).toMatchObject({
      code: 'FORBIDDEN',
    });
    await signInAs(w.student);
    await expect(getBank(w.offeringId, {}, 1)).rejects.toThrow(NOT_FOUND);
  });

  it('imports a CSV whole or not at all, matching CO codes', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const header = 'type,question,options,answer,marks,difficulty,topic,cos,negative';
    const good = [
      header,
      'one answer,Which is LIFO?,Queue|Stack,2,1,easy,stacks,CO1,0.25',
      'true or false,A queue is FIFO.,,true,1,easy,queues,,',
      'number,Bytes in an int?,,4 ± 0,2,medium,types,CO2,',
      'written answer,Explain recursion.,,,5,hard,recursion,CO1|CO2,',
    ].join('\n');
    const file = (text: string) => new File([text], 'bank.csv', { type: 'text/csv' });
    const bad = [header, 'one answer,Q,A|B,3,1,,,,', 'one answer,Q2,A|B,1,1,,,CO9,'].join('\n');
    const rejected = await importBankCsv({ offeringId: w.offeringId, file: file(bad) });
    expect(rejected).toMatchObject({ code: 'VALIDATION', fieldErrors: { file: [expect.stringContaining('Row 1')] } });
    expect(await BankItem.countDocuments({ courseId: w.course._id })).toBe(0);
    expect(await importBankCsv({ offeringId: w.offeringId, file: file(good) })).toEqual({
      ok: true,
      data: { added: 4 },
    });
    const imported = await BankItem.find({ courseId: w.course._id }).sort({ _id: 1 }).lean();
    expect(imported.map((item) => item.type)).toEqual(['mcq', 'true_false', 'numeric', 'text']);
    expect(imported[0].answer?.optionId?.equals(imported[0].options?.[1]._id)).toBe(true);
    expect(imported[0].negativeMarks).toBe(0.25);
    expect(imported[2].answer).toMatchObject({ value: 4, tolerance: 0 });
    expect(imported[3].coIds.map(String)).toEqual([String(w.co1), String(w.co2)]);
  });

  it('copies questions between a test and its bank', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveItem({
      assessmentId: w.aid,
      type: 'true_false',
      prompt: prompt('Q'),
      maxMarks: '1',
      'cos[]': [],
      truth: 'true',
    });
    const itemId = String((await Assessment.findById(w.aid).lean())?.items[0]._id);
    expect(await copyToBank({ assessmentId: w.aid, 'itemIds[]': [itemId] })).toEqual({ ok: true, data: { added: 1 } });
    const copied = await BankItem.findOne({ courseId: w.course._id }).lean();
    expect(copied).toMatchObject({ type: 'true_false', answer: { truth: true } });
    expect(await addFromBank({ assessmentId: w.aid, 'bankItemIds[]': [String(copied?._id)] })).toEqual({
      ok: true,
      data: { added: 1 },
    });
    expect((await Assessment.findById(w.aid).lean())?.items).toHaveLength(2);
  });
});

describe('papers drawn per attempt (TP-05)', () => {
  async function drawnTest(w: World) {
    await signInAs(w.faculty);
    await saveItem({
      assessmentId: w.aid,
      type: 'true_false',
      prompt: prompt('Fixed'),
      maxMarks: '1',
      'cos[]': [],
      truth: 'true',
    });
    await saveSection({
      assessmentId: w.aid,
      'drawCos[]': [],
      title: 'Drawn',
      drawCount: '4',
      easy: '50',
      medium: '50',
      hard: '0',
      marksEach: '2',
      negativeEach: '0.5',
    });
  }

  it('publishes only when the bank can meet every rule', async () => {
    const w = await world();
    await drawnTest(w);
    await Promise.all([bankQuestion(w, 'easy'), bankQuestion(w, 'easy'), bankQuestion(w, 'medium')]);
    expect(await publishAssessment({ assessmentId: w.aid })).toMatchObject({
      code: 'VALIDATION',
      message: 'Drawn needs 1 more medium question in the bank.',
    });
    expect((await getBuilder(w.aid)).bank).toEqual({
      shortfalls: ['Drawn needs 1 more medium question in the bank'],
      papers: 0,
      topics: [{ topic: 'arrays', questions: 3 }],
    });
    await bankQuestion(w, 'medium', 'loops');
    // The bank's topics are suggested when a section is limited to some, the most used first.
    expect((await getBuilder(w.aid)).bank).toEqual({
      shortfalls: [],
      papers: 1,
      topics: [
        { topic: 'arrays', questions: 3 },
        { topic: 'loops', questions: 1 },
      ],
    });
    expect(await publishAssessment({ assessmentId: w.aid })).toEqual({ ok: true, data: undefined });
  });

  it('gives each attempt its own frozen paper, graded from it, and counts the bank’s use', async () => {
    const w = await world();
    await drawnTest(w);
    const bank = await Promise.all([
      ...Array.from({ length: 6 }, () => bankQuestion(w, 'easy')),
      ...Array.from({ length: 6 }, () => bankQuestion(w, 'medium')),
    ]);
    await publishAssessment({ assessmentId: w.aid });
    await signInAs(w.student);
    await started(w.aid);
    await signInAs(w.second);
    await started(w.aid);
    const [one, two] = await Promise.all(
      [w.student, w.second].map((s) => Submission.findOne({ assessmentId: w.aid, studentId: s._id }).lean()),
    );
    const drawnIds = (paper: typeof one) =>
      (paper?.paper ?? []).flatMap((item) => (item.bankItemId ? [String(item.bankItemId)] : []));
    expect(one?.paper).toHaveLength(5);
    expect(drawnIds(one)).toHaveLength(4);
    expect(drawnIds(one)).not.toEqual(drawnIds(two));
    expect(
      one?.paper.filter((item) => item.bankItemId).every((item) => item.maxMarks === 2 && item.negativeMarks === 0.5),
    ).toBe(true);
    const used = await BankItem.find({ _id: { $in: bank.map((b) => b._id) } }, { usedCount: 1 }).lean();
    expect(used.reduce((sum, b) => sum + b.usedCount, 0)).toBe(8);

    // Editing the bank after the start changes no paper.
    const first = one?.paper.find((item) => item.bankItemId);
    await BankItem.updateOne({ _id: first?.bankItemId }, { $set: { maxMarks: 9, prompt: doc('Changed') } });
    expect((await Submission.findById(one?._id).lean())?.paper.find((i) => i._id.equals(first?._id))?.maxMarks).toBe(2);

    // Right on the drawn question, wrong on another drawn one (−0.5), the fixed one left: 2 − 0.5 = 1.5.
    await signInAs(w.student);
    const attempt = await getAttemptForStudent(w.aid);
    const drawn = attempt?.items.filter((item) => item.maxMarks === 2) ?? [];
    const yes = (item: (typeof drawn)[number]) => item.options?.find((o) => o.text === 'Yes')?.id ?? null;
    const no = (item: (typeof drawn)[number]) => item.options?.find((o) => o.text === 'No')?.id ?? null;
    expect(
      await saveAnswer({
        submissionId: String(one?._id),
        itemId: drawn[0].id,
        answer: { type: 'mcq', optionId: yes(drawn[0]) },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await saveAnswer({
        submissionId: String(one?._id),
        itemId: drawn[1].id,
        answer: { type: 'mcq', optionId: no(drawn[1]) },
      }),
    ).toMatchObject({ ok: true });
    await expect(submitAttempt({ submissionId: String(one?._id) })).rejects.toMatchObject({
      digest: expect.any(String),
    });
    // Every question is marked automatically, so the attempt is graded at once: 2 − 0.5 + 0 + 0 + 0.
    const graded = await Submission.findById(one?._id).lean();
    expect(graded).toMatchObject({ status: 'graded', total: 1.5 });
    expect(graded?.scores?.[drawn[0].id]?.marks).toBe(2);
    expect(graded?.scores?.[drawn[1].id]?.marks).toBe(-0.5);
    expect(graded?.scores?.[drawn[2].id]?.marks).toBe(0);
  });
});

describe('the runner rules on the server (TP-06, TP-07)', () => {
  async function sectioned(w: World) {
    await signInAs(w.faculty);
    await saveSection({ assessmentId: w.aid, 'drawCos[]': [], title: 'A', locked: 'true', durationMin: '10' });
    await saveSection({ assessmentId: w.aid, 'drawCos[]': [], title: 'B' });
    const read = await Assessment.findById(w.aid).lean();
    const [a, b] = read?.sections ?? [];
    await saveItem({
      assessmentId: w.aid,
      sectionId: String(a._id),
      type: 'true_false',
      prompt: prompt('In A'),
      maxMarks: '1',
      'cos[]': [],
      truth: 'true',
    });
    await saveItem({
      assessmentId: w.aid,
      sectionId: String(b._id),
      type: 'matching',
      prompt: prompt('In B'),
      maxMarks: '2',
      'cos[]': [],
      'left[]': ['Stack', 'Queue'],
      'right[]': ['Undo', 'Printer'],
    });
    await publishAssessment({ assessmentId: w.aid });
    return { a: String(a._id), b: String(b._id) };
  }

  it('opens the first section, closes a "no going back" one when left, and refuses its answers after', async () => {
    const w = await world();
    const { a, b } = await sectioned(w);
    await signInAs(w.student);
    await started(w.aid);
    const attempt = await getAttemptForStudent(w.aid);
    const submissionId = attempt?.submissionId ?? '';
    expect(attempt?.currentSectionId).toBe(a);
    expect(attempt?.sections.map((s) => s.state)).toEqual(['open', 'unvisited']);
    const inA = attempt?.items.find((item) => item.sectionId === a);
    const inB = attempt?.items.find((item) => item.sectionId === b);
    expect(
      await saveAnswer({
        submissionId,
        itemId: inA?.id ?? '',
        answer: { type: 'true_false', truth: true },
        spentSec: 12,
      }),
    ).toMatchObject({ ok: true });
    expect(await flagItem({ submissionId, itemId: inA?.id ?? '', flagged: true })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await enterSection({ submissionId, sectionId: b })).toEqual({ ok: true, data: undefined });
    expect(
      await saveAnswer({ submissionId, itemId: inA?.id ?? '', answer: { type: 'true_false', truth: false } }),
    ).toMatchObject({ code: 'CLOSED' });
    expect(await enterSection({ submissionId, sectionId: a })).toMatchObject({ code: 'CLOSED' });
    const after = await getAttemptForStudent(w.aid);
    expect(after?.sections.map((s) => s.state)).toEqual(['closed', 'open']);
    expect(after?.flags).toEqual([inA?.id]);
    const pairs = inB?.pairs;
    const rightFor = (text: string) => pairs?.rights.find((r) => r.text === text)?.id ?? '';
    expect(
      await saveAnswer({
        submissionId,
        itemId: inB?.id ?? '',
        answer: {
          type: 'matching',
          matches: [
            { left: pairs?.lefts[0].id ?? '', right: rightFor('Undo') },
            { left: pairs?.lefts[1].id ?? '', right: rightFor('Printer') },
          ],
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await saveAnswer({
        submissionId,
        itemId: inB?.id ?? '',
        answer: { type: 'matching', matches: [{ left: rightFor('Undo'), right: rightFor('Undo') }] },
      }),
    ).toMatchObject({ code: 'VALIDATION' });
    await expect(submitAttempt({ submissionId })).rejects.toMatchObject({ digest: expect.any(String) });
    const graded = await Submission.findById(submissionId).lean();
    expect(graded).toMatchObject({ status: 'graded', total: 3, spent: { [inA?.id ?? '']: 12 } });

    await signInAs(w.faculty);
    const view = await getSubmissionForGrading(w.aid, submissionId);
    expect(view.items.map((item) => item.sectionTitle)).toEqual(['A', 'B']);
    expect(view.submission).toMatchObject({ spent: { [inA?.id ?? '']: 12 }, flags: [inA?.id] });
  });

  it('closes a timed section at its time', async () => {
    const w = await world();
    const { a } = await sectioned(w);
    await signInAs(w.student);
    await started(w.aid);
    const attempt = await Submission.findOne({ assessmentId: w.aid, studentId: w.student._id }).lean();
    await Submission.updateOne(
      { _id: attempt?._id },
      { $set: { 'visits.0.startedAt': new Date(Date.now() - 11 * MIN) } },
    );
    const view = await getAttemptForStudent(w.aid);
    expect(view?.sections[0]).toMatchObject({ id: a, state: 'closed' });
    const inA = view?.items.find((item) => item.sectionId === a);
    expect(
      await saveAnswer({
        submissionId: String(attempt?._id),
        itemId: inA?.id ?? '',
        answer: { type: 'true_false', truth: true },
      }),
    ).toMatchObject({ code: 'CLOSED' });
  });

  it('never shows a key: no accepted blanks, no pairing, steps never in the right order', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveItem({
      assessmentId: w.aid,
      type: 'fill_blank',
      prompt: prompt('Fill.'),
      maxMarks: '1',
      'cos[]': [],
      template: 'A ___ B',
      'accepted[]': ['secretword'],
    });
    await saveItem({
      assessmentId: w.aid,
      type: 'ordering',
      prompt: prompt('Order.'),
      maxMarks: '1',
      'cos[]': [],
      'option[]': ['one', 'two'],
    });
    await saveItem({
      assessmentId: w.aid,
      type: 'true_false',
      prompt: prompt('T?'),
      maxMarks: '1',
      'cos[]': [],
      truth: 'true',
    });
    await publishAssessment({ assessmentId: w.aid });
    await signInAs(w.student);
    await started(w.aid);
    const attempt = await getAttemptForStudent(w.aid);
    const text = JSON.stringify(attempt);
    expect(text).not.toContain('secretword');
    expect(text).not.toContain('"answer"');
    const ordering = attempt?.items.find((item) => item.type === 'ordering');
    expect(ordering?.options?.map((o) => o.text)).toEqual(['two', 'one']);
  });

  it('gives one person extra time, at once on a running attempt, and audits it', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveItem({
      assessmentId: w.aid,
      type: 'true_false',
      prompt: prompt('T?'),
      maxMarks: '1',
      'cos[]': [],
      truth: 'true',
    });
    await Assessment.updateOne(
      { _id: w.aid },
      { $set: { durationMin: 30, closesAt: new Date(Date.now() + 120 * MIN) } },
    );
    await publishAssessment({ assessmentId: w.aid });
    await signInAs(w.student);
    await started(w.aid);
    const before = (await Submission.findOne({ assessmentId: w.aid, studentId: w.student._id }).lean())?.deadlineAt;
    await signInAs(w.faculty);
    expect(await setExtraTime({ assessmentId: w.aid, who: 'nobody@nowhere.test', minutes: '10' })).toMatchObject({
      code: 'VALIDATION',
    });
    expect(await setExtraTime({ assessmentId: w.aid, who: w.student.email, minutes: '15' })).toEqual({
      ok: true,
      data: undefined,
    });
    const after = (await Submission.findOne({ assessmentId: w.aid, studentId: w.student._id }).lean())?.deadlineAt;
    expect((after?.getTime() ?? 0) - (before?.getTime() ?? 0)).toBe(15 * MIN);
    expect((await getBuilder(w.aid)).extraTime).toMatchObject([{ email: w.student.email, minutes: 15 }]);
    expect(await AuditLog.findOne({ action: 'assessment.extra_time', entityId: w.aid }).lean()).toMatchObject({
      before: { minutes: 0 },
      after: { minutes: 15 },
    });
  });

  it('keeps negative marks a grader leaves, and refuses lower ones', async () => {
    const w = await world();
    await signInAs(w.faculty);
    await saveItem({
      assessmentId: w.aid,
      type: 'true_false',
      prompt: prompt('T?'),
      maxMarks: '1',
      'cos[]': [],
      truth: 'true',
      negativeMarks: '0.25',
    });
    await publishAssessment({ assessmentId: w.aid });
    await signInAs(w.student);
    await started(w.aid);
    const attempt = await getAttemptForStudent(w.aid);
    const id = attempt?.items[0].id ?? '';
    await saveAnswer({
      submissionId: attempt?.submissionId ?? '',
      itemId: id,
      answer: { type: 'true_false', truth: false },
    });
    await expect(submitAttempt({ submissionId: attempt?.submissionId ?? '' })).rejects.toMatchObject({
      digest: expect.any(String),
    });
    expect(await Submission.findById(attempt?.submissionId).lean()).toMatchObject({
      total: 0,
      scores: { [id]: { marks: -0.25 } },
    });
    await signInAs(w.faculty);
    const grade = (marks: string) =>
      gradeSubmission({
        submissionId: attempt?.submissionId ?? '',
        'item[]': [id],
        'marks[]': [marks],
        'comment[]': [''],
        'criterion[]': [],
        'criterionMarks[]': [],
      });
    expect(await grade('-0.25')).toEqual({ ok: true, data: undefined });
    expect(await grade('-1')).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { [`marks-${id}`]: ['Use -0.25 to 1.'] },
    });
    expect(Types.ObjectId.isValid(id)).toBe(true);
  });
});
