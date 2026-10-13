import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatLongDate, initials, statusTone } from './format';

describe('formatting', () => {
  it('prints IST date-times the way 08 §7 shows them', () => {
    expect(formatDateTime(new Date('2026-10-12T05:00:00Z'))).toBe('12 Oct 2026, 10:30 AM');
    expect(formatDateTime(new Date('2026-10-12T18:45:00Z'))).toBe('13 Oct 2026, 12:15 AM');
  });

  it('prints IST dates', () => {
    expect(formatDate(new Date('2026-10-12T18:30:00Z'))).toBe('13 Oct 2026');
    expect(formatLongDate(new Date('2026-10-12T18:30:00Z'))).toBe('Tuesday, 13 October');
  });

  it('maps statuses to a badge tone, with a neutral fallback', () => {
    expect(statusTone('active')).toBe('success');
    expect(statusTone('disabled')).toBe('danger');
    expect(statusTone('something-new')).toBe('secondary');
  });

  it('takes avatar initials from the first two words', () => {
    expect(initials('Asha Mohanty')).toBe('AM');
    expect(initials('  ravi  kumar patnaik ')).toBe('RK');
    expect(initials('Sita')).toBe('S');
  });
});
