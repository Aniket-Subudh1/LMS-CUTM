import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// One import or export run (05 §7.4). M01b adds the courseware import; M07/M08 add theirs.
const syncRunSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ['courseware', 'exam_pull_csv', 'exam_push_csv', 'exam_pull_api', 'exam_push_api', 'github'],
      required: true,
    },
    // courseware: `new` (pages not imported yet), `all`, or `one`.
    mode: { type: String, enum: ['new', 'all', 'one'], default: null },
    offeringId: { type: Schema.Types.ObjectId, default: null },
    termId: { type: Schema.Types.ObjectId, default: null },
    projectId: { type: Schema.Types.ObjectId, default: null },
    status: { type: String, enum: ['running', 'succeeded', 'partial', 'failed'], required: true, default: 'running' },
    actorId: { type: Schema.Types.ObjectId, default: null },
    startedAt: { type: Date, required: true },
    // When the last page of a listing was read; until then `stats.rows` is still growing.
    listedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    // `rows` is unknown (null) until the listing is complete.
    stats: {
      type: new Schema(
        {
          rows: { type: Number, default: null },
          applied: { type: Number, required: true, default: 0 },
          skipped: { type: Number, required: true, default: 0 },
          failed: { type: Number, required: true, default: 0 },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({}),
    },
    // At most 500 (05 §7.4); `errors` is a name Mongoose keeps for validation errors.
    failures: {
      type: [
        new Schema(
          {
            row: { type: Number, default: null },
            key: { type: String, default: null },
            message: { type: String, required: true, maxlength: 500 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

syncRunSchema.index({ kind: 1, startedAt: -1 });
syncRunSchema.index({ offeringId: 1, startedAt: -1 });

export type SyncRunDoc = InferSchemaType<typeof syncRunSchema>;
export const SyncRun: Model<SyncRunDoc> = mongoose.models.SyncRun ?? mongoose.model('SyncRun', syncRunSchema);
