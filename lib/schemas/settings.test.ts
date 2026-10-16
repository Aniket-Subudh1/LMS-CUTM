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

describe('live-class attendance (07 §10)', () => {
  const attendance = SETTINGS.attendance.schema;
  it('defaults to 75 % of the class and takes a percentage', () => {
    expect(attendance.parse({})).toEqual({ liveThresholdPct: 75 });
    expect(attendance.parse({ liveThresholdPct: '80' })).toEqual({ liveThresholdPct: 80 });
    expect(attendance.safeParse({ liveThresholdPct: '0' }).success).toBe(false);
    expect(attendance.safeParse({ liveThresholdPct: '101' }).success).toBe(false);
  });
});
