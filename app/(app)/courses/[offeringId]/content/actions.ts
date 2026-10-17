'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { offeringAccess, requireTeach } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { MAX_LESSONS } from '@/lib/data/content';
import { addEngagement } from '@/lib/data/engagement';
import { db, isDuplicateKey } from '@/lib/db';
import { isPermutation } from '@/lib/domain/order';
import { fileUuid, parseKey, sanitizeFileName } from '@/lib/domain/uploads';
import { AppError } from '@/lib/errors';
import { deleteObjects } from '@/lib/integrations/storage';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { Offering } from '@/lib/models/offering';
import { mediaQueue } from '@/lib/queue';
import {
  AddLessonNotes,
  CreateLesson,
  LessonNoteRef,
  LessonRef,
  MAX_NOTES,
  ModuleRef,
  MoveLessonToModule,
  ReorderLessons,
  ReorderModules,
  ReplaceLessonFile,
  SaveModule,
  SetLessonPublished,
  SetLessonThumb,
  SetModulePublished,
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

const FIELD = { 'lesson-video': 'video[]', 'lesson-doc': 'document[]', 'lesson-thumb': 'thumb[]' } as const;

// 09 §5: a key is accepted only under <purpose>/<this offering>/<this viewer>/.
function ownUpload(
  file: UploadedFile,
  purpose: keyof typeof FIELD,
  offeringId: string,
  viewerId: string,
  field: string = FIELD[purpose],
) {
  const owner = parseKey(file.key);
  if (!owner || owner.purpose !== purpose || owner.contextId !== offeringId || owner.userId !== viewerId) {
    throw new AppError('VALIDATION', 'Upload the file again.', { [field]: ['Upload the file again.'] });
  }
  return {
    fileKey: file.key,
    fileName: sanitizeFileName(file.fileName),
    contentType: file.contentType,
    size: file.size,
  };
}

const notesOf = (files: UploadedFile[], offeringId: string, viewerId: string) =>
  files.map((file) => {
    const note = ownUpload(file, 'lesson-doc', offeringId, viewerId, 'notes[]');
    return { key: note.fileKey, fileName: note.fileName, size: note.size };
  });

// One job per file: a replaced video gets a job of its own, never the finished one of the file before (06 §6).
function queueMedia(lessonId: string, fileKey: string) {
  return mediaQueue().add(
    'transcodeLesson',
    { lessonId, fileKey },
    { jobId: `transcode-${lessonId}-${fileUuid(fileKey)}` },
  );
}

async function teachLesson(viewer: Viewer, offeringId: string, lessonId: string) {
  await requireTeach(viewer, offeringId);
  await db();
  const lesson = await Lesson.findOne({ _id: lessonId, offeringId }).lean();
  if (!lesson) throw new AppError('NOT_FOUND', 'Lesson not found.');
  return lesson;
}

export const saveModule = action(
  { input: SaveModule, roles: TEACH },
  async ({ offeringId, moduleId, title, summary }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    if (moduleId) {
      const renamed = await Offering.updateOne(
        { _id: offeringId, 'modules._id': moduleId },
        summary
          ? { $set: { 'modules.$.title': title, 'modules.$.summary': summary } }
          : { $set: { 'modules.$.title': title }, $unset: { 'modules.$.summary': 1 } },
      );
      if (renamed.matchedCount === 0) throw new AppError('NOT_FOUND', 'Module not found.');
    } else {
      const offering = await Offering.findById(offeringId, { 'modules.order': 1 }).lean();
      const order = Math.max(0, ...(offering?.modules.map((m) => m.order) ?? [])) + 1;
      // The size guard sits in the filter, so two parallel adds cannot pass 40 modules.
      const added = await Offering.updateOne(
        { _id: offeringId, [`modules.${MAX_MODULES - 1}`]: { $exists: false } },
        { $push: { modules: { title, order, ...(summary ? { summary } : {}) } } },
      );
      if (added.matchedCount === 0) throw new AppError('VALIDATION', `A course has at most ${MAX_MODULES} modules.`);
    }
    refresh();
  },
);

// Only an empty module goes; its lessons are moved or deleted first, each by its own rule.
export const deleteModule = action({ input: ModuleRef, roles: TEACH }, async ({ offeringId, moduleId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await db();
  const lessons = await Lesson.countDocuments({ offeringId, moduleId });
  if (lessons > 0) {
    throw new AppError(
      'CONFLICT',
      `Move or delete its ${lessons === 1 ? 'lesson' : `${lessons} lessons`} first, then delete the module.`,
    );
  }
  const removed = await Offering.updateOne({ _id: offeringId }, { $pull: { modules: { _id: moduleId } } });
  if (removed.modifiedCount === 0) throw new AppError('NOT_FOUND', 'Module not found.');
  refresh();
});

export const reorderModules = action({ input: ReorderModules, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  const offering = await Offering.findById(input.offeringId, { 'modules._id': 1 }).lean();
  const ids = input['ids[]'];
  if (
    !offering ||
    !isPermutation(
      offering.modules.map((m) => String(m._id)),
      ids,
    )
  ) {
    throw new AppError('CONFLICT', 'The modules changed meanwhile. Reload the page and try again.');
  }
  await Offering.bulkWrite(
    ids.map((id, i) => ({
      updateOne: {
        filter: { _id: input.offeringId, 'modules._id': id },
        update: { $set: { 'modules.$.order': i + 1 } },
      },
    })),
  );
  refresh();
});

export const reorderLessons = action({ input: ReorderLessons, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  const lessons = await Lesson.find({ offeringId: input.offeringId, moduleId: input.moduleId }, { _id: 1 }).lean();
  const ids = input['ids[]'];
  if (
    !isPermutation(
      lessons.map((l) => String(l._id)),
      ids,
    )
  ) {
    throw new AppError('CONFLICT', 'The lessons changed meanwhile. Reload the page and try again.');
  }
  await Lesson.bulkWrite(
    ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i + 1 } } } })),
  );
  refresh();
});

export const moveLessonToModule = action({ input: MoveLessonToModule, roles: TEACH }, async (input, viewer) => {
  const lesson = await teachLesson(viewer, input.offeringId, input.lessonId);
  await requireModule(input.offeringId, input.moduleId);
  if (lesson.moduleId.equals(input.moduleId)) return;
  await Lesson.updateOne(
    { _id: input.lessonId },
    { $set: { moduleId: input.moduleId, order: await nextLessonOrder(input.offeringId, input.moduleId) } },
  );
  refresh();
});

// Publish all or unpublish all of a module's lessons at once (students are not notified, as for one lesson).
export const setModulePublished = action(
  { input: SetModulePublished, roles: TEACH },
  async ({ offeringId, moduleId, published }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    await requireModule(offeringId, moduleId);
    await Lesson.updateMany(
      { offeringId, moduleId, published: !published },
      published ? { $set: { published: true, publishedAt: new Date() } } : { $set: { published: false } },
    );
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
    attachments: notesOf(input['notes[]'], input.offeringId, viewer.id),
    ...(input['thumb[]'][0]
      ? { thumbKey: ownUpload(input['thumb[]'][0], 'lesson-thumb', input.offeringId, viewer.id).fileKey }
      : {}),
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
    await queueMedia(String(lesson._id), lesson.fileKey ?? '');
  }
  refresh();
});

export const updateLesson = action({ input: UpdateLesson, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  await requireModule(input.offeringId, input.moduleId);
  const lesson = await Lesson.findOne(
    { _id: input.lessonId, offeringId: input.offeringId },
    { moduleId: 1, order: 1, kind: 1 },
  ).lean();
  if (!lesson) throw new AppError('NOT_FOUND', 'Lesson not found.');
  if (lesson.kind === 'link' && !input.url) {
    throw new AppError('VALIDATION', 'Enter the link.', { url: ['Enter a full link that starts with https://'] });
  }
  const moved = !lesson.moduleId.equals(input.moduleId);
  await Lesson.updateOne(
    { _id: input.lessonId },
    {
      $set: {
        title: input.title,
        moduleId: input.moduleId,
        order: moved ? await nextLessonOrder(input.offeringId, input.moduleId) : lesson.order,
        ...(lesson.kind === 'link' ? { url: input.url } : {}),
        ...(input.description ? { description: input.description } : {}),
      },
      ...(input.description ? {} : { $unset: { description: 1 } }),
    },
  );
  refresh();
});

// A document can always be swapped. A video only until a student has watched any of it: their seconds watched belong
// to the old file (A-82). The new video gets a new frame and phone copy; the old objects go once the write is done.
export const replaceLessonFile = action({ input: ReplaceLessonFile, roles: TEACH }, async (input, viewer) => {
  const lesson = await teachLesson(viewer, input.offeringId, input.lessonId);
  if (lesson.kind === 'link') throw new AppError('VALIDATION', 'A link lesson has no file. Edit its link instead.');
  const old = [lesson.fileKey, lesson.lowKey, lesson.frameKey].flatMap((key) => (key ? [key] : []));
  if (lesson.kind === 'document') {
    const file = input['document[]'][0];
    if (!file) throw new AppError('VALIDATION', 'Upload the PDF first.', { 'document[]': ['Upload the PDF first.'] });
    await Lesson.updateOne({ _id: lesson._id }, { $set: ownUpload(file, 'lesson-doc', input.offeringId, viewer.id) });
  } else {
    const file = input['video[]'][0];
    if (!file) throw new AppError('VALIDATION', 'Upload the video first.', { 'video[]': ['Upload the video first.'] });
    if (!file.durationSec) {
      throw new AppError('VALIDATION', 'We could not read the length of this video.', {
        'video[]': ['This video could not be read. Export it again as MP4 and upload that file.'],
      });
    }
    if (await LessonProgress.exists({ lessonId: lesson._id, watchedSec: { $gt: 0 } })) {
      throw new AppError(
        'CONFLICT',
        'Students have started watching this video, so it cannot be replaced. Add a new lesson and unpublish this one.',
      );
    }
    const next = ownUpload(file, 'lesson-video', input.offeringId, viewer.id);
    await Lesson.updateOne(
      { _id: lesson._id },
      { $set: { ...next, durationSec: file.durationSec, transcode: 'pending' }, $unset: { lowKey: 1, frameKey: 1 } },
    );
    await queueMedia(String(lesson._id), next.fileKey);
  }
  await deleteObjects(old);
  refresh();
});

export const setLessonThumb = action({ input: SetLessonThumb, roles: TEACH }, async (input, viewer) => {
  const lesson = await teachLesson(viewer, input.offeringId, input.lessonId);
  const thumbKey = ownUpload(input['thumb[]'][0], 'lesson-thumb', input.offeringId, viewer.id).fileKey;
  await Lesson.updateOne({ _id: lesson._id }, { $set: { thumbKey } });
  if (lesson.thumbKey) await deleteObjects([lesson.thumbKey]);
  refresh();
});

// The video's own frame shows again; other lessons fall back to their type's mark.
export const clearLessonThumb = action({ input: LessonRef, roles: TEACH }, async (input, viewer) => {
  const lesson = await teachLesson(viewer, input.offeringId, input.lessonId);
  if (!lesson.thumbKey) return;
  await Lesson.updateOne({ _id: lesson._id }, { $unset: { thumbKey: 1 } });
  await deleteObjects([lesson.thumbKey]);
  refresh();
});

export const addLessonNotes = action({ input: AddLessonNotes, roles: TEACH }, async (input, viewer) => {
  const lesson = await teachLesson(viewer, input.offeringId, input.lessonId);
  const notes = notesOf(input['notes[]'], input.offeringId, viewer.id);
  // The limit sits in the filter, so two parallel adds cannot pass five notes.
  const added = await Lesson.updateOne(
    { _id: lesson._id, [`attachments.${MAX_NOTES - notes.length}`]: { $exists: false } },
    { $push: { attachments: { $each: notes } } },
  );
  if (added.matchedCount === 0) {
    throw new AppError('VALIDATION', `A lesson holds at most ${MAX_NOTES} notes. Remove one first.`, {
      'notes[]': [`At most ${MAX_NOTES} notes.`],
    });
  }
  refresh();
});

export const removeLessonNote = action({ input: LessonNoteRef, roles: TEACH }, async (input, viewer) => {
  const lesson = await teachLesson(viewer, input.offeringId, input.lessonId);
  // Lessons saved before M03b have no `attachments` (a lean read applies no default).
  const note = (lesson.attachments ?? []).find((a) => a._id.equals(input.noteId));
  if (!note) throw new AppError('NOT_FOUND', 'That note is already gone.');
  await Lesson.updateOne({ _id: lesson._id }, { $pull: { attachments: { _id: input.noteId } } });
  await deleteObjects([note.key]);
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
    { title: 1, published: 1, fileKey: 1, lowKey: 1, frameKey: 1, thumbKey: 1, attachments: 1 },
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
  await deleteObjects([
    ...[lesson.fileKey, lesson.lowKey, lesson.frameKey, lesson.thumbKey].flatMap((key) => (key ? [key] : [])),
    ...(lesson.attachments ?? []).map((a) => a.key),
  ]);
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
    await addEngagement([{ offeringId, studentId: viewer.id, at: now, inc: { lessonsCompleted: 1 } }]);
    refresh();
  },
);
