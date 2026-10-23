import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// A course listed by a programme (M01b, 05 §3.6a). A programme lists at most 1,000 courses.
const curriculumEntrySchema = new Schema(
  {
    programId: { type: Schema.Types.ObjectId, required: true },
    courseId: { type: Schema.Types.ObjectId, required: true },
    // denorm: the course's code, so a programme's list sorts by code with one index.
    courseCode: { type: String, required: true, maxlength: 20 },
    // The name of one of the programme's baskets; null = no basket.
    basket: { type: String, trim: true, maxlength: 60, default: null },
    // Labels from the Course Repository for this programme: "CSE", "Foundation", "Humanities and Management(A)".
    stream: { type: String, trim: true, maxlength: 60, default: null },
    courseType: { type: String, trim: true, maxlength: 80, default: null },
  },
  { timestamps: true },
);

curriculumEntrySchema.index({ programId: 1, courseId: 1 }, { unique: true });
curriculumEntrySchema.index({ programId: 1, basket: 1, courseCode: 1 });
curriculumEntrySchema.index({ courseId: 1 });

export type CurriculumEntryDoc = InferSchemaType<typeof curriculumEntrySchema>;
export const CurriculumEntry: Model<CurriculumEntryDoc> =
  mongoose.models.CurriculumEntry ?? mongoose.model('CurriculumEntry', curriculumEntrySchema);
