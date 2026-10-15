import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// 06 §9. Each milestone adds the kinds it creates.
export const NOTIFICATION_KINDS = ['plan.requested', 'plan.published'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    href: { type: String, required: true, trim: true, maxlength: 240 },
    readAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const Notification: Model<NotificationDoc> =
  mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema);
