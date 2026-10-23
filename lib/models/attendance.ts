import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ATTENDANCE_SOURCES, ATTENDANCE_STATUSES } from '@/lib/schemas/live';

// One connection to the room, from the engine's webhooks; `sid` names the connection (05 §4.4).
const presenceSchema = new Schema(
  {
    sid: { type: String, required: true, maxlength: 64 },
    joinedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
  },
  { _id: false },
);

const attendanceSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, required: true },
    offeringId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    // Unset while the class runs; set when it is finalized or the teacher marks it.
    status: { type: String, enum: ATTENDANCE_STATUSES },
    source: { type: String, enum: ATTENDANCE_SOURCES, required: true, default: 'derived' },
    presence: { type: [presenceSchema], default: [] },
    presenceSec: { type: Number, required: true, default: 0, min: 0 },
    focusedSec: { type: Number, required: true, default: 0, min: 0 },
    lastFocusAt: { type: Date },
    markedBy: { type: Schema.Types.ObjectId },
    markedAt: { type: Date },
  },
  { timestamps: true },
);

attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
attendanceSchema.index({ offeringId: 1, studentId: 1 });

export type AttendanceDoc = InferSchemaType<typeof attendanceSchema>;
export const Attendance: Model<AttendanceDoc> =
  mongoose.models.Attendance ?? mongoose.model('Attendance', attendanceSchema);
