import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import {
  ASSESSMENT_LIMITS,
  ASSESSMENT_MODES,
  ASSESSMENT_STATUSES,
  ATTEMPT_POLICIES,
  COUNTS_TOWARD,
  DIFFICULTIES,
  ITEM_TYPES,
  PROCTOR_LIMITS,
  RELEASE_RULES,
  RESULT_LIMITS,
} from '@/lib/schemas/assessment';
import { BLOOM_LEVELS } from '@/lib/schemas/structure';

const optionSchema = new Schema({
  text: { type: String, required: true, trim: true, maxlength: ASSESSMENT_LIMITS.optionText },
});

const criterionSchema = new Schema({
  criterion: { type: String, required: true, trim: true, maxlength: ASSESSMENT_LIMITS.criterion },
  maxMarks: { type: Number, required: true, min: 0.01, max: 1000 },
});

// The key of an objective question. It never reaches a student's browser (09 §10): toStudentAssessment leaves it out.
// mcq: optionId · msq: optionIds (a set) · ordering: optionIds (the right order) · numeric: value ± tolerance ·
// true_false: truth. Fill-in-the-blank keys are `blanks`, matching keys are `pairs` themselves.
const answerKeySchema = new Schema(
  {
    optionId: { type: Schema.Types.ObjectId },
    optionIds: { type: [Schema.Types.ObjectId], default: undefined },
    value: { type: Number },
    tolerance: { type: Number, min: 0 },
    truth: { type: Boolean },
  },
  { _id: false },
);

const blankSchema = new Schema({
  accepted: { type: [{ type: String, trim: true, maxlength: ASSESSMENT_LIMITS.blankText }], required: true },
});

// `_id` names the left side and `rightId` the right one, so a page can list both without saying which go together.
const pairSchema = new Schema({
  rightId: { type: Schema.Types.ObjectId, required: true },
  left: { type: String, required: true, trim: true, maxlength: ASSESSMENT_LIMITS.pairText },
  right: { type: String, required: true, trim: true, maxlength: ASSESSMENT_LIMITS.pairText },
});

const testCaseSchema = new Schema({
  input: { type: String, maxlength: ASSESSMENT_LIMITS.caseText, default: '' },
  expected: { type: String, required: true, maxlength: ASSESSMENT_LIMITS.caseText },
  hidden: { type: Boolean, required: true },
  weight: { type: Number, required: true, min: 1, max: 10 },
});

// TP-09 (05 §5.1): a code question's languages, a starter for each, its limits and its tests. Hidden tests never reach
// a student (toStudentItem); every test is run when the attempt is graded.
const codeSchema = new Schema(
  {
    languages: { type: [{ type: String, maxlength: 20 }], required: true },
    starter: {
      type: [
        {
          _id: false,
          language: { type: String, required: true, maxlength: 20 },
          source: { type: String, required: true, maxlength: ASSESSMENT_LIMITS.starter },
        },
      ],
      default: [],
    },
    timeLimitSec: { type: Number, required: true, min: 1, max: 10 },
    memoryKb: { type: Number, required: true, min: 64_000, max: 512_000 },
    // Runs of the visible tests a student may make on this question in one attempt.
    runLimit: { type: Number, required: true, min: 1, max: ASSESSMENT_LIMITS.runLimit },
    // Its own schema: an inline one would take the parent's `_id: false`, and results name each test by its id.
    testCases: { type: [testCaseSchema], required: true },
  },
  { _id: false },
);

// One question, as an assessment holds it, as the bank holds it (lib/models/bank-item.ts) and as an attempt's paper
// keeps a copy of it (lib/models/submission.ts).
export const itemDefinition = {
  type: { type: String, enum: ITEM_TYPES, required: true },
  prompt: { type: Schema.Types.Mixed, required: true },
  maxMarks: { type: Number, required: true, min: 0.01, max: 1000 },
  // CPP-05/06: at least one for a credit course; each is one of the course's COs (deleteCo refuses one in use).
  coIds: { type: [Schema.Types.ObjectId], default: [] },
  bloomLevel: { type: String, enum: BLOOM_LEVELS, default: null },
  // M04b (TP-05, TP-06)
  difficulty: { type: String, enum: DIFFICULTIES, default: null },
  topic: { type: String, trim: true, lowercase: true, maxlength: ASSESSMENT_LIMITS.topic, default: null },
  negativeMarks: { type: Number, min: 0, max: 1000, default: 0 },
  partialCredit: { type: Boolean, default: false },
  explanation: { type: Schema.Types.Mixed, default: null },
  options: { type: [optionSchema], default: undefined },
  answer: { type: answerKeySchema, default: undefined },
  rubric: { type: [criterionSchema], default: undefined },
  // fill_blank: the sentence with ___ for each blank, and what each blank accepts.
  template: { type: String, maxlength: ASSESSMENT_LIMITS.template, default: undefined },
  blanks: { type: [blankSchema], default: undefined },
  // matching: each pair is a left side and its right side; the runner shuffles the right sides.
  pairs: { type: [pairSchema], default: undefined },
  code: { type: codeSchema, default: undefined },
};

const itemSchema = new Schema({
  ...itemDefinition,
  // M04b: the section it belongs to; null while the assessment has no sections.
  sectionId: { type: Schema.Types.ObjectId, default: null },
});

// M04b (TP-05, TP-06): a part of the test with its own clock and order rule, a passage shown beside its questions, and
// questions drawn from the bank for each attempt (`draw`, each worth `marksEach`).
const sectionSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: ASSESSMENT_LIMITS.sectionTitle },
  durationMin: { type: Number, min: 1, max: 600, default: null },
  // "No going back": once left it closes, and nothing after it opens until it is left.
  locked: { type: Boolean, required: true, default: false },
  passage: { type: Schema.Types.Mixed, default: null },
  draw: {
    type: new Schema(
      {
        count: { type: Number, required: true, min: 1, max: ASSESSMENT_LIMITS.items },
        // Percent of `count` per level; all 0 means any level.
        easy: { type: Number, required: true, min: 0, max: 100, default: 0 },
        medium: { type: Number, required: true, min: 0, max: 100, default: 0 },
        hard: { type: Number, required: true, min: 0, max: 100, default: 0 },
        coIds: { type: [Schema.Types.ObjectId], default: [] },
        topics: { type: [String], default: [] },
        marksEach: { type: Number, required: true, min: 0.01, max: 1000 },
        negativeEach: { type: Number, required: true, min: 0, max: 1000, default: 0 },
      },
      { _id: false },
    ),
    default: null,
  },
});

const assessmentSchema = new Schema(
  {
    // Null for a standalone test (M04b, TP-02): it belongs to `ownerIds` and never feeds CE or attainment.
    offeringId: { type: Schema.Types.ObjectId, default: null },
    ownerIds: { type: [Schema.Types.ObjectId], default: [] },
    mode: { type: String, enum: ASSESSMENT_MODES, required: true },
    // M06 (Q-41): the theory part its published marks count toward; null is not counted (07 §2).
    countsToward: { type: String, enum: COUNTS_TOWARD, default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    instructions: { type: Schema.Types.Mixed },
    items: { type: [itemSchema], default: [] },
    // At most ASSESSMENT_LIMITS.sections; empty means one part holding every question.
    sections: { type: [sectionSchema], default: [] },
    // Σ items.maxMarks + Σ sections' draw.count × marksEach, kept with every change to the questions and sections.
    maxMarks: { type: Number, required: true, default: 0 },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    lateUntil: { type: Date, default: null },
    durationMin: { type: Number, min: 1, max: 600, default: null },
    attemptsAllowed: { type: Number, required: true, min: 1, max: 10, default: 1 },
    attemptPolicy: { type: String, enum: ATTEMPT_POLICIES, required: true, default: 'best' },
    shuffleItems: { type: Boolean, required: true, default: false },
    shuffleOptions: { type: Boolean, required: true, default: false },
    // TP-07: extra minutes for named people (at most ASSESSMENT_LIMITS.extraTime), read when an attempt starts.
    extraTime: {
      type: [
        {
          _id: false,
          userId: { type: Schema.Types.ObjectId, required: true },
          minutes: { type: Number, required: true, min: 1, max: 600 },
        },
      ],
      default: [],
    },
    // TP-08: null when the test is not proctored. Fixed once anyone has started, like the other settings (07 §15).
    proctoring: {
      type: new Schema(
        {
          fullscreen: { type: Boolean, required: true, default: false },
          // Camera snapshots every `snapshotEverySec`, at most PROCTOR_LIMITS.snapshots an attempt.
          camera: { type: Boolean, required: true, default: false },
          snapshotEverySec: { type: Number, required: true, min: 30, max: 600, default: 60 },
          blockCopy: { type: Boolean, required: true, default: false },
          // The serious warning that hands an attempt in; 0 records them only.
          hardLimit: { type: Number, required: true, min: 0, max: PROCTOR_LIMITS.hardLimit, default: 3 },
          // Marks taken off the total for each serious warning (0: none); a grader may waive it.
          penaltyEach: { type: Number, required: true, min: 0, max: 1000, default: 0 },
        },
        { _id: false },
      ),
      default: null,
    },
    // TP-11 (07 §19): when results go out and what they show. `setBy` chose the rule, and is the actor the audit log
    // names when the rule publishes them.
    results: {
      type: new Schema(
        {
          release: { type: String, enum: RELEASE_RULES, required: true, default: 'manual' },
          showAnswers: { type: Boolean, required: true, default: false },
          showExplanations: { type: Boolean, required: true, default: false },
          leaderboard: { type: Boolean, required: true, default: false },
          // TP-12: certificates for counted attempts at or above this percentage; null gives none.
          certificateFromPct: { type: Number, min: 0, max: 100, default: null },
          // Highest first; the first a percentage reaches is its band ("Recommended").
          bands: {
            type: [
              {
                _id: false,
                label: { type: String, required: true, maxlength: RESULT_LIMITS.bandLabel },
                minPct: { type: Number, required: true, min: 0, max: 100 },
              },
            ],
            default: [],
          },
          setBy: { type: Schema.Types.ObjectId, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    // When the daily proctorRetention job deleted this test's camera snapshots (05 §8).
    snapshotsDeletedAt: { type: Date, default: null },
    // Open or closed is derived from the dates and now (windowState, lib/domain/attempts.ts).
    status: { type: String, enum: ASSESSMENT_STATUSES, required: true, default: 'draft' },
    publishedAt: { type: Date },
    resultsPublishedAt: { type: Date },
    // Set when the 24-hour reminder was sent (the hourly sweep, M04 T8).
    dueNotifiedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

assessmentSchema.index({ offeringId: 1, status: 1, closesAt: 1 });
assessmentSchema.index({ offeringId: 1, mode: 1 });
assessmentSchema.index({ status: 1, closesAt: 1 });
// deleteCo asks whether any question is tagged with the CO.
assessmentSchema.index({ 'items.coIds': 1 });
// The Tests page: a member of staff's standalone tests, the latest closing first (M04b). An admin's list of every
// standalone test uses { offeringId, status, closesAt } with offeringId null.
assessmentSchema.index({ ownerIds: 1, closesAt: -1, _id: -1 });
// The hourly sweep's tests whose results go out by themselves once closed (TP-11).
assessmentSchema.index({ 'results.release': 1, status: 1, closesAt: 1 });
// The daily proctorRetention job: tests with camera snapshots whose results went out long enough ago (05 §8).
assessmentSchema.index({ 'proctoring.camera': 1, snapshotsDeletedAt: 1, resultsPublishedAt: 1 });

export type AssessmentDoc = InferSchemaType<typeof assessmentSchema>;
export const Assessment: Model<AssessmentDoc> =
  mongoose.models.Assessment ?? mongoose.model('Assessment', assessmentSchema);
