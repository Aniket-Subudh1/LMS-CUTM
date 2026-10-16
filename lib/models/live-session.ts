import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ATTENDANCE_MODES, SESSION_KINDS, SESSION_STATUSES } from '@/lib/schemas/live';

const liveSessionSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: SESSION_KINDS, required: true, default: 'class' },
    // `review` sessions (M07): the project_review assessment they serve.
    assessmentId: { type: Schema.Types.ObjectId },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    scheduledStart: { type: Date, required: true },
    scheduledEnd: { type: Date, required: true },
    startedAt: { type: Date },
    endedAt: { type: Date },
    status: { type: String, enum: SESSION_STATUSES, required: true, default: 'scheduled' },
    // `ls-<sessionId>`: the live engine's room.
    roomName: { type: String, required: true },
    attendanceMode: { type: String, enum: ATTENDANCE_MODES, required: true },
    // Set once derived attendance is written (07 §10).
    finalizedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

liveSessionSchema.index({ offeringId: 1, scheduledStart: -1 });
liveSessionSchema.index({ status: 1, scheduledEnd: 1 });
// The hourly sweep's "ended but not finalized" (05 §4.3).
liveSessionSchema.index({ status: 1, finalizedAt: 1 });
liveSessionSchema.index({ roomName: 1 }, { unique: true });

export type LiveSessionDoc = InferSchemaType<typeof liveSessionSchema>;
export const LiveSession: Model<LiveSessionDoc> =
  mongoose.models.LiveSession ?? mongoose.model('LiveSession', liveSessionSchema);
