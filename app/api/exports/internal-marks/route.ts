import mongoose, { Types } from 'mongoose';
import { writeAudit } from '@/lib/audit';
import { getViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { buildInternalMarksCsv, type InternalMarksRow } from '@/lib/domain/csv';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { InternalMark } from '@/lib/models/internal-mark';
import { Offering } from '@/lib/models/offering';
import { SyncRun } from '@/lib/models/sync-run';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { BatchTerm, EXAM_LIMITS } from '@/lib/schemas/exams';

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

// M08 T4 (06 §3, §8.4; CE-11): the internal marks of a batch's locked credit courses this term, one row per active
// enrolment, for the exam section to fill in. A generated download cannot be a Server Action, so this is the one
// route handler a page calls. The run, the courses' `lastPushedAt` and the audit entry are written together.
export async function GET(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer?.roles.includes('admin')) return new Response(null, { status: 404 });
  const query = BatchTerm.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return text(400, 'Choose a batch and a term.');
  const { termId, batchId } = query.data;
  await db();
  const [term, batch] = await Promise.all([
    Term.findById(termId, { code: 1 }).lean(),
    Batch.findById(batchId, { name: 1 }).lean(),
  ]);
  if (!term || !batch) return new Response(null, { status: 404 });
  const offerings = await Offering.find(
    { batchId, termId, category: 'ugc', lockedAt: { $ne: null } },
    { courseId: 1 },
  ).lean();
  if (offerings.length === 0) return text(400, 'No course of this batch is locked yet. Lock the courses first.');
  const enrolments = await Enrollment.find(
    { offeringId: { $in: offerings.map((o) => o._id) }, status: 'active' },
    { offeringId: 1, studentId: 1 },
  )
    .limit(EXAM_LIMITS.endSemRows + 1)
    .lean();
  if (enrolments.length > EXAM_LIMITS.endSemRows) {
    return text(400, `This batch has more than ${EXAM_LIMITS.endSemRows.toLocaleString('en-IN')} marks to send.`);
  }
  const [courses, students, marks] = await Promise.all([
    Course.find({ _id: { $in: offerings.map((o) => o.courseId) } }, { code: 1 }).lean(),
    User.find(
      { _id: { $in: [...new Set(enrolments.map((e) => String(e.studentId)))] } },
      { name: 1, rollNo: 1 },
    ).lean(),
    InternalMark.find(
      { offeringId: { $in: offerings.map((o) => o._id) } },
      { offeringId: 1, studentId: 1, components: 1 },
    ).lean(),
  ]);
  const codeOf = new Map(courses.map((c) => [String(c._id), c.code]));
  const courseOf = new Map(offerings.map((o) => [String(o._id), codeOf.get(String(o.courseId)) ?? '']));
  const studentOf = new Map(students.map((s) => [String(s._id), s]));
  const markOf = new Map(marks.map((m) => [`${String(m.offeringId)}:${String(m.studentId)}`, m.components]));
  const rows: InternalMarksRow[] = enrolments
    .map((e) => {
      const student = studentOf.get(String(e.studentId));
      return {
        rollNo: student?.rollNo ?? '',
        name: student?.name ?? '',
        courseCode: courseOf.get(String(e.offeringId)) ?? '',
        termCode: term.code,
        internals: markOf.get(`${String(e.offeringId)}:${String(e.studentId)}`) ?? {},
      };
    })
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.rollNo.localeCompare(b.rollNo));

  const now = new Date();
  const syncRunId = new Types.ObjectId();
  await mongoose.connection.transaction(async (session) => {
    await SyncRun.create(
      [
        {
          _id: syncRunId,
          kind: 'exam_push_csv',
          termId,
          batchId,
          status: 'succeeded',
          actorId: viewer.id,
          startedAt: now,
          finishedAt: now,
          stats: { rows: rows.length, applied: rows.length },
        },
      ],
      { session },
    );
    await Offering.updateMany(
      { _id: { $in: offerings.map((o) => o._id) } },
      { $set: { lastPushedAt: now } },
      { session },
    );
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'ce.exported',
        entity: 'batch',
        entityId: batchId,
        after: { termId, offerings: offerings.length, rows: rows.length, syncRunId: String(syncRunId) },
      },
      session,
    );
  });
  const slug = `${term.code}-${batch.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return new Response(buildInternalMarksCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="internal-marks-${slug}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
