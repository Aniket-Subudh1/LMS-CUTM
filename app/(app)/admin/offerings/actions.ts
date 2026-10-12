'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db, isDuplicateKey } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { EvaluationScheme } from '@/lib/models/evaluation-scheme';
import { Offering } from '@/lib/models/offering';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { CreateOffering, SetOfferingStatus, UpdateOfferingFaculty } from '@/lib/schemas/structure';

// The CSV import limit (06 §8): a batch larger than this is enrolled by file, not in one request.
const MAX_BATCH_ENROLLMENT = 5000;

async function resolveFaculty(emails: string[]) {
  const users = await User.find(
    { email: { $in: emails }, roles: 'faculty', status: { $in: ['invited', 'active'] } },
    { email: 1 },
  ).lean();
  const byEmail = new Map(users.map((u) => [u.email, u._id]));
  const missing = emails.filter((e) => !byEmail.has(e));
  if (missing.length > 0) {
    const message = `No faculty account for ${missing.join(', ')}.`;
    throw new AppError('VALIDATION', message, { faculty: [message] });
  }
  return emails.flatMap((e) => byEmail.get(e) ?? []);
}

export const createOffering = action({ input: CreateOffering, roles: ['admin'] }, async (input, viewer) => {
  await db();
  const [course, term, batch] = await Promise.all([
    Course.findById(input.courseId, {
      programId: 1,
      departmentId: 1,
      category: 1,
      code: 1,
      title: 1,
      components: 1,
      componentKey: 1,
      status: 1,
    }).lean(),
    Term.findById(input.termId, { code: 1 }).lean(),
    Batch.findById(input.batchId, { programId: 1, sections: 1 }).lean(),
  ]);
  if (!course || course.status === 'archived')
    throw new AppError('VALIDATION', 'Choose an existing, unarchived course.');
  if (!term) throw new AppError('VALIDATION', 'Choose an existing term.');
  if (!batch) throw new AppError('VALIDATION', 'Choose an existing batch.');
  if (!batch.programId.equals(course.programId)) {
    throw new AppError('VALIDATION', 'That batch belongs to a different programme than the course.');
  }
  const { section } = input;
  if (section !== undefined && !batch.sections.includes(section)) {
    throw new AppError('VALIDATION', `${section} is not a section of that batch.`, {
      section: [`${section} is not a section of that batch.`],
    });
  }
  if (course.components.includes('project') && input.projectMode === undefined) {
    throw new AppError('VALIDATION', 'Choose a project mode: this course has a project component.', {
      projectMode: ['Choose GitHub or Tracker.'],
    });
  }

  const facultyIds = await resolveFaculty(input.faculty);
  let schemeId = null;
  if (course.category === 'ugc') {
    const scheme = await EvaluationScheme.findOne(
      { componentKey: course.componentKey, status: 'active' },
      { _id: 1 },
    ).lean();
    if (!scheme) throw new AppError('VALIDATION', `No active evaluation scheme for ${course.componentKey}.`);
    schemeId = scheme._id;
  }

  // Students not yet signed in (invited) are enrolled too; a disabled account is not.
  const students = await User.find(
    {
      roles: 'student',
      status: { $in: ['invited', 'active'] },
      batchId: input.batchId,
      ...(section === undefined ? {} : { section }),
    },
    { _id: 1 },
  )
    .limit(MAX_BATCH_ENROLLMENT + 1)
    .lean();
  if (students.length > MAX_BATCH_ENROLLMENT) {
    throw new AppError('VALIDATION', `More than ${MAX_BATCH_ENROLLMENT} students match. Choose a section.`);
  }

  try {
    await mongoose.connection.transaction(async (session) => {
      const [offering] = await Offering.create(
        [
          {
            courseId: course._id,
            termId: term._id,
            batchId: batch._id,
            section: section ?? null,
            programId: course.programId,
            departmentId: course.departmentId,
            category: course.category,
            title: `${course.code} · ${course.title} · ${term.code}${section ? ` · ${section}` : ''}`,
            facultyIds,
            schemeId,
            projectMode: course.components.includes('project') ? input.projectMode : null,
            status: 'draft',
          },
        ],
        { session },
      );
      if (students.length > 0) {
        await Enrollment.insertMany(
          students.map((s) => ({ offeringId: offering._id, studentId: s._id, status: 'active' as const })),
          { session, ordered: false },
        );
      }
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'enrollment.changed',
          entity: 'offering',
          entityId: String(offering._id),
          offeringId: String(offering._id),
          after: { added: students.length, dropped: 0, source: 'batch', section: section ?? null },
        },
        session,
      );
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError('CONFLICT', 'This course is already offered to that batch and section in that term.');
    }
    throw error;
  }
  refresh();
});

export const updateOfferingFaculty = action(
  { input: UpdateOfferingFaculty, roles: ['admin'] },
  async ({ offeringId, faculty }) => {
    await db();
    const facultyIds = await resolveFaculty(faculty);
    const updated = await Offering.updateOne({ _id: offeringId }, { $set: { facultyIds } });
    if (updated.matchedCount === 0) throw new AppError('NOT_FOUND', 'Offering not found.');
    refresh();
  },
);

// draft → active → completed, one step at a time.
export const setOfferingStatus = action(
  { input: SetOfferingStatus, roles: ['admin'] },
  async ({ offeringId, status }) => {
    await db();
    const from = status === 'active' ? 'draft' : 'active';
    const updated = await Offering.updateOne({ _id: offeringId, status: from }, { $set: { status } });
    if (updated.matchedCount === 0) {
      if (!(await Offering.exists({ _id: offeringId }))) throw new AppError('NOT_FOUND', 'Offering not found.');
      throw new AppError('CONFLICT', `Only a ${from} offering can become ${status}.`);
    }
    refresh();
  },
);
