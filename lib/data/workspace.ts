import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { offeringAccess, requireTeach, type OfferingAccess } from '@/lib/auth/access';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { attendancePct } from '@/lib/domain/attendance';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import { formatDate } from '@/lib/format';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { pageSize, RichTextDoc, ROLES } from '@/lib/schemas/common';
import type { OFFERING_STATUSES } from '@/lib/schemas/structure';

type Status = (typeof OFFERING_STATUSES)[number];

export type MyOfferingRow = {
  id: string;
  title: string;
  termCode: string;
  status: Status;
  faculty: string[];
};

// Offerings the viewer teaches or, as a head of department, oversees.
function teachingScope(viewer: Viewer) {
  return [
    { facultyIds: viewer.id },
    ...(viewer.roles.includes('hod') && viewer.departmentId ? [{ departmentId: viewer.departmentId }] : []),
  ];
}

// Admin sees every offering; faculty theirs; a head of department their department's; a student the active or
// completed offerings they are enrolled in (09 §3). The same rules decide who may open a workspace.
async function offeringScope(viewer: Viewer) {
  if (viewer.roles.includes('admin')) return {};
  return {
    $or: [
      ...teachingScope(viewer),
      ...(viewer.roles.includes('student')
        ? [
            {
              status: { $in: ['active', 'completed'] satisfies Status[] },
              _id: { $in: await Enrollment.distinct('offeringId', { studentId: viewer.id, status: 'active' }) },
            },
          ]
        : []),
    ],
  };
}

export async function listMyOfferings(
  page: number,
  filters: { termId?: string; departmentId?: string },
): Promise<{ rows: MyOfferingRow[]; total: number }> {
  const viewer = await requireViewer(['admin', 'hod', 'faculty', 'student']);
  await db();
  const scope = await offeringScope(viewer);
  const filter = {
    ...scope,
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  };
  const [docs, total] = await Promise.all([
    Offering.find(filter, { title: 1, termId: 1, status: 1, facultyIds: 1 })
      .sort({ _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Offering.countDocuments(filter),
  ]);
  const [terms, faculty] = await Promise.all([
    Term.find({ _id: { $in: docs.map((o) => o.termId) } }, { code: 1 }).lean(),
    User.find({ _id: { $in: docs.flatMap((o) => o.facultyIds) } }, { name: 1 }).lean(),
  ]);
  const termCodes = new Map(terms.map((t) => [String(t._id), t.code]));
  const names = new Map(faculty.map((f) => [String(f._id), f.name]));
  return {
    rows: docs.map((o) => ({
      id: String(o._id),
      title: o.title,
      termCode: termCodes.get(String(o.termId)) ?? '—',
      status: o.status,
      faculty: o.facultyIds.flatMap((id) => names.get(String(id)) ?? []),
    })),
    total,
  };
}

export type HomeSummary = {
  // What /courses lists; null when the viewer has no offering role, and for admins (their tiles count everything).
  myOfferings: number | null;
  // Active enrolments across the offerings the viewer teaches or oversees; null without faculty or hod.
  enrolments: number | null;
  admin: {
    programs: number;
    courses: number;
    activeOfferings: number;
    users: number;
    invited: number;
    recent: { id: string; at: Date; actor: string; action: string; entity: string }[];
    // Audit entries per IST day for the last seven days, oldest first; `day` is that day's midnight in IST.
    activity: { day: Date; count: number }[];
    // The three people with the most audit entries in those seven days.
    mostActive: { id: string; name: string; count: number }[];
  } | null;
};

export async function getHomeSummary(): Promise<HomeSummary> {
  const viewer = await requireViewer();
  await db();
  const isAdmin = viewer.roles.includes('admin');
  const learns = viewer.roles.some((r) => r === 'hod' || r === 'faculty' || r === 'student');
  const teaches = viewer.roles.some((r) => r === 'hod' || r === 'faculty');
  const [myOfferings, enrolments, admin] = await Promise.all([
    !isAdmin && learns ? Offering.countDocuments(await offeringScope(viewer)) : null,
    teaches
      ? Offering.find({ $or: teachingScope(viewer) }, { _id: 1 })
          .lean()
          .then((taught) =>
            Enrollment.countDocuments({ offeringId: { $in: taught.map((o) => o._id) }, status: 'active' }),
          )
      : null,
    isAdmin ? adminSummary() : null,
  ]);
  return { myOfferings, enrolments, admin };
}

const DAY_MS = 86_400_000;

async function adminSummary(): Promise<NonNullable<HomeSummary['admin']>> {
  const today = istDateToDate(istDayKey(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getTime() - (6 - i) * DAY_MS));
  const week = { at: { $gte: days[0] } };
  const [programs, courses, activeOfferings, users, invited, recent, perDay, perActor] = await Promise.all([
    Program.countDocuments({ status: 'active' }),
    Course.estimatedDocumentCount(),
    Offering.countDocuments({ status: 'active' }),
    User.estimatedDocumentCount(),
    // Every user has a role, so matching all of them lets the { roles, status } index serve a count by status.
    User.countDocuments({ roles: { $in: ROLES }, status: 'invited' }),
    AuditLog.find({}, { at: 1, actorId: 1, action: 1, entity: 1 }).sort({ at: -1 }).limit(6).lean(),
    AuditLog.aggregate<{ _id: string; count: number }>([
      { $match: week },
      {
        $group: {
          _id: { $dateToString: { date: '$at', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
          count: { $sum: 1 },
        },
      },
    ]),
    AuditLog.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: week },
      { $group: { _id: '$actorId', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 3 },
    ]),
  ]);
  const actors = await User.find(
    { _id: { $in: [...recent.map((a) => a.actorId), ...perActor.map((a) => a._id)] } },
    { name: 1 },
  ).lean();
  const names = new Map(actors.map((u) => [String(u._id), u.name]));
  const counts = new Map(perDay.map((d) => [d._id, d.count]));
  return {
    programs,
    courses,
    activeOfferings,
    users,
    invited,
    recent: recent.map((a) => ({
      id: String(a._id),
      at: a.at,
      actor: names.get(String(a.actorId)) ?? 'Unknown user',
      action: a.action,
      entity: a.entity,
    })),
    activity: days.map((day) => ({ day, count: counts.get(istDayKey(day)) ?? 0 })),
    mostActive: perActor.map((a) => ({
      id: String(a._id),
      name: names.get(String(a._id)) ?? 'Unknown user',
      count: a.count,
    })),
  };
}

export type Workspace = {
  id: string;
  title: string;
  status: Status;
  category: 'ugc' | 'skill';
  termName: string;
  courseTitle: string;
  faculty: string[];
  access: OfferingAccess;
  // Admin and the offering's own faculty change enrolment, the plan and the lessons; a head of department only looks.
  canTeach: boolean;
};

export const getWorkspace = cache(async (offeringId: string): Promise<Workspace> => {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  const offering = await Offering.findById(offeringId, {
    title: 1,
    status: 1,
    category: 1,
    termId: 1,
    courseId: 1,
    facultyIds: 1,
  }).lean();
  if (!offering) notFound();
  const [term, course, faculty] = await Promise.all([
    Term.findById(offering.termId, { name: 1 }).lean(),
    Course.findById(offering.courseId, { title: 1 }).lean(),
    User.find({ _id: { $in: offering.facultyIds } }, { name: 1 }).lean(),
  ]);
  return {
    id: String(offering._id),
    title: offering.title,
    status: offering.status,
    category: offering.category,
    termName: term?.name ?? '—',
    courseTitle: course?.title ?? '—',
    faculty: faculty.map((f) => f.name),
    access,
    canTeach: access === 'teach' || viewer.roles.includes('admin'),
  };
});

export type PlanRequestRow = { id: string; title: string };

// CRS-06, T10: the faculty home's "publish your plan" list, active offerings the viewer teaches without a plan.
export async function listPlanRequests(): Promise<PlanRequestRow[]> {
  const viewer = await requireViewer(['faculty']);
  await db();
  const docs = await Offering.find({ facultyIds: viewer.id, status: 'active', 'plan.publishedAt': null }, { title: 1 })
    .sort({ _id: -1 })
    .limit(6)
    .lean();
  return docs.map((doc) => ({ id: String(doc._id), title: doc.title }));
}

// `day` is the IST date (YYYY-MM-DD) for the date input; `past` lets the Overview mark the next session.
export type CalendarRow = { id: string; date: Date; day: string; topic: string; coIds: string[]; past: boolean };

export type CoursePlan = {
  offeringId: string;
  title: string;
  doc: RichTextDoc | null;
  calendar: CalendarRow[];
  cos: { id: string; code: string; statement: string }[];
  // Sessions in the catalogue course's session plan: the plan page offers to fill the calendar from them.
  sessionPlan: number;
  version: number;
  publishedAt: Date | null;
  students: number;
};

// The plan as saved. Students see it once a version is published (T7); the plan page is for those who teach.
async function readPlan(offeringId: string): Promise<CoursePlan> {
  await db();
  const offering = await Offering.findById(offeringId, { title: 1, courseId: 1, plan: 1, calendar: 1 }).lean();
  if (!offering) notFound();
  const today = istDayKey(new Date());
  const [course, students] = await Promise.all([
    Course.findById(offering.courseId, { cos: 1, sessionPlan: 1 }).lean(),
    Enrollment.countDocuments({ offeringId, status: 'active' }),
  ]);
  return {
    offeringId,
    title: offering.title,
    doc: offering.plan.doc ? RichTextDoc.parse(offering.plan.doc) : null,
    calendar: offering.calendar.map((row) => ({
      id: String(row._id),
      date: row.date,
      topic: row.topic,
      coIds: row.coIds.map(String),
      day: istDayKey(row.date),
      past: istDayKey(row.date) < today,
    })),
    cos: course?.cos.map((co) => ({ id: String(co._id), code: co.code, statement: co.statement })) ?? [],
    sessionPlan: course?.sessionPlan.length ?? 0,
    version: offering.plan.version,
    publishedAt: offering.plan.publishedAt ?? null,
    students,
  };
}

export async function getPlanEditor(offeringId: string): Promise<CoursePlan> {
  const viewer = await requireViewer(['admin', 'faculty']);
  await requireTeach(viewer, offeringId);
  return readPlan(offeringId);
}

// Overview: everyone with access sees the plan and calendar once a version has been published.
export async function getPublishedPlan(offeringId: string): Promise<CoursePlan | null> {
  const viewer = await requireViewer();
  await offeringAccess(viewer, offeringId);
  const plan = await readPlan(offeringId);
  return plan.publishedAt ? plan : null;
}

export type SetupStep = { done: boolean; detail: string };
// The first step, the catalogue course itself, comes from its readiness checklist (getOfferingCourse).
export type CourseSetup = {
  plan: SetupStep;
  calendar: SetupStep;
  published: SetupStep;
  content: SetupStep;
};

// The teacher's checklist on Overview: what students need before and while the course runs, in order.
export async function getCourseSetup(offeringId: string): Promise<CourseSetup | null> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) === 'learn') return null;
  await db();
  const offering = await Offering.findById(offeringId, { plan: 1, 'calendar._id': 1 }).lean();
  if (!offering) notFound();
  const [lessons, published] = await Promise.all([
    Lesson.countDocuments({ offeringId }),
    Lesson.countDocuments({ offeringId, published: true }),
  ]);
  const sessions = offering.calendar.length;
  return {
    plan: { done: Boolean(offering.plan.doc), detail: offering.plan.doc ? 'Written' : 'Not written yet' },
    calendar: {
      done: sessions > 0,
      detail: sessions === 0 ? 'No sessions yet' : `${sessions} session${sessions === 1 ? '' : 's'}`,
    },
    published: {
      done: Boolean(offering.plan.publishedAt),
      detail: offering.plan.publishedAt
        ? `Version ${offering.plan.version}, ${formatDate(offering.plan.publishedAt)}`
        : 'Students have not received it',
    },
    content: {
      done: published > 0,
      detail:
        lessons === 0 ? 'No lessons yet' : `${published} of ${lessons} lesson${lessons === 1 ? '' : 's'} published`,
    },
  };
}

export type RosterRow = {
  id: string;
  rollNo: string;
  name: string;
  email: string;
  status: 'active' | 'dropped';
  // Skill offerings only (SKL-02, T9); null for UGC offerings.
  skill: { completed: number; attendancePct: number | null; watchedMin: number; lastActiveAt: Date | null } | null;
};

export async function listRoster(
  offeringId: string,
  page: number,
): Promise<{ rows: RosterRow[]; total: number; publishedLessons: number | null }> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) === 'learn') notFound();
  await db();
  const offering = await Offering.findById(offeringId, { category: 1 }).lean();
  if (!offering) notFound();
  const [docs, total] = await Promise.all([
    Enrollment.find({ offeringId }, { studentId: 1, status: 1 })
      .sort({ studentId: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Enrollment.countDocuments({ offeringId }),
  ]);
  const studentIds = docs.map((e) => e.studentId);
  const students = await User.find({ _id: { $in: studentIds } }, { name: 1, email: 1, rollNo: 1 }).lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  // T9: per student on this page, completed published lessons, watched time and last activity (one $group).
  const skill = offering.category === 'skill';
  const publishedIds = skill ? await Lesson.distinct('_id', { offeringId, published: true }) : [];
  const stats = skill
    ? await LessonProgress.aggregate<{
        _id: Types.ObjectId;
        completed: number;
        watchedSec: number;
        lastActiveAt: Date | null;
      }>([
        { $match: { offeringId: new Types.ObjectId(offeringId), studentId: { $in: studentIds } } },
        {
          $group: {
            _id: '$studentId',
            completed: {
              $sum: {
                $cond: [{ $and: [{ $gt: ['$completedAt', null] }, { $in: ['$lessonId', publishedIds] }] }, 1, 0],
              },
            },
            watchedSec: { $sum: '$watchedSec' },
            lastActiveAt: { $max: '$updatedAt' },
          },
        },
      ])
    : [];
  const statsById = new Map(stats.map((row) => [String(row._id), row]));
  return {
    rows: docs.map((e) => {
      const student = byId.get(String(e.studentId));
      const stat = statsById.get(String(e.studentId));
      return {
        id: String(e._id),
        rollNo: student?.rollNo ?? '—',
        name: student?.name ?? '—',
        email: student?.email ?? '—',
        status: e.status,
        skill: skill
          ? {
              completed: stat?.completed ?? 0,
              attendancePct: attendancePct(stat?.completed ?? 0, publishedIds.length),
              watchedMin: Math.round((stat?.watchedSec ?? 0) / 60),
              lastActiveAt: stat?.lastActiveAt ?? null,
            }
          : null,
      };
    }),
    total,
    publishedLessons: skill ? publishedIds.length : null,
  };
}
