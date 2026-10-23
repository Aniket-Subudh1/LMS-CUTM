import 'server-only';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { offeringAccess, type OfferingAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { attendancePct } from '@/lib/domain/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { Offering } from '@/lib/models/offering';
import { RichTextDoc } from '@/lib/schemas/common';
import type { LessonKind } from '@/lib/schemas/content';

// 05 §4.1: an offering holds at most this many lessons, so its content index is one bounded read.
export const MAX_LESSONS = 300;

export type ContentLesson = {
  id: string;
  kind: LessonKind;
  title: string;
  published: boolean;
  durationSec: number | null;
  // The picture shown for the lesson: the teacher's upload, else the worker's video frame (M03b).
  thumb: string | null;
  notes: number;
  transcode: 'pending' | 'ready' | 'failed' | null;
  // Learner only: the viewer's own progress.
  progressPct: number;
  completed: boolean;
};
export type ContentModule = { id: string; title: string; summary: string | null; lessons: ContentLesson[] };
export type Content = {
  offeringId: string;
  access: OfferingAccess;
  // Admin and the offering's faculty manage modules and lessons; a head of department only looks.
  canTeach: boolean;
  category: 'ugc' | 'skill';
  modules: ContentModule[];
};

// Modules in order with their lessons. A student sees published lessons only, with their own progress (T8).
export async function getContent(offeringId: string): Promise<Content> {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  await db();
  const offering = await Offering.findById(offeringId, { modules: 1, category: 1 }).lean();
  if (!offering) notFound();
  const learn = access === 'learn';
  const lessons = await Lesson.find(
    { offeringId, ...(learn ? { published: true } : {}) },
    {
      moduleId: 1,
      order: 1,
      kind: 1,
      title: 1,
      published: 1,
      durationSec: 1,
      thumbKey: 1,
      frameKey: 1,
      transcode: 1,
      attachments: 1,
    },
  )
    .sort({ moduleId: 1, order: 1 })
    .limit(MAX_LESSONS)
    .lean();
  const progress = learn
    ? await LessonProgress.find({ offeringId, studentId: viewer.id }, { lessonId: 1, progressPct: 1, completedAt: 1 })
        .limit(MAX_LESSONS)
        .lean()
    : [];
  const mine = new Map(progress.map((p) => [String(p.lessonId), p]));
  const byModule = Map.groupBy(lessons, (lesson) => String(lesson.moduleId));
  const modules = offering.modules
    .toSorted((a, b) => a.order - b.order)
    .map((m) => ({
      id: String(m._id),
      title: m.title,
      summary: m.summary ?? null,
      lessons: (byModule.get(String(m._id)) ?? []).map((lesson) => {
        const own = mine.get(String(lesson._id));
        return {
          id: String(lesson._id),
          kind: lesson.kind,
          title: lesson.title,
          published: lesson.published,
          durationSec: lesson.durationSec ?? null,
          thumb: lesson.thumbKey ?? lesson.frameKey ?? null,
          // Lessons saved before M03b have no `attachments` (a lean read applies no default).
          notes: lesson.attachments?.length ?? 0,
          transcode: lesson.transcode ?? null,
          progressPct: own?.progressPct ?? 0,
          completed: Boolean(own?.completedAt),
        };
      }),
    }));
  // A student does not see a module until it has a lesson for them.
  return {
    offeringId,
    access,
    canTeach: access === 'teach' || viewer.roles.includes('admin'),
    category: offering.category,
    modules: learn ? modules.filter((m) => m.lessons.length > 0) : modules,
  };
}

export type LessonDetail = {
  id: string;
  moduleId: string;
  kind: LessonKind;
  title: string;
  description: RichTextDoc | null;
  published: boolean;
  fileKey: string | null;
  fileName: string | null;
  size: number | null;
  durationSec: number | null;
  lowKey: string | null;
  transcode: 'pending' | 'ready' | 'failed' | null;
  url: string | null;
  frameKey: string | null;
  thumbKey: string | null;
  notes: { id: string; key: string; fileName: string; size: number }[];
  publishedAt: Date | null;
  progressPct: number;
  completedAt: Date | null;
  hasProgress: boolean;
};

export async function getLesson(offeringId: string, lessonId: string): Promise<LessonDetail> {
  const viewer = await requireViewer();
  const learn = (await offeringAccess(viewer, offeringId)) === 'learn';
  await db();
  const lesson = await Lesson.findOne(
    { _id: lessonId, offeringId, ...(learn ? { published: true } : {}) },
    {
      moduleId: 1,
      kind: 1,
      title: 1,
      description: 1,
      published: 1,
      fileKey: 1,
      fileName: 1,
      size: 1,
      durationSec: 1,
      lowKey: 1,
      transcode: 1,
      url: 1,
      frameKey: 1,
      thumbKey: 1,
      attachments: 1,
      publishedAt: 1,
    },
  ).lean();
  if (!lesson) notFound();
  const [own, anyProgress] = await Promise.all([
    learn
      ? LessonProgress.findOne({ lessonId, studentId: viewer.id }, { progressPct: 1, completedAt: 1 }).lean()
      : null,
    learn ? null : LessonProgress.exists({ lessonId }),
  ]);
  return {
    id: String(lesson._id),
    moduleId: String(lesson.moduleId),
    kind: lesson.kind,
    title: lesson.title,
    description: lesson.description ? RichTextDoc.parse(lesson.description) : null,
    published: lesson.published,
    fileKey: lesson.fileKey ?? null,
    fileName: lesson.fileName ?? null,
    size: lesson.size ?? null,
    durationSec: lesson.durationSec ?? null,
    lowKey: lesson.lowKey ?? null,
    transcode: lesson.transcode ?? null,
    url: lesson.url ?? null,
    frameKey: lesson.frameKey ?? null,
    thumbKey: lesson.thumbKey ?? null,
    notes: (lesson.attachments ?? []).map((a) => ({
      id: String(a._id),
      key: a.key,
      fileName: a.fileName,
      size: a.size,
    })),
    publishedAt: lesson.publishedAt ?? null,
    progressPct: own?.progressPct ?? 0,
    completedAt: own?.completedAt ?? null,
    hasProgress: learn || Boolean(anyProgress),
  };
}

export type LearnerProgress = {
  completed: number;
  published: number;
  // SKL-04: skill offerings only; null when nothing is published yet.
  attendancePct: number | null;
  watchedMin: number;
  // Where to go on: the unfinished lesson watched most recently, else the first unfinished one (M03b).
  next: { id: string; title: string; moduleId: string; thumb: string | null; progressPct: number } | null;
  // Per module, for the Lessons tab: lessons done of those published.
  modules: { id: string; title: string; done: number; total: number }[];
};

// The viewer's own progress through an offering's published lessons (T9 for skill courses, and the
// "continue" link on every course's Overview). Null for anyone who is not a student of the offering.
export async function getMyProgress(offeringId: string): Promise<LearnerProgress | null> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) !== 'learn') return null;
  const content = await getContent(offeringId);
  const lessons = content.modules.flatMap((m) => m.lessons);
  const completed = lessons.filter((l) => l.completed).length;
  const watched = await LessonProgress.find(
    { offeringId, studentId: viewer.id },
    { lessonId: 1, watchedSec: 1, lastBeaconAt: 1, completedAt: 1 },
  )
    .limit(MAX_LESSONS)
    .lean();
  const lastWatched = watched
    .filter((p) => p.lastBeaconAt && !p.completedAt)
    .toSorted((a, b) => (b.lastBeaconAt?.getTime() ?? 0) - (a.lastBeaconAt?.getTime() ?? 0))[0];
  const moduleOf = new Map(content.modules.flatMap((m) => m.lessons.map((l) => [l.id, m.id] as const)));
  const next =
    lessons.find((l) => lastWatched && l.id === String(lastWatched.lessonId) && !l.completed) ??
    lessons.find((l) => !l.completed) ??
    null;
  return {
    completed,
    published: lessons.length,
    attendancePct: content.category === 'skill' ? attendancePct(completed, lessons.length) : null,
    watchedMin: Math.round(watched.reduce((sum, p) => sum + p.watchedSec, 0) / 60),
    next: next && {
      id: next.id,
      title: next.title,
      moduleId: moduleOf.get(next.id) ?? '',
      thumb: next.thumb,
      progressPct: next.progressPct,
    },
    modules: content.modules.map((m) => ({
      id: m.id,
      title: m.title,
      done: m.lessons.filter((l) => l.completed).length,
      total: m.lessons.length,
    })),
  };
}

export type ContinueRow = {
  offeringId: string;
  offeringTitle: string;
  lessonId: string;
  lessonTitle: string;
  progressPct: number;
  lastWatchedAt: Date;
};

// T10: up to five videos the student has started and not finished, most recently watched first.
export async function listContinueLearning(): Promise<ContinueRow[]> {
  const viewer = await requireViewer(['student']);
  await db();
  const enrolled = await Enrollment.distinct('offeringId', { studentId: viewer.id, status: 'active' });
  const progress = await LessonProgress.find(
    { studentId: viewer.id, offeringId: { $in: enrolled }, progressPct: { $lt: 100 }, lastBeaconAt: { $ne: null } },
    { lessonId: 1, offeringId: 1, progressPct: 1, lastBeaconAt: 1 },
  )
    .sort({ lastBeaconAt: -1 })
    .limit(10)
    .lean();
  const [lessons, offerings] = await Promise.all([
    Lesson.find({ _id: { $in: progress.map((p) => p.lessonId) }, published: true }, { title: 1 }).lean(),
    Offering.find({ _id: { $in: progress.map((p) => p.offeringId) }, status: { $ne: 'draft' } }, { title: 1 }).lean(),
  ]);
  const lessonTitle = new Map(lessons.map((l) => [String(l._id), l.title]));
  const offeringTitle = new Map(offerings.map((o) => [String(o._id), o.title]));
  return progress
    .flatMap((p) => {
      const lesson = lessonTitle.get(String(p.lessonId));
      const offering = offeringTitle.get(String(p.offeringId));
      if (!lesson || !offering || !p.lastBeaconAt) return [];
      return [
        {
          offeringId: String(p.offeringId),
          offeringTitle: offering,
          lessonId: String(p.lessonId),
          lessonTitle: lesson,
          progressPct: p.progressPct,
          lastWatchedAt: p.lastBeaconAt,
        },
      ];
    })
    .slice(0, 5);
}

export type LessonActivity = { opened: number; done: number };

// For the teacher's builder and lesson page: how many students opened and finished each lesson shown (S11: one
// aggregation over the rows on screen, served by the { lessonId, studentId } index).
export async function getLessonActivity(
  offeringId: string,
  lessonIds: readonly string[],
): Promise<Map<string, LessonActivity>> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) === 'learn') return new Map();
  await db();
  const rows = await LessonProgress.aggregate<{ _id: Types.ObjectId; opened: number; done: number }>([
    { $match: { lessonId: { $in: lessonIds.map((id) => new Types.ObjectId(id)) } } },
    {
      $group: {
        _id: '$lessonId',
        opened: { $sum: 1 },
        done: { $sum: { $cond: [{ $ifNull: ['$completedAt', false] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { opened: r.opened, done: r.done }]));
}
