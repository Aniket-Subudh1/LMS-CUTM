import { Types, type AnyKeys } from 'mongoose';
import { Assessment, type AssessmentDoc } from '@/lib/models/assessment';
import { Course, type CourseDoc } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering, type OfferingDoc } from '@/lib/models/offering';
import { Program, type ProgramDoc } from '@/lib/models/program';
import { User, type UserDoc } from '@/lib/models/user';
import { signIn, type Viewer } from '@/lib/auth/session';
import { switchBrowser } from './next-request';

let counter = 0;
const next = () => ++counter;
export const newId = () => new Types.ObjectId();

export async function makeUser(over: Partial<UserDoc> = {}) {
  const i = next();
  return User.create({ name: `User ${i}`, email: `user${i}@cutm.test`, roles: ['student'], status: 'active', ...over });
}

export function viewerOf(user: {
  _id: Types.ObjectId;
  name: string;
  email: string;
  roles: Viewer['roles'];
  departmentId?: Types.ObjectId | null;
}): Viewer {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    roles: user.roles,
    departmentId: user.departmentId ? String(user.departmentId) : null,
  };
}

// A credit course (3-0-1) unless the test says otherwise; codes are unique per test file.
export async function makeCourse(over: AnyKeys<CourseDoc> = {}) {
  const i = next();
  return Course.create({
    code: `TEST${String(i).padStart(4, '0')}`,
    title: `Course ${i}`,
    credits: { theory: 3, practice: 0, project: 1 },
    status: 'active',
    ...over,
  });
}

export async function makeProgram(over: AnyKeys<ProgramDoc> = {}) {
  const i = next();
  return Program.create({
    code: `PRG${i}`,
    name: `Programme ${i}`,
    departmentId: newId(),
    durationSemesters: 8,
    ...over,
  });
}

// An offering with throwaway references; tests that need real structure create it themselves.
export async function makeOffering(over: Partial<OfferingDoc> = {}) {
  return Offering.create({
    courseId: newId(),
    termId: newId(),
    batchId: newId(),
    programId: newId(),
    departmentId: newId(),
    category: 'ugc',
    credits: { theory: 3, practice: 0, project: 0 },
    title: `Offering ${next()}`,
    facultyIds: [newId()],
    status: 'active',
    ...over,
  });
}

// A published quiz open for the hour around now, with no questions unless the test gives them.
export async function makeAssessment(over: AnyKeys<AssessmentDoc> = {}) {
  const now = Date.now();
  return Assessment.create({
    offeringId: newId(),
    mode: 'quiz',
    title: `Assessment ${next()}`,
    opensAt: new Date(now - 3_600_000),
    closesAt: new Date(now + 3_600_000),
    status: 'published',
    createdBy: newId(),
    ...over,
  });
}

export function enroll(offeringId: Types.ObjectId, studentId: Types.ObjectId, status: 'active' | 'dropped' = 'active') {
  return Enrollment.create({ offeringId, studentId, status });
}

// Signs the user in on a fresh browser, so the next action call runs as them.
export async function signInAs(user: { _id: Types.ObjectId; sessionVersion: number }): Promise<void> {
  switchBrowser(new Map());
  await signIn({ id: String(user._id), sessionVersion: user.sessionVersion });
}

export function form(fields: Record<string, string | string[] | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}
