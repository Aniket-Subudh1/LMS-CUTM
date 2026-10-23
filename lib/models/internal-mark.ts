import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { THEORY_PARTS, TRENDS } from '@/lib/schemas/marks';

// M06 (05 §5.3): one active student's internal marks in a credit offering, as `recomputeInternalMarks` last worked them
// out (07 §2–3). Written whole for the class at once; never edited by hand. Values are unrounded.
const internalMarkSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    // The theory parts in order (none without theory credits); `count` is the assessments, or classes held, behind one.
    parts: {
      type: [
        {
          _id: false,
          key: { type: String, enum: THEORY_PARTS, required: true },
          marks: { type: Number, default: null },
          max: { type: Number, required: true },
          count: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
    },
    attendancePct: { type: Number, default: null },
    // Each component's internal marks; a component the course lacks is absent, one still incomplete is null.
    components: {
      type: new Schema({ theory: Number, practice: Number, project: Number }, { _id: false }),
      required: true,
    },
    internalPct: { type: Number, default: null },
    complete: { type: Boolean, required: true },
    trend: { type: String, enum: TRENDS, required: true },
    slope: { type: Number, default: null },
    // The last `ceTrend.window` published percentages, oldest first.
    points: { type: [Number], default: [] },
    computedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

internalMarkSchema.index({ offeringId: 1, studentId: 1 }, { unique: true });

export type InternalMarkDoc = InferSchemaType<typeof internalMarkSchema>;
export const InternalMark: Model<InternalMarkDoc> =
  mongoose.models.InternalMark ?? mongoose.model('InternalMark', internalMarkSchema, 'internalMarks');
