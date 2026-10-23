'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireTeach } from '@/lib/auth/access';
import { notify } from '@/lib/data/notify';
import { db } from '@/lib/db';
import { classDates, istDateToDate } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { mailQueue } from '@/lib/queue';
import { AddPlanSession, PlanSessionRef, PublishPlan, SavePlan, UpdatePlanSession } from '@/lib/schemas/content';
import { FillCalendar } from '@/lib/schemas/structure';

const MAX_ROWS = 200;

export const savePlan = action(
  { input: SavePlan, roles: ['admin', 'faculty'] },
  async ({ offeringId, doc }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const changedAt = new Date();
    await Offering.updateOne(
      { _id: offeringId },
      doc
        ? { $set: { 'plan.doc': doc, 'plan.changedAt': changedAt } }
        : { $unset: { 'plan.doc': 1 }, $set: { 'plan.changedAt': changedAt } },
    );
    refresh();
  },
);

// CRS-06, M03b: one session at a time. Rows keep their ids and stay sorted by (date, _id); every save stamps
// plan.changedAt so the page can offer to publish a new version.
const SORT = { date: 1, _id: 1 } as const;

async function requireOwnCos(offeringId: string, coIds: string[]) {
  const offering = await Offering.findById(offeringId, { courseId: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  if (coIds.length === 0) return;
  const course = await Course.findById(offering.courseId, { 'cos._id': 1 }).lean();
  const known = new Set(course?.cos.map((co) => String(co._id)) ?? []);
  if (coIds.some((id) => !known.has(id))) {
    throw new AppError('VALIDATION', 'Pick outcomes of this course only.', {
      'cos[]': ['Pick outcomes of this course only.'],
    });
  }
}

export const addPlanSession = action({ input: AddPlanSession, roles: ['admin', 'faculty'] }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  await requireOwnCos(input.offeringId, input['cos[]']);
  // The size guard sits in the filter, so two parallel adds cannot pass the limit.
  const added = await Offering.updateOne(
    { _id: input.offeringId, [`calendar.${MAX_ROWS - 1}`]: { $exists: false } },
    {
      $push: {
        calendar: {
          $each: [
            { date: istDateToDate(input.date), topic: input.topic, coIds: input['cos[]'], kind: input.kind ?? null },
          ],
          $sort: SORT,
        },
      },
      $set: { 'plan.changedAt': new Date() },
    },
  );
  if (added.matchedCount === 0) throw new AppError('VALIDATION', `A course plan holds at most ${MAX_ROWS} sessions.`);
  refresh();
});

export const updatePlanSession = action(
  { input: UpdatePlanSession, roles: ['admin', 'faculty'] },
  async (input, viewer) => {
    await requireTeach(viewer, input.offeringId);
    await db();
    await requireOwnCos(input.offeringId, input['cos[]']);
    const updated = await Offering.updateOne(
      { _id: input.offeringId, 'calendar._id': input.rowId },
      {
        $set: {
          'calendar.$.date': istDateToDate(input.date),
          'calendar.$.topic': input.topic,
          'calendar.$.coIds': input['cos[]'],
          'calendar.$.kind': input.kind ?? null,
          'plan.changedAt': new Date(),
        },
      },
    );
    if (updated.matchedCount === 0) throw new AppError('NOT_FOUND', 'That session is no longer in the plan.');
    // A new date may move the row: sort again in place (an empty $each only re-sorts).
    await Offering.updateOne({ _id: input.offeringId }, { $push: { calendar: { $each: [], $sort: SORT } } });
    refresh();
  },
);

export const deletePlanSession = action(
  { input: PlanSessionRef, roles: ['admin', 'faculty'] },
  async ({ offeringId, rowId }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const removed = await Offering.updateOne(
      { _id: offeringId, 'calendar._id': rowId },
      { $pull: { calendar: { _id: rowId } }, $set: { 'plan.changedAt': new Date() } },
    );
    if (removed.matchedCount === 0) throw new AppError('NOT_FOUND', 'That session is already gone.');
    refresh();
  },
);

// "Start from the course's session plan" (M01b): one dated session per entry of the catalogue course's plan, on the
// chosen weekdays from the first class date. Replacing sessions already scheduled needs the box ticked.
export const fillCalendarFromCourse = action(
  { input: FillCalendar, roles: ['admin', 'faculty'] },
  async ({ offeringId, firstDay, 'weekdays[]': weekdays, replace }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const offering = await Offering.findById(offeringId, { courseId: 1, 'calendar._id': 1 }).lean();
    if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
    const course = await Course.findById(offering.courseId, { sessionPlan: 1 }).lean();
    const plan = course?.sessionPlan.slice(0, MAX_ROWS) ?? [];
    if (plan.length === 0) throw new AppError('VALIDATION', 'This course has no session plan yet.');
    if (offering.calendar.length > 0 && !replace) {
      const message = `This replaces the ${offering.calendar.length} sessions already scheduled. Tick the box to go on.`;
      throw new AppError('VALIDATION', message, { replace: [message] });
    }
    const dates = classDates(firstDay, weekdays, plan.length);
    const calendar = plan.map((session, i) => ({
      date: istDateToDate(dates[i]),
      topic: session.topic.slice(0, 200),
      coIds: [],
      kind: session.kind,
    }));
    await Offering.updateOne({ _id: offeringId }, { $set: { calendar, 'plan.changedAt': new Date() } });
    refresh();
  },
);

// COM-01: each publish is a new version; students are notified in the app and emailed once per version.
export const publishPlan = action(
  { input: PublishPlan, roles: ['admin', 'faculty'] },
  async ({ offeringId, version }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const offering = await Offering.findById(offeringId, { title: 1, plan: 1, 'calendar._id': 1 }).lean();
    if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
    if (!offering.plan.doc) throw new AppError('VALIDATION', 'Write and save the course plan first (step 1).');
    if (offering.calendar.length === 0) {
      throw new AppError('VALIDATION', 'Add at least one session to the calendar first (step 2).');
    }
    // The page was showing an older version: someone already published this one, so a repeat click does nothing.
    if (offering.plan.version !== version) return;

    const next = version + 1;
    const studentIds = (await Enrollment.find({ offeringId, status: 'active' }, { studentId: 1 }).lean()).map((e) =>
      String(e.studentId),
    );
    const published = await mongoose.connection.transaction(async (session) => {
      const updated = await Offering.updateOne(
        { _id: offeringId, 'plan.version': version },
        { $set: { 'plan.version': next, 'plan.publishedAt': new Date(), 'plan.publishedBy': viewer.id } },
        { session },
      );
      if (updated.modifiedCount === 0) return false;
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'plan.published',
          entity: 'offering',
          entityId: offeringId,
          offeringId,
          after: { version: next, recipients: studentIds.length },
        },
        session,
      );
      return true;
    });
    if (!published) return;

    await mailQueue().add(
      'fanout',
      { kind: 'coursePlanPublished', offeringId, version: next },
      { jobId: `plan-${offeringId}-${next}` },
    );
    await notify(studentIds, {
      kind: 'plan.published',
      title: `The course plan for ${offering.title} is ready`,
      href: `/courses/${offeringId}`,
    });
    refresh();
  },
);
