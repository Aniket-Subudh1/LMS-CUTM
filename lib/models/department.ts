import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const departmentSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 10 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['active', 'archived'], required: true, default: 'active' },
  },
  { timestamps: true },
);

departmentSchema.index({ code: 1 }, { unique: true });

export type DepartmentDoc = InferSchemaType<typeof departmentSchema>;
export const Department: Model<DepartmentDoc> =
  mongoose.models.Department ?? mongoose.model('Department', departmentSchema);
