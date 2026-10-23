import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { PROJECT_LIMITS, TASK_STATUSES } from '@/lib/schemas/projects';

// M07 (05 §6.2): a task on a tracker project's board. Only faculty move a task to Done or back from Review (07 §13).
const projectTaskSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, required: true },
    offeringId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: Schema.Types.Mixed, default: null },
    assigneeId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: TASK_STATUSES, required: true, default: 'backlog' },
    dueAt: { type: Date, required: true },
    doneAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    // The newest moves, kept with `$slice`.
    history: {
      type: [
        {
          _id: false,
          status: { type: String, enum: TASK_STATUSES, required: true },
          at: { type: Date, required: true },
          by: { type: Schema.Types.ObjectId, required: true },
        },
      ],
      default: [],
      validate: (rows: unknown[]) => rows.length <= PROJECT_LIMITS.history,
    },
  },
  { timestamps: true },
);

projectTaskSchema.index({ projectId: 1, status: 1 });
projectTaskSchema.index({ assigneeId: 1, status: 1 });
projectTaskSchema.index({ offeringId: 1, dueAt: 1 });

export type ProjectTaskDoc = InferSchemaType<typeof projectTaskSchema>;
export const ProjectTask: Model<ProjectTaskDoc> =
  mongoose.models.ProjectTask ?? mongoose.model('ProjectTask', projectTaskSchema, 'projectTasks');
