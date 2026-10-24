import type { Types } from 'mongoose';
import { getViewer, type Viewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { parseKey } from '@/lib/domain/uploads';
import { presignDownload } from '@/lib/integrations/storage';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LiveSession } from '@/lib/models/live-session';
import { Assessment } from '@/lib/models/assessment';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { TestFile } from '@/lib/models/test-file';

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

// The presigned GET lives 600 s; the browser may reuse this answer for 300 s, so a page of thumbnails costs one check
// each per five minutes rather than one per render (09 §5).
function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, max-age=300' } });
}

// Whoever teaches or oversees the assessment's class — or, for a standalone test (M04b), its owners and the admins.
// Null when the assessment does not exist.
async function assessmentStaff(viewer: Viewer, assessmentId: Types.ObjectId | string): Promise<boolean | null> {
  const assessment = await Assessment.findById(assessmentId, { offeringId: 1, ownerIds: 1 }).lean();
  if (!assessment) return null;
  return assessment.offeringId
    ? (await reach(viewer, { _id: String(assessment.offeringId) })) === 'staff'
    : viewer.roles.includes('admin') || assessment.ownerIds.some((id) => id.equals(viewer.id));
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
    // Q-53: every staff member opens the catalogue course page, so its PDF too; a student only for a course they study.
    const staff = viewer.roles.some((role) => role === 'admin' || role === 'hod' || role === 'faculty');
    if (!course || !(staff || (await reach(viewer, { courseId: course._id })))) return missing();
    return redirect(await presignDownload(key, `${course.code} syllabus.pdf`));
  }

  if (owner.purpose === 'offering-cover') {
    if (!(await Offering.exists({ _id: owner.contextId, coverKey: key }))) return missing();
    if (!(await reach(viewer, { _id: owner.contextId }))) return missing();
    return redirect(await presignDownload(key, 'cover.jpg'));
  }

  if (owner.purpose === 'lesson-video' || owner.purpose === 'lesson-doc' || owner.purpose === 'lesson-thumb') {
    // A video's data-saver copy and frame share its prefix and rule (T8b); a lesson's notes are lesson-doc uploads.
    const match =
      owner.purpose === 'lesson-video'
        ? [{ fileKey: key }, { lowKey: key }, { frameKey: key }]
        : owner.purpose === 'lesson-doc'
          ? [{ fileKey: key }, { 'attachments.key': key }]
          : [{ thumbKey: key }];
    const lesson = await Lesson.findOne(
      { offeringId: owner.contextId, $or: match },
      { published: 1, fileKey: 1, fileName: 1, attachments: 1 },
    ).lean();
    if (!lesson) return missing();
    const who = await reach(viewer, { _id: owner.contextId });
    if (who === null || (who === 'student' && !lesson.published)) return missing();
    const name =
      // Lessons saved before M03b have no `attachments` (a lean read applies no default).
      (lesson.attachments ?? []).find((a) => a.key === key)?.fileName ??
      (key === lesson.fileKey ? lesson.fileName : undefined) ??
      (key.endsWith('.jpg') ? 'thumbnail.jpg' : 'lesson');
    return redirect(await presignDownload(key, name));
  }

  if (owner.purpose === 'submission') {
    // 06 §5: the student who uploaded it and the assessment's staff. The name is the one kept with the answer (a
    // student has at most 10 attempts, so the search is bounded).
    const staff = await assessmentStaff(viewer, owner.contextId);
    if (staff === null || (owner.userId !== viewer.id && !staff)) return missing();
    const attempts = await Submission.find({ assessmentId: owner.contextId, studentId: owner.userId }, { answers: 1 })
      .limit(10)
      .lean();
    const file = attempts
      .flatMap((attempt) => Object.values(attempt.answers ?? {}))
      .flatMap((answer) => answer.files ?? [])
      .find((f) => f.key === key);
    if (!file && owner.userId !== viewer.id) return missing();
    return redirect(await presignDownload(key, file?.fileName ?? 'answer'));
  }

  if (owner.purpose === 'proctor-snapshot') {
    // M04b (TP-08, 09 §11): the assessment's staff only, never the person in the picture; the context is the attempt.
    const attempt = await Submission.findOne(
      { _id: owner.contextId, studentId: owner.userId, 'proctor.snapshots.key': key },
      { assessmentId: 1 },
    ).lean();
    if (!attempt || !(await assessmentStaff(viewer, attempt.assessmentId))) return missing();
    return redirect(await presignDownload(key, 'snapshot.jpg'));
  }

  if (owner.purpose === 'test-file') {
    // M04b (TP-12): a file made from a test's results, by its current key only. The Excel export and reports go to the
    // test's staff; a scorecard or certificate to the person it is about (whose id the worker put in its key) as well.
    const file = await TestFile.findOne(
      { key, assessmentId: owner.contextId },
      { submissionId: 1, fileName: 1 },
    ).lean();
    if (!file) return missing();
    const staff = await assessmentStaff(viewer, owner.contextId);
    if (!staff && !(file.submissionId && owner.userId === viewer.id)) return missing();
    return redirect(await presignDownload(key, file.fileName ?? 'results'));
  }

  if (owner.purpose === 'live-recording') {
    // M03c T5: a saved recording, by its key, for whoever can open the class (its staff and students) or the meeting
    // (its hosts and members). The context is the session.
    const session = await LiveSession.findOne(
      { _id: owner.contextId, recordings: { $elemMatch: { key, status: 'saved' } } },
      { offeringId: 1, meeting: 1 },
    ).lean();
    if (!session) return missing();
    const allowed = session.meeting
      ? [...session.meeting.hostIds, ...session.meeting.memberIds].some((id) => id.equals(viewer.id))
      : Boolean(session.offeringId && (await reach(viewer, { _id: String(session.offeringId) })));
    if (!allowed) return missing();
    return redirect(await presignDownload(key, 'recording.mp4'));
  }

  return missing();
}
