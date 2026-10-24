import type { Credits } from '@/lib/domain/catalog';
import type { External } from '@/lib/domain/grades';
import { breakdown } from '@/lib/domain/results';
import { roundHalfUp } from '@/lib/domain/round';
import { COMPONENTS } from '@/lib/schemas/exams';
import type { SettingsValue } from '@/lib/schemas/settings';
import { OUTCOME_CODES } from '@/lib/schemas/structure';

// 07 §4–5 (M09): CO, PO and PSO attainment. Pure: the job gathers the marks and stores what these return.

type Settings = SettingsValue<'attainment'>;
export type OutcomeCode = (typeof OUTCOME_CODES)[number];
// A question as one student met it: the outcomes it carries, what it was out of and what they scored (negative
// marks count 0, as `breakdown` adds them).
export type AssessedItem = { coIds: readonly string[]; maxMarks: number; marks: number };
// A student's end-semester result: `externalPct`'s answer, or null without a usable row.
export type SeeResult = number | 'absent' | null;

const WARNINGS_MAX = 50;
// Shares are compared at 6 places, so a share that is exactly the target in decimal reaches it in binary too.
const reaches = (pct: number, target: number) => roundHalfUp(pct, 6) >= target;

export function level(pct: number, s: Pick<Settings, 'level3Pct' | 'level2Pct' | 'level1Pct'>): 0 | 1 | 2 | 3 {
  return reaches(pct, s.level3Pct) ? 3 : reaches(pct, s.level2Pct) ? 2 : reaches(pct, s.level1Pct) ? 1 : 0;
}

// M09 decision 1: the external % weighted by credits over the components the course has, unrounded, as the course
// percentage is weighted (07 §2). AB in any part is `absent`; a row missing a part the course has is null.
export function externalPct(credits: Credits, externals: readonly External[]): number | 'absent' | null {
  const parts = COMPONENTS.filter((c) => credits[c] > 0);
  const rows = parts.map((c) => externals.find((e) => e.component === c));
  if (rows.some((row) => row?.absent)) return 'absent';
  let weighted = 0;
  let weight = 0;
  for (const [i, row] of rows.entries()) {
    if (!row || row.marks === null || row.max <= 0) return null;
    weighted += credits[parts[i]] * ((100 * row.marks) / row.max);
    weight += credits[parts[i]];
  }
  return weight === 0 ? null : weighted / weight;
}

// A-179: what a missed assessment counts toward, at 0 marks — each fixed question, and each draw with an outcome
// filter as one question of count × marks each toward every outcome in the filter. A draw without a filter adds
// nothing.
export function missedItems(assessment: {
  items: readonly { coIds: readonly string[]; maxMarks: number }[];
  draws: readonly { coIds: readonly string[]; count: number; marksEach: number }[];
}): AssessedItem[] {
  return [
    ...assessment.items.map((item) => ({ coIds: item.coIds, maxMarks: item.maxMarks, marks: 0 })),
    ...assessment.draws
      .filter((draw) => draw.coIds.length > 0)
      .map((draw) => ({ coIds: draw.coIds, maxMarks: draw.count * draw.marksEach, marks: 0 })),
  ];
}

export type CoAttainment = {
  coId: string;
  code: string;
  statement: string;
  cie: { assessed: number; attained: number; pct: number; level: number } | null;
  value: number | null;
  met: boolean | null;
};
export type OfferingAttainment = {
  cos: CoAttainment[];
  see: { considered: number; attained: number; pct: number; level: number; withoutMarks: number } | null;
  outcomes: { code: OutcomeCode; value: number | null }[];
  warnings: string[];
};

// 07 §4: each CO's CIE over the students assessed on it, the course's one SEE, their weighted value, and each
// outcome's value through the map. The map's cells name COs by id.
export function computeOfferingAttainment(input: {
  cos: readonly { id: string; code: string; statement: string }[];
  cells: readonly { coId: string; outcome: OutcomeCode; level: number }[];
  students: readonly { items: readonly AssessedItem[]; see: SeeResult }[];
  settings: Settings;
}): OfferingAttainment {
  const { settings: s } = input;
  const perStudent = input.students.map((student) =>
    breakdown(student.items.map((item) => ({ groups: item.coIds, maxMarks: item.maxMarks, marks: item.marks }))),
  );
  const warnings: string[] = [];

  const considered = input.students.filter((st) => st.see !== null);
  const seeAttained = considered.filter((st) => typeof st.see === 'number' && reaches(st.see, s.targetPct)).length;
  const seePct = considered.length > 0 ? (100 * seeAttained) / considered.length : null;
  const see =
    seePct === null
      ? null
      : {
          considered: considered.length,
          attained: seeAttained,
          pct: roundHalfUp(seePct, 2),
          level: level(seePct, s),
          withoutMarks: input.students.length - considered.length,
        };
  if (!see && input.students.length > 0) {
    warnings.push('No end-semester marks yet: each value is the internal assessments alone (CIE only).');
  } else if (see && see.withoutMarks > 0) {
    warnings.push(
      `${see.withoutMarks} student${see.withoutMarks === 1 ? ' has' : 's have'} no end-semester marks and ${see.withoutMarks === 1 ? 'is' : 'are'} left out of the SEE.`,
    );
  }

  const cos = input.cos.map((co): CoAttainment => {
    let assessed = 0;
    let attained = 0;
    for (const sums of perStudent) {
      const sum = sums.get(co.id);
      if (!sum || sum.maxMarks <= 0) continue;
      assessed += 1;
      if (reaches((100 * sum.marks) / sum.maxMarks, s.targetPct)) attained += 1;
    }
    if (assessed === 0) {
      warnings.push(`${co.code} was not assessed in any published assessment.`);
      return { coId: co.id, code: co.code, statement: co.statement, cie: null, value: null, met: null };
    }
    const pct = (100 * attained) / assessed;
    const cieLevel = level(pct, s);
    const value = see ? roundHalfUp(s.cieWeight * cieLevel + s.seeWeight * see.level, 2) : cieLevel;
    return {
      coId: co.id,
      code: co.code,
      statement: co.statement,
      cie: { assessed, attained, pct: roundHalfUp(pct, 2), level: cieLevel },
      value,
      met: value >= s.defaultTargetLevel,
    };
  });

  const valueOf = new Map(cos.map((co) => [co.coId, co.value]));
  const outcomes = OUTCOME_CODES.map((code) => {
    let sum = 0;
    let weight = 0;
    for (const cell of input.cells) {
      const value = cell.outcome === code ? valueOf.get(cell.coId) : null;
      if (value === null || value === undefined) continue;
      sum += value * cell.level;
      weight += cell.level;
    }
    return { code, value: weight > 0 ? roundHalfUp(sum / weight, 2) : null };
  });
  return { cos, see, outcomes, warnings: warnings.slice(0, WARNINGS_MAX) };
}

// 07 §5: a programme's attainment from its courses' records. A course taught in several sections is one course, the
// mean of its sections' values (A-182); the programme value is the mean of the courses', rounded once.
export function computeProgramAttainment(
  records: readonly { courseId: string; outcomes: readonly { code: OutcomeCode; value: number | null }[] }[],
): {
  courses: { courseId: string; outcomes: { code: OutcomeCode; value: number | null }[] }[];
  outcomes: { code: OutcomeCode; value: number | null }[];
} {
  const mean = (values: readonly number[]) =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const bySection = Map.groupBy(records, (r) => r.courseId);
  const courses = [...bySection].map(([courseId, sections]) => ({
    courseId,
    outcomes: OUTCOME_CODES.map((code) => ({
      code,
      value: mean(
        sections.flatMap((r) => {
          const value = r.outcomes.find((o) => o.code === code)?.value;
          return value === null || value === undefined ? [] : [value];
        }),
      ),
    })),
  }));
  const outcomes = OUTCOME_CODES.map((code) => {
    const value = mean(courses.flatMap((c) => c.outcomes.find((o) => o.code === code)?.value ?? []));
    return { code, value: value === null ? null : roundHalfUp(value, 2) };
  });
  return {
    courses: courses.map((c) => ({
      courseId: c.courseId,
      outcomes: c.outcomes.map((o) => ({ code: o.code, value: o.value === null ? null : roundHalfUp(o.value, 2) })),
    })),
    outcomes,
  };
}

// 07 §4's worked example, shared by its test and Settings › Attainment, which works it out with the saved settings:
// "C Programming" (3-0-0), 10 students, quiz q1 (CO1, 5) and q2 (CO2, 5), assignment a1 (CO2, 10) and a2 (CO3, 10),
// the theory external out of 50 (null: AB).
const EXAMPLE_ROWS: [number, number, number, number, number | null][] = [
  [5, 4, 9, 8, 40],
  [4, 3, 7, 6, 32],
  [3, 2, 5, 5, 25],
  [5, 5, 10, 9, 45],
  [2, 1, 4, 3, null],
  [4, 4, 8, 7, 30],
  [3, 3, 6, 4, 29],
  [5, 2, 6, 6, 35],
  [1, 3, 5, 8, 31],
  [4, 5, 9, 2, 20],
];
export const ATTAINMENT_EXAMPLE = {
  cos: [
    { id: 'co1', code: 'CO1', statement: 'Write, compile and run a C program' },
    { id: 'co2', code: 'CO2', statement: 'Use control flow and loops' },
    { id: 'co3', code: 'CO3', statement: 'Use arrays and functions' },
  ],
  cells: [
    { coId: 'co1', outcome: 'PO1', level: 3 },
    { coId: 'co1', outcome: 'PO2', level: 1 },
    { coId: 'co1', outcome: 'PSO3', level: 3 },
    { coId: 'co2', outcome: 'PO1', level: 2 },
    { coId: 'co2', outcome: 'PO2', level: 2 },
    { coId: 'co2', outcome: 'PO3', level: 1 },
    { coId: 'co2', outcome: 'PSO3', level: 3 },
    { coId: 'co3', outcome: 'PO1', level: 2 },
    { coId: 'co3', outcome: 'PO2', level: 3 },
    { coId: 'co3', outcome: 'PO3', level: 2 },
    { coId: 'co3', outcome: 'PSO1', level: 1 },
  ] satisfies { coId: string; outcome: OutcomeCode; level: number }[],
  students: EXAMPLE_ROWS.map(([q1, q2, a1, a2, endSem]) => ({
    items: [
      { coIds: ['co1'], maxMarks: 5, marks: q1 },
      { coIds: ['co2'], maxMarks: 5, marks: q2 },
      { coIds: ['co2'], maxMarks: 10, marks: a1 },
      { coIds: ['co3'], maxMarks: 10, marks: a2 },
    ],
    see: externalPct({ theory: 3, practice: 0, project: 0 }, [
      { component: 'theory', marks: endSem, max: 50, absent: endSem === null },
    ]),
  })),
};
