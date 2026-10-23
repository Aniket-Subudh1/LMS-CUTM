import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// A one-time code a guest confirms (M04b, TP-03). Only its hash is kept; it lives 10 minutes and allows 5 tries.
const otpSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  linkId: { type: Schema.Types.ObjectId, required: true },
  codeHash: { type: String, required: true },
  // The name the guest registered with, used when the account is created on confirmation.
  name: { type: String, required: true, trim: true, maxlength: 120 },
  attempts: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

otpSchema.index({ email: 1, linkId: 1 }, { unique: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpDoc = InferSchemaType<typeof otpSchema>;
export const Otp: Model<OtpDoc> = mongoose.models.Otp ?? mongoose.model('Otp', otpSchema);
