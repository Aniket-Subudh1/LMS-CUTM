import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDate,
  formatDay,
  formatDateTime,
  formatDuration,
  formatLongDate,
  formatPct,
  formatTime,
  initials,
  statusTone,
} from './format';

describe('formatting', () => {
  it('prints IST date-times the way 08 §7 shows them', () => {
    expect(formatDateTime(new Date('2026-10-12T05:00:00Z'))).toBe('12 Oct 2026, 10:30 AM');
    expect(formatDateTime(new Date('2026-10-12T18:45:00Z'))).toBe('13 Oct 2026, 12:15 AM');
  });

  it('prints IST times of day', () => {
    expect(formatTime(new Date('2026-10-12T05:00:00Z'))).toBe('10:30 AM');
    expect(formatTime(new Date('2026-10-12T18:45:00Z'))).toBe('12:15 AM');
  });

  it('prints IST dates', () => {
    expect(formatDate(new Date('2026-10-12T18:30:00Z'))).toBe('13 Oct 2026');
    expect(formatLongDate(new Date('2026-10-12T18:30:00Z'))).toBe('Tuesday, 13 October');
    expect(formatDay(new Date('2026-10-13T18:30:00Z'))).toBe('Wed, 14 Oct');
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

  it.each([
    [74, '74%'],
    [66.666, '66.67%'],
    [12.5, '12.5%'],
    [0, '0%'],
  ])('prints %d as %s', (value, text) => {
    expect(formatPct(value)).toBe(text);
  });

  it.each([
    [512, '512 bytes'],
    [2_000_000_000, '2 GB'],
    [640_000_000, '640 MB'],
    [1_540_000, '1.5 MB'],
  ])('prints %d bytes as %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });

  it.each([
    [45, '45 s'],
    [750, '13 min'],
    [3600, '1 h'],
    [3900, '1 h 5 min'],
  ])('prints %d seconds as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});
