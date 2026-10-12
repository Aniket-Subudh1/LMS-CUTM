import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { CATEGORIES, OFFERING_STATUSES, PROJECT_MODES } from '@/lib/schemas/structure';

const moduleSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  order: { type: Number, required: true },
});

const calendarSchema = new Schema({
  date: { type: Date, required: true },
  topic: { type: String, required: true, trim: true, maxlength: 200 },
  coIds: { type: [Schema.Types.ObjectId], default: [] },
});

const planSchema = new Schema(
  {
    doc: { type: Schema.Types.Mixed },
    version: { type: Number, required: true, default: 0 },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId },
  },
  { _id: false },
);

const offeringSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, required: true },
    termId: { type: Schema.Types.ObjectId, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
    // null = the whole batch; stored explicitly so the unique index treats it as one value.
    section: { type: String, trim: true, maxlength: 10, default: null },
    programId: { type: Schema.Types.ObjectId, required: true },
    departmentId: { type: Schema.Types.ObjectId, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    title: { type: String, required: true, trim: true },
    facultyIds: { type: [Schema.Types.ObjectId], required: true },
    schemeId: { type: Schema.Types.ObjectId, default: null },
    projectMode: { type: String, enum: PROJECT_MODES, default: null },
    modules: { type: [moduleSchema], default: [] },
    plan: { type: planSchema, default: () => ({ version: 0 }) },
    calendar: { type: [calendarSchema], default: [] },
    status: { type: String, enum: OFFERING_STATUSES, required: true, default: 'draft' },
    lockedAt: { type: Date },
    lockedBy: { type: Schema.Types.ObjectId },
    lastPushedAt: { type: Date },
  },
  { timestamps: true },
);

offeringSchema.index({ courseId: 1, termId: 1, batchId: 1, section: 1 }, { unique: true });
offeringSchema.index({ facultyIds: 1, status: 1 });
offeringSchema.index({ departmentId: 1, termId: 1 });
offeringSchema.index({ batchId: 1, termId: 1 });
offeringSchema.index({ termId: 1, status: 1 });

export type OfferingDoc = InferSchemaType<typeof offeringSchema>;
export const Offering: Model<OfferingDoc> = mongoose.models.Offering ?? mongoose.model('Offering', offeringSchema);
