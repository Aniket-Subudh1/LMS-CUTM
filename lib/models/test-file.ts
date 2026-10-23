import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { TEST_FILE_KINDS, TEST_FILE_STATUSES } from '@/lib/schemas/assessment';

// M04b (TP-12, 05 §5.2f): a PDF or Excel file the worker made from a test's results — the staff's Excel export and
// reports PDF (one of each per test, `submissionId` null) or a taker's scorecard and certificate (one of each per
// counted attempt). Asking again makes it anew under a new key; the old object is deleted once the new one is up.
const testFileSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: TEST_FILE_KINDS, required: true },
    submissionId: { type: Schema.Types.ObjectId, default: null },
    requestedBy: { type: Schema.Types.ObjectId, required: true },
    // The job reads the results after this moment, so a file is current when nothing changed since (A-151).
    requestedAt: { type: Date, required: true },
    status: { type: String, enum: TEST_FILE_STATUSES, required: true },
    key: { type: String, default: null },
    fileName: { type: String, default: null },
    madeAt: { type: Date, default: null },
  },
  { versionKey: false },
);

testFileSchema.index({ assessmentId: 1, kind: 1, submissionId: 1 }, { unique: true });
// /api/files finds a file by its key.
testFileSchema.index({ key: 1 }, { partialFilterExpression: { key: { $type: 'string' } } });

export type TestFileDoc = InferSchemaType<typeof testFileSchema>;
export const TestFile: Model<TestFileDoc> =
  mongoose.models.TestFile ?? mongoose.model('TestFile', testFileSchema, 'testFiles');
