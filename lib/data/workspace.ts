import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { offeringAccess, type OfferingAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';
import type { OFFERING_STATUSES } from '@/lib/schemas/structure';

type Status = (typeof OFFERING_STATUSES)[number];

export type MyOfferingRow = {
  id: string;
  title: string;
  termCode: string;
  status: Status;
  faculty: string[];
};

// Admin sees every offering; faculty theirs; a head of department their department's; a student the active or
// completed offerings they are enrolled in (09 §3). The same rules decide who may open a workspace.
export async function listMyOfferings(
  page: number,
  filters: { termId?: string; departmentId?: string },
): Promise<{ rows: MyOfferingRow[]; total: number }> {
  const viewer = await requireViewer(['admin', 'hod', 'faculty', 'student']);
  await db();
  const scope = viewer.roles.includes('admin')
    ? {}
    : {
        $or: [
          { facultyIds: viewer.id },
          ...(viewer.roles.includes('hod') && viewer.departmentId ? [{ departmentId: viewer.departmentId }] : []),
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
