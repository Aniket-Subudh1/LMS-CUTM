'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { offeringAccess, requireTeach } from '@/lib/auth/access';
import { addEngagement, MAX_LESSONS } from '@/lib/data/content';
import { db, isDuplicateKey } from '@/lib/db';
import { parseKey, sanitizeFileName } from '@/lib/domain/uploads';
import { AppError } from '@/lib/errors';
import { deleteObjects } from '@/lib/integrations/storage';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { Offering } from '@/lib/models/offering';
import { mediaQueue } from '@/lib/queue';
import {
  CreateLesson,
  LessonRef,
  MoveLesson,
  MoveModule,
  SaveModule,
  SetLessonPublished,
  UpdateLesson,
} from '@/lib/schemas/content';
import type { UploadedFile } from '@/lib/schemas/uploads';

const MAX_MODULES = 40;
const TEACH = ['admin', 'faculty'] as const;

async function requireModule(offeringId: string, moduleId: string) {
  if (!(await Offering.exists({ _id: offeringId, 'modules._id': moduleId }))) {
    throw new AppError('VALIDATION', 'That module no longer exists. Reload the page and pick another.', {
      moduleId: ['Pick a module.'],
    });
  }
}

async function nextLessonOrder(offeringId: string, moduleId: string) {
  const last = await Lesson.findOne({ offeringId, moduleId }, { order: 1 }).sort({ order: -1 }).lean();
  return (last?.order ?? 0) + 1;
}

// 09 §5: a key is accepted only under <purpose>/<this offering>/<this viewer>/.
function ownUpload(file: UploadedFile, purpose: 'lesson-video' | 'lesson-doc', offeringId: string, viewerId: string) {
  const owner = parseKey(file.key);
  if (!owner || owner.purpose !== purpose || owner.contextId !== offeringId || owner.userId !== viewerId) {
    const field = purpose === 'lesson-video' ? 'video[]' : 'document[]';
    throw new AppError('VALIDATION', 'Upload the file again.', { [field]: ['Upload the file again.'] });
  }
  return {
    fileKey: file.key,
    fileName: sanitizeFileName(file.fileName),
    contentType: file.contentType,
    size: file.size,
  };
}

export const saveModule = action(
  { input: SaveModule, roles: TEACH },
  async ({ offeringId, moduleId, title }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    if (moduleId) {
      const renamed = await Offering.updateOne(
        { _id: offeringId, 'modules._id': moduleId },
        { $set: { 'modules.$.title': title } },
      );
      if (renamed.matchedCount === 0) throw new AppError('NOT_FOUND', 'Module not found.');
    } else {
      const offering = await Offering.findById(offeringId, { 'modules.order': 1 }).lean();
      const order = Math.max(0, ...(offering?.modules.map((m) => m.order) ?? [])) + 1;
      // The size guard sits in the filter, so two parallel adds cannot pass 40 modules.
      const added = await Offering.updateOne(
        { _id: offeringId, [`modules.${MAX_MODULES - 1}`]: { $exists: false } },
        { $push: { modules: { title, order } } },
      );
      if (added.matchedCount === 0) throw new AppError('VALIDATION', `A course has at most ${MAX_MODULES} modules.`);
    }
    refresh();
  },
);

export const moveModule = action(
  { input: MoveModule, roles: TEACH },
  async ({ offeringId, moduleId, direction }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const offering = await Offering.findById(offeringId, { modules: 1 }).lean();
    const modules = (offering?.modules ?? []).toSorted((a, b) => a.order - b.order);
    const here = modules.findIndex((m) => m._id.equals(moduleId));
    const there = direction === 'up' ? here - 1 : here + 1;
    if (here < 0 || there < 0 || there >= modules.length) return;
    await Offering.bulkWrite([
      {
        updateOne: {
          filter: { _id: offeringId, 'modules._id': modules[here]._id },
          update: { $set: { 'modules.$.order': modules[there].order } },
        },
      },
      {
        updateOne: {
          filter: { _id: offeringId, 'modules._id': modules[there]._id },
          update: { $set: { 'modules.$.order': modules[here].order } },
        },
      },
    ]);
    refresh();
  },
);

export const moveLesson = action(
  { input: MoveLesson, roles: TEACH },
  async ({ offeringId, lessonId, direction }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const lesson = await Lesson.findOne({ _id: lessonId, offeringId }, { moduleId: 1 }).lean();
    if (!lesson) throw new AppError('NOT_FOUND', 'Lesson not found.');
    const siblings = await Lesson.find({ offeringId, moduleId: lesson.moduleId }, { order: 1 })
      .sort({ order: 1 })
      .lean();
    const here = siblings.findIndex((l) => l._id.equals(lessonId));
    const there = direction === 'up' ? here - 1 : here + 1;
    if (there < 0 || there >= siblings.length) return;
    await Lesson.bulkWrite([
      { updateOne: { filter: { _id: siblings[here]._id }, update: { $set: { order: siblings[there].order } } } },
      { updateOne: { filter: { _id: siblings[there]._id }, update: { $set: { order: siblings[here].order } } } },
    ]);
    refresh();
  },
);

export const createLesson = action({ input: CreateLesson, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  await requireModule(input.offeringId, input.moduleId);
  if ((await Lesson.countDocuments({ offeringId: input.offeringId })) >= MAX_LESSONS) {
    throw new AppError('VALIDATION', `A course holds at most ${MAX_LESSONS} lessons.`);
  }
  const base = {
    offeringId: input.offeringId,
    moduleId: input.moduleId,
    order: await nextLessonOrder(input.offeringId, input.moduleId),
    kind: input.kind,
    title: input.title,
    description: input.description ?? undefined,
    published: false,
  };
  if (input.kind === 'link') {
    await Lesson.create({ ...base, url: input.url });
  } else if (input.kind === 'document') {
    await Lesson.create({ ...base, ...ownUpload(input['document[]'][0], 'lesson-doc', input.offeringId, viewer.id) });
  } else {
    const file = input['video[]'][0];
    // The duration is read in the browser before the upload (T2); without it progress cannot be measured.
    if (!file.durationSec) {
      throw new AppError('VALIDATION', 'We could not read the length of this video.', {
        'video[]': ['This video could not be read. Export it again as MP4 and upload that file.'],
      });
    }
    const lesson = await Lesson.create({
      ...base,
      ...ownUpload(file, 'lesson-video', input.offeringId, viewer.id),
      durationSec: file.durationSec,
      transcode: 'pending',
    });
    await mediaQueue().add('transcodeLesson', { lessonId: String(lesson._id) }, { jobId: `transcode-${lesson._id}` });
  }
  refresh();
});

export const updateLesson = action({ input: UpdateLesson, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  await requireModule(input.offeringId, input.moduleId);
  const lesson = await Lesson.findOne(
    { _id: input.lessonId, offeringId: input.offeringId },
    { moduleId: 1, order: 1 },
  ).lean();
  if (!lesson) throw new AppError('NOT_FOUND', 'Lesson not found.');
  const moved = !lesson.moduleId.equals(input.moduleId);
  await Lesson.updateOne(
    { _id: input.lessonId },
    {
      $set: {
        title: input.title,
        moduleId: input.moduleId,
        order: moved ? await nextLessonOrder(input.offeringId, input.moduleId) : lesson.order,
        ...(input.description ? { description: input.description } : {}),
      },
      ...(input.description ? {} : { $unset: { description: 1 } }),
    },
  );
  refresh();
});

export const setLessonPublished = action(
  { input: SetLessonPublished, roles: TEACH },
  async ({ offeringId, lessonId, published }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const updated = await Lesson.updateOne(
      { _id: lessonId, offeringId },
      published ? { $set: { published: true, publishedAt: new Date() } } : { $set: { published: false } },
    );
    if (updated.matchedCount === 0) throw new AppError('NOT_FOUND', 'Lesson not found.');
    refresh();
  },
);

// Only a draft nobody has opened can go: progress rows are part of a student's record (05 §4.1).
export const deleteLesson = action({ input: LessonRef, roles: TEACH }, async ({ offeringId, lessonId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await db();
  const lesson = await Lesson.findOne(
    { _id: lessonId, offeringId },
    { title: 1, published: 1, fileKey: 1, lowKey: 1 },
  ).lean();
  if (!lesson) throw new AppError('NOT_FOUND', 'Lesson not found.');
  if (lesson.published) throw new AppError('CONFLICT', 'Unpublish the lesson before deleting it.');
  if (await LessonProgress.exists({ lessonId })) {
    throw new AppError(
      'CONFLICT',
      'Students have already opened this lesson, so it cannot be deleted. Keep it unpublished instead.',
    );
  }
  await mongoose.connection.transaction(async (session) => {
    await Lesson.deleteOne({ _id: lessonId }, { session });
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'lesson.deleted',
        entity: 'lesson',
        entityId: lessonId,
        offeringId,
        before: { title: lesson.title },
      },
      session,
    );
  });
  await deleteObjects([lesson.fileKey, lesson.lowKey].flatMap((key) => (key ? [key] : [])));
  refresh();
});

// T8: documents and links are complete when the student says so; videos complete from watch progress.
export const completeLesson = action(
  { input: LessonRef, roles: ['student'] },
  async ({ offeringId, lessonId }, viewer) => {
    if ((await offeringAccess(viewer, offeringId)) !== 'learn')
      throw new AppError('FORBIDDEN', 'Only enrolled students complete lessons.');
    await db();
    const lesson = await Lesson.findOne({ _id: lessonId, offeringId, published: true }, { kind: 1 }).lean();
    if (!lesson) throw new AppError('NOT_FOUND', 'Lesson not found.');
    if (lesson.kind === 'video') throw new AppError('VALIDATION', 'A video completes on its own as you watch it.');
    const now = new Date();
    try {
      // Matches only a row that is not complete yet; when the row is already complete the upsert collides with the
      // unique (lessonId, studentId) index instead, so the lesson is counted once however often this runs.
      await LessonProgress.updateOne(
        { lessonId, studentId: viewer.id, completedAt: null },
        {
          $set: { completedAt: now, progressPct: 100 },
          $min: { openedAt: now },
          $setOnInsert: { offeringId, ranges: [], watchedSec: 0 },
        },
        { upsert: true },
      );
    } catch (error) {
      if (isDuplicateKey(error)) return;
      throw error;
    }
    await addEngagement(offeringId, viewer.id, now, { lessonsCompleted: 1 });
    refresh();
  },
);
