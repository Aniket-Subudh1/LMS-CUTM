'use server';

import { refresh, updateTag } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db, isDuplicateKey } from '@/lib/db';
import { componentKey, nextCoCode } from '@/lib/domain/structure';
import { AppError } from '@/lib/errors';
import { Course } from '@/lib/models/course';
import { Program } from '@/lib/models/program';
import { AddCo, DeleteCo, SaveCoMap, SaveCourse, SaveObjectives, UpdateCo } from '@/lib/schemas/structure';

const MAX_COS = 15;

type CoSummary = { code: string; statement: string; bloomLevel: string };
const summarize = (cos: readonly CoSummary[]): CoSummary[] =>
  cos.map(({ code, statement, bloomLevel }) => ({ code, statement, bloomLevel }));

function requireUgc(category: string): void {
  if (category !== 'ugc') throw new AppError('VALIDATION', 'Skill courses have no course outcomes.');
}

export const saveCourse = action(
  { input: SaveCourse, roles: ['admin'] },
  async ({ id, programId, 'components[]': components, ...fields }) => {
    await db();
    const key = componentKey(components);
    let courseId = id;
    try {
      if (id) {
        const updated = await Course.updateOne({ _id: id }, { $set: { ...fields, components, componentKey: key } });
        if (updated.matchedCount === 0) throw new AppError('NOT_FOUND', 'Course not found.');
      } else {
        const program = await Program.findById(programId, { departmentId: 1, category: 1 }).lean();
        if (!program) throw new AppError('VALIDATION', 'Choose an existing programme.');
        // Department and category are copied from the programme once, so reads never join for them.
        const created = await Course.create({
          ...fields,
          components,
          componentKey: key,
          programId,
          departmentId: program.departmentId,
          category: program.category,
        });
        courseId = created.id;
      }
    } catch (error) {
      if (isDuplicateKey(error)) throw new AppError('CONFLICT', `This programme already has a course ${fields.code}.`);
      throw error;
    }
    updateTag('catalog');
    if (!id) return { next: `/admin/courses/${courseId}` };
    refresh();
  },
);

export const saveObjectives = action({ input: SaveObjectives, roles: ['admin'] }, async ({ courseId, objectives }) => {
  await db();
  const updated = await Course.updateOne({ _id: courseId }, { $set: { objectives } });
  if (updated.matchedCount === 0) throw new AppError('NOT_FOUND', 'Course not found.');
  refresh();
});

export const addCo = action({ input: AddCo, roles: ['admin'] }, async ({ courseId, statement, bloomLevel }, viewer) => {
  await db();
  const course = await Course.findById(courseId, { category: 1, cos: 1 }).lean();
  if (!course) throw new AppError('NOT_FOUND', 'Course not found.');
  requireUgc(course.category);
  if (course.cos.length >= MAX_COS) throw new AppError('VALIDATION', `A course has at most ${MAX_COS} COs.`);
  const added = { code: nextCoCode(course.cos.map((c) => c.code)), statement, bloomLevel };
  await mongoose.connection.transaction(async (session) => {
    // The filter makes a concurrent add that picked the same code (or the 15th slot) fail instead of duplicating it.
    const pushed = await Course.updateOne(
      { _id: courseId, 'cos.code': { $ne: added.code }, [`cos.${MAX_COS - 1}`]: { $exists: false } },
      { $push: { cos: added } },
      { session },
    );
    if (pushed.matchedCount === 0) {
      throw new AppError('CONFLICT', 'The course changed while you were adding. Reload and try again.');
    }
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'course.cos_changed',
        entity: 'course',
        entityId: courseId,
        before: summarize(course.cos),
        after: summarize([...course.cos, added]),
      },
      session,
    );
  });
  refresh();
});

export const updateCo = action(
  { input: UpdateCo, roles: ['admin'] },
  async ({ courseId, coId, statement, bloomLevel }, viewer) => {
    await db();
    const course = await Course.findById(courseId, { cos: 1 }).lean();
    const current = course?.cos.find((c) => c._id.equals(coId));
    if (!course || !current) throw new AppError('NOT_FOUND', 'Course outcome not found.');
    if (current.statement === statement && current.bloomLevel === bloomLevel) return;
    await mongoose.connection.transaction(async (session) => {
      await Course.updateOne(
        { _id: courseId, 'cos._id': coId },
        { $set: { 'cos.$.statement': statement, 'cos.$.bloomLevel': bloomLevel } },
        { session },
      );
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'course.cos_changed',
          entity: 'course',
          entityId: courseId,
          before: summarize([current]),
          after: summarize([{ ...current, statement, bloomLevel }]),
        },
        session,
      );
    });
    refresh();
  },
);

export const deleteCo = action({ input: DeleteCo, roles: ['admin'] }, async ({ courseId, coId }, viewer) => {
  await db();
  const course = await Course.findById(courseId, { cos: 1, coMap: 1 }).lean();
  const removed = course?.cos.find((c) => c._id.equals(coId));
  if (!course || !removed) throw new AppError('NOT_FOUND', 'Course outcome not found.');
  await mongoose.connection.transaction(async (session) => {
    // The CO and its matrix cells go together, so the matrix never points at a CO that is gone.
    await Course.updateOne({ _id: courseId }, { $pull: { cos: { _id: coId }, coMap: { coId } } }, { session });
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'course.cos_changed',
        entity: 'course',
        entityId: courseId,
        before: summarize([removed]),
        after: [],
      },
      session,
    );
  });
  refresh();
});

export const saveCoMap = action({ input: SaveCoMap, roles: ['admin'] }, async ({ courseId, 'cell[]': raw }, viewer) => {
  await db();
  const course = await Course.findById(courseId, { programId: 1, category: 1, cos: 1, coMap: 1 }).lean();
  if (!course) throw new AppError('NOT_FOUND', 'Course not found.');
  requireUgc(course.category);
  const program = await Program.findById(course.programId, { pos: 1, psos: 1 }).lean();
  if (!program) throw new AppError('NOT_FOUND', 'Programme not found.');

  const outcomes = new Set([...program.pos, ...program.psos].map((o) => o.code));
  const coCodes = new Map(course.cos.map((c) => [String(c._id), c.code]));
  const cells = new Map<string, { coId: string; outcome: string; level: number }>();
  for (const entry of raw) {
    if (entry === '') continue;
    const [coId, outcome, level] = entry.split(':');
    if (!coCodes.has(coId))
      throw new AppError('VALIDATION', 'The matrix refers to a course outcome that no longer exists.');
    if (!outcomes.has(outcome)) throw new AppError('VALIDATION', `${outcome} is not an outcome of this programme.`);
    cells.set(`${coId}:${outcome}`, { coId, outcome, level: Number(level) });
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
    await Course.updateOne({ _id: courseId }, { $set: { coMap: [...cells.values()] } }, { session });
    await writeAudit(
      { actorId: viewer.id, action: 'course.map_changed', entity: 'course', entityId: courseId, after: changed },
      session,
    );
  });
  refresh();
});
