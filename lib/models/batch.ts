import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const batchSchema = new Schema(
  {
    programId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    startYear: { type: Number, required: true },
    sections: { type: [{ type: String, trim: true, maxlength: 10 }], default: [] },
    status: { type: String, enum: ['active', 'graduated'], required: true, default: 'active' },
  },
  { timestamps: true },
);

batchSchema.index({ programId: 1, startYear: 1 }, { unique: true });

export type BatchDoc = InferSchemaType<typeof batchSchema>;
export const Batch: Model<BatchDoc> = mongoose.models.Batch ?? mongoose.model('Batch', batchSchema);
