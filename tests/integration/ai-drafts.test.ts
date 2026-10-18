import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Types } from 'mongoose';
import { addFromBank } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { draftWithAi, saveBankItem } from '@/app/(app)/tests/bank/actions';
import { getBank, pickFromBank } from '@/lib/data/bank';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Assessment } from '@/lib/models/assessment';
import { BankItem } from '@/lib/models/bank-item';
import { Course } from '@/lib/models/course';
import { Notification } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import type { AiDraft } from '@/lib/schemas/bank';
import { startComputeWorker } from '@/worker/jobs/compute';
import { form, makeAssessment, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

// M04b phase E3 (TP-10): AI drafts of bank questions, with the AI replaced by these answers (06 §4.7).
const { ai } = vi.hoisted(() => ({
  ai: { configured: true, draftQuestions: vi.fn<(input: unknown) => Promise<AiDraft[] | null>>() },
}));
vi.mock('@/lib/integrations/ai', () => ({
  aiConfigured: () => ai.configured,
  draftQuestions: (input: unknown) => ai.draftQuestions(input),
}));

const draft = (over: Partial<AiDraft> = {}): AiDraft => ({
  question: 'What does *p give when p points to x?',
  options: ['The address of x', 'The value of x', 'The address of p', 'Nothing'],
  answer: '2',
  explanation: 'Dereferencing a pointer gives the value it points to.',
  difficulty: 'easy',
  bloom: 'understand',
  outcomes: ['CO1'],
  ...over,
});

let worker: ReturnType<typeof startComputeWorker>;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, BankItem, Course, Notification, Offering].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
  worker = startComputeWorker(env().REDIS_URL);
});

afterAll(async () => {
  await Promise.all([worker.close(), computeQueue().close(), mailQueue().close()]);
  await redis().quit();
});

async function world() {
  const [co1, co2] = [newId(), newId()];
  const course = await makeCourse({
    cos: [
      { _id: co1, code: 'CO1', statement: 'Explain pointers.' },
      { _id: co2, code: 'CO2', statement: 'Use files.' },
    ],
  });
  const faculty = await makeUser({ roles: ['faculty'] });
  const offering = await makeOffering({ courseId: course._id, facultyIds: [faculty._id], category: 'skill' });
  const hod = await makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId });
  return { co1: String(co1), co2: String(co2), course, faculty, hod, offeringId: String(offering._id) };
}

const ask = (fields: Record<string, string | string[]>) =>
  form({ topic: 'Pointers in C', count: '3', type: 'mcq', level: 'mixed', ...fields });

async function noticeFor(userId: Types.ObjectId) {
  await expect
    .poll(async () => Notification.exists({ userId, kind: 'bank.drafted' }), { timeout: 20_000 })
    .toBeTruthy();
  return Notification.findOne({ userId, kind: 'bank.drafted' }).lean();
}

describe('AI drafts in the question bank (TP-10)', () => {
  it('are checked as an imported row is and kept for review; only the topic, outcomes and level are sent', async () => {
    const w = await world();
    ai.configured = true;
    ai.draftQuestions.mockResolvedValueOnce([
      draft({ outcomes: ['CO1', 'CO9'] }),
      draft({ question: 'A draft with no right option', answer: '7' }),
      draft({
        question: 'Which call frees heap memory?',
        options: ['malloc', 'free | delete'],
        answer: '2',
        outcomes: ['CO2'],
      }),
    ]);
    await signInAs(w.faculty);
    expect(await draftWithAi(ask({ offeringId: w.offeringId, 'coIds[]': [w.co1] }))).toMatchObject({ ok: true });
    const notice = await noticeFor(w.faculty._id);
    expect(notice).toMatchObject({
      title: '2 AI drafts on “Pointers in C” ready to review',
      href: `/courses/${w.offeringId}/bank`,
    });
    expect(ai.draftQuestions).toHaveBeenLastCalledWith({
      topic: 'Pointers in C',
      count: 3,
      type: 'mcq',
      level: 'mixed',
      cos: [{ code: 'CO1', statement: 'Explain pointers.' }],
    });

    const drafts = await BankItem.find({ courseId: w.course._id }).sort({ createdAt: 1 }).lean();
    expect(drafts).toHaveLength(2);
    const [first, second] = drafts;
    // Only the outcomes the teacher picked are kept; an option's | cannot split it.
    expect(first).toMatchObject({
      aiDraft: true,
      topic: 'pointers in c',
      difficulty: 'easy',
      bloomLevel: 'understand',
    });
    expect(first.coIds.map(String)).toEqual([w.co1]);
    expect(String(first.answer?.optionId)).toBe(String(first.options?.[1]._id));
    expect(first.explanation).toMatchObject({ type: 'doc' });
    expect(second.coIds).toEqual([]);
    expect(second.options?.map((option) => option.text)).toEqual(['malloc', 'free / delete']);

    // A draft waits: counted apart, never offered to a test or drawn, until a teacher saves it in its dialog.
    const page = await getBank(w.offeringId, {}, 1);
    expect(page.stats).toMatchObject({ total: 0, drafts: 2 });
    expect(page.rows.map((row) => row.aiDraft)).toEqual([true, true]);
    expect(await pickFromBank(w.offeringId, ['mcq'], {})).toEqual([]);
    const quiz = await makeAssessment({ offeringId: w.offeringId, status: 'draft', createdBy: w.faculty._id });
    expect(
      await addFromBank(form({ assessmentId: String(quiz._id), 'bankItemIds[]': [String(first._id)] })),
    ).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      await saveBankItem(
        form({
          offeringId: w.offeringId,
          bankItemId: String(first._id),
          type: 'mcq',
          prompt: JSON.stringify(first.prompt),
          maxMarks: '1',
          'cos[]': [w.co1],
          'option[]': ['The address of x', 'The value of x'],
          correct: '1',
        }),
      ),
    ).toMatchObject({ ok: true });
    expect((await BankItem.findById(first._id).lean())?.aiDraft).toBe(false);
    expect((await pickFromBank(w.offeringId, ['mcq'], {})).map((row) => row.id)).toEqual([String(first._id)]);
  });

  it('are refused without the AI key, to those who only read the bank, and for another course’s outcomes', async () => {
    const w = await world();
    await signInAs(w.faculty);
    ai.configured = false;
    expect(await draftWithAi(ask({ offeringId: w.offeringId }))).toMatchObject({
      code: 'CONFLICT',
      message: 'AI suggestions are not set up.',
    });
    ai.configured = true;
    expect(await draftWithAi(ask({ offeringId: w.offeringId, 'coIds[]': [String(newId())] }))).toMatchObject({
      code: 'VALIDATION',
    });
    expect(await draftWithAi(ask({ offeringId: w.offeringId, count: '21' }))).toMatchObject({ code: 'VALIDATION' });
    await signInAs(w.hod);
    expect(await draftWithAi(ask({ offeringId: w.offeringId }))).toMatchObject({ code: 'FORBIDDEN' });
    const student = await makeUser();
    await signInAs(student);
    expect(await draftWithAi(ask({}))).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('go into a person’s own bank without outcomes, and the teacher is told when nothing could be used', async () => {
    const w = await world();
    ai.configured = true;
    ai.draftQuestions.mockResolvedValueOnce([draft({ outcomes: [] }), draft({ question: '', answer: '1' })]);
    await signInAs(w.faculty);
    expect(await draftWithAi(ask({ count: '2', type: 'mcq', level: 'easy' }))).toMatchObject({ ok: true });
    expect(await noticeFor(w.faculty._id)).toMatchObject({
      title: '1 AI draft on “Pointers in C” ready to review',
      href: '/tests/bank',
    });
    expect(await BankItem.find({ ownerId: w.faculty._id }).lean()).toMatchObject([{ aiDraft: true, coIds: [] }]);
    expect(ai.draftQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ cos: [] }));

    const other = await world();
    ai.draftQuestions.mockRejectedValueOnce(new Error('The AI service is unavailable.'));
    await signInAs(other.faculty);
    await draftWithAi(ask({ offeringId: other.offeringId }));
    expect(await noticeFor(other.faculty._id)).toMatchObject({
      title: 'The AI could not draft questions on “Pointers in C” just now. Try again in a few minutes.',
    });

    const third = await world();
    ai.draftQuestions.mockResolvedValueOnce([draft({ answer: '9' })]);
    await signInAs(third.faculty);
    await draftWithAi(ask({ offeringId: third.offeringId }));
    expect(await noticeFor(third.faculty._id)).toMatchObject({
      title: 'The AI’s drafts on “Pointers in C” could not be used. Try again, perhaps with a narrower topic.',
    });
    expect(await BankItem.countDocuments({ courseId: third.course._id })).toBe(0);
  });
});
