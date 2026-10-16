'use server';

import { isDeepStrictEqual } from 'node:util';
import { refresh, updateTag } from 'next/cache';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireCourseEditor } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { createCoursewareRun } from '@/lib/data/imports';
import { db, isDuplicateKey } from '@/lib/db';
import { courseMode, nextCoCode, normalizeCode, parseSessionLines } from '@/lib/domain/catalog';
import { parseKey } from '@/lib/domain/uploads';
import { AppError } from '@/lib/errors';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Offering } from '@/lib/models/offering';
import { User } from '@/lib/models/user';
import { syncQueue } from '@/lib/queue';
import {
  CATALOG_LIMITS,
  CourseRef,
  SaveBooks,
  SaveCoMap,
  SaveCos,
  SaveCourse,
  SaveObjectives,
  SaveSessionPlan,
  SaveSyllabus,
  SetCoordinator,
} from '@/lib/schemas/structure';

// The coordinator and the admins edit a course's content (CRS-07). Every edit is audited and sets
// `contentEditedAt`, after which the courseware import leaves the course's content alone (A-57).
const EDITORS = ['admin', 'faculty'] as const;

async function loadCourse<F extends string>(viewer: Viewer, courseId: string, fields: readonly F[]) {
  await requireCourseEditor(viewer, courseId);
  await db();
  const course = await Course.findById(courseId, Object.fromEntries(fields.map((f) => [f, 1]))).lean();
  if (!course) throw new AppError('NOT_FOUND', 'Course not found.');
  return course;
}

function requireCredit(credits: { theory: number; practice: number; project: number }) {
  if (courseMode(credits) === 'noncredit') {
    throw new AppError('VALIDATION', 'A non-credit course has no course outcomes or mapping.');
  }
}

async function saveContent(
  viewer: Viewer,
  courseId: string,
  section: string,
  change: { set: Record<string, unknown>; unset?: Record<string, 1> },
  before: unknown,
  after: unknown,
) {
  if (isDeepStrictEqual(before, after)) return;
  await mongoose.connection.transaction(async (session) => {
    await Course.updateOne(
      { _id: courseId },
      { $set: { ...change.set, contentEditedAt: new Date() }, ...(change.unset ? { $unset: change.unset } : {}) },
      { session },
    );
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'course.content_changed',
        entity: 'course',
        entityId: courseId,
        before: { section, value: before },
        after: { section, value: after },
      },
      session,
    );
  });
  refresh();
}

export const saveObjectives = action(
  { input: SaveObjectives, roles: EDITORS },
  async ({ courseId, objectives }, viewer) => {
    const course = await loadCourse(viewer, courseId, ['objectives']);
    await saveContent(viewer, courseId, 'objectives', { set: { objectives } }, course.objectives, objectives);
  },
);

// All outcomes in one save: edits keep each CO's id and code, new ones get the next code, and a removed CO's
// mapping goes with it. The Bloom chips a person saves become the CO's levels; the import's guess is cleared.
export const saveCos = action({ input: SaveCos, roles: EDITORS }, async ({ courseId, cos, removed }, viewer) => {
  const course = await loadCourse(viewer, courseId, ['credits', 'cos', 'coMap']);
  requireCredit(course.credits);
  const known = new Map(course.cos.map((co) => [String(co._id), co]));
  if ([...removed, ...cos.flatMap((co) => co.coId ?? [])].some((id) => !known.has(id))) {
    throw new AppError('CONFLICT', 'The outcomes changed while you were editing. Reload the page and try again.');
  }
  const codes = course.cos.map((co) => ({ code: co.code }));
  const next = cos.map((co) => {
    const existing = co.coId ? known.get(co.coId) : undefined;
    const code = existing?.code ?? nextCoCode(codes);
    if (!existing) codes.push({ code });
    return {
      _id: existing?._id ?? new Types.ObjectId(),
      code,
      statement: co.statement,
      bloomLevels: co.bloomLevels,
      suggestedBloom: null,
      ...(existing?.targetLevel !== undefined ? { targetLevel: existing.targetLevel } : {}),
    };
  });
  const kept = new Set(next.map((co) => String(co._id)));
  const coMap = course.coMap.filter((cell) => kept.has(String(cell.coId)));
  const summary = (list: readonly { code: string; statement: string; bloomLevels: readonly string[] }[]) =>
    list.map(({ code, statement, bloomLevels }) => ({ code, statement, bloomLevels: [...bloomLevels] }));
  const before = summary(course.cos);
  const after = summary(next);
  const untouchedGuesses = course.cos.every((co) => !co.suggestedBloom);
  if (isDeepStrictEqual(before, after) && untouchedGuesses) return;

  await mongoose.connection.transaction(async (session) => {
    await Course.updateOne({ _id: courseId }, { $set: { cos: next, coMap, contentEditedAt: new Date() } }, { session });
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'course.cos_changed',
        entity: 'course',
        entityId: courseId,
        before,
        after: { cos: after, mappingLinksRemoved: course.coMap.length - coMap.length },
      },
      session,
    );
  });
  refresh();
});

export const saveCoMap = action({ input: SaveCoMap, roles: EDITORS }, async ({ courseId, 'cell[]': raw }, viewer) => {
  const course = await loadCourse(viewer, courseId, ['credits', 'cos', 'coMap']);
  requireCredit(course.credits);
  const coCodes = new Map(course.cos.map((co) => [String(co._id), co.code]));
  const cells = new Map<string, { coId: Types.ObjectId; outcome: string; level: number }>();
  for (const entry of raw) {
    const [coId, outcome, level] = entry.split(':');
    if (!coCodes.has(coId)) {
      throw new AppError('CONFLICT', 'The outcomes changed while you were editing. Reload the page and try again.');
    }
    cells.set(`${coId}:${outcome}`, { coId: new Types.ObjectId(coId), outcome, level: Number(level) });
  }
  const before = new Map(course.coMap.map((m) => [`${m.coId}:${m.outcome}`, m.level]));
  const changed = [...new Set([...before.keys(), ...cells.keys()])]
    .filter((key) => before.get(key) !== cells.get(key)?.level)
    .map((key) => {
      const [coId, outcome] = key.split(':');
      return {
        co: coCodes.get(coId) ?? coId,
        outcome,
        from: before.get(key) ?? null,
        to: cells.get(key)?.level ?? null,
      };
    });
  if (changed.length === 0) return;
  await mongoose.connection.transaction(async (session) => {
    await Course.updateOne(
      { _id: courseId },
      { $set: { coMap: [...cells.values()], contentEditedAt: new Date() } },
      { session },
    );
    await writeAudit(
      { actorId: viewer.id, action: 'course.map_changed', entity: 'course', entityId: courseId, after: changed },
      session,
    );
  });
  refresh();
});

// The syllabus step: modules, the course's projects and the official PDF. The PDF's key must have been issued
// for this course to this person (09 §5).
export const saveSyllabus = action(
  { input: SaveSyllabus, roles: EDITORS },
  async ({ courseId, modules, projects, file, removeFile }, viewer) => {
    const owner = file && parseKey(file.key);
    if (
      file &&
      (!owner || owner.purpose !== 'syllabus' || owner.contextId !== courseId || owner.userId !== viewer.id)
    ) {
      throw new AppError('VALIDATION', 'Upload the PDF again.', { 'syllabusFile[]': ['Upload the PDF again.'] });
    }
    const course = await loadCourse(viewer, courseId, ['modules', 'projects', 'syllabusFileKey']);
    const fileKey = file ? file.key : removeFile ? null : (course.syllabusFileKey ?? null);
    const before = {
      modules: course.modules.map(({ title, hours, topics, practicals }) => ({
        title,
        hours: hours ?? null,
        topics,
        practicals: [...practicals],
      })),
      projects: [...course.projects],
      file: course.syllabusFileKey ?? null,
    };
    const after = { modules, projects, file: fileKey };
    await saveContent(
      viewer,
      courseId,
      'syllabus',
      fileKey
        ? { set: { modules, projects, syllabusFileKey: fileKey } }
        : { set: { modules, projects }, unset: { syllabusFileKey: 1 } },
      before,
      after,
    );
  },
);

export const saveBooks = action(
  { input: SaveBooks, roles: EDITORS },
  async ({ courseId, textbooks, references }, viewer) => {
    const course = await loadCourse(viewer, courseId, ['textbooks', 'references']);
    await saveContent(
      viewer,
      courseId,
      'books',
      { set: { textbooks, references } },
      { textbooks: course.textbooks, references: course.references },
      { textbooks, references },
    );
  },
);

export const saveSessionPlan = action(
  { input: SaveSessionPlan, roles: EDITORS },
  async ({ courseId, sessions: raw }, viewer) => {
    const sessions = parseSessionLines(raw.join('\n'));
    const long = sessions.findIndex((s) => s.topic.length > CATALOG_LIMITS.sessionTopic);
    if (long >= 0) {
      const message = `Session ${long + 1} uses more than ${CATALOG_LIMITS.sessionTopic} characters.`;
      throw new AppError('VALIDATION', message, { sessions: [message] });
    }
    const course = await loadCourse(viewer, courseId, ['sessionPlan']);
    const before = course.sessionPlan.map(({ topic, kind }) => ({ topic, kind }));
    await saveContent(viewer, courseId, 'session plan', { set: { sessionPlan: sessions } }, before, sessions);
  },
);

export const markReviewed = action({ input: CourseRef, roles: EDITORS }, async ({ courseId }, viewer) => {
  const course = await loadCourse(viewer, courseId, ['issues', 'reviewNeeded']);
  if (!course.reviewNeeded && course.issues.length === 0) return;
  await mongoose.connection.transaction(async (session) => {
    await Course.updateOne({ _id: courseId }, { $set: { issues: [], reviewNeeded: false } }, { session });
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'course.reviewed',
        entity: 'course',
        entityId: courseId,
        before: { issues: course.issues },
      },
      session,
    );
  });
  refresh();
});

// --- Admin only ---

// A new course, or its details. The code is fixed once the course has been offered (A-62); renaming it before
// that renames it in every programme's list too.
export const saveCourse = action(
  { input: SaveCourse, roles: ['admin'] },
  async ({ id, code: typed, theory, practice, project, type, ...fields }, viewer) => {
    const code = normalizeCode(typed);
    const credits = { theory, practice, project };
    const after = { ...fields, code, type: type ?? null, credits };
    await db();
    let courseId = id;
    try {
      await mongoose.connection.transaction(async (session) => {
        if (!id) {
          const [created] = await Course.create([after], { session });
          courseId = String(created._id);
          await writeAudit(
            { actorId: viewer.id, action: 'course.created', entity: 'course', entityId: courseId, after },
            session,
          );
          return;
        }
        const current = await Course.findById(id, { code: 1, title: 1, type: 1, credits: 1, status: 1 })
          .session(session)
          .lean();
        if (!current) throw new AppError('NOT_FOUND', 'Course not found.');
        if (current.code !== code && (await Offering.exists({ courseId: id }).session(session))) {
          throw new AppError('CONFLICT', `${current.code} has been offered, so its code cannot change.`, {
            code: ['The code is fixed once the course has been offered.'],
          });
        }
        const before = {
          title: current.title,
          status: current.status,
          code: current.code,
          type: current.type ?? null,
          credits: {
            theory: current.credits.theory,
            practice: current.credits.practice,
            project: current.credits.project,
          },
        };
        if (isDeepStrictEqual(before, after)) return;
        await Course.updateOne({ _id: id }, { $set: after }, { session });
        if (current.code !== code) {
          await CurriculumEntry.updateMany({ courseId: id }, { $set: { courseCode: code } }, { session });
        }
        await writeAudit(
          { actorId: viewer.id, action: 'course.updated', entity: 'course', entityId: id, before, after },
          session,
        );
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError('CONFLICT', `The catalogue already has a course ${code}.`, {
          code: ['This code is taken.'],
        });
      }
      throw error;
    }
    updateTag('catalog');
    if (!id) return { next: `/catalog/${courseId}` };
    refresh();
  },
);

export const setCoordinator = action(
  { input: SetCoordinator, roles: ['admin'] },
  async ({ courseId, coordinatorId }, viewer) => {
    await db();
    const course = await Course.findById(courseId, { coordinatorId: 1 }).lean();
    if (!course) throw new AppError('NOT_FOUND', 'Course not found.');
    if (coordinatorId && !(await User.exists({ _id: coordinatorId, roles: 'faculty', status: { $ne: 'disabled' } }))) {
      throw new AppError('VALIDATION', 'Choose a faculty member whose account is not disabled.');
    }
    if (String(course.coordinatorId ?? '') === (coordinatorId ?? '')) return;
    await mongoose.connection.transaction(async (session) => {
      await Course.updateOne({ _id: courseId }, { $set: { coordinatorId: coordinatorId ?? null } }, { session });
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'course.coordinator_changed',
          entity: 'course',
          entityId: courseId,
          before: { coordinatorId: course.coordinatorId ? String(course.coordinatorId) : null },
          after: { coordinatorId: coordinatorId ?? null },
        },
        session,
      );
    });
    refresh();
  },
);

// "Replace with courseware content": reads the course's page again and overwrites what was edited here.
export const reimportCourse = action({ input: CourseRef, roles: ['admin'] }, async ({ courseId }, viewer) => {
  await db();
  const course = await Course.findById(courseId, { source: 1 }).lean();
  if (!course?.source) throw new AppError('VALIDATION', 'This course was not imported from courseware.');
  const syncRunId = await createCoursewareRun(viewer.id, 'one');
  await writeAudit({
    actorId: viewer.id,
    action: 'courseware.import_started',
    entity: 'sync_run',
    entityId: syncRunId,
    after: { mode: 'one', coursewareId: course.source.coursewareId, force: true },
  });
  await syncQueue().add(
    'coursewarePage',
    { syncRunId, coursewareId: course.source.coursewareId, force: true },
    { jobId: `cw-${syncRunId}-${course.source.coursewareId}` },
  );
  return { next: `/admin/imports/${syncRunId}` };
});
