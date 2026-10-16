import 'server-only';
import type { ClientSession } from 'mongoose';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import { EngagementDaily } from '@/lib/models/engagement-daily';

const KEEP_MS = 400 * 86_400_000;

type Counter = 'videoSec' | 'liveSec' | 'focusedSec' | 'lessonsCompleted';
export type EngagementRow = { offeringId: string; studentId: string; at: Date; inc: Partial<Record<Counter, number>> };

// 05 §7.1: per-day counters (IST day of `at`), only ever `$inc` upserts (04 §3 S9). The live-class finalize job writes
// them as well as requests, so this file imports nothing from next/* or the session.
export async function addEngagement(rows: readonly EngagementRow[], session?: ClientSession): Promise<void> {
  const ops: Parameters<typeof EngagementDaily.bulkWrite>[0] = [];
  for (const { offeringId, studentId, at, inc } of rows) {
    const counters = Object.fromEntries(Object.entries(inc).filter(([, n]) => n > 0));
    if (Object.keys(counters).length === 0) continue;
    const day = istDayKey(at);
    ops.push({
      updateOne: {
        filter: { offeringId, studentId, day },
        update: { $inc: counters, $setOnInsert: { expiresAt: new Date(istDateToDate(day).getTime() + KEEP_MS) } },
        upsert: true,
      },
    });
  }
  if (ops.length > 0) await EngagementDaily.bulkWrite(ops, { session, ordered: false });
}
