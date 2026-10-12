'use server';

import { refresh, updateTag } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { db, isDuplicateKey } from '@/lib/db';
import { defaultOutcomes } from '@/lib/domain/structure';
import { istDateToDate } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { SaveBatch, SaveDepartment, SaveProgram, SaveProgramOutcomes, SaveTerm } from '@/lib/schemas/structure';

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

export const saveProgram = action({ input: SaveProgram, roles: ['admin'] }, async ({ id, category, ...fields }) => {
  await db();
  if (!(await Department.exists({ _id: fields.departmentId }))) {
    throw new AppError('VALIDATION', 'Choose an existing department.');
  }
  let created: string | null = null;
  try {
    if (id) {
      // `departmentId` is copied onto courses and offerings; moving a program under courses would leave those copies wrong.
      const current = await Program.findById(id, { departmentId: 1 }).lean();
      if (!current) throw new AppError('NOT_FOUND', 'Programme not found.');
      if (!current.departmentId.equals(fields.departmentId) && (await Course.exists({ programId: id }))) {
        throw new AppError('CONFLICT', 'This programme has courses, so it cannot move to another department.');
      }
      // The category decides whether outcomes exist at all (01 §3), so it is set once, at creation.
      await Program.updateOne({ _id: id }, { $set: fields });
    } else {
      const outcomes = category === 'ugc' ? defaultOutcomes() : { pos: [], psos: [] };
      created = String((await Program.create({ ...fields, category, ...outcomes }))._id);
    }
  } catch (error) {
    if (isDuplicateKey(error)) throw taken('A programme with code', fields.code);
    throw error;
  }
  updateTag('catalog');
  if (created) return { next: `/admin/programs/${created}` };
  refresh();
});

export const saveProgramOutcomes = action({ input: SaveProgramOutcomes, roles: ['admin'] }, async (input) => {
  await db();
  const program = await Program.findById(input.programId, { category: 1, pos: 1, psos: 1 }).lean();
  if (!program) throw new AppError('NOT_FOUND', 'Programme not found.');
  if (program.category !== 'ugc') throw new AppError('VALIDATION', 'Skill programmes have no outcomes.');

  const kept = new Set([...input.pos, ...input.psos].map((o) => o.code));
  const removed = [...program.pos, ...program.psos].map((o) => o.code).filter((code) => !kept.has(code));
  if (removed.length > 0) {
    const using = await Course.find({ programId: input.programId, 'coMap.outcome': { $in: removed } }, { code: 1 })
      .sort({ code: 1 })
      .limit(10)
      .lean();
    if (using.length > 0) {
      throw new AppError(
        'CONFLICT',
        `${removed.join(', ')} ${removed.length > 1 ? 'are' : 'is'} used in the CO–PO–PSO matrix of ${using.map((c) => c.code).join(', ')}. Clear those cells first.`,
      );
    }
  }
  await Program.updateOne({ _id: input.programId }, { $set: { pos: input.pos, psos: input.psos } });
  updateTag('catalog');
  refresh();
});

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
