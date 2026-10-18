import mongoose, { Schema, type FlattenMaps, type InferSchemaType, type Model } from 'mongoose';
import { itemDefinition } from '@/lib/models/assessment';
import { ASSESSMENT_LIMITS, SUBMISSION_STATUSES } from '@/lib/schemas/assessment';

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
    scores: { type: Map, of: scoreSchema, default: {} },
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
