import { z } from 'zod';

// Marks in half steps; the evaluation policy's cross-field rules are below.
const marks = (fallback: number) =>
  z.coerce
    .number({ error: 'Enter a number.' })
    .min(0, 'Use 0 to 100.')
    .max(100, 'Use 0 to 100.')
    .multipleOf(0.5, 'Use steps of 0.5.')
    .default(fallback);

const percent = (fallback: number) =>
  z.coerce
    .number({ error: 'Enter a percentage.' })
    .min(1, 'Use a percentage from 1 to 100.')
    .max(100, 'Use a percentage from 1 to 100.')
    .default(fallback);

// 06 §7, TP-09: Judge0 CE's ids for its GCC 9.2.0 and OpenJDK 13.0.1 (the free public server has the same ids). A
// form posts the languages as lines of `key | label | runner id`; a stored value is the parsed list.
const LANGUAGES = [
  { key: 'c', label: 'C (GCC 9.2.0)', runnerId: 50 },
  { key: 'cpp', label: 'C++ (GCC 9.2.0)', runnerId: 54 },
  { key: 'java', label: 'Java (OpenJDK 13.0.1)', runnerId: 62 },
];
const languageLines = (value: unknown) =>
  typeof value !== 'string'
    ? value
    : value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [key = '', label = '', runnerId = ''] = line.split('|').map((part) => part.trim());
          return { key, label, runnerId };
        });

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
  evaluation: {
    // M01b: CUTM's Examination Policy (2020). Every component is marked out of 100; the parts' names are fixed (the
    // settings page labels them) and only their maxima are settings. 07 §2.
    schema: z
      .object({
        theoryMidTerm1: marks(15),
        theoryMidTerm2: marks(15),
        theoryAssignment: marks(5),
        theoryAttendance: marks(5),
        theoryEndSem: marks(60),
        attendanceMinPct: percent(75),
        band1Pct: percent(90),
        band1Marks: marks(5),
        band2Pct: percent(85),
        band2Marks: marks(4),
        band3Pct: percent(80),
        band3Marks: marks(3),
        band4Pct: percent(75),
        band4Marks: marks(2),
        practiceConcept: marks(5),
        practicePlanning: marks(10),
        practiceResult: marks(10),
        practiceRecord: marks(10),
        practiceConduct: marks(5),
        practiceViva: marks(10),
        projectRelevance: marks(5),
        projectLiterature: marks(5),
        projectMethodology: marks(10),
        projectAnalysis: marks(10),
        projectInterpretation: marks(10),
        projectReport: marks(10),
        projectExtRelevance: marks(10),
        projectExtReport: marks(20),
        projectExtDefence: marks(20),
      })
      .superRefine((p, ctx) => {
        const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
        const theory = p.theoryMidTerm1 + p.theoryMidTerm2 + p.theoryAssignment + p.theoryAttendance + p.theoryEndSem;
        if (theory !== 100) fail('theoryEndSem', `The theory parts add up to ${theory}; they must add up to 100.`);
        const bands = [
          [p.band1Pct, p.band1Marks],
          [p.band2Pct, p.band2Marks],
          [p.band3Pct, p.band3Marks],
          [p.band4Pct, p.band4Marks],
        ];
        bands.forEach(([pct, points], i) => {
          if (points > p.theoryAttendance) {
            fail(`band${i + 1}Marks`, `At most ${p.theoryAttendance}, the attendance part of theory.`);
          }
          if (i === 0) return;
          const [abovePct, abovePoints] = bands[i - 1];
          if (pct >= abovePct) fail(`band${i + 1}Pct`, `Use less than ${abovePct} %, the band above.`);
          if (points > abovePoints)
            fail(`band${i + 1}Marks`, `Use at most ${abovePoints}, the marks of the band above.`);
        });
        const practice =
          p.practiceConcept +
          p.practicePlanning +
          p.practiceResult +
          p.practiceRecord +
          p.practiceConduct +
          p.practiceViva;
        if (practice !== 50) {
          fail(
            'practiceViva',
            `The practice rubric adds up to ${practice}; it must add up to 50 (the examiner marks the other 50).`,
          );
        }
        const project =
          p.projectRelevance +
          p.projectLiterature +
          p.projectMethodology +
          p.projectAnalysis +
          p.projectInterpretation +
          p.projectReport +
          p.projectExtRelevance +
          p.projectExtReport +
          p.projectExtDefence;
        if (project !== 100)
          fail('projectExtDefence', `The project rubrics add up to ${project}; they must add up to 100.`);
      }),
    label: 'Evaluation policy',
    description:
      "How credit courses are marked: CUTM's Examination Policy. Each offering keeps the policy as it was when the offering was created.",
    fieldHelp: {},
  },
  attendance: {
    // Q-17: 75 % is the proposed threshold until the client confirms it.
    schema: z.object({ liveThresholdPct: percent(75) }),
    label: 'Live-class attendance',
    description: 'When a student counts as present in a live class whose attendance is taken automatically.',
    fieldHelp: {
      liveThresholdPct:
        'A student is present when they were in the class for at least this share of the time from its start to its end. Time in two tabs at once counts once. A teacher can still change any student by hand.',
    },
  },
  codeRunner: {
    schema: z.object({
      languages: z
        .preprocess(
          languageLines,
          z
            .array(
              z.object({
                key: z
                  .string()
                  .regex(/^[a-z][a-z0-9_]{0,19}$/, 'Each key is lower-case letters and digits, like cpp.'),
                label: z.string().min(1, 'Give each language a name.').max(60),
                runnerId: z.coerce
                  .number({ error: 'Each runner id is a number.' })
                  .int('Each runner id is a whole number.')
                  .positive('Each runner id is a number.'),
              }),
            )
            .min(1, 'Keep at least one language.')
            .max(10, 'Use at most 10 languages.')
            .refine((list) => new Set(list.map((l) => l.key)).size === list.length, 'Use each key once.'),
        )
        .default(LANGUAGES),
      runCooldownSec: z.coerce
        .number({ error: 'Enter a number of seconds.' })
        .int('Use whole seconds.')
        .min(1, 'Use 1 to 60 seconds.')
        .max(60, 'Use 1 to 60 seconds.')
        .default(3),
    }),
    label: 'Code questions',
    description: 'The languages code questions can use, and how often a student may run their code.',
    fieldHelp: {
      languages:
        'One language a line: a short key, the name students see, and the code runner’s id for it, separated by |. A question keeps the keys it was written with, so remove a language only when no running test uses it.',
      runCooldownSec:
        'The wait between two runs by the same student. Each question also has its own limit on runs; there are at most 200 runs an hour.',
    },
  },
  proctoring: {
    // Q-24: 90 days is the proposed period until the client confirms it (05 §8).
    schema: z.object({
      snapshotRetentionDays: z.coerce
        .number({ error: 'Enter a number of days.' })
        .int('Use whole days.')
        .min(7, 'Keep them at least 7 days.')
        .max(365, 'Keep them at most 365 days.')
        .default(90),
    }),
    label: 'Proctoring',
    description: 'How long the camera snapshots of proctored tests are kept.',
    fieldHelp: {
      snapshotRetentionDays:
        "Snapshots are deleted this many days after a test's results are published. Until then only the test's teachers and owners see them; the person in them never does.",
    },
  },
} as const;

export const settingsKey = z.enum(['lessons', 'evaluation', 'attendance', 'codeRunner', 'proctoring']);
export type SettingsKey = z.infer<typeof settingsKey>;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
