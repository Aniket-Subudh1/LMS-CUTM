import { z } from 'zod';
import { istDate, objectId, richText } from '@/lib/schemas/common';
import { SESSION_KINDS } from '@/lib/schemas/structure';
import { uploadedFiles } from '@/lib/schemas/uploads';

const title = z.string().trim().min(1, 'Enter a title.').max(160, 'Use at most 160 characters.');
const oneFile = (missing: string) => uploadedFiles(1).refine((files) => files.length === 1, missing);

export const LESSON_KINDS = ['video', 'document', 'link'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

// A lesson carries at most this many PDF notes beside its main file (M03b).
export const MAX_NOTES = 5;
const link = z.url({ protocol: /^https$/, error: 'Enter a full link that starts with https://' }).max(500);
const optionalId = z.preprocess((value) => (value === '' ? undefined : value), objectId.optional());

// --- Modules and lessons (CRS-03, SKL-03) ---

export const SaveModule = z.object({
  offeringId: objectId,
  moduleId: optionalId,
  title,
  summary: z.string().trim().max(300, 'Use at most 300 characters.').optional(),
});

export const ModuleRef = z.object({ offeringId: objectId, moduleId: objectId });
export const SetModulePublished = z.object({ ...ModuleRef.shape, published: z.stringbool() });

// A drag or a Move menu sends the whole new order; the action checks it is the same members (lib/domain/order.ts).
const ids = (max: number) => z.array(objectId).min(1).max(max);
export const ReorderModules = z.object({ offeringId: objectId, 'ids[]': ids(40) });
export const ReorderLessons = z.object({ offeringId: objectId, moduleId: objectId, 'ids[]': ids(300) });
export const MoveLessonToModule = z.object({ offeringId: objectId, lessonId: objectId, moduleId: objectId });

const lessonBase = { offeringId: objectId, moduleId: objectId, title, description: richText };
// Created with the lesson, or added later on its page.
const extras = { 'notes[]': uploadedFiles(MAX_NOTES), 'thumb[]': uploadedFiles(1) };

export const CreateLesson = z.discriminatedUnion(
  'kind',
  [
    // Each type's upload has its own field, so a file left in the section of another type is ignored.
    z.object({ ...lessonBase, ...extras, kind: z.literal('video'), 'video[]': oneFile('Upload the video first.') }),
    z.object({ ...lessonBase, ...extras, kind: z.literal('document'), 'document[]': oneFile('Upload the PDF first.') }),
    z.object({ ...lessonBase, ...extras, kind: z.literal('link'), url: link }),
  ],
  { error: 'Choose a lesson type.' },
);

// `url` is read only for a link lesson, where it is required.
export const UpdateLesson = z.object({
  ...lessonBase,
  lessonId: objectId,
  url: z.preprocess((value) => (value === '' ? undefined : value), link.optional()),
});

// The new file must match the lesson's type; the other field stays empty.
export const ReplaceLessonFile = z.object({
  offeringId: objectId,
  lessonId: objectId,
  'video[]': uploadedFiles(1),
  'document[]': uploadedFiles(1),
});
export const SetLessonThumb = z.object({
  offeringId: objectId,
  lessonId: objectId,
  'thumb[]': oneFile('Upload a picture first.'),
});
export const AddLessonNotes = z.object({
  offeringId: objectId,
  lessonId: objectId,
  'notes[]': uploadedFiles(MAX_NOTES).refine((files) => files.length > 0, 'Upload a PDF first.'),
});
export const LessonNoteRef = z.object({ offeringId: objectId, lessonId: objectId, noteId: objectId });

export const SetLessonPublished = z.object({ offeringId: objectId, lessonId: objectId, published: z.stringbool() });
export const LessonRef = z.object({ offeringId: objectId, lessonId: objectId });

// --- Course plan and calendar (CRS-06, COM-01) ---

export const SavePlan = z.object({ offeringId: objectId, doc: richText });

// `version` is the one the teacher saw; a second click on the same page publishes nothing new.
export const PublishPlan = z.object({ offeringId: objectId, version: z.coerce.number().int().min(0) });

// One session of the course plan at a time (M03b); its row id stays the same across edits.
const session = {
  offeringId: objectId,
  date: istDate,
  topic: z.string().trim().min(1, 'Enter the topic.').max(200, 'Use at most 200 characters.'),
  'cos[]': z.preprocess((value) => value ?? [], z.array(objectId).max(15)),
  kind: z.preprocess((value) => (value === '' ? undefined : value), z.enum(SESSION_KINDS).optional()),
};
export const AddPlanSession = z.object(session);
export const UpdatePlanSession = z.object({ ...session, rowId: objectId });
export const PlanSessionRef = z.object({ offeringId: objectId, rowId: objectId });

// --- Beacon (06 §3) ---

export const Beacon = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('video'),
    lessonId: objectId,
    ranges: z.array(z.tuple([z.number().min(0), z.number().min(0)])).max(50),
  }),
  z.object({ kind: z.literal('live'), sessionId: objectId, focusedSec: z.number().int().min(0).max(120) }),
]);
