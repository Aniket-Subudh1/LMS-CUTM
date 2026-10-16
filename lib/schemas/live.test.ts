import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MarkAttendance, ScheduleSession } from './live';

const offeringId = '665f1c2b9a1e4b0012345678';
const sessionId = '665f1c2b9a1e4b0012345679';
const student = (n: number) => `665f1c2b9a1e4b00123456${String(n).padStart(2, '0')}`;

describe('ScheduleSession', () => {
  const valid = { offeringId, title: 'Pointers', date: '2026-10-20', startTime: '10:30', lengthMin: '60' };
  it('takes a date, a start time and a length', () => {
    expect(ScheduleSession.parse({ ...valid, attendanceMode: 'manual' })).toMatchObject({ lengthMin: 60 });
  });
  it('says which field is wrong', () => {
    const parsed = ScheduleSession.safeParse({ ...valid, startTime: '25:00', lengthMin: '400' });
    expect(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors).toMatchObject({
      startTime: ['Enter a time.'],
      lengthMin: ['A class lasts at most 6 hours.'],
      attendanceMode: ['Choose how attendance is taken.'],
    });
  });
});

describe('MarkAttendance', () => {
  it('reads one radio group per student and ignores other fields', () => {
    expect(
      MarkAttendance.parse({
        offeringId,
        sessionId,
        page: '1',
        [`status_${student(1)}`]: 'present',
        [`status_${student(2)}`]: 'absent',
      }),
    ).toEqual({
      offeringId,
      sessionId,
      marks: [
        { studentId: student(1), status: 'present' },
        { studentId: student(2), status: 'absent' },
      ],
    });
  });
  it('refuses another value and more than one page of students', () => {
    expect(MarkAttendance.safeParse({ offeringId, sessionId, [`status_${student(1)}`]: 'late' }).success).toBe(false);
    const many = Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [`status_${String(i).padStart(24, 'a')}`, 'present']),
    );
    expect(MarkAttendance.safeParse({ offeringId, sessionId, ...many }).success).toBe(false);
  });
});
