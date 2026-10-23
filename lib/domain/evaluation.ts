import { attendancePct } from '@/lib/domain/attendance';
import type { Credits } from '@/lib/domain/catalog';
import { ceilTo, roundHalfUp } from '@/lib/domain/round';
import type { CountsToward } from '@/lib/schemas/assessment';
import { THEORY_PARTS, type RubricComponent, type TheoryPart } from '@/lib/schemas/marks';
import type { SettingsValue } from '@/lib/schemas/settings';

export type ComponentMarks = { theory?: number | null; practice?: number | null; project?: number | null };

// 07 §2 (CUTM Examination Policy, 15 Jun 2020): each component is marked out of 100 and the course percentage is
// their credit-weighted average, rounded up once (Q-39). Null when a weighted component has no mark yet, or for a
// non-credit course.
export function coursePercentage(credits: Credits, marks: ComponentMarks): number | null {
  let weighted = 0;
  let weight = 0;
  for (const part of ['theory', 'practice', 'project'] as const) {
    if (credits[part] === 0) continue;
    const mark = marks[part];
    if (mark === undefined || mark === null) return null;
    weighted += credits[part] * mark;
    weight += credits[part];
  }
  return weight === 0 ? null : ceilTo(weighted / weight, 0);
}

// The theory component's attendance marks: the first band (highest first) the percentage reaches; below the last
// band, nothing.
export function attendancePoints(pct: number, bands: readonly { minPct: number; marks: number }[]): number {
  return bands.find((band) => pct >= band.minPct)?.marks ?? 0;
}

// --- Internal marks (M06; Q-41 answered 23 Oct 2026; 07 §2). Every value is kept unrounded and shown at 2 dp. ---

type Policy = SettingsValue<'evaluation'>;
// The internal rubrics the teacher fills on the Marks tab, keyed as in the policy (the project's external rubric comes
// from the exam section with the end-semester marks, M08).
export const RUBRICS = {
  practice: [
    'practiceConcept',
    'practicePlanning',
    'practiceResult',
    'practiceRecord',
    'practiceConduct',
    'practiceViva',
  ],
  project: [
    'projectRelevance',
    'projectLiterature',
    'projectMethodology',
    'projectAnalysis',
    'projectInterpretation',
    'projectReport',
  ],
} as const satisfies Record<RubricComponent, readonly (keyof Policy)[]>;
export type RubricCriteria = Partial<Record<string, number>>;

const PART_MAX = {
  midTerm1: 'theoryMidTerm1',
  midTerm2: 'theoryMidTerm2',
  assignment: 'theoryAssignment',
  attendance: 'theoryAttendance',
} as const satisfies Record<TheoryPart, keyof Policy>;

// Each assessment counts equally: the mean of its percentages, scaled to the part. Null while none counts toward it.
export function partMarks(max: number, results: readonly { counted: number; maxMarks: number }[]): number | null {
  if (results.length === 0) return null;
  return (max * results.reduce((sum, r) => sum + r.counted / r.maxMarks, 0)) / results.length;
}

// Marks added up: the theory parts (out of 40 by default) or a rubric's criteria (out of 50). Null while any is missing.
export function addedUp(values: readonly (number | null | undefined)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null || value === undefined) return null;
    total += value;
  }
  return total;
}

export function rubricMax(policy: Policy, component: RubricComponent): number {
  return RUBRICS[component].reduce((sum, key) => sum + policy[key], 0);
}

export type InternalMarksInput = {
  credits: Credits;
  policy: Policy;
  // The student's counted score on each published assessment that counts toward a theory part (07 §14).
  counted: readonly { part: CountsToward; counted: number; maxMarks: number }[];
  // Their finalized live classes (A-72).
  attendance: { attended: number; held: number };
  rubrics: Partial<Record<RubricComponent, RubricCriteria>>;
};

export type InternalMarks = {
  // Theory only (empty without theory credits); `count` is how many assessments, or classes held, are behind it.
  parts: { key: TheoryPart; marks: number | null; max: number; count: number }[];
  attendancePct: number | null;
  components: { theory?: number | null; practice?: number | null; project?: number | null };
  complete: boolean;
  internalPct: number | null;
};

// One student's internal marks for a credit offering, by the offering's copy of the policy.
export function computeInternalMarks(input: InternalMarksInput): InternalMarks {
  const { credits, policy, counted, attendance } = input;
  const parts: InternalMarks['parts'] = [];
  const components: InternalMarks['components'] = {};
  let max = 0;
  if (credits.theory > 0) {
    for (const key of THEORY_PARTS) {
      const partMax = policy[PART_MAX[key]];
      if (key === 'attendance') {
        const { attended, held } = attendance;
        const bands = ([1, 2, 3, 4] as const).map((n) => ({
          minPct: policy[`band${n}Pct`],
          marks: policy[`band${n}Marks`],
        }));
        // The unrounded percentage decides the band; the 2 dp one is for showing.
        parts.push({
          key,
          max: partMax,
          count: held,
          marks: held > 0 ? attendancePoints((100 * attended) / held, bands) : null,
        });
      } else {
        const results = counted.filter((r) => r.part === key);
        parts.push({ key, max: partMax, count: results.length, marks: partMarks(partMax, results) });
      }
      max += partMax;
    }
    components.theory = addedUp(parts.map((part) => part.marks));
  }
  for (const component of ['practice', 'project'] as const) {
    if (credits[component] === 0) continue;
    const criteria = input.rubrics[component] ?? {};
    components[component] = addedUp(RUBRICS[component].map((key) => criteria[key]));
    max += rubricMax(policy, component);
  }
  const values = Object.values(components);
  const complete = values.length > 0 && values.every((value) => value !== null && value !== undefined);
  const total = addedUp(values);
  return {
    parts,
    attendancePct: credits.theory > 0 ? attendancePct(attendance.attended, attendance.held) : null,
    components,
    complete,
    internalPct: complete && total !== null && max > 0 ? roundHalfUp((100 * total) / max, 2) : null,
  };
}
