import mongoose, { Schema, type FlattenMaps, type InferSchemaType, type Model } from 'mongoose';
import { RUBRIC_COMPONENTS } from '@/lib/schemas/marks';

// M06 (05 §5.3a, Q-41): the practice or project internal rubric a teacher filled for one student, keyed as in the
// evaluation policy. Only the criteria filled so far are stored. External marks never come here (M08).
const rubricMarkSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    component: { type: String, enum: RUBRIC_COMPONENTS, required: true },
    criteria: { type: Map, of: Number, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

rubricMarkSchema.index({ offeringId: 1, studentId: 1, component: 1 }, { unique: true });

// Reads are lean, which returns `criteria` as a plain object.
export type RubricMarkDoc = FlattenMaps<InferSchemaType<typeof rubricMarkSchema>>;
export const RubricMark: Model<RubricMarkDoc> =
  mongoose.models.RubricMark ?? mongoose.model('RubricMark', rubricMarkSchema, 'rubricMarks');
