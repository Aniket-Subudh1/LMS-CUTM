import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { LESSON_KINDS } from '@/lib/schemas/content';

const lessonSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    moduleId: { type: Schema.Types.ObjectId, required: true },
    order: { type: Number, required: true },
    kind: { type: String, enum: LESSON_KINDS, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: Schema.Types.Mixed },
    fileKey: { type: String },
    fileName: { type: String, maxlength: 120 },
    contentType: { type: String },
    size: { type: Number, min: 1 },
    durationSec: { type: Number, min: 1 },
    // The 480p data-saver copy (ADR-19); the original always plays, `failed` only means there is no copy.
    lowKey: { type: String },
    transcode: { type: String, enum: ['pending', 'ready', 'failed'] },
    url: { type: String, maxlength: 500 },
    published: { type: Boolean, required: true, default: false },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

lessonSchema.index({ offeringId: 1, moduleId: 1, order: 1 });
lessonSchema.index({ offeringId: 1, published: 1 });

export type LessonDoc = InferSchemaType<typeof lessonSchema>;
export const Lesson: Model<LessonDoc> = mongoose.models.Lesson ?? mongoose.model('Lesson', lessonSchema);
