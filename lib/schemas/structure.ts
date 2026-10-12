import { z } from 'zod';
import { Email } from '@/lib/schemas/auth';
import { istDate, objectId, ROLES } from '@/lib/schemas/common';

export const CATEGORIES = ['ugc', 'skill'] as const;
export const COMPONENTS = ['theory', 'practice', 'project'] as const;
export const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyse', 'evaluate', 'create'] as const;
export const ASSESSMENT_MODES = [
  'quiz',
  'written_test',
  'assignment',
  'learning_record',
  'lab_record',
  'coding_test',
  'lab_test',
  'coding_competition',
  'project_review',
] as const;
// Every combination of the three components in canonical order; a course's `componentKey` is always one of these.
export const COMPONENT_KEYS = [
  'theory',
  'practice',
  'project',
  'theory+practice',
  'theory+project',
  'practice+project',
  'theory+practice+project',
] as const;
export const AGGREGATIONS = ['average', 'sum', 'best_n'] as const;
export const ROUNDING_MODES = ['half_up', 'ceil'] as const;
export const TERM_STATUSES = ['upcoming', 'current', 'closed'] as const;
export const OFFERING_STATUSES = ['draft', 'active', 'completed'] as const;
export const PROJECT_MODES = ['github', 'tracker'] as const;

// Form fields arrive as strings and an empty field is ''. These helpers turn that into "missing".
const text = (max: number) => z.string().trim().min(1, 'Required.').max(max, `Use at most ${max} characters.`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((v) => v || undefined)
    .optional();
const code = (max: number) =>
  text(max)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, - or _.')
    .transform((v) => v.toUpperCase());
const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const num = z.preprocess(blankToUndefined, z.coerce.number('Enter a number.'));
const optionalNum = z.preprocess(blankToUndefined, z.coerce.number('Enter a number.').optional());
const optionalId = z.preprocess(blankToUndefined, objectId.optional());
const asRecord = (raw: unknown): Record<string, unknown> => z.record(z.string(), z.unknown()).safeParse(raw).data ?? {};
const lines = (v: string) =>
  v
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
const unique = (items: readonly string[]) => new Set(items).size === items.length;
// A group of checkboxes with none ticked sends no field at all; that is an empty list, not a type error.
const noneChecked = (raw: unknown) => raw ?? [];

const csvFile = z
  .file('Choose a CSV file.')
  .min(1, 'The file is empty.')
  .max(2_000_000, 'The file is larger than 2 MB. Split it into smaller files.');

// --- Departments, programs, batches, terms (M01 T4) ---

export const SaveDepartment = z.object({
  id: objectId.optional(),
  code: code(10),
  name: text(120),
  status: z.enum(['active', 'archived']),
});

export const SaveProgram = z.object({
  id: objectId.optional(),
  code: code(20),
  name: text(160),
  departmentId: objectId,
  category: z.enum(CATEGORIES),
  durationSemesters: num.pipe(z.number().int().min(1).max(12)),
  status: z.enum(['active', 'archived']),
});

const outcomeRows = (raw: Record<string, unknown>, prefix: 'po' | 'pso', count: number) =>
  Array.from({ length: count }, (_, i) => ({
    code: String(raw[`${prefix}_code_${i}`] ?? '')
      .trim()
      .toUpperCase(),
    title: raw[`${prefix}_title_${i}`] ?? '',
    description: raw[`${prefix}_description_${i}`] ?? '',
  })).filter((row) => row.code !== '');

const outcome = (prefix: 'PO' | 'PSO') =>
  z.object({
    code: z.string().regex(new RegExp(`^${prefix}\\d{1,2}$`), `Codes look like ${prefix}1, ${prefix}2, …`),
    title: z.string().trim().min(1, 'Give every outcome a title.').max(200, 'Titles use at most 200 characters.'),
    description: optionalText(1000),
  });

// The form is a fixed grid of rows named `po_code_0`, `po_title_0`, …; a row with an empty code is ignored.
export const SaveProgramOutcomes = z.preprocess(
  (raw) => {
    const r = asRecord(raw);
    return { programId: r.programId, pos: outcomeRows(r, 'po', 20), psos: outcomeRows(r, 'pso', 10) };
  },
  z.object({
    programId: objectId,
    pos: z
      .array(outcome('PO'))
      .max(20)
      .refine((rows) => unique(rows.map((r) => r.code)), 'Each PO code can appear once.'),
    psos: z
      .array(outcome('PSO'))
      .max(10)
      .refine((rows) => unique(rows.map((r) => r.code)), 'Each PSO code can appear once.'),
  }),
);

export const SaveBatch = z.object({
  id: objectId.optional(),
  programId: objectId,
  name: text(80),
  startYear: num.pipe(z.number().int().min(1990).max(2100)),
  sections: z
    .string()
    .transform((v) => v.split(/[\s,;]+/).filter(Boolean))
    .pipe(
      z
        .array(z.string().max(10, 'A section name uses at most 10 characters.'))
        .max(20, 'A batch has at most 20 sections.')
        .refine(unique, 'Each section can appear once.'),
    ),
  status: z.enum(['active', 'graduated']),
});

export const SaveTerm = z
  .object({
    id: objectId.optional(),
    code: code(20),
    name: text(80),
    academicYear: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}$/, 'Use the form 2026-27.'),
    startsOn: istDate,
    endsOn: istDate,
    status: z.enum(TERM_STATUSES),
  })
  .refine((t) => t.startsOn < t.endsOn, { message: 'The term must start before it ends.', path: ['endsOn'] });

// --- Course catalog (M01 T5) ---

export const SaveCourse = z.object({
  id: objectId.optional(),
  programId: objectId,
  code: code(20),
  title: text(160),
  credits: num.pipe(z.number().min(0).max(30).multipleOf(0.5, 'Credits go in steps of 0.5.')),
  'components[]': z.preprocess(
    noneChecked,
    z
      .array(z.enum(COMPONENTS))
      .min(1, 'Pick at least one component.')
      .max(3)
      .refine(unique, 'Each component can appear once.'),
  ),
  status: z.enum(['draft', 'active', 'archived']),
});

export const SaveObjectives = z.object({
  courseId: objectId,
  objectives: z
    .string()
    .transform(lines)
    .pipe(
      z
        .array(z.string().max(500, 'Each objective uses at most 500 characters.'))
        .max(20, 'A course has at most 20 objectives.'),
    ),
});

export const AddCo = z.object({
  courseId: objectId,
  statement: text(500),
  bloomLevel: z.enum(BLOOM_LEVELS, 'Pick a Bloom level.'),
});
export const UpdateCo = AddCo.extend({ coId: objectId });
export const DeleteCo = z.object({ courseId: objectId, coId: objectId });

// Cells are `<coId>:<outcome code>:<level>`; "–" (no link) submits an empty string.
export const SaveCoMap = z.object({
  courseId: objectId,
  'cell[]': z.array(z.string().regex(/^(?:[a-f\d]{24}:[A-Za-z0-9]{1,10}:[123])?$/, 'Levels are 1, 2 or 3.')).max(450),
});

// --- Evaluation schemes (M01 T6) ---

const schemeRow = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Keys use lower-case letters, digits and _, starting with a letter.'),
  label: text(80),
  weight: num.pipe(z.number().positive('Weights must be above 0.')),
  modes: z.array(z.enum(ASSESSMENT_MODES)),
  aggregation: z.enum(AGGREGATIONS),
  bestN: optionalNum.pipe(z.number().int().min(1).optional()),
});

const SCHEME_ROWS = 10;

// The form is a fixed grid of ten rows (`key_0`, `label_0`, `modes_0[]`, …); a row with no key, label or weight is ignored.
export const CreateSchemeVersion = z.preprocess(
  (raw) => {
    const r = asRecord(raw);
    const components = Array.from({ length: SCHEME_ROWS }, (_, i) => ({
      key: r[`key_${i}`] ?? '',
      label: r[`label_${i}`] ?? '',
      weight: r[`weight_${i}`] ?? '',
      modes: r[`modes_${i}[]`] ?? [],
      aggregation: r[`aggregation_${i}`] ?? 'average',
      bestN: r[`bestN_${i}`] ?? '',
    })).filter((row) => [row.key, row.label, row.weight].some((v) => String(v).trim() !== ''));
    return {
      componentKey: r.componentKey,
      name: r.name,
      internalMax: r.internalMax,
      externalMax: r.externalMax,
      decimals: r.decimals,
      roundingMode: r.roundingMode,
      components,
    };
  },
  z.object({
    componentKey: z.enum(COMPONENT_KEYS),
    name: text(120),
    internalMax: num.pipe(z.number().positive().max(200)),
    externalMax: num.pipe(z.number().min(0).max(200)),
    decimals: num.pipe(z.number().int().min(0).max(2)),
    roundingMode: z.enum(ROUNDING_MODES),
    components: z.array(schemeRow).min(1, 'Add at least one component.').max(SCHEME_ROWS),
  }),
);
export type CreateSchemeVersion = z.infer<typeof CreateSchemeVersion>;

// --- Offerings and enrollment (M01 T7) ---

const facultyEmails = z
  .string()
  .transform((v) =>
    v
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.email('Every faculty entry must be an email address.'))
      .min(1, 'Enter at least one faculty email.')
      .max(5, 'An offering has at most 5 faculty.')
      .refine(unique, 'Each faculty member can appear once.'),
  );

export const CreateOffering = z.object({
  courseId: objectId,
  termId: objectId,
  batchId: objectId,
  section: optionalText(10),
  faculty: facultyEmails,
  projectMode: z.preprocess(blankToUndefined, z.enum(PROJECT_MODES).optional()),
});
export const UpdateOfferingFaculty = z.object({ offeringId: objectId, faculty: facultyEmails });
export const SetOfferingStatus = z.object({ offeringId: objectId, status: z.enum(['active', 'completed']) });
export const ChangeEnrollments = z.object({ offeringId: objectId, file: csvFile });

// --- Users (M01 T8) ---

const userRoles = z.preprocess(
  noneChecked,
  z.array(z.enum(ROLES)).min(1, 'Pick at least one role.').max(3).refine(unique),
);

export const CreateUser = z.object({
  name: text(120),
  email: Email,
  'roles[]': userRoles,
  rollNo: optionalText(30),
  employeeId: optionalText(30),
  departmentId: optionalId,
  batchId: optionalId,
  section: optionalText(10),
});
export const ImportUsers = z.object({ file: csvFile });
export const UpdateUserRoles = z.object({ userId: objectId, 'roles[]': userRoles });
export const SetUserStatus = z.object({ userId: objectId, status: z.enum(['active', 'disabled']) });
export const UserIdInput = z.object({ userId: objectId });

// --- CSV rows (06 §8). Messages are shown to the admin next to "Row N:". ---

const csvText = (max: number, message: string) => z.string().trim().min(1, message).max(max, message);

export const UserCsvRow = z.discriminatedUnion(
  'role',
  [
    z.object({
      role: z.literal('student'),
      name: csvText(120, 'Name is required (up to 120 characters).'),
      email: Email,
      rollNo: csvText(30, 'Roll number is required for students.'),
      program: csvText(20, 'Program code is required for students.').transform((v) => v.toUpperCase()),
      batchStartYear: z.coerce
        .number('Batch start year is required for students.')
        .int()
        .min(1990, 'Batch start year must be a year such as 2025.')
        .max(2100, 'Batch start year must be a year such as 2025.'),
      section: csvText(10, 'Section is required for students (up to 10 characters).'),
    }),
    z.object({
      role: z.enum(['faculty', 'hod']),
      name: csvText(120, 'Name is required (up to 120 characters).'),
      email: Email,
      employeeId: csvText(30, 'Employee id is required for faculty and HoD.'),
      department: csvText(10, 'Department code is required for faculty and HoD.').transform((v) => v.toUpperCase()),
    }),
    z.object({
      role: z.literal('support'),
      name: csvText(120, 'Name is required (up to 120 characters).'),
      email: Email,
    }),
  ],
  { error: 'Role must be student, faculty, hod or support.' },
);
export type UserCsvRow = z.infer<typeof UserCsvRow>;

export const EnrollmentCsvRow = z.object({
  rollNo: csvText(30, 'Roll number is required.'),
  action: z.enum(['add', 'drop'], 'Action must be add or drop.'),
});
export type EnrollmentCsvRow = z.infer<typeof EnrollmentCsvRow>;
