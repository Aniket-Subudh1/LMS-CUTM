import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ATTENDANCE_MODES, SESSION_KINDS, SESSION_STATUSES } from '@/lib/schemas/live';

const liveSessionSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: SESSION_KINDS, required: true, default: 'class' },
    // `review` sessions (M07): the project review they hold. Their finalizing writes no attendance (it is one team's).
    reviewId: { type: Schema.Types.ObjectId },
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
    // M03c T2: what students may do in the room; a host turns each off and on while the class runs.
    studentsMay: {
      share: { type: Boolean, default: true },
      unmute: { type: Boolean, default: true },
      chat: { type: Boolean, default: true },
    },
    // M03c T2: students a host removed. They stay out until a host lets them back (at most MAX_REMOVED).
    removed: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, required: true },
        at: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, required: true },
      },
    ],
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
