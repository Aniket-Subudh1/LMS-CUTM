import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { BASKET_SCOPES, OUTCOME_CODES } from '@/lib/schemas/structure';

// CPP-02 since M01b: the codes PO1–PO12 and PSO1–PSO3 are fixed; a programme only titles them.
const outcomeTitleSchema = new Schema(
  {
    code: { type: String, enum: OUTCOME_CODES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { _id: false },
);

// A group in the programme structure ("Basket I"), core or choice, with the credits a student must take from it.
const basketSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  title: { type: String, trim: true, maxlength: 120, default: null },
  scope: { type: String, enum: BASKET_SCOPES, default: null },
  minCredits: { type: Number, min: 0, max: 300, default: null },
});

const programSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    // Null for a programme created by the course-list upload until an admin sets it (A-61); offerings need it.
    departmentId: { type: Schema.Types.ObjectId, default: null },
    durationSemesters: { type: Number, min: 1, max: 12, default: null },
    outcomeTitles: { type: [outcomeTitleSchema], default: [] },
    baskets: { type: [basketSchema], default: [] },
    status: { type: String, enum: ['active', 'archived'], required: true, default: 'active' },
  },
  { timestamps: true },
);

programSchema.index({ code: 1 }, { unique: true });
programSchema.index({ departmentId: 1, status: 1 });

export type ProgramDoc = InferSchemaType<typeof programSchema>;
export const Program: Model<ProgramDoc> = mongoose.models.Program ?? mongoose.model('Program', programSchema);
