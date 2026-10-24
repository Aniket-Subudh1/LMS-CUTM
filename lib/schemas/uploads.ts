import { z } from 'zod';
import { objectId } from '@/lib/schemas/common';

export const uploadPurpose = z.enum([
  'lesson-video',
  'lesson-doc',
  'lesson-thumb',
  'offering-cover',
  'syllabus',
  'submission',
  'proctor-snapshot',
  'test-file',
  'live-recording',
]);
export type UploadPurpose = z.infer<typeof uploadPurpose>;

const PICTURE = ['image/jpeg', 'image/png', 'image/webp'];

// 06 §5. `accepts` is what the upload box tells the person choosing a file. A purpose with `image` is a picture the
// browser crops to that size and turns into a JPEG before it uploads; never an SVG, which can carry script (09 §5).
export const UPLOAD_PURPOSES = {
  'lesson-video': { contentTypes: ['video/mp4', 'video/webm'], maxBytes: 2_000_000_000, accepts: 'MP4 or WebM video' },
  'lesson-doc': { contentTypes: ['application/pdf'], maxBytes: 50_000_000, accepts: 'PDF' },
  'lesson-thumb': {
    contentTypes: PICTURE,
    maxBytes: 2_000_000,
    accepts: 'JPEG, PNG or WebP picture',
    image: { width: 1280, height: 720 },
  },
  'offering-cover': {
    contentTypes: PICTURE,
    maxBytes: 2_000_000,
    accepts: 'JPEG, PNG or WebP picture',
    image: { width: 1600, height: 640 },
  },
  syllabus: { contentTypes: ['application/pdf'], maxBytes: 20_000_000, accepts: 'PDF' },
  submission: {
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'],
    maxBytes: 25_000_000,
    accepts: 'PDF or photo (JPEG, PNG, HEIC)',
  },
  'proctor-snapshot': { contentTypes: ['image/jpeg'], maxBytes: 300_000, accepts: 'JPEG' },
  // M04b (TP-12): made by the worker from a test's results, never uploaded by a browser.
  'test-file': {
    contentTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxBytes: 200_000_000,
    accepts: 'PDF or Excel',
  },
  // M03c T5: a class or meeting recorded by LiveKit Egress straight to the bucket, never uploaded by a browser.
  'live-recording': { contentTypes: ['video/mp4'], maxBytes: 20_000_000_000, accepts: 'MP4 video' },
} as const satisfies Record<
  UploadPurpose,
  { contentTypes: readonly string[]; maxBytes: number; accepts: string; image?: { width: number; height: number } }
>;

export const CreateUpload = z.object({
  purpose: uploadPurpose,
  contextId: objectId,
  fileName: z.string().trim().min(1).max(240),
  contentType: z.string().trim().min(1).max(120),
  size: z.coerce.number().int().positive().max(2_000_000_000),
});
export type CreateUpload = z.infer<typeof CreateUpload>;

// What `FileUpload` writes into its hidden input once the browser has finished the PUT.
export const UploadedFile = z.object({
  key: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(240),
  contentType: z.string().trim().min(1).max(120),
  size: z.coerce.number().int().positive().max(2_000_000_000),
  durationSec: z.coerce.number().int().positive().max(86_400).optional(),
});
export type UploadedFile = z.infer<typeof UploadedFile>;

// The hidden `name[]` inputs FileUpload writes, one JSON object per finished upload; [] when nothing was uploaded.
// The consuming action still checks each key's prefix against the purpose, context and viewer (09 §5).
export const uploadedFiles = (max: number) =>
  z.preprocess(
    (value) => value ?? [],
    z
      .array(
        z
          .string()
          .transform((raw, ctx) => {
            try {
              return JSON.parse(raw);
            } catch {
              ctx.addIssue({ code: 'custom', message: 'Upload the file again.' });
              return z.NEVER;
            }
          })
          .pipe(UploadedFile),
      )
      .max(max, max === 1 ? 'Upload one file.' : `Upload at most ${max} files.`),
  );
