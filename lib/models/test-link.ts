import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { LINK_AUDIENCES, TEST_LIMITS } from '@/lib/schemas/tests';

// A share link of a test (M04b, TP-01). `class` lets LMS users in after they sign in; `guests` lets outside people
// register. The token is the link's only secret; the access code, expiry, use limit and domains narrow who may use it.
const testLinkSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, required: true },
    token: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: TEST_LIMITS.label },
    audience: { type: String, enum: LINK_AUDIENCES, required: true },
    accessCode: { type: String, trim: true, maxlength: TEST_LIMITS.code, default: null },
    expiresAt: { type: Date, default: null },
    maxUses: { type: Number, min: 1, default: null },
    // People let in through this link (each grant counts once).
    uses: { type: Number, required: true, default: 0 },
    allowedDomains: { type: [String], default: [] },
    active: { type: Boolean, required: true, default: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

testLinkSchema.index({ token: 1 }, { unique: true });
testLinkSchema.index({ assessmentId: 1, createdAt: -1 });

export type TestLinkDoc = InferSchemaType<typeof testLinkSchema>;
export const TestLink: Model<TestLinkDoc> = mongoose.models.TestLink ?? mongoose.model('TestLink', testLinkSchema);
