import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { creditsSchema } from '@/lib/models/course';
import { CATEGORIES, OFFERING_STATUSES, PROJECT_MODES, SESSION_KINDS } from '@/lib/schemas/structure';

const moduleSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  order: { type: Number, required: true },
  // One line under the module's title in the builder and the student's Lessons tab (M03b).
  summary: { type: String, trim: true, maxlength: 300 },
});

// Rows keep their ids across edits and stay sorted by (date, _id) (M03b); `kind` replaces the "Practice: " prefix.
const calendarSchema = new Schema({
  date: { type: Date, required: true },
  topic: { type: String, required: true, trim: true, maxlength: 200 },
  coIds: { type: [Schema.Types.ObjectId], default: [] },
  kind: { type: String, enum: SESSION_KINDS, default: null },
});

const planSchema = new Schema(
  {
    doc: { type: Schema.Types.Mixed },
    version: { type: Number, required: true, default: 0 },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId },
    // The last save of the plan text or a session: after publishedAt, the page offers to publish a new version.
    changedAt: { type: Date },
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
    // denorm from the batch's programme (A-56).
    programId: { type: Schema.Types.ObjectId, required: true },
    departmentId: { type: Schema.Types.ObjectId, required: true },
    // `ugc` for a credit course, `skill` for a non-credit one (A-55), from the credits copied below.
    category: { type: String, enum: CATEGORIES, required: true },
    title: { type: String, required: true, trim: true },
    facultyIds: { type: [Schema.Types.ObjectId], required: true },
    // Copies made when the offering is created (05 §3.8): the course's T-P-Pj and the evaluation policy (null for a
    // non-credit course). Later edits to either leave this offering's marks alone.
    credits: { type: creditsSchema, required: true },
    evaluation: { type: Schema.Types.Mixed, default: null },
    projectMode: { type: String, enum: PROJECT_MODES, default: null },
    modules: { type: [moduleSchema], default: [] },
    plan: { type: planSchema, default: () => ({ version: 0 }) },
    calendar: { type: [calendarSchema], default: [] },
    status: { type: String, enum: OFFERING_STATUSES, required: true, default: 'draft' },
    // The class's cover picture (offering-cover), on its course card and workspace header; else a tone from the code.
    coverKey: { type: String },
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
offeringSchema.index({ status: 1, _id: -1 });
// The admin offering list's search box: the title carries the course code and title, term and section (17 Oct 2026).
offeringSchema.index({ title: 'text' });

export type OfferingDoc = InferSchemaType<typeof offeringSchema>;
export const Offering: Model<OfferingDoc> = mongoose.models.Offering ?? mongoose.model('Offering', offeringSchema);
