import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { COMPONENTS } from '@/lib/schemas/exams';

// M08 (05 §5.4, decision 1): one student's external marks in a credit offering, from the exam section's file — one
// entry per component the offering has. `marks` is null exactly when the student was absent.
const endSemMarkSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    externals: {
      type: [
        {
          _id: false,
          component: { type: String, enum: COMPONENTS, required: true },
          marks: { type: Number, default: null },
          max: { type: Number, required: true },
          absent: { type: Boolean, required: true },
        },
      ],
      required: true,
    },
    source: { type: String, enum: ['csv', 'api'], required: true },
    syncRunId: { type: Schema.Types.ObjectId, required: true },
    importedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

endSemMarkSchema.index({ offeringId: 1, studentId: 1 }, { unique: true });

export type EndSemMarkDoc = InferSchemaType<typeof endSemMarkSchema>;
export const EndSemMark: Model<EndSemMarkDoc> =
  mongoose.models.EndSemMark ?? mongoose.model('EndSemMark', endSemMarkSchema, 'endSemMarks');
