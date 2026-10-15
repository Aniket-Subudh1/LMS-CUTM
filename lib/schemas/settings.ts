import { z } from 'zod';

const percent = (fallback: number) =>
  z.coerce
    .number({ error: 'Enter a percentage.' })
    .min(1, 'Use a percentage from 1 to 100.')
    .max(100, 'Use a percentage from 1 to 100.')
    .default(fallback);

// The settings registry (06 §7). Each later milestone adds its key here and its form on /admin/settings/[key].
// A missing document means the defaults; `getSettings(key)` returns `schema.parse(stored ?? {})`.
export const SETTINGS = {
  lessons: {
    // Q-17: 90 % is the proposed threshold until the client confirms it.
    schema: z.object({ completePct: percent(90) }),
    label: 'Lesson completion',
    description: 'When a video lesson counts as complete. Skill-course attendance is built on the same rule.',
    fieldHelp: {
      completePct:
        'A video is complete once a student has watched this share of it. Each second counts once, so replaying a part does not add to it. Documents and links are complete when the student marks them done.',
    },
  },
} as const;

export const settingsKey = z.enum(['lessons']);
export type SettingsKey = z.infer<typeof settingsKey>;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
