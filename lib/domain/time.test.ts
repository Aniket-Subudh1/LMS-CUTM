import { describe, expect, it } from 'vitest';
import { istDateToDate, istDayKey, parseIstLocal } from './time';

describe('parseIstLocal', () => {
  it.each([
    ['2026-10-12T10:30', '2026-10-12T05:00:00.000Z'],
    ['2026-10-13T00:15', '2026-10-12T18:45:00.000Z'],
  ])('parseIstLocal(%s) = %s', (input, expected) => {
    expect(parseIstLocal(input).toISOString()).toBe(expected);
  });

  it.each(['2026-02-30T10:00', '2026-10-12T24:00', '2026-10-12', 'not a date'])('rejects %s', (input) => {
    expect(() => parseIstLocal(input)).toThrow(RangeError);
  });
});

describe('istDateToDate', () => {
  it('is midnight IST', () => {
    expect(istDateToDate('2026-10-13').toISOString()).toBe('2026-10-12T18:30:00.000Z');
  });
});

describe('istDayKey', () => {
  it.each([
    ['2026-10-12T18:29:59Z', '2026-10-12'],
    ['2026-10-12T18:30:00Z', '2026-10-13'],
    ['2026-03-31T18:30:00Z', '2026-04-01'],
  ])('istDayKey(%s) = %s', (input, expected) => {
    expect(istDayKey(new Date(input))).toBe(expected);
  });
});
