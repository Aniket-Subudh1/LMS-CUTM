import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { isValidObjectId, Types } from 'mongoose';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { Assessment } from '@/lib/models/assessment';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { TestGrant } from '@/lib/models/test-grant';
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

export type AssessmentAccess = 'manage' | 'oversee' | 'take';

// M04b (TP-02): who may do what with an assessment. A course's assessment follows its offering: whoever teaches it and
// admins manage, a head of department oversees, an enrolled student takes it. A standalone test belongs to its owners
// and the admins, and is taken by those a share link let in (`testGrants`). Takers never see a draft.
export const assessmentAccess = cache(
  async (viewer: Viewer, assessmentId: string): Promise<{ access: AssessmentAccess; offeringId: string | null }> => {
    if (!isValidObjectId(assessmentId)) notFound();
    await db();
    const assessment = await Assessment.findById(assessmentId, { offeringId: 1, ownerIds: 1, status: 1 }).lean();
    if (!assessment) notFound();
    const offeringId = assessment.offeringId ? String(assessment.offeringId) : null;
    let access: AssessmentAccess;
    if (offeringId) {
      const via = await offeringAccess(viewer, offeringId);
      access = via === 'teach' || viewer.roles.includes('admin') ? 'manage' : via === 'oversee' ? 'oversee' : 'take';
    } else if (viewer.roles.includes('admin') || assessment.ownerIds.some((id) => id.equals(viewer.id))) {
      access = 'manage';
    } else if (await TestGrant.exists({ assessmentId, userId: viewer.id })) {
      access = 'take';
    } else {
      notFound();
    }
    if (access === 'take' && assessment.status === 'draft') notFound();
    return { access, offeringId };
  },
);

export async function requireManage(viewer: Viewer, assessmentId: string) {
  const found = await assessmentAccess(viewer, assessmentId);
  if (found.access !== 'manage') notFound();
  return found;
}

// M04b (TP-05): a question bank. Through an offering it is the course's bank, shared by every offering of the course:
// whoever teaches the offering and admins change it, a head of department reads it. Without one it is the viewer's
// own bank (faculty and admins), for their standalone tests.
export type BankAccess = {
  filter: { courseId: Types.ObjectId } | { ownerId: Types.ObjectId };
  courseId: string | null;
  canEdit: boolean;
};

export async function bankAccess(viewer: Viewer, offeringId: string | undefined): Promise<BankAccess> {
  if (!offeringId) {
    if (!viewer.roles.some((r) => r === 'faculty' || r === 'admin')) notFound();
    return { filter: { ownerId: new Types.ObjectId(viewer.id) }, courseId: null, canEdit: true };
  }
  const access = await offeringAccess(viewer, offeringId);
  if (access === 'learn') notFound();
  const offering = await Offering.findById(offeringId, { courseId: 1 }).lean();
  if (!offering) notFound();
  return {
    filter: { courseId: offering.courseId },
    courseId: String(offering.courseId),
    canEdit: access === 'teach' || viewer.roles.includes('admin'),
  };
}

export async function requireBankEditor(viewer: Viewer, offeringId: string | undefined): Promise<BankAccess> {
  const bank = await bankAccess(viewer, offeringId);
  if (!bank.canEdit) throw new AppError('FORBIDDEN', 'Only the course’s teachers change its question bank.');
  return bank;
}
