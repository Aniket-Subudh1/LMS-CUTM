'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireTeach } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { formatCsvErrors, parseEnrollmentCsv, type CsvError } from '@/lib/domain/csv';
import { parseKey } from '@/lib/domain/uploads';
import { AppError, csvRejected } from '@/lib/errors';
import { deleteObjects } from '@/lib/integrations/storage';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { User } from '@/lib/models/user';
import {
  AddStudent,
  ChangeEnrollments,
  MAX_ENROLLMENTS,
  OfferingRef,
  SetEnrollmentStatus,
  SetOfferingCover,
} from '@/lib/schemas/structure';

const TEACH = ['admin', 'faculty'] as const;

// Marks locked for the offering freeze its enrolment (05 §3.9).
async function requireUnlocked(offeringId: string) {
  const offering = await Offering.findById(offeringId, { lockedAt: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  if (offering.lockedAt)
    throw new AppError('LOCKED', 'Marks are locked for this offering, so enrollment cannot change.');
}

const full = () =>
  new AppError('CONFLICT', `A class holds at most ${MAX_ENROLLMENTS} students, dropped ones included.`);

// 06 §8.2. All or nothing: one bad row stops the whole file.
export const changeEnrollments = action(
  { input: ChangeEnrollments, roles: ['admin', 'faculty'] },
  async ({ offeringId, file }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    await requireUnlocked(offeringId);

    const parsed = parseEnrollmentCsv(await file.text());
    if (!parsed.ok) throw csvRejected(formatCsvErrors(parsed.errors));

    const students = await User.find(
      { rollNo: { $in: parsed.rows.map((r) => r.rollNo) }, roles: 'student' },
      { rollNo: 1 },
    ).lean();
    const studentIds = new Map(students.map((s) => [s.rollNo, s._id]));
    const current = await Enrollment.find(
      { offeringId, studentId: { $in: students.map((s) => s._id) } },
      { studentId: 1, status: 1 },
    ).lean();
    const status = new Map(current.map((e) => [String(e.studentId), e.status]));

    const errors: CsvError[] = [];
    const ops: Parameters<typeof Enrollment.bulkWrite>[0] = [];
    let added = 0;
    let dropped = 0;
    for (const { row, rollNo, action: change } of parsed.rows) {
      const studentId = studentIds.get(rollNo);
      if (!studentId) {
        errors.push({ row, message: `No student has roll number ${rollNo}.` });
        continue;
      }
      const active = status.get(String(studentId)) === 'active';
      if (change === 'add' && !active) {
        added++;
        ops.push({
          updateOne: {
            filter: { offeringId, studentId },
            update: { $set: { status: 'active' }, $setOnInsert: { offeringId, studentId } },
            upsert: true,
          },
        });
      } else if (change === 'drop') {
        if (!active) {
          errors.push({ row, message: `${rollNo} is not enrolled in this offering.` });
          continue;
        }
        dropped++;
        ops.push({ updateOne: { filter: { offeringId, studentId }, update: { $set: { status: 'dropped' } } } });
      }
    }
    if (errors.length > 0) throw csvRejected(formatCsvErrors(errors));
    // A-83: students with no row yet add one each.
    const fresh = parsed.rows.filter((r) => r.action === 'add' && !status.has(String(studentIds.get(r.rollNo)))).length;
    if (fresh > 0 && (await Enrollment.countDocuments({ offeringId })) + fresh > MAX_ENROLLMENTS) throw full();

    if (ops.length > 0) {
      await mongoose.connection.transaction(async (session) => {
        await Enrollment.bulkWrite(ops, { session });
        await writeAudit(
          {
            actorId: viewer.id,
            action: 'enrollment.changed',
            entity: 'offering',
            entityId: offeringId,
            offeringId,
            after: { added, dropped, source: 'csv' },
          },
          session,
        );
      });
    }
    refresh();
    return { added, dropped };
  },
);

// M03b: the class's cover, kept by its teachers (A-81). The key must be the viewer's own upload for this offering.
export const setOfferingCover = action(
  { input: SetOfferingCover, roles: ['admin', 'faculty'] },
  async (input, viewer) => {
    await requireTeach(viewer, input.offeringId);
    await db();
    const key = input['cover[]'][0].key;
    const owner = parseKey(key);
    if (
      !owner ||
      owner.purpose !== 'offering-cover' ||
      owner.contextId !== input.offeringId ||
      owner.userId !== viewer.id
    ) {
      throw new AppError('VALIDATION', 'Upload the picture again.', { 'cover[]': ['Upload the picture again.'] });
    }
    const before = await Offering.findOneAndUpdate(
      { _id: input.offeringId },
      { $set: { coverKey: key } },
      { projection: { coverKey: 1 } },
    ).lean();
    if (before?.coverKey) await deleteObjects([before.coverKey]);
    refresh();
  },
);

export const clearOfferingCover = action(
  { input: OfferingRef, roles: ['admin', 'faculty'] },
  async ({ offeringId }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const before = await Offering.findOneAndUpdate(
      { _id: offeringId },
      { $unset: { coverKey: 1 } },
      { projection: { coverKey: 1 } },
    ).lean();
    if (before?.coverKey) await deleteObjects([before.coverKey]);
    refresh();
  },
);

// M03b T7: one student by roll number or email; a dropped student is added again. Audited like a CSV change.
export const addStudent = action({ input: AddStudent, roles: TEACH }, async ({ offeringId, who }, viewer) => {
  await requireTeach(viewer, offeringId);
  await db();
  await requireUnlocked(offeringId);
  const student = await User.findOne(
    {
      roles: 'student',
      // Roll numbers are stored as typed; CUTM writes them in capitals.
      ...(who.includes('@') ? { email: who.toLowerCase() } : { rollNo: { $in: [who, who.toUpperCase()] } }),
    },
    { rollNo: 1, name: 1 },
  ).lean();
  if (!student) {
    const message = who.includes('@') ? `No student has the email ${who}.` : `No student has roll number ${who}.`;
    throw new AppError('VALIDATION', message, { who: [message] });
  }
  const current = await Enrollment.findOne({ offeringId, studentId: student._id }, { status: 1 }).lean();
  if (current?.status === 'active') {
    throw new AppError('CONFLICT', `${student.name} is already in this class.`, {
      who: [`${student.name} is already in this class.`],
    });
  }
  if (!current && (await Enrollment.countDocuments({ offeringId })) >= MAX_ENROLLMENTS) throw full();
  await mongoose.connection.transaction(async (session) => {
    await Enrollment.updateOne(
      { offeringId, studentId: student._id },
      { $set: { status: 'active' }, $setOnInsert: { offeringId, studentId: student._id } },
      { upsert: true, session },
    );
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'enrollment.changed',
        entity: 'offering',
        entityId: offeringId,
        offeringId,
        after: { added: 1, dropped: 0, source: 'single', rollNo: student.rollNo ?? null },
      },
      session,
    );
  });
  refresh();
});

// M03b T7: drop a student, or add a dropped one again, from the roster. Their progress and attendance are kept.
export const setEnrollmentStatus = action(
  { input: SetEnrollmentStatus, roles: TEACH },
  async ({ offeringId, enrollmentId, status }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    await requireUnlocked(offeringId);
    const enrolment = await Enrollment.findOne({ _id: enrollmentId, offeringId }, { studentId: 1, status: 1 }).lean();
    if (!enrolment) throw new AppError('NOT_FOUND', 'That student is not in this class.');
    if (enrolment.status === status) return refresh();
    const student = await User.findById(enrolment.studentId, { rollNo: 1 }).lean();
    await mongoose.connection.transaction(async (session) => {
      await Enrollment.updateOne({ _id: enrollmentId, status: enrolment.status }, { $set: { status } }, { session });
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'enrollment.changed',
          entity: 'offering',
          entityId: offeringId,
          offeringId,
          after: {
            added: status === 'active' ? 1 : 0,
            dropped: status === 'dropped' ? 1 : 0,
            source: 'roster',
            rollNo: student?.rollNo ?? null,
          },
        },
        session,
      );
    });
    refresh();
  },
);
