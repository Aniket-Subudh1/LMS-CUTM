import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import {
  computeGradeSheets,
  importEndSem,
  lockCompleteCourses,
  lockOffering,
  publishGradeSheets,
  unlockOffering,
  unpublishGradeSheets,
} from '@/app/(app)/admin/exams/actions';
import { refreshEvaluation } from '@/app/(app)/admin/offerings/actions';
import { GET as exportInternalMarks } from '@/app/api/exports/internal-marks/route';
import { getExamBatch, getMyResults } from '@/lib/data/exams';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Assessment } from '@/lib/models/assessment';
import { AuditLog } from '@/lib/models/audit-log';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { EndSemMark } from '@/lib/models/end-sem-mark';
import { Enrollment } from '@/lib/models/enrollment';
import { GradeSheet } from '@/lib/models/grade-sheet';
import { InternalMark } from '@/lib/models/internal-mark';
import { Notification } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { RubricMark } from '@/lib/models/rubric-mark';
import { SyncRun } from '@/lib/models/sync-run';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import { SETTINGS } from '@/lib/schemas/settings';
import { startComputeWorker } from '@/worker/jobs/compute';
import { enroll, form, makeAssessment, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

const POLICY = SETTINGS.evaluation.schema.parse({});
const FULL = {
  practiceConcept: 4,
  practicePlanning: 8,
  practiceResult: 7.5,
  practiceRecord: 9,
  practiceConduct: 4,
  practiceViva: 8,
};
const REASON = 'The exam section needs the file today.';
const c = (theory: number, practice: number, project: number) => ({ theory, practice, project });

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;
let n = 0;

beforeAll(async () => {
  await db();
  await Promise.all(
    [
      Assessment,
      AuditLog,
      Batch,
      Course,
      EndSemMark,
      Enrollment,
      GradeSheet,
      InternalMark,
      Notification,
      Offering,
      RubricMark,
      SyncRun,
      Term,
      User,
    ].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
  worker = startComputeWorker(env().REDIS_URL);
  queueEvents = new QueueEvents('compute', { connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }) });
  await queueEvents.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), queueEvents.close(), computeQueue().close(), mailQueue().close()]);
  await redis().quit();
});

// A term, a batch of three students and an admin.
async function world() {
  const i = ++n;
  const admin = await makeUser({ roles: ['admin'] });
  const term = await Term.create({
    code: `2026-ODD-${i}`,
    name: `Odd semester ${i}`,
    academicYear: '2026-27',
    startsOn: new Date(Date.UTC(2026, 6, i)),
    endsOn: new Date(Date.UTC(2026, 11, 15)),
    status: 'current',
  });
  const programId = newId();
  const batch = await Batch.create({ programId, name: `B.Tech CSE ${2000 + i}`, startYear: 2000 + i, sections: ['A'] });
  const students = await Promise.all(
    [1, 2, 3].map((s) => makeUser({ batchId: batch._id, programId, rollNo: `R${i}0${s}`, name: `Student ${i}.${s}` })),
  );
  return { admin, term, batch, students, ids: { termId: String(term._id), batchId: String(batch._id) } };
}
type World = Awaited<ReturnType<typeof world>>;

// A credit course of the batch this term with every student enrolled.
async function course(w: World, credits: ReturnType<typeof c>, code?: string) {
  const made = await makeCourse({ credits, ...(code ? { code } : {}) });
  const offering = await makeOffering({
    courseId: made._id,
    termId: w.term._id,
    batchId: w.batch._id,
    programId: w.batch.programId,
    credits,
    evaluation: POLICY,
  });
  await Promise.all(w.students.map((s) => enroll(offering._id, s._id)));
  return { code: made.code, offering, id: String(offering._id) };
}

const rubric = (offeringId: Types.ObjectId, studentId: Types.ObjectId, criteria: Partial<typeof FULL>) =>
  RubricMark.create({ offeringId, studentId, component: 'practice', criteria, updatedBy: newId() });
const NO_VIVA = { practiceConcept: 4, practicePlanning: 8, practiceResult: 7.5, practiceRecord: 9, practiceConduct: 4 };

async function finished(jobId: string) {
  const job = await computeQueue().getJob(jobId);
  await job?.waitUntilFinished(queueEvents);
}
const csvFile = (text: string) => new File([text], 'marks.csv', { type: 'text/csv' });
const exported = async (w: World) =>
  exportInternalMarks(
    new Request(`http://localhost/api/exports/internal-marks?termId=${w.ids.termId}&batchId=${w.ids.batchId}`),
  );

describe('locking (T3, CE-12, AC-M08-01)', () => {
  it('needs a reason while marks are incomplete, then locks with the audit entry and refuses changes', async () => {
    const w = await world();
    const { offering, id } = await course(w, c(0, 2, 0));
    await rubric(offering._id, w.students[0]._id, FULL);
    await rubric(offering._id, w.students[1]._id, FULL);
    await rubric(offering._id, w.students[2]._id, NO_VIVA);
    await signInAs(w.admin);
    // The recompute behind the lock works the marks out; the batch page reads them from there.
    expect(await lockOffering(form({ offeringId: id, overrideReason: '' }))).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { overrideReason: [expect.stringContaining('1 student’s internal marks are incomplete')] },
    });
    expect((await Offering.findById(id).lean())?.lockedAt).toBeUndefined();
    const listed = await getExamBatch(w.ids.batchId, { termId: w.ids.termId, page: 1 });
    expect(listed.courses[0]).toMatchObject({
      students: 3,
      complete: 2,
      incomplete: [{ rollNo: w.students[2].rollNo, why: 'Practice internal missing: rubric not filled' }],
      locked: null,
    });
    expect(await lockOffering(form({ offeringId: id, overrideReason: 'too short' }))).toMatchObject({
      code: 'VALIDATION',
    });
    expect(await lockOffering(form({ offeringId: id, overrideReason: REASON }))).toMatchObject({
      ok: true,
      data: { incomplete: 1 },
    });
    expect((await Offering.findById(id).lean())?.lockedBy).toEqual(w.admin._id);
    expect(await AuditLog.findOne({ action: 'marks.locked', entityId: id }).lean()).toMatchObject({
      reason: REASON,
      after: { incomplete: 1 },
    });
    expect(await lockOffering(form({ offeringId: id }))).toMatchObject({ code: 'CONFLICT' });
    expect(await refreshEvaluation(form({ offeringId: id }))).toMatchObject({ code: 'LOCKED' });
  });

  it('locks a complete course without a reason; a student or teacher cannot lock', async () => {
    const w = await world();
    const { offering, id } = await course(w, c(0, 2, 0));
    await Promise.all(w.students.map((s) => rubric(offering._id, s._id, FULL)));
    await signInAs(w.students[0]);
    expect(await lockOffering(form({ offeringId: id }))).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(w.admin);
    expect(await lockOffering(form({ offeringId: id }))).toMatchObject({ ok: true, data: { incomplete: 0 } });
    expect((await AuditLog.findOne({ action: 'marks.locked', entityId: id }).lean())?.reason).toBeUndefined();
  });

  it('locks every complete course of the batch in the worker and says which it left', async () => {
    const w = await world();
    const done = await course(w, c(0, 2, 0));
    const open = await course(w, c(0, 2, 0));
    await Promise.all(w.students.map((s) => rubric(done.offering._id, s._id, FULL)));
    await rubric(open.offering._id, w.students[0]._id, FULL);
    await signInAs(w.admin);
    expect(await lockCompleteCourses(w.ids)).toMatchObject({ ok: true, data: { queued: 2 } });
    const run = await SyncRun.findOne({ kind: 'marks_lock', batchId: w.batch._id }).lean();
    await Promise.all([done.id, open.id].map((id) => finished(`lock-${String(run?._id)}-${id}`)));
    expect((await Offering.findById(done.id).lean())?.lockedAt).toBeInstanceOf(Date);
    expect((await Offering.findById(open.id).lean())?.lockedAt).toBeUndefined();
    expect(await SyncRun.findById(run?._id).lean()).toMatchObject({
      status: 'partial',
      stats: { rows: 2, applied: 1, failed: 1 },
      failures: [{ message: expect.stringContaining('2 students’ internal marks are incomplete') }],
    });
    expect(await lockCompleteCourses(w.ids)).toMatchObject({ ok: true, data: { queued: 1 } });
  });

  it('unlocks with a reason, audited, and works the marks out again', async () => {
    const w = await world();
    const { offering, id } = await course(w, c(0, 2, 0));
    await Promise.all(w.students.map((s) => rubric(offering._id, s._id, FULL)));
    await signInAs(w.admin);
    await lockOffering(form({ offeringId: id }));
    expect(await unlockOffering(form({ offeringId: id, reason: 'short' }))).toMatchObject({ code: 'VALIDATION' });
    expect(await unlockOffering(form({ offeringId: id, reason: 'A viva mark was entered wrongly.' }))).toMatchObject({
      ok: true,
    });
    expect((await Offering.findById(id).lean())?.lockedAt).toBeUndefined();
    expect(await AuditLog.findOne({ action: 'marks.unlocked', entityId: id }).lean()).toMatchObject({
      reason: 'A viva mark was entered wrongly.',
      after: { lockedAt: null },
    });
    expect(await unlockOffering(form({ offeringId: id, reason: 'Once more, by mistake.' }))).toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('keeps a locked course’s results back from the hourly sweep until it is unlocked', async () => {
    const w = await world();
    const { offering, id } = await course(w, c(0, 2, 0));
    const test = await makeAssessment({
      offeringId: offering._id,
      opensAt: new Date(Date.now() - 7_200_000),
      closesAt: new Date(Date.now() - 3_600_000),
      results: { release: 'on_close', setBy: w.admin._id },
    });
    await Offering.updateOne({ _id: id }, { $set: { lockedAt: new Date() } });
    const sweep = async () => {
      const job = await computeQueue().add('assessmentSweep', {}, { jobId: `test-sweep-${crypto.randomUUID()}` });
      await job.waitUntilFinished(queueEvents);
    };
    await sweep();
    expect((await Assessment.findById(test._id).lean())?.status).toBe('published');
    await Offering.updateOne({ _id: id }, { $unset: { lockedAt: 1 } });
    await sweep();
    expect((await Assessment.findById(test._id).lean())?.status).toBe('results_published');
  });
});

describe('the exam section’s file (T4, T5, AC-M08-02, AC-M08-03)', () => {
  it('exports only locked courses, one row per enrolment, with the run, lastPushedAt and the audit entry', async () => {
    const w = await world();
    const locked = await course(w, c(0, 2, 0));
    const open = await course(w, c(0, 2, 0));
    await Promise.all(w.students.map((s) => rubric(locked.offering._id, s._id, FULL)));
    await signInAs(w.students[0]);
    expect((await exported(w)).status).toBe(404);
    await signInAs(w.admin);
    expect((await exported(w)).status).toBe(400);
    await lockOffering(form({ offeringId: locked.id }));
    const response = await exported(w);
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="internal-marks-2026-odd-\d+-b-tech-cse-\d+\.csv"$/,
    );
    const lines = (await response.text()).split('\r\n');
    expect(lines[0]).toBe(
      'rollno,name,coursecode,termcode,theoryinternal,practiceinternal,projectinternal,theoryexternal,practiceexternal,projectexternal',
    );
    expect(lines.slice(1)).toEqual(
      w.students.map((s) => `${s.rollNo},${s.name},${locked.code},${w.term.code},,40.5,,,,`),
    );
    expect(lines.join()).not.toContain(open.code);
    const run = await SyncRun.findOne({ kind: 'exam_push_csv', batchId: w.batch._id }).lean();
    expect(run).toMatchObject({ status: 'succeeded', stats: { rows: 3, applied: 3 } });
    expect((await Offering.findById(locked.id).lean())?.lastPushedAt).toBeInstanceOf(Date);
    expect(await AuditLog.findOne({ action: 'ce.exported', entityId: w.ids.batchId }).lean()).toMatchObject({
      after: { offerings: 1, rows: 3, syncRunId: String(run?._id) },
    });
  });

  it('takes the export back filled in, all or nothing, naming each wrong row', async () => {
    const w = await world();
    const { offering, id, code } = await course(w, c(0, 2, 0));
    await Promise.all(w.students.map((s) => rubric(offering._id, s._id, FULL)));
    await signInAs(w.admin);
    await lockOffering(form({ offeringId: id }));
    const lines = (await (await exported(w)).text()).split('\r\n');
    const filled = [lines[0], ...lines.slice(1).map((line, i) => line.replace(/,,,,$/, i === 1 ? ',,,AB,' : ',,,45,'))];
    const wrong = [...filled, `R9999,Nobody,${code},${w.term.code},,,,,40,`];
    const rejected = await importEndSem(form({ ...w.ids, file: csvFile(wrong.join('\n')) }));
    expect(rejected).toMatchObject({ code: 'VALIDATION' });
    expect(!rejected.ok && rejected.fieldErrors?.file).toEqual(['Row 4: No student has the roll number R9999.']);
    expect(await EndSemMark.countDocuments({ offeringId: id })).toBe(0);
    const extra = [
      ...filled.slice(0, 2),
      filled[1].replace(/,45,$/, ',45,30').replace(w.students[0].rollNo ?? '', w.students[1].rollNo ?? ''),
    ];
    const lacking = await importEndSem(form({ ...w.ids, file: csvFile(extra.join('\n')) }));
    expect(!lacking.ok && lacking.fieldErrors?.file).toEqual([
      `Row 2: projectexternal has a mark, but ${code} has no project.`,
    ]);
    expect(
      await SyncRun.findOne({ kind: 'exam_pull_csv', batchId: w.batch._id, status: 'failed' })
        .sort({ startedAt: 1 })
        .lean(),
    ).toMatchObject({
      stats: { rows: 4, applied: 0, failed: 1 },
      failures: [{ row: 4, key: `R9999 · ${code}`, message: 'No student has the roll number R9999.' }],
    });

    expect(await importEndSem(form({ ...w.ids, file: csvFile(filled.join('\n')) }))).toMatchObject({
      ok: true,
      data: { rows: 3 },
    });
    expect(
      (await EndSemMark.findOne({ offeringId: id, studentId: w.students[1]._id }).lean())?.externals,
    ).toMatchObject([{ component: 'practice', marks: null, max: 50, absent: true }]);
    expect(await AuditLog.findOne({ action: 'endsem.imported', entityId: w.ids.batchId }).lean()).toMatchObject({
      after: { rows: 3 },
    });
  });
});

describe('grade sheets (T6, AC-M08-04, AC-M08-05)', () => {
  // 07 §6's worked example for student 1; student 2 lacks an attendance part; student 3 is AB in DECT0901's practice.
  async function sheets(w: World) {
    const dect = await course(w, c(1, 2, 2), `DECT${n}901`);
    const cutm1535 = await course(w, c(3, 0, 1), `CUTM${n}535`);
    const cutm1014 = await course(w, c(1.5, 0, 1.5), `CUTM${n}014`);
    const now = new Date();
    await Offering.updateMany(
      { _id: { $in: [dect, cutm1535, cutm1014].map((x) => x.offering._id) } },
      { $set: { lockedAt: now } },
    );
    const internal = (offering: Types.ObjectId, studentId: Types.ObjectId, components: object, complete = true) =>
      InternalMark.create({
        offeringId: offering,
        studentId,
        components,
        complete,
        parts: complete ? [] : [{ key: 'attendance', marks: null, max: 5, count: 0 }],
        trend: 'insufficient',
        computedAt: now,
      });
    const [a, b, s3] = w.students;
    for (const student of [a, b, s3]) {
      await internal(dect.offering._id, student._id, { theory: 30, practice: student === s3 ? 45 : 44, project: 47 });
      await internal(cutm1535.offering._id, student._id, { theory: 30, project: 40 });
      await internal(
        cutm1014.offering._id,
        student._id,
        { theory: student === b ? null : 25, project: 30 },
        student !== b,
      );
    }
    const row = (s: typeof a, code: string, t: string, p: string, pj: string) =>
      `${s.rollNo},${code},${w.term.code},${t},${p},${pj}`;
    const csv = [
      'rollno,coursecode,termcode,theoryexternal,practiceexternal,projectexternal',
      ...[a, b, s3].flatMap((s) => [
        row(s, dect.code, '57', s === s3 ? 'AB' : '45', '45'),
        row(s, cutm1535.code, '44', '', '40'),
        row(s, cutm1014.code, '35', '', '31'),
      ]),
    ].join('\n');
    await signInAs(w.admin);
    expect(await importEndSem(form({ ...w.ids, file: csvFile(csv) }))).toMatchObject({ ok: true });
    expect(await computeGradeSheets(w.ids)).toMatchObject({ ok: true, data: { started: true } });
    const run = await SyncRun.findOne({ kind: 'grade_sheets', batchId: w.batch._id }).sort({ startedAt: -1 }).lean();
    await finished(`gs-${String(run?._id)}`);
    return { dect, cutm1535, cutm1014 };
  }

  it('reproduce 07 §6, list the incomplete student, and give Ab for AB', async () => {
    const w = await world();
    const { cutm1014 } = await sheets(w);
    const [a, b, s3] = w.students;
    const sheetOf = (s: typeof a) => GradeSheet.findOne({ termId: w.term._id, studentId: s._id }).lean();
    const first = await sheetOf(a);
    expect(first).toMatchObject({ status: 'draft', credits: 12, sgpa: 8.58, batchId: w.batch._id });
    expect(first?.rows.map((r) => [r.pct, r.grade, r.gradePoint])).toEqual([
      [61, 'B+', 7],
      [76, 'A', 8],
      [90, 'O', 10],
    ]);
    expect(await sheetOf(b)).toMatchObject({
      status: 'incomplete',
      rows: [],
      missing: [`${cutm1014.code}: theory internal missing (Attendance)`],
    });
    const third = await sheetOf(s3);
    expect(third).toMatchObject({ status: 'draft', sgpa: 4.42 });
    expect(third?.rows.at(-1)).toMatchObject({ pct: 73, grade: 'Ab', gradePoint: 0 });
    expect(await SyncRun.findOne({ kind: 'grade_sheets', batchId: w.batch._id }).lean()).toMatchObject({
      status: 'succeeded',
      stats: { rows: 3, applied: 2, failed: 1 },
    });
  });

  it('publish to the ready students only, who see their own; then freeze their marks and the lock', async () => {
    const w = await world();
    const { dect } = await sheets(w);
    const [a, b, s3] = w.students;
    await signInAs(a);
    expect(await getMyResults()).toEqual([]);
    await signInAs(w.admin);
    expect(await publishGradeSheets(w.ids)).toMatchObject({ ok: true, data: { published: 2 } });
    expect(await Notification.countDocuments({ kind: 'gradeSheet.published', userId: { $in: [a._id, s3._id] } })).toBe(
      2,
    );
    expect(await Notification.exists({ kind: 'gradeSheet.published', userId: b._id })).toBeNull();
    expect(await AuditLog.findOne({ action: 'gradesheet.published', entityId: w.ids.batchId }).lean()).toMatchObject({
      after: { sheets: 2 },
    });
    await signInAs(a);
    const mine = await getMyResults();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ student: { rollNo: a.rollNo }, sgpa: 8.58, status: 'published' });
    await signInAs(b);
    expect(await getMyResults()).toEqual([]);

    await signInAs(w.admin);
    const again = `rollno,coursecode,termcode,theoryexternal,practiceexternal,projectexternal\n${a.rollNo},${dect.code},${w.term.code},50,45,45`;
    const refused = await importEndSem(form({ ...w.ids, file: csvFile(again) }));
    expect(!refused.ok && refused.fieldErrors?.file?.[0]).toContain('grade sheet for');
    expect(await unlockOffering(form({ offeringId: dect.id, reason: 'A mark needs a correction.' }))).toMatchObject({
      code: 'CONFLICT',
    });
    expect(await unpublishGradeSheets(form({ ...w.ids, reason: 'A mark needs a correction.' }))).toMatchObject({
      ok: true,
      data: { unpublished: 2 },
    });
    expect(await unlockOffering(form({ offeringId: dect.id, reason: 'A mark needs a correction.' }))).toMatchObject({
      ok: true,
    });
    // Drafts that include the unlocked course cannot be published as they are.
    expect(await GradeSheet.findOne({ termId: w.term._id, studentId: a._id }).lean()).toMatchObject({
      status: 'incomplete',
      missing: [`${dect.code} was unlocked after these were worked out.`],
    });
    expect(await publishGradeSheets(w.ids)).toMatchObject({ code: 'CONFLICT' });
  });
});
