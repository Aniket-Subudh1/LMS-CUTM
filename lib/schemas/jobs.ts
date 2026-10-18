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
// `fileKey` is the file the job was queued for: a video replaced meanwhile keeps its own frame and copy (06 §6).
export const MediaJob = z.object({ lessonId: objectId, fileKey: z.string().min(1).max(500) });
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

// `compute/finalizeLiveSession` and the hourly `compute/liveSweep` (06 §6, M03): derived attendance for a class.
export const FinalizeLiveJob = z.object({ sessionId: objectId });
export type FinalizeLiveJob = z.infer<typeof FinalizeLiveJob>;
export const LiveSweepJob = z.object({});
export type LiveSweepJob = z.infer<typeof LiveSweepJob>;

// `compute/liveControl` (06 §6, M03c T2): a host control that reaches every student in the room — what students may
// do now, or "Mute everyone" (everyone but the host who asked).
export const LiveControlJob = z.discriminatedUnion('op', [
  z.object({ op: z.literal('rights'), sessionId: objectId }),
  z.object({ op: z.literal('muteAll'), sessionId: objectId, byId: objectId, byName: z.string().min(1).max(120) }),
]);
export type LiveControlJob = z.infer<typeof LiveControlJob>;

// `compute/assessmentSweep` (06 §6, M04): the hourly 24-hour reminders and the hand-in of expired attempts.
export const AssessmentSweepJob = z.object({});
export type AssessmentSweepJob = z.infer<typeof AssessmentSweepJob>;

// `compute/gradeCode` (06 §6, M04b TP-09): run an attempt's code questions on every test and mark them.
export const GradeCodeJob = z.object({ submissionId: objectId });
export type GradeCodeJob = z.infer<typeof GradeCodeJob>;

// `compute/makeTestFile` (06 §6, M04b TP-12): one PDF or Excel file made from a test's results.
export const MakeTestFileJob = z.object({ fileId: objectId });
export type MakeTestFileJob = z.infer<typeof MakeTestFileJob>;

// `compute/testStats` (06 §6, M04b TP-11): a test's ranks, item analysis, histogram, similarity flags and leaderboard.
export const TestStatsJob = z.object({ assessmentId: objectId });
export type TestStatsJob = z.infer<typeof TestStatsJob>;

// `compute/proctorRetention` (06 §6, M04b): the daily deletion of old proctoring snapshots (05 §8).
export const ProctorRetentionJob = z.object({});
export type ProctorRetentionJob = z.infer<typeof ProctorRetentionJob>;
