import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { coursewarePageId } from '@/lib/domain/courseware';
import { AppError } from '@/lib/errors';
import { coursewareUrl } from '@/lib/integrations/courseware';
import { AuditLog } from '@/lib/models/audit-log';
import { SyncRun } from '@/lib/models/sync-run';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';

// A run that has not moved for this long has stopped (the worker restarted mid-run); a new one may start.
export const STALE_RUN_MS = 2 * 60 * 60_000;

type RunStatus = 'running' | 'stopped' | 'succeeded' | 'partial' | 'failed';
type RunStats = { rows: number | null; applied: number; skipped: number; failed: number };

export type SyncRunRow = {
  id: string;
  mode: 'new' | 'all' | 'one' | null;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  stats: RunStats;
  actor: string;
};

const statusOf = (run: { status: SyncRunRow['status']; updatedAt: Date }): RunStatus =>
  run.status === 'running' && Date.now() - run.updatedAt.getTime() > STALE_RUN_MS ? 'stopped' : run.status;

async function actorNames(ids: readonly unknown[]): Promise<Map<string, string>> {
  const users = await User.find({ _id: { $in: ids } }, { name: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

export async function listCoursewareRuns(page: number): Promise<{ rows: SyncRunRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const filter = { kind: 'courseware' as const };
  const [docs, total] = await Promise.all([
    SyncRun.find(filter, { mode: 1, status: 1, startedAt: 1, finishedAt: 1, stats: 1, actorId: 1, updatedAt: 1 })
      .sort({ startedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    SyncRun.countDocuments(filter),
  ]);
  const names = await actorNames(docs.map((d) => d.actorId));
  return {
    rows: docs.map((d) => ({
      id: String(d._id),
      mode: d.mode ?? null,
      status: statusOf(d),
      startedAt: d.startedAt,
      finishedAt: d.finishedAt ?? null,
      stats: { rows: d.stats.rows ?? null, applied: d.stats.applied, skipped: d.stats.skipped, failed: d.stats.failed },
      actor: names.get(String(d.actorId)) ?? 'an administrator',
    })),
    total,
  };
}

export type SyncRunDetail = SyncRunRow & { failures: { key: string | null; message: string }[] };

export async function getCoursewareRun(id: string): Promise<SyncRunDetail> {
  await requireViewer(['admin']);
  if (!isValidObjectId(id)) notFound();
  await db();
  const run = await SyncRun.findOne({ _id: id, kind: 'courseware' }).lean();
  if (!run) notFound();
  const names = await actorNames([run.actorId]);
  return {
    id: String(run._id),
    mode: run.mode ?? null,
    status: statusOf(run),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
    stats: {
      rows: run.stats.rows ?? null,
      applied: run.stats.applied,
      skipped: run.stats.skipped,
      failed: run.stats.failed,
    },
    actor: names.get(String(run.actorId)) ?? 'an administrator',
    failures: run.failures.map((f) => ({ key: f.key ?? null, message: f.message })),
  };
}

const UploadCounts = z.object({
  rows: z.number(),
  coursesCreated: z.number(),
  coursesUpdated: z.number(),
  linksCreated: z.number(),
  programmesCreated: z.number(),
});

export type CourseListUpload = { id: string; at: Date; actor: string; counts: z.infer<typeof UploadCounts> | null };

// The last few course-list uploads, from the audit log (`course.list_imported`, 06 §8.5).
export async function listCourseListUploads(): Promise<CourseListUpload[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await AuditLog.find({ entity: 'course_list' }, { at: 1, actorId: 1, after: 1 })
    .sort({ at: -1 })
    .limit(5)
    .lean();
  const names = await actorNames(docs.map((d) => d.actorId));
  return docs.map((d) => ({
    id: String(d._id),
    at: d.at,
    actor: names.get(String(d.actorId)) ?? 'an administrator',
    counts: UploadCounts.safeParse(d.after).data ?? null,
  }));
}

// Starts a courseware run for an action that has already checked the admin; the action then queues its first job.
// One run at a time (a run that has not moved for 2 hours has stopped and does not count).
export async function createCoursewareRun(actorId: string, mode: 'new' | 'all' | 'one'): Promise<string> {
  await db();
  const busy = await SyncRun.exists({
    kind: 'courseware',
    status: 'running',
    updatedAt: { $gt: new Date(Date.now() - STALE_RUN_MS) },
  });
  if (busy) {
    throw new AppError('CONFLICT', 'A courseware import is already running. Wait for it to finish, then start again.');
  }
  const run = await SyncRun.create({
    kind: 'courseware',
    mode,
    actorId,
    startedAt: new Date(),
    // "One page" is listed at once; a listing counts its pages as it reads them.
    stats: { rows: mode === 'one' ? 1 : 0 },
    listedAt: mode === 'one' ? new Date() : null,
  });
  return String(run._id);
}

// "One page": the courseware page number, or its link on the courseware site (06 §4.8).
export const coursewarePageFor = (input: string): number | null => coursewarePageId(input, coursewareUrl());
