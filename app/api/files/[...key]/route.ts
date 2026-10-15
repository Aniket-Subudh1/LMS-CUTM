import type { Types } from 'mongoose';
import { getViewer, type Viewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { parseKey } from '@/lib/domain/uploads';
import { presignDownload } from '@/lib/integrations/storage';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { Offering } from '@/lib/models/offering';

const missing = () => new Response(null, { status: 404 });

// The offeringAccess rules (02 §7) for "some offering matching `filter`": staff who teach or oversee it, or a student
// enrolled in it once it is no longer a draft. Route handlers answer 404 themselves instead of calling notFound().
async function reach(viewer: Viewer, filter: { _id: string } | { courseId: Types.ObjectId | string }) {
  if (viewer.roles.includes('admin')) return 'staff';
  const staff = [
    { facultyIds: viewer.id },
    ...(viewer.roles.includes('hod') && viewer.departmentId ? [{ departmentId: viewer.departmentId }] : []),
  ];
  if (await Offering.exists({ ...filter, $or: staff })) return 'staff';
  const enrolled = await Enrollment.distinct('offeringId', { studentId: viewer.id, status: 'active' });
  if (await Offering.exists({ $and: [filter, { _id: { $in: enrolled } }], status: { $ne: 'draft' } })) return 'student';
  return null;
}

// 06 §5 "who may download", re-checked on every request; then a 10-minute presigned GET (S6: no bytes through Next).
export async function GET(_request: Request, context: RouteContext<'/api/files/[...key]'>): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return missing();
  const key = (await context.params).key.join('/');
  const owner = parseKey(key);
  if (!owner) return missing();
  await db();

  if (owner.purpose === 'syllabus') {
    const course = await Course.findOne({ _id: owner.contextId, syllabusFileKey: key }, { code: 1 }).lean();
    if (!course || !(await reach(viewer, { courseId: course._id }))) return missing();
    return Response.redirect(await presignDownload(key, `${course.code} syllabus.pdf`), 302);
  }

  if (owner.purpose === 'lesson-video' || owner.purpose === 'lesson-doc') {
    // The data-saver copy shares the original's prefix and rule (T8b).
    const lesson = await Lesson.findOne(
      { offeringId: owner.contextId, $or: [{ fileKey: key }, { lowKey: key }] },
      { published: 1, fileName: 1 },
    ).lean();
    if (!lesson) return missing();
    const who = await reach(viewer, { _id: owner.contextId });
    if (who === null || (who === 'student' && !lesson.published)) return missing();
    return Response.redirect(await presignDownload(key, lesson.fileName ?? 'lesson'), 302);
  }

  return missing();
}
