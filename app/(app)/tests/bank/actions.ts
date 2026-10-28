'use server';

import { refresh } from 'next/cache';
import { Types } from 'mongoose';
import { action } from '@/lib/action';
import { requireBankEditor, requireManage, type BankAccess } from '@/lib/auth/access';
import { requireOfferedLanguages } from '@/lib/data/code';
import { csvItem, questionOf, storedItem } from '@/lib/data/questions';
import { db } from '@/lib/db';
import { formatCsvErrors, parseBankCsv } from '@/lib/domain/csv';
import { plainText } from '@/lib/domain/rich-text';
import { AppError, csvRejected } from '@/lib/errors';
import { aiConfigured, suggestItemTags as askItemTags } from '@/lib/integrations/ai';
import { Assessment } from '@/lib/models/assessment';
import { BankItem } from '@/lib/models/bank-item';
import { Course } from '@/lib/models/course';
import { Offering } from '@/lib/models/offering';
import { queueDraftQuestions } from '@/lib/queue';
import { limit } from '@/lib/rate-limit';
import { SuggestItemTags } from '@/lib/schemas/ai';
import { BANK_LIMITS, BankItemRef, CopyToBank, DraftQuestions, ImportBankCsv, SaveBankItem } from '@/lib/schemas/bank';

const STAFF = ['admin', 'faculty'] as const;

// TP-05: a course bank's questions name only that course's outcomes; a personal bank's name none.
async function courseCos(bank: BankAccess): Promise<Map<string, string>> {
  if (!bank.courseId) return new Map();
  const course = await Course.findById(bank.courseId, { 'cos._id': 1, 'cos.code': 1 }).lean();
  return new Map((course?.cos ?? []).map((co) => [String(co._id), co.code]));
}

async function requireRoom(bank: BankAccess, adding: number) {
  if ((await BankItem.countDocuments(bank.filter)) + adding > BANK_LIMITS.perBank) {
    throw new AppError('CONFLICT', `A bank holds at most ${BANK_LIMITS.perBank.toLocaleString('en-IN')} questions.`);
  }
}

export const saveBankItem = action({ input: SaveBankItem, roles: STAFF }, async (input, viewer) => {
  const bank = await requireBankEditor(viewer, input.offeringId);
  await db();
  const known = await courseCos(bank);
  if (input.coIds.some((id) => !known.has(id))) {
    const message = bank.courseId ? 'Pick outcomes of this course only.' : 'Your own bank has no course outcomes.';
    throw new AppError('VALIDATION', message, { 'cos[]': [message] });
  }
  await requireOfferedLanguages([input]);
  const item = storedItem(input);
  if (input.bankItemId) {
    // Saving an AI draft in its dialog is its review: it is accepted (TP-10).
    const written = await BankItem.updateOne(
      { _id: input.bankItemId, ...bank.filter },
      { $set: { ...item, aiDraft: false } },
    );
    if (written.matchedCount === 0) throw new AppError('NOT_FOUND', 'That question was deleted. Reload the page.');
  } else {
    await requireRoom(bank, 1);
    await BankItem.create({ ...bank.filter, ...item, createdBy: viewer.id });
  }
  refresh();
});

// TP-10: the AI drafts questions into the bank, in the worker (06 §6); they wait there as AI drafts until reviewed.
// Only the topic, the chosen outcomes' statements and the level are sent (09 §12). Limited as AI suggestions (09 §4).
export const draftWithAi = action({ input: DraftQuestions, roles: STAFF }, async (input, viewer) => {
  const bank = await requireBankEditor(viewer, input.offeringId);
  if (!aiConfigured()) throw new AppError('CONFLICT', 'AI suggestions are not set up.');
  await db();
  const known = await courseCos(bank);
  if (input['coIds[]'].some((id) => !known.has(id))) {
    throw new AppError('VALIDATION', 'Pick outcomes of this course only.', {
      'coIds[]': ['Pick outcomes of this course only.'],
    });
  }
  await requireRoom(bank, input.count);
  await limit('ai', viewer.id, 30, 60 * 60_000);
  await queueDraftQuestions({
    into:
      'courseId' in bank.filter ? { courseId: String(bank.filter.courseId) } : { ownerId: String(bank.filter.ownerId) },
    offeringId: input.offeringId ?? null,
    requestedBy: viewer.id,
    topic: input.topic,
    count: input.count,
    type: input.type,
    level: input.level,
    coIds: input['coIds[]'],
  });
});

// M09 (CPP-07): outcomes and a Bloom level for the question being written, from the dialog's unsaved text; nothing is
// stored, the teacher reviews and saves. In the builder the test gives the class (whoever manages it), in a course bank
// the class gives the course. Only the question's words and the course's outcomes are sent (09 §12).
export const suggestItemTags = action({ input: SuggestItemTags, roles: STAFF }, async (input, viewer) => {
  let offeringId = input.offeringId;
  if (input.assessmentId) {
    await requireManage(viewer, input.assessmentId);
    const test = await Assessment.findById(input.assessmentId, { offeringId: 1 }).lean();
    offeringId = test?.offeringId ? String(test.offeringId) : undefined;
  }
  if (!offeringId) throw new AppError('CONFLICT', 'Only a course’s questions have course outcomes.');
  const bank = await requireBankEditor(viewer, offeringId);
  if (!aiConfigured()) throw new AppError('CONFLICT', 'AI suggestions are not set up.');
  await db();
  const course = await Course.findById(bank.courseId, { 'cos._id': 1, 'cos.code': 1, 'cos.statement': 1 }).lean();
  const cos = course?.cos ?? [];
  if (cos.length === 0) throw new AppError('CONFLICT', 'This course has no outcomes yet.');
  await limit('ai', viewer.id, 30, 60 * 60_000);
  const options = input['option[]'].map((o) => o.trim()).filter(Boolean);
  const answer = await askItemTags({
    promptText: [plainText(input.prompt), ...options.map((o, i) => `Option ${i + 1}: ${o}`)].join('\n'),
    cos: cos.map((co) => ({ code: co.code, statement: co.statement })),
  });
  if (!answer) return null;
  const idOf = new Map(cos.map((co) => [co.code, String(co._id)]));
  return {
    coIds: answer.coCodes.flatMap((code) => idOf.get(code) ?? []),
    bloomLevel: answer.bloomLevel,
    rationale: answer.rationale,
  };
});

// Papers keep their own copies, so a deleted bank question changes no attempt (TP-05).
export const deleteBankItem = action({ input: BankItemRef, roles: STAFF }, async (input, viewer) => {
  const bank = await requireBankEditor(viewer, input.offeringId);
  await db();
  await BankItem.deleteOne({ _id: input.bankItemId, ...bank.filter });
  refresh();
});

// 06 §8.6: every row is checked before any is saved; CO codes must be the course's.
export const importBankCsv = action({ input: ImportBankCsv, roles: STAFF }, async (input, viewer) => {
  const bank = await requireBankEditor(viewer, input.offeringId);
  const parsed = parseBankCsv(await input.file.text());
  if (!parsed.ok) throw csvRejected(formatCsvErrors(parsed.errors));
  await db();
  const idOf = new Map([...(await courseCos(bank))].map(([id, code]) => [code, id]));
  const errors: string[] = [];
  const items = parsed.rows.flatMap((row) => {
    const unknown = row.coCodes.filter((code) => !idOf.has(code));
    if (unknown.length > 0) {
      errors.push(
        bank.courseId
          ? `Row ${row.row}: ${unknown.join(', ')} ${unknown.length === 1 ? 'is not an outcome' : 'are not outcomes'} of this course.`
          : `Row ${row.row}: your own bank has no course outcomes; leave the cos column empty.`,
      );
      return [];
    }
    return [
      storedItem(
        csvItem(
          row,
          row.coCodes.flatMap((code) => idOf.get(code) ?? []),
        ),
      ),
    ];
  });
  if (errors.length > 0) throw csvRejected(errors);
  await requireRoom(bank, items.length);
  await BankItem.insertMany(items.map((item) => ({ ...bank.filter, ...item, createdBy: viewer.id })));
  refresh();
  return { added: items.length };
});

// TP-05: questions of an assessment into its bank — its course's, or for a standalone test the viewer's own.
export const copyToBank = action({ input: CopyToBank, roles: STAFF }, async (input, viewer) => {
  const { offeringId } = await requireManage(viewer, input.assessmentId);
  await db();
  const assessment = await Assessment.findById(input.assessmentId, { items: 1 }).lean();
  if (!assessment) throw new AppError('NOT_FOUND', 'Assessment not found.');
  const offering = offeringId ? await Offering.findById(offeringId, { courseId: 1 }).lean() : null;
  const filter = offering ? { courseId: offering.courseId } : { ownerId: new Types.ObjectId(viewer.id) };
  const wanted = new Set(input['itemIds[]']);
  const items = assessment.items.filter((item) => wanted.has(String(item._id)));
  if (items.length === 0) throw new AppError('NOT_FOUND', 'Those questions were deleted. Reload the page.');
  await requireRoom({ filter, courseId: offering ? String(offering.courseId) : null, canEdit: true }, items.length);
  // An unreviewed AI draft stays one in the bank (TP-10).
  await BankItem.insertMany(
    items.map((item) => ({ ...filter, ...questionOf(item), aiDraft: item.aiDraft, createdBy: viewer.id })),
  );
  return { added: items.length };
});
