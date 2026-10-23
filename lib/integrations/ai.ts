import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { log } from '@/lib/log';
import { AiDrafts, type AiDraft } from '@/lib/schemas/bank';

// 06 §4.7. Only this file talks to the AI (OpenAI, Aniket's choice of 18 Oct 2026 for cost). It is sent what a teacher
// types for it and the course's outcome statements, never anything about a student (09 §12); what comes back is a
// suggestion a person reviews before it is used. The model is the OPENAI_MODEL setting.

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
  try {
    const res = await openai().responses.parse({
      model: env().OPENAI_MODEL,
      instructions: SYSTEM,
      input: brief,
      max_output_tokens: 16_000,
      text: { format: zodTextFormat(AiDrafts, 'drafts') },
    });
    return res.output_parsed?.questions ?? null;
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error('ai request failed', { operation: 'draftQuestions', error });
    throw new AppError('INTEGRATION', 'The AI service is unavailable. Try again in a few minutes.');
  }
}
