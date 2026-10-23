import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { creditsSchema } from '@/lib/models/course';
import { COMPONENTS, EXAM_LIMITS, GRADE_SHEET_STATUSES } from '@/lib/schemas/exams';

// M08 (05 §5.5, 07 §6): one student's grade sheet for a term. Written by the `gradeSheets` job, which never touches a
// published one; an `incomplete` sheet has no rows and says in `missing` what keeps it from being worked out.
const gradeSheetSchema = new Schema(
  {
    termId: { type: Schema.Types.ObjectId, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    programId: { type: Schema.Types.ObjectId, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
    rows: {
      type: [
        {
          _id: false,
          offeringId: { type: Schema.Types.ObjectId, required: true },
          courseCode: { type: String, required: true },
          courseTitle: { type: String, required: true },
          credits: { type: creditsSchema, required: true },
          // Each component the course has, unrounded: internal + external out of 100 (an absent part counts 0).
          components: {
            type: [
              {
                _id: false,
                component: { type: String, enum: COMPONENTS, required: true },
                internal: { type: Number, required: true },
                internalMax: { type: Number, required: true },
                external: { type: Number, default: null },
                externalMax: { type: Number, required: true },
                absent: { type: Boolean, required: true },
                marks: { type: Number, required: true },
              },
            ],
            required: true,
          },
          pct: { type: Number, required: true },
          grade: { type: String, required: true },
          gradePoint: { type: Number, required: true },
        },
      ],
      default: [],
      validate: (rows: unknown[]) => rows.length <= EXAM_LIMITS.rows,
    },
    credits: { type: Number, required: true, default: 0 },
    sgpa: { type: Number, default: null },
    status: { type: String, enum: GRADE_SHEET_STATUSES, required: true },
    missing: {
      type: [{ type: String, maxlength: 200 }],
      default: [],
      validate: (missing: unknown[]) => missing.length <= EXAM_LIMITS.missing,
    },
    computedAt: { type: Date, required: true },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, default: null },
  },
  { versionKey: false },
);

gradeSheetSchema.index({ termId: 1, studentId: 1 }, { unique: true });
gradeSheetSchema.index({ termId: 1, batchId: 1, status: 1 });
gradeSheetSchema.index({ 'rows.offeringId': 1, status: 1 });

export type GradeSheetDoc = InferSchemaType<typeof gradeSheetSchema>;
export const GradeSheet: Model<GradeSheetDoc> =
  mongoose.models.GradeSheet ?? mongoose.model('GradeSheet', gradeSheetSchema, 'gradeSheets');
