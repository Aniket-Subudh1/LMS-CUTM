import 'server-only';
import { notFound } from 'next/navigation';
import { Types, type QueryFilter } from 'mongoose';
import { bankAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { teacherItemOf, type TeacherItem } from '@/lib/data/assessments';
import { escapeRegex } from '@/lib/data/courses';
import { db } from '@/lib/db';
import { plainText } from '@/lib/domain/rich-text';
import { BankItem, type BankItemDoc } from '@/lib/models/bank-item';
import { Course } from '@/lib/models/course';
import { ITEM_TYPES, type Difficulty, type ItemType } from '@/lib/schemas/assessment';
import { BANK_LIMITS, type BankFilter } from '@/lib/schemas/bank';
import { pageSize, RichTextDoc } from '@/lib/schemas/common';
import type { BLOOM_LEVELS } from '@/lib/schemas/structure';

export type BankRow = {
  id: string;
  type: ItemType;
  question: string;
  // What else there is to it: "4 options", "rubric 3 criteria", "2 blanks".
  detail: string | null;
  difficulty: Difficulty | null;
  topic: string | null;
  coCodes: string[];
  bloomLevel: (typeof BLOOM_LEVELS)[number] | null;
  usedCount: number;
};

export type BankPage = {
  canEdit: boolean;
  // The course's title, or null for the viewer's own bank.
  courseTitle: string | null;
  cos: { id: string; code: string; statement: string }[];
  topics: string[];
  stats: { total: number; easy: number; medium: number; hard: number; untagged: number };
  rows: BankRow[];
  total: number;
};

const detailOf = (doc: Pick<BankItemDoc, 'type' | 'options' | 'rubric' | 'blanks' | 'pairs'>): string | null => {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  if (doc.type === 'ordering' && doc.options) return n(doc.options.length, 'step');
  if (doc.options) return n(doc.options.length, 'option');
  if (doc.rubric && doc.rubric.length > 0) {
    return `rubric, ${doc.rubric.length} ${doc.rubric.length === 1 ? 'criterion' : 'criteria'}`;
  }
  if (doc.blanks) return n(doc.blanks.length, 'blank');
  if (doc.pairs) return n(doc.pairs.length, 'pair');
  return null;
};

type RowSource = Pick<
  BankItemDoc,
  | 'type'
  | 'prompt'
  | 'difficulty'
  | 'topic'
  | 'coIds'
  | 'bloomLevel'
  | 'usedCount'
  | 'options'
  | 'rubric'
  | 'blanks'
  | 'pairs'
> & { _id: Types.ObjectId };

const rowOf = (doc: RowSource, codeOf: ReadonlyMap<string, string>): BankRow => ({
  id: String(doc._id),
  type: doc.type,
  question: plainText(RichTextDoc.safeParse(doc.prompt).data ?? null) || 'Untitled question',
  detail: detailOf(doc),
  difficulty: doc.difficulty ?? null,
  topic: doc.topic ?? null,
  coCodes: doc.coIds.flatMap((id) => codeOf.get(String(id)) ?? []),
  bloomLevel: doc.bloomLevel ?? null,
  usedCount: doc.usedCount,
});

// TP-05: a bank's page of questions, newest first, with its counts by level and how many lack a course outcome.
export async function getBank(offeringId: string | undefined, filter: BankFilter, page: number): Promise<BankPage> {
  const viewer = await requireViewer();
  const bank = await bankAccess(viewer, offeringId);
  await db();
  const q = filter.q?.trim();
  const type = ITEM_TYPES.find((t) => t === filter.type);
  const query: QueryFilter<BankItemDoc> = {
    ...bank.filter,
    ...(type ? { type } : {}),
    ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
    ...(filter.coId ? { coIds: new Types.ObjectId(filter.coId) } : {}),
    ...(filter.topic ? { topic: filter.topic } : {}),
    ...(q ? { 'prompt.content.content.text': { $regex: escapeRegex(q), $options: 'i' } } : {}),
  };
  const [docs, total, levels, untagged, topics, course] = await Promise.all([
    BankItem.find(query, {
      type: 1,
      prompt: 1,
      difficulty: 1,
      topic: 1,
      coIds: 1,
      bloomLevel: 1,
      usedCount: 1,
      options: 1,
      rubric: 1,
      blanks: 1,
      pairs: 1,
    })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    BankItem.countDocuments(query),
    BankItem.aggregate<{ _id: Difficulty | null; n: number }>([
      { $match: bank.filter },
      { $group: { _id: '$difficulty', n: { $sum: 1 } } },
    ]),
    bank.courseId ? BankItem.countDocuments({ ...bank.filter, coIds: { $size: 0 } }) : 0,
    BankItem.distinct('topic', bank.filter),
    bank.courseId
      ? Course.findById(bank.courseId, { title: 1, 'cos._id': 1, 'cos.code': 1, 'cos.statement': 1 }).lean()
      : null,
  ]);
  const cos = (course?.cos ?? []).map((co) => ({ id: String(co._id), code: co.code, statement: co.statement }));
  const codeOf = new Map(cos.map((co) => [co.id, co.code]));
  const level = (name: Difficulty) => levels.find((l) => l._id === name)?.n ?? 0;
  return {
    canEdit: bank.canEdit,
    courseTitle: course?.title ?? null,
    cos,
    topics: topics
      .filter((t): t is string => typeof t === 'string')
      .sort()
      .slice(0, 200),
    stats: {
      total: levels.reduce((sum, l) => sum + l.n, 0),
      easy: level('easy'),
      medium: level('medium'),
      hard: level('hard'),
      untagged,
    },
    rows: docs.map((doc) => rowOf(doc, codeOf)),
    total,
  };
}

// One bank question for its edit dialog, with its key (only whoever may read the bank gets here).
export async function getBankItem(offeringId: string | undefined, bankItemId: string): Promise<TeacherItem> {
  const viewer = await requireViewer();
  const bank = await bankAccess(viewer, offeringId);
  if (!Types.ObjectId.isValid(bankItemId)) notFound();
  await db();
  const doc = await BankItem.findOne({ _id: bankItemId, ...bank.filter }).lean();
  if (!doc) notFound();
  return teacherItemOf(doc);
}

// TP-05: the builder's "Add from the bank": up to BANK_LIMITS.pick of the newest questions of the types the test
// uses, found by words or topic. The bank is the test's course's, or the viewer's own for a standalone test.
export async function pickFromBank(
  offeringId: string | null,
  types: readonly ItemType[],
  filter: { q?: string; topic?: string },
): Promise<BankRow[]> {
  const viewer = await requireViewer();
  const bank = await bankAccess(viewer, offeringId ?? undefined);
  await db();
  const q = filter.q?.trim();
  const [docs, course] = await Promise.all([
    BankItem.find(
      {
        ...bank.filter,
        type: { $in: types },
        ...(filter.topic ? { topic: filter.topic } : {}),
        ...(q ? { 'prompt.content.content.text': { $regex: escapeRegex(q), $options: 'i' } } : {}),
      },
      {
        type: 1,
        prompt: 1,
        difficulty: 1,
        topic: 1,
        coIds: 1,
        bloomLevel: 1,
        usedCount: 1,
        options: 1,
        rubric: 1,
        blanks: 1,
        pairs: 1,
      },
    )
      .sort({ createdAt: -1, _id: -1 })
      .limit(BANK_LIMITS.pick)
      .lean(),
    bank.courseId ? Course.findById(bank.courseId, { 'cos._id': 1, 'cos.code': 1 }).lean() : null,
  ]);
  const codeOf = new Map((course?.cos ?? []).map((co) => [String(co._id), co.code]));
  return docs.map((doc) => rowOf(doc, codeOf));
}
