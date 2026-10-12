import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { CATEGORIES } from '@/lib/schemas/structure';

const outcomeSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, maxlength: 10 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const programSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    departmentId: { type: Schema.Types.ObjectId, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    durationSemesters: { type: Number, required: true, min: 1, max: 12 },
    pos: { type: [outcomeSchema], default: [] },
    psos: { type: [outcomeSchema], default: [] },
    status: { type: String, enum: ['active', 'archived'], required: true, default: 'active' },
  },
  { timestamps: true },
);

programSchema.index({ code: 1 }, { unique: true });
programSchema.index({ departmentId: 1, status: 1 });

export type ProgramDoc = InferSchemaType<typeof programSchema>;
export const Program: Model<ProgramDoc> = mongoose.models.Program ?? mongoose.model('Program', programSchema);
