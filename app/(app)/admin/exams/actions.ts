'use server';

import { refresh } from 'next/cache';
import mongoose, { Types, type AnyBulkWriteOperation } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { STALE_RUN_MS } from '@/lib/data/imports';
import { policyOf } from '@/lib/data/internal-marks';
import { lockOffering as lock } from '@/lib/data/locks';
import { notify } from '@/lib/data/notify';
import { db } from '@/lib/db';
import { checkEndSemRow, formatCsvErrors, parseEndSemCsv } from '@/lib/domain/csv';
import { externalMaxima } from '@/lib/domain/grades';
import { AppError, csvRejected } from '@/lib/errors';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { EndSemMark, type EndSemMarkDoc } from '@/lib/models/end-sem-mark';
import { Enrollment } from '@/lib/models/enrollment';
import { GradeSheet } from '@/lib/models/grade-sheet';
import { Offering } from '@/lib/models/offering';
import { SyncRun } from '@/lib/models/sync-run';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { queueAttainment, queueGradeSheets, queueInternalMarks, queueLockOffering } from '@/lib/queue';
import {
  BatchTerm,
  EXAM_LIMITS,
  ImportEndSem,
  LockOffering,
  UnlockOffering,
  UnpublishGradeSheets,
} from '@/lib/schemas/exams';

// M08: an admin's batch page, /admin/exams/<batchId> (decision 1, mock-ups E1 B–E4).

async function batchTerm(termId: string, batchId: string) {
  await db();
  const [term, batch] = await Promise.all([
    Term.findById(termId, { code: 1, name: 1 }).lean(),
    Batch.findById(batchId, { name: 1 }).lean(),
  ]);
  if (!term || !batch) throw new AppError('NOT_FOUND', 'That batch or term no longer exists.');
  return { term, batch };
}

// A run of `kind` for the batch and term that is still going (one that has not moved for 2 hours has stopped).
const running = (kind: 'marks_lock' | 'grade_sheets', termId: string, batchId: string) =>
  SyncRun.exists({
    kind,
    termId,
    batchId,
    status: 'running',
    updatedAt: { $gt: new Date(Date.now() - STALE_RUN_MS) },
  });

// A draft that no longer matches its marks goes back to incomplete until the sheets are worked out again (05 §5.5).
const stale = (why: string) => ({ status: 'incomplete', rows: [], credits: 0, sgpa: null, missing: [why] });

// T3: one course, with a reason when some students' marks are incomplete (M08 decision 2).
export const lockOffering = action(
  { input: LockOffering, roles: ['admin'] },
  async ({ offeringId, overrideReason }, viewer) => {
    const result = await lock(offeringId, viewer.id, new Date(), overrideReason);
    if (result.outcome === 'already') throw new AppError('CONFLICT', 'This course is already locked.');
    if (result.outcome === 'incomplete') {
      const message = `${result.total} student${result.total === 1 ? '’s' : 's’'} internal marks are incomplete. Give a reason to lock anyway: they get no grade sheet until their marks are filled in.`;
      throw new AppError('VALIDATION', message, { overrideReason: [message] });
    }
    refresh();
    return { incomplete: result.incomplete };
  },
);

// T3: every unlocked credit course of the batch this term (at most 50), one job each; a course whose students' marks
// are incomplete stays unlocked and the run says so.
export const lockCompleteCourses = action(
  { input: BatchTerm, roles: ['admin'] },
  async ({ termId, batchId }, viewer) => {
    await batchTerm(termId, batchId);
    if (await running('marks_lock', termId, batchId)) {
      throw new AppError('CONFLICT', 'This batch’s courses are being locked. Wait for that to finish.');
    }
    const offerings = await Offering.find(
      { batchId, termId, category: 'ugc', status: { $ne: 'draft' }, lockedAt: null },
      { _id: 1 },
    )
      .sort({ title: 1 })
      .limit(EXAM_LIMITS.lockMany)
      .lean();
    if (offerings.length === 0) throw new AppError('CONFLICT', 'Every credit course of this batch is already locked.');
    const run = await SyncRun.create({
      kind: 'marks_lock',
      termId,
      batchId,
      status: 'running',
      actorId: viewer.id,
      startedAt: new Date(),
      stats: { rows: offerings.length },
    });
    for (const offering of offerings) {
      await queueLockOffering({ offeringId: String(offering._id), syncRunId: String(run._id), actorId: viewer.id });
    }
    refresh();
    return { queued: offerings.length };
  },
);

// T3: refused while a published sheet includes the course. Drafts that include it go back to incomplete.
export const unlockOffering = action(
  { input: UnlockOffering, roles: ['admin'] },
  async ({ offeringId, reason }, viewer) => {
    await db();
    const offering = await Offering.findById(offeringId, { lockedAt: 1, courseId: 1 }).lean();
    if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
    if (!offering.lockedAt) throw new AppError('CONFLICT', 'This course is not locked.');
    if (await GradeSheet.exists({ 'rows.offeringId': offering._id, status: 'published' })) {
      throw new AppError('CONFLICT', 'Published grade sheets include this course. Unpublish them first.');
    }
    const code = (await Course.findById(offering.courseId, { code: 1 }).lean())?.code ?? 'A course';
    const unlocked = await mongoose.connection.transaction(async (session) => {
      const written = await Offering.updateOne(
        { _id: offering._id, lockedAt: offering.lockedAt },
        { $unset: { lockedAt: 1, lockedBy: 1 } },
        { session },
      );
      if (written.modifiedCount === 0) return false;
      const drafts = await GradeSheet.updateMany(
        { 'rows.offeringId': offering._id, status: 'draft' },
        { $set: stale(`${code} was unlocked after these were worked out.`) },
        { session },
      );
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'marks.unlocked',
          entity: 'offering',
          entityId: offeringId,
          offeringId,
          reason,
          before: { lockedAt: offering.lockedAt },
          after: { lockedAt: null, draftsReset: drafts.modifiedCount },
        },
        session,
      );
      return true;
    });
    if (!unlocked) throw new AppError('CONFLICT', 'This course is not locked.');
    // Anything held back while it was locked (attendance corrections, results by rule) is worked in now.
    await queueInternalMarks(offeringId);
    refresh();
  },
);

type Failure = { row: number; key: string | null; message: string };

// T5 (06 §8.3): the export with its external columns filled in, all or nothing. Every row must match an active
// enrolment in a credit course of this batch this term; a failed upload is kept as a run so the page lists its rows.
export const importEndSem = action(
  { input: ImportEndSem, roles: ['admin'] },
  async ({ termId, batchId, file }, viewer) => {
    const startedAt = new Date();
    const { term, batch } = await batchTerm(termId, batchId);
    const rejected = async (failures: Failure[], rows: number | null) => {
      await SyncRun.create({
        kind: 'exam_pull_csv',
        termId,
        batchId,
        status: 'failed',
        actorId: viewer.id,
        startedAt,
        finishedAt: new Date(),
        stats: { rows, failed: failures.length },
        failures: failures.slice(0, 500).map((f) => ({ row: f.row || null, key: f.key, message: f.message })),
      });
      return csvRejected(formatCsvErrors(failures));
    };
    const parsed = parseEndSemCsv(await file.text());
    if (!parsed.ok)
      throw await rejected(
        parsed.errors.map((e) => ({ ...e, key: null })),
        null,
      );
    const { rows } = parsed;

    const [students, courses, offerings] = await Promise.all([
      User.find({ rollNo: { $in: [...new Set(rows.map((r) => r.rollNo))] }, roles: 'student' }, { rollNo: 1 }).lean(),
      Course.find({ code: { $in: [...new Set(rows.map((r) => r.courseCode))] } }, { code: 1 }).lean(),
      Offering.find(
        { batchId, termId, category: 'ugc', status: { $ne: 'draft' } },
        { courseId: 1, credits: 1, evaluation: 1 },
      ).lean(),
    ]);
    const studentOf = new Map(students.map((s) => [s.rollNo, s._id]));
    const courseOf = new Map(courses.map((c) => [c.code, c._id]));
    // Each offering with the external maxima of its own policy copy.
    const offeringOf = new Map(
      await Promise.all(
        offerings.map(
          async (o) => [String(o._id), { ...o, maxima: externalMaxima(await policyOf(o.evaluation)) }] as const,
        ),
      ),
    );
    const [enrolments, published] = await Promise.all([
      Enrollment.find(
        {
          offeringId: { $in: offerings.map((o) => o._id) },
          studentId: { $in: students.map((s) => s._id) },
          status: 'active',
        },
        { offeringId: 1, studentId: 1 },
      ).lean(),
      GradeSheet.distinct('studentId', { termId, studentId: { $in: students.map((s) => s._id) }, status: 'published' }),
    ]);
    // A student's offerings of each course in this batch, by `<studentId>:<courseId>`.
    const enrolled = new Map<string, NonNullable<ReturnType<typeof offeringOf.get>>[]>();
    for (const e of enrolments) {
      const offering = offeringOf.get(String(e.offeringId));
      if (!offering) continue;
      const key = `${String(e.studentId)}:${String(offering.courseId)}`;
      enrolled.set(key, [...(enrolled.get(key) ?? []), offering]);
    }
    const sealed = new Set(published.map(String));

    const failures: Failure[] = [];
    const writes: AnyBulkWriteOperation<EndSemMarkDoc>[] = [];
    const syncRunId = new Types.ObjectId();
    const touched = new Set<string>();
    // M09 (EXM-06): each offering the file wrote to has its attainment worked out again.
    const offeringsTouched = new Set<string>();
    for (const row of rows) {
      const key = `${row.rollNo} · ${row.courseCode}`;
      const fail = (message: string) => failures.push({ row: row.row, key, message });
      if (row.termCode !== term.code) {
        fail(`This row is for term ${row.termCode}; this page is for ${term.code}.`);
        continue;
      }
      const studentId = studentOf.get(row.rollNo);
      const courseId = courseOf.get(row.courseCode);
      if (!studentId) {
        fail(`No student has the roll number ${row.rollNo}.`);
        continue;
      }
      if (!courseId) {
        fail(`No course has the code ${row.courseCode}.`);
        continue;
      }
      const matches = enrolled.get(`${String(studentId)}:${String(courseId)}`) ?? [];
      if (matches.length !== 1) {
        fail(
          matches.length === 0
            ? `${row.rollNo} is not enrolled in ${row.courseCode} in ${batch.name} this term.`
            : `${row.rollNo} is enrolled in two offerings of ${row.courseCode}. Drop one first.`,
        );
        continue;
      }
      if (sealed.has(String(studentId))) {
        fail(`${row.rollNo}’s grade sheet for ${term.code} is published. Unpublish the batch’s grade sheets first.`);
        continue;
      }
      const [offering] = matches;
      const checked = checkEndSemRow(row, { code: row.courseCode, credits: offering.credits, maxima: offering.maxima });
      if (!checked.ok) {
        fail(checked.message);
        continue;
      }
      touched.add(String(studentId));
      offeringsTouched.add(String(offering._id));
      writes.push({
        updateOne: {
          filter: { offeringId: offering._id, studentId },
          update: { $set: { externals: checked.externals, source: 'csv', syncRunId, importedAt: startedAt } },
          upsert: true,
        },
      });
    }
    if (failures.length > 0) throw await rejected(failures, rows.length);

    await mongoose.connection.transaction(async (session) => {
      await SyncRun.create(
        [
          {
            _id: syncRunId,
            kind: 'exam_pull_csv',
            termId,
            batchId,
            status: 'succeeded',
            actorId: viewer.id,
            startedAt,
            finishedAt: new Date(),
            stats: { rows: rows.length, applied: rows.length },
          },
        ],
        { session },
      );
      await EndSemMark.bulkWrite(writes, { session });
      await GradeSheet.updateMany(
        { termId, studentId: { $in: [...touched] }, status: 'draft' },
        { $set: stale('End-semester marks changed after these were worked out.') },
        { session },
      );
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'endsem.imported',
          entity: 'batch',
          entityId: batchId,
          after: { termId, rows: rows.length, syncRunId: String(syncRunId) },
        },
        session,
      );
    });
    for (const offeringId of offeringsTouched) await queueAttainment(offeringId);
    refresh();
    return { rows: rows.length };
  },
);

// T6: the batch's sheets worked out in the worker. Asking again while a run is going does nothing.
export const computeGradeSheets = action(
  { input: BatchTerm, roles: ['admin'] },
  async ({ termId, batchId }, viewer) => {
    await batchTerm(termId, batchId);
    if (await running('grade_sheets', termId, batchId)) return { started: false };
    if (!(await Offering.exists({ batchId, termId, category: 'ugc', status: { $ne: 'draft' } }))) {
      throw new AppError('VALIDATION', 'This batch has no credit course this term.');
    }
    const run = await SyncRun.create({
      kind: 'grade_sheets',
      termId,
      batchId,
      status: 'running',
      actorId: viewer.id,
      startedAt: new Date(),
    });
    await queueGradeSheets({ termId, batchId, syncRunId: String(run._id), actorId: viewer.id });
    refresh();
    return { started: true };
  },
);

// T6: every draft of the batch published at once with its audit entry; then each student is told (in-app only).
export const publishGradeSheets = action(
  { input: BatchTerm, roles: ['admin'] },
  async ({ termId, batchId }, viewer) => {
    const { term } = await batchTerm(termId, batchId);
    if (await running('grade_sheets', termId, batchId)) {
      throw new AppError('CONFLICT', 'The grade sheets are being worked out. Publish them when that has finished.');
    }
    const drafts = await GradeSheet.find({ termId, batchId, status: 'draft' }, { studentId: 1 }).lean();
    if (drafts.length === 0) throw new AppError('CONFLICT', 'No grade sheet is ready to publish. Work them out first.');
    const now = new Date();
    const published = await mongoose.connection.transaction(async (session) => {
      const written = await GradeSheet.updateMany(
        { _id: { $in: drafts.map((d) => d._id) }, status: 'draft' },
        { $set: { status: 'published', publishedAt: now, publishedBy: new Types.ObjectId(viewer.id) } },
        { session },
      );
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'gradesheet.published',
          entity: 'batch',
          entityId: batchId,
          after: { termId, sheets: written.modifiedCount },
        },
        session,
      );
      return written.modifiedCount;
    });
    await notify(
      drafts.map((d) => String(d.studentId)),
      { kind: 'gradeSheet.published', title: `Your grade sheet for ${term.name} is published`, href: '/results' },
    );
    // M09 (EXM-06): the batch's credit courses this term are worked out again with their final marks.
    const credit = await Offering.find(
      { batchId, termId, category: 'ugc', status: { $ne: 'draft' } },
      { _id: 1 },
    ).lean();
    for (const offering of credit) await queueAttainment(String(offering._id));
    refresh();
    return { published };
  },
);

// T6: published sheets go back to drafts, so students no longer see them and end-sem marks can change again.
export const unpublishGradeSheets = action(
  { input: UnpublishGradeSheets, roles: ['admin'] },
  async ({ termId, batchId, reason }, viewer) => {
    await batchTerm(termId, batchId);
    const count = await mongoose.connection.transaction(async (session) => {
      const written = await GradeSheet.updateMany(
        { termId, batchId, status: 'published' },
        { $set: { status: 'draft', publishedAt: null, publishedBy: null } },
        { session },
      );
      if (written.modifiedCount === 0) return 0;
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'gradesheet.unpublished',
          entity: 'batch',
          entityId: batchId,
          reason,
          after: { termId, sheets: written.modifiedCount },
        },
        session,
      );
      return written.modifiedCount;
    });
    if (count === 0) throw new AppError('CONFLICT', 'No grade sheet of this batch is published.');
    refresh();
    return { unpublished: count };
  },
);
