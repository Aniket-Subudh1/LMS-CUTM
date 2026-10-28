import { z } from 'zod';
import { objectId, richText } from '@/lib/schemas/common';
import { BLOOM_LEVELS } from '@/lib/schemas/structure';

// M09 (CPP-07, 06 §4.7): what the AI answers and what its two suggestions are asked with. The answers are plain, as
// structured output carries no limits or transforms; `lib/integrations/ai.ts` checks them afterwards.

export const ItemTagSuggestion = z.object({
  coCodes: z.array(z.string()),
  bloomLevel: z.enum(BLOOM_LEVELS),
  rationale: z.string(),
});
export const CoMapSuggestion = z.object({
  cells: z.array(z.object({ co: z.string(), outcome: z.string(), level: z.number(), rationale: z.string() })),
});
// TP-10 (Q-56): the marks the AI suggests for a hand-in's written and code answers, by question number; `criteria` in
// the rubric's order, empty without one.
export const MarkSuggestions = z.object({
  answers: z.array(
    z.object({ question: z.number(), marks: z.number(), criteria: z.array(z.number()), reason: z.string() }),
  ),
});
export const SuggestMarks = z.object({ submissionId: objectId });
// M10 T5: the drill-down's "Explain with AI".
export const EngagementExplanation = z.object({ summary: z.string() });

// The question dialog's own fields: in the builder its test, in a course bank its class (the bank of the course).
export const SuggestItemTags = z
  .object({
    assessmentId: objectId.optional(),
    offeringId: objectId.optional(),
    prompt: richText.refine((doc) => doc !== null, 'Write the question first.'),
    'option[]': z.array(z.string().max(1000)).max(20).default([]),
  })
  .refine((v) => v.assessmentId || v.offeringId, { message: 'Open the question from its test or its course bank.' });
export const SuggestCoMap = z.object({ courseId: objectId, offeringId: objectId.optional() });
