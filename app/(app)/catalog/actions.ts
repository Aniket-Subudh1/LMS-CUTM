'use server';

import { isDeepStrictEqual } from 'node:util';
import { refresh, updateTag } from 'next/cache';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit, type AuditEntry } from '@/lib/audit';
import { requireCourseEditor } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { createCoursewareRun } from '@/lib/data/imports';
import { db, isDuplicateKey } from '@/lib/db';
import { coNumber, courseMode, nextCoCode, normalizeCode, parseSessionLines } from '@/lib/domain/catalog';
import { isPermutation } from '@/lib/domain/order';
import { parseKey } from '@/lib/domain/uploads';
import { AppError } from '@/lib/errors';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Offering } from '@/lib/models/offering';
import { User } from '@/lib/models/user';
import { deleteObjects } from '@/lib/integrations/storage';
import { syncQueue } from '@/lib/queue';
import {
  AddCo,
  CATALOG_LIMITS,
  CoRef,
  CourseModuleRef,
  CourseRef,
  ReorderCourseModules,
  SaveBooks,
  SaveCoMap,
  SaveCourse,
  SaveCourseModule,
  SaveObjectives,
  SaveProjects,
  SaveSessionPlan,
  SetCoordinator,
  SetSyllabusFile,
  UpdateCo,
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

// One audited edit (M03b): `write` returns false when its filter matched nothing (someone changed the course first),
// which aborts the change and its audit entry together. The entry is built after the write, so it can say what the
// write found.
async function commit(write: (session: ClientSession) => Promise<boolean>, missing: AppError, entry: () => AuditEntry) {
  await mongoose.connection.transaction(async (session) => {
    if (!(await write(session))) throw missing;
    await writeAudit(entry(), session);
  });
  refresh();
}

const coSummary = (co: { code: string; statement: string; bloomLevels: readonly string[] }) => ({
  code: co.code,
  statement: co.statement,
  bloomLevels: [...co.bloomLevels],
});
const outcomesChanged = () =>
  new AppError('CONFLICT', 'The outcomes changed while you were editing. Reload the page and try again.');

// A new outcome gets the next code, CO7 after CO6 even if CO6 was deleted (`coSeq`). The filter refuses a second add
// made from the same reading, and a course already at the limit.
export const addCo = action({ input: AddCo, roles: EDITORS }, async (input, viewer) => {
  const { courseId, statement } = input;
  const course = await loadCourse(viewer, courseId, ['credits', 'cos', 'coSeq']);
  requireCredit(course.credits);
  if (course.cos.length >= CATALOG_LIMITS.cos) {
    throw new AppError('CONFLICT', `A course has at most ${CATALOG_LIMITS.cos} outcomes.`);
  }
  // Lean reads apply no defaults: a course saved before M03b has no coSeq.
  const code = nextCoCode(course.cos, course.coSeq ?? 0);
  const co = { _id: new Types.ObjectId(), code, statement, bloomLevels: input['bloom[]'], suggestedBloom: null };
  await commit(
    async (session) =>
      (
        await Course.updateOne(
          { _id: courseId, 'cos.code': { $ne: code }, [`cos.${CATALOG_LIMITS.cos - 1}`]: { $exists: false } },
          { $push: { cos: co }, $set: { coSeq: coNumber(code), contentEditedAt: new Date() } },
          { session },
        )
      ).matchedCount > 0,
    outcomesChanged(),
    () => ({
      actorId: viewer.id,
      action: 'course.cos_changed',
      entity: 'course',
      entityId: courseId,
      before: null,
      after: coSummary(co),
    }),
  );
});

// Saving an outcome confirms its Bloom levels: the import's guess is cleared even when nothing else changed.
export const updateCo = action({ input: UpdateCo, roles: EDITORS }, async (input, viewer) => {
  const { courseId, coId, statement } = input;
  const course = await loadCourse(viewer, courseId, ['credits', 'cos']);
  requireCredit(course.credits);
  const co = course.cos.find((c) => String(c._id) === coId);
  if (!co) throw outcomesChanged();
  const before = coSummary(co);
  const after = { ...before, statement, bloomLevels: input['bloom[]'] };
  if (isDeepStrictEqual(before, after) && !co.suggestedBloom) return;
  await commit(
    async (session) =>
      (
        await Course.updateOne(
          { _id: courseId, 'cos._id': co._id },
          {
            $set: {
              'cos.$.statement': statement,
              'cos.$.bloomLevels': after.bloomLevels,
              'cos.$.suggestedBloom': null,
              contentEditedAt: new Date(),
            },
          },
          { session },
        )
      ).matchedCount > 0,
    outcomesChanged(),
    () => ({ actorId: viewer.id, action: 'course.cos_changed', entity: 'course', entityId: courseId, before, after }),
  );
});

// The outcome's mapping links go with it, and so do the calendar tags that point at it in the course's offerings.
// Its number stays in `coSeq`, so its code is never given to another outcome.
export const deleteCo = action({ input: CoRef, roles: EDITORS }, async ({ courseId, coId }, viewer) => {
  const course = await loadCourse(viewer, courseId, ['cos', 'coMap']);
  const co = course.cos.find((c) => String(c._id) === coId);
  if (!co) throw new AppError('NOT_FOUND', 'That outcome was already deleted.');
  const links = course.coMap.filter((cell) => cell.coId.equals(co._id)).length;
  let untagged = 0;
  await commit(
    async (session) => {
      const { matchedCount } = await Course.updateOne(
        { _id: courseId, 'cos._id': co._id },
        {
          $pull: { cos: { _id: co._id }, coMap: { coId: co._id } },
          $max: { coSeq: coNumber(co.code) },
          $set: { contentEditedAt: new Date() },
        },
        { session },
      );
      if (matchedCount === 0) return false;
      const tagged = await Offering.updateMany(
        { courseId, 'calendar.coIds': co._id },
        { $pull: { 'calendar.$[].coIds': co._id } },
        { session },
      );
      untagged = tagged.modifiedCount;
      return true;
    },
    new AppError('NOT_FOUND', 'That outcome was already deleted.'),
    () => ({
      actorId: viewer.id,
      action: 'course.cos_changed',
      entity: 'course',
      entityId: courseId,
      before: coSummary(co),
      after: { deleted: co.code, mappingLinksRemoved: links, offeringsUntagged: untagged },
    }),
  );
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

const moduleSummary = (m: { title: string; hours?: string | null; topics: string; practicals: readonly string[] }) => ({
  title: m.title,
  hours: m.hours ?? null,
  topics: m.topics,
  practicals: [...m.practicals],
});
const syllabusEntry = (viewer: Viewer, courseId: string, section: string, before: unknown, after: unknown) => ({
  actorId: viewer.id,
  action: 'course.content_changed',
  entity: 'course',
  entityId: courseId,
  before: { section, value: before },
  after: { section, value: after },
});
const moduleGone = () => new AppError('NOT_FOUND', 'That module was deleted meanwhile. Reload the page.');

// One syllabus module: edited in place, or added at the end while the course has room.
export const saveCourseModule = action(
  { input: SaveCourseModule, roles: EDITORS },
  async ({ courseId, moduleId, ...fields }, viewer) => {
    const course = await loadCourse(viewer, courseId, ['modules']);
    const existing = moduleId ? course.modules.find((m) => String(m._id) === moduleId) : undefined;
    if (moduleId && !existing) throw moduleGone();
    const before = existing ? moduleSummary(existing) : null;
    if (before && isDeepStrictEqual(before, fields)) return;
    const contentEditedAt = new Date();
    await commit(
      async (session) =>
        (existing
          ? await Course.updateOne(
              { _id: courseId, 'modules._id': existing._id },
              {
                $set: {
                  'modules.$.title': fields.title,
                  'modules.$.hours': fields.hours,
                  'modules.$.topics': fields.topics,
                  'modules.$.practicals': fields.practicals,
                  contentEditedAt,
                },
              },
              { session },
            )
          : await Course.updateOne(
              { _id: courseId, [`modules.${CATALOG_LIMITS.modules - 1}`]: { $exists: false } },
              { $push: { modules: fields }, $set: { contentEditedAt } },
              { session },
            )
        ).matchedCount > 0,
      existing ? moduleGone() : new AppError('CONFLICT', `A course has at most ${CATALOG_LIMITS.modules} modules.`),
      () => syllabusEntry(viewer, courseId, 'syllabus module', before, fields),
    );
  },
);

export const deleteCourseModule = action(
  { input: CourseModuleRef, roles: EDITORS },
  async ({ courseId, moduleId }, viewer) => {
    const course = await loadCourse(viewer, courseId, ['modules']);
    const existing = course.modules.find((m) => String(m._id) === moduleId);
    if (!existing) throw moduleGone();
    await commit(
      async (session) =>
        (
          await Course.updateOne(
            { _id: courseId, 'modules._id': existing._id },
            { $pull: { modules: { _id: existing._id } }, $set: { contentEditedAt: new Date() } },
            { session },
          )
        ).matchedCount > 0,
      moduleGone(),
      () => syllabusEntry(viewer, courseId, 'syllabus module', moduleSummary(existing), null),
    );
  },
);

// The whole new order, which must hold the same modules. The array is written back from this reading, so the filter
// on `updatedAt` refuses it if anything in the course changed since.
export const reorderCourseModules = action(
  { input: ReorderCourseModules, roles: EDITORS },
  async ({ courseId, 'ids[]': ids }, viewer) => {
    const course = await loadCourse(viewer, courseId, ['modules', 'updatedAt']);
    const current = course.modules.map((m) => String(m._id));
    const changed = new AppError('CONFLICT', 'The modules changed meanwhile. Reload the page and try again.');
    if (!isPermutation(current, ids)) throw changed;
    if (isDeepStrictEqual(current, ids)) return;
    const byId = new Map(course.modules.map((m) => [String(m._id), m]));
    await commit(
      async (session) =>
        (
          await Course.updateOne(
            { _id: courseId, updatedAt: course.updatedAt },
            { $set: { modules: ids.flatMap((id) => byId.get(id) ?? []), contentEditedAt: new Date() } },
            { session },
          )
        ).matchedCount > 0,
      changed,
      () =>
        syllabusEntry(
          viewer,
          courseId,
          'syllabus order',
          course.modules.map((m) => m.title),
          ids.flatMap((id) => byId.get(id)?.title ?? []),
        ),
    );
  },
);

// The official PDF. Its key must have been issued for this course to this person (09 §5); the file it replaces is
// deleted once the change is saved.
export const setSyllabusFile = action({ input: SetSyllabusFile, roles: EDITORS }, async (input, viewer) => {
  const { courseId } = input;
  const key = input['syllabusFile[]'][0].key;
  const owner = parseKey(key);
  if (!owner || owner.purpose !== 'syllabus' || owner.contextId !== courseId || owner.userId !== viewer.id) {
    throw new AppError('VALIDATION', 'Upload the PDF again.', { 'syllabusFile[]': ['Upload the PDF again.'] });
  }
  await loadCourse(viewer, courseId, ['syllabusFileKey']);
  let previous: string | null = null;
  await commit(
    async (session) => {
      const before = await Course.findOneAndUpdate(
        { _id: courseId },
        { $set: { syllabusFileKey: key, contentEditedAt: new Date() } },
        { projection: { syllabusFileKey: 1 }, session },
      ).lean();
      previous = before?.syllabusFileKey ?? null;
      return Boolean(before);
    },
    new AppError('NOT_FOUND', 'Course not found.'),
    () => syllabusEntry(viewer, courseId, 'syllabus PDF', previous, key),
  );
  if (previous && previous !== key) await deleteObjects([previous]);
});

export const clearSyllabusFile = action({ input: CourseRef, roles: EDITORS }, async ({ courseId }, viewer) => {
  const course = await loadCourse(viewer, courseId, ['syllabusFileKey']);
  const key = course.syllabusFileKey;
  if (!key) return;
  await commit(
    async (session) =>
      (
        await Course.updateOne(
          { _id: courseId, syllabusFileKey: key },
          { $unset: { syllabusFileKey: 1 }, $set: { contentEditedAt: new Date() } },
          { session },
        )
      ).matchedCount > 0,
    new AppError('CONFLICT', 'The PDF changed meanwhile. Reload the page.'),
    () => syllabusEntry(viewer, courseId, 'syllabus PDF', key, null),
  );
  await deleteObjects([key]);
});

export const saveProjects = action({ input: SaveProjects, roles: EDITORS }, async ({ courseId, projects }, viewer) => {
  const course = await loadCourse(viewer, courseId, ['projects']);
  await saveContent(viewer, courseId, 'projects', { set: { projects } }, course.projects, projects);
});

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
