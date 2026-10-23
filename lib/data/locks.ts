import 'server-only';
import mongoose, { Types } from 'mongoose';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { recomputeInternalMarks } from '@/lib/data/internal-marks';
import { AppError } from '@/lib/errors';
import { PART_LABEL } from '@/lib/format';
import { InternalMark, type InternalMarkDoc } from '@/lib/models/internal-mark';
import { Offering } from '@/lib/models/offering';
import { SyncRun } from '@/lib/models/sync-run';
import { User } from '@/lib/models/user';
import type { Component } from '@/lib/schemas/exams';
import type { LockOfferingJob } from '@/lib/schemas/jobs';

// M08 T3 (CE-12): locking a course's internal marks. The worker calls this too, so it imports nothing from next/* or
// the session.

// What keeps each of a student's components open: the theory parts still empty, or a rubric not filled.
export function notesOf(row: Pick<InternalMarkDoc, 'parts' | 'components'>): Partial<Record<Component, string>> {
  const notes: Partial<Record<Component, string>> = {};
  if (row.components.theory === null) {
    notes.theory = row.parts.flatMap((part) => (part.marks === null ? [PART_LABEL[part.key]] : [])).join(', ');
  }
  if (row.components.practice === null) notes.practice = 'rubric not filled';
  if (row.components.project === null) notes.project = 'reviews not marked';
  return notes;
}

export type Incomplete = { studentId: string; name: string; rollNo: string; why: string };

// The students whose internal marks are not complete: how many, and the first `limit` by roll number with why.
export async function incompleteStudents(
  offeringId: string,
  limit: number,
): Promise<{ total: number; students: Incomplete[] }> {
  const [total, rows] = await Promise.all([
    InternalMark.countDocuments({ offeringId, complete: false }),
    InternalMark.find({ offeringId, complete: false }, { studentId: 1, parts: 1, components: 1 }).limit(limit).lean(),
  ]);
  const users = await User.find({ _id: { $in: rows.map((r) => r.studentId) } }, { name: 1, rollNo: 1 }).lean();
  const who = new Map(users.map((u) => [String(u._id), u]));
  const students = rows.map((row) => ({
    studentId: String(row.studentId),
    name: who.get(String(row.studentId))?.name ?? 'Unknown student',
    rollNo: who.get(String(row.studentId))?.rollNo ?? '—',
    why: Object.entries(notesOf(row))
      .map(([component, note]) => `${component[0].toUpperCase()}${component.slice(1)} internal missing: ${note}`)
      .join('; '),
  }));
  return { total, students: students.sort((a, b) => a.rollNo.localeCompare(b.rollNo)) };
}

export type LockResult =
  | { outcome: 'locked'; incomplete: number }
  | { outcome: 'already' }
  | { outcome: 'incomplete'; total: number; students: Incomplete[] };

// The marks are worked out again, then locked with the audit entry in one transaction. Incomplete marks need a
// reason (M08 decision 2); those students get no grade sheet until the course is unlocked and fixed. A last recompute
// straight after the lock catches a change made between the check and the lock; anything later is refused.
export async function lockOffering(
  offeringId: string,
  actorId: string,
  now: Date,
  overrideReason?: string,
): Promise<LockResult> {
  await db();
  const offering = await Offering.findById(offeringId, { category: 1, status: 1, lockedAt: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  if (offering.category !== 'ugc' || offering.status === 'draft') {
    throw new AppError('VALIDATION', 'Only a credit course that has started has marks to lock.');
  }
  if (offering.lockedAt) return { outcome: 'already' };
  await recomputeInternalMarks(offeringId, now);
  const incomplete = await incompleteStudents(offeringId, 20);
  if (incomplete.total > 0 && !overrideReason) return { outcome: 'incomplete', ...incomplete };
  const locked = await mongoose.connection.transaction(async (session) => {
    const written = await Offering.updateOne(
      { _id: offeringId, lockedAt: null },
      { $set: { lockedAt: now, lockedBy: new Types.ObjectId(actorId) } },
      { session },
    );
    if (written.modifiedCount === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'marks.locked',
        entity: 'offering',
        entityId: offeringId,
        offeringId,
        ...(incomplete.total > 0 && overrideReason ? { reason: overrideReason } : {}),
        before: { lockedAt: null },
        after: { lockedAt: now, incomplete: incomplete.total },
      },
      session,
    );
    return true;
  });
  if (!locked) return { outcome: 'already' };
  await recomputeInternalMarks(offeringId, now, now);
  return { outcome: 'locked', incomplete: incomplete.total };
}

// `compute/lockOffering` (06 §6): one course of a "Lock the complete courses" run, locked only when every student's
// marks are complete. Counting the course and finishing the run is one update, so the run finishes exactly once.
export async function lockForRun(job: LockOfferingJob, now: Date): Promise<void> {
  const result = await lockOffering(job.offeringId, job.actorId, now);
  const failure =
    result.outcome === 'incomplete'
      ? {
          row: null,
          key: (await Offering.findById(job.offeringId, { title: 1 }).lean())?.title ?? job.offeringId,
          message: `${result.total} student${result.total === 1 ? '’s' : 's’'} internal marks are incomplete. Lock it on its own with a reason, or fill in the marks first.`,
        }
      : null;
  const finished = { $gte: [{ $add: ['$stats.applied', '$stats.skipped', '$stats.failed'] }, '$stats.rows'] };
  await SyncRun.updateOne(
    { _id: job.syncRunId, status: 'running' },
    [
      {
        $set: {
          'stats.applied': { $add: ['$stats.applied', failure ? 0 : 1] },
          'stats.failed': { $add: ['$stats.failed', failure ? 1 : 0] },
          failures: failure ? { $concatArrays: ['$failures', [{ $literal: failure }]] } : '$failures',
        },
      },
      {
        $set: {
          finishedAt: { $cond: [finished, now, null] },
          status: {
            $cond: [
              finished,
              {
                $cond: [
                  { $eq: ['$stats.failed', 0] },
                  'succeeded',
                  { $cond: [{ $eq: ['$stats.applied', 0] }, 'failed', 'partial'] },
                ],
              },
              'running',
            ],
          },
        },
      },
    ],
    { updatePipeline: true },
  );
}
