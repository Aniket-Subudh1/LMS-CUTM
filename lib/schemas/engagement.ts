import { z } from 'zod';

// M10 (07 §7): a student's engagement band and trend, as stored on `enrollments.engagement` and filtered on the
// People tab.
export const ENGAGEMENT_BANDS = ['high', 'medium', 'low'] as const;
export const ENGAGEMENT_TRENDS = ['rising', 'steady', 'falling', 'new'] as const;
export const EngagementBand = z.enum(ENGAGEMENT_BANDS);
export const EngagementTrend = z.enum(ENGAGEMENT_TRENDS);
export type EngagementBand = z.infer<typeof EngagementBand>;
export type EngagementTrend = z.infer<typeof EngagementTrend>;

export const ENGAGEMENT_SIGNALS = ['attendance', 'video', 'timeliness', 'practice', 'activity'] as const;
export type EngagementSignal = (typeof ENGAGEMENT_SIGNALS)[number];
