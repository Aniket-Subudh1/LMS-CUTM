import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { BLOOM_LEVELS, CATALOG_LIMITS, COURSE_TYPES, OUTCOME_CODES, SESSION_KINDS } from '@/lib/schemas/structure';

const creditPart = { type: Number, required: true, min: 0, max: 30 };
// T-P-Pj: theory, practice and project credits (07 §17). Offerings keep a copy made when they are created.
export const creditsSchema = new Schema(
  { theory: creditPart, practice: creditPart, project: creditPart },
  { _id: false },
);

const coSchema = new Schema({
  code: { type: String, required: true, trim: true, maxlength: 10 },
  statement: { type: String, required: true, trim: true, maxlength: CATALOG_LIMITS.coStatement },
  bloomLevels: { type: [{ type: String, enum: BLOOM_LEVELS }], default: [] },
  // A level guessed from the statement's verb by the import; it becomes `bloomLevels` only when a person saves.
  suggestedBloom: { type: String, enum: BLOOM_LEVELS, default: null },
  targetLevel: { type: Number, min: 0, max: 3 },
});

const coMapSchema = new Schema(
  {
    coId: { type: Schema.Types.ObjectId, required: true },
    outcome: { type: String, enum: OUTCOME_CODES, required: true },
    level: { type: Number, enum: [1, 2, 3], required: true },
  },
  { _id: false },
);

const moduleSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: CATALOG_LIMITS.moduleTitle },
  // As the syllabus writes it: "6" or "4+0+2" (theory + practice + project hours).
  hours: { type: String, trim: true, maxlength: CATALOG_LIMITS.moduleHours, default: null },
  topics: { type: String, trim: true, maxlength: CATALOG_LIMITS.moduleTopics, default: '' },
  practicals: { type: [{ type: String, trim: true, maxlength: CATALOG_LIMITS.practical }], default: [] },
});

const sessionSchema = new Schema(
  {
    topic: { type: String, required: true, trim: true, maxlength: CATALOG_LIMITS.sessionTopic },
    kind: { type: String, enum: SESSION_KINDS, required: true },
  },
  { _id: false },
);

// Where an imported course came from (ADM-07). `lastRunId` lets a run count each page once.
const sourceSchema = new Schema(
  {
    coursewareId: { type: Number, required: true },
    url: { type: String, required: true },
    importedAt: { type: Date, required: true },
    contentHash: { type: String, required: true },
    facultyName: { type: String, default: null },
    lastRunId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);

const text = (max: number) => ({ type: String, trim: true, maxlength: max });

const courseSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    type: { type: String, enum: COURSE_TYPES, default: null },
    credits: { type: creditsSchema, required: true },
    status: { type: String, enum: ['draft', 'active', 'archived'], required: true, default: 'draft' },
    coordinatorId: { type: Schema.Types.ObjectId, default: null },
    objectives: { type: [text(CATALOG_LIMITS.objective)], default: [] },
    cos: { type: [coSchema], default: [] },
    // The highest CO number this course has given (M03b): a deleted CO6 is followed by CO7 (nextCoCode).
    coSeq: { type: Number, min: 0, default: 0 },
    coMap: { type: [coMapSchema], default: [] },
    modules: { type: [moduleSchema], default: [] },
    projects: { type: [text(CATALOG_LIMITS.project)], default: [] },
    textbooks: { type: [text(CATALOG_LIMITS.book)], default: [] },
    references: { type: [text(CATALOG_LIMITS.book)], default: [] },
    sessionPlan: { type: [sessionSchema], default: [] },
    syllabusFileKey: { type: String },
    source: { type: sourceSchema, default: null },
    // Set by every content edit in the LMS; from then on the courseware import leaves the content alone.
    contentEditedAt: { type: Date, default: null },
    issues: { type: [text(CATALOG_LIMITS.issue)], default: [] },
    reviewNeeded: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

courseSchema.index({ code: 1 }, { unique: true });
courseSchema.index({ status: 1, code: 1 });
courseSchema.index({ type: 1, code: 1 });
courseSchema.index({ reviewNeeded: 1, code: 1 });
courseSchema.index({ coordinatorId: 1, code: 1 });
courseSchema.index(
  { 'source.coursewareId': 1 },
  { unique: true, partialFilterExpression: { 'source.coursewareId': { $type: 'number' } } },
);
courseSchema.index({ code: 'text', title: 'text' });

export type CourseDoc = InferSchemaType<typeof courseSchema>;
export const Course: Model<CourseDoc> = mongoose.models.Course ?? mongoose.model('Course', courseSchema);
