import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const engagementDailySchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    day: { type: String, required: true, trim: true, maxlength: 10 },
    videoSec: { type: Number, required: true, default: 0, min: 0 },
    liveSec: { type: Number, required: true, default: 0, min: 0 },
    focusedSec: { type: Number, required: true, default: 0, min: 0 },
    quizAttempts: { type: Number, required: true, default: 0, min: 0 },
    codeRuns: { type: Number, required: true, default: 0, min: 0 },
    submissions: { type: Number, required: true, default: 0, min: 0 },
    onTimeSubmissions: { type: Number, required: true, default: 0, min: 0 },
    lessonsCompleted: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

engagementDailySchema.index({ offeringId: 1, studentId: 1, day: 1 }, { unique: true });
engagementDailySchema.index({ offeringId: 1, day: 1 });
engagementDailySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type EngagementDailyDoc = InferSchemaType<typeof engagementDailySchema>;
export const EngagementDaily: Model<EngagementDailyDoc> =
  mongoose.models.EngagementDaily ?? mongoose.model('EngagementDaily', engagementDailySchema);
