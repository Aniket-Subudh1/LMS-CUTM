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

// M09 (07 §4): a level threshold may be 0 (level 1 for any share); the target is 1–100 (`percent`).
const levelPct = (fallback: number) =>
  z.coerce
    .number({ error: 'Enter a percentage.' })
    .min(0, 'Use a percentage from 0 to 100.')
    .max(100, 'Use a percentage from 0 to 100.')
    .default(fallback);
const whole = (fallback: number, min: number, max: number, unit: string) =>
  z.coerce
    .number({ error: `Enter a number of ${unit}.` })
    .int(`Use whole ${unit}.`)
    .min(min, `Use ${min} to ${max} ${unit}.`)
    .max(max, `Use ${min} to ${max} ${unit}.`)
    .default(fallback);
const weight = (fallback: number) =>
  z.coerce
    .number({ error: 'Enter a weight.' })
    .min(0, 'Use a weight from 0 to 1.')
    .max(1, 'Use a weight from 0 to 1.')
    .multipleOf(0.05, 'Use steps of 0.05.')
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

// 06 §7, 07 §6 (M08): UGC CBCS letter grades; only O from 90 % is in CUTM's Examination Policy (Q-40). The form's
// table posts the scale as lines of `grade | from % | points`; a stored value is the parsed list.
const SCALE = [
  { grade: 'O', minPct: 90, points: 10 },
  { grade: 'A+', minPct: 80, points: 9 },
  { grade: 'A', minPct: 70, points: 8 },
  { grade: 'B+', minPct: 60, points: 7 },
  { grade: 'B', minPct: 50, points: 6 },
  { grade: 'C', minPct: 45, points: 5 },
  { grade: 'P', minPct: 40, points: 4 },
  { grade: 'F', minPct: 0, points: 0 },
];
const scaleLines = (value: unknown) =>
  typeof value !== 'string'
    ? value
    : value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [grade = '', minPct = '', points = ''] = line.split('|').map((part) => part.trim());
          return { grade, minPct, points };
        });
const gradePoints = z.coerce
  .number({ error: 'Points are a number.' })
  .min(0, 'Use 0 to 10 points.')
  .max(10, 'Use 0 to 10 points.')
  .multipleOf(0.5, 'Use steps of 0.5.');

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
                key: z.string().regex(/^[a-z][a-z0-9_]{0,19}$/, 'Each key is lower-case letters and digits, like cpp.'),
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
        'The key is what questions keep (lower-case letters, like cpp), so remove a language only when no running test uses it. The runner id is the code runner’s number for the language.',
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
  ceTrend: {
    // M06 (07 §3): proposed values; the client has not set them.
    schema: z
      .object({
        window: z.coerce
          .number({ error: 'Enter a number of results.' })
          .int('Use a whole number.')
          .min(3, 'Use 3 to 12 results.')
          .max(12, 'Use 3 to 12 results.')
          .default(6),
        minPoints: z.coerce
          .number({ error: 'Enter a number of results.' })
          .int('Use a whole number.')
          .min(2, 'Use at least 2 results.')
          .max(12, 'Use at most 12 results.')
          .default(3),
        slopeThreshold: z.coerce
          .number({ error: 'Enter a number of points.' })
          .min(0.5, 'Use 0.5 to 20 points.')
          .max(20, 'Use 0.5 to 20 points.')
          .multipleOf(0.5, 'Use steps of 0.5.')
          .default(2),
      })
      .refine((v) => v.minPoints <= v.window, {
        path: ['minPoints'],
        message: 'Use at most the number of results looked at.',
      }),
    label: 'Performance trend',
    description: "How a student's results are read as rising, dropping or steady on the Marks tab and the CE report.",
    fieldHelp: {
      window: 'How many of the latest published results are looked at, oldest first.',
      minPoints: 'With fewer published results than this, the trend says "Too few results".',
      slopeThreshold:
        'How many percentage points a result must gain or lose on average, from one to the next, to count as rising or dropping.',
    },
  },
  projects: {
    // M07 (07 §12): proposed values for the commit metrics; the client has not set them. The stock commit messages are
    // chips the form posts separated by commas (new lines work too); a stored value is the list.
    schema: z.object({
      lastMinuteHours: z.coerce
        .number({ error: 'Enter a number of hours.' })
        .int('Use whole hours.')
        .min(1, 'Use 1 to 168 hours.')
        .max(168, 'Use 1 to 168 hours.')
        .default(48),
      hugeCommitLines: z.coerce
        .number({ error: 'Enter a number of lines.' })
        .int('Use whole lines.')
        .min(100, 'Use 100 to 100,000 lines.')
        .max(100_000, 'Use 100 to 100,000 lines.')
        .default(1000),
      messageStopWords: z
        .preprocess(
          (value) =>
            typeof value === 'string'
              ? value
                  .split(/[\n,]/)
                  .map((word) => word.trim().toLowerCase())
                  .filter(Boolean)
              : value,
          z.array(z.string().max(40, 'Keep each one to 40 characters.')).max(50, 'Use at most 50.'),
        )
        .default(['update', 'fix', 'changes', 'commit', 'wip', 'test', 'minor', 'asdf', '.']),
    }),
    label: 'Project metrics',
    description: "How a GitHub project's commits are read for the suggested score teachers see while marking a review.",
    fieldHelp: {
      lastMinuteHours: 'Commits this many hours before a project is due count as last-minute.',
      hugeCommitLines: 'A commit that adds and removes more lines than this together is flagged as huge.',
      messageStopWords:
        'A message that is one of these, or shorter than 10 characters, does not count as a good message.',
    },
  },
  grading: {
    // M08 (07 §6): proposed values; Q-19, Q-21 and Q-40 are open.
    schema: z.object({
      scale: z
        .preprocess(
          scaleLines,
          z
            .array(
              z.object({
                grade: z.string().min(1, 'Give each grade a name.').max(4, 'Keep each grade to 4 characters, like A+.'),
                minPct: z.coerce
                  .number({ error: 'Each “from %” is a number.' })
                  .min(0, 'Use 0 to 100 %.')
                  .max(100, 'Use 0 to 100 %.'),
                points: gradePoints,
              }),
            )
            .min(2, 'Keep at least two grades.')
            .max(12, 'Use at most 12 grades.')
            .superRefine((scale, ctx) => {
              const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
              if (new Set(scale.map((g) => g.grade)).size !== scale.length) fail('Use each grade once.');
              scale.forEach((g, i) => {
                const above = scale[i - 1];
                if (above && g.minPct >= above.minPct)
                  fail(`${g.grade} must start below ${above.grade}'s ${above.minPct} %.`);
                if (above && g.points > above.points) fail(`${g.grade} cannot earn more points than ${above.grade}.`);
              });
              if (scale.at(-1)?.minPct !== 0) fail('The last grade must start at 0 %, so every mark gets a grade.');
            }),
        )
        .default(SCALE),
      absentGrade: z
        .string()
        .trim()
        .min(1, 'Give the grade a name.')
        .max(4, 'Keep it to 4 characters, like Ab.')
        .default('Ab'),
      absentPoints: gradePoints.default(0),
      // A select posts `yes` or `no`; a stored value is the boolean.
      showSgpa: z
        .preprocess((value) => (value === 'yes' ? true : value === 'no' ? false : value), z.boolean())
        .default(true),
    }),
    label: 'Grading',
    description: 'How a course’s percentage becomes a grade and grade points on the grade sheet.',
    fieldHelp: {
      scale:
        'Highest grade first; each runs from its own % up to the grade above it. The last grade starts at 0, so every mark gets one. The course percentage is rounded up before it is graded.',
      absentGrade:
        'The grade of a course where the student is AB in any external part. Its credits still count in the SGPA.',
      absentPoints: 'The grade points of that course.',
      showSgpa: 'Whether students see their SGPA on the grade sheet.',
    },
  },
  attainment: {
    // M09 (07 §4): the team's proposed values until the client confirms the formula (Q-07).
    schema: z
      .object({
        targetPct: percent(60),
        level3Pct: levelPct(70),
        level2Pct: levelPct(60),
        level1Pct: levelPct(50),
        cieWeight: weight(0.5),
        seeWeight: weight(0.5),
        defaultTargetLevel: z.coerce
          .number({ error: 'Enter a level.' })
          .min(0, 'Use a level from 0 to 3.')
          .max(3, 'Use a level from 0 to 3.')
          .multipleOf(0.1, 'Use steps of 0.1.')
          .default(2),
      })
      .superRefine((a, ctx) => {
        const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
        if (a.level3Pct <= a.level2Pct) fail('level2Pct', `Use less than ${a.level3Pct} %, the level 3 threshold.`);
        if (a.level2Pct <= a.level1Pct) fail('level1Pct', `Use less than ${a.level2Pct} %, the level 2 threshold.`);
        // Steps of 0.05 add up exactly in hundredths.
        if (Math.round(100 * (a.cieWeight + a.seeWeight)) !== 100) {
          fail(
            'seeWeight',
            `The weights add up to ${Math.round(100 * (a.cieWeight + a.seeWeight)) / 100}; they must add up to 1.`,
          );
        }
      }),
    label: 'Attainment',
    description: 'How course outcomes, and then programme outcomes, are judged attained from the marks.',
    fieldHelp: {
      targetPct:
        'A student attains a course outcome when their marks on the questions tagged with it reach this share, and attains the end-semester part when their external marks do.',
      level3Pct: 'The share of students who attain an outcome that makes it level 3.',
      level2Pct: 'The share that makes it level 2; below this but at least the next, level 1.',
      level1Pct: 'The share that makes it level 1; below it, level 0.',
      cieWeight: 'How much the internal (continuous) assessments count in an outcome’s value.',
      seeWeight: 'How much the end-semester exam counts; the two weights add up to 1.',
      defaultTargetLevel: 'The value every course outcome is meant to reach; a course outcome at or above it is met.',
    },
  },
  engagement: {
    // M10 (07 §7): the team's proposed values until the client confirms what engagement must mean (Q-26).
    schema: z
      .object({
        windowDays: whole(28, 7, 90, 'days'),
        attendanceWeight: whole(30, 0, 100, 'points'),
        videoWeight: whole(20, 0, 100, 'points'),
        timelinessWeight: whole(25, 0, 100, 'points'),
        practiceWeight: whole(15, 0, 100, 'points'),
        activityWeight: whole(10, 0, 100, 'points'),
        highBand: whole(70, 1, 100, 'points'),
        mediumBand: whole(40, 1, 100, 'points'),
        trendDelta: whole(10, 1, 50, 'points'),
      })
      .superRefine((e, ctx) => {
        const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
        if (e.attendanceWeight + e.videoWeight + e.timelinessWeight + e.practiceWeight + e.activityWeight === 0) {
          fail('activityWeight', 'Give at least one signal a weight.');
        }
        if (e.mediumBand >= e.highBand) fail('mediumBand', `Use less than ${e.highBand}, where high starts.`);
      }),
    label: 'Engagement',
    description: 'How a student’s engagement score, band and trend are worked out for their teachers each night.',
    fieldHelp: {
      windowDays: 'The score looks at this many days up to today; the trend compares it with the same number before.',
      attendanceWeight: 'Live classes attended out of those held in the window.',
      videoWeight: 'Share of every published video watched, since the course began.',
      timelinessWeight: 'Assessments handed in on time out of those that closed in the window.',
      practiceWeight: 'Quiz attempts and code runs, against the class’s most active students.',
      activityWeight: 'Days with any study, against the class’s most active students.',
      highBand: 'A score from this is high.',
      mediumBand: 'A score from this, below high, is medium; below it is low.',
      trendDelta:
        'How many points the score must gain or lose against the window before to count as rising or falling.',
    },
  },
} as const;

export const settingsKey = z.enum([
  'lessons',
  'evaluation',
  'attendance',
  'codeRunner',
  'proctoring',
  'ceTrend',
  'projects',
  'grading',
  'attainment',
  'engagement',
]);
export type SettingsKey = z.infer<typeof settingsKey>;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
