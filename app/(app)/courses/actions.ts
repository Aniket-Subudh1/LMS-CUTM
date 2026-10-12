'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireTeach } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { formatCsvErrors, parseEnrollmentCsv, type CsvError } from '@/lib/domain/csv';
import { AppError, csvRejected } from '@/lib/errors';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { User } from '@/lib/models/user';
import { ChangeEnrollments } from '@/lib/schemas/structure';

// 06 §8.2. All or nothing: one bad row stops the whole file.
export const changeEnrollments = action(
  { input: ChangeEnrollments, roles: ['admin', 'faculty'] },
  async ({ offeringId, file }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const offering = await Offering.findById(offeringId, { lockedAt: 1 }).lean();
    if (offering?.lockedAt)
      throw new AppError('LOCKED', 'Marks are locked for this offering, so enrollment cannot change.');

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
