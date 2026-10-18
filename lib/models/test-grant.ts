import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// Who may take a standalone test (M04b, TP-01): one row per person let in, through which link.
const testGrantSchema = new Schema({
  assessmentId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  linkId: { type: Schema.Types.ObjectId, required: true },
  grantedAt: { type: Date, required: true },
});

testGrantSchema.index({ assessmentId: 1, userId: 1 }, { unique: true });
// "My tests", newest first.
testGrantSchema.index({ userId: 1, grantedAt: -1 });

export type TestGrantDoc = InferSchemaType<typeof testGrantSchema>;
export const TestGrant: Model<TestGrantDoc> = mongoose.models.TestGrant ?? mongoose.model('TestGrant', testGrantSchema);
