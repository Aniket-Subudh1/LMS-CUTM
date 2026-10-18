import mongoose, { Schema, type FlattenMaps, type InferSchemaType, type Model } from 'mongoose';
import { itemDefinition } from '@/lib/models/assessment';
import {
  ASSESSMENT_LIMITS,
  ENDED_BY,
  PROCTOR_EVENTS,
  PROCTOR_LIMITS,
  RUN_STATUSES,
  SUBMISSION_STATUSES,
} from '@/lib/schemas/assessment';

// A file a student handed in (a `submission` upload, 06 §5); the name is the sanitized one they chose.
const fileSchema = new Schema(
  {
    key: { type: String, required: true },
    fileName: { type: String, required: true, maxlength: 120 },
    contentType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const answerSchema = new Schema(
  {
    optionId: { type: Schema.Types.ObjectId },
    // msq: the options chosen; ordering: the options in the order given.
    optionIds: { type: [Schema.Types.ObjectId], default: undefined },
    value: { type: Number },
    text: { type: Schema.Types.Mixed },
    files: { type: [fileSchema], default: undefined },
    // M04b: true_false; fill_blank (one text per blank); matching (each left side's chosen right side).
    truth: { type: Boolean },
    texts: { type: [{ type: String, maxlength: ASSESSMENT_LIMITS.blankText }], default: undefined },
    matches: {
      type: [
        {
          _id: false,
          left: { type: Schema.Types.ObjectId, required: true },
          right: { type: Schema.Types.ObjectId, required: true },
        },
      ],
      default: undefined,
    },
    // TP-09: a code question's language key and source.
    code: {
      type: new Schema(
        {
          language: { type: String, required: true, maxlength: 20 },
          source: { type: String, maxlength: ASSESSMENT_LIMITS.source, default: '' },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false },
);

const scoreSchema = new Schema(
  {
    // Negative only for an objective question answered wrongly with negative marks (07 §14, M04b).
    marks: { type: Number, required: true, min: -1000 },
    criteria: {
      type: [
        {
          _id: false,
          criterionId: { type: Schema.Types.ObjectId, required: true },
          marks: { type: Number, required: true, min: 0 },
        },
      ],
      default: undefined,
    },
    // 'auto' for a question the server marked, otherwise the grader's user id.
    by: { type: String, required: true },
    comment: { type: String, trim: true, maxlength: ASSESSMENT_LIMITS.comment },
  },
  { _id: false },
);

// M04b (TP-05): a question as this attempt was given it — the assessment's question or one drawn from the bank (then
// `bankItemId`), in this attempt's order with its options in this attempt's order. Editing the assessment or the bank
// later never changes it; grading reads it.
const paperItemSchema = new Schema({
  ...itemDefinition,
  sectionId: { type: Schema.Types.ObjectId, default: null },
  bankItemId: { type: Schema.Types.ObjectId, default: null },
});

// M04b (TP-08): the runner's beats and what proctoring noticed, kept for every attempt — the live monitor shows when
// each was last heard from and passes on extra time and messages to proctored and unproctored tests alike. Counts and
// the merge of close serious warnings follow 07 §15.
const proctorSchema = new Schema(
  {
    hard: { type: Number, required: true, min: 0, default: 0 },
    soft: { type: Number, required: true, min: 0, default: 0 },
    lastHardAt: { type: Date, default: null },
    // The newest PROCTOR_LIMITS.events; `counted` is false for a serious warning merged with the one before it.
    events: {
      type: [
        {
          _id: false,
          type: { type: String, enum: PROCTOR_EVENTS, required: true },
          at: { type: Date, required: true },
          counted: { type: Boolean, required: true },
          detail: { type: String, maxlength: 40 },
        },
      ],
      default: [],
    },
    // `proctor-snapshot` uploads (06 §5); no more are taken once PROCTOR_LIMITS.snapshots are kept.
    snapshots: {
      type: [{ _id: false, key: { type: String, required: true }, at: { type: Date, required: true } }],
      default: [],
    },
    // The tab or device the attempt is open on, and when it was last heard from.
    sessionId: { type: String, default: null },
    lastBeatAt: { type: Date, default: null },
    // Minutes the monitor added to this attempt (its deadline already includes them).
    addedMin: { type: Number, required: true, min: 0, default: 0 },
    // The newest PROCTOR_LIMITS.messages from the monitor.
    messages: {
      type: [
        {
          text: { type: String, required: true, maxlength: PROCTOR_LIMITS.message },
          at: { type: Date, required: true },
        },
      ],
      default: [],
    },
    // A grader waived the penalty for serious warnings.
    waived: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

// One document per attempt (05 §5.2). Answers and scores are maps keyed by item id, so each save is one $set.
const submissionSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, required: true },
    // Null for an attempt at a standalone test (M04b).
    offeringId: { type: Schema.Types.ObjectId, default: null },
    studentId: { type: Schema.Types.ObjectId, required: true },
    attemptNo: { type: Number, required: true, min: 1, max: 10 },
    status: { type: String, enum: SUBMISSION_STATUSES, required: true, default: 'in_progress' },
    startedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    late: { type: Boolean, required: true, default: false },
    autoSubmitted: { type: Boolean, required: true, default: false },
    // TP-08: handed in at the serious-warning limit, or by the teacher from the live monitor.
    endedBy: { type: String, enum: ENDED_BY, default: null },
    paper: { type: [paperItemSchema], default: [] },
    answers: { type: Map, of: answerSchema, default: {} },
    // TP-07: questions flagged for review, and seconds spent on each (time per question).
    flags: { type: [Schema.Types.ObjectId], default: [] },
    spent: { type: Map, of: Number, default: {} },
    // TP-06: when each section was first opened and when it closed for good (left, or its time ran out).
    visits: {
      type: [
        {
          _id: false,
          sectionId: { type: Schema.Types.ObjectId, required: true },
          startedAt: { type: Date, required: true },
          closedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
    // The section the runner shows; leaving a "no going back" one closes it (planSectionMove).
    currentSectionId: { type: Schema.Types.ObjectId, default: null },
    proctor: { type: proctorSchema, default: () => ({}) },
    scores: { type: Map, of: scoreSchema, default: {} },
    // TP-09 (LAB-03): each run of a code question's visible tests, the newest 200; a question's runs are counted
    // against its run limit (at most ASSESSMENT_LIMITS.codeItems × runLimit = 150, so none is lost to the slice).
    runs: {
      type: [
        {
          _id: false,
          itemId: { type: Schema.Types.ObjectId, required: true },
          at: { type: Date, required: true },
          passed: { type: Number, required: true, min: 0 },
          total: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
    },
    // TP-09 (LAB-05): every test of every code question, hidden ones included, as the gradeCode job ran them.
    results: {
      type: [
        {
          _id: false,
          itemId: { type: Schema.Types.ObjectId, required: true },
          testCaseId: { type: Schema.Types.ObjectId, required: true },
          status: { type: String, enum: RUN_STATUSES, required: true },
          timeMs: { type: Number, default: null },
          memoryKb: { type: Number, default: null },
        },
      ],
      default: [],
    },
    // When the gradeCode job last ran the code questions.
    codeGradedAt: { type: Date, default: null },
    // Null until every question is scored.
    total: { type: Number, default: null },
    gradedAt: { type: Date },
    gradedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);

// Two tabs starting at once compute the same attemptNo; the second insert fails here and resumes the first.
submissionSchema.index({ assessmentId: 1, studentId: 1, attemptNo: 1 }, { unique: true });
submissionSchema.index({ offeringId: 1, studentId: 1 });
// Counts per status, and the hand-ins list in the order they came in.
submissionSchema.index({ assessmentId: 1, status: 1, submittedAt: 1 });
// The hourly sweep's expired attempts.
submissionSchema.index({ status: 1, deadlineAt: 1 });

// Every read is lean, which returns `answers`, `spent` and `scores` as plain objects keyed by item id, not Maps.
export type SubmissionDoc = FlattenMaps<InferSchemaType<typeof submissionSchema>>;
export const Submission: Model<SubmissionDoc> =
  mongoose.models.Submission ?? mongoose.model('Submission', submissionSchema);
