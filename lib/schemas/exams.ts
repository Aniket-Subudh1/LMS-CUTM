import { z } from 'zod';
import { objectId } from '@/lib/schemas/common';
import { csvFile } from '@/lib/schemas/structure';

// M08: the marks lock, the exchange with the exam section and grade sheets (05 §5.4–5.5, 06 §8.3–8.4, 07 §6).
export const COMPONENTS = ['theory', 'practice', 'project'] as const;
export type Component = (typeof COMPONENTS)[number];
export const GRADE_SHEET_STATUSES = ['incomplete', 'draft', 'published'] as const;
export type GradeSheetStatus = (typeof GRADE_SHEET_STATUSES)[number];
// `endSemRows`: a batch's file (06 §8.3); `lockMany`: courses one "Lock the complete courses" queues; `missing` and
// `rows`: 05 §5.5.
export const EXAM_LIMITS = { endSemRows: 10_000, lockMany: 50, missing: 20, rows: 20 } as const;

// The exam section's file and the export share these columns (06 §8.3–8.4).
export const EXAM_CSV_COLUMNS = [
  'rollno',
  'name',
  'coursecode',
  'termcode',
  'theoryinternal',
  'practiceinternal',
  'projectinternal',
  'theoryexternal',
  'practiceexternal',
  'projectexternal',
] as const;

// An external mark as typed: a number with at most two decimals, AB for absent, or blank (null). The maximum depends
// on the course, so `checkEndSemRow` checks it.
const external = (column: string) =>
  z.string().transform((raw, ctx): number | 'AB' | null => {
    const value = raw.trim();
    if (value === '') return null;
    if (value.toUpperCase() === 'AB') return 'AB';
    if (!/^\d+(\.\d{1,2})?$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: `${column} "${value}" is not a mark with at most two decimals, or AB.` });
      return z.NEVER;
    }
    return Number(value);
  });

export const EndSemCsvRow = z.object({
  rollNo: z.string().trim().min(1, 'rollno is empty.').max(40, 'rollno is longer than 40 characters.'),
  courseCode: z
    .string()
    .trim()
    .min(1, 'coursecode is empty.')
    .transform((code) => code.toUpperCase().replace(/\s+/g, '')),
  termCode: z
    .string()
    .trim()
    .min(1, 'termcode is empty.')
    .transform((code) => code.toUpperCase()),
  theory: external('theoryexternal'),
  practice: external('practiceexternal'),
  project: external('projectexternal'),
});
export type EndSemCsvRow = z.infer<typeof EndSemCsvRow>;

const reason = z
  .string()
  .trim()
  .min(10, 'Say why, in at least 10 characters.')
  .max(500, 'Keep the reason to 500 characters.');

export const BatchTerm = z.object({ termId: objectId, batchId: objectId });

// The reason is needed only when some students' internal marks are incomplete (M08 decision 2); the form always posts it.
export const LockOffering = z.object({
  offeringId: objectId,
  overrideReason: z.preprocess((value) => (value === '' ? undefined : value), reason.optional()),
});
export const UnlockOffering = z.object({ offeringId: objectId, reason });
export const ImportEndSem = BatchTerm.extend({ file: csvFile });
export const UnpublishGradeSheets = BatchTerm.extend({ reason });
