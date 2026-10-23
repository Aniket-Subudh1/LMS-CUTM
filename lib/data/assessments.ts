import 'server-only';
import { notFound } from 'next/navigation';
import { Types, type QueryFilter } from 'mongoose';
import { assessmentAccess, offeringAccess, type AssessmentAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { SAVE_GRACE_MS } from '@/lib/data/attempts';
import { sectionPools, shortfallMessages } from '@/lib/data/papers';
import {
  correctText,
  figuresOf,
  givenText,
  rulesOf,
  type PaperItem,
  type ResultFigures,
  type ResultRules,
} from '@/lib/data/results';
import { getSettings } from '@/lib/data/settings';
import { escapeRegex } from '@/lib/data/courses';
import { db } from '@/lib/db';
import {
  canStart,
  countedAttempt,
  countedScore,
  sectionDeadline,
  sectionOpen,
  windowState,
  type StartCheck,
  type WindowState,
} from '@/lib/domain/attempts';
import { distinctPapers } from '@/lib/domain/papers';
import { difficultyLabel, discriminationLabel } from '@/lib/domain/results';
import { docOf } from '@/lib/domain/rich-text';
import { GAP_MS, proctorPenalty } from '@/lib/domain/proctoring';
import { roundHalfUp } from '@/lib/domain/round';
import { seededShuffle } from '@/lib/domain/shuffle';
import { earnsCertificate } from '@/lib/domain/test-files';
import { assessmentPath } from '@/lib/domain/test-links';
import { Assessment, type AssessmentDoc } from '@/lib/models/assessment';
import type { BankItemDoc } from '@/lib/models/bank-item';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Submission, type SubmissionDoc } from '@/lib/models/submission';
import { TestGrant } from '@/lib/models/test-grant';
import { TestFile, type TestFileDoc } from '@/lib/models/test-file';
import { TestStats } from '@/lib/models/test-stats';
import { User } from '@/lib/models/user';
import {
  ASSESSMENT_LIMITS,
  RECORD_MODES,
  type AssessmentMode,
  type AssessmentState,
  type AttemptPolicy,
  type CountsToward,
  type Difficulty,
  type ItemType,
  type ProctorEvent,
  type RunStatus,
  type TestFileKind,
  STAFF_FILE_KINDS,
} from '@/lib/schemas/assessment';
import { pageSize, type RichTextDoc } from '@/lib/schemas/common';
import { MAX_ENROLLMENTS, type BLOOM_LEVELS } from '@/lib/schemas/structure';
import type { UploadedFile } from '@/lib/schemas/uploads';

type BloomLevel = (typeof BLOOM_LEVELS)[number];
const DAY_MS = 86_400_000;

async function testAccess(
  assessmentId: string,
): Promise<{ viewerId: string; access: AssessmentAccess; offeringId: string | null }> {
  const viewer = await requireViewer();
  const found = await assessmentAccess(viewer, assessmentId);
  return { viewerId: viewer.id, ...found };
}

async function viewerAccess(offeringId: string) {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  return { viewer, access, canTeach: access === 'teach' || viewer.roles.includes('admin') };
}

// What the lists and pages call an assessment's state: a draft, the derived window of a published one (05 §5.1), or
// published results.
export type DisplayState = 'draft' | WindowState | 'results';
const stateOf = (a: Pick<AssessmentDoc, 'status' | 'opensAt' | 'closesAt' | 'lateUntil'>, now: Date): DisplayState =>
  a.status === 'draft'
    ? 'draft'
    : a.status === 'results_published'
      ? 'results'
      : windowState({ now, opensAt: a.opensAt, closesAt: a.closesAt, lateUntil: a.lateUntil ?? null });

export type AssessmentSummary = {
  id: string;
  title: string;
  mode: AssessmentMode;
  questions: number;
  maxMarks: number;
  opensAt: Date;
  closesAt: Date;
  lateUntil: Date | null;
  durationMin: number | null;
  attemptsAllowed: number;
  attemptPolicy: AttemptPolicy;
  shuffleItems: boolean;
  shuffleOptions: boolean;
  state: DisplayState;
};

const SUMMARY = {
  title: 1,
  mode: 1,
  maxMarks: 1,
  opensAt: 1,
  closesAt: 1,
  lateUntil: 1,
  durationMin: 1,
  attemptsAllowed: 1,
  attemptPolicy: 1,
  shuffleItems: 1,
  shuffleOptions: 1,
  status: 1,
  // M04b: a section's drawn questions count too.
  questions: { $add: [{ $size: '$items' }, { $sum: '$sections.draw.count' }] },
} as const;
type SummaryRow = Pick<AssessmentDoc, Exclude<keyof typeof SUMMARY, 'questions'>> & {
  _id: Types.ObjectId;
  questions: number;
};

function summaryOf(a: SummaryRow, now: Date): AssessmentSummary {
  return {
    id: String(a._id),
    title: a.title,
    mode: a.mode,
    questions: a.questions,
    maxMarks: a.maxMarks,
    opensAt: a.opensAt,
    closesAt: a.closesAt,
    lateUntil: a.lateUntil ?? null,
    durationMin: a.durationMin ?? null,
    attemptsAllowed: a.attemptsAllowed,
    attemptPolicy: a.attemptPolicy,
    shuffleItems: a.shuffleItems,
    shuffleOptions: a.shuffleOptions,
    state: stateOf(a, now),
  };
}

// The Assessments tab's state filter on the indexed { offeringId, status, closesAt } (A-102 bounds the rest).
function stateFilter(state: AssessmentState | undefined, now: Date): QueryFilter<AssessmentDoc> {
  const ends = { $or: [{ lateUntil: null, closesAt: { $gt: now } }, { lateUntil: { $gt: now } }] };
  if (state === 'draft') return { status: 'draft' };
  if (state === 'results') return { status: 'results_published' };
  if (state === 'upcoming') return { status: 'published', opensAt: { $gt: now } };
  if (state === 'open') return { status: 'published', opensAt: { $lte: now }, ...ends };
  if (state === 'closed') {
    return { status: 'published', $nor: [ends] };
  }
  return {};
}

export type MyAttempts = {
  // Before results are published a handed-in attempt is "submitted" whether or not it is marked (no score, 09 §10).
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded';
  attemptsUsed: number;
  counted: number | null;
};

type HandInCounts = { handedIn: number; toGrade: number };

export type AssessmentList =
  | {
      view: 'teacher';
      canTeach: boolean;
      rows: (AssessmentSummary & HandInCounts)[];
      total: number;
      enrolled: number;
    }
  | { view: 'student'; rows: (AssessmentSummary & { mine: MyAttempts })[]; total: number };

export type AssessmentListFilter = { q?: string; mode?: AssessmentMode; state?: AssessmentState; records?: boolean };

// T3: students see what is published, with their own attempts; whoever teaches or oversees sees every assessment with
// how many students handed in and how many hand-ins wait for marks (one $group over the page's ids).
export async function listOfferingAssessments(
  offeringId: string,
  filter: AssessmentListFilter,
  page: number,
): Promise<AssessmentList> {
  const { viewer, access, canTeach } = await viewerAccess(offeringId);
  await db();
  const now = new Date();
  const learn = access === 'learn';
  const q = filter.q?.trim();
  // An aggregation (for the question count) does not cast ids, so the offering id is an ObjectId here.
  const query: QueryFilter<AssessmentDoc> = {
    offeringId: new Types.ObjectId(offeringId),
    ...(filter.records ? { mode: { $in: RECORD_MODES } } : filter.mode ? { mode: filter.mode } : {}),
    ...(q ? { title: { $regex: escapeRegex(q), $options: 'i' } } : {}),
    ...stateFilter(filter.state, now),
  };
  if (learn) query.status = filter.state ? query.status : { $ne: 'draft' };
  if (learn && query.status === 'draft') return { view: 'student', rows: [], total: 0 };
  const [docs, total] = await Promise.all([
    Assessment.aggregate<SummaryRow>([
      { $match: query },
      { $sort: { closesAt: -1, _id: -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      { $project: SUMMARY },
    ]),
    Assessment.countDocuments(query),
  ]);
  if (learn) return { view: 'student', total, rows: await withMyAttempts(docs, viewer.id, now) };
  const [rows, enrolled] = await Promise.all([
    withHandIns(docs, now),
    Enrollment.countDocuments({ offeringId, status: 'active' }),
  ]);
  return { view: 'teacher', canTeach, total, enrolled, rows };
}

// A page of assessments with the viewer's own attempts: their status, and the counted marks once published.
async function withMyAttempts(
  docs: SummaryRow[],
  viewerId: string,
  now: Date,
): Promise<(AssessmentSummary & { mine: MyAttempts })[]> {
  const mine = await Submission.find(
    { assessmentId: { $in: docs.map((d) => d._id) }, studentId: viewerId },
    { assessmentId: 1, attemptNo: 1, status: 1, total: 1 },
  ).lean();
  return docs.map((doc) => {
    const attempts = mine.filter((s) => s.assessmentId.equals(doc._id));
    const published = doc.status === 'results_published';
    const handedIn = attempts.filter((s) => s.status !== 'in_progress');
    const status = attempts.some((s) => s.status === 'in_progress')
      ? 'in_progress'
      : handedIn.length === 0
        ? 'not_started'
        : published && handedIn.some((s) => s.status === 'graded')
          ? 'graded'
          : 'submitted';
    return {
      ...summaryOf(doc, now),
      mine: {
        status,
        attemptsUsed: attempts.length,
        counted: published && handedIn.length > 0 ? countedScore(attempts, doc.attemptPolicy) : null,
      },
    };
  });
}

// A page of assessments with how many people handed in and how many hand-ins wait for marks (one $group).
async function withHandIns(docs: SummaryRow[], now: Date): Promise<(AssessmentSummary & HandInCounts)[]> {
  const counts = await Submission.aggregate<{ _id: Types.ObjectId; students: Types.ObjectId[]; toGrade: number }>([
    { $match: { assessmentId: { $in: docs.map((d) => d._id) }, status: { $in: ['submitted', 'graded'] } } },
    {
      $group: {
        _id: '$assessmentId',
        students: { $addToSet: '$studentId' },
        toGrade: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
      },
    },
  ]);
  const countOf = new Map(counts.map((c) => [String(c._id), c]));
  return docs.map((doc) => {
    const count = countOf.get(String(doc._id));
    return { ...summaryOf(doc, now), handedIn: count?.students.length ?? 0, toGrade: count?.toGrade ?? 0 };
  });
}

export type TestListView = 'own' | 'take';

export type TestList =
  | {
      view: 'own';
      canCreate: true;
      rows: (AssessmentSummary & HandInCounts & { joined: number })[];
      total: number;
    }
  | { view: 'take'; canCreate: boolean; rows: (AssessmentSummary & { mine: MyAttempts })[]; total: number };

// TP-02: the Tests page. Faculty and admins see the standalone tests they own (an admin sees every one) with who
// joined and handed in; everyone sees the tests a share link let them into, newest first.
export async function listTests(view: TestListView, filter: AssessmentListFilter, page: number): Promise<TestList> {
  const viewer = await requireViewer();
  const canCreate = viewer.roles.some((r) => r === 'faculty' || r === 'admin');
  await db();
  const now = new Date();
  if (view === 'own' && canCreate) {
    const q = filter.q?.trim();
    const query: QueryFilter<AssessmentDoc> = {
      offeringId: null,
      ...(viewer.roles.includes('admin') ? {} : { ownerIds: new Types.ObjectId(viewer.id) }),
      ...(filter.mode ? { mode: filter.mode } : {}),
      ...(q ? { title: { $regex: escapeRegex(q), $options: 'i' } } : {}),
      ...stateFilter(filter.state, now),
    };
    const [docs, total] = await Promise.all([
      Assessment.aggregate<SummaryRow>([
        { $match: query },
        { $sort: { closesAt: -1, _id: -1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        { $project: SUMMARY },
      ]),
      Assessment.countDocuments(query),
    ]);
    const [rows, joined] = await Promise.all([
      withHandIns(docs, now),
      TestGrant.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { assessmentId: { $in: docs.map((d) => d._id) } } },
        { $group: { _id: '$assessmentId', n: { $sum: 1 } } },
      ]),
    ]);
    const joinedOf = new Map(joined.map((j) => [String(j._id), j.n]));
    return {
      view: 'own',
      canCreate,
      total,
      rows: rows.map((row) => ({ ...row, joined: joinedOf.get(row.id) ?? 0 })),
    };
  }
  const [grants, total] = await Promise.all([
    TestGrant.find({ userId: viewer.id }, { assessmentId: 1 })
      .sort({ grantedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    TestGrant.countDocuments({ userId: viewer.id }),
  ]);
  const ids = grants.map((g) => g.assessmentId);
  const docs = await Assessment.aggregate<SummaryRow>([
    { $match: { _id: { $in: ids }, status: { $ne: 'draft' } } },
    { $project: SUMMARY },
  ]);
  const order = new Map(ids.map((id, i) => [String(id), i]));
  docs.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
  return { view: 'take', canCreate, total, rows: await withMyAttempts(docs, viewer.id, now) };
}

// TP-08: how a test is proctored, or null when it is not.
export type Proctoring = {
  fullscreen: boolean;
  camera: boolean;
  snapshotEverySec: number;
  blockCopy: boolean;
  hardLimit: number;
  penaltyEach: number;
} | null;

const proctoringOf = ({ proctoring: p }: Pick<AssessmentDoc, 'proctoring'>): Proctoring =>
  p
    ? {
        fullscreen: p.fullscreen,
        camera: p.camera,
        snapshotEverySec: p.snapshotEverySec,
        blockCopy: p.blockCopy,
        hardLimit: p.hardLimit,
        penaltyEach: p.penaltyEach,
      }
    : null;

async function readAssessment(assessmentId: string) {
  if (!Types.ObjectId.isValid(assessmentId)) notFound();
  const doc = await Assessment.findById(assessmentId).lean();
  if (!doc) notFound();
  return doc;
}
type AssessmentRead = Awaited<ReturnType<typeof readAssessment>>;
// An assessment's question, a paper's copy of one, or a bank's (M04b): the same fields.
type AnyItem = AssessmentRead['items'][number] | PaperItem | (BankItemDoc & { _id: Types.ObjectId });

const questionsOf = (doc: Pick<AssessmentRead, 'items' | 'sections'>) =>
  doc.items.length + doc.sections.reduce((sum, section) => sum + (section.draw?.count ?? 0), 0);

export type StudentItem = {
  id: string;
  type: ItemType;
  prompt: RichTextDoc | null;
  maxMarks: number;
  // M04b: shown beside the marks ("−0.5 if wrong", "part marks").
  negativeMarks: number;
  partialCredit: boolean;
  sectionId: string | null;
  // mcq, msq, ordering (the steps in the order this attempt starts with).
  options: { id: string; text: string }[] | null;
  // fill_blank: the sentence, with ___ for each blank.
  template: string | null;
  // matching: the left sides in order and the right sides shuffled; nothing says which belong together.
  pairs: { lefts: { id: string; text: string }[]; rights: { id: string; text: string }[] } | null;
  // Shown with the marks once results are published, so the student reads how each criterion went.
  rubric: { id: string; criterion: string; maxMarks: number }[] | null;
  // TP-09: a code question's language keys (the codeRunner setting names them), a starter for each, its limits and
  // only its visible tests; how many more are hidden.
  code: {
    languages: string[];
    starter: { language: string; source: string }[];
    timeLimitSec: number;
    memoryKb: number;
    runLimit: number;
    samples: { id: string; input: string; expected: string }[];
    hidden: number;
  } | null;
};

// 09 §10: the only way a question reaches whoever takes it. No key, no accepted answers for a blank, nothing that pairs
// a matching question's sides, no hidden test of a code question, no CO tags, and no rubric until results are published.
export function toStudentItem(item: AnyItem, seed: string, resultsPublished: boolean): StudentItem {
  return {
    id: String(item._id),
    type: item.type,
    prompt: docOf(item.prompt),
    maxMarks: item.maxMarks,
    negativeMarks: item.negativeMarks,
    partialCredit: item.partialCredit,
    sectionId: 'sectionId' in item && item.sectionId ? String(item.sectionId) : null,
    options: item.options ? item.options.map((o) => ({ id: String(o._id), text: o.text })) : null,
    template: item.type === 'fill_blank' ? (item.template ?? null) : null,
    pairs: item.pairs
      ? {
          lefts: item.pairs.map((pair) => ({ id: String(pair._id), text: pair.left })),
          rights: seededShuffle(
            item.pairs.map((pair) => ({ id: String(pair.rightId), text: pair.right })),
            `${seed}:${String(item._id)}:rights`,
          ),
        }
      : null,
    rubric:
      resultsPublished && item.rubric
        ? item.rubric.map((r) => ({ id: String(r._id), criterion: r.criterion, maxMarks: r.maxMarks }))
        : null,
    code: item.code
      ? {
          languages: item.code.languages,
          starter: item.code.starter.map((s) => ({ language: s.language, source: s.source })),
          timeLimitSec: item.code.timeLimitSec,
          memoryKb: item.code.memoryKb,
          runLimit: item.code.runLimit,
          samples: item.code.testCases
            .filter((test) => !test.hidden)
            .map((test) => ({ id: String(test._id), input: test.input, expected: test.expected })),
          hidden: item.code.testCases.filter((test) => test.hidden).length,
        }
      : null,
  };
}

export type SectionSummary = {
  id: string;
  title: string;
  durationMin: number | null;
  locked: boolean;
  questions: number;
};

const sectionSummaries = (doc: Pick<AssessmentRead, 'items' | 'sections'>): SectionSummary[] =>
  doc.sections.map((section) => ({
    id: String(section._id),
    title: section.title,
    durationMin: section.durationMin ?? null,
    locked: section.locked,
    questions:
      doc.items.filter((item) => String(item.sectionId) === String(section._id)).length + (section.draw?.count ?? 0),
  }));

export type StudentAssessment = Omit<AssessmentSummary, 'state'> & {
  instructions: RichTextDoc | null;
  resultsPublished: boolean;
  sections: SectionSummary[];
  // TP-08 (09 §11): shown in full before anyone starts.
  proctoring: Proctoring;
};

// What a taker reads about a test before starting (the lobby): never its questions.
function toStudentAssessment(doc: AssessmentRead): StudentAssessment {
  return {
    id: String(doc._id),
    title: doc.title,
    mode: doc.mode,
    maxMarks: doc.maxMarks,
    opensAt: doc.opensAt,
    closesAt: doc.closesAt,
    lateUntil: doc.lateUntil ?? null,
    durationMin: doc.durationMin ?? null,
    attemptsAllowed: doc.attemptsAllowed,
    attemptPolicy: doc.attemptPolicy,
    shuffleItems: doc.shuffleItems,
    shuffleOptions: doc.shuffleOptions,
    questions: questionsOf(doc),
    instructions: docOf(doc.instructions),
    resultsPublished: doc.status === 'results_published',
    sections: sectionSummaries(doc),
    proctoring: proctoringOf(doc),
  };
}

export type TeacherItem = Omit<StudentItem, 'pairs' | 'rubric'> & {
  coIds: string[];
  bloomLevel: BloomLevel | null;
  difficulty: Difficulty | null;
  topic: string | null;
  explanation: RichTextDoc | null;
  rubric: { id: string; criterion: string; maxMarks: number }[] | null;
  // mcq/msq: the correct options; ordering: every step in the right order; numeric: the value and its margin.
  key: { optionIds: string[] } | { value: number; tolerance: number } | { truth: boolean } | null;
  // fill_blank: what each blank accepts; matching: the pairs as written (with the ids an answer names them by).
  blanks: string[][] | null;
  pairs: { id: string; rightId: string; left: string; right: string }[] | null;
  // A question a paper drew from the bank (M04b).
  drawn: boolean;
  // TP-09: every test of a code question, hidden ones included.
  tests: { id: string; input: string; expected: string; hidden: boolean; weight: number }[] | null;
};

export function teacherItemOf(item: AnyItem): TeacherItem {
  const key = item.answer;
  return {
    ...toStudentItem(item, '', true),
    coIds: item.coIds.map(String),
    bloomLevel: item.bloomLevel ?? null,
    difficulty: item.difficulty ?? null,
    topic: item.topic ?? null,
    explanation: docOf(item.explanation),
    rubric: item.rubric
      ? item.rubric.map((r) => ({ id: String(r._id), criterion: r.criterion, maxMarks: r.maxMarks }))
      : null,
    key: !key
      ? null
      : item.type === 'numeric'
        ? { value: key.value ?? 0, tolerance: key.tolerance ?? 0 }
        : item.type === 'true_false'
          ? { truth: key.truth ?? false }
          : {
              optionIds:
                item.type === 'mcq' ? (key.optionId ? [String(key.optionId)] : []) : (key.optionIds ?? []).map(String),
            },
    blanks: item.blanks ? item.blanks.map((blank) => blank.accepted) : null,
    pairs: item.pairs
      ? item.pairs.map((pair) => ({
          id: String(pair._id),
          rightId: String(pair.rightId),
          left: pair.left,
          right: pair.right,
        }))
      : null,
    drawn: 'bankItemId' in item && Boolean(item.bankItemId),
    tests: item.code
      ? item.code.testCases.map((test) => ({
          id: String(test._id),
          input: test.input,
          expected: test.expected,
          hidden: test.hidden,
          weight: test.weight,
        }))
      : null,
  };
}

export type BuilderSection = SectionSummary & {
  passage: RichTextDoc | null;
  draw: {
    count: number;
    easy: number;
    medium: number;
    hard: number;
    coIds: string[];
    topics: string[];
    marksEach: number;
    negativeEach: number;
  } | null;
};

export type Builder = {
  // M04b: null for a standalone test; `path` is where the test lives (its course's tab, or /tests).
  offeringId: string | null;
  path: string;
  canEdit: boolean;
  // Students have started, so the questions are fixed (05 §5.1).
  locked: boolean;
  credit: boolean;
  // M06: a credit course with theory credits, whose assessments may count toward a theory part.
  theory: boolean;
  offeringTitle: string | null;
  cos: { id: string; code: string; statement: string }[];
  assessment: AssessmentSummary & {
    status: AssessmentDoc['status'];
    countsToward: CountsToward | null;
    instructions: RichTextDoc | null;
    items: TeacherItem[];
  };
  // M04b (TP-05, TP-06)
  sections: BuilderSection[];
  // What the bank cannot supply for the sections' draws, and how many different papers it can make (null: no draws).
  bank: { shortfalls: string[]; papers: number | null };
  extraTime: { userId: string; name: string; email: string; minutes: number }[];
  // TP-08
  proctoring: Proctoring;
  // TP-09: the languages a code question may offer (the codeRunner setting).
  languages: { key: string; label: string }[];
  // TP-11
  results: ResultRules;
  // What publishing still needs (T4): question numbers without a CO on a credit course.
  missingCos: number[];
  counts: { handedIn: number; toGrade: number; inProgress: number };
};

// T4: the builder for whoever teaches the class; a head of department reads it with no controls.
export async function getBuilder(assessmentId: string): Promise<Builder> {
  const { access, offeringId } = await testAccess(assessmentId);
  if (access === 'take') notFound();
  await db();
  const [doc, offering] = await Promise.all([
    readAssessment(assessmentId),
    offeringId ? Offering.findById(offeringId, { courseId: 1, category: 1, credits: 1, title: 1 }).lean() : null,
  ]);
  const [course, statuses, pools, people, runner] = await Promise.all([
    offering ? Course.findById(offering.courseId, { 'cos._id': 1, 'cos.code': 1, 'cos.statement': 1 }).lean() : null,
    Submission.aggregate<{ _id: string; n: number }>([
      { $match: { assessmentId: doc._id } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    sectionPools(doc),
    User.find({ _id: { $in: doc.extraTime.map((e) => e.userId) } }, { name: 1, email: 1 }).lean(),
    getSettings('codeRunner'),
  ]);
  const n = (status: string) => statuses.find((s) => s._id === status)?.n ?? 0;
  const credit = offering?.category === 'ugc';
  const items = doc.items.map(teacherItemOf);
  const drawing = doc.sections.flatMap((section) =>
    section.draw
      ? [
          {
            pool: pools.get(String(section._id)) ?? [],
            rule: {
              count: section.draw.count,
              mix: { easy: section.draw.easy, medium: section.draw.medium, hard: section.draw.hard },
            },
          },
        ]
      : [],
  );
  const personOf = new Map(people.map((p) => [String(p._id), p]));
  return {
    offeringId,
    path: assessmentPath(offeringId, assessmentId),
    canEdit: access === 'manage',
    locked: statuses.length > 0,
    credit,
    theory: credit && (offering?.credits.theory ?? 0) > 0,
    offeringTitle: offering?.title ?? null,
    cos: (course?.cos ?? []).map((co) => ({ id: String(co._id), code: co.code, statement: co.statement })),
    assessment: {
      ...summaryOf({ ...doc, questions: questionsOf(doc) }, new Date()),
      status: doc.status,
      countsToward: doc.countsToward ?? null,
      instructions: docOf(doc.instructions),
      items,
    },
    sections: sectionSummaries(doc).map((summary, i) => {
      const draw = doc.sections[i].draw;
      return {
        ...summary,
        passage: docOf(doc.sections[i].passage),
        draw: draw
          ? {
              count: draw.count,
              easy: draw.easy,
              medium: draw.medium,
              hard: draw.hard,
              coIds: draw.coIds.map(String),
              topics: draw.topics,
              marksEach: draw.marksEach,
              negativeEach: draw.negativeEach,
            }
          : null,
      };
    }),
    bank: {
      shortfalls: shortfallMessages(doc.sections, pools),
      papers: drawing.length > 0 ? distinctPapers(drawing) : null,
    },
    extraTime: doc.extraTime.map((entry) => {
      const person = personOf.get(String(entry.userId));
      return {
        userId: String(entry.userId),
        name: person?.name ?? 'Unknown',
        email: person?.email ?? '',
        minutes: entry.minutes,
      };
    }),
    proctoring: proctoringOf(doc),
    languages: runner.languages.map(({ key, label }) => ({ key, label })),
    results: rulesOf(doc),
    missingCos: credit ? items.flatMap((item, i) => (item.coIds.length === 0 ? [i + 1] : [])) : [],
    counts: { handedIn: n('submitted') + n('graded'), toGrade: n('submitted'), inProgress: n('in_progress') },
  };
}

export type AnswerValue =
  | { type: 'mcq'; optionId: string | null }
  | { type: 'msq'; optionIds: string[] }
  | { type: 'true_false'; truth: boolean | null }
  | { type: 'numeric'; value: number | null }
  | { type: 'fill_blank'; texts: string[] }
  | { type: 'matching'; matches: { left: string; right: string }[] }
  | { type: 'ordering'; optionIds: string[] }
  | { type: 'text'; text: RichTextDoc | null }
  | { type: 'file'; files: UploadedFile[] }
  | { type: 'code'; language: string | null; source: string };

type StoredAnswer = NonNullable<SubmissionDoc['answers']>[string];

function answerOf(type: ItemType, stored: StoredAnswer | undefined): AnswerValue {
  switch (type) {
    case 'mcq':
      return { type, optionId: stored?.optionId ? String(stored.optionId) : null };
    case 'msq':
    case 'ordering':
      return { type, optionIds: (stored?.optionIds ?? []).map(String) };
    case 'true_false':
      return { type, truth: stored?.truth ?? null };
    case 'numeric':
      return { type, value: stored?.value ?? null };
    case 'fill_blank':
      return { type, texts: stored?.texts ?? [] };
    case 'matching':
      return { type, matches: (stored?.matches ?? []).map((m) => ({ left: String(m.left), right: String(m.right) })) };
    case 'text':
      return { type, text: docOf(stored?.text) };
    case 'code':
      return { type, language: stored?.code?.language ?? null, source: stored?.code?.source ?? '' };
    case 'file':
      return {
        type,
        files: (stored?.files ?? []).map((f) => ({
          key: f.key,
          fileName: f.fileName,
          contentType: f.contentType,
          size: f.size,
        })),
      };
  }
}

async function readSubmission(filter: QueryFilter<SubmissionDoc>) {
  return Submission.findOne(filter).lean();
}

// TP-12: a made file as its button shows it — to ask for (never asked for, out of date, or it failed), being made, or
// ready to download. A request still "making" after 10 minutes counts as failed, so it can be asked for again.
export type TestFileState =
  { state: 'ask'; failed: boolean } | { state: 'making' } | { state: 'ready'; href: string; madeAt: Date };

const STUCK_MS = 10 * 60_000;

function fileState(
  file: Pick<TestFileDoc, 'status' | 'key' | 'requestedAt' | 'madeAt'> | undefined,
  now: Date,
  changedAt: Date | null,
): TestFileState {
  if (file?.status === 'making' && now.getTime() - file.requestedAt.getTime() < STUCK_MS) return { state: 'making' };
  if (file?.status === 'ready' && file.key && file.madeAt && (!changedAt || file.requestedAt >= changedAt)) {
    return { state: 'ready', href: `/api/files/${file.key}`, madeAt: file.madeAt };
  }
  return { state: 'ask', failed: file !== undefined && file.status !== 'ready' };
}

export type MyResult = ResultFigures & {
  // TP-12: the scorecard, and the certificate when the result earns one.
  files: { scorecard: TestFileState; certificate: TestFileState | null };
  // When the test shows one and its results are out: the first places, and whether each is this person.
  leaderboard: { rank: number; name: string; total: number; you: boolean }[] | null;
  items: (StudentItem & {
    marks: number | null;
    comment: string | null;
    criteria: { criterion: string; marks: number | null; maxMarks: number }[] | null;
    // What this person answered, in words; the right answer and the explanation only when the rules show them.
    given: string | null;
    correct: string | null;
    explanation: RichTextDoc | null;
  })[];
};

export type AssessmentPage =
  | { view: 'staff'; canTeach: boolean; path: string }
  | {
      view: 'student';
      path: string;
      assessment: StudentAssessment;
      state: DisplayState;
      check: StartCheck;
      // TP-07: extra minutes this person was given.
      extraMin: number;
      attempts: {
        attemptNo: number;
        status: 'in_progress' | 'submitted' | 'graded';
        submittedAt: Date | null;
        late: boolean;
        autoSubmitted: boolean;
        endedBy: 'warnings' | 'teacher' | null;
      }[];
      // The counted attempt's marks per question of its own paper, once results are published (T5).
      result: MyResult | null;
    };

// T5: a student's page of one assessment. Teachers are sent to the builder by the page; a head of department reads it.
export async function getAssessmentPage(assessmentId: string): Promise<AssessmentPage> {
  const { viewerId, access, offeringId } = await testAccess(assessmentId);
  const path = assessmentPath(offeringId, assessmentId);
  if (access !== 'take') return { view: 'staff', canTeach: access === 'manage', path };
  await db();
  const doc = await readAssessment(assessmentId);
  if (doc.status === 'draft') notFound();
  const mine = await Submission.find(
    { assessmentId: doc._id, studentId: viewerId },
    { attemptNo: 1, status: 1, total: 1, submittedAt: 1, late: 1, autoSubmitted: 1, endedBy: 1, deadlineAt: 1 },
  )
    .sort({ attemptNo: 1 })
    .lean();
  const now = new Date();
  const running = mine.some(
    (s) => s.status === 'in_progress' && now.getTime() <= s.deadlineAt.getTime() + SAVE_GRACE_MS,
  );
  const check = canStart({
    now,
    opensAt: doc.opensAt,
    closesAt: doc.closesAt,
    lateUntil: doc.lateUntil ?? null,
    attemptsUsed: mine.length,
    attemptsAllowed: doc.attemptsAllowed,
    inProgress: running,
  });
  const assessment = toStudentAssessment(doc);
  // TP-11: the counted attempt's marks once the results are published — or, with the "at once" rule, as soon as it is
  // marked; the place among the others waits for the published results.
  const rules = rulesOf(doc);
  let result: MyResult | null = null;
  const counted = countedAttempt(mine, doc.attemptPolicy);
  if (counted && (assessment.resultsPublished || rules.release === 'instant')) {
    const [paper, stats, course, files] = await Promise.all([
      readSubmission({ _id: counted._id }),
      assessment.resultsPublished
        ? TestStats.findById(doc._id, { takers: 1, leaderboard: 1, computedAt: 1 }).lean()
        : null,
      offeringId
        ? Offering.findById(offeringId, { courseId: 1 })
            .lean()
            .then((o) => (o ? Course.findById(o.courseId, { cos: 1 }).lean() : null))
        : null,
      TestFile.find({ assessmentId: doc._id, submissionId: counted._id }).lean(),
    ]);
    if (paper) {
      const figures = figuresOf(doc, paper, counted.total, {
        takers: assessment.resultsPublished && stats ? stats.takers : null,
        cos: course?.cos ?? [],
      });
      // TP-12: a scorecard or certificate is current when neither the attempt, the test nor the ranks changed since it
      // was asked for.
      const changedAt = new Date(
        Math.max(paper.updatedAt.getTime(), doc.updatedAt.getTime(), stats?.computedAt.getTime() ?? 0),
      );
      const fileOf = (kind: TestFileKind) =>
        fileState(
          files.find((file) => file.kind === kind),
          now,
          changedAt,
        );
      result = {
        ...figures,
        files: {
          scorecard: fileOf('scorecard'),
          certificate: earnsCertificate(figures.pct, rules.certificateFromPct) ? fileOf('certificate') : null,
        },
        leaderboard:
          rules.leaderboard && stats
            ? stats.leaderboard.map((row) => ({
                rank: row.rank,
                name: row.name,
                total: row.total,
                you: String(row.studentId) === viewerId,
              }))
            : null,
        items: paper.paper.map((raw) => {
          const item = toStudentItem(raw, String(paper._id), true);
          const score = paper.scores?.[item.id];
          return {
            ...item,
            marks: score?.marks ?? null,
            comment: score?.comment ?? null,
            criteria: item.rubric
              ? item.rubric.map((r) => ({
                  criterion: r.criterion,
                  maxMarks: r.maxMarks,
                  marks: score?.criteria?.find((c) => String(c.criterionId) === r.id)?.marks ?? null,
                }))
              : null,
            given: givenText(raw, paper.answers?.[item.id], 'Your code'),
            correct: rules.showAnswers ? correctText(raw) : null,
            explanation: rules.showExplanations ? docOf(raw.explanation) : null,
          };
        }),
      };
    }
  }
  return {
    view: 'student',
    path,
    assessment,
    state: stateOf(doc, now),
    check,
    extraMin: doc.extraTime.find((entry) => String(entry.userId) === viewerId)?.minutes ?? 0,
    attempts: mine.map((s) => ({
      attemptNo: s.attemptNo,
      status: s.status,
      submittedAt: s.submittedAt ?? null,
      late: s.late,
      autoSubmitted: s.autoSubmitted,
      endedBy: s.endedBy ?? null,
    })),
    result,
  };
}

export type AttemptSection = SectionSummary & {
  passage: RichTextDoc | null;
  // TP-06: open (answers can change), closed (left for good, or its time ran out), or not opened yet.
  state: 'open' | 'closed' | 'unvisited';
  // When an opened section with its own time limit closes.
  closesAt: Date | null;
};

export type AttemptDTO = {
  submissionId: string;
  assessmentId: string;
  // Where the test lives: the runner goes back there (its course's tab, or /tests, M04b).
  path: string;
  title: string;
  // The course's title, or null for a standalone test.
  offeringTitle: string | null;
  // Whose attempt it is, on the runner's top bar (M04b "Runner A") and its watermark (TP-08).
  takerName: string;
  takerEmail: string;
  proctoring: Proctoring;
  // Serious warnings so far (TP-08).
  warnings: number;
  timed: boolean;
  deadlineAt: Date;
  // M04b: empty when the test has no sections.
  sections: AttemptSection[];
  currentSectionId: string | null;
  flags: string[];
  // TP-09: the languages code questions may use, the wait between runs, and per question the runs made so far.
  languages: { key: string; label: string }[];
  runCooldownSec: number;
  // `saved` is what the student has saved so far, never a key.
  items: (StudentItem & { saved: AnswerValue; runs: number })[];
};

// T5: the runner's attempt, owner only: the questions of its own paper (M04b) in its order, with the answers saved so
// far. Null when the student has no attempt running.
export async function getAttemptForStudent(assessmentId: string): Promise<AttemptDTO | null> {
  const { viewerId, access, offeringId } = await testAccess(assessmentId);
  if (access !== 'take') notFound();
  await db();
  const doc = await readAssessment(assessmentId);
  const [attempt, offering, viewer, runner] = await Promise.all([
    readSubmission({ assessmentId: doc._id, studentId: viewerId, status: 'in_progress' }),
    offeringId ? Offering.findById(offeringId, { title: 1 }).lean() : null,
    requireViewer(),
    getSettings('codeRunner'),
  ]);
  if (!attempt) return null;
  const now = new Date();
  const seed = String(attempt._id);
  const items = attempt.paper.map((raw) => {
    const item = toStudentItem(raw, seed, false);
    return {
      ...item,
      saved: answerOf(item.type, attempt.answers?.[item.id]),
      runs: attempt.runs.filter((run) => String(run.itemId) === item.id).length,
    };
  });
  const rules = doc.sections.map((s) => ({ id: String(s._id), durationMin: s.durationMin ?? null, locked: s.locked }));
  const sections = sectionSummaries(doc).map((summary, i): AttemptSection => {
    const visit = attempt.visits.find((v) => String(v.sectionId) === summary.id);
    const shaped = visit && { sectionId: summary.id, startedAt: visit.startedAt, closedAt: visit.closedAt ?? null };
    return {
      ...summary,
      // The paper's own count: a section's drawn questions are on it.
      questions: items.filter((item) => item.sectionId === summary.id).length,
      passage: docOf(doc.sections[i].passage),
      state: !shaped ? 'unvisited' : sectionOpen(rules[i], shaped, now, attempt.deadlineAt) ? 'open' : 'closed',
      closesAt: shaped && rules[i].durationMin !== null ? sectionDeadline(rules[i], shaped, attempt.deadlineAt) : null,
    };
  });
  return {
    submissionId: seed,
    assessmentId,
    path: assessmentPath(offeringId, assessmentId),
    title: doc.title,
    offeringTitle: offering?.title ?? null,
    takerName: viewer.name,
    takerEmail: viewer.email,
    proctoring: proctoringOf(doc),
    warnings: attempt.proctor?.hard ?? 0,
    timed: doc.durationMin !== null && doc.durationMin !== undefined,
    deadlineAt: attempt.deadlineAt,
    sections,
    currentSectionId: attempt.currentSectionId ? String(attempt.currentSectionId) : null,
    flags: attempt.flags.map(String),
    languages: runner.languages.map(({ key, label }) => ({ key, label })),
    runCooldownSec: runner.runCooldownSec,
    items,
  };
}

export type HandInFilter = { status?: 'to_grade' | 'graded' | 'in_progress'; late?: boolean; q?: string };

export type HandIns = {
  canTeach: boolean;
  path: string;
  assessment: {
    id: string;
    title: string;
    maxMarks: number;
    // The code questions' marks together, or null when it has none.
    codeMarks: number | null;
    state: DisplayState;
    status: AssessmentDoc['status'];
  };
  rows: {
    id: string;
    student: { name: string; email: string; rollNo: string };
    attemptNo: number;
    status: 'in_progress' | 'submitted' | 'graded';
    submittedAt: Date | null;
    late: boolean;
    autoSubmitted: boolean;
    endedBy: 'warnings' | 'teacher' | null;
    // TP-08: serious warnings.
    warnings: number;
    // TP-11: an answer alike another hand-in's.
    similar: boolean;
    total: number | null;
    // M05 T6 (LAB-03), on an assessment with code questions: runs of the sample tests, each question's best run added
    // up, and the code questions' marks once all are marked.
    code: { runs: number; best: { passed: number; total: number } | null; marks: number | null } | null;
  }[];
  total: number;
  counts: { enrolled: number; handedIn: number; graded: number; toGrade: number; late: number; inProgress: number };
};

const STATUS_OF = { to_grade: ['submitted'], graded: ['graded'], in_progress: ['in_progress'] } as const;

// M05 T6: a hand-in's runs of the sample tests, each code question's best run, and the code questions' marks (null
// until the gradeCode job or a grader has marked them all).
function codeActivity(
  items: { _id: Types.ObjectId }[],
  runs: { itemId: Types.ObjectId; passed: number; total: number }[],
  scores: SubmissionDoc['scores'] | undefined,
): NonNullable<HandIns['rows'][number]['code']> {
  const best = items.flatMap((item) => {
    const mine = runs.filter((run) => run.itemId.equals(item._id));
    return mine.length === 0 ? [] : [mine.reduce((top, run) => (run.passed > top.passed ? run : top))];
  });
  const marks = items.map((item) => scores?.[String(item._id)]?.marks);
  return {
    runs: runs.length,
    best:
      best.length === 0
        ? null
        : { passed: best.reduce((n, run) => n + run.passed, 0), total: best.reduce((n, run) => n + run.total, 0) },
    marks: marks.some((m) => m === undefined)
      ? null
      : roundHalfUp(
          marks.reduce<number>((n, m) => n + (m ?? 0), 0),
          2,
        ),
  };
}

// T6: the hand-ins of one assessment, the oldest first, for whoever teaches or oversees the class.
export async function listSubmissions(assessmentId: string, filter: HandInFilter, page: number): Promise<HandIns> {
  const { access, offeringId } = await testAccess(assessmentId);
  if (access === 'take') notFound();
  await db();
  const doc = await readAssessment(assessmentId);
  // Code questions are the assessment's own: a section draws only automatically marked types from the bank.
  const codeItems = doc.items.filter((item) => item.type === 'code');
  const q = filter.q?.trim();
  const students = q
    ? await User.find(
        {
          _id: { $in: await Submission.distinct('studentId', { assessmentId: doc._id }) },
          $or: [
            { rollNo: { $regex: `^${escapeRegex(q)}`, $options: 'i' } },
            { email: { $regex: `^${escapeRegex(q)}`, $options: 'i' } },
            { name: { $regex: escapeRegex(q), $options: 'i' } },
          ],
        },
        { _id: 1 },
      )
        .limit(MAX_ENROLLMENTS)
        .lean()
    : null;
  const query: QueryFilter<SubmissionDoc> = {
    assessmentId: doc._id,
    status: { $in: filter.status ? STATUS_OF[filter.status] : ['submitted', 'graded'] },
    ...(filter.late === undefined ? {} : { late: filter.late }),
    ...(students ? { studentId: { $in: students.map((s) => s._id) } } : {}),
  };
  const [docs, total, statuses, late, enrolled] = await Promise.all([
    Submission.find(query, {
      studentId: 1,
      attemptNo: 1,
      status: 1,
      submittedAt: 1,
      late: 1,
      autoSubmitted: 1,
      endedBy: 1,
      total: 1,
      similar: 1,
      ...(codeItems.length > 0 ? { runs: 1, scores: 1 } : {}),
    })
      .sort({ submittedAt: 1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Submission.countDocuments(query),
    Submission.aggregate<{ _id: string; n: number }>([
      { $match: { assessmentId: doc._id } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    Submission.countDocuments({ assessmentId: doc._id, status: { $in: ['submitted', 'graded'] }, late: true }),
    offeringId
      ? Enrollment.countDocuments({ offeringId, status: 'active' })
      : TestGrant.countDocuments({ assessmentId }),
  ]);
  const [users, warned] = await Promise.all([
    User.find({ _id: { $in: docs.map((d) => d.studentId) } }, { name: 1, email: 1, rollNo: 1 }).lean(),
    Submission.aggregate<{ _id: Types.ObjectId; hard: number }>([
      { $match: { _id: { $in: docs.map((d) => d._id) } } },
      { $project: { hard: { $ifNull: ['$proctor.hard', 0] } } },
    ]),
  ]);
  const userOf = new Map(users.map((u) => [String(u._id), u]));
  const warningsOf = new Map(warned.map((w) => [String(w._id), w.hard]));
  const n = (status: string) => statuses.find((s) => s._id === status)?.n ?? 0;
  return {
    canTeach: access === 'manage',
    path: assessmentPath(offeringId, assessmentId),
    assessment: {
      id: String(doc._id),
      title: doc.title,
      maxMarks: doc.maxMarks,
      codeMarks:
        codeItems.length > 0
          ? roundHalfUp(
              codeItems.reduce((n, item) => n + item.maxMarks, 0),
              2,
            )
          : null,
      state: stateOf(doc, new Date()),
      status: doc.status,
    },
    rows: docs.map((d) => {
      const user = userOf.get(String(d.studentId));
      return {
        id: String(d._id),
        student: { name: user?.name ?? 'Unknown student', email: user?.email ?? '', rollNo: user?.rollNo ?? '—' },
        attemptNo: d.attemptNo,
        status: d.status,
        submittedAt: d.submittedAt ?? null,
        late: d.late,
        autoSubmitted: d.autoSubmitted,
        endedBy: d.endedBy ?? null,
        warnings: warningsOf.get(String(d._id)) ?? 0,
        similar: d.similar.length > 0,
        total: d.total ?? null,
        code: codeItems.length > 0 ? codeActivity(codeItems, d.runs ?? [], d.scores) : null,
      };
    }),
    total,
    counts: {
      enrolled,
      handedIn: n('submitted') + n('graded'),
      graded: n('graded'),
      toGrade: n('submitted'),
      late,
      inProgress: n('in_progress'),
    },
  };
}

export type GradingView = {
  path: string;
  canGrade: boolean;
  locked: boolean;
  assessment: { id: string; title: string; maxMarks: number; status: AssessmentDoc['status'] };
  // The questions of this attempt's own paper (M04b), with each one's section title.
  items: (TeacherItem & { sectionTitle: string | null })[];
  submission: {
    id: string;
    attemptNo: number;
    status: 'in_progress' | 'submitted' | 'graded';
    // M05 T6 (LAB-03): with submittedAt, how long the attempt took.
    startedAt: Date;
    submittedAt: Date | null;
    late: boolean;
    autoSubmitted: boolean;
    total: number | null;
    student: { name: string; email: string; rollNo: string };
    answers: Record<string, AnswerValue>;
    scores: Record<string, { marks: number; by: string; comment: string | null; criteria: Record<string, number> }>;
    // TP-07: seconds spent on each question.
    spent: Record<string, number>;
    flags: string[];
    endedBy: 'warnings' | 'teacher' | null;
    // Minutes the live monitor added (TP-08).
    addedMin: number;
    // TP-09 (LAB-03): per code question, its runs of the visible tests and every test as graded; when they were run.
    runs: Partial<Record<string, { at: Date; passed: number; total: number }[]>>;
    results: Partial<
      Record<string, { testCaseId: string; status: RunStatus; timeMs: number | null; memoryKb: number | null }[]>
    >;
    codeGradedAt: Date | null;
  };
  languages: { key: string; label: string }[];
  // TP-11: questions whose answer is alike another hand-in's — whose, and how alike (0–1). A flag to look at.
  similar: { submissionId: string; name: string; question: number; score: number }[];
  // TP-08: null when the test was not proctored.
  proctor: {
    rules: NonNullable<Proctoring>;
    hard: number;
    soft: number;
    waived: boolean;
    // What the serious warnings take off, as if not waived.
    penalty: number;
    events: { type: ProctorEvent; at: Date; counted: boolean; detail: string | null }[];
    snapshots: { key: string; at: Date }[];
    // When the retention job deleted the snapshots (05 §8).
    snapshotsDeletedAt: Date | null;
  } | null;
  previousId: string | null;
  // M04 decision 5: the next hand-in waiting for marks, after this one in the order they came in, else the first.
  nextToGradeId: string | null;
};

// T6: one hand-in with the key beside each answer, for whoever teaches or oversees the class.
export async function getSubmissionForGrading(assessmentId: string, submissionId: string): Promise<GradingView> {
  const { access, offeringId } = await testAccess(assessmentId);
  if (access === 'take') notFound();
  if (!Types.ObjectId.isValid(submissionId)) notFound();
  await db();
  const [doc, attempt, offering] = await Promise.all([
    readAssessment(assessmentId),
    readSubmission({ _id: submissionId, assessmentId }),
    offeringId ? Offering.findById(offeringId, { lockedAt: 1 }).lean() : null,
  ]);
  if (!attempt) notFound();
  const locked = Boolean(offering?.lockedAt);
  const order = { submittedAt: attempt.submittedAt ?? new Date(0), _id: attempt._id };
  const after = {
    $or: [{ submittedAt: { $gt: order.submittedAt } }, { submittedAt: order.submittedAt, _id: { $gt: order._id } }],
  };
  const before = {
    $or: [{ submittedAt: { $lt: order.submittedAt } }, { submittedAt: order.submittedAt, _id: { $lt: order._id } }],
  };
  const [user, previous, nextAfter, firstToGrade] = await Promise.all([
    User.findById(attempt.studentId, { name: 1, email: 1, rollNo: 1 }).lean(),
    Submission.findOne({ assessmentId, status: { $in: ['submitted', 'graded'] }, ...before }, { _id: 1 })
      .sort({ submittedAt: -1, _id: -1 })
      .lean(),
    Submission.findOne({ assessmentId, status: 'submitted', ...after }, { _id: 1 })
      .sort({ submittedAt: 1, _id: 1 })
      .lean(),
    Submission.findOne({ assessmentId, status: 'submitted', _id: { $ne: attempt._id } }, { _id: 1 })
      .sort({ submittedAt: 1, _id: 1 })
      .lean(),
  ]);
  const titleOf = new Map(doc.sections.map((section) => [String(section._id), section.title]));
  const items = attempt.paper.map((raw) => {
    const item = teacherItemOf(raw);
    return { ...item, sectionTitle: item.sectionId ? (titleOf.get(item.sectionId) ?? null) : null };
  });
  const next = nextAfter ?? firstToGrade;
  const rules = proctoringOf(doc);
  const others = await Submission.find(
    { _id: { $in: attempt.similar.map((entry) => entry.submissionId) } },
    { studentId: 1 },
  ).lean();
  const otherNames = new Map(
    (await User.find({ _id: { $in: others.map((o) => o.studentId) } }, { name: 1 }).lean()).map((u) => [
      String(u._id),
      u.name,
    ]),
  );
  const studentOf = new Map(others.map((o) => [String(o._id), String(o.studentId)]));
  const held = attempt.proctor;
  return {
    path: assessmentPath(offeringId, assessmentId),
    canGrade: access === 'manage' && !locked,
    locked,
    assessment: { id: String(doc._id), title: doc.title, maxMarks: doc.maxMarks, status: doc.status },
    items,
    submission: {
      id: String(attempt._id),
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt ?? null,
      late: attempt.late,
      autoSubmitted: attempt.autoSubmitted,
      total: attempt.total ?? null,
      student: { name: user?.name ?? 'Unknown student', email: user?.email ?? '', rollNo: user?.rollNo ?? '—' },
      answers: Object.fromEntries(items.map((item) => [item.id, answerOf(item.type, attempt.answers?.[item.id])])),
      scores: Object.fromEntries(
        Object.entries(attempt.scores ?? {}).map(([itemId, score]) => [
          itemId,
          {
            marks: score.marks,
            by: score.by,
            comment: score.comment ?? null,
            criteria: Object.fromEntries((score.criteria ?? []).map((c) => [String(c.criterionId), c.marks])),
          },
        ]),
      ),
      spent: attempt.spent ?? {},
      flags: attempt.flags.map(String),
      endedBy: attempt.endedBy ?? null,
      addedMin: held?.addedMin ?? 0,
      runs: Object.groupBy(
        attempt.runs.map((run) => ({ itemId: String(run.itemId), at: run.at, passed: run.passed, total: run.total })),
        (run) => run.itemId,
      ),
      results: Object.groupBy(
        attempt.results.map((r) => ({
          itemId: String(r.itemId),
          testCaseId: String(r.testCaseId),
          status: r.status,
          timeMs: r.timeMs ?? null,
          memoryKb: r.memoryKb ?? null,
        })),
        (r) => r.itemId,
      ),
      codeGradedAt: attempt.codeGradedAt ?? null,
    },
    languages: (await getSettings('codeRunner')).languages.map(({ key, label }) => ({ key, label })),
    similar: attempt.similar.map((entry) => ({
      submissionId: String(entry.submissionId),
      name: otherNames.get(studentOf.get(String(entry.submissionId)) ?? '') ?? 'Someone',
      question: attempt.paper.findIndex((item) => item._id.equals(entry.itemId)) + 1,
      score: entry.score,
    })),
    proctor: rules
      ? {
          rules,
          hard: held?.hard ?? 0,
          soft: held?.soft ?? 0,
          waived: held?.waived ?? false,
          penalty: proctorPenalty(held?.hard ?? 0, rules.penaltyEach, false),
          events: (held?.events ?? []).map((e) => ({
            type: e.type,
            at: e.at,
            counted: e.counted,
            detail: e.detail ?? null,
          })),
          snapshots: (held?.snapshots ?? []).map((snapshot) => ({ key: snapshot.key, at: snapshot.at })),
          snapshotsDeletedAt: doc.snapshotsDeletedAt ?? null,
        }
      : null,
    previousId: previous ? String(previous._id) : null,
    nextToGradeId: next ? String(next._id) : null,
  };
}

export type TestResults = {
  path: string;
  canManage: boolean;
  assessment: { id: string; title: string; maxMarks: number; status: AssessmentDoc['status']; state: DisplayState };
  rules: ResultRules;
  // Null until the testStats job has run once.
  stats: {
    computedAt: Date;
    takers: number;
    averagePct: number | null;
    highestPct: number | null;
    histogram: number[];
    flagged: number;
    // The questions to look at first: very hard or very easy, or weak at telling stronger takers from weaker ones.
    items: {
      key: string;
      title: string;
      type: ItemType;
      sectionTitle: string | null;
      cos: string[];
      n: number;
      correctPct: number;
      difficulty: string | null;
      discrimination: number | null;
      discriminationLabel: string | null;
      wrongPick: { text: string; pct: number } | null;
      lookAt: boolean;
    }[];
  } | null;
  // TP-12: the Excel export and the reports PDF, once anyone has handed in (null before).
  files: Record<(typeof STAFF_FILE_KINDS)[number], TestFileState> | null;
};

// TP-11 (mock-up C6): how a test went, from the testStats job's last run — takers, average, highest, the score
// histogram, similar answers and each question's analysis. Whoever manages or oversees the test reads it.
export async function getTestResults(assessmentId: string): Promise<TestResults> {
  const { access, offeringId } = await testAccess(assessmentId);
  if (access === 'take') notFound();
  await db();
  const doc = await readAssessment(assessmentId);
  const [stats, course, handedIn, files] = await Promise.all([
    TestStats.findById(doc._id).lean(),
    offeringId
      ? Offering.findById(offeringId, { courseId: 1 })
          .lean()
          .then((o) => (o ? Course.findById(o.courseId, { 'cos._id': 1, 'cos.code': 1 }).lean() : null))
      : null,
    Submission.exists({ assessmentId: doc._id, status: { $in: ['submitted', 'graded'] } }),
    TestFile.find({ assessmentId: doc._id, submissionId: null, kind: { $in: STAFF_FILE_KINDS } }).lean(),
  ]);
  const now = new Date();
  // The staff choose when to make a file again, so a made one stays ready (its time shows).
  const fileOf = (kind: TestFileKind) =>
    fileState(
      files.find((file) => file.kind === kind),
      now,
      null,
    );
  const coCode = new Map((course?.cos ?? []).map((co) => [String(co._id), co.code]));
  const items = (stats?.items ?? []).map((item) => {
    const difficulty = difficultyLabel(item.correctPct);
    const discrimination = item.discrimination ?? null;
    const weak = discriminationLabel(discrimination);
    return {
      key: String(item.key),
      title: item.title,
      type: item.type,
      sectionTitle: item.sectionTitle ?? null,
      cos: item.coIds.flatMap((id) => coCode.get(String(id)) ?? []),
      n: item.n,
      correctPct: item.correctPct,
      difficulty,
      discrimination,
      discriminationLabel: weak,
      wrongPick: item.wrongPick?.text ? { text: item.wrongPick.text, pct: item.wrongPick.pct ?? 0 } : null,
      lookAt: difficulty === 'very hard' || difficulty === 'very easy' || weak === 'weak',
    };
  });
  return {
    path: assessmentPath(offeringId, assessmentId),
    canManage: access === 'manage',
    assessment: {
      id: assessmentId,
      title: doc.title,
      maxMarks: doc.maxMarks,
      status: doc.status,
      state: stateOf(doc, now),
    },
    rules: rulesOf(doc),
    files: handedIn ? { results_xlsx: fileOf('results_xlsx'), reports_pdf: fileOf('reports_pdf') } : null,
    stats: stats
      ? {
          computedAt: stats.computedAt,
          takers: stats.takers,
          averagePct: stats.averagePct ?? null,
          highestPct: stats.highestPct ?? null,
          histogram: stats.histogram,
          flagged: stats.flagged,
          items: items.sort(
            (a, b) => Number(b.lookAt) - Number(a.lookAt) || (a.discrimination ?? 1) - (b.discrimination ?? 1),
          ),
        }
      : null,
  };
}

export type MonitorRow = {
  id: string;
  student: { name: string; email: string };
  answered: number;
  questions: number;
  deadlineAt: Date;
  // Extra time for this person plus the minutes the monitor added.
  extraMin: number;
  hard: number;
  soft: number;
  // The kinds of serious warning, in the order they first happened.
  warnings: ProctorEvent[];
  lastSeenAt: Date | null;
};

export type Monitor = {
  path: string;
  canAct: boolean;
  assessment: { id: string; title: string; proctoring: Proctoring; state: DisplayState };
  counts: { writing: number; handedIn: number; warned: number; lost: number };
  rows: MonitorRow[];
  now: Date;
};

// TP-08: the live monitor — who is writing now, how far they are, their time and warnings, and when each runner was
// last heard from (a page of the attempts running, in the order they started). Whoever manages the test acts on it; a
// head of department watches.
export async function getMonitor(assessmentId: string, page: number): Promise<Monitor> {
  const { access, offeringId } = await testAccess(assessmentId);
  if (access === 'take') notFound();
  await db();
  const doc = await readAssessment(assessmentId);
  const now = new Date();
  const running = { $eq: ['$status', 'in_progress'] };
  const [[counts], raw] = await Promise.all([
    Submission.aggregate<Monitor['counts']>([
      { $match: { assessmentId: doc._id } },
      {
        $group: {
          _id: null,
          writing: { $sum: { $cond: [running, 1, 0] } },
          handedIn: { $sum: { $cond: [running, 0, 1] } },
          warned: { $sum: { $cond: [{ $and: [running, { $gt: [{ $ifNull: ['$proctor.hard', 0] }, 0] }] }, 1, 0] } },
          lost: {
            $sum: {
              $cond: [
                {
                  $and: [
                    running,
                    { $lt: [{ $ifNull: ['$proctor.lastBeatAt', '$startedAt'] }, new Date(now.getTime() - GAP_MS)] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]),
    Submission.aggregate<{
      _id: Types.ObjectId;
      studentId: Types.ObjectId;
      deadlineAt: Date;
      answered: number;
      questions: number;
      addedMin: number;
      hard: number;
      soft: number;
      kinds: ProctorEvent[];
      lastBeatAt: Date | null;
    }>([
      { $match: { assessmentId: doc._id, status: 'in_progress' } },
      { $sort: { submittedAt: 1, _id: 1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      {
        $project: {
          studentId: 1,
          deadlineAt: 1,
          answered: { $size: { $objectToArray: { $ifNull: ['$answers', {}] } } },
          questions: { $size: { $ifNull: ['$paper', []] } },
          addedMin: { $ifNull: ['$proctor.addedMin', 0] },
          hard: { $ifNull: ['$proctor.hard', 0] },
          soft: { $ifNull: ['$proctor.soft', 0] },
          kinds: {
            $map: {
              input: { $filter: { input: { $ifNull: ['$proctor.events', []] }, cond: '$$this.counted' } },
              in: '$$this.type',
            },
          },
          lastBeatAt: { $ifNull: ['$proctor.lastBeatAt', null] },
        },
      },
    ]),
  ]);
  const users = await User.find({ _id: { $in: raw.map((r) => r.studentId) } }, { name: 1, email: 1 }).lean();
  const userOf = new Map(users.map((u) => [String(u._id), u]));
  const extraOf = new Map(doc.extraTime.map((entry) => [String(entry.userId), entry.minutes]));
  return {
    path: assessmentPath(offeringId, assessmentId),
    canAct: access === 'manage',
    assessment: { id: assessmentId, title: doc.title, proctoring: proctoringOf(doc), state: stateOf(doc, now) },
    counts: counts ?? { writing: 0, handedIn: 0, warned: 0, lost: 0 },
    rows: raw.map((r) => {
      const user = userOf.get(String(r.studentId));
      return {
        id: String(r._id),
        student: { name: user?.name ?? 'Unknown', email: user?.email ?? '' },
        answered: r.answered,
        questions: r.questions,
        deadlineAt: r.deadlineAt,
        extraMin: (extraOf.get(String(r.studentId)) ?? 0) + r.addedMin,
        hard: r.hard,
        soft: r.soft,
        warnings: [...new Set(r.kinds)],
        lastSeenAt: r.lastBeatAt,
      };
    }),
    now,
  };
}

export type RecordCell =
  | { kind: 'graded'; total: number; maxMarks: number; submissionId: string }
  | { kind: 'to_grade'; submissionId: string }
  | { kind: 'writing' }
  | { kind: 'missing' }
  | { kind: 'not_yet' };

export type RecordsGrid = {
  canTeach: boolean;
  columns: {
    id: string;
    title: string;
    mode: AssessmentMode;
    closesAt: Date;
    lateUntil: Date | null;
    state: DisplayState;
  }[];
  rows: { id: string; name: string; rollNo: string; cells: Record<string, RecordCell> }[];
  total: number;
};

// T7 (REC-01–REC-04): active students by roll number × the class's published record assessments. An offering holds at
// most MAX_ENROLLMENTS students and 200 assessments (A-83, A-102), so both sides are bounded reads; a cell is the
// student's latest attempt.
export async function getRecordsGrid(offeringId: string, page: number, q?: string): Promise<RecordsGrid> {
  const { access, canTeach } = await viewerAccess(offeringId);
  if (access === 'learn') notFound();
  await db();
  const now = new Date();
  const [records, enrolled] = await Promise.all([
    Assessment.find(
      { offeringId, mode: { $in: RECORD_MODES }, status: { $ne: 'draft' } },
      { title: 1, mode: 1, opensAt: 1, closesAt: 1, lateUntil: 1, status: 1, maxMarks: 1 },
    )
      .sort({ opensAt: 1, _id: 1 })
      .limit(ASSESSMENT_LIMITS.perOffering)
      .lean(),
    Enrollment.distinct('studentId', { offeringId, status: 'active' }),
  ]);
  const term = q?.trim();
  const userFilter = {
    _id: { $in: enrolled },
    ...(term
      ? {
          $or: [
            { rollNo: { $regex: `^${escapeRegex(term)}`, $options: 'i' } },
            { name: { $regex: escapeRegex(term), $options: 'i' } },
          ],
        }
      : {}),
  };
  const [students, total] = await Promise.all([
    User.find(userFilter, { name: 1, rollNo: 1 })
      .sort({ rollNo: 1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    User.countDocuments(userFilter),
  ]);
  const attempts = await Submission.find(
    { assessmentId: { $in: records.map((r) => r._id) }, studentId: { $in: students.map((s) => s._id) } },
    { assessmentId: 1, studentId: 1, attemptNo: 1, status: 1, total: 1 },
  ).lean();
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    const key = `${a.studentId}:${a.assessmentId}`;
    const seen = latest.get(key);
    if (!seen || a.attemptNo > seen.attemptNo) latest.set(key, a);
  }
  return {
    canTeach,
    columns: records.map((r) => ({
      id: String(r._id),
      title: r.title,
      mode: r.mode,
      closesAt: r.closesAt,
      lateUntil: r.lateUntil ?? null,
      state: stateOf(r, now),
    })),
    rows: students.map((s) => ({
      id: String(s._id),
      name: s.name,
      rollNo: s.rollNo ?? '—',
      cells: Object.fromEntries(
        records.map((r): [string, RecordCell] => {
          const a = latest.get(`${s._id}:${r._id}`);
          if (a?.status === 'graded' && a.total !== null && a.total !== undefined) {
            return [
              String(r._id),
              { kind: 'graded', total: a.total, maxMarks: r.maxMarks, submissionId: String(a._id) },
            ];
          }
          if (a?.status === 'submitted') return [String(r._id), { kind: 'to_grade', submissionId: String(a._id) }];
          if (a?.status === 'in_progress') return [String(r._id), { kind: 'writing' }];
          return [
            String(r._id),
            { kind: stateOf(r, now) === 'closed' || stateOf(r, now) === 'results' ? 'missing' : 'not_yet' },
          ];
        }),
      ),
    })),
    total,
  };
}

export type DueSoonRow = {
  id: string;
  offeringId: string;
  title: string;
  offeringTitle: string;
  closesAt: Date;
  started: boolean;
};

// Home (M04 decision 1, A-105): open assessments of the student's courses closing within seven days that they have not
// handed in, soonest first.
export async function listDueSoon(): Promise<DueSoonRow[]> {
  const viewer = await requireViewer(['student']);
  await db();
  const now = new Date();
  const offerings = await Offering.find(
    {
      _id: { $in: await Enrollment.distinct('offeringId', { studentId: viewer.id, status: 'active' }) },
      status: { $ne: 'draft' },
    },
    { title: 1 },
  ).lean();
  const due = await Assessment.find(
    {
      offeringId: { $in: offerings.map((o) => o._id) },
      status: 'published',
      opensAt: { $lte: now },
      closesAt: { $gt: now, $lte: new Date(now.getTime() + 7 * DAY_MS) },
    },
    { offeringId: 1, title: 1, closesAt: 1 },
  )
    .sort({ closesAt: 1 })
    .limit(50)
    .lean();
  const mine = await Submission.find(
    { assessmentId: { $in: due.map((a) => a._id) }, studentId: viewer.id },
    { assessmentId: 1, status: 1 },
  ).lean();
  const titleOf = new Map(offerings.map((o) => [String(o._id), o.title]));
  return due
    .filter((a) => !mine.some((s) => s.assessmentId.equals(a._id) && s.status !== 'in_progress'))
    .slice(0, 5)
    .map((a) => ({
      id: String(a._id),
      offeringId: String(a.offeringId),
      title: a.title,
      offeringTitle: titleOf.get(String(a.offeringId)) ?? '',
      closesAt: a.closesAt,
      started: mine.some((s) => s.assessmentId.equals(a._id)),
    }));
}

export type ToGradeRow = { id: string; offeringId: string; title: string; offeringTitle: string; toGrade: number };

// Home (M04 decision 1): published assessments of the classes the viewer teaches with hand-ins waiting for marks.
export async function listToGrade(): Promise<ToGradeRow[]> {
  const viewer = await requireViewer(['faculty']);
  await db();
  const offerings = await Offering.find({ facultyIds: viewer.id, status: { $ne: 'completed' } }, { title: 1 })
    .limit(100)
    .lean();
  const published = await Assessment.find(
    { offeringId: { $in: offerings.map((o) => o._id) }, status: 'published' },
    { offeringId: 1, title: 1 },
  )
    .limit(ASSESSMENT_LIMITS.perOffering)
    .lean();
  const waiting = await Submission.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { assessmentId: { $in: published.map((a) => a._id) }, status: 'submitted' } },
    { $group: { _id: '$assessmentId', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 5 },
  ]);
  const assessmentOf = new Map(published.map((a) => [String(a._id), a]));
  const titleOf = new Map(offerings.map((o) => [String(o._id), o.title]));
  return waiting.flatMap((w) => {
    const a = assessmentOf.get(String(w._id));
    return a
      ? [
          {
            id: String(a._id),
            offeringId: String(a.offeringId),
            title: a.title,
            offeringTitle: titleOf.get(String(a.offeringId)) ?? '',
            toGrade: w.n,
          },
        ]
      : [];
  });
}
