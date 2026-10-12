import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ROLES } from '@/lib/schemas/common';

const githubSchema = new Schema(
  {
    login: { type: String, required: true },
    id: { type: Number, required: true },
    linkedAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    roles: { type: [String], enum: ROLES, required: true },
    status: { type: String, enum: ['invited', 'active', 'disabled'], required: true, default: 'invited' },
    passwordHash: { type: String, select: false },
    sessionVersion: { type: Number, required: true, default: 1 },
    rollNo: { type: String, trim: true },
    employeeId: { type: String, trim: true },
    departmentId: { type: Schema.Types.ObjectId },
    programId: { type: Schema.Types.ObjectId },
    batchId: { type: Schema.Types.ObjectId },
    section: { type: String, trim: true, maxlength: 10 },
    github: { type: githubSchema },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ rollNo: 1 }, { unique: true, partialFilterExpression: { rollNo: { $type: 'string' } } });
userSchema.index({ employeeId: 1 }, { unique: true, partialFilterExpression: { employeeId: { $type: 'string' } } });
userSchema.index({ 'github.id': 1 }, { unique: true, partialFilterExpression: { 'github.id': { $type: 'number' } } });
userSchema.index({ batchId: 1, section: 1 });
userSchema.index({ roles: 1, status: 1 });
userSchema.index({ name: 'text', email: 'text', rollNo: 'text' });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User: Model<UserDoc> = mongoose.models.User ?? mongoose.model('User', userSchema);
