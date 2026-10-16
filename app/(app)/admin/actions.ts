'use server';

import { refresh, updateTag } from 'next/cache';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db, isDuplicateKey } from '@/lib/db';
import { DEFAULT_OUTCOME_TITLES, normalizeCode } from '@/lib/domain/catalog';
import { istDateToDate } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Department } from '@/lib/models/department';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import {
  AddProgrammeCourse,
  RemoveProgrammeCourse,
  SaveBaskets,
  SaveBatch,
  SaveDepartment,
  SaveProgram,
  SaveProgramOutcomes,
  SaveTerm,
} from '@/lib/schemas/structure';

// A programme lists at most this many courses (05 §3.6a).
const MAX_CURRICULUM = 1000;

const taken = (what: string, value: string) => new AppError('CONFLICT', `${what} ${value} already exists.`);

export const saveDepartment = action({ input: SaveDepartment, roles: ['admin'] }, async ({ id, ...fields }) => {
  await db();
  try {
    if (id) {
      const updated = await Department.findOneAndUpdate({ _id: id }, { $set: fields }, { projection: { _id: 1 } });
      if (!updated) throw new AppError('NOT_FOUND', 'Department not found.');
    } else {
      await Department.create(fields);
    }
  } catch (error) {
    if (isDuplicateKey(error)) throw taken('A department with code', fields.code);
    throw error;
  }
  refresh();
});

export const saveProgram = action({ input: SaveProgram, roles: ['admin'] }, async ({ id, ...fields }) => {
  await db();
  if (!(await Department.exists({ _id: fields.departmentId }))) {
    throw new AppError('VALIDATION', 'Choose an existing department.');
  }
  let created: string | null = null;
  try {
    if (id) {
      // Offerings copy the department (05 §3.8); moving a programme that has them would leave those copies wrong.
      const current = await Program.findById(id, { departmentId: 1 }).lean();
      if (!current) throw new AppError('NOT_FOUND', 'Programme not found.');
      const moving = Boolean(current.departmentId) && !current.departmentId?.equals(fields.departmentId);
      if (moving && (await Offering.exists({ programId: id }))) {
        throw new AppError('CONFLICT', 'This programme has offerings, so it cannot move to another department.');
      }
      await Program.updateOne({ _id: id }, { $set: fields });
    } else {
      const outcomeTitles = DEFAULT_OUTCOME_TITLES.map((o) => ({ ...o }));
      created = String((await Program.create({ ...fields, outcomeTitles }))._id);
    }
  } catch (error) {
    if (isDuplicateKey(error)) throw taken('A programme with code', fields.code);
    throw error;
  }
  updateTag('catalog');
  if (created) return { next: `/admin/programs/${created}` };
  refresh();
});

export const saveProgramOutcomes = action(
  { input: SaveProgramOutcomes, roles: ['admin'] },
  async ({ programId, outcomeTitles }, viewer) => {
    await db();
    const program = await Program.findById(programId, { outcomeTitles: 1 }).lean();
    if (!program) throw new AppError('NOT_FOUND', 'Programme not found.');
    const before = program.outcomeTitles.map(({ code, title }) => ({ code, title }));
    if (JSON.stringify(before) === JSON.stringify(outcomeTitles)) return;
    await mongoose.connection.transaction(async (session) => {
      await Program.updateOne({ _id: programId }, { $set: { outcomeTitles } }, { session });
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'programme.outcomes_changed',
          entity: 'program',
          entityId: programId,
          before,
          after: outcomeTitles,
        },
        session,
      );
    });
    refresh();
  },
);

// Basket rows keep their ids; a renamed basket takes its courses with it, and a basket that still lists courses
// cannot be removed.
export const saveBaskets = action(
  { input: SaveBaskets, roles: ['admin'] },
  async ({ programId, baskets, removed }, viewer) => {
    await db();
    const program = await Program.findById(programId, { baskets: 1 }).lean();
    if (!program) throw new AppError('NOT_FOUND', 'Programme not found.');
    const current = new Map(program.baskets.map((b) => [String(b._id), b]));
    if ([...removed, ...baskets.flatMap((b) => b.basketId ?? [])].some((id) => !current.has(id))) {
      throw new AppError('CONFLICT', 'The baskets changed while you were editing. Reload the page and try again.');
    }
    for (const id of removed) {
      const name = current.get(id)?.name;
      const listed = await CurriculumEntry.countDocuments({ programId, basket: name });
      if (listed > 0) {
        throw new AppError('CONFLICT', `${name} lists ${listed} course${listed === 1 ? '' : 's'}. Move them first.`);
      }
    }
    const renames = baskets.flatMap((b) => {
      const before = b.basketId ? current.get(b.basketId)?.name : undefined;
      return before && before !== b.name ? [{ from: before, to: b.name }] : [];
    });
    const next = baskets.map(({ basketId, ...b }) => ({
      _id: basketId ? new Types.ObjectId(basketId) : new Types.ObjectId(),
      ...b,
    }));
    await mongoose.connection.transaction(async (session) => {
      // Through a placeholder, so swapping two names never merges their courses.
      for (const [i, { from }] of renames.entries()) {
        await CurriculumEntry.updateMany(
          { programId, basket: from },
          { $set: { basket: `__renaming_${i}` } },
          { session },
        );
      }
      for (const [i, { to }] of renames.entries()) {
        await CurriculumEntry.updateMany(
          { programId, basket: `__renaming_${i}` },
          { $set: { basket: to } },
          { session },
        );
      }
      await Program.updateOne({ _id: programId }, { $set: { baskets: next } }, { session });
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'programme.curriculum_changed',
          entity: 'program',
          entityId: programId,
          before: { baskets: program.baskets.map((b) => b.name) },
          after: { baskets: next.map((b) => b.name), renamed: renames },
        },
        session,
      );
    });
    updateTag('catalog');
    refresh();
  },
);

export const addProgrammeCourse = action(
  { input: AddProgrammeCourse, roles: ['admin'] },
  async ({ programId, code: typed, basket }, viewer) => {
    const code = normalizeCode(typed);
    await db();
    const [program, course] = await Promise.all([
      Program.findById(programId, { baskets: 1 }).lean(),
      Course.findOne({ code }, { code: 1 }).lean(),
    ]);
    if (!program) throw new AppError('NOT_FOUND', 'Programme not found.');
    if (!course) {
      throw new AppError('VALIDATION', `There is no course ${code} in the catalogue.`, {
        code: ['Add the course to the catalogue first.'],
      });
    }
    if (basket && !program.baskets.some((b) => b.name === basket)) {
      throw new AppError('VALIDATION', `${basket} is not a basket of this programme.`);
    }
    if (
      !(await CurriculumEntry.exists({ programId, courseId: course._id })) &&
      (await CurriculumEntry.countDocuments({ programId })) >= MAX_CURRICULUM
    ) {
      throw new AppError('VALIDATION', `A programme lists at most ${MAX_CURRICULUM} courses.`);
    }
    await mongoose.connection.transaction(async (session) => {
      await CurriculumEntry.updateOne(
        { programId, courseId: course._id },
        { $set: { courseCode: course.code, basket: basket ?? null } },
        { upsert: true, session },
      );
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'programme.curriculum_changed',
          entity: 'program',
          entityId: programId,
          after: { added: course.code, basket: basket ?? null },
        },
        session,
      );
    });
    updateTag('catalog');
    refresh();
  },
);

export const removeProgrammeCourse = action(
  { input: RemoveProgrammeCourse, roles: ['admin'] },
  async ({ programId, courseId }, viewer) => {
    await db();
    const entry = await CurriculumEntry.findOne({ programId, courseId }, { courseCode: 1 }).lean();
    if (!entry) return;
    await mongoose.connection.transaction(async (session) => {
      await CurriculumEntry.deleteOne({ _id: entry._id }, { session });
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'programme.curriculum_changed',
          entity: 'program',
          entityId: programId,
          after: { removed: entry.courseCode },
        },
        session,
      );
    });
    updateTag('catalog');
    refresh();
  },
);

export const saveBatch = action({ input: SaveBatch, roles: ['admin'] }, async ({ id, programId, ...fields }) => {
  await db();
  if (!(await Program.exists({ _id: programId }))) throw new AppError('NOT_FOUND', 'Programme not found.');
  try {
    if (id) {
      const updated = await Batch.findOneAndUpdate(
        { _id: id, programId },
        { $set: fields },
        { projection: { _id: 1 } },
      );
      if (!updated) throw new AppError('NOT_FOUND', 'Batch not found.');
    } else {
      await Batch.create({ ...fields, programId });
    }
  } catch (error) {
    if (isDuplicateKey(error)) throw taken('A batch starting in', String(fields.startYear));
    throw error;
  }
  refresh();
});

export const saveTerm = action({ input: SaveTerm, roles: ['admin'] }, async ({ id, ...input }) => {
  await db();
  const fields = { ...input, startsOn: istDateToDate(input.startsOn), endsOn: istDateToDate(input.endsOn) };
  try {
    // One term is current at a time: making this one current closes the previous one in the same transaction.
    await mongoose.connection.transaction(async (session) => {
      if (fields.status === 'current') {
        await Term.updateMany(
          { status: 'current', ...(id ? { _id: { $ne: id } } : {}) },
          { $set: { status: 'closed' } },
          { session },
        );
      }
      if (id) {
        const updated = await Term.findOneAndUpdate({ _id: id }, { $set: fields }, { session, projection: { _id: 1 } });
        if (!updated) throw new AppError('NOT_FOUND', 'Term not found.');
      } else {
        await Term.create([fields], { session });
      }
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw taken('A term with code', fields.code);
    throw error;
  }
  refresh();
});
