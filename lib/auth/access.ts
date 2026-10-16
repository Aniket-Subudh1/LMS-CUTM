import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import type { Viewer } from '@/lib/auth/session';

export type OfferingAccess = 'teach' | 'learn' | 'oversee';

export const offeringAccess = cache(async (viewer: Viewer, offeringId: string): Promise<OfferingAccess> => {
  if (!isValidObjectId(offeringId)) notFound();
  await db();
  const offering = await Offering.findById(offeringId, { facultyIds: 1, departmentId: 1, status: 1 }).lean();
  if (!offering) notFound();
  if (viewer.roles.includes('admin')) return 'oversee';
  if (offering.facultyIds.some((id) => id.equals(viewer.id))) return 'teach';
  if (
    viewer.roles.includes('hod') &&
    viewer.departmentId !== null &&
    offering.departmentId.equals(viewer.departmentId)
  ) {
    return 'oversee';
  }
  // 09 §3: students see only active or completed offerings, though they are enrolled while it is still a draft.
  if (
    offering.status !== 'draft' &&
    (await Enrollment.exists({ offeringId, studentId: viewer.id, status: 'active' }))
  ) {
    return 'learn';
  }
  notFound();
});

export async function requireTeach(viewer: Viewer, offeringId: string): Promise<void> {
  const access = await offeringAccess(viewer, offeringId);
  if (access === 'learn' || (access === 'oversee' && !viewer.roles.includes('admin'))) notFound();
}

// CRS-07: a catalogue course's content is kept by the admins and by the faculty member who coordinates it.
export async function canEditCourse(viewer: Viewer, courseId: string): Promise<boolean> {
  if (viewer.roles.includes('admin')) return true;
  if (!viewer.roles.includes('faculty') || !isValidObjectId(courseId)) return false;
  await db();
  return Boolean(await Course.exists({ _id: courseId, coordinatorId: viewer.id }));
}

export async function requireCourseEditor(viewer: Viewer, courseId: string): Promise<void> {
  if (!(await canEditCourse(viewer, courseId))) {
    throw new AppError('FORBIDDEN', 'Only the course coordinator and the administrators can change this course.');
  }
}
