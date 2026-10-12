import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { AGGREGATIONS, ASSESSMENT_MODES, COMPONENT_KEYS, ROUNDING_MODES } from '@/lib/schemas/structure';

const schemeComponentSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    weight: { type: Number, required: true, min: 0 },
    modes: { type: [{ type: String, enum: ASSESSMENT_MODES }], required: true },
    aggregation: { type: String, enum: AGGREGATIONS, required: true },
    bestN: { type: Number, min: 1 },
  },
  { _id: false },
);

// Immutable once written: "editing" a scheme inserts version n+1 (05 §3.7).
const evaluationSchemeSchema = new Schema(
  {
    componentKey: { type: String, enum: COMPONENT_KEYS, required: true },
    version: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    internalMax: { type: Number, required: true, min: 0, max: 200 },
    externalMax: { type: Number, required: true, min: 0, max: 200 },
    components: { type: [schemeComponentSchema], required: true },
    rounding: {
      type: new Schema(
        {
          decimals: { type: Number, enum: [0, 1, 2], required: true },
          mode: { type: String, enum: ROUNDING_MODES, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    status: { type: String, enum: ['active', 'retired'], required: true, default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

evaluationSchemeSchema.index({ componentKey: 1, version: 1 }, { unique: true });
evaluationSchemeSchema.index({ componentKey: 1, status: 1 });

export type EvaluationSchemeDoc = InferSchemaType<typeof evaluationSchemeSchema>;
export const EvaluationScheme: Model<EvaluationSchemeDoc> =
  mongoose.models.EvaluationScheme ?? mongoose.model('EvaluationScheme', evaluationSchemeSchema);
