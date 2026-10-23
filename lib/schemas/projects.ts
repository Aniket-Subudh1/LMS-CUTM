import { z } from 'zod';
import { istDate, istTime, objectId, richText } from '@/lib/schemas/common';

// M07 (05 §6, 07 §12–13).
export const PROJECT_STATUSES = ['active', 'completed'] as const;
export const TASK_STATUSES = ['backlog', 'in_progress', 'review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PROJECT_LIMITS = {
  members: 10,
  perOffering: 200,
  tasks: 300,
  reviews: 20,
  history: 50,
  commitsPerSync: 500,
};

const title = z.string().trim().min(3, 'Use at least 3 characters.').max(160, 'Use at most 160 characters.');
const list = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]), z.array(item).max(max));

export const SaveProject = z
  .object({
    offeringId: objectId,
    projectId: objectId.optional(),
    title,
    description: richText,
    'member[]': list(objectId, PROJECT_LIMITS.members).refine((ids) => ids.length > 0, 'Pick at least one student.'),
    guideId: objectId,
    startsOn: istDate,
    dueOn: istDate,
  })
  .refine((p) => p.startsOn < p.dueOn, { path: ['dueOn'], message: 'Finish it after it starts.' });

export const ProjectRef = z.object({ projectId: objectId });

// `owner/name`, as GitHub shows it (or the repository's address).
export const LinkRepository = z.object({
  projectId: objectId,
  repo: z
    .string()
    .trim()
    .transform((value) => value.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/$/g, ''))
    .pipe(
      z
        .string()
        .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/, 'Write it as owner/name, like cutm-cse/attendance.'),
    ),
});

export const SaveTask = z.object({
  projectId: objectId,
  taskId: objectId.optional(),
  title,
  description: richText,
  assigneeId: objectId,
  dueOn: istDate,
});
export const MoveTask = z.object({ taskId: objectId, to: z.enum(TASK_STATUSES) });
export const TaskRef = z.object({ taskId: objectId });

// A review on a date and time; with `live`, it is also held as a live class of `lengthMin` minutes.
export const SaveReview = z.object({
  projectId: objectId,
  reviewId: objectId.optional(),
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(120, 'Use at most 120 characters.'),
  date: istDate,
  time: istTime,
  live: z.stringbool().default(false),
  lengthMin: z.coerce.number().int().min(15, 'At least 15 minutes.').max(240, 'At most 4 hours.').default(60),
});
export const ReviewRef = z.object({ reviewId: objectId });

// One review's marks: the members in order, then each member's six criteria in the policy's order (blank: not marked).
export const SaveReviewMarks = z.object({
  reviewId: objectId,
  'student[]': list(objectId, PROJECT_LIMITS.members),
  'mark[]': list(
    z.union([
      z.literal('').transform(() => null),
      z.coerce
        .number({ error: 'Enter a number.' })
        .min(0, 'Marks cannot be negative.')
        .multipleOf(0.01, 'Use at most two decimals.'),
    ]),
    PROJECT_LIMITS.members * 6,
  ),
});
