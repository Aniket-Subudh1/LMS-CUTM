import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import {
  ATTENDANCE_MODES,
  POLL_STATUSES,
  RECORDING_STATUSES,
  SESSION_KINDS,
  SESSION_STATUSES,
} from '@/lib/schemas/live';

// M03c T4: a meeting's guest, invited by email. Their personal link is their id signed with the session secret
// (lib/auth/meeting-link.ts), so nothing secret is stored. `name` is the name they last joined with (T14).
const guestSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  name: { type: String, trim: true, maxlength: 80 },
});

const liveSessionSchema = new Schema(
  {
    // A class's course; a meeting has none (M03c T4).
    offeringId: {
      type: Schema.Types.ObjectId,
      required(this: { kind: string }) {
        return this.kind !== 'meeting';
      },
    },
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
    // M03c T4, meetings only: the hosts (the scheduler first), the members from the LMS and the guests by email.
    // `sequence` numbers the invitation, so calendars replace an earlier one (06 §8.7). T14 (decision 9): `passcode`,
    // six digits, is asked of anyone joining by their personal link without signing in; meetings scheduled before it
    // have none (A-220).
    meeting: {
      type: {
        _id: false,
        hostIds: { type: [Schema.Types.ObjectId], required: true },
        memberIds: { type: [Schema.Types.ObjectId], default: [] },
        guests: { type: [guestSchema], default: [] },
        sequence: { type: Number, required: true, default: 0 },
        passcode: { type: String, match: /^\d{6}$/ },
      },
      default: undefined,
    },
    // M03c T5: recordings, the latest last (at most MAX_RECORDINGS). `egressId` is empty while one is being started;
    // the egress webhook marks it saved, with its length, or failed.
    recordings: [
      {
        _id: false,
        egressId: { type: String, default: '' },
        key: { type: String, required: true },
        by: { type: Schema.Types.ObjectId, required: true },
        startedAt: { type: Date, required: true },
        endedAt: { type: Date },
        durationSec: { type: Number },
        status: { type: String, enum: RECORDING_STATUSES, required: true },
      },
    ],
    // M03c T6: polls, the latest last (at most POLL_LIMITS.polls), one open at a time. Answers are `pollAnswers`.
    polls: [
      {
        question: { type: String, required: true, maxlength: 200 },
        options: [{ text: { type: String, required: true, maxlength: 120 } }],
        showResults: { type: Boolean, required: true },
        // A host showed the results to everyone before the end.
        sharedAt: { type: Date },
        status: { type: String, enum: POLL_STATUSES, required: true },
        by: { type: Schema.Types.ObjectId, required: true },
        startedAt: { type: Date, required: true },
        endedAt: { type: Date },
      },
    ],
    // M03c T7: the latest breakout rooms. Open from `openedAt` until `closedAt`; `closesAt` is when everyone returns (a
    // time limit, or a host's close plus a minute). Rooms are LiveKit rooms `<roomName>-b<n>`.
    breakout: {
      type: {
        _id: false,
        rooms: { type: Number, required: true },
        assignments: [
          {
            _id: false,
            userId: { type: Schema.Types.ObjectId, required: true },
            room: { type: Number, required: true },
          },
        ],
        openedAt: { type: Date, required: true },
        closesAt: { type: Date },
        closedAt: { type: Date },
        by: { type: Schema.Types.ObjectId, required: true },
      },
      default: undefined,
    },
    // M03c T8: a whiteboard open on the stage, and whether the others may draw. The drawing itself travels between the
    // browsers in the room and is not stored.
    board: {
      type: {
        _id: false,
        by: { type: Schema.Types.ObjectId, required: true },
        openedAt: { type: Date, required: true },
        studentsDraw: { type: Boolean, required: true },
      },
      default: undefined,
    },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

liveSessionSchema.index({ offeringId: 1, scheduledStart: -1 });
liveSessionSchema.index({ status: 1, scheduledEnd: 1 });
// The hourly sweep's "ended but not finalized" (05 §4.3).
liveSessionSchema.index({ status: 1, finalizedAt: 1 });
liveSessionSchema.index({ roomName: 1 }, { unique: true });
// M03c T4: the Meetings page lists the meetings a person hosts or is invited to; a guest's link finds theirs.
liveSessionSchema.index({ 'meeting.hostIds': 1, scheduledStart: -1 });
liveSessionSchema.index({ 'meeting.memberIds': 1, scheduledStart: -1 });
liveSessionSchema.index({ 'meeting.guests._id': 1 });

export type LiveSessionDoc = InferSchemaType<typeof liveSessionSchema>;
export const LiveSession: Model<LiveSessionDoc> =
  mongoose.models.LiveSession ?? mongoose.model('LiveSession', liveSessionSchema);
