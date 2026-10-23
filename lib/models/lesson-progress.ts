import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const lessonProgressSchema = new Schema(
  {
    lessonId: { type: Schema.Types.ObjectId, required: true },
    offeringId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    // Merged watched intervals in whole seconds, at most 200 (07 §8).
    ranges: { type: [[Number]], default: [] },
    watchedSec: { type: Number, required: true, default: 0, min: 0 },
    progressPct: { type: Number, required: true, default: 0, min: 0, max: 100 },
    completedAt: { type: Date },
    openedAt: { type: Date },
    lastBeaconAt: { type: Date },
  },
  { timestamps: true },
);

lessonProgressSchema.index({ lessonId: 1, studentId: 1 }, { unique: true });
lessonProgressSchema.index({ offeringId: 1, studentId: 1 });
// Home's "Continue learning": a student's most recently watched videos.
lessonProgressSchema.index({ studentId: 1, lastBeaconAt: -1 });

export type LessonProgressDoc = InferSchemaType<typeof lessonProgressSchema>;
export const LessonProgress: Model<LessonProgressDoc> =
  mongoose.models.LessonProgress ?? mongoose.model('LessonProgress', lessonProgressSchema);
