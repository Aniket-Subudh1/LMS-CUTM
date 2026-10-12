import { Types } from 'mongoose';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering, type OfferingDoc } from '@/lib/models/offering';
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

// An offering with throwaway references; tests that need real structure create it themselves.
export async function makeOffering(over: Partial<OfferingDoc> = {}) {
  return Offering.create({
    courseId: newId(),
    termId: newId(),
    batchId: newId(),
    programId: newId(),
    departmentId: newId(),
    category: 'ugc',
    title: `Offering ${next()}`,
    facultyIds: [newId()],
    status: 'active',
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
