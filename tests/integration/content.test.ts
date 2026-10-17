import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnyKeys, Types } from 'mongoose';
import { createUpload } from '@/app/(app)/actions';
import { setOfferingStatus } from '@/app/(app)/admin/offerings/actions';
import { saveSettings } from '@/app/(app)/admin/settings/actions';
import {
  addLessonNotes,
  clearLessonThumb,
  completeLesson,
  createLesson,
  deleteLesson,
  deleteModule,
  moveLessonToModule,
  removeLessonNote,
  reorderLessons,
  reorderModules,
  replaceLessonFile,
  setLessonThumb,
  setModulePublished,
} from '@/app/(app)/courses/[offeringId]/content/actions';
import {
  addPlanSession,
  deletePlanSession,
  publishPlan,
  updatePlanSession,
} from '@/app/(app)/courses/[offeringId]/plan/actions';
import { openNotification } from '@/app/(app)/notifications/actions';
import { POST as beacon } from '@/app/api/beacon/route';
import { GET as download } from '@/app/api/files/[...key]/route';
import { getSettings } from '@/lib/data/settings';
import { listRoster } from '@/lib/data/workspace';
import { db } from '@/lib/db';
import { buildKey, fileUuid } from '@/lib/domain/uploads';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson, type LessonDoc } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { Notification } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { Setting } from '@/lib/models/setting';
import { mailQueue, mediaQueue, redis } from '@/lib/queue';
import { enroll, form, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

const { presignUpload, presignDownload, deleteObjects } = vi.hoisted(() => ({
  presignUpload: vi.fn(async (key: string) => `https://storage.test/put/${key}`),
  presignDownload: vi.fn(async (key: string) => `https://storage.test/get/${key}`),
  deleteObjects: vi.fn(async (keys: string[]) => void keys),
}));
vi.mock('@/lib/integrations/storage', () => ({ presignUpload, presignDownload, deleteObjects }));

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const doc = (text: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

beforeAll(async () => {
  await db();
  await Promise.all(
    [AuditLog, Course, EngagementDaily, Enrollment, Lesson, LessonProgress, Notification, Offering, Setting].map((m) =>
      m.createCollection(),
    ),
  );
});

afterAll(async () => {
  await Promise.all([mailQueue().close(), mediaQueue().close()]);
  await redis().quit();
});

// A faculty member teaching an active offering with one enrolled student, and a student of another offering.
async function world(over: { category?: 'ugc' | 'skill' } = {}) {
  const faculty = await makeUser({ roles: ['faculty'] });
  const student = await makeUser({ roles: ['student'] });
  const outsider = await makeUser({ roles: ['student'] });
  const offering = await makeOffering({
    facultyIds: [faculty._id],
    status: 'active',
    category: over.category ?? 'ugc',
  });
  const other = await makeOffering({ status: 'active' });
  await enroll(offering._id, student._id);
  await enroll(other._id, outsider._id);
  const moduleId = newId();
  await Offering.updateOne({ _id: offering._id }, { $push: { modules: { _id: moduleId, title: 'Unit 1', order: 1 } } });
  return { faculty, student, outsider, offering, offeringId: String(offering._id), moduleId };
}

async function lesson(w: Awaited<ReturnType<typeof world>>, over: AnyKeys<LessonDoc> = {}) {
  return Lesson.create({
    offeringId: w.offering._id,
    moduleId: w.moduleId,
    order: 1,
    kind: 'video',
    title: 'Lecture',
    fileKey: buildKey('lesson-video', w.offeringId, String(w.faculty._id), crypto.randomUUID(), 'video/mp4'),
    fileName: 'lecture.mp4',
    contentType: 'video/mp4',
    size: 1_000,
    durationSec: 100,
    published: true,
    ...over,
  });
}

const get = (key: string) =>
  download(new Request(`http://localhost:3000/api/files/${key}`), { params: Promise.resolve({ key: key.split('/') }) });
const send = (body: unknown) =>
  beacon(new Request('http://localhost:3000/api/beacon', { method: 'POST', body: JSON.stringify(body) }));
const progressOf = (lessonId: Types.ObjectId, studentId: Types.ObjectId) =>
  LessonProgress.findOne({ lessonId, studentId }).lean();

describe('createUpload', () => {
  const upload = (contextId: string, over: Record<string, unknown> = {}) =>
    createUpload({
      purpose: 'lesson-video',
      contextId,
      fileName: 'a.mp4',
      contentType: 'video/mp4',
      size: 1_000,
      ...over,
    });

  it('gives a teacher of the offering a presigned PUT under their own prefix', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const result = await upload(w.offeringId);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.data.key).toMatch(new RegExp(`^lesson-video/${w.offeringId}/${w.faculty._id}/[\\w-]+\\.mp4$`));
    expect(presignUpload).toHaveBeenLastCalledWith(result.data.key, 'video/mp4', 1_000);
  });

  it('refuses students, the wrong type, an oversized file and purposes of later milestones', async () => {
    const w = await world();
    await signInAs(w.student);
    await expect(upload(w.offeringId)).rejects.toThrow(NOT_FOUND);

    await signInAs(w.faculty);
    expect(await upload(w.offeringId, { contentType: 'application/zip' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await upload(w.offeringId, { size: 2_000_000_001 })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(
      await upload(w.offeringId, { purpose: 'lesson-doc', contentType: 'application/pdf', size: 60_000_000 }),
    ).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: 'This file is larger than 50 MB.',
    });
    expect(await upload(w.offeringId, { purpose: 'submission', contentType: 'application/pdf' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await upload(String(newId()), { purpose: 'syllabus', contentType: 'application/pdf' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });
});

describe('/api/files', () => {
  it('serves an unpublished lesson to its teacher only, then to enrolled students once published (AC-M02-05)', async () => {
    const w = await world();
    const draft = await lesson(w, { published: false, lowKey: undefined });
    const key = draft.fileKey ?? '';

    await signInAs(w.student);
    expect((await get(key)).status).toBe(404);
    await signInAs(w.faculty);
    const teacher = await get(key);
    expect(teacher.status).toBe(302);
    expect(teacher.headers.get('location')).toBe(`https://storage.test/get/${key}`);
    expect(presignDownload).toHaveBeenLastCalledWith(key, 'lecture.mp4');

    await Lesson.updateOne({ _id: draft._id }, { $set: { published: true, lowKey: key.replace('.mp4', '-480p.mp4') } });
    await signInAs(w.student);
    expect((await get(key)).status).toBe(302);
    expect((await get(key.replace('.mp4', '-480p.mp4'))).status).toBe(302);
    await signInAs(w.outsider);
    expect((await get(key)).status).toBe(404);
    expect((await get(`${key}x`)).status).toBe(404);
  });

  it('serves a syllabus PDF to staff and to students of the course, and to no other student (Q-53)', async () => {
    const w = await world();
    const course = await makeCourse();
    const key = buildKey('syllabus', String(course._id), String(newId()), 'syl', 'application/pdf');
    await Course.updateOne({ _id: course._id }, { $set: { syllabusFileKey: key } });
    await Offering.updateOne({ _id: w.offering._id }, { $set: { courseId: course._id } });

    await signInAs(w.student);
    expect((await get(key)).status).toBe(302);
    // A coordinator who teaches none of the course's offerings opens the PDF they uploaded.
    await signInAs(await makeUser({ roles: ['faculty'] }));
    expect((await get(key)).status).toBe(302);
    await signInAs(w.outsider);
    expect((await get(key)).status).toBe(404);
  });
});

describe('createLesson', () => {
  it('stores a draft video with its uploaded key and queues one data-saver copy', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const key = buildKey('lesson-video', w.offeringId, String(w.faculty._id), crypto.randomUUID(), 'video/mp4');
    const file = { key, fileName: '../Week 1: intro.mp4', contentType: 'video/mp4', size: 2_048, durationSec: 754 };
    const note = buildKey('lesson-doc', w.offeringId, String(w.faculty._id), crypto.randomUUID(), 'application/pdf');
    const result = await createLesson(
      form({
        offeringId: w.offeringId,
        moduleId: String(w.moduleId),
        kind: 'video',
        title: 'Intro',
        description: '',
        'video[]': JSON.stringify(file),
        'notes[]': JSON.stringify({ key: note, fileName: 'Slides.pdf', contentType: 'application/pdf', size: 99 }),
      }),
    );
    expect(result).toMatchObject({ ok: true });
    const saved = await Lesson.findOne({ offeringId: w.offering._id }).lean();
    expect(saved).toMatchObject({
      fileKey: key,
      fileName: 'Week 1 intro.mp4',
      durationSec: 754,
      published: false,
      transcode: 'pending',
    });
    expect(saved?.description).toBeUndefined();
    expect(saved?.attachments).toMatchObject([{ key: note, fileName: 'Slides.pdf', size: 99 }]);
    expect(await mediaQueue().getJob(`transcode-${saved?._id}-${fileUuid(key)}`)).toMatchObject({
      name: 'transcodeLesson',
      data: { lessonId: String(saved?._id), fileKey: key },
    });
  });

  it('rejects a key from another offering and a link that is not https', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const foreign = buildKey('lesson-doc', String(newId()), String(w.faculty._id), 'x', 'application/pdf');
    const base = {
      offeringId: w.offeringId,
      moduleId: String(w.moduleId),
      title: 'Notes',
      description: doc('Read me'),
    };
    expect(
      await createLesson(
        form({
          ...base,
          kind: 'document',
          'document[]': JSON.stringify({ key: foreign, fileName: 'a.pdf', contentType: 'application/pdf', size: 10 }),
        }),
      ),
    ).toMatchObject({ ok: false, code: 'VALIDATION', fieldErrors: { 'document[]': ['Upload the file again.'] } });
    expect(await createLesson(form({ ...base, kind: 'link', url: 'http://example.com' }))).toMatchObject({
      ok: false,
      fieldErrors: { url: ['Enter a full link that starts with https://'] },
    });
    expect(await createLesson(form({ ...base, kind: 'video' }))).toMatchObject({
      ok: false,
      fieldErrors: { 'video[]': ['Upload the video first.'] },
    });
    expect(await Lesson.countDocuments({ offeringId: w.offering._id })).toBe(0);
  });
});

describe('completeLesson', () => {
  it('completes a PDF once however often it is pressed, and never a video', async () => {
    const w = await world();
    const pdf = await lesson(w, { kind: 'document', durationSec: undefined, contentType: 'application/pdf' });
    const video = await lesson(w);
    await signInAs(w.student);
    const input = form({ offeringId: w.offeringId, lessonId: String(pdf._id) });
    expect(await completeLesson(input)).toMatchObject({ ok: true });
    expect(await completeLesson(input)).toMatchObject({ ok: true });
    expect(await progressOf(pdf._id, w.student._id)).toMatchObject({ progressPct: 100, completedAt: expect.any(Date) });
    expect(
      (await EngagementDaily.findOne({ offeringId: w.offering._id, studentId: w.student._id }).lean())
        ?.lessonsCompleted,
    ).toBe(1);
    expect(await completeLesson(form({ offeringId: w.offeringId, lessonId: String(video._id) }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });
});

describe('deleteLesson', () => {
  it('deletes a draft without progress, with its files and an audit entry; refuses the others', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const published = await lesson(w);
    const opened = await lesson(w, { published: false });
    await LessonProgress.create({ lessonId: opened._id, offeringId: w.offering._id, studentId: w.student._id });
    const draft = await lesson(w, { published: false, lowKey: 'lesson-video/x/y/z-480p.mp4' });
    const ref = (id: unknown) => form({ offeringId: w.offeringId, lessonId: String(id) });

    expect(await deleteLesson(ref(published._id))).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await deleteLesson(ref(opened._id))).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await deleteLesson(ref(draft._id))).toMatchObject({ ok: true });
    expect(await Lesson.exists({ _id: draft._id })).toBeNull();
    expect(deleteObjects).toHaveBeenLastCalledWith([draft.fileKey, 'lesson-video/x/y/z-480p.mp4']);
    const full = await lesson(w, {
      published: false,
      frameKey: 'lesson-video/x/y/f-frame.jpg',
      thumbKey: 'lesson-thumb/x/y/t.jpg',
      attachments: [{ key: 'lesson-doc/x/y/n.pdf', fileName: 'n.pdf', size: 1 }],
    });
    expect(await deleteLesson(ref(full._id))).toMatchObject({ ok: true });
    expect(deleteObjects).toHaveBeenLastCalledWith([
      full.fileKey,
      'lesson-video/x/y/f-frame.jpg',
      'lesson-thumb/x/y/t.jpg',
      'lesson-doc/x/y/n.pdf',
    ]);
    expect(await AuditLog.findOne({ action: 'lesson.deleted', entityId: draft._id }).lean()).toMatchObject({
      before: { title: 'Lecture' },
    });
  });
});

describe('course plan', () => {
  it('adds, edits and deletes one session at a time, keeping ids and date order (M03b)', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const base = { offeringId: w.offeringId };
    expect(await addPlanSession(form({ ...base, date: '2026-11-02', topic: 'Trees', kind: 'theory' }))).toMatchObject({
      ok: true,
    });
    expect(await addPlanSession(form({ ...base, date: '2026-10-20', topic: 'Stacks' }))).toMatchObject({ ok: true });
    let saved = await Offering.findById(w.offering._id, { calendar: 1, plan: 1 }).lean();
    expect(saved?.calendar.map((r) => r.topic)).toEqual(['Stacks', 'Trees']);
    expect(saved?.calendar[0].date.toISOString()).toBe('2026-10-19T18:30:00.000Z');
    expect(saved?.calendar[1].kind).toBe('theory');
    expect(saved?.plan.changedAt).toBeInstanceOf(Date);
    const trees = String(saved?.calendar[1]._id);

    expect(
      await updatePlanSession(form({ ...base, rowId: trees, date: '2026-10-01', topic: 'Trees, first' })),
    ).toMatchObject({ ok: true });
    saved = await Offering.findById(w.offering._id, { calendar: 1, plan: 1 }).lean();
    expect(saved?.calendar.map((r) => [String(r._id), r.topic])).toEqual([
      [trees, 'Trees, first'],
      [String(saved?.calendar[1]._id), 'Stacks'],
    ]);
    expect(saved?.calendar[0].kind ?? null).toBeNull();

    expect(await addPlanSession(form({ ...base, date: '2026-02-30', topic: 'Queues' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(
      await addPlanSession(form({ ...base, date: '2026-10-21', topic: 'Heaps', 'cos[]': String(newId()) })),
    ).toMatchObject({ ok: false, fieldErrors: { 'cos[]': ['Pick outcomes of this course only.'] } });

    expect(await deletePlanSession(form({ ...base, rowId: trees }))).toMatchObject({ ok: true });
    expect((await Offering.findById(w.offering._id, { calendar: 1 }).lean())?.calendar.map((r) => r.topic)).toEqual([
      'Stacks',
    ]);
    expect(await deletePlanSession(form({ ...base, rowId: trees }))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('publishes each version once: one fan-out, one notification per enrolled student, one audit entry (AC-M02-04)', async () => {
    const w = await world();
    const dropped = await makeUser({ roles: ['student'] });
    await enroll(w.offering._id, dropped._id, 'dropped');
    await signInAs(w.faculty);
    const publish = (version: number) => publishPlan(form({ offeringId: w.offeringId, version: String(version) }));

    expect(await publish(0)).toMatchObject({ ok: false, code: 'VALIDATION' });
    await Offering.updateOne(
      { _id: w.offering._id },
      {
        $set: {
          'plan.doc': JSON.parse(doc('Plan')),
          calendar: [{ date: new Date('2026-10-20'), topic: 'Intro', coIds: [] }],
        },
      },
    );
    expect(await publish(0)).toMatchObject({ ok: true });
    expect(await publish(0)).toMatchObject({ ok: true });

    expect((await Offering.findById(w.offering._id).lean())?.plan.version).toBe(1);
    expect(await mailQueue().getJob(`plan-${w.offeringId}-1`)).toMatchObject({
      name: 'fanout',
      data: { kind: 'coursePlanPublished', offeringId: w.offeringId, version: 1 },
    });
    const notes = await Notification.find({ kind: 'plan.published', href: `/courses/${w.offeringId}` }).lean();
    expect(notes.map((n) => String(n.userId))).toEqual([String(w.student._id)]);
    expect(await AuditLog.find({ action: 'plan.published', offeringId: w.offering._id }).lean()).toMatchObject([
      { after: { version: 1, recipients: 1 } },
    ]);

    expect(await publish(1)).toMatchObject({ ok: true });
    expect(await mailQueue().getJob(`plan-${w.offeringId}-2`)).toBeTruthy();
  });

  it('asks the faculty for a plan when an offering without one becomes active (CRS-06)', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    const faculty = await makeUser({ roles: ['faculty'] });
    const offering = await makeOffering({
      facultyIds: [faculty._id],
      status: 'draft',
      title: 'CS201 · Data Structures',
    });
    await signInAs(admin);
    expect(await setOfferingStatus(form({ offeringId: String(offering._id), status: 'active' }))).toMatchObject({
      ok: true,
    });
    expect(await Notification.findOne({ userId: faculty._id }).lean()).toMatchObject({
      kind: 'plan.requested',
      title: 'Publish the course plan and calendar for CS201 · Data Structures',
      href: `/courses/${offering._id}/plan`,
    });
  });
});

describe('openNotification', () => {
  it('marks the viewer’s own notification read and goes to its page; another person’s stays unread', async () => {
    const [me, someone] = await Promise.all([makeUser(), makeUser()]);
    const expiresAt = new Date(Date.now() + 86_400_000);
    const [mine, theirs] = await Notification.create([
      { userId: me._id, kind: 'plan.published', title: 'Plan', href: '/courses/abc', expiresAt },
      { userId: someone._id, kind: 'plan.published', title: 'Plan', href: '/courses/def', expiresAt },
    ]);
    await signInAs(me);
    const to = (path: string) => ({ digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;\\w+;${path};`)) });
    await expect(openNotification(form({ id: String(mine._id) }))).rejects.toMatchObject(to('/courses/abc'));
    await expect(openNotification(form({ id: String(theirs._id) }))).rejects.toMatchObject(to('/notifications'));
    expect((await Notification.findById(mine._id).lean())?.readAt).toBeInstanceOf(Date);
    expect((await Notification.findById(theirs._id).lean())?.readAt).toBeUndefined();
  });
});

describe('saveSettings', () => {
  it('shows which field failed and saves nothing (AC-M02-08); a valid value is saved and audited', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    await signInAs(admin);
    expect(await saveSettings(form({ key: 'lessons', completePct: '150' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { completePct: ['Use a percentage from 1 to 100.'] },
    });
    expect(await Setting.exists({ _id: 'lessons' })).toBeNull();

    expect(await saveSettings(form({ key: 'lessons', completePct: '80' }))).toMatchObject({ ok: true });
    expect(await getSettings('lessons')).toEqual({ completePct: 80 });
    expect(await AuditLog.findOne({ action: 'settings.updated' }).lean()).toMatchObject({
      entity: 'lessons_settings',
      before: { completePct: 90 },
      after: { completePct: 80 },
    });
    await Setting.deleteOne({ _id: 'lessons' });
  });
});

describe('/api/beacon', () => {
  it('answers 401 without a session, 400 for a bad body and 404 for a draft or someone else’s lesson', async () => {
    const w = await world();
    const draft = await lesson(w, { published: false });
    const published = await lesson(w);
    const body = (id: unknown) => ({ kind: 'video', lessonId: String(id), ranges: [[0, 30]] });
    await signInAs({ _id: newId(), sessionVersion: 1 });
    expect((await send(body(published._id))).status).toBe(401);
    await signInAs(w.student);
    expect((await send({ kind: 'video', lessonId: 'x' })).status).toBe(400);
    expect((await send(body(draft._id))).status).toBe(404);
    await signInAs(w.outsider);
    expect((await send(body(published._id))).status).toBe(404);
    expect(await LessonProgress.countDocuments({ offeringId: w.offering._id })).toBe(0);
  });

  it('counts a replayed minute once and ignores a claim faster than real time (AC-M02-02, AC-M02-03)', async () => {
    const w = await world();
    const video = await lesson(w);
    await signInAs(w.student);
    const watch = (ranges: number[][]) => send({ kind: 'video', lessonId: String(video._id), ranges });

    expect((await watch([[0, 60]])).status).toBe(204);
    await LessonProgress.updateOne({ lessonId: video._id }, { $set: { lastBeaconAt: new Date(Date.now() - 60_000) } });
    expect((await watch([[0, 60]])).status).toBe(204);
    expect(await progressOf(video._id, w.student._id)).toMatchObject({ watchedSec: 60, progressPct: 60 });

    await LessonProgress.updateOne({ lessonId: video._id }, { $set: { lastBeaconAt: new Date(Date.now() - 1_000) } });
    expect((await watch([[60, 100]])).status).toBe(204);
    expect(await progressOf(video._id, w.student._id)).toMatchObject({ watchedSec: 60 });
    expect((await EngagementDaily.findOne({ studentId: w.student._id }).lean())?.videoSec).toBe(60);
  });

  it('merges two beacons that arrive together and completes the lesson once', async () => {
    const w = await world();
    const video = await lesson(w);
    await LessonProgress.create({
      lessonId: video._id,
      offeringId: w.offering._id,
      studentId: w.student._id,
      lastBeaconAt: new Date(Date.now() - 120_000),
    });
    await signInAs(w.student);
    const watch = (ranges: number[][]) => send({ kind: 'video', lessonId: String(video._id), ranges });

    // Both read the same row; the second write misses on updatedAt, re-reads and merges (three writes in all).
    const writes = vi.spyOn(LessonProgress, 'updateOne');
    const statuses = await Promise.all([watch([[0, 30]]), watch([[40, 70]])]);
    expect(writes).toHaveBeenCalledTimes(3);
    writes.mockRestore();
    expect(statuses.map((r) => r.status)).toEqual([204, 204]);
    expect(await progressOf(video._id, w.student._id)).toMatchObject({
      ranges: [
        [0, 30],
        [40, 70],
      ],
      watchedSec: 60,
    });

    await LessonProgress.updateOne({ lessonId: video._id }, { $set: { lastBeaconAt: new Date(Date.now() - 60_000) } });
    await watch([
      [30, 40],
      [70, 95],
    ]);
    await LessonProgress.updateOne({ lessonId: video._id }, { $set: { lastBeaconAt: new Date(Date.now() - 60_000) } });
    await watch([[95, 100]]);
    const done = await progressOf(video._id, w.student._id);
    expect(done).toMatchObject({ watchedSec: 100, progressPct: 100, completedAt: expect.any(Date) });
    const counters = await EngagementDaily.findOne({ studentId: w.student._id }).lean();
    expect(counters).toMatchObject({ videoSec: 100, lessonsCompleted: 1 });
  });
});

describe('listRoster on a skill course', () => {
  it('counts attendance over published lessons only (AC-M02-06)', async () => {
    const w = await world({ category: 'skill' });
    const [a, b, hidden] = await Promise.all([lesson(w), lesson(w), lesson(w, { published: false })]);
    await LessonProgress.create(
      [a, hidden].map((l) => ({
        lessonId: l._id,
        offeringId: w.offering._id,
        studentId: w.student._id,
        completedAt: new Date(),
        watchedSec: 90,
      })),
    );
    await LessonProgress.create({
      lessonId: b._id,
      offeringId: w.offering._id,
      studentId: w.student._id,
      watchedSec: 30,
    });
    await signInAs(w.faculty);
    const { rows, publishedLessons } = await listRoster(w.offeringId, 1);
    expect(publishedLessons).toBe(2);
    expect(rows[0].skill).toMatchObject({ completed: 1, attendancePct: 50, watchedMin: 4 });
  });
});

describe('lesson media (M03b)', () => {
  const upload = (
    w: Awaited<ReturnType<typeof world>>,
    purpose: 'lesson-video' | 'lesson-doc' | 'lesson-thumb',
    over = {},
  ) => {
    const type = { 'lesson-video': 'video/mp4', 'lesson-doc': 'application/pdf', 'lesson-thumb': 'image/jpeg' }[
      purpose
    ];
    const key = buildKey(purpose, w.offeringId, String(w.faculty._id), crypto.randomUUID(), type);
    return JSON.stringify({ key, fileName: `file.${type.split('/')[1]}`, contentType: type, size: 10, ...over });
  };

  it('replaces a document always and a video only until a student watched it, queuing the new file', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const pdf = await lesson(w, { kind: 'document', fileKey: 'lesson-doc/a/b/old.pdf', durationSec: undefined });
    const video = await lesson(w, {
      lowKey: 'lesson-video/a/b/old-480p.mp4',
      frameKey: 'lesson-video/a/b/old-frame.jpg',
    });
    const ref = (id: unknown, field: string, value: string) =>
      form({ offeringId: w.offeringId, lessonId: String(id), [field]: value });

    expect(await replaceLessonFile(ref(pdf._id, 'document[]', upload(w, 'lesson-doc')))).toMatchObject({ ok: true });
    expect(deleteObjects).toHaveBeenLastCalledWith(['lesson-doc/a/b/old.pdf']);

    const next = upload(w, 'lesson-video', { durationSec: 300 });
    expect(await replaceLessonFile(ref(video._id, 'video[]', next))).toMatchObject({ ok: true });
    const saved = await Lesson.findById(video._id).lean();
    const key = JSON.parse(next).key;
    expect(saved).toMatchObject({ fileKey: key, durationSec: 300, transcode: 'pending' });
    expect(saved?.lowKey ?? null).toBeNull();
    expect(saved?.frameKey ?? null).toBeNull();
    expect(await mediaQueue().getJob(`transcode-${video._id}-${fileUuid(key)}`)).toBeTruthy();

    await LessonProgress.create({
      lessonId: video._id,
      offeringId: w.offering._id,
      studentId: w.student._id,
      watchedSec: 12,
    });
    expect(
      await replaceLessonFile(ref(video._id, 'video[]', upload(w, 'lesson-video', { durationSec: 9 }))),
    ).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    const foreign = JSON.stringify({
      key: `lesson-doc/${newId()}/${w.faculty._id}/x.pdf`,
      fileName: 'x.pdf',
      contentType: 'application/pdf',
      size: 1,
    });
    expect(await replaceLessonFile(ref(pdf._id, 'document[]', foreign))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });

  it('sets and clears a custom thumbnail, keeps at most five notes and removes one', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const target = await lesson(w);
    const ref = { offeringId: w.offeringId, lessonId: String(target._id) };
    const thumb = upload(w, 'lesson-thumb');
    expect(await setLessonThumb(form({ ...ref, 'thumb[]': thumb }))).toMatchObject({ ok: true });
    expect((await Lesson.findById(target._id).lean())?.thumbKey).toBe(JSON.parse(thumb).key);
    expect(await clearLessonThumb(form(ref))).toMatchObject({ ok: true });
    expect(deleteObjects).toHaveBeenLastCalledWith([JSON.parse(thumb).key]);
    expect((await Lesson.findById(target._id).lean())?.thumbKey ?? null).toBeNull();

    const three = [1, 2, 3].map(() => upload(w, 'lesson-doc'));
    expect(await addLessonNotes(form({ ...ref, 'notes[]': three }))).toMatchObject({ ok: true });
    expect(await addLessonNotes(form({ ...ref, 'notes[]': three.map(() => upload(w, 'lesson-doc')) }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    const saved = await Lesson.findById(target._id).lean();
    expect(saved?.attachments).toHaveLength(3);
    const first = saved?.attachments[0];
    expect(await removeLessonNote(form({ ...ref, noteId: String(first?._id) }))).toMatchObject({ ok: true });
    expect(deleteObjects).toHaveBeenLastCalledWith([first?.key]);
    expect((await Lesson.findById(target._id).lean())?.attachments).toHaveLength(2);
  });

  it('serves the frame, the thumbnail and the notes by the lesson rule, cached for five minutes', async () => {
    const w = await world();
    const user = String(w.faculty._id);
    const frame = buildKey('lesson-video', w.offeringId, user, 'v1', 'video/mp4').replace('.mp4', '-frame.jpg');
    const thumb = buildKey('lesson-thumb', w.offeringId, user, 't1', 'image/jpeg');
    const note = buildKey('lesson-doc', w.offeringId, user, 'n1', 'application/pdf');
    const draft = await lesson(w, {
      published: false,
      fileKey: frame.replace('-frame.jpg', '.mp4'),
      frameKey: frame,
      thumbKey: thumb,
      attachments: [{ key: note, fileName: 'Worked examples.pdf', size: 5 }],
    });
    await signInAs(w.student);
    for (const key of [frame, thumb, note]) expect((await get(key)).status).toBe(404);
    await signInAs(w.faculty);
    const response = await get(note);
    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    expect(presignDownload).toHaveBeenLastCalledWith(note, 'Worked examples.pdf');
    await Lesson.updateOne({ _id: draft._id }, { $set: { published: true } });
    await signInAs(w.student);
    for (const key of [frame, thumb, note]) expect((await get(key)).status).toBe(302);
  });
});

describe('the content builder (M03b)', () => {
  it('reorders modules and lessons only with the full list, moves a lesson, publishes a module and deletes an empty one', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const second = newId();
    await Offering.updateOne(
      { _id: w.offering._id },
      { $push: { modules: { _id: second, title: 'Unit 2', order: 2 } } },
    );
    const a = await lesson(w, { order: 1, published: false });
    const b = await lesson(w, { order: 2, published: false });
    const base = { offeringId: w.offeringId };

    expect(await reorderModules(form({ ...base, 'ids[]': [String(second)] }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(await reorderModules(form({ ...base, 'ids[]': [String(second), String(w.moduleId)] }))).toMatchObject({
      ok: true,
    });
    const modules = (await Offering.findById(w.offering._id).lean())?.modules.toSorted((x, y) => x.order - y.order);
    expect(modules?.map((m) => m.title)).toEqual(['Unit 2', 'Unit 1']);

    const other = await lesson(w, { moduleId: second });
    expect(
      await reorderLessons(
        form({ ...base, moduleId: String(w.moduleId), 'ids[]': [String(b._id), String(other._id)] }),
      ),
    ).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(
      await reorderLessons(form({ ...base, moduleId: String(w.moduleId), 'ids[]': [String(b._id), String(a._id)] })),
    ).toMatchObject({ ok: true });
    expect((await Lesson.findById(b._id).lean())?.order).toBe(1);

    expect(await setModulePublished(form({ ...base, moduleId: String(w.moduleId), published: 'true' }))).toMatchObject({
      ok: true,
    });
    expect(await Lesson.countDocuments({ moduleId: w.moduleId, published: true })).toBe(2);

    expect(await deleteModule(form({ ...base, moduleId: String(second) }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(
      await moveLessonToModule(form({ ...base, lessonId: String(other._id), moduleId: String(w.moduleId) })),
    ).toMatchObject({ ok: true });
    expect((await Lesson.findById(other._id).lean())?.order).toBe(3);
    expect(await deleteModule(form({ ...base, moduleId: String(second) }))).toMatchObject({ ok: true });
    expect((await Offering.findById(w.offering._id).lean())?.modules).toHaveLength(1);
  });

  it('refuses a head of department and a student by role', async () => {
    const w = await world();
    const hod = await makeUser({ roles: ['hod'], departmentId: w.offering.departmentId });
    for (const who of [hod, w.student]) {
      await signInAs(who);
      expect(await deleteModule(form({ offeringId: w.offeringId, moduleId: String(w.moduleId) }))).toMatchObject({
        ok: false,
        code: 'FORBIDDEN',
      });
    }
  });
});
