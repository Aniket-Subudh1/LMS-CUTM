import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { User } from '@/lib/models/user';
import { pageSize, type Role } from '@/lib/schemas/common';

type Status = 'invited' | 'active' | 'disabled';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: Status;
  identifier: string | null;
};

// An address is looked up exactly; anything else goes through the text index (name, email, roll number).
export async function listUsers(
  page: number,
  filters: { q?: string; role?: Role; status?: Status },
): Promise<{ rows: UserRow[]; total: number }> {
  await requireViewer(['admin', 'support']);
  await db();
  const q = filters.q?.trim();
  const filter = {
    ...(q ? (q.includes('@') ? { email: q.toLowerCase() } : { $text: { $search: q } }) : {}),
    ...(filters.role ? { roles: filters.role } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [docs, total] = await Promise.all([
    User.find(filter, { name: 1, email: 1, roles: 1, status: 1, rollNo: 1, employeeId: 1 })
      .sort({ _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Object.keys(filter).length > 0 ? User.countDocuments(filter) : User.estimatedDocumentCount(),
  ]);
  return {
    rows: docs.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      roles: u.roles,
      status: u.status,
      identifier: u.rollNo ?? u.employeeId ?? null,
    })),
    total,
  };
}

export type UserDetail = UserRow & {
  rollNo: string | null;
  employeeId: string | null;
  department: string | null;
  program: string | null;
  batch: string | null;
  section: string | null;
  lastLoginAt: Date | null;
  enrollments: { offeringId: string; title: string; status: 'active' | 'dropped' }[];
};

export async function getUserDetail(id: string): Promise<UserDetail> {
  await requireViewer(['admin', 'support']);
  if (!isValidObjectId(id)) notFound();
  await db();
  const user = await User.findById(id).lean();
  if (!user) notFound();
  const [department, program, batch, enrollments] = await Promise.all([
    user.departmentId ? Department.findById(user.departmentId, { name: 1 }).lean() : null,
    user.programId ? Program.findById(user.programId, { code: 1, name: 1 }).lean() : null,
    user.batchId ? Batch.findById(user.batchId, { name: 1 }).lean() : null,
    user.roles.includes('student')
      ? Enrollment.find({ studentId: user._id }, { offeringId: 1, status: 1 }).sort({ _id: -1 }).limit(50).lean()
      : [],
  ]);
  const offerings = await Offering.find({ _id: { $in: enrollments.map((e) => e.offeringId) } }, { courseId: 1 }).lean();
  const courses = await Course.find({ _id: { $in: offerings.map((o) => o.courseId) } }, { code: 1, title: 1 }).lean();
  const titleOf = new Map(courses.map((c) => [String(c._id), `${c.code} · ${c.title}`]));
  const courseOf = new Map(offerings.map((o) => [String(o._id), String(o.courseId)]));
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    roles: user.roles,
    status: user.status,
    identifier: user.rollNo ?? user.employeeId ?? null,
    rollNo: user.rollNo ?? null,
    employeeId: user.employeeId ?? null,
    department: department?.name ?? null,
    program: program ? `${program.code} · ${program.name}` : null,
    batch: batch?.name ?? null,
    section: user.section ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    enrollments: enrollments.map((e) => ({
      offeringId: String(e.offeringId),
      title: titleOf.get(courseOf.get(String(e.offeringId)) ?? '') ?? '—',
      status: e.status,
    })),
  };
}

export type UserFormOptions = {
  departments: { id: string; label: string }[];
  batches: { id: string; label: string; sections: string[] }[];
};

export async function getUserFormOptions(): Promise<UserFormOptions> {
  await requireViewer(['admin']);
  await db();
  const [departments, batches] = await Promise.all([
    Department.find({}, { code: 1, name: 1 }).sort({ code: 1 }).limit(200).lean(),
    Batch.find({ status: 'active' }, { programId: 1, name: 1, sections: 1 }).sort({ startYear: -1 }).limit(300).lean(),
  ]);
  const programs = await Program.find({ _id: { $in: batches.map((b) => b.programId) } }, { code: 1 }).lean();
  const codeOf = new Map(programs.map((p) => [String(p._id), p.code]));
  return {
    departments: departments.map((d) => ({ id: String(d._id), label: `${d.code} · ${d.name}` })),
    batches: batches.map((b) => ({
      id: String(b._id),
      label: `${codeOf.get(String(b.programId)) ?? '—'} · ${b.name}`,
      sections: b.sections,
    })),
  };
}
