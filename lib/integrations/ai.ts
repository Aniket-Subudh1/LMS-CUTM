import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { log } from '@/lib/log';
import { AiDrafts, type AiDraft } from '@/lib/schemas/bank';

// 06 §4.7. Only this file talks to the AI. It is sent what a teacher types for it and the course's outcome statements,
// never anything about a student (09 §12); what comes back is a suggestion a person reviews before it is used.

let client: Anthropic | undefined;

export function aiConfigured(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}

function anthropic(): Anthropic {
  const apiKey = env().ANTHROPIC_API_KEY;
  if (!apiKey) throw new AppError('CONFLICT', 'AI suggestions are not set up.');
  client ??= new Anthropic({ apiKey });
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

// TP-10: `count` drafts of one type on a topic. Null when the AI declines; an AppError when it cannot be reached.
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
    const res = await anthropic().beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(AiDrafts) },
      system: SYSTEM,
      messages: [{ role: 'user', content: brief }],
    });
    if (res.stop_reason === 'refusal') return null;
    return res.parsed_output?.questions ?? null;
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error('ai request failed', { operation: 'draftQuestions', error });
    throw new AppError('INTEGRATION', 'The AI service is unavailable. Try again in a few minutes.');
  }
}
