import { describe, expect, it } from 'vitest';
import {
  engagementBand,
  engagementScore,
  engagementSignals,
  engagementTrend,
  engagementWindows,
  p90,
  type EngagementRaw,
} from './engagement';
import { SETTINGS } from '@/lib/schemas/settings';

// 07 §7, with the defaults: weights 30/20/25/15/10, high from 70, medium from 40, a change of 10.
const settings = SETTINGS.engagement.schema.parse({});

describe('p90 (nearest rank)', () => {
  it.each([
    [[0, 0, 1, 2, 3, 4, 5, 6, 8, 10], 8],
    [[3], 3],
    [[0, 0, 0, 5], 5],
    [[5, 0, 0, 0], 5],
    [[], 0],
  ])('%o → %s', (values, expected) => {
    expect(p90(values)).toBe(expected);
  });
});

describe('engagementSignals', () => {
  const raw: EngagementRaw = {
    classesAttended: 6,
    classesHeld: 8,
    // 600 of 1,000 seconds; watching past a video's end does not count.
    videos: [
      { watchedSec: 400, durationSec: 400 },
      { watchedSec: 900, durationSec: 200 },
      { watchedSec: 0, durationSec: 400 },
    ],
    closedOnTime: 3,
    closed: 4,
    practice: 12,
    activeDays: 10,
  };

  it('gives each signal from the raw numbers and the class P90s', () => {
    expect(engagementSignals(raw, { practice: 16, activity: 20 })).toEqual({
      attendance: 0.75,
      video: 0.6,
      timeliness: 0.75,
      practice: 0.75,
      activity: 0.5,
    });
  });

  it('caps practice and activity at 1 and leaves out what does not apply', () => {
    expect(
      engagementSignals(
        { ...raw, classesHeld: 0, classesAttended: 0, videos: [], closed: 0, closedOnTime: 0, practice: 40 },
        { practice: 16, activity: 0 },
      ),
    ).toEqual({ attendance: null, video: null, timeliness: null, practice: 1, activity: null });
  });
});

describe('engagementScore and band (07 §7 table)', () => {
  const all = { attendance: 0.75, video: 0.6, timeliness: 0.75, practice: 12 / 16, activity: 10 / 20 };

  it('69.5 rounds half up to 70, high', () => {
    const score = engagementScore(all, settings);
    expect(score).toBe(70);
    expect(engagementBand(score, settings)).toBe('high');
  });

  it('with no live sessions the weights share out over the rest: 67.14 → 67, medium', () => {
    const score = engagementScore({ ...all, attendance: null }, settings);
    expect(score).toBe(67);
    expect(engagementBand(score, settings)).toBe('medium');
  });

  it('nothing applicable → no score and no band', () => {
    const none = { attendance: null, video: null, timeliness: null, practice: null, activity: null };
    expect(engagementScore(none, settings)).toBeNull();
    expect(engagementBand(null, settings)).toBeNull();
  });

  it.each([
    [70, 'high'],
    [69, 'medium'],
    [40, 'medium'],
    [39, 'low'],
    [0, 'low'],
  ])('%s → %s', (score, band) => {
    expect(engagementBand(score, settings)).toBe(band);
  });
});

describe('engagementTrend', () => {
  it.each([
    [70, 60, 'rising'],
    [60, 70, 'falling'],
    [69, 60, 'steady'],
    [51, 60, 'steady'],
    [70, null, 'new'],
    [null, 60, 'new'],
  ])('%s after %s → %s', (current, previous, trend) => {
    expect(engagementTrend(current, previous, 10)).toBe(trend);
  });
});

describe('engagementWindows', () => {
  it('runs 28 IST days to now, and the 28 before', () => {
    // 28 Oct 2026, 09:00 IST.
    const w = engagementWindows(new Date('2026-10-28T03:30:00Z'), 28);
    expect(w.current).toMatchObject({ firstDay: '2026-10-01', lastDay: '2026-10-28' });
    expect(w.current.from.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(w.previous).toMatchObject({ firstDay: '2026-09-03', lastDay: '2026-09-30' });
    expect(w.previous.to).toEqual(w.current.from);
  });
});

describe('engagement settings (06 §7)', () => {
  const schema = SETTINGS.engagement.schema;
  it('defaults to 07 §7 and reads the form’s strings', () => {
    expect(settings).toEqual({
      windowDays: 28,
      attendanceWeight: 30,
      videoWeight: 20,
      timelinessWeight: 25,
      practiceWeight: 15,
      activityWeight: 10,
      highBand: 70,
      mediumBand: 40,
      trendDelta: 10,
    });
    expect(schema.parse({ windowDays: '14', highBand: '75' })).toMatchObject({ windowDays: 14, highBand: 75 });
  });
  it.each([
    [{ mediumBand: 70 }, 'Use less than 70, where high starts.'],
    [
      { attendanceWeight: 0, videoWeight: 0, timelinessWeight: 0, practiceWeight: 0, activityWeight: 0 },
      'Give at least one signal a weight.',
    ],
    [{ windowDays: 5 }, 'Use 7 to 90 days.'],
  ])('refuses %j', (value, message) => {
    const result = schema.safeParse(value);
    expect(result.success ? [] : result.error.issues.map((i) => i.message)).toContain(message);
  });
});
