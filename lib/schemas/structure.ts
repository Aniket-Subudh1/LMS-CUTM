import { z } from 'zod';
import { Email } from '@/lib/schemas/auth';
import { istDate, objectId, ROLES } from '@/lib/schemas/common';
import { uploadedFiles } from '@/lib/schemas/uploads';

export const CATEGORIES = ['ugc', 'skill'] as const;
export const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyse', 'evaluate', 'create'] as const;
export const TERM_STATUSES = ['upcoming', 'current', 'closed'] as const;
// The six course types of CUTM's courseware (labels only; credits decide the features, decision of 15 Oct 2026).
export const COURSE_TYPES = ['core', 'domain', 'skill', 'certificate', 'advanced_certificate', 'diploma'] as const;
// CO-PO-PSO maps use these fixed codes; each programme gives them its own titles (CPP-02, Q-08).
export const OUTCOME_CODES = [
  'PO1',
  'PO2',
  'PO3',
  'PO4',
  'PO5',
  'PO6',
  'PO7',
  'PO8',
  'PO9',
  'PO10',
  'PO11',
  'PO12',
  'PSO1',
  'PSO2',
  'PSO3',
] as const;
export const SESSION_KINDS = ['theory', 'practice', 'project'] as const;
export const BASKET_SCOPES = ['core', 'choice'] as const;
// Sizes of a catalogue course's content (05 §3.3); the editors' schemas and the courseware import share them.
export const CATALOG_LIMITS = {
  objectives: 20,
  objective: 500,
  cos: 15,
  coStatement: 500,
  coMap: 225,
  modules: 20,
  moduleTitle: 200,
  moduleHours: 30,
  moduleTopics: 3000,
  practicals: 30,
  practical: 300,
  projects: 30,
  project: 300,
  textbooks: 20,
  references: 30,
  book: 500,
  // A session becomes a calendar row, whose topic holds 200 characters.
  sessions: 200,
  sessionTopic: 200,
  // Review notes on a course ("Credits changed by the course list from 4 to 3-0-1").
  issues: 20,
  issue: 300,
} as const;

// lib/integrations/courseware.ts flattens a courseware page into these; lib/domain/courseware.ts reads them.
export type CoursewareBlock = { kind: 'line'; text: string; bold: boolean } | { kind: 'table'; rows: string[][] };
export type CoursewarePage = {
  title: string;
  // The two labels above the title: the course type ("Core", "Skill") and a code or slug ("ASEC 3103",
  // "advanced-java-cust1051", "26507").
  typeLabel: string | null;
  identifier: string | null;
  blocks: CoursewareBlock[];
};
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
  durationSemesters: num.pipe(z.number().int().min(1).max(12)),
  status: z.enum(['active', 'archived']),
});

// CPP-02 since M01b: the codes are fixed and the programme titles them; a box left empty shows the code itself.
export const SaveProgramOutcomes = z.preprocess(
  (raw) => {
    const r = asRecord(raw);
    return {
      programId: r.programId,
      outcomeTitles: OUTCOME_CODES.map((code) => ({ code, title: String(r[`title_${code}`] ?? '').trim() })).filter(
        (row) => row.title !== '',
      ),
    };
  },
  z.object({
    programId: objectId,
    outcomeTitles: z.array(
      z.object({
        code: z.enum(OUTCOME_CODES),
        title: z.string().max(200, 'Titles use at most 200 characters.'),
      }),
    ),
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

// --- Course catalogue (M01b) ---

// The code as typed; actions store `normalizeCode(code)` ("cutm 1535" → "CUTM1535").
const courseCode = text(20).regex(/^[A-Za-z0-9 _-]+$/, 'Use letters and digits, such as CUTM1535.');
const creditPart = num.pipe(
  z.number().min(0, 'Use 0 to 20.').max(20, 'Use 0 to 20.').multipleOf(0.5, 'Credits go in steps of 0.5.'),
);
const list = (maxItems: number, maxChars: number, what: string) =>
  z
    .string()
    .default('')
    .transform(lines)
    .pipe(
      z
        .array(z.string().max(maxChars, `Each ${what} uses at most ${maxChars} characters.`))
        .max(maxItems, `Use at most ${maxItems} lines.`),
    );
// Row forms (the calendar's precedent, M02): fields `<name>_<i>` for i < rows. A problem is reported under the
// row's own field name, so the dialog marks that box.
const rowCount = z.coerce.number().int().min(0).max(40);
const cell = (raw: Record<string, unknown>, name: string, i: number) => String(raw[`${name}_${i}`] ?? '').trim();
const ticked = (raw: Record<string, unknown>, name: string, i: number) => {
  const value = raw[`${name}_${i}[]`] ?? [];
  return (Array.isArray(value) ? value : [value]).map(String);
};

export const SaveCourse = z
  .object({
    id: objectId.optional(),
    code: courseCode,
    title: text(160),
    type: z.preprocess(blankToUndefined, z.enum(COURSE_TYPES).optional()),
    theory: creditPart,
    practice: creditPart,
    project: creditPart,
    status: z.enum(['draft', 'active', 'archived']),
  })
  .refine((c) => c.theory + c.practice + c.project <= 30, {
    message: 'A course has at most 30 credits in all.',
    path: ['project'],
  });

export const CourseRef = z.object({ courseId: objectId });

export const SaveObjectives = z.object({
  courseId: objectId,
  objectives: list(CATALOG_LIMITS.objectives, CATALOG_LIMITS.objective, 'objective'),
});

// All outcomes in one form: `coId_i` (empty for a new row), `statement_i`, `bloom_i[]` and `remove_i`. Blank new
// rows are ignored; codes are given by the action (CO7 after CO6, never reused).
export const SaveCos = z.looseObject({ courseId: objectId, rows: rowCount }).transform((raw, ctx) => {
  const cos: { coId: string | null; statement: string; bloomLevels: (typeof BLOOM_LEVELS)[number][] }[] = [];
  const removed: string[] = [];
  for (let i = 0; i < raw.rows; i++) {
    const coId = cell(raw, 'coId', i);
    const statement = cell(raw, 'statement', i);
    const levels = ticked(raw, 'bloom', i);
    const fail = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [`${field}_${i}`], message });
    if (coId && !objectId.safeParse(coId).success) fail('statement', 'Reload the page and try again.');
    if (coId && cell(raw, 'remove', i) === 'true') {
      removed.push(coId);
      continue;
    }
    if (!statement) {
      if (coId) fail('statement', 'Write the outcome, or tick Remove.');
      continue;
    }
    if (statement.length > CATALOG_LIMITS.coStatement) {
      fail('statement', `Use at most ${CATALOG_LIMITS.coStatement} characters.`);
    }
    const bloomLevels = levels.flatMap((level) => BLOOM_LEVELS.find((known) => known === level) ?? []);
    if (bloomLevels.length !== levels.length || !unique(levels)) fail('bloom', 'Pick from the levels shown.');
    if (bloomLevels.length > 3) fail('bloom', 'Pick at most three levels.');
    cos.push({ coId: coId || null, statement, bloomLevels });
  }
  if (cos.length > CATALOG_LIMITS.cos) {
    ctx.addIssue({ code: 'custom', message: `A course has at most ${CATALOG_LIMITS.cos} outcomes.` });
  }
  return { courseId: raw.courseId, cos, removed };
});

const OUTCOME_CELL = new RegExp(`^[a-f\\d]{24}:(?:${OUTCOME_CODES.join('|')}):[123]$`);

// The CO–PO grid sends one `<coId>:<code>:<level>` per linked cell; a cleared grid sends none.
export const SaveCoMap = z.object({
  courseId: objectId,
  'cell[]': z.preprocess(
    noneChecked,
    z
      .array(z.string().regex(OUTCOME_CELL, 'Links go from a CO to PO1–PO12 or PSO1–PSO3 at level 1, 2 or 3.'))
      .max(CATALOG_LIMITS.coMap, `A course has at most ${CATALOG_LIMITS.coMap} links.`),
  ),
});

// "6" or "4+0+2" (theory + practice + project hours), as CUTM's syllabi write them.
const HOURS = /^\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?){0,2}$/;

// The syllabus step: module rows (`title_i`, `hours_i`, `topics_i`, `practicals_i`, `remove_i`), the course's
// projects, and the official PDF (keep, replace or remove).
export const SaveSyllabus = z
  .looseObject({
    courseId: objectId,
    rows: rowCount,
    projects: list(CATALOG_LIMITS.projects, CATALOG_LIMITS.project, 'project'),
    'syllabusFile[]': uploadedFiles(1),
    removeFile: z.stringbool().default(false),
  })
  .transform((raw, ctx) => {
    const modules: { title: string; hours: string | null; topics: string; practicals: string[] }[] = [];
    for (let i = 0; i < raw.rows; i++) {
      const fail = (field: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [`${field}_${i}`], message });
      if (cell(raw, 'remove', i) === 'true') continue;
      const title = cell(raw, 'title', i);
      const hours = cell(raw, 'hours', i).replace(/\s+/g, '');
      const topics = cell(raw, 'topics', i);
      const practicals = lines(cell(raw, 'practicals', i));
      if (!title && !hours && !topics && practicals.length === 0) continue;
      if (!title) fail('title', 'Give the module a title.');
      else if (title.length > CATALOG_LIMITS.moduleTitle)
        fail('title', `Use at most ${CATALOG_LIMITS.moduleTitle} characters.`);
      if (hours && !HOURS.test(hours)) fail('hours', 'Write hours as 6 or 4+0+2.');
      if (topics.length > CATALOG_LIMITS.moduleTopics)
        fail('topics', `Use at most ${CATALOG_LIMITS.moduleTopics} characters.`);
      if (practicals.length > CATALOG_LIMITS.practicals)
        fail('practicals', `Use at most ${CATALOG_LIMITS.practicals} lines.`);
      if (practicals.some((p) => p.length > CATALOG_LIMITS.practical)) {
        fail('practicals', `Each practical uses at most ${CATALOG_LIMITS.practical} characters.`);
      }
      modules.push({ title, hours: hours || null, topics, practicals });
    }
    if (modules.length > CATALOG_LIMITS.modules) {
      ctx.addIssue({ code: 'custom', message: `A course has at most ${CATALOG_LIMITS.modules} modules.` });
    }
    return {
      courseId: raw.courseId,
      modules,
      projects: raw.projects,
      file: raw['syllabusFile[]'][0] ?? null,
      removeFile: raw.removeFile,
    };
  });

export const SaveBooks = z.object({
  courseId: objectId,
  textbooks: list(CATALOG_LIMITS.textbooks, CATALOG_LIMITS.book, 'book'),
  references: list(CATALOG_LIMITS.references, CATALOG_LIMITS.book, 'book'),
});

// One session per line; "Practice:" or "Project:" in front marks those sessions (parseSessionLines, 07 §17).
export const SaveSessionPlan = z.object({
  courseId: objectId,
  sessions: list(CATALOG_LIMITS.sessions, CATALOG_LIMITS.sessionTopic + 20, 'session'),
});

export const SetCoordinator = z.object({ courseId: objectId, coordinatorId: optionalId });

// --- Programme curriculum (M01b) ---

// Basket rows: `basketId_i` (empty for a new one), `name_i`, `title_i`, `scope_i`, `minCredits_i`, `remove_i`.
export const SaveBaskets = z.looseObject({ programId: objectId, rows: rowCount }).transform((raw, ctx) => {
  const baskets: {
    basketId: string | null;
    name: string;
    title: string | null;
    scope: (typeof BASKET_SCOPES)[number] | null;
    minCredits: number | null;
  }[] = [];
  const removed: string[] = [];
  for (let i = 0; i < raw.rows; i++) {
    const fail = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [`${field}_${i}`], message });
    const basketId = cell(raw, 'basketId', i);
    if (basketId && !objectId.safeParse(basketId).success) fail('name', 'Reload the page and try again.');
    if (basketId && cell(raw, 'remove', i) === 'true') {
      removed.push(basketId);
      continue;
    }
    const name = cell(raw, 'name', i);
    const title = cell(raw, 'title', i);
    const scope = BASKET_SCOPES.find((known) => known === cell(raw, 'scope', i)) ?? null;
    const credits = cell(raw, 'minCredits', i);
    if (!name) {
      if (basketId || title || credits) fail('name', 'Name the basket, such as Basket I.');
      continue;
    }
    if (name.length > 60) fail('name', 'Use at most 60 characters.');
    if (title.length > 120) fail('title', 'Use at most 120 characters.');
    const minCredits = credits === '' ? null : Number(credits);
    if (
      minCredits !== null &&
      !(Number.isFinite(minCredits) && minCredits >= 0 && minCredits <= 300 && Number.isInteger(minCredits * 2))
    ) {
      fail('minCredits', 'Use 0 to 300 in steps of 0.5.');
    }
    baskets.push({ basketId: basketId || null, name, title: title || null, scope, minCredits });
  }
  if (baskets.length > 12) ctx.addIssue({ code: 'custom', message: 'A programme has at most 12 baskets.' });
  if (!unique(baskets.map((b) => b.name.toLowerCase()))) {
    ctx.addIssue({ code: 'custom', message: 'Each basket name can appear once.' });
  }
  return { programId: raw.programId, baskets, removed };
});

export const AddProgrammeCourse = z.object({
  programId: objectId,
  code: courseCode,
  basket: optionalText(60),
});
export const RemoveProgrammeCourse = z.object({ programId: objectId, courseId: objectId });

// --- Offerings and enrollment (M01 T7, M01b) ---

// Faculty are ticked by name (`faculty[]`) or, from other departments, typed as emails; 1–5 in all.
const facultyPicks = {
  'faculty[]': z.preprocess(noneChecked, z.array(objectId).max(5)),
  otherFaculty: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.email('Every entry must be an email address.')).max(5, 'An offering has at most 5 faculty.')),
};
const oneToFive = (f: { 'faculty[]': string[]; otherFaculty: string[] }) =>
  f['faculty[]'].length + f.otherFaculty.length >= 1 && f['faculty[]'].length + f.otherFaculty.length <= 5;
const facultyMessage = { message: 'Choose 1 to 5 faculty members.', path: ['faculty[]'] };

// One offering per ticked section; "*" is the whole batch (a batch without sections, or all of it at once).
export const CreateOfferings = z
  .object({
    batchId: objectId,
    courseId: objectId,
    termId: objectId,
    'sections[]': z.preprocess(
      noneChecked,
      z
        .array(z.string().trim().min(1).max(10))
        .min(1, 'Tick at least one section.')
        .max(20)
        .refine(unique, 'Each section can appear once.'),
    ),
    ...facultyPicks,
    projectMode: z.preprocess(blankToUndefined, z.enum(PROJECT_MODES).optional()),
  })
  .refine(oneToFive, facultyMessage)
  .refine((o) => !o['sections[]'].includes('*') || o['sections[]'].length === 1, {
    message: 'Choose the whole batch or sections, not both.',
    path: ['sections[]'],
  });

export const UpdateOfferingFaculty = z
  .object({ offeringId: objectId, ...facultyPicks })
  .refine(oneToFive, facultyMessage);
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

const csvOptional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => v || undefined);

// 06 §8.5, one row per programme × course of CUTM's Course Repository. lib/domain/csv.ts normalises the code
// and reads `tpp` (T+P+Pj), which must add up to `credits`.
export const CourseListCsvRow = z.object({
  programme: csvText(160, 'Programme is required (up to 160 characters).'),
  stream: csvOptional(60, 'Stream uses at most 60 characters.'),
  basket: csvOptional(60, 'Basket uses at most 60 characters.'),
  type: csvOptional(80, 'Course type uses at most 80 characters.'),
  code: csvText(20, 'Course code is required, such as CUTM1535.'),
  title: csvText(160, 'Course title is required (up to 160 characters).'),
  credits: z.coerce
    .number('Credits must be a number such as 4.')
    .min(0, 'Credits must be between 0 and 30.')
    .max(30, 'Credits must be between 0 and 30.')
    .multipleOf(0.5, 'Credits go in steps of 0.5.'),
  tpp: csvText(20, 'T+P+Pj is required, such as 3+0+1.'),
});
export type CourseListCsvRow = z.infer<typeof CourseListCsvRow>;

// --- Imports (M01b, 06 §8.5) ---

export const ImportCourseList = z.object({ file: csvFile, createProgrammes: z.stringbool().default(false) });

export const StartCoursewareImport = z
  .object({ mode: z.enum(['new', 'all', 'one']), page: optionalText(300) })
  .refine((input) => input.mode !== 'one' || input.page !== undefined, {
    message: 'Enter the page number or its link.',
    path: ['page'],
  });

// "Start from the course's session plan" (M01b): the first class date and the weekdays classes are held on.
export const FillCalendar = z.object({
  offeringId: objectId,
  firstDay: istDate,
  'weekdays[]': z.preprocess(
    noneChecked,
    z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, 'Tick at least one day.')
      .refine((days) => new Set(days).size === days.length),
  ),
  replace: z.stringbool().default(false),
});
