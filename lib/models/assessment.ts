import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import {
  ASSESSMENT_LIMITS,
  ASSESSMENT_MODES,
  ASSESSMENT_STATUSES,
  ATTEMPT_POLICIES,
  ITEM_TYPES,
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
const answerKeySchema = new Schema(
  {
    optionId: { type: Schema.Types.ObjectId },
    optionIds: { type: [Schema.Types.ObjectId], default: undefined },
    value: { type: Number },
    tolerance: { type: Number, min: 0 },
  },
  { _id: false },
);

const itemSchema = new Schema({
  type: { type: String, enum: ITEM_TYPES, required: true },
  prompt: { type: Schema.Types.Mixed, required: true },
  maxMarks: { type: Number, required: true, min: 0.01, max: 1000 },
  // CPP-05/06: at least one for a credit course; each is one of the course's COs (deleteCo refuses one in use).
  coIds: { type: [Schema.Types.ObjectId], default: [] },
  bloomLevel: { type: String, enum: BLOOM_LEVELS, default: null },
  options: { type: [optionSchema], default: undefined },
  answer: { type: answerKeySchema, default: undefined },
  rubric: { type: [criterionSchema], default: undefined },
});

const assessmentSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    mode: { type: String, enum: ASSESSMENT_MODES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    instructions: { type: Schema.Types.Mixed },
    items: { type: [itemSchema], default: [] },
    // Σ items.maxMarks, kept with every change to the questions.
    maxMarks: { type: Number, required: true, default: 0 },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    lateUntil: { type: Date, default: null },
    durationMin: { type: Number, min: 1, max: 600, default: null },
    attemptsAllowed: { type: Number, required: true, min: 1, max: 10, default: 1 },
    attemptPolicy: { type: String, enum: ATTEMPT_POLICIES, required: true, default: 'best' },
    shuffleItems: { type: Boolean, required: true, default: false },
    shuffleOptions: { type: Boolean, required: true, default: false },
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

export type AssessmentDoc = InferSchemaType<typeof assessmentSchema>;
export const Assessment: Model<AssessmentDoc> =
  mongoose.models.Assessment ?? mongoose.model('Assessment', assessmentSchema);
