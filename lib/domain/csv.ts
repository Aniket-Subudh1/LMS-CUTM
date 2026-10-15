import Papa from 'papaparse';
import { creditTotal, formatCredits, normalizeCode, parseCredits, type Credits } from '@/lib/domain/catalog';
import { CourseListCsvRow, EnrollmentCsvRow, UserCsvRow } from '@/lib/schemas/structure';

// `row` is 1-based and excludes the header; 0 means the file as a whole (06 §8).
export type CsvError = { row: number; message: string };
export type CsvResult<T> = { ok: true; rows: T[] } | { ok: false; errors: CsvError[] };

export const MAX_CSV_ROWS = 5000;

type Records = { columns: string[]; records: Record<string, string>[] };

function readCsv(text: string): { ok: true; data: Records } | { ok: false; errors: CsvError[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    delimiter: ',',
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  // A short line only leaves cells empty, which the row rules already report.
  const broken = parsed.errors.filter((e) => e.code !== 'TooFewFields');
  if (broken.length > 0) {
    return {
      ok: false,
      errors: broken.map((e) => ({ row: e.row === undefined ? 0 : e.row + 1, message: 'This line is not valid CSV.' })),
    };
  }
  if (parsed.data.length === 0) return { ok: false, errors: [{ row: 0, message: 'The file has no data rows.' }] };
  if (parsed.data.length > MAX_CSV_ROWS) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message: `The file has more than ${MAX_CSV_ROWS.toLocaleString('en-IN')} rows. Split it into smaller files.`,
        },
      ],
    };
  }
  return { ok: true, data: { columns: parsed.meta.fields ?? [], records: parsed.data } };
}

const missingColumns = (columns: string[], required: readonly string[]): CsvError[] =>
  required.filter((c) => !columns.includes(c)).map((c) => ({ row: 0, message: `Missing column "${c}".` }));

const cell = (record: Record<string, string>, column: string) => (record[column] ?? '').trim();

// A value that must be unique inside the file; later rows are the ones reported.
function claim(seen: Map<string, number>, value: string, row: number, what: string): CsvError | null {
  const first = seen.get(value);
  if (first !== undefined) return { row, message: `${what} "${value}" already appears in row ${first}.` };
  seen.set(value, row);
  return null;
}

export type UserRow = UserCsvRow & { row: number };

// 06 §8.1. Pure: department, program and batch codes are resolved by the action.
export function parseUsersCsv(text: string): CsvResult<UserRow> {
  const read = readCsv(text);
  if (!read.ok) return read;
  const { columns, records } = read.data;

  const roles = new Set(records.map((r) => cell(r, 'role').toLowerCase()));
  const required = ['role', 'name', 'email'];
  if (roles.has('student')) required.push('rollno', 'program', 'batchstartyear', 'section');
  if (roles.has('faculty') || roles.has('hod')) required.push('employeeid', 'department');
  const missing = missingColumns(columns, required);
  if (missing.length > 0) return { ok: false, errors: missing };

  const errors: CsvError[] = [];
  const rows: UserRow[] = [];
  const emails = new Map<string, number>();
  const rollNos = new Map<string, number>();
  const employeeIds = new Map<string, number>();
  records.forEach((record, i) => {
    const row = i + 1;
    const parsed = UserCsvRow.safeParse({
      role: cell(record, 'role').toLowerCase(),
      name: cell(record, 'name'),
      email: cell(record, 'email'),
      rollNo: cell(record, 'rollno'),
      program: cell(record, 'program'),
      batchStartYear: cell(record, 'batchstartyear'),
      section: cell(record, 'section'),
      employeeId: cell(record, 'employeeid'),
      department: cell(record, 'department'),
    });
    if (!parsed.success) {
      errors.push({ row, message: [...new Set(parsed.error.issues.map((issue) => issue.message))].join(' ') });
      return;
    }
    const clashes = [
      claim(emails, parsed.data.email, row, 'Email'),
      parsed.data.role === 'student' ? claim(rollNos, parsed.data.rollNo, row, 'Roll number') : null,
      parsed.data.role === 'faculty' || parsed.data.role === 'hod'
        ? claim(employeeIds, parsed.data.employeeId, row, 'Employee id')
        : null,
    ].filter((e) => e !== null);
    if (clashes.length > 0) errors.push(...clashes);
    else rows.push({ ...parsed.data, row });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}

export type EnrollmentRow = EnrollmentCsvRow & { row: number };

// 06 §8.2. The action matches roll numbers to students.
export function parseEnrollmentCsv(text: string): CsvResult<EnrollmentRow> {
  const read = readCsv(text);
  if (!read.ok) return read;
  const { columns, records } = read.data;
  const missing = missingColumns(columns, ['rollno', 'action']);
  if (missing.length > 0) return { ok: false, errors: missing };

  const errors: CsvError[] = [];
  const rows: EnrollmentRow[] = [];
  const rollNos = new Map<string, number>();
  records.forEach((record, i) => {
    const row = i + 1;
    const parsed = EnrollmentCsvRow.safeParse({
      rollNo: cell(record, 'rollno'),
      action: cell(record, 'action').toLowerCase(),
    });
    if (!parsed.success) {
      errors.push({ row, message: [...new Set(parsed.error.issues.map((issue) => issue.message))].join(' ') });
      return;
    }
    const clash = claim(rollNos, parsed.data.rollNo, row, 'Roll number');
    if (clash) errors.push(clash);
    else rows.push({ ...parsed.data, row });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}

export type CourseListRow = Omit<CourseListCsvRow, 'credits' | 'tpp'> & { row: number; credits: Credits };

// 06 §8.5 (CUTM's Course Repository). A course may appear under several programmes, but always with the same
// title and credits; the action matches programmes and baskets.
export function parseCourseListCsv(text: string): CsvResult<CourseListRow> {
  const read = readCsv(text);
  if (!read.ok) return read;
  const { columns, records } = read.data;
  const missing = missingColumns(columns, ['programme', 'code', 'title', 'credits', 'tpp']);
  if (missing.length > 0) return { ok: false, errors: missing };

  const errors: CsvError[] = [];
  const rows: CourseListRow[] = [];
  const courses = new Map<string, { row: number; title: string; credits: string }>();
  const links = new Map<string, number>();
  records.forEach((record, i) => {
    const row = i + 1;
    const parsed = CourseListCsvRow.safeParse(
      Object.fromEntries(['programme', 'stream', 'basket', 'type', 'code', 'title', 'credits', 'tpp'].map((c) => [c, cell(record, c)])),
    );
    if (!parsed.success) {
      errors.push({ row, message: [...new Set(parsed.error.issues.map((issue) => issue.message))].join(' ') });
      return;
    }
    const { tpp, credits: total, ...rest } = parsed.data;
    const code = normalizeCode(rest.code);
    const split = parseCredits(tpp);
    const problems: string[] = [];
    if (!/^[A-Z0-9]{2,20}$/.test(code)) problems.push('Course code must be letters and digits, such as CUTM1535.');
    if (!split || split.twoPart) problems.push(`T+P+Pj "${tpp}" must be three numbers, such as 3+0+1.`);
    else if (creditTotal(split.credits) !== total) {
      problems.push(`Credits ${total} do not match T+P+Pj ${formatCredits(split.credits)}.`);
    }
    if (problems.length > 0 || !split) {
      errors.push({ row, message: problems.join(' ') });
      return;
    }
    const credits = formatCredits(split.credits);
    const first = courses.get(code);
    if (!first) courses.set(code, { row, title: rest.title, credits });
    else if (first.title !== rest.title) errors.push({ row, message: `${code} has a different title in row ${first.row}.` });
    else if (first.credits !== credits) errors.push({ row, message: `${code} has different credits in row ${first.row}.` });
    const link = `${rest.programme.toLowerCase()} ${code}`;
    const twice = links.get(link);
    if (twice) errors.push({ row, message: `${code} is already listed under ${rest.programme} in row ${twice}.` });
    else links.set(link, row);
    rows.push({ ...rest, code, credits: split.credits, row });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}

// "Row 12: …" lines for the standard `Field`; at most `max` rows are listed (the file-level message has no row).
export function formatCsvErrors(errors: readonly CsvError[], max = 200): string[] {
  const lines = errors.slice(0, max).map((e) => (e.row === 0 ? e.message : `Row ${e.row}: ${e.message}`));
  if (errors.length > max) lines.push(`…and ${errors.length - max} more rows with errors.`);
  return lines;
}
