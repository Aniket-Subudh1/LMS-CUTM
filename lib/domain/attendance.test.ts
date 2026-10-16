import { describe, expect, it } from 'vitest';
import { attendancePct, deriveAttendance } from './attendance';

const at = (time: string) => new Date(`2026-10-16T${time}:00+05:30`);
const stay = (from: string, to: string | null) => ({ joinedAt: at(from), leftAt: to ? at(to) : null });

describe('deriveAttendance (07 §10)', () => {
  // Session 10:00–11:00 (3600 s), threshold 75 % (2700 s).
  it.each([
    ['09:55–10:50', [stay('09:55', '10:50')], 3000, 'present'],
    ['10:00–10:20, 10:30–11:10', [stay('10:00', '10:20'), stay('10:30', '11:10')], 3000, 'present'],
    ['10:10–10:40, 10:20–10:50', [stay('10:10', '10:40'), stay('10:20', '10:50')], 2400, 'absent'],
    ['10:15–(open)', [stay('10:15', null)], 2700, 'present'],
    ['none', [], 0, 'absent'],
  ])('%s → %d s, %s', (_, presence, presenceSec, status) => {
    expect(deriveAttendance(presence, at('10:00'), at('11:00'), 75)).toEqual({ presenceSec, status });
  });

  it('marks everyone absent in a class of no length', () => {
    expect(deriveAttendance([stay('10:00', null)], at('10:00'), at('10:00'), 75)).toEqual({
      presenceSec: 0,
      status: 'absent',
    });
  });

  it('AC-M03-02: 50 of 60 minutes is present; 40 minutes in two overlapping tabs is absent', () => {
    expect(deriveAttendance([stay('10:00', '10:50')], at('10:00'), at('11:00'), 75).status).toBe('present');
    const twoTabs = [stay('10:00', '10:40'), stay('10:05', '10:30')];
    expect(deriveAttendance(twoTabs, at('10:00'), at('11:00'), 75)).toEqual({ presenceSec: 2400, status: 'absent' });
  });
});

describe('attendancePct', () => {
  it('returns null when nothing was held', () => {
    expect(attendancePct(0, 0)).toBeNull();
  });

  it('rounds to two decimals', () => {
    expect(attendancePct(2, 3)).toBe(66.67);
    expect(attendancePct(12, 14)).toBe(85.71);
  });
});
