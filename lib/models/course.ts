import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { BLOOM_LEVELS, CATEGORIES, COMPONENTS } from '@/lib/schemas/structure';

const coSchema = new Schema({
  code: { type: String, required: true, trim: true, maxlength: 10 },
  statement: { type: String, required: true, trim: true, maxlength: 500 },
  bloomLevel: { type: String, enum: BLOOM_LEVELS, required: true },
  targetLevel: { type: Number, min: 0, max: 3 },
});

const coMapSchema = new Schema(
  {
    coId: { type: Schema.Types.ObjectId, required: true },
    outcome: { type: String, required: true, trim: true, maxlength: 10 },
    level: { type: Number, enum: [1, 2, 3], required: true },
  },
  { _id: false },
);

const courseSchema = new Schema(
  {
    programId: { type: Schema.Types.ObjectId, required: true },
    departmentId: { type: Schema.Types.ObjectId, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    credits: { type: Number, required: true, min: 0, max: 30 },
    components: { type: [{ type: String, enum: COMPONENTS }], required: true },
    componentKey: { type: String, required: true },
    syllabusText: { type: Schema.Types.Mixed },
    syllabusFileKey: { type: String },
    objectives: { type: [{ type: String, trim: true, maxlength: 500 }], default: [] },
    cos: { type: [coSchema], default: [] },
    coMap: { type: [coMapSchema], default: [] },
    status: { type: String, enum: ['draft', 'active', 'archived'], required: true, default: 'draft' },
  },
  { timestamps: true },
);

courseSchema.index({ programId: 1, code: 1 }, { unique: true });
courseSchema.index({ departmentId: 1, status: 1 });

export type CourseDoc = InferSchemaType<typeof courseSchema>;
export const Course: Model<CourseDoc> = mongoose.models.Course ?? mongoose.model('Course', courseSchema);
