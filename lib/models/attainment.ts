import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { OUTCOME_CODES } from '@/lib/schemas/structure';

// M09 (05 §5.6): a credit offering's latest attainment (07 §4), written whole by `recomputeAttainment`, never edited by
// hand. It keeps the settings and the CO–PO map it used, so its values always read against the grid they came from
// (A-181). The programme report reads these and stores nothing (M09 decision 4).
const attainmentSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    courseId: { type: Schema.Types.ObjectId, required: true },
    programId: { type: Schema.Types.ObjectId, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
    termId: { type: Schema.Types.ObjectId, required: true },
    config: {
      type: new Schema(
        {
          targetPct: { type: Number, required: true },
          level3Pct: { type: Number, required: true },
          level2Pct: { type: Number, required: true },
          level1Pct: { type: Number, required: true },
          cieWeight: { type: Number, required: true },
          seeWeight: { type: Number, required: true },
          defaultTargetLevel: { type: Number, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    cos: {
      type: [
        {
          _id: false,
          coId: { type: Schema.Types.ObjectId, required: true },
          code: { type: String, required: true },
          statement: { type: String, required: true },
          // Null when no question of a published assessment carried the CO.
          cie: {
            type: new Schema(
              {
                assessed: { type: Number, required: true },
                attained: { type: Number, required: true },
                pct: { type: Number, required: true },
                level: { type: Number, required: true },
              },
              { _id: false },
            ),
            default: null,
          },
          value: { type: Number, default: null },
          met: { type: Boolean, default: null },
        },
      ],
      default: [],
    },
    // The course's one SEE; null without any end-sem row.
    see: {
      type: new Schema(
        {
          considered: { type: Number, required: true },
          attained: { type: Number, required: true },
          pct: { type: Number, required: true },
          level: { type: Number, required: true },
          withoutMarks: { type: Number, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    cells: {
      type: [
        {
          _id: false,
          coId: { type: Schema.Types.ObjectId, required: true },
          outcome: { type: String, enum: OUTCOME_CODES, required: true },
          level: { type: Number, enum: [1, 2, 3], required: true },
        },
      ],
      default: [],
    },
    outcomes: {
      type: [{ _id: false, code: { type: String, enum: OUTCOME_CODES, required: true }, value: { type: Number, default: null } }],
      default: [],
    },
    warnings: { type: [String], default: [] },
    computedAt: { type: Date, required: true },
    // Who pressed "Work it out again"; null when a change queued it.
    computedBy: { type: Schema.Types.ObjectId, default: null },
  },
  { versionKey: false },
);

attainmentSchema.index({ offeringId: 1 }, { unique: true });

export type AttainmentDoc = InferSchemaType<typeof attainmentSchema>;
export const Attainment: Model<AttainmentDoc> =
  mongoose.models.Attainment ?? mongoose.model('Attainment', attainmentSchema, 'attainments');
