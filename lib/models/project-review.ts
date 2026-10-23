import mongoose, { Schema, type FlattenMaps, type InferSchemaType, type Model } from 'mongoose';

// M07 decision 2 (05 §6.3a): one review of a project, marked on the evaluation policy's six internal project criteria for
// each member. A student's project internal is the reviews' average per criterion (07 §2).
const projectReviewSchema = new Schema(
  {
    offeringId: { type: Schema.Types.ObjectId, required: true },
    projectId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    heldOn: { type: Date, required: true },
    // Its live class (`kind: 'review'`), when it is held in one.
    sessionId: { type: Schema.Types.ObjectId, default: null },
    marks: {
      type: [
        { _id: false, studentId: { type: Schema.Types.ObjectId, required: true }, criteria: { type: Map, of: Number } },
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

projectReviewSchema.index({ projectId: 1, heldOn: 1 });
projectReviewSchema.index({ offeringId: 1 });

// Reads are lean, which returns each `criteria` as a plain object.
export type ProjectReviewDoc = FlattenMaps<InferSchemaType<typeof projectReviewSchema>>;
export const ProjectReview: Model<ProjectReviewDoc> =
  mongoose.models.ProjectReview ?? mongoose.model('ProjectReview', projectReviewSchema, 'projectReviews');
