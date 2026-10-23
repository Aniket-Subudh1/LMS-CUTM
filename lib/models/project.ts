import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { PROJECT_LIMITS, PROJECT_STATUSES } from '@/lib/schemas/projects';
import { PROJECT_MODES } from '@/lib/schemas/structure';

// M07 (05 §6.1): a team's project in an offering with project credits. `mode` is the offering's.
const repoSchema = new Schema(
  {
    owner: { type: String, required: true },
    name: { type: String, required: true },
    installationId: { type: Number, required: true },
    defaultBranch: { type: String, required: true },
    linkedAt: { type: Date, required: true },
    lastSyncedAt: { type: Date, default: null },
    syncError: { type: String, default: null },
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: Schema.Types.Mixed, default: null },
    mode: { type: String, enum: PROJECT_MODES, required: true },
    memberIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      validate: (ids: unknown[]) => ids.length >= 1 && ids.length <= PROJECT_LIMITS.members,
    },
    guideId: { type: Schema.Types.ObjectId, required: true },
    repo: { type: repoSchema, default: null },
    startsOn: { type: Date, required: true },
    dueOn: { type: Date, required: true },
    status: { type: String, enum: PROJECT_STATUSES, required: true, default: 'active' },
  },
  { timestamps: true },
);

projectSchema.index({ offeringId: 1 });
projectSchema.index({ memberIds: 1 });
projectSchema.index(
  { 'repo.owner': 1, 'repo.name': 1 },
  { unique: true, partialFilterExpression: { 'repo.owner': { $type: 'string' } } },
);
projectSchema.index({ mode: 1, status: 1 });

export type ProjectDoc = InferSchemaType<typeof projectSchema>;
export const Project: Model<ProjectDoc> = mongoose.models.Project ?? mongoose.model('Project', projectSchema);
