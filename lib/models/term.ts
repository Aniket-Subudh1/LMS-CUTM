import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { TERM_STATUSES } from '@/lib/schemas/structure';

const termSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    academicYear: { type: String, required: true, trim: true, maxlength: 9 },
    startsOn: { type: Date, required: true },
    endsOn: { type: Date, required: true },
    status: { type: String, enum: TERM_STATUSES, required: true, default: 'upcoming' },
  },
  { timestamps: true },
);

termSchema.index({ code: 1 }, { unique: true });
termSchema.index({ status: 1 });

export type TermDoc = InferSchemaType<typeof termSchema>;
export const Term: Model<TermDoc> = mongoose.models.Term ?? mongoose.model('Term', termSchema);
