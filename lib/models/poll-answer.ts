import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// M03c T6 (05 §4.3a): one answer per person and poll; a change replaces it while the poll is open. `userId` is the
// person in the room (a student, or a meeting's member).
const pollAnswerSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, required: true },
    pollId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    optionId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

pollAnswerSchema.index({ pollId: 1, userId: 1 }, { unique: true });
// A poll's counts, one group per option.
pollAnswerSchema.index({ pollId: 1, optionId: 1 });

export type PollAnswerDoc = InferSchemaType<typeof pollAnswerSchema>;
export const PollAnswer: Model<PollAnswerDoc> =
  mongoose.models.PollAnswer ?? mongoose.model('PollAnswer', pollAnswerSchema, 'pollAnswers');
