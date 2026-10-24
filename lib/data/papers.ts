import { Types } from 'mongoose';
import { drawQuestions, shortfall, type Candidate, type DrawRule } from '@/lib/domain/papers';
import { seededShuffle } from '@/lib/domain/shuffle';
import { AppError } from '@/lib/errors';
import { BankItem } from '@/lib/models/bank-item';
import { Offering } from '@/lib/models/offering';
import { MODE_ITEM_TYPES, OBJECTIVE_TYPES, type AssessmentMode, type ItemType } from '@/lib/schemas/assessment';
import { BANK_LIMITS } from '@/lib/schemas/bank';

// M04b (TP-05). Worker-safe like attempts.ts: nothing from next/* or the session.

type Option = { _id: Types.ObjectId; text: string };
type SourceItem = {
  _id: Types.ObjectId;
  type: ItemType;
  sectionId?: Types.ObjectId | null;
  options?: Option[] | null;
  answer?: { optionIds?: Types.ObjectId[] | null } | null;
};
type DrawSpec = {
  count: number;
  easy: number;
  medium: number;
  hard: number;
  coIds: Types.ObjectId[];
  topics: string[];
  marksEach: number;
  negativeEach: number;
};
export type PaperSource<I extends SourceItem> = {
  offeringId?: Types.ObjectId | null;
  ownerIds: Types.ObjectId[];
  mode: AssessmentMode;
  items: I[];
  sections: { _id: Types.ObjectId; draw?: DrawSpec | null }[];
  shuffleItems: boolean;
  shuffleOptions: boolean;
};

const ruleOf = (draw: DrawSpec): DrawRule => ({
  count: draw.count,
  mix: { easy: draw.easy, medium: draw.medium, hard: draw.hard },
});

// Which bank a test draws from: its course's (shared by every offering of the course), or its owners' for a
// standalone test.
async function bankScope(source: { offeringId?: Types.ObjectId | null; ownerIds: Types.ObjectId[] }) {
  if (!source.offeringId) return { ownerId: { $in: source.ownerIds } };
  const offering = await Offering.findById(source.offeringId, { courseId: 1 }).lean();
  return { courseId: offering?.courseId ?? new Types.ObjectId() };
}

// The topics a drawing section can be limited to: those of the bank's reviewed questions, the most used first, with
// how many questions have each (the builder's suggestions). A bank holds at most BANK_LIMITS.perBank questions.
export async function bankTopics(source: { offeringId?: Types.ObjectId | null; ownerIds: Types.ObjectId[] }) {
  const counts = await BankItem.aggregate<{ _id: string; n: number }>([
    { $match: { ...(await bankScope(source)), topic: { $type: 'string' }, aiDraft: { $ne: true } } },
    { $group: { _id: '$topic', n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } },
    { $limit: 100 },
  ]);
  return counts.map((c) => ({ topic: c._id, questions: c.n }));
}

// The bank questions each drawing section can choose from: objective questions of a type the test's mode allows
// (a drawn question is worth the section's marks, which a rubric could not follow, A-118), matching its
// outcomes and topics. Bounded by BANK_LIMITS.perBank.
export async function sectionPools(
  source: Pick<PaperSource<SourceItem>, 'offeringId' | 'ownerIds' | 'mode' | 'sections'>,
): Promise<Map<string, Candidate[]>> {
  const scope = await bankScope(source);
  const types = MODE_ITEM_TYPES[source.mode].filter((type) => OBJECTIVE_TYPES.some((t) => t === type));
  const pools = new Map<string, Candidate[]>();
  for (const section of source.sections) {
    const draw = section.draw;
    if (!draw) continue;
    const found = await BankItem.find(
      {
        ...scope,
        type: { $in: types },
        ...(draw.coIds.length > 0 ? { coIds: { $in: draw.coIds } } : {}),
        ...(draw.topics.length > 0 ? { topic: { $in: draw.topics } } : {}),
        // TP-10: an AI draft is drawn only once a teacher has reviewed it.
        aiDraft: { $ne: true },
      },
      { difficulty: 1 },
    )
      .limit(BANK_LIMITS.perBank)
      .lean();
    pools.set(
      String(section._id),
      found.map((doc) => ({ id: String(doc._id), difficulty: doc.difficulty ?? null })),
    );
  }
  return pools;
}

// What each drawing section is short of, in words for the builder and for publishing ("Aptitude needs 2 more medium
// questions in the bank"); empty when every rule can be met.
export function shortfallMessages(
  sections: readonly { _id: Types.ObjectId; title: string; draw?: DrawSpec | null }[],
  pools: ReadonlyMap<string, Candidate[]>,
): string[] {
  return sections.flatMap((section) => {
    if (!section.draw) return [];
    return shortfall(pools.get(String(section._id)) ?? [], ruleOf(section.draw)).map(
      ({ level, missing }) =>
        `${section.title} needs ${missing} more${level === 'any' ? '' : ` ${level}`} question${missing === 1 ? '' : 's'} in the bank`,
    );
  });
}

// Options in this attempt's order: shuffled when the test says so; an ordering question's steps always, and never
// left in the right order.
function arrange<I extends SourceItem>(item: I, shuffleOptions: boolean, seed: string): I {
  if (!item.options) return item;
  if (item.type === 'ordering') {
    let steps = seededShuffle(item.options, `${seed}:${item._id}`);
    const right = (item.answer?.optionIds ?? []).map(String);
    if (steps.every((step, i) => String(step._id) === right[i])) steps = [...steps.slice(1), steps[0]];
    return { ...item, options: steps };
  }
  if (shuffleOptions && (item.type === 'mcq' || item.type === 'msq')) {
    return { ...item, options: seededShuffle(item.options, `${seed}:${item._id}`) };
  }
  return item;
}

export type DrawnItem = Awaited<ReturnType<typeof readBankItems>>[number];
const readBankItems = (ids: string[]) => BankItem.find({ _id: { $in: ids } }).lean();

// M04b (TP-05): the questions one attempt is given, in order: each section's own questions (shuffled when the test
// says so), then those it draws from the bank for this attempt, each worth the section's marks. Questions without a
// section come first (a test without sections). The same seed gives the same paper. CONFLICT when the bank cannot
// meet a rule any more (a question was deleted after publishing).
export async function buildPaper<I extends SourceItem>(
  source: PaperSource<I>,
  seed: string,
): Promise<{
  paper: (I | (DrawnItem & { sectionId: Types.ObjectId; bankItemId: Types.ObjectId }))[];
  drawn: string[];
}> {
  const pools = await sectionPools(source);
  const groups: { sectionId: Types.ObjectId | null; draw: DrawSpec | null }[] = [
    { sectionId: null, draw: null },
    ...source.sections.map((section) => ({ sectionId: section._id, draw: section.draw ?? null })),
  ];
  const taken = new Set<string>();
  const picks = new Map<string, string[]>();
  for (const group of groups) {
    if (!group.sectionId || !group.draw) continue;
    const pool = (pools.get(String(group.sectionId)) ?? []).filter((candidate) => !taken.has(candidate.id));
    const rule = ruleOf(group.draw);
    if (shortfall(pool, rule).length > 0) {
      throw new AppError(
        'CONFLICT',
        'This test cannot start: its question bank has too few questions now. Tell whoever set it.',
      );
    }
    const picked = drawQuestions(pool, rule, `${seed}:${group.sectionId}`).map((candidate) => candidate.id);
    picked.forEach((id) => taken.add(id));
    picks.set(String(group.sectionId), picked);
  }
  const drawnDocs = taken.size > 0 ? await readBankItems([...taken]) : [];
  const drawnOf = new Map(drawnDocs.map((doc) => [String(doc._id), doc]));
  const paper: (I | (DrawnItem & { sectionId: Types.ObjectId; bankItemId: Types.ObjectId }))[] = [];
  for (const group of groups) {
    const own = source.items.filter((item) => String(item.sectionId ?? null) === String(group.sectionId));
    const ordered = source.shuffleItems ? seededShuffle(own, `${seed}:${String(group.sectionId)}`) : own;
    paper.push(...ordered.map((item) => arrange(item, source.shuffleOptions, seed)));
    if (!group.sectionId || !group.draw) continue;
    const { marksEach, negativeEach } = group.draw;
    for (const id of picks.get(String(group.sectionId)) ?? []) {
      const doc = drawnOf.get(id);
      if (!doc) throw new AppError('CONFLICT', 'A question changed while your paper was drawn. Try again.');
      paper.push(
        arrange(
          { ...doc, sectionId: group.sectionId, bankItemId: doc._id, maxMarks: marksEach, negativeMarks: negativeEach },
          source.shuffleOptions,
          seed,
        ),
      );
    }
  }
  return { paper, drawn: [...taken] };
}
