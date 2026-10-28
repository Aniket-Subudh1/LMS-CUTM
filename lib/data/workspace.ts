import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { offeringAccess, type OfferingAccess } from '@/lib/auth/access';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { escapeRegex } from '@/lib/data/courses';
import { readSnapshot, type EngagementSnapshot } from '@/lib/data/engagement';
import { getSettings } from '@/lib/data/settings';
import { countedScore } from '@/lib/domain/attempts';
import { attendancePct, shortOfAttendance } from '@/lib/domain/attendance';
import { quizAveragePct } from '@/lib/domain/grading';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import { formatDate } from '@/lib/format';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Submission } from '@/lib/models/submission';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { ASSESSMENT_LIMITS } from '@/lib/schemas/assessment';
import type { EngagementBand, EngagementTrend } from '@/lib/schemas/engagement';
import { pageSize, RichTextDoc, ROLES } from '@/lib/schemas/common';
import { SETTINGS } from '@/lib/schemas/settings';
import {
  MAX_ENROLLMENTS,
  type COURSE_TYPES,
  type OFFERING_STATUSES,
  type SESSION_KINDS,
} from '@/lib/schemas/structure';

type Status = (typeof OFFERING_STATUSES)[number];
type CourseType = (typeof COURSE_TYPES)[number];

export type MyOfferingRow = {
  id: string;
  // The offering's full title ("CUTM1602 · Programming in C · 2026-ODD · A"); the course card shows its parts.
  title: string;
  code: string;
  courseTitle: string;
  courseType: CourseType | null;
  credits: { theory: number; practice: number; project: number };
  section: string | null;
  units: number;
  coverKey: string | null;
  termCode: string;
  status: Status;
  faculty: string[];
  // A student sees their own progress through the published lessons; whoever teaches or oversees sees the class.
  view:
    | { as: 'learner'; completed: number; published: number; videoSec: number }
    | { as: 'teacher'; students: number; planPublished: boolean };
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
  filters: { q?: string; termId?: string; departmentId?: string },
): Promise<{ rows: MyOfferingRow[]; total: number }> {
  const viewer = await requireViewer(['admin', 'hod', 'faculty', 'student']);
  await db();
  const scope = await offeringScope(viewer);
  const q = filters.q?.trim();
  const filter = {
    ...scope,
    ...(q ? { $text: { $search: q } } : {}),
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  };
  const [docs, total] = await Promise.all([
    Offering.find(filter, {
      title: 1,
      courseId: 1,
      termId: 1,
      departmentId: 1,
      section: 1,
      credits: 1,
      modules: 1,
      status: 1,
      facultyIds: 1,
      coverKey: 1,
    })
      // A word search lists the closest matches first (text score); otherwise the usual order.
      .sort('$text' in filter ? { score: { $meta: 'textScore' }, _id: -1 } : { _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Offering.countDocuments(filter),
  ]);
  // The same rule as offeringAccess: an offering the viewer neither oversees nor teaches is one they are enrolled in.
  const learns = (o: (typeof docs)[number]) =>
    !viewer.roles.includes('admin') &&
    !o.facultyIds.some((id) => id.equals(viewer.id)) &&
    !(viewer.roles.includes('hod') && viewer.departmentId !== null && o.departmentId.equals(viewer.departmentId));
  const learnIds = docs.filter(learns).map((o) => o._id);
  const teachIds = docs.filter((o) => !learns(o)).map((o) => o._id);
  const [terms, faculty, courses, students, planned, lessons, completed] = await Promise.all([
    Term.find({ _id: { $in: docs.map((o) => o.termId) } }, { code: 1 }).lean(),
    User.find({ _id: { $in: docs.flatMap((o) => o.facultyIds) } }, { name: 1 }).lean(),
    Course.find({ _id: { $in: docs.map((o) => o.courseId) } }, { code: 1, title: 1, type: 1 }).lean(),
    Enrollment.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { offeringId: { $in: teachIds }, status: 'active' } },
      { $group: { _id: '$offeringId', count: { $sum: 1 } } },
    ]),
    Offering.distinct('_id', { _id: { $in: teachIds }, 'plan.publishedAt': { $ne: null } }),
    Lesson.aggregate<{ _id: Types.ObjectId; count: number; videoSec: number }>([
      { $match: { offeringId: { $in: learnIds }, published: true } },
      { $group: { _id: '$offeringId', count: { $sum: 1 }, videoSec: { $sum: '$durationSec' } } },
    ]),
    // As in getContent, a completed lesson counts only while it is published, so the card agrees with the Overview.
    LessonProgress.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          offeringId: { $in: learnIds },
          studentId: new Types.ObjectId(viewer.id),
          completedAt: { $ne: null },
        },
      },
      {
        $lookup: {
          from: Lesson.collection.name,
          localField: 'lessonId',
          foreignField: '_id',
          pipeline: [{ $match: { published: true } }, { $project: { _id: 1 } }],
          as: 'lesson',
        },
      },
      { $match: { lesson: { $ne: [] } } },
      { $group: { _id: '$offeringId', count: { $sum: 1 } } },
    ]),
  ]);
  const termCodes = new Map(terms.map((t) => [String(t._id), t.code]));
  const names = new Map(faculty.map((f) => [String(f._id), f.name]));
  const courseOf = new Map(courses.map((c) => [String(c._id), c]));
  const studentsOf = new Map(students.map((e) => [String(e._id), e.count]));
  const planPublished = new Set(planned.map(String));
  const lessonsOf = new Map(lessons.map((l) => [String(l._id), l]));
  const completedOf = new Map(completed.map((p) => [String(p._id), p.count]));
  return {
    rows: docs.map((o): MyOfferingRow => {
      const id = String(o._id);
      const course = courseOf.get(String(o.courseId));
      const published = lessonsOf.get(id);
      return {
        id,
        title: o.title,
        code: course?.code ?? '',
        courseTitle: course?.title ?? o.title,
        courseType: course?.type ?? null,
        credits: { theory: o.credits.theory, practice: o.credits.practice, project: o.credits.project },
        section: o.section ?? null,
        units: o.modules.length,
        coverKey: o.coverKey ?? null,
        termCode: termCodes.get(String(o.termId)) ?? '—',
        status: o.status,
        faculty: o.facultyIds.flatMap((fid) => names.get(String(fid)) ?? []),
        view: learns(o)
          ? {
              as: 'learner',
              completed: completedOf.get(id) ?? 0,
              published: published?.count ?? 0,
              videoSec: published?.videoSec ?? 0,
            }
          : { as: 'teacher', students: studentsOf.get(id) ?? 0, planPublished: planPublished.has(id) },
      };
    }),
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
  code: string;
  courseTitle: string;
  section: string | null;
  credits: { theory: number; practice: number; project: number };
  coverKey: string | null;
  // The offering's teachers; `coordinator` marks the one who keeps the catalogue course (the People tab's staff card).
  faculty: { id: string; name: string; email: string; coordinator: boolean }[];
  access: OfferingAccess;
  // Admin and the offering's own faculty change enrolment, the plan and the lessons; a head of department only looks.
  canTeach: boolean;
  // The header's chips: a student counts only published lessons (M03b).
  stats: { modules: number; lessons: number; videoSec: number; students: number };
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
    section: 1,
    credits: 1,
    coverKey: 1,
    'modules._id': 1,
  }).lean();
  if (!offering) notFound();
  const [term, course, faculty, lessons, students] = await Promise.all([
    Term.findById(offering.termId, { name: 1 }).lean(),
    Course.findById(offering.courseId, { code: 1, title: 1, coordinatorId: 1 }).lean(),
    User.find({ _id: { $in: offering.facultyIds } }, { name: 1, email: 1 }).lean(),
    Lesson.aggregate<{ count: number; videoSec: number }>([
      { $match: { offeringId: offering._id, ...(access === 'learn' ? { published: true } : {}) } },
      { $group: { _id: null, count: { $sum: 1 }, videoSec: { $sum: '$durationSec' } } },
    ]),
    Enrollment.countDocuments({ offeringId, status: 'active' }),
  ]);
  return {
    id: String(offering._id),
    title: offering.title,
    status: offering.status,
    category: offering.category,
    termName: term?.name ?? '—',
    code: course?.code ?? '',
    courseTitle: course?.title ?? offering.title,
    section: offering.section ?? null,
    credits: {
      theory: offering.credits.theory,
      practice: offering.credits.practice,
      project: offering.credits.project,
    },
    coverKey: offering.coverKey ?? null,
    faculty: faculty.map((f) => ({
      id: String(f._id),
      name: f.name,
      email: f.email,
      coordinator: Boolean(course?.coordinatorId?.equals(f._id)),
    })),
    access,
    canTeach: access === 'teach' || viewer.roles.includes('admin'),
    stats: {
      modules: offering.modules.length,
      lessons: lessons[0]?.count ?? 0,
      videoSec: lessons[0]?.videoSec ?? 0,
      students,
    },
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
export type CalendarRow = {
  id: string;
  date: Date;
  day: string;
  topic: string;
  coIds: string[];
  kind: (typeof SESSION_KINDS)[number] | null;
  past: boolean;
};

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
  changedAt: Date | null;
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
      kind: row.kind ?? null,
      day: istDayKey(row.date),
      past: istDayKey(row.date) < today,
    })),
    cos: course?.cos.map((co) => ({ id: String(co._id), code: co.code, statement: co.statement })) ?? [],
    sessionPlan: course?.sessionPlan.length ?? 0,
    version: offering.plan.version,
    publishedAt: offering.plan.publishedAt ?? null,
    changedAt: offering.plan.changedAt ?? null,
    students,
  };
}

// The Course plan tab for every role (M03b): teachers and admins edit it; a head of department reads it as saved;
// a student reads it once a version is published (null before).
export async function getPlanView(offeringId: string): Promise<{ plan: CoursePlan | null; canTeach: boolean }> {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  const plan = await readPlan(offeringId);
  if (access === 'learn' && !plan.publishedAt) return { plan: null, canTeach: false };
  return { plan, canTeach: access === 'teach' || viewer.roles.includes('admin') };
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
  skill: {
    completed: number;
    attendancePct: number | null;
    watchedMin: number;
    lastActiveAt: Date | null;
    // SKL-02 (M04 T9): distinct quizzes with an attempt, and the average of the published ones (07 §14).
    quizzesAttempted: number;
    quizAvgPct: number | null;
  } | null;
  // Credit offerings only (ATT-02, M03 T9): finished live classes the student attended; null for skill offerings.
  live: { attended: number; held: number; pct: number | null } | null;
  // M10 T4 (ENG-02): the nightly snapshot (null before the first), and the last IST day with any activity.
  studentId: string;
  engagement: EngagementSnapshot | null;
  lastActiveDay: string | null;
};

export type RosterFilter = {
  q?: string;
  status?: 'active' | 'dropped';
  band?: EngagementBand;
  trend?: EngagementTrend;
  // Roll number (the default) or the lowest engagement score first.
  sort?: 'engagement';
};

export type Roster = {
  rows: RosterRow[];
  // Students matching the filter.
  total: number;
  // The whole class, whatever the filter: the People tab's number tiles. `short` counts active students under the
  // minimum attendance (credit offerings; null for skill ones).
  counts: { enrolled: number; active: number; dropped: number; short: number | null; lowEngagement: number };
  minPct: number | null;
  publishedLessons: number | null;
  // When the snapshot was last worked out (null before the first), and the days it looks at.
  engagementAt: Date | null;
  engagementDays: number;
};

// M03b T7: the roster by roll number, searched by roll number or email (from the start) or name (anywhere), and
// filtered by status. An offering holds at most MAX_ENROLLMENTS enrolments (A-83), so its students are read whole and
// the search runs on that bounded set (users by _id); the page then reads only its own rows' lesson progress.
export async function listRoster(offeringId: string, page: number, filter: RosterFilter = {}): Promise<Roster> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) === 'learn') notFound();
  await db();
  const offering = await Offering.findById(offeringId, { category: 1, evaluation: 1 }).lean();
  if (!offering) notFound();
  const skill = offering.category === 'skill';
  const enrolments = await Enrollment.find({ offeringId }, { studentId: 1, status: 1, engagement: 1 })
    .limit(MAX_ENROLLMENTS)
    .lean();
  const shown = enrolments.filter(
    (e) =>
      (!filter.status || e.status === filter.status) &&
      (!filter.band || e.engagement?.band === filter.band) &&
      (!filter.trend || e.engagement?.trend === filter.trend),
  );
  const enrolmentOf = new Map(shown.map((e) => [String(e.studentId), e]));
  const q = filter.q?.trim();
  const userFilter = {
    _id: { $in: shown.map((e) => e.studentId) },
    ...(q
      ? {
          $or: [
            { rollNo: { $regex: `^${escapeRegex(q)}`, $options: 'i' } },
            { email: { $regex: `^${escapeRegex(q)}`, $options: 'i' } },
            { name: { $regex: escapeRegex(q), $options: 'i' } },
          ],
        }
      : {}),
  };
  const projection = { name: 1, email: 1, rollNo: 1 };
  const [students, total] =
    filter.sort === 'engagement'
      ? // M10 T4: the lowest score first, those without one last; the matching students are a bounded set (A-83).
        await User.find(userFilter, { rollNo: 1 })
          .sort({ rollNo: 1, _id: 1 })
          .lean()
          .then(async (matching) => {
            // Scores run 0–100, so 101 sorts after every one.
            const scoreOf = (id: Types.ObjectId) => enrolmentOf.get(String(id))?.engagement?.score ?? 101;
            const ids = matching
              .map((u) => u._id)
              .sort((a, b) => scoreOf(a) - scoreOf(b))
              .slice((page - 1) * pageSize, page * pageSize);
            const docs = new Map(
              (await User.find({ _id: { $in: ids } }, projection).lean()).map((u) => [String(u._id), u]),
            );
            return [ids.flatMap((id) => docs.get(String(id)) ?? []), matching.length] as const;
          })
      : await Promise.all([
          User.find(userFilter, projection)
            .sort({ rollNo: 1, _id: 1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean(),
          User.countDocuments(userFilter),
        ]);
  const studentIds = students.map((s) => s._id);
  const lastActive = await EngagementDaily.aggregate<{ _id: Types.ObjectId; day: string }>([
    { $match: { offeringId: new Types.ObjectId(offeringId), studentId: { $in: studentIds } } },
    { $group: { _id: '$studentId', day: { $max: '$day' } } },
  ]);
  const lastActiveOf = new Map(lastActive.map((row) => [String(row._id), row.day]));

  // T9: per student on this page, completed published lessons, watched time and last activity (one $group).
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
  // M04 T9: the class's quizzes (at most 200, A-102) and this page's attempts at them.
  const quizzes = skill
    ? await Assessment.find(
        { offeringId, mode: 'quiz', status: { $ne: 'draft' } },
        { status: 1, maxMarks: 1, attemptPolicy: 1 },
      )
        .limit(ASSESSMENT_LIMITS.perOffering)
        .lean()
    : [];
  const quizAttempts =
    quizzes.length > 0
      ? await Submission.find(
          { assessmentId: { $in: quizzes.map((q) => q._id) }, studentId: { $in: studentIds } },
          { assessmentId: 1, studentId: 1, attemptNo: 1, status: 1, total: 1 },
        ).lean()
      : [];
  const quizStats = (studentId: string) => {
    const mine = quizAttempts.filter((a) => String(a.studentId) === studentId);
    return {
      quizzesAttempted: new Set(mine.map((a) => String(a.assessmentId))).size,
      quizAvgPct: quizAveragePct(
        quizzes
          .filter((q) => q.status === 'results_published')
          .map((q) => ({
            counted: countedScore(
              mine.filter((a) => a.assessmentId.equals(q._id)),
              q.attemptPolicy,
            ),
            maxMarks: q.maxMarks,
          })),
      ),
    };
  };
  // M03 T9: each student's finished classes (a row has a status once its class is finalized or marked, A-72), for the
  // whole class at once: the page's rows and the "below the minimum" tile (index offeringId, studentId).
  const live = skill
    ? []
    : await Attendance.aggregate<{ _id: Types.ObjectId; attended: number; held: number }>([
        { $match: { offeringId: new Types.ObjectId(offeringId), status: { $in: ['present', 'absent'] } } },
        {
          $group: {
            _id: '$studentId',
            attended: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            held: { $sum: 1 },
          },
        },
      ]);
  const liveById = new Map(live.map((row) => [String(row._id), row]));
  // The offering's own copy of the evaluation policy decides (05 §3.8); one made before it had the field uses today's.
  const policy = SETTINGS.evaluation.schema.safeParse(offering.evaluation);
  const minPct = skill
    ? null
    : policy.success
      ? policy.data.attendanceMinPct
      : (await getSettings('evaluation')).attendanceMinPct;
  const active = enrolments.filter((e) => e.status === 'active');
  return {
    rows: students.flatMap((student) => {
      const enrolment = enrolmentOf.get(String(student._id));
      if (!enrolment) return [];
      const stat = statsById.get(String(student._id));
      const { attended = 0, held = 0 } = liveById.get(String(student._id)) ?? {};
      return [
        {
          id: String(enrolment._id),
          rollNo: student.rollNo ?? '—',
          name: student.name,
          email: student.email,
          status: enrolment.status,
          skill: skill
            ? {
                completed: stat?.completed ?? 0,
                attendancePct: attendancePct(stat?.completed ?? 0, publishedIds.length),
                watchedMin: Math.round((stat?.watchedSec ?? 0) / 60),
                lastActiveAt: stat?.lastActiveAt ?? null,
                ...quizStats(String(student._id)),
              }
            : null,
          live: skill ? null : { attended, held, pct: attendancePct(attended, held) },
          studentId: String(student._id),
          engagement: readSnapshot(enrolment.engagement),
          lastActiveDay: lastActiveOf.get(String(student._id)) ?? null,
        },
      ];
    }),
    total,
    engagementAt: enrolments.reduce<Date | null>(
      (latest, e) => (e.engagement && (!latest || e.engagement.computedAt > latest) ? e.engagement.computedAt : latest),
      null,
    ),
    engagementDays: (await getSettings('engagement')).windowDays,
    counts: {
      enrolled: enrolments.length,
      active: active.length,
      dropped: enrolments.length - active.length,
      lowEngagement: active.filter((e) => e.engagement?.band === 'low').length,
      short:
        minPct === null
          ? null
          : active.filter((e) => {
              const row = liveById.get(String(e.studentId));
              return row !== undefined && shortOfAttendance(row.attended, row.held, minPct);
            }).length,
    },
    minPct,
    publishedLessons: skill ? publishedIds.length : null,
  };
}

export type NextUp = {
  live: { id: string; title: string; start: Date; end: Date; status: 'scheduled' | 'live' } | null;
  // The next course-plan session on or after today; a student sees it once the plan is published.
  session: { date: Date; topic: string; cos: string[] } | null;
};

// The Overview's "Up next" (M03b): one indexed read of the next class, and the calendar, stored in date order.
export async function getNextUp(offeringId: string): Promise<NextUp> {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  await db();
  const now = new Date();
  const today = istDateToDate(istDayKey(now));
  const [live, offering, published] = await Promise.all([
    LiveSession.findOne(
      { offeringId, status: { $in: ['scheduled', 'live'] }, scheduledEnd: { $gte: now } },
      { title: 1, scheduledStart: 1, scheduledEnd: 1, status: 1 },
    )
      .sort({ scheduledStart: 1 })
      .lean(),
    Offering.findById(offeringId, { calendar: 1, courseId: 1 }).lean(),
    access === 'learn' ? Offering.exists({ _id: offeringId, 'plan.publishedAt': { $ne: null } }) : true,
  ]);
  const row = published ? offering?.calendar.find((r) => r.date >= today) : undefined;
  const course = row?.coIds.length
    ? await Course.findById(offering?.courseId, { 'cos._id': 1, 'cos.code': 1 }).lean()
    : null;
  const codes = new Map(course?.cos.map((co) => [String(co._id), co.code]));
  return {
    live:
      live && (live.status === 'scheduled' || live.status === 'live')
        ? {
            id: String(live._id),
            title: live.title,
            start: live.scheduledStart,
            end: live.scheduledEnd,
            status: live.status,
          }
        : null,
    session: row
      ? { date: row.date, topic: row.topic, cos: row.coIds.flatMap((id) => codes.get(String(id)) ?? []) }
      : null,
  };
}

export type ClassProgress = {
  students: number;
  published: number;
  // Students by share of the published lessons finished: under 25%, 25–50%, 50–75%, 75% and more.
  buckets: [number, number, number, number];
  averagePct: number;
  notStarted: number;
  // Present over marked, across the finalized live classes; null before the first one.
  attendancePct: number | null;
};

// "How the class is doing" on a teacher's Overview (M03b). Bounded by the offering's students (02 §11) and lessons.
export async function getClassProgress(offeringId: string): Promise<ClassProgress | null> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) === 'learn') return null;
  await db();
  const [enrolled, publishedIds, attendance] = await Promise.all([
    Enrollment.distinct('studentId', { offeringId, status: 'active' }),
    Lesson.distinct('_id', { offeringId, published: true }),
    Attendance.aggregate<{ present: number; total: number }>([
      { $match: { offeringId: new Types.ObjectId(offeringId), status: { $in: ['present', 'absent'] } } },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
    ]),
  ]);
  const done = publishedIds.length
    ? await LessonProgress.aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            offeringId: new Types.ObjectId(offeringId),
            lessonId: { $in: publishedIds },
            completedAt: { $ne: null },
          },
        },
        { $group: { _id: '$studentId', count: { $sum: 1 } } },
      ])
    : [];
  const doneOf = new Map(done.map((d) => [String(d._id), d.count]));
  const pcts = enrolled.map((id) =>
    publishedIds.length ? (100 * (doneOf.get(String(id)) ?? 0)) / publishedIds.length : 0,
  );
  const buckets: ClassProgress['buckets'] = [0, 0, 0, 0];
  for (const pct of pcts) buckets[Math.min(3, Math.floor(pct / 25))] += 1;
  return {
    students: enrolled.length,
    published: publishedIds.length,
    buckets,
    averagePct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0,
    notStarted: pcts.filter((pct) => pct === 0).length,
    attendancePct: attendance[0] ? attendancePct(attendance[0].present, attendance[0].total) : null,
  };
}
