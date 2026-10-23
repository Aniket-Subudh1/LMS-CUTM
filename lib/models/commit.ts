import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// M07 (05 §6.3): a commit of a linked repository, as the sync found it. `studentId` is the member whose linked GitHub
// account (by id, then login) made it; null when nobody's is.
const commitSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, required: true },
  sha: { type: String, required: true },
  authorLogin: { type: String, default: null },
  authorId: { type: Number, default: null },
  studentId: { type: Schema.Types.ObjectId, default: null },
  committedAt: { type: Date, required: true },
  message: { type: String, required: true, maxlength: 500 },
  additions: { type: Number, required: true, min: 0 },
  deletions: { type: Number, required: true, min: 0 },
  isMerge: { type: Boolean, required: true },
});

commitSchema.index({ projectId: 1, sha: 1 }, { unique: true });
commitSchema.index({ projectId: 1, committedAt: 1 });
commitSchema.index({ projectId: 1, studentId: 1 });

export type CommitDoc = InferSchemaType<typeof commitSchema>;
export const Commit: Model<CommitDoc> = mongoose.models.Commit ?? mongoose.model('Commit', commitSchema);
