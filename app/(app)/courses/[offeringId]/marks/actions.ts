'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireTeach } from '@/lib/auth/access';
import { policyOf } from '@/lib/data/internal-marks';
import { assertUnlocked } from '@/lib/data/offerings';
import { db } from '@/lib/db';
import { RUBRICS } from '@/lib/domain/evaluation';
import { AppError } from '@/lib/errors';
import { CRITERION_LABEL } from '@/lib/format';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { RubricMark } from '@/lib/models/rubric-mark';
import { queueInternalMarks } from '@/lib/queue';
import { limit } from '@/lib/rate-limit';
import { OfferingRef, SaveRubricMarks } from '@/lib/schemas/marks';

const TEACH = ['admin', 'faculty'] as const;
const sameCriteria = (a: Partial<Record<string, number>>, b: Partial<Record<string, number>>) =>
  Object.keys({ ...a, ...b }).every((key) => a[key] === b[key]);

// M06 T3 (Q-41): one page of the practice or project rubric grid. Each student's criteria in the policy's order; a
// blank box clears that criterion. Only students whose criteria changed are written and audited.
export const saveRubricMarks = action({ input: SaveRubricMarks, roles: TEACH }, async (input, viewer) => {
  const { offeringId, component } = input;
  await requireTeach(viewer, offeringId);
  // M07 decision 2: the project internal is the project reviews' average, marked on the Projects tab.
  if (component === 'project') {
    throw new AppError('VALIDATION', 'Project marks come from the project reviews, on the Projects tab.');
  }
  await db();
  const offering = await Offering.findById(offeringId, { category: 1, credits: 1, evaluation: 1 }).lean();
  if (!offering || offering.category !== 'ugc' || offering.credits[component] === 0) {
    throw new AppError('VALIDATION', `This course has no ${component} credits, so it has no ${component} rubric.`);
  }
  await assertUnlocked(offeringId);
  const keys = RUBRICS[component];
  const students = input['student[]'];
  const marks = input['mark[]'];
  if (new Set(students).size !== students.length || marks.length !== students.length * keys.length) {
    throw new AppError('VALIDATION', 'The page has changed since you opened it. Reload it and try again.');
  }
  const policy = await policyOf(offering.evaluation);
  const posted = students.map((studentId, row) => {
    const criteria: Partial<Record<string, number>> = {};
    keys.forEach((key, column) => {
      const value = marks[row * keys.length + column];
      if (value === null) return;
      if (value > policy[key]) {
        const message = `${CRITERION_LABEL[key]} is out of ${policy[key]}.`;
        throw new AppError('VALIDATION', message, { 'mark[]': [message] });
      }
      criteria[key] = value;
    });
    return { studentId, criteria };
  });
  const [enrolled, stored] = await Promise.all([
    Enrollment.countDocuments({ offeringId, status: 'active', studentId: { $in: students } }),
    RubricMark.find({ offeringId, component, studentId: { $in: students } }, { studentId: 1, criteria: 1 }).lean(),
  ]);
  if (enrolled !== students.length) {
    throw new AppError('VALIDATION', 'The class list has changed since you opened it. Reload the page and try again.');
  }
  const before = new Map(stored.map((row) => [String(row.studentId), row.criteria]));
  const changed = posted.filter((row) => !sameCriteria(before.get(row.studentId) ?? {}, row.criteria));
  if (changed.length === 0) return refresh();
  await mongoose.connection.transaction(async (session) => {
    await RubricMark.bulkWrite(
      changed.map(({ studentId, criteria }) => ({
        updateOne: {
          filter: { offeringId, studentId, component },
          update: { $set: { criteria, updatedBy: viewer.id } },
          upsert: true,
        },
      })),
      { session },
    );
    for (const { studentId, criteria } of changed) {
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'marks.rubric_saved',
          entity: 'student',
          entityId: studentId,
          offeringId,
          before: { component, criteria: before.get(studentId) ?? {} },
          after: { component, criteria },
        },
        session,
      );
    }
  });
  await queueInternalMarks(offeringId);
  refresh();
});

// "Work them out again" (M06 T3): the recompute queued by hand, once a minute per class at most.
export const requestRecompute = action({ input: OfferingRef, roles: TEACH }, async ({ offeringId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await limit('internal-marks', offeringId, 1, 60_000);
  await queueInternalMarks(offeringId);
  refresh();
});
