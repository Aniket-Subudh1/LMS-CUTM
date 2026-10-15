import { z } from 'zod';
import { objectId, richText } from '@/lib/schemas/common';
import { uploadedFiles } from '@/lib/schemas/uploads';

const title = z.string().trim().min(1, 'Enter a title.').max(160, 'Use at most 160 characters.');
const oneFile = (missing: string) => uploadedFiles(1).refine((files) => files.length === 1, missing);

export const LESSON_KINDS = ['video', 'document', 'link'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

// --- Modules and lessons (CRS-03, SKL-03) ---

export const SaveModule = z.object({
  offeringId: objectId,
  moduleId: z.preprocess((value) => (value === '' ? undefined : value), objectId.optional()),
  title,
});

const direction = z.enum(['up', 'down']);
export const MoveModule = z.object({ offeringId: objectId, moduleId: objectId, direction });
export const MoveLesson = z.object({ offeringId: objectId, lessonId: objectId, direction });

const lessonBase = { offeringId: objectId, moduleId: objectId, title, description: richText };

export const CreateLesson = z.discriminatedUnion(
  'kind',
  [
    // Each type's upload has its own field, so a file left in the section of another type is ignored.
    z.object({ ...lessonBase, kind: z.literal('video'), 'video[]': oneFile('Upload the video first.') }),
    z.object({ ...lessonBase, kind: z.literal('document'), 'document[]': oneFile('Upload the PDF first.') }),
    z.object({
      ...lessonBase,
      kind: z.literal('link'),
      url: z.url({ protocol: /^https$/, error: 'Enter a full link that starts with https://' }).max(500),
    }),
  ],
  { error: 'Choose a lesson type.' },
);

export const UpdateLesson = z.object({ ...lessonBase, lessonId: objectId });

export const SetLessonPublished = z.object({ offeringId: objectId, lessonId: objectId, published: z.stringbool() });
export const LessonRef = z.object({ offeringId: objectId, lessonId: objectId });

// --- Course plan and calendar (CRS-06, COM-01) ---

export const SavePlan = z.object({ offeringId: objectId, doc: richText });

// `version` is the one the teacher saw; a second click on the same page publishes nothing new.
export const PublishPlan = z.object({ offeringId: objectId, version: z.coerce.number().int().min(0) });

// Rows arrive as `date_<i>`, `topic_<i>` and `cos_<i>[]`; the action pairs them, ignoring blank rows.
export const SaveCalendar = z.looseObject({ offeringId: objectId, rows: z.coerce.number().int().min(0).max(210) });

// --- Beacon (06 §3) ---

export const Beacon = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('video'),
    lessonId: objectId,
    ranges: z.array(z.tuple([z.number().min(0), z.number().min(0)])).max(50),
  }),
  z.object({ kind: z.literal('live'), sessionId: objectId, focusedSec: z.number().int().min(0).max(120) }),
]);
