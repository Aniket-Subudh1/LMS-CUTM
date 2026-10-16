import { z } from 'zod';
import { objectId } from '@/lib/schemas/common';

export const MailSend = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().min(1),
});
export type MailSend = z.infer<typeof MailSend>;

// A job that expands into one `mail/send` per recipient (06 §6). Producers chunk `userIds` to at most 500.
export const MailJob = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('invitation'), userIds: z.array(objectId).min(1).max(500) }),
  z.object({ kind: z.literal('coursePlanPublished'), offeringId: objectId, version: z.number().int().min(1) }),
]);
export type MailJob = z.infer<typeof MailJob>;

// `media/transcodeLesson` (06 §6, M02 T8b): the 480p data-saver copy of a lecture video.
export const MediaJob = z.object({ lessonId: objectId });
export type MediaJob = z.infer<typeof MediaJob>;

// `sync/coursewareList` and `sync/coursewarePage` (06 §6, M01b): one courseware import run.
export const CoursewareListJob = z.object({
  syncRunId: objectId,
  mode: z.enum(['new', 'all']),
  page: z.number().int().min(1).max(10_000),
});
export type CoursewareListJob = z.infer<typeof CoursewareListJob>;

// `force` replaces content edited in the LMS (an admin's "Replace with courseware content").
export const CoursewarePageJob = z.object({
  syncRunId: objectId,
  coursewareId: z.number().int().min(1),
  force: z.boolean(),
});
export type CoursewarePageJob = z.infer<typeof CoursewarePageJob>;
