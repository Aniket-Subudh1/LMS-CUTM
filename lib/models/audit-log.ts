import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// Append-only: never updated or deleted by application code (05 §7.5).
const auditLogSchema = new Schema(
  {
    at: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    offeringId: { type: Schema.Types.ObjectId },
    reason: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  { versionKey: false },
);

auditLogSchema.index({ entity: 1, entityId: 1, at: -1 });
auditLogSchema.index({ at: -1 });
auditLogSchema.index({ entity: 1, at: -1 });
auditLogSchema.index({ offeringId: 1, at: -1 });
auditLogSchema.index({ actorId: 1, at: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLog: Model<AuditLogDoc> = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditLogSchema);
