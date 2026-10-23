import { z } from 'zod';
import { COUNTS_TOWARD } from '@/lib/schemas/assessment';
import { objectId } from '@/lib/schemas/common';

// M06: continuous evaluation (05 §5.3–5.3a, 07 §2–3).
export const THEORY_PARTS = [...COUNTS_TOWARD, 'attendance'] as const;
export type TheoryPart = (typeof THEORY_PARTS)[number];
export const RUBRIC_COMPONENTS = ['practice', 'project'] as const;
export type RubricComponent = (typeof RUBRIC_COMPONENTS)[number];
export const TRENDS = ['rising', 'dropping', 'steady', 'insufficient'] as const;
export type Trend = (typeof TRENDS)[number];

export const OfferingRef = z.object({ offeringId: objectId });

const list = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]), z.array(item).max(max));

// One page of the rubric grid (M2 A): the students in order, then each student's criteria in the policy's order (blank:
// not marked yet). The maxima come from the offering's copy of the policy, so the action checks them.
export const SaveRubricMarks = z.object({
  offeringId: objectId,
  component: z.enum(RUBRIC_COMPONENTS),
  'student[]': list(objectId, 100),
  'mark[]': list(
    z.union([
      z.literal('').transform(() => null),
      z.coerce
        .number({ error: 'Enter a number.' })
        .min(0, 'Marks cannot be negative.')
        .multipleOf(0.01, 'Use at most two decimals.'),
    ]),
    600,
  ),
});
export type SaveRubricMarks = z.infer<typeof SaveRubricMarks>;
