import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SETTINGS } from './settings';

const policy = SETTINGS.evaluation.schema;
const fieldErrors = (input: object) => {
  const parsed = policy.safeParse(input);
  return parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
};

describe('evaluation policy (07 §2)', () => {
  it("defaults to CUTM's Examination Policy", () => {
    expect(policy.parse({})).toMatchObject({
      theoryMidTerm1: 15,
      theoryMidTerm2: 15,
      theoryAssignment: 5,
      theoryAttendance: 5,
      theoryEndSem: 60,
      band1Pct: 90,
      band4Marks: 2,
      practiceViva: 10,
      projectExtDefence: 20,
    });
  });

  it('needs the theory parts to add up to 100', () => {
    expect(fieldErrors({ theoryMidTerm1: '20' })).toEqual({
      theoryEndSem: ['The theory parts add up to 105; they must add up to 100.'],
    });
  });

  it('needs attendance bands that fall, with marks no higher than the attendance part', () => {
    expect(fieldErrors({ band2Pct: '90' })).toEqual({ band2Pct: ['Use less than 90 %, the band above.'] });
    expect(fieldErrors({ band1Marks: '6' })).toEqual({ band1Marks: ['At most 5, the attendance part of theory.'] });
  });

  it('needs the practice rubric to make 50 and the project rubrics 100', () => {
    expect(fieldErrors({ practiceViva: '5' })).toEqual({
      practiceViva: ['The practice rubric adds up to 45; it must add up to 50 (the examiner marks the other 50).'],
    });
    expect(fieldErrors({ projectExtDefence: '10' })).toEqual({
      projectExtDefence: ['The project rubrics add up to 90; they must add up to 100.'],
    });
  });
});

describe('code questions (06 §7, TP-09)', () => {
  const schema = SETTINGS.codeRunner.schema;
  it('defaults to C, C++ and Java with Judge0 CE ids, and a 3 s wait', () => {
    expect(schema.parse({})).toEqual({
      languages: [
        { key: 'c', label: 'C (GCC 9.2.0)', runnerId: 50 },
        { key: 'cpp', label: 'C++ (GCC 9.2.0)', runnerId: 54 },
        { key: 'java', label: 'Java (OpenJDK 13.0.1)', runnerId: 62 },
      ],
      runCooldownSec: 3,
    });
  });
  it('reads the form’s lines, and a stored list again', () => {
    const parsed = schema.parse({ languages: 'python | Python (3.8.1) | 71\r\n\r\nc | C | 50', runCooldownSec: '5' });
    expect(parsed.languages).toEqual([
      { key: 'python', label: 'Python (3.8.1)', runnerId: 71 },
      { key: 'c', label: 'C', runnerId: 50 },
    ]);
    expect(schema.parse(parsed)).toEqual(parsed);
  });
  it.each([
    ['a key used twice', 'c | C | 50\nc | C again | 49'],
    ['a key with capitals', 'Cpp | C++ | 54'],
    ['a runner id that is not a number', 'c | C | gcc'],
    ['no language', ''],
  ])('refuses %s', (_, languages) => {
    expect(schema.safeParse({ languages }).success).toBe(false);
  });
});

describe('live-class attendance (07 §10)', () => {
  const attendance = SETTINGS.attendance.schema;
  it('defaults to 75 % of the class and takes a percentage', () => {
    expect(attendance.parse({})).toEqual({ liveThresholdPct: 75 });
    expect(attendance.parse({ liveThresholdPct: '80' })).toEqual({ liveThresholdPct: 80 });
    expect(attendance.safeParse({ liveThresholdPct: '0' }).success).toBe(false);
    expect(attendance.safeParse({ liveThresholdPct: '101' }).success).toBe(false);
  });
});

describe('performance trend (07 §3, M06)', () => {
  const ceTrend = SETTINGS.ceTrend.schema;
  it('defaults to the last 6 results, at least 3, and 2 points', () => {
    expect(ceTrend.parse({})).toEqual({ window: 6, minPoints: 3, slopeThreshold: 2 });
    expect(ceTrend.parse({ window: '8', minPoints: '4', slopeThreshold: '2.5' })).toEqual({
      window: 8,
      minPoints: 4,
      slopeThreshold: 2.5,
    });
  });
  it('needs no more results for a trend than it looks at', () => {
    expect(ceTrend.safeParse({ window: '4', minPoints: '5' }).error?.issues[0]).toMatchObject({ path: ['minPoints'] });
  });
});

describe('project metrics (07 §12, M07)', () => {
  const projects = SETTINGS.projects.schema;
  it('defaults to 48 hours, 1,000 lines and the stock messages, and reads the form’s lines', () => {
    expect(projects.parse({})).toMatchObject({ lastMinuteHours: 48, hugeCommitLines: 1000 });
    expect(projects.parse({}).messageStopWords).toContain('wip');
    expect(projects.parse({ messageStopWords: 'Update\n  WIP , done\n' }).messageStopWords).toEqual([
      'update',
      'wip',
      'done',
    ]);
    expect(projects.safeParse({ lastMinuteHours: '0' }).success).toBe(false);
  });
});

describe('grading (07 §6, M08)', () => {
  const grading = SETTINGS.grading.schema;
  const scaleErrors = (scale: string) => {
    const parsed = grading.safeParse({ scale });
    return parsed.success ? [] : z.flattenError(parsed.error).fieldErrors.scale;
  };
  it('defaults to the UGC letter grades, Ab for absent, and shows the SGPA', () => {
    const value = grading.parse({});
    expect(value.scale.map((g) => `${g.grade} ${g.minPct} ${g.points}`)).toEqual([
      'O 90 10',
      'A+ 80 9',
      'A 70 8',
      'B+ 60 7',
      'B 50 6',
      'C 45 5',
      'P 40 4',
      'F 0 0',
    ]);
    expect(value).toMatchObject({ absentGrade: 'Ab', absentPoints: 0, showSgpa: true });
  });

  it('reads the form’s lines and its yes or no, and a stored value again', () => {
    const value = grading.parse({ scale: 'O | 90 | 10\nA | 60 | 8\nF | 0 | 0', showSgpa: 'no', absentPoints: '0' });
    expect(value.scale).toEqual([
      { grade: 'O', minPct: 90, points: 10 },
      { grade: 'A', minPct: 60, points: 8 },
      { grade: 'F', minPct: 0, points: 0 },
    ]);
    expect(value.showSgpa).toBe(false);
    expect(grading.parse(value)).toEqual(value);
  });

  it.each([
    ['O | 90 | 10\nO | 50 | 6\nF | 0 | 0', 'Use each grade once.'],
    ['O | 90 | 10\nA | 90 | 8\nF | 0 | 0', "A must start below O's 90 %."],
    ['O | 90 | 8\nA | 70 | 9\nF | 0 | 0', 'A cannot earn more points than O.'],
    ['O | 90 | 10\nF | 40 | 0', 'The last grade must start at 0 %, so every mark gets a grade.'],
  ])('refuses %j', (scale, message) => {
    expect(scaleErrors(scale)).toContain(message);
  });
});

describe('attainment (M09, 06 §7)', () => {
  const attainment = SETTINGS.attainment.schema;
  const errors = (value: Record<string, unknown>) => {
    const result = attainment.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

  it('defaults to 07 §4’s values and reads the form’s strings', () => {
    expect(attainment.parse({})).toEqual({
      targetPct: 60,
      level3Pct: 70,
      level2Pct: 60,
      level1Pct: 50,
      cieWeight: 0.5,
      seeWeight: 0.5,
      defaultTargetLevel: 2,
    });
    expect(attainment.parse({ cieWeight: '0.4', seeWeight: '0.6', defaultTargetLevel: '2.5' })).toMatchObject({
      cieWeight: 0.4,
      seeWeight: 0.6,
      defaultTargetLevel: 2.5,
    });
  });

  it.each([
    [{ level3Pct: 60, level2Pct: 60 }, 'Use less than 60 %, the level 3 threshold.'],
    [{ level2Pct: 50, level1Pct: 55 }, 'Use less than 50 %, the level 2 threshold.'],
    [{ cieWeight: 0.6, seeWeight: 0.5 }, 'The weights add up to 1.1; they must add up to 1.'],
    [{ cieWeight: 0.33 }, 'Use steps of 0.05.'],
    [{ defaultTargetLevel: 3.5 }, 'Use a level from 0 to 3.'],
  ])('refuses %j', (value, message) => {
    expect(errors(value)).toContain(message);
  });
});
