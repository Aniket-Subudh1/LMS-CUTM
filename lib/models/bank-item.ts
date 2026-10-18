import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { itemDefinition } from '@/lib/models/assessment';

// A question in a bank (M04b, TP-05): a catalogue course's, shared by every offering of it in any term, or one member
// of staff's, for their standalone tests. Exactly one of `courseId` and `ownerId` is set. Papers copy what they draw.
const bankItemSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, default: null },
    ownerId: { type: Schema.Types.ObjectId, default: null },
    ...itemDefinition,
    // TP-10: written by the AI and not yet reviewed. Saving it in its dialog accepts it; until then no paper draws it
    // and "From the bank" does not offer it.
    aiDraft: { type: Boolean, default: false },
    // How many attempts' papers drew it (the bank's "Used" column).
    usedCount: { type: Number, required: true, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: 'questionBank' },
);

// The bank page, newest first; and a draw's candidates by type and level (bounded by BANK_LIMITS.perBank).
bankItemSchema.index({ courseId: 1, createdAt: -1 }, { partialFilterExpression: { courseId: { $type: 'objectId' } } });
bankItemSchema.index({ ownerId: 1, createdAt: -1 }, { partialFilterExpression: { ownerId: { $type: 'objectId' } } });
bankItemSchema.index({ courseId: 1, type: 1, difficulty: 1 });
bankItemSchema.index({ ownerId: 1, type: 1, difficulty: 1 });

export type BankItemDoc = InferSchemaType<typeof bankItemSchema>;
export const BankItem: Model<BankItemDoc> = mongoose.models.BankItem ?? mongoose.model('BankItem', bankItemSchema);
