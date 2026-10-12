import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, statusTone } from './format';

describe('formatting', () => {
  it('prints IST date-times the way 08 §7 shows them', () => {
    expect(formatDateTime(new Date('2026-10-12T05:00:00Z'))).toBe('12 Oct 2026, 10:30 AM');
    expect(formatDateTime(new Date('2026-10-12T18:45:00Z'))).toBe('13 Oct 2026, 12:15 AM');
  });

  it('prints IST dates', () => {
    expect(formatDate(new Date('2026-10-12T18:30:00Z'))).toBe('13 Oct 2026');
  });

  it('maps statuses to a badge tone, with a neutral fallback', () => {
    expect(statusTone('active')).toBe('default');
    expect(statusTone('disabled')).toBe('destructive');
    expect(statusTone('something-new')).toBe('secondary');
  });
});
