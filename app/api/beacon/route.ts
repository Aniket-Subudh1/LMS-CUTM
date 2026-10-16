import { z } from 'zod';
import { getViewer, type Viewer } from '@/lib/auth/session';
import { addEngagement } from '@/lib/data/engagement';
import { getSettings } from '@/lib/data/settings';
import { db, isDuplicateKey } from '@/lib/db';
import { acceptFocusBeacon, acceptVideoBeacon, mergeRanges, type Range } from '@/lib/domain/ranges';
import { AppError } from '@/lib/errors';
import { log } from '@/lib/log';
import { Attendance } from '@/lib/models/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { limit } from '@/lib/rate-limit';
import { Beacon } from '@/lib/schemas/content';

const MAX_RANGES = 200;
// Mongoose types a nested number array loosely; the stored value is checked into tuples instead of cast.
const Ranges = z.array(z.tuple([z.number(), z.number()]));

type VideoBeacon = {
  lessonId: string;
  offeringId: string;
  studentId: string;
  durationSec: number;
  ranges: Range[];
  completePct: number;
  now: Date;
};

// 07 §8–9. Reads the progress row, merges, checks the claim against elapsed time and writes back only if nobody
// wrote in between (optimistic concurrency on updatedAt); a lost race re-reads and tries once more.
async function storeVideo(beacon: VideoBeacon, retried = false): Promise<void> {
  const { lessonId, offeringId, studentId, now } = beacon;
  const current = await LessonProgress.findOne(
    { lessonId, studentId },
    { ranges: 1, watchedSec: 1, completedAt: 1, lastBeaconAt: 1, updatedAt: 1 },
  ).lean();
  const merged = mergeRanges(Ranges.parse(current?.ranges ?? []), beacon.ranges, beacon.durationSec);
  const verdict = acceptVideoBeacon({
    watchedBefore: current?.watchedSec ?? 0,
    watchedAfter: merged.watchedSec,
    lastBeaconAt: current?.lastBeaconAt ?? null,
    now,
  });
  if (!verdict.accepted || merged.ranges.length > MAX_RANGES) {
    log.warn('video beacon ignored', { lessonId, studentId, newSec: verdict.newSec, ranges: merged.ranges.length });
    return;
  }
  const completedNow = !current?.completedAt && merged.progressPct >= beacon.completePct;
  const set = {
    ranges: merged.ranges,
    watchedSec: merged.watchedSec,
    progressPct: merged.progressPct,
    lastBeaconAt: now,
    ...(completedNow ? { completedAt: now } : {}),
  };

  let written = true;
  if (current) {
    const res = await LessonProgress.updateOne({ _id: current._id, updatedAt: current.updatedAt }, { $set: set });
    written = res.matchedCount === 1;
  } else {
    try {
      await LessonProgress.create({ lessonId, offeringId, studentId, ...set });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      written = false;
    }
  }
  if (!written) {
    if (!retried) return storeVideo(beacon, true);
    log.warn('video beacon lost to concurrent writes', { lessonId, studentId });
    return;
  }
  await addEngagement([
    { offeringId, studentId, at: now, inc: { videoSec: verdict.newSec, lessonsCompleted: completedNow ? 1 : 0 } },
  ]);
}

const done = () => new Response(null, { status: 204 });
const missing = () => new Response(null, { status: 404 });

type Parsed = z.infer<typeof Beacon>;

async function video(viewer: Viewer, beacon: Extract<Parsed, { kind: 'video' }>): Promise<Response> {
  const lesson = await Lesson.findById(beacon.lessonId, {
    offeringId: 1,
    kind: 1,
    published: 1,
    durationSec: 1,
  }).lean();
  if (!lesson || !lesson.published || lesson.kind !== 'video' || !lesson.durationSec) return missing();
  // Only a student of the offering (offeringAccess = learn) records progress; anyone else gets the same 404.
  const [enrolled, open] = await Promise.all([
    Enrollment.exists({ offeringId: lesson.offeringId, studentId: viewer.id, status: 'active' }),
    Offering.exists({ _id: lesson.offeringId, status: { $ne: 'draft' } }),
  ]);
  if (!enrolled || !open) return missing();
  const { completePct } = await getSettings('lessons');
  await storeVideo({
    lessonId: beacon.lessonId,
    offeringId: String(lesson.offeringId),
    studentId: viewer.id,
    durationSec: lesson.durationSec,
    ranges: beacon.ranges,
    completePct,
    now: new Date(),
  });
  return done();
}

// LIV-03, 07 §9: focused seconds count only for a student connected to a class that is live.
async function live(viewer: Viewer, beacon: Extract<Parsed, { kind: 'live' }>): Promise<Response> {
  const [session, row] = await Promise.all([
    LiveSession.findById(beacon.sessionId, { offeringId: 1, status: 1 }).lean(),
    Attendance.findOne({ sessionId: beacon.sessionId, studentId: viewer.id }, { presence: 1, lastFocusAt: 1 }).lean(),
  ]);
  // Rows exist only for enrolled students who joined, so anyone else gets a 404.
  if (!session || !row) return missing();
  const now = new Date();
  const lastFocusAt = row.lastFocusAt ?? null;
  const connected = row.presence.some((connection) => !connection.leftAt);
  if (session.status !== 'live' || !connected || !acceptFocusBeacon({ ...beacon, lastFocusAt, now })) {
    log.warn('focus beacon ignored', {
      sessionId: beacon.sessionId,
      studentId: viewer.id,
      focusedSec: beacon.focusedSec,
    });
    return done();
  }
  // Conditional on the lastFocusAt just read, so two beacons at once cannot both claim the same time.
  const written = await Attendance.updateOne(
    { _id: row._id, lastFocusAt },
    { $inc: { focusedSec: beacon.focusedSec }, $set: { lastFocusAt: now } },
  );
  if (written.matchedCount === 1) {
    await addEngagement([
      { offeringId: String(session.offeringId), studentId: viewer.id, at: now, inc: { focusedSec: beacon.focusedSec } },
    ]);
  }
  return done();
}

export async function POST(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Beacon.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  // 09 §4: one limit for every beacon a user sends, video or live.
  try {
    await limit('beacon', viewer.id, 120, 10 * 60_000);
  } catch (error) {
    if (error instanceof AppError && error.code === 'RATE_LIMITED') return new Response(null, { status: 429 });
    throw error;
  }
  await db();
  return parsed.data.kind === 'video' ? video(viewer, parsed.data) : live(viewer, parsed.data);
}
