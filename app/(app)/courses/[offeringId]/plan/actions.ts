'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireTeach } from '@/lib/auth/access';
import { notify } from '@/lib/data/notifications';
import { db } from '@/lib/db';
import { classDates, istDateToDate } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { mailQueue } from '@/lib/queue';
import { istDate } from '@/lib/schemas/common';
import { PublishPlan, SaveCalendar, SavePlan } from '@/lib/schemas/content';
import { FillCalendar } from '@/lib/schemas/structure';

const MAX_ROWS = 200;

export const savePlan = action(
  { input: SavePlan, roles: ['admin', 'faculty'] },
  async ({ offeringId, doc }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    await Offering.updateOne({ _id: offeringId }, doc ? { $set: { 'plan.doc': doc } } : { $unset: { 'plan.doc': 1 } });
    refresh();
  },
);

// CRS-06: blank rows are ignored, the rest are checked one by one and stored sorted by date.
export const saveCalendar = action({ input: SaveCalendar, roles: ['admin', 'faculty'] }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  const offering = await Offering.findById(input.offeringId, { courseId: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  const course = await Course.findById(offering.courseId, { 'cos._id': 1 }).lean();
  const known = new Set(course?.cos.map((co) => String(co._id)) ?? []);

  const errors: Record<string, string[]> = {};
  const rows: { date: Date; topic: string; coIds: string[] }[] = [];
  for (let i = 0; i < input.rows; i++) {
    const date = String(input[`date_${i}`] ?? '').trim();
    const topic = String(input[`topic_${i}`] ?? '').trim();
    const raw = input[`cos_${i}[]`];
    const coIds = (Array.isArray(raw) ? raw : []).map(String);
    if (!date && !topic) continue;
    const day = istDate.safeParse(date);
    if (!day.success) errors[`date_${i}`] = [date ? 'Enter a real date.' : 'Enter the date.'];
    if (!topic) errors[`topic_${i}`] = ['Enter the topic.'];
    else if (topic.length > 200) errors[`topic_${i}`] = ['Use at most 200 characters.'];
    if (coIds.some((id) => !known.has(id))) errors[`cos_${i}[]`] = ['Pick outcomes of this course only.'];
    if (day.success) rows.push({ date: istDateToDate(day.data), topic, coIds });
  }
  if (Object.keys(errors).length > 0) {
    throw new AppError('VALIDATION', 'Some sessions need attention. Fix the highlighted rows and save again.', errors);
  }
  if (rows.length > MAX_ROWS) throw new AppError('VALIDATION', `A calendar holds at most ${MAX_ROWS} sessions.`);

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  await Offering.updateOne({ _id: input.offeringId }, { $set: { calendar: rows } });
  refresh();
});

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
    const label = { theory: '', practice: 'Practice: ', project: 'Project: ' } as const;
    const calendar = plan.map((session, i) => ({
      date: istDateToDate(dates[i]),
      topic: `${label[session.kind]}${session.topic}`.slice(0, 200),
      coIds: [],
    }));
    await Offering.updateOne({ _id: offeringId }, { $set: { calendar } });
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
