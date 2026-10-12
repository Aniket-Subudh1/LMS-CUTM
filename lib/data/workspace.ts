import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { offeringAccess, type OfferingAccess } from '@/lib/auth/access';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { pageSize, ROLES } from '@/lib/schemas/common';
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
    departments: number;
    programs: number;
    courses: number;
    activeOfferings: number;
    users: number;
    invited: number;
    recent: { id: string; at: Date; actor: string; action: string; entity: string }[];
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

async function adminSummary(): Promise<NonNullable<HomeSummary['admin']>> {
  const [departments, programs, courses, activeOfferings, users, invited, recent] = await Promise.all([
    Department.countDocuments({ status: 'active' }),
    Program.countDocuments({ status: 'active' }),
    Course.estimatedDocumentCount(),
    Offering.countDocuments({ status: 'active' }),
    User.estimatedDocumentCount(),
    // Every user has a role, so matching all of them lets the { roles, status } index serve a count by status.
    User.countDocuments({ roles: { $in: ROLES }, status: 'invited' }),
    AuditLog.find({}, { at: 1, actorId: 1, action: 1, entity: 1 }).sort({ at: -1 }).limit(6).lean(),
  ]);
  const actors = await User.find({ _id: { $in: recent.map((a) => a.actorId) } }, { name: 1 }).lean();
  const names = new Map(actors.map((u) => [String(u._id), u.name]));
  return {
    departments,
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
  };
}

export type Workspace = {
  id: string;
  title: string;
  status: Status;
  termName: string;
  courseTitle: string;
  faculty: string[];
  access: OfferingAccess;
  // Admin and the offering's own faculty may change enrolment; a head of department only looks.
  canChangeEnrollments: boolean;
};

export const getWorkspace = cache(async (offeringId: string): Promise<Workspace> => {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  const offering = await Offering.findById(offeringId, {
    title: 1,
    status: 1,
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
    termName: term?.name ?? '—',
    courseTitle: course?.title ?? '—',
    faculty: faculty.map((f) => f.name),
    access,
    canChangeEnrollments: access === 'teach' || viewer.roles.includes('admin'),
  };
});

export type RosterRow = {
  id: string;
  rollNo: string;
  name: string;
  email: string;
  status: 'active' | 'dropped';
};

export async function listRoster(offeringId: string, page: number): Promise<{ rows: RosterRow[]; total: number }> {
  const viewer = await requireViewer();
  if ((await offeringAccess(viewer, offeringId)) === 'learn') notFound();
  const [docs, total] = await Promise.all([
    Enrollment.find({ offeringId }, { studentId: 1, status: 1 })
      .sort({ studentId: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Enrollment.countDocuments({ offeringId }),
  ]);
  const students = await User.find(
    { _id: { $in: docs.map((e) => e.studentId) } },
    { name: 1, email: 1, rollNo: 1 },
  ).lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));
  return {
    rows: docs.map((e) => {
      const student = byId.get(String(e.studentId));
      return {
        id: String(e._id),
        rollNo: student?.rollNo ?? '—',
        name: student?.name ?? '—',
        email: student?.email ?? '—',
        status: e.status,
      };
    }),
    total,
  };
}
