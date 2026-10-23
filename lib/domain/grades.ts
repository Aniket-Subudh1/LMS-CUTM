import { creditTotal, type Credits } from '@/lib/domain/catalog';
import { coursePercentage, rubricMax, type ComponentMarks } from '@/lib/domain/evaluation';
import { roundHalfUp } from '@/lib/domain/round';
import { COMPONENTS, EXAM_LIMITS, type Component } from '@/lib/schemas/exams';
import type { SettingsValue } from '@/lib/schemas/settings';

// 07 §6 (M08): a student's grade sheet for a term, from the locked internal marks and the exam section's marks.

type Policy = SettingsValue<'evaluation'>;
type Grading = SettingsValue<'grading'>;
type Maxima = Record<Component, number>;

// Each component is out of 100 (07 §2): the internal is what the policy's parts or rubric add up to.
export function internalMaxima(policy: Policy): Maxima {
  return {
    theory: policy.theoryMidTerm1 + policy.theoryMidTerm2 + policy.theoryAssignment + policy.theoryAttendance,
    practice: rubricMax(policy, 'practice'),
    project: rubricMax(policy, 'project'),
  };
}

// The external part: the end-semester exam, the practice examiner (the rest of 100) and the external project rubric.
export function externalMaxima(policy: Policy): Maxima {
  return {
    theory: policy.theoryEndSem,
    practice: 100 - rubricMax(policy, 'practice'),
    project: policy.projectExtRelevance + policy.projectExtReport + policy.projectExtDefence,
  };
}

// The first grade, highest first, that the course percentage (already rounded up once) reaches. The settings rules
// keep a grade from 0 %, so every percentage has one.
export function gradeFor(pct: number, scale: Grading['scale']): { grade: string; points: number } {
  for (const entry of [...scale].sort((a, b) => b.minPct - a.minPct)) {
    if (pct >= entry.minPct) return { grade: entry.grade, points: entry.points };
  }
  throw new Error('The grade scale has no grade from 0 %.');
}

export type External = { component: Component; marks: number | null; max: number; absent: boolean };

export type CourseMarks = {
  courseCode: string;
  credits: Credits;
  policy: Policy;
  locked: boolean;
  // The student's internal marks (null: none worked out), and why a missing one is missing, from its parts.
  internals: ComponentMarks | null;
  notes?: Partial<Record<Component, string>>;
  // The exam section's marks (null: no row for the student yet).
  externals: readonly External[] | null;
};

export type GradeSheetRow = {
  components: {
    component: Component;
    internal: number;
    internalMax: number;
    external: number | null;
    externalMax: number;
    absent: boolean;
    marks: number;
  }[];
  pct: number;
  grade: string;
  gradePoint: number;
};

type RowResult = { ok: true; row: GradeSheetRow } | { ok: false; missing: string[] };

// One credit course on the sheet. Nothing is guessed (M08 decision 2): a course that is not locked, a missing
// internal or a missing external leaves the row out and says why. AB in any external part gives the absent grade
// (decision 3); the absent part counts 0 in the % shown.
export function gradeSheetRow(course: CourseMarks, grading: Grading): RowResult {
  const code = course.courseCode;
  const has = COMPONENTS.filter((component) => course.credits[component] > 0);
  const missing: string[] = [];
  if (!course.locked) missing.push(`${code}: marks not locked yet`);
  for (const component of has) {
    if (course.internals?.[component] === null || course.internals?.[component] === undefined) {
      const note = course.notes?.[component];
      missing.push(`${code}: ${component} internal missing${note ? ` (${note})` : ''}`);
    }
  }
  if (!course.externals) missing.push(`${code}: no end-semester marks`);
  else {
    for (const component of has) {
      if (!course.externals.some((e) => e.component === component)) {
        missing.push(`${code}: no ${component} external mark`);
      }
    }
  }
  if (missing.length > 0) return { ok: false, missing };

  const internalMax = internalMaxima(course.policy);
  const components = has.map((component) => {
    const internal = course.internals?.[component] ?? 0;
    const external = course.externals?.find((e) => e.component === component);
    const absent = external?.absent ?? false;
    const marks = absent ? null : (external?.marks ?? null);
    return {
      component,
      internal,
      internalMax: internalMax[component],
      external: marks,
      externalMax: external?.max ?? 0,
      absent,
      marks: internal + (marks ?? 0),
    };
  });
  const pct = coursePercentage(course.credits, Object.fromEntries(components.map((c) => [c.component, c.marks])));
  // A credit course with every part present always has a percentage.
  if (pct === null) return { ok: false, missing: [`${code}: has no credits to grade`] };
  const { grade, points } = components.some((c) => c.absent)
    ? { grade: grading.absentGrade, points: grading.absentPoints }
    : gradeFor(pct, grading.scale);
  return { ok: true, row: { components, pct, grade, gradePoint: points } };
}

// 07 §6: credit-weighted grade points over every graded course, absent ones included, at 2 dp.
export function sgpa(rows: readonly { credits: Credits; gradePoint: number }[]): number | null {
  let weighted = 0;
  let credits = 0;
  for (const row of rows) {
    const total = creditTotal(row.credits);
    if (total === 0) continue;
    weighted += total * row.gradePoint;
    credits += total;
  }
  return credits === 0 ? null : roundHalfUp(weighted / credits, 2);
}

export type SheetResult =
  | {
      status: 'draft';
      rows: (GradeSheetRow & { courseCode: string; credits: Credits })[];
      credits: number;
      sgpa: number | null;
    }
  | { status: 'incomplete'; missing: string[] };

// The whole sheet: every credit course of the term graded, or the sheet is incomplete with every reason (at most 20).
export function gradeSheet(courses: readonly CourseMarks[], grading: Grading): SheetResult {
  const results = courses.map((course) => ({ course, result: gradeSheetRow(course, grading) }));
  const missing = results.flatMap(({ result }) => (result.ok ? [] : result.missing));
  if (missing.length > 0) {
    return {
      status: 'incomplete',
      missing:
        missing.length > EXAM_LIMITS.missing
          ? [...missing.slice(0, EXAM_LIMITS.missing - 1), `and ${missing.length - EXAM_LIMITS.missing + 1} more`]
          : missing,
    };
  }
  const rows = results.flatMap(({ course, result }) =>
    result.ok ? [{ ...result.row, courseCode: course.courseCode, credits: course.credits }] : [],
  );
  return {
    status: 'draft',
    rows,
    credits: rows.reduce((sum, row) => sum + creditTotal(row.credits), 0),
    sgpa: grading.showSgpa ? sgpa(rows) : null,
  };
}
