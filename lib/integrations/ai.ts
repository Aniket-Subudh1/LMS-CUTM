import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { log } from '@/lib/log';
import type { AutoParseableTextFormat } from 'openai/lib/parser';
import type { z } from 'zod';
import { CoMapSuggestion, EngagementExplanation, ItemTagSuggestion, MarkSuggestions } from '@/lib/schemas/ai';
import { AiDrafts, type AiDraft } from '@/lib/schemas/bank';

// 06 §4.7. Only this file talks to the AI (OpenAI, Aniket's choice of 18 Oct 2026 for cost). It is sent what a teacher
// types for it, the course's outcome statements, (M10) a student's engagement numbers under plain labels and (Q-56) the
// text of written and code answers with their questions, never a name, roll number or email (09 §12); what comes back is a suggestion or a summary a person reads, which changes
// nothing by itself. The model is the OPENAI_MODEL setting.

let client: OpenAI | undefined;

export function aiConfigured(): boolean {
  return Boolean(env().OPENAI_API_KEY);
}

function openai(): OpenAI {
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) throw new AppError('CONFLICT', 'AI suggestions are not set up.');
  client ??= new OpenAI({ apiKey });
  return client;
}

const TYPE_RULES = {
  mcq: 'one answer: 4 options; `answer` is the number of the one right option (1 to 4).',
  msq: 'several answers: 4 to 6 options; `answer` is the numbers of every right option, separated by | (such as 1|3).',
  true_false: 'true or false: a statement, no options; `answer` is true or false.',
  numeric: 'number: no options; `answer` is the number, with a margin when rounding allows one (such as 3.14 ± 0.01).',
  text: 'written answer: no options and `answer` empty; the explanation is a model answer in a few sentences.',
} as const;

const LEVELS = {
  mixed: 'about 30 % easy, 45 % medium and 25 % hard',
  easy: 'all easy',
  medium: 'all medium',
  hard: 'all hard',
} as const;

const SYSTEM = `You draft questions for a university question bank (Centurion University, India). Each question tests one
idea, reads clearly to a second-year student, and has exactly the right answers its type says, with no "all of the
above" or "none of the above". Wrong options are plausible mistakes. Write plain text, without Markdown. Give each
question its difficulty, its Bloom level, and the codes of the course outcomes it assesses (only from the list given;
none when no list is given). A teacher reviews every draft before anyone sees it.`;

// M09 (06 §4.7): the two suggestions' instructions, as the milestone wrote them.
const ITEM_TAGS = `You help university teachers tag an assessment question with the course outcomes (COs) it assesses and
its Bloom's taxonomy level (remember, understand, apply, analyse, evaluate, create). Choose only from the CO codes
provided. Prefer one CO; choose two only when the question clearly assesses both. Base the Bloom level on what the
student must do. Give a one-sentence rationale.`;
const CO_MAP = `You help define a CO–PO–PSO correlation matrix. For each pair where the course outcome contributes to the
program outcome, give a level: 3 strong, 2 moderate, 1 slight. Omit pairs with no meaningful contribution. Use only the
codes provided.`;

// TP-10: `count` drafts of one type on a topic. Null when the AI declines or its answer does not fit the format; an
// AppError when it cannot be reached.
export async function draftQuestions(input: {
  topic: string;
  count: number;
  type: keyof typeof TYPE_RULES;
  level: keyof typeof LEVELS;
  cos: readonly { code: string; statement: string }[];
}): Promise<AiDraft[] | null> {
  const brief = [
    `Topic: ${input.topic}`,
    `Write ${input.count} question${input.count === 1 ? '' : 's'} of this type — ${TYPE_RULES[input.type]}`,
    `Difficulty: ${LEVELS[input.level]}.`,
    input.cos.length > 0
      ? `Course outcomes:\n${input.cos.map((co) => `${co.code}: ${co.statement}`).join('\n')}`
      : 'No course outcomes: leave `outcomes` empty.',
    'Each explanation says in one or two sentences why the answer is right.',
  ].join('\n\n');
  const answer = await ask('draftQuestions', SYSTEM, brief, zodTextFormat(AiDrafts, 'drafts'), 16_000);
  return answer?.questions ?? null;
}

// M09 (CPP-07): the outcomes a question being written assesses, and its Bloom level. Told only the question and the
// course's outcomes. Codes that are not the course's are dropped; none left, null.
export async function suggestItemTags(input: {
  promptText: string;
  cos: readonly { code: string; statement: string }[];
}): Promise<{
  coCodes: string[];
  bloomLevel: z.infer<typeof ItemTagSuggestion>['bloomLevel'];
  rationale: string;
} | null> {
  const brief = [
    `Question:\n${input.promptText}`,
    `Course outcomes:\n${input.cos.map((co) => `${co.code}: ${co.statement}`).join('\n')}`,
  ].join('\n\n');
  const answer = await ask('suggestItemTags', ITEM_TAGS, brief, zodTextFormat(ItemTagSuggestion, 'item_tags'), 2_000);
  if (!answer) return null;
  const known = new Set(input.cos.map((co) => co.code));
  const coCodes = [...new Set(answer.coCodes.map((code) => code.trim().toUpperCase()))]
    .filter((code) => known.has(code))
    .slice(0, 2);
  return coCodes.length > 0
    ? { coCodes, bloomLevel: answer.bloomLevel, rationale: answer.rationale.trim().slice(0, 300) }
    : null;
}

// M09 (CPP-07): levels for a course's CO–PO–PSO map. Told the outcomes' codes and statements and only the programme
// outcomes that have a title (decision 2). Unknown codes, levels other than 1–3 and repeated pairs are dropped; none
// left, null.
export async function suggestCoMap(input: {
  cos: readonly { code: string; statement: string }[];
  outcomes: readonly { code: string; title: string }[];
}): Promise<{ co: string; outcome: string; level: 1 | 2 | 3; rationale: string }[] | null> {
  const brief = [
    `Course outcomes:\n${input.cos.map((co) => `${co.code}: ${co.statement}`).join('\n')}`,
    `Programme outcomes:\n${input.outcomes.map((o) => `${o.code}: ${o.title}`).join('\n')}`,
  ].join('\n\n');
  const answer = await ask('suggestCoMap', CO_MAP, brief, zodTextFormat(CoMapSuggestion, 'co_map'), 2_000);
  if (!answer) return null;
  const cos = new Set(input.cos.map((co) => co.code));
  const outcomes = new Set(input.outcomes.map((o) => o.code));
  const seen = new Set<string>();
  const cells = answer.cells.flatMap((cell) => {
    const co = cell.co.trim().toUpperCase();
    const outcome = cell.outcome.trim().toUpperCase();
    const level = ([1, 2, 3] as const).find((l) => l === cell.level) ?? null;
    if (!cos.has(co) || !outcomes.has(outcome) || level === null || seen.has(`${co}:${outcome}`)) return [];
    seen.add(`${co}:${outcome}`);
    return [{ co, outcome, level, rationale: cell.rationale.trim().slice(0, 200) }];
  });
  return cells.length > 0 ? cells : null;
}

const MARKS = `You help a university teacher mark one student's written and code answers. For each answer, suggest
the marks it earns out of the question's maximum, judged against the question, the model answer and the criteria when
they are given; with criteria, give marks for each criterion in the order listed. Be fair and consistent: credit what is
correct and relevant, and do not reward length. Give a one-sentence reason the teacher can check against the answer.
The teacher decides every mark.`;

// TP-10 (Q-56, Aniket 28 Oct 2026): suggested marks for a hand-in's written and code answers, each with a reason. Told
// the questions, their model answers and criteria, and the answers as typed (code with how many tests passed), never
// who wrote them. The caller checks every number against the question; what comes back changes no mark by itself.
export async function suggestMarks(input: {
  questions: readonly {
    n: number;
    prompt: string;
    maxMarks: number;
    modelAnswer: string;
    criteria: readonly { criterion: string; maxMarks: number }[];
    answer: string;
    tests: { passed: number; total: number } | null;
  }[];
}): Promise<z.infer<typeof MarkSuggestions>['answers'] | null> {
  const brief = input.questions
    .map((q) =>
      [
        `Question ${q.n} (out of ${q.maxMarks}):\n${q.prompt}`,
        q.modelAnswer && `Model answer:\n${q.modelAnswer}`,
        q.criteria.length > 0 &&
          `Criteria:\n${q.criteria.map((c, i) => `${i + 1}. ${c.criterion} (out of ${c.maxMarks})`).join('\n')}`,
        q.tests && `Tests passed: ${q.tests.passed} of ${q.tests.total}`,
        `Answer:\n${q.answer}`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n---\n\n');
  const answer = await ask('suggestMarks', MARKS, brief, zodTextFormat(MarkSuggestions, 'marks'), 8_000);
  return answer?.answers ?? null;
}

// M10 T5 (ENG-02, ADR-16): a summary of one student's engagement numbers, as the milestone wrote its instructions.
const EXPLAIN = `Explain to a university teacher, in at most 120 words and plain language, what these engagement numbers
suggest and which one or two signals most need attention. Do not speculate about causes outside the data. Do not judge
the student.`;

export async function explainEngagement(input: {
  metrics: Record<string, number>;
  band: string;
  trend: string;
}): Promise<string | null> {
  const brief = [
    ...Object.entries(input.metrics).map(([label, value]) => `${label}: ${value}`),
    `band: ${input.band}`,
    `trend: ${input.trend}`,
  ].join('\n');
  const answer = await ask('explainEngagement', EXPLAIN, brief, zodTextFormat(EngagementExplanation, 'summary'), 1_000);
  const summary = answer?.summary.trim();
  return summary ? summary.slice(0, 1_200) : null;
}

// One structured request (06 §4.7): null when the AI declines or its answer does not fit the format; an AppError when
// it is not set up or cannot be reached (logged).
async function ask<T>(
  operation: string,
  instructions: string,
  input: string,
  format: AutoParseableTextFormat<T>,
  maxOutputTokens: number,
): Promise<T | null> {
  try {
    const res = await openai().responses.parse({
      model: env().OPENAI_MODEL,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
      text: { format },
    });
    return res.output_parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error('ai request failed', { operation, error });
    throw new AppError('INTEGRATION', 'The AI service is unavailable. Try again in a few minutes.');
  }
}
