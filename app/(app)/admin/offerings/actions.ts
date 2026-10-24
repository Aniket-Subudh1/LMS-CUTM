'use server';

import { refresh } from 'next/cache';
import mongoose, { type Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/data/notify';
import { assertUnlocked } from '@/lib/data/offerings';
import { getSettings } from '@/lib/data/settings';
import { db, isDuplicateKey } from '@/lib/db';
import { courseMode } from '@/lib/domain/catalog';
import { AppError } from '@/lib/errors';
import { deleteObjects } from '@/lib/integrations/storage';
import { Assessment } from '@/lib/models/assessment';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Enrollment } from '@/lib/models/enrollment';
import { InternalMark } from '@/lib/models/internal-mark';
import { Lesson } from '@/lib/models/lesson';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Project } from '@/lib/models/project';
import { RubricMark } from '@/lib/models/rubric-mark';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { queueInternalMarks } from '@/lib/queue';
import { OfferingRef } from '@/lib/schemas/marks';
import { CreateOfferings, MAX_ENROLLMENTS, SetOfferingStatus, UpdateOfferingFaculty } from '@/lib/schemas/structure';

// The CSV import limit (06 §8): a section larger than this is enrolled by file, not in one request.
// A-83 (M03b): an offering holds at most MAX_ENROLLMENTS students; a larger batch is offered by section.
const MAX_BATCH_ENROLLMENT = MAX_ENROLLMENTS;
const list = new Intl.ListFormat('en-IN', { type: 'conjunction' });

// Faculty ticked by name plus any typed emails (other departments): 1 to 5 faculty accounts that are not disabled.
async function resolveFaculty(ids: string[], emails: string[]): Promise<Types.ObjectId[]> {
  const users = await User.find(
    {
      roles: 'faculty',
      status: { $in: ['invited', 'active'] },
      $or: [{ _id: { $in: ids } }, { email: { $in: emails } }],
    },
    { email: 1 },
  ).lean();
  const missing = emails.filter((e) => !users.some((u) => u.email === e));
  if (missing.length > 0 || users.filter((u) => ids.includes(String(u._id))).length !== new Set(ids).size) {
    const message = missing.length
      ? `No faculty account for ${missing.join(', ')}.`
      : 'A ticked faculty member is no longer available. Reload the page.';
    throw new AppError('VALIDATION', message, { otherFaculty: [message] });
  }
  if (users.length > 5) throw new AppError('VALIDATION', 'An offering has at most 5 faculty.');
  return users.map((u) => u._id);
}

// One offering per ticked section, in one transaction with its students (AC-M01b-06). The programme and its
// department come from the batch (A-56); the course must be in that programme's curriculum. Each offering keeps
// a copy of the course's credits and of the evaluation policy (null for a non-credit course).
export const createOfferings = action({ input: CreateOfferings, roles: ['admin'] }, async (input, viewer) => {
  await db();
  const [batch, course, term] = await Promise.all([
    Batch.findById(input.batchId, { programId: 1, sections: 1 }).lean(),
    Course.findById(input.courseId, { code: 1, title: 1, credits: 1, status: 1, modules: 1 }).lean(),
    Term.findById(input.termId, { code: 1 }).lean(),
  ]);
  if (!batch) throw new AppError('VALIDATION', 'Choose an existing batch.');
  if (!term) throw new AppError('VALIDATION', 'Choose an existing term.');
  if (!course || course.status === 'archived') {
    throw new AppError('VALIDATION', 'Choose an existing course that is not archived.');
  }
  const program = await Program.findById(batch.programId, { code: 1, departmentId: 1 }).lean();
  if (!program) throw new AppError('VALIDATION', "The batch's programme no longer exists.");
  const departmentId = program.departmentId;
  if (!departmentId) {
    throw new AppError('VALIDATION', `Set the department of ${program.code} first, on its programme page.`);
  }
  if (!(await CurriculumEntry.exists({ programId: program._id, courseId: course._id }))) {
    throw new AppError(
      'VALIDATION',
      `${course.code} is not in ${program.code}'s curriculum. Add it on the programme page first.`,
    );
  }
  const sections = input['sections[]'].includes('*') ? [null] : input['sections[]'];
  const unknown = sections.filter((section) => section !== null && !batch.sections.includes(section));
  if (unknown.length > 0) {
    const message = `${unknown.join(', ')} ${unknown.length === 1 ? 'is not a section' : 'are not sections'} of that batch.`;
    throw new AppError('VALIDATION', message, { 'sections[]': [message] });
  }
  const project = course.credits.project > 0;
  if (project && input.projectMode === undefined) {
    throw new AppError('VALIDATION', 'Choose how projects are tracked: this course has project credits.', {
      projectMode: ['Choose GitHub or Tracker.'],
    });
  }
  const taken = await Offering.find(
    { courseId: course._id, termId: term._id, batchId: batch._id, section: { $in: sections } },
    { section: 1 },
  ).lean();
  if (taken.length > 0) {
    const which = taken.map((o) => (o.section ? `section ${o.section}` : 'the whole batch')).join(', ');
    throw new AppError('CONFLICT', `This course is already offered to ${which} in ${term.code}. Nothing was created.`);
  }

  const facultyIds = await resolveFaculty(input['faculty[]'], input.otherFaculty);
  const credit = courseMode(course.credits) === 'credit';
  const evaluation = credit ? await getSettings('evaluation') : null;
  // Students not yet signed in (invited) are enrolled too; a disabled account is not.
  const studentsOf = async (section: string | null) => {
    const students = await User.find(
      {
        roles: 'student',
        status: { $in: ['invited', 'active'] },
        batchId: batch._id,
        ...(section === null ? {} : { section }),
      },
      { _id: 1 },
    )
      .limit(MAX_BATCH_ENROLLMENT + 1)
      .lean();
    if (students.length > MAX_BATCH_ENROLLMENT) {
      throw new AppError('VALIDATION', `More than ${MAX_BATCH_ENROLLMENT} students match. Choose sections.`);
    }
    return students;
  };
  const enrolments = await Promise.all(sections.map(studentsOf));

  try {
    await mongoose.connection.transaction(async (session) => {
      for (const [i, section] of sections.entries()) {
        const [offering] = await Offering.create(
          [
            {
              courseId: course._id,
              termId: term._id,
              batchId: batch._id,
              section,
              programId: program._id,
              departmentId,
              category: credit ? 'ugc' : 'skill',
              credits: course.credits,
              evaluation,
              title: `${course.code} · ${course.title} · ${term.code}${section ? ` · ${section}` : ''}`,
              facultyIds,
              projectMode: project ? input.projectMode : null,
              modules: course.modules.slice(0, 40).map((m, order) => ({ title: m.title.slice(0, 160), order })),
              status: 'draft',
            },
          ],
          { session },
        );
        if (enrolments[i].length > 0) {
          await Enrollment.insertMany(
            enrolments[i].map((s) => ({ offeringId: offering._id, studentId: s._id, status: 'active' as const })),
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
            after: { added: enrolments[i].length, dropped: 0, source: 'batch', section },
          },
          session,
        );
      }
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError('CONFLICT', 'This course was just offered to one of those sections. Nothing was created.');
    }
    throw error;
  }
  refresh();
  return { created: sections.length };
});

export const updateOfferingFaculty = action(
  { input: UpdateOfferingFaculty, roles: ['admin'] },
  async ({ offeringId, 'faculty[]': ids, otherFaculty }) => {
    await db();
    const facultyIds = await resolveFaculty(ids, otherFaculty);
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
    const offering = await Offering.findOneAndUpdate(
      { _id: offeringId, status: from },
      { $set: { status } },
      { returnDocument: 'after', projection: { facultyIds: 1, title: 1, plan: 1 } },
    ).lean();
    if (!offering) {
      if (!(await Offering.exists({ _id: offeringId }))) throw new AppError('NOT_FOUND', 'Offering not found.');
      throw new AppError('CONFLICT', `Only a ${from} offering can become ${status}.`);
    }
    // CRS-06: the system requests the plan from the faculty when teaching starts without one.
    if (status === 'active' && !offering.plan.publishedAt) {
      await notify(offering.facultyIds.map(String), {
        kind: 'plan.requested',
        title: `Publish the course plan and calendar for ${offering.title}`,
        href: `/courses/${offeringId}/plan`,
      });
    }
    refresh();
  },
);

// An offering created by mistake (wrong course, term or section) is removed for good with its enrolments, while it is
// a draft and nothing has been added to it. A draft was never open to students and cannot be locked, so only what
// teachers may add is checked; internal marks rows are recomputed copies (a refresh of a draft writes them), so they
// go too. Audited.
export const deleteOffering = action({ input: OfferingRef, roles: ['admin'] }, async ({ offeringId }, viewer) => {
  await db();
  const offering = await Offering.findById(offeringId, { title: 1, status: 1, coverKey: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Offering not found.');
  if (offering.status !== 'draft') {
    throw new AppError('CLOSED', 'Only a draft offering can be deleted. One that has started is kept with its records.');
  }
  const found = await Promise.all([
    Lesson.exists({ offeringId }),
    LiveSession.exists({ offeringId }),
    Assessment.exists({ offeringId }),
    Project.exists({ offeringId }),
    RubricMark.exists({ offeringId }),
  ]);
  const added = ['lessons', 'live classes', 'assessments', 'projects', 'marks'].filter((_, i) => found[i]);
  if (added.length > 0) {
    throw new AppError('CONFLICT', `It already has ${list.format(added)}, so it is kept.`);
  }
  await mongoose.connection.transaction(async (session) => {
    const removed = await Offering.deleteOne({ _id: offeringId, status: 'draft' }, { session });
    if (removed.deletedCount === 0) throw new AppError('CONFLICT', 'The offering changed meanwhile. Reload the page.');
    const enrolments = await Enrollment.deleteMany({ offeringId }, { session });
    await InternalMark.deleteMany({ offeringId }, { session });
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'offering.deleted',
        entity: 'offering',
        entityId: offeringId,
        offeringId,
        before: { title: offering.title, enrolments: enrolments.deletedCount },
      },
      session,
    );
  });
  if (offering.coverKey) await deleteObjects([offering.coverKey]);
  refresh();
});

// M06 (CE-07, AC-M06-04): an offering keeps the evaluation policy it was created with; an admin copies today's
// Settings onto one offering, while its marks are unlocked. Audited with the copies before and after.
export const refreshEvaluation = action({ input: OfferingRef, roles: ['admin'] }, async ({ offeringId }, viewer) => {
  await db();
  const offering = await Offering.findById(offeringId, { category: 1, evaluation: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Offering not found.');
  if (offering.category !== 'ugc') throw new AppError('VALIDATION', 'A non-credit course has no evaluation policy.');
  await assertUnlocked(offeringId);
  const evaluation = await getSettings('evaluation');
  await mongoose.connection.transaction(async (session) => {
    await Offering.updateOne({ _id: offeringId }, { $set: { evaluation } }, { session });
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'offering.evaluation_refreshed',
        entity: 'offering',
        entityId: offeringId,
        offeringId,
        before: offering.evaluation ?? null,
        after: evaluation,
      },
      session,
    );
  });
  await queueInternalMarks(offeringId);
  refresh();
});

