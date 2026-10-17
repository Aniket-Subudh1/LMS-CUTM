import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
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
    optionIds: { type: [Schema.Types.ObjectId], default: undefined },
    value: { type: Number },
    text: { type: Schema.Types.Mixed },
    files: { type: [fileSchema], default: undefined },
  },
  { _id: false },
);

const scoreSchema = new Schema(
  {
    marks: { type: Number, required: true, min: 0 },
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

// One document per attempt (05 §5.2). Answers and scores are maps keyed by item id, so each save is one $set.
const submissionSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, required: true },
    offeringId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    attemptNo: { type: Number, required: true, min: 1, max: 10 },
    status: { type: String, enum: SUBMISSION_STATUSES, required: true, default: 'in_progress' },
    startedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    late: { type: Boolean, required: true, default: false },
    autoSubmitted: { type: Boolean, required: true, default: false },
    // This attempt's order of questions and of each question's options (seededShuffle).
    order: {
      type: [
        {
          _id: false,
          itemId: { type: Schema.Types.ObjectId, required: true },
          optionIds: { type: [Schema.Types.ObjectId], default: undefined },
        },
      ],
      default: [],
    },
    answers: { type: Map, of: answerSchema, default: {} },
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

export type SubmissionDoc = InferSchemaType<typeof submissionSchema>;
export const Submission: Model<SubmissionDoc> =
  mongoose.models.Submission ?? mongoose.model('Submission', submissionSchema);
