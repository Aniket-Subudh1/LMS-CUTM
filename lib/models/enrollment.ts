import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// Nightly snapshot written by M10; declared now because 05 §3.9 lists it.
const engagementSchema = new Schema(
  {
    score: { type: Number },
    band: { type: String },
    trend: { type: String, required: true },
    signals: {
      attendance: { type: Number },
      video: { type: Number },
      timeliness: { type: Number },
      practice: { type: Number },
      activity: { type: Number },
    },
    computedAt: { type: Date, required: true },
  },
  { _id: false },
);

const enrollmentSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ['active', 'dropped'], required: true, default: 'active' },
    engagement: { type: engagementSchema },
  },
  { timestamps: true },
);

enrollmentSchema.index({ offeringId: 1, studentId: 1 }, { unique: true });
enrollmentSchema.index({ studentId: 1, status: 1 });
enrollmentSchema.index({ offeringId: 1, status: 1 });

export type EnrollmentDoc = InferSchemaType<typeof enrollmentSchema>;
export const Enrollment: Model<EnrollmentDoc> =
  mongoose.models.Enrollment ?? mongoose.model('Enrollment', enrollmentSchema);
