import 'server-only';
import { Types, type AnyBulkWriteOperation } from 'mongoose';
import { db } from '@/lib/db';
import { policyOf } from '@/lib/data/internal-marks';
import { notesOf } from '@/lib/data/locks';
import { gradeSheet, type CourseMarks } from '@/lib/domain/grades';
import { log } from '@/lib/log';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { EndSemMark } from '@/lib/models/end-sem-mark';
import { Enrollment } from '@/lib/models/enrollment';
import { GradeSheet, type GradeSheetDoc } from '@/lib/models/grade-sheet';
import { InternalMark } from '@/lib/models/internal-mark';
import { Offering } from '@/lib/models/offering';
import { Setting } from '@/lib/models/setting';
import { SyncRun } from '@/lib/models/sync-run';
import { User } from '@/lib/models/user';
import type { GradeSheetsJob } from '@/lib/schemas/jobs';
import { SETTINGS } from '@/lib/schemas/settings';

const CHUNK = 200;

type TermCourse = Omit<CourseMarks, 'locked' | 'internals' | 'notes' | 'externals'> & {
  offeringId: Types.ObjectId;
  courseTitle: string;
  locked: boolean;
};

// `compute/gradeSheets` (06 §6, 07 §6): every student of the batch with active credit enrolments in the term gets a
// draft sheet, or an incomplete one that says what is missing (M08 decision 2). A published sheet is never touched;
// a student with no credit course this term keeps no unpublished sheet. Students are read 200 at a time.
export async function workOutGradeSheets(job: GradeSheetsJob, now: Date, lastTry: boolean): Promise<void> {
  try {
    await db();
    const termId = new Types.ObjectId(job.termId);
    const batch = await Batch.findById(job.batchId, { programId: 1 }).lean();
    if (!batch) throw new Error(`Batch ${job.batchId} not found.`);
    const grading = SETTINGS.grading.schema.parse(
      (await Setting.findById('grading', { value: 1 }).lean())?.value ?? {},
    );
    const students = await User.find(
      { batchId: batch._id, roles: 'student', status: { $ne: 'disabled' } },
      { _id: 1 },
    ).lean();
    // The term's credit courses met so far, by offering id (null: not a credit course of this term).
    const courses = new Map<string, TermCourse | null>();
    const stats = { rows: 0, applied: 0, skipped: 0, failed: 0 };
    for (let start = 0; start < students.length; start += CHUNK) {
      const ids = students.slice(start, start + CHUNK).map((s) => s._id);
      const [enrolments, published] = await Promise.all([
        Enrollment.find({ studentId: { $in: ids }, status: 'active' }, { offeringId: 1, studentId: 1 }).lean(),
        GradeSheet.distinct('studentId', { termId, studentId: { $in: ids }, status: 'published' }),
      ]);
      await learnCourses(
        courses,
        enrolments.map((e) => String(e.offeringId)),
        termId,
      );
      const mine = enrolments.filter((e) => courses.get(String(e.offeringId)));
      const offeringIds = [...new Set(mine.map((e) => String(e.offeringId)))];
      const [internals, externals] = await Promise.all([
        InternalMark.find(
          { offeringId: { $in: offeringIds }, studentId: { $in: ids } },
          { offeringId: 1, studentId: 1, components: 1, parts: 1 },
        ).lean(),
        EndSemMark.find(
          { offeringId: { $in: offeringIds }, studentId: { $in: ids } },
          { offeringId: 1, studentId: 1, externals: 1 },
        ).lean(),
      ]);
      const key = (offeringId: unknown, studentId: unknown) => `${String(offeringId)}:${String(studentId)}`;
      const internalOf = new Map(internals.map((row) => [key(row.offeringId, row.studentId), row]));
      const externalOf = new Map(
        externals.map((row) => [
          key(row.offeringId, row.studentId),
          row.externals.map((e) => ({ component: e.component, marks: e.marks ?? null, max: e.max, absent: e.absent })),
        ]),
      );
      const done = new Set(published.map(String));
      const writes: AnyBulkWriteOperation<GradeSheetDoc>[] = [];
      for (const studentId of ids) {
        if (done.has(String(studentId))) {
          stats.skipped++;
          continue;
        }
        const taken = mine
          .filter((e) => e.studentId.equals(studentId))
          .flatMap((e) => courses.get(String(e.offeringId)) ?? [])
          .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
        const filter = { termId, studentId, status: { $ne: 'published' as const } };
        if (taken.length === 0) {
          writes.push({ deleteOne: { filter } });
          continue;
        }
        stats.rows++;
        const sheet = gradeSheet(
          taken.map((course) => {
            const internal = internalOf.get(key(course.offeringId, studentId));
            return {
              ...course,
              internals: internal?.components ?? null,
              notes: internal ? notesOf(internal) : undefined,
              externals: externalOf.get(key(course.offeringId, studentId)) ?? null,
            };
          }),
          grading,
        );
        const base = { termId, studentId, programId: batch.programId, batchId: batch._id, computedAt: now };
        if (sheet.status === 'incomplete') stats.failed++;
        else stats.applied++;
        writes.push({
          updateOne: {
            filter,
            update: {
              $set:
                sheet.status === 'incomplete'
                  ? { ...base, status: 'incomplete', rows: [], credits: 0, sgpa: null, missing: sheet.missing }
                  : {
                      ...base,
                      status: 'draft',
                      // A draft grades every course, in the order given.
                      rows: sheet.rows.map((row, i) => ({
                        ...row,
                        offeringId: taken[i]?.offeringId,
                        courseTitle: taken[i]?.courseTitle ?? '',
                      })),
                      credits: sheet.credits,
                      sgpa: sheet.sgpa,
                      missing: [],
                    },
            },
            upsert: true,
          },
        });
      }
      if (writes.length > 0) await GradeSheet.bulkWrite(writes, { ordered: false });
    }
    await SyncRun.updateOne({ _id: job.syncRunId }, { $set: { status: 'succeeded', finishedAt: new Date(), stats } });
    log.info('grade sheets', { batchId: job.batchId, termId: job.termId, ...stats });
  } catch (error) {
    if (lastTry) {
      await SyncRun.updateOne(
        { _id: job.syncRunId },
        {
          $set: { status: 'failed', finishedAt: new Date() },
          $push: { failures: { row: null, key: null, message: 'Working out the grade sheets failed. Try again.' } },
        },
      );
    }
    throw error;
  }
}

// Reads the offerings not met yet: a credit course of this term (not a draft) with its course and policy copy.
async function learnCourses(
  courses: Map<string, TermCourse | null>,
  offeringIds: readonly string[],
  termId: Types.ObjectId,
): Promise<void> {
  const unknown = [...new Set(offeringIds)].filter((id) => !courses.has(id));
  if (unknown.length === 0) return;
  const offerings = await Offering.find(
    { _id: { $in: unknown }, termId, category: 'ugc', status: { $ne: 'draft' } },
    { courseId: 1, credits: 1, evaluation: 1, lockedAt: 1 },
  ).lean();
  const titles = await Course.find({ _id: { $in: offerings.map((o) => o.courseId) } }, { code: 1, title: 1 }).lean();
  const courseOf = new Map(titles.map((c) => [String(c._id), c]));
  for (const id of unknown) courses.set(id, null);
  for (const offering of offerings) {
    const course = courseOf.get(String(offering.courseId));
    courses.set(String(offering._id), {
      offeringId: offering._id,
      courseCode: course?.code ?? '—',
      courseTitle: course?.title ?? '',
      credits: offering.credits,
      policy: await policyOf(offering.evaluation),
      locked: Boolean(offering.lockedAt),
    });
  }
}
