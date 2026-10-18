import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ITEM_TYPES, RESULT_LIMITS } from '@/lib/schemas/assessment';

// M04b (TP-11, 05 §5.2e): one test's results as the testStats job last worked them out (07 §19), over each taker's
// counted attempt. `_id` is the assessment's. Rebuilt whole by each run; nothing else writes it.
const testStatsSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    computedAt: { type: Date, required: true },
    takers: { type: Number, required: true, min: 0 },
    averagePct: { type: Number, default: null },
    highestPct: { type: Number, default: null },
    // Takers per 10-point band of percentage, 0–10 % first.
    histogram: { type: [Number], default: [] },
    // Per question — an assessment's own, or a bank question drawn into papers (`key` is its bank id then).
    items: {
      type: [
        {
          _id: false,
          key: { type: Schema.Types.ObjectId, required: true },
          type: { type: String, enum: ITEM_TYPES, required: true },
          title: { type: String, required: true, maxlength: 120 },
          sectionTitle: { type: String, default: null },
          coIds: { type: [Schema.Types.ObjectId], default: [] },
          n: { type: Number, required: true, min: 0 },
          correctPct: { type: Number, required: true, min: 0, max: 100 },
          discrimination: { type: Number, default: null },
          wrongPick: { type: new Schema({ text: String, pct: Number }, { _id: false }), default: null },
        },
      ],
      default: [],
    },
    // Hand-ins with at least one alike answer.
    flagged: { type: Number, required: true, default: 0 },
    // The first RESULT_LIMITS.leaderboard by counted total.
    leaderboard: {
      type: [
        {
          _id: false,
          studentId: { type: Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          total: { type: Number, required: true },
          rank: { type: Number, required: true },
        },
      ],
      default: [],
      validate: (list: unknown[]) => list.length <= RESULT_LIMITS.leaderboard,
    },
  },
  { versionKey: false },
);

export type TestStatsDoc = InferSchemaType<typeof testStatsSchema>;
export const TestStats: Model<TestStatsDoc> =
  mongoose.models.TestStats ?? mongoose.model('TestStats', testStatsSchema, 'testStats');
