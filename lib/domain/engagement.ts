import { roundHalfUp } from '@/lib/domain/round';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import {
  ENGAGEMENT_SIGNALS,
  type EngagementBand,
  type EngagementSignal,
  type EngagementTrend,
} from '@/lib/schemas/engagement';
import type { SettingsValue } from '@/lib/schemas/settings';

// 07 §7 (ENG-01/02): a student's engagement in one offering, from what they did in a window of IST days. Each signal
// is a value in [0, 1], or null when it does not apply; the score is their weighted mean, out of 100.

type Settings = SettingsValue<'engagement'>;
export type EngagementSignals = Record<EngagementSignal, number | null>;

// What one student did in one window; `videos` is every published video lesson with what they have watched of it.
export type EngagementRaw = {
  classesAttended: number;
  classesHeld: number;
  videos: readonly { watchedSec: number; durationSec: number }[];
  closedOnTime: number;
  closed: number;
  // Quiz attempts and code runs.
  practice: number;
  activeDays: number;
};

const DAY_MS = 86_400_000;

// The window of `windowDays` IST days ending today, and the same number of days before it. `from` is the first
// day's midnight in IST; the current window runs to `now`, the previous one to the current one's start.
export function engagementWindows(now: Date, windowDays: number) {
  const today = istDateToDate(istDayKey(now)).getTime();
  const from = new Date(today - (windowDays - 1) * DAY_MS);
  const previousFrom = new Date(from.getTime() - windowDays * DAY_MS);
  return {
    current: { from, to: now, firstDay: istDayKey(from), lastDay: istDayKey(now) },
    previous: {
      from: previousFrom,
      to: from,
      firstDay: istDayKey(previousFrom),
      lastDay: istDayKey(new Date(from.getTime() - 1)),
    },
  };
}

// Nearest rank: the value at index ceil(0.9 n) − 1 of the sorted list; 0 for an empty one.
export function p90(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.9 * sorted.length) - 1] ?? 0;
}

export function engagementSignals(
  raw: EngagementRaw,
  classP90s: { practice: number; activity: number },
): EngagementSignals {
  const duration = raw.videos.reduce((sum, v) => sum + v.durationSec, 0);
  const watched = raw.videos.reduce((sum, v) => sum + Math.min(v.watchedSec, v.durationSec), 0);
  return {
    attendance: raw.classesHeld === 0 ? null : raw.classesAttended / raw.classesHeld,
    video: duration === 0 ? null : watched / duration,
    timeliness: raw.closed === 0 ? null : raw.closedOnTime / raw.closed,
    practice: classP90s.practice === 0 ? null : Math.min(1, raw.practice / classP90s.practice),
    activity: classP90s.activity === 0 ? null : Math.min(1, raw.activeDays / classP90s.activity),
  };
}

export function signalWeights(settings: Settings): Record<EngagementSignal, number> {
  return {
    attendance: settings.attendanceWeight,
    video: settings.videoWeight,
    timeliness: settings.timelinessWeight,
    practice: settings.practiceWeight,
    activity: settings.activityWeight,
  };
}

// The weights of the signals that apply are shared out again over them; none apply (or they weigh nothing), null.
export function engagementScore(signals: EngagementSignals, settings: Settings): number | null {
  const weights = signalWeights(settings);
  let sum = 0;
  let weight = 0;
  for (const signal of ENGAGEMENT_SIGNALS) {
    const value = signals[signal];
    if (value === null) continue;
    sum += weights[signal] * value;
    weight += weights[signal];
  }
  return weight === 0 ? null : roundHalfUp((100 * sum) / weight, 0);
}

export function engagementBand(score: number | null, settings: Settings): EngagementBand | null {
  if (score === null) return null;
  return score >= settings.highBand ? 'high' : score >= settings.mediumBand ? 'medium' : 'low';
}

export function engagementTrend(current: number | null, previous: number | null, delta: number): EngagementTrend {
  if (current === null || previous === null) return 'new';
  const change = current - previous;
  return change >= delta ? 'rising' : change <= -delta ? 'falling' : 'steady';
}
