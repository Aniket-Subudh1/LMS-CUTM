import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { settingsKey } from '@/lib/schemas/settings';

// `_id` is the settings key; `value` is checked by the key's schema in lib/schemas/settings.ts (05 §7.3).
const settingSchema = new Schema(
  {
    _id: { type: String, enum: settingsKey.options, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

export type SettingDoc = InferSchemaType<typeof settingSchema>;
export const Setting: Model<SettingDoc> = mongoose.models.Setting ?? mongoose.model('Setting', settingSchema);
