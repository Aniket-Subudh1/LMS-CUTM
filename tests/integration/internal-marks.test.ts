import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import { refreshEvaluation } from '@/app/(app)/admin/offerings/actions';
import { updateAssessmentSettings } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { requestRecompute, saveRubricMarks } from '@/app/(app)/courses/[offeringId]/marks/actions';
import { recomputeInternalMarks } from '@/lib/data/internal-marks';
import { getCeReport, getMarksSheet, getMyMarks, getRubricSheet } from '@/lib/data/marks';
import { releaseResults } from '@/lib/data/results';
import { db } from '@/lib/db';
import { roundHalfUp } from '@/lib/domain/round';
import { env } from '@/lib/env';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { AuditLog } from '@/lib/models/audit-log';
import { Enrollment } from '@/lib/models/enrollment';
import { InternalMark } from '@/lib/models/internal-mark';
import { Offering } from '@/lib/models/offering';
import { RubricMark } from '@/lib/models/rubric-mark';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import { Term } from '@/lib/models/term';
import { computeQueue, mailQueue, queueInternalMarks, redis } from '@/lib/queue';
import { SETTINGS } from '@/lib/schemas/settings';
import { startComputeWorker } from '@/worker/jobs/compute';
import { enroll, form, makeAssessment, makeOffering, makeUser, newId, signInAs } from '../factories';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const DAY = 86_400_000;
const POLICY = SETTINGS.evaluation.schema.parse({});
const PRACTICE = {
  practiceConcept: 4,
  practicePlanning: 8,
  practiceResult: 7.5,
  practiceRecord: 9,
  practiceConduct: 4,
  practiceViva: 8,
};

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, Attendance, AuditLog, Enrollment, InternalMark, Offering, RubricMark, Setting, Submission, Term].map(
      async (m) => {
        await m.createCollection();
        await m.createIndexes();
      },
    ),
  );
  worker = startComputeWorker(env().REDIS_URL);
  queueEvents = new QueueEvents('compute', { connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }) });
  await queueEvents.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), queueEvents.close(), computeQueue().close(), mailQueue().close()]);
  await redis().quit();
});

// 07 §2's worked example as real records: a 3-1-0 course on the default policy taught by `faculty`; `student` has the
// example's results, 17 of 20 classes and the practice rubric; `second` handed in nothing and attended no class.
async function world() {
  const faculty = await makeUser({ roles: ['faculty'] });
  const term = await Term.create({
    code: `T${String(newId()).slice(-8)}`,
    name: 'Odd semester',
    academicYear: '2026-27',
    startsOn: new Date(Date.now() - 60 * DAY),
    endsOn: new Date(Date.now() + 60 * DAY),
  });
  const offering = await makeOffering({
    termId: term._id,
    facultyIds: [faculty._id],
    credits: { theory: 3, practice: 1, project: 0 },
    evaluation: POLICY,
  });
  const [student, second, admin] = await Promise.all([makeUser(), makeUser(), makeUser({ roles: ['admin'] })]);
  const [hod, otherHod] = await Promise.all([
    makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId }),
    makeUser({ roles: ['faculty', 'hod'], departmentId: newId() }),
  ]);
  await Promise.all([enroll(offering._id, student._id), enroll(offering._id, second._id)]);
  const start = Date.now() - 30 * DAY;
  const published = async (title: string, maxMarks: number, countsToward: string | null, day: number) =>
    makeAssessment({
      offeringId: offering._id,
      title,
      maxMarks,
      countsToward,
      status: 'results_published',
      opensAt: new Date(start + day * DAY),
      closesAt: new Date(start + day * DAY + 3_600_000),
    });
  const mt1 = await published('Mid-term test 1', 50, 'midTerm1', 1);
  const mt2 = await published('Presentation', 20, 'midTerm2', 2);
  const a1 = await published('Assignment 1', 10, 'assignment', 3);
  const a2 = await published('Assignment 2', 50, 'assignment', 4);
  const a3 = await published('Assignment 3', 10, 'assignment', 5);
  const quiz = await published('Practice quiz', 10, null, 6);
  const graded = (assessmentId: Types.ObjectId, total: number) =>
    Submission.create({
      assessmentId,
      offeringId: offering._id,
      studentId: student._id,
      attemptNo: 1,
      status: 'graded',
      startedAt: new Date(start),
      deadlineAt: new Date(start + 3_600_000),
      submittedAt: new Date(start),
      total,
    });
  await Promise.all([
    graded(mt1._id, 34),
    graded(mt2._id, 16),
    graded(a1._id, 8),
    graded(a2._id, 30),
    graded(quiz._id, 9),
  ]);
  await Attendance.insertMany(
    Array.from({ length: 20 }, (_, i) => ({
      sessionId: newId(),
      offeringId: offering._id,
      studentId: student._id,
      status: i < 17 ? 'present' : 'absent',
    })),
  );
  await RubricMark.create({
    offeringId: offering._id,
    studentId: student._id,
    component: 'practice',
    criteria: PRACTICE,
    updatedBy: faculty._id,
  });
  return { faculty, offering, student, second, admin, hod, otherHod, mt1, a3 };
}
type World = Awaited<ReturnType<typeof world>>;
const marksOf = (w: World, who: { _id: Types.ObjectId }) =>
  InternalMark.findOne({ offeringId: w.offering._id, studentId: who._id }).lean();

describe('recomputeInternalMarks (07 §2–3)', () => {
  it('stores the worked example: theory 28.53 of 40, practice 40.5 of 50, 76.7 % (AC-M06-01)', async () => {
    const w = await world();
    expect(await recomputeInternalMarks(String(w.offering._id), new Date())).toEqual({ students: 2 });
    const row = await marksOf(w, w.student);
    expect(row?.parts.map((p) => [p.key, roundHalfUp(p.marks ?? Number.NaN, 2), p.count])).toEqual([
      ['midTerm1', 10.2, 1],
      ['midTerm2', 12, 1],
      ['assignment', 2.33, 3],
      ['attendance', 4, 20],
    ]);
    expect(roundHalfUp(row?.components.theory ?? Number.NaN, 2)).toBe(28.53);
    expect(row).toMatchObject({ components: { practice: 40.5 }, complete: true, internalPct: 76.7, attendancePct: 85 });
    // Every published result is in the trend, the missed assignment as 0 and the quiz that counts toward nothing.
    expect(row?.points).toEqual([68, 80, 80, 60, 0, 90]);
  });

  it('counts a missed assessment as 0 and leaves a part without classes or rubric incomplete', async () => {
    const w = await world();
    await recomputeInternalMarks(String(w.offering._id), new Date());
    expect(await marksOf(w, w.second)).toMatchObject({
      parts: [
        { key: 'midTerm1', marks: 0 },
        { key: 'midTerm2', marks: 0 },
        { key: 'assignment', marks: 0 },
        { key: 'attendance', marks: null, count: 0 },
      ],
      components: { theory: null, practice: null },
      complete: false,
      internalPct: null,
      // Every result 0: flat, so steady.
      trend: 'steady',
    });
  });

  it('skips a locked offering and removes a dropped student’s row', async () => {
    const w = await world();
    await recomputeInternalMarks(String(w.offering._id), new Date());
    await Enrollment.updateOne(
      { offeringId: w.offering._id, studentId: w.second._id },
      { $set: { status: 'dropped' } },
    );
    await Offering.updateOne({ _id: w.offering._id }, { $set: { lockedAt: new Date() } });
    expect(await recomputeInternalMarks(String(w.offering._id), new Date())).toEqual({ skipped: 'locked' });
    expect(await marksOf(w, w.second)).not.toBeNull();
    await Offering.updateOne({ _id: w.offering._id }, { $unset: { lockedAt: 1 } });
    expect(await recomputeInternalMarks(String(w.offering._id), new Date())).toEqual({ students: 1 });
    expect(await marksOf(w, w.second)).toBeNull();
  });
});

describe('the triggers (AC-M06-02)', () => {
  it('releasing results queues one recompute, which the worker runs; a change seconds later joins it', async () => {
    const w = await world();
    const quiz = await makeAssessment({ offeringId: w.offering._id, maxMarks: 10, countsToward: 'assignment' });
    await computeQueue().remove(`ce-${String(w.offering._id)}`);
    expect(await releaseResults(quiz, String(w.faculty._id), new Date())).toBe(true);
    const job = await computeQueue().getJob(`ce-${String(w.offering._id)}`);
    expect(await job?.getState()).toBe('delayed');
    await queueInternalMarks(String(w.offering._id));
    const pending = await computeQueue().getJobs(['delayed', 'waiting', 'active']);
    expect(pending.filter((j) => j.id?.startsWith(`ce-${String(w.offering._id)}`))).toHaveLength(1);
    await job?.waitUntilFinished(queueEvents);
    // Four published assignments now: 8/10, 30/50 and two missed.
    const row = await marksOf(w, w.student);
    expect(roundHalfUp(row?.parts.find((p) => p.key === 'assignment')?.marks ?? Number.NaN, 2)).toBe(1.75);
  }, 30_000);
});

describe('"Counts toward" (Q-41)', () => {
  const settings = (w: World, countsToward: string) => ({
    assessmentId: String(w.mt1._id),
    title: 'Mid-term test 1',
    opensAt: '2026-10-01T10:00',
    closesAt: '2026-10-01T11:00',
    countsToward,
  });

  it('changes with the settings, audited, and not while marks are locked (AC-M06-06)', async () => {
    const w = await world();
    await signInAs(w.faculty);
    expect(await updateAssessmentSettings(form(settings(w, 'midTerm2')))).toMatchObject({ ok: true });
    expect(await Assessment.findById(w.mt1._id, { countsToward: 1 }).lean()).toMatchObject({
      countsToward: 'midTerm2',
    });
    expect(
      await AuditLog.findOne({ action: 'assessment.counts_toward', entityId: String(w.mt1._id) }).lean(),
    ).toMatchObject({
      before: { countsToward: 'midTerm1' },
      after: { countsToward: 'midTerm2' },
    });
    expect(await updateAssessmentSettings(form(settings(w, 'none')))).toMatchObject({ ok: true });
    expect(await Assessment.findById(w.mt1._id, { countsToward: 1 }).lean()).toMatchObject({ countsToward: null });
    await Offering.updateOne({ _id: w.offering._id }, { $set: { lockedAt: new Date() } });
    expect(await updateAssessmentSettings(form(settings(w, 'midTerm1')))).toMatchObject({ code: 'LOCKED' });
  });

  it('is refused on a course without theory credits', async () => {
    const w = await world();
    await Offering.updateOne({ _id: w.offering._id }, { $set: { 'credits.theory': 0 } });
    await signInAs(w.faculty);
    expect(await updateAssessmentSettings(form(settings(w, 'midTerm1')))).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { countsToward: [expect.stringContaining('theory credits')] },
    });
  });
});

describe('the practice rubric (Q-41)', () => {
  const grid = (w: World, marks: string[]) => ({
    offeringId: String(w.offering._id),
    component: 'practice',
    'student[]': [String(w.second._id)],
    'mark[]': marks,
  });

  it('is saved by the class’s teacher, audited per changed student, and kept out of reach while locked', async () => {
    const w = await world();
    await signInAs(w.faculty);
    expect(await saveRubricMarks(form(grid(w, ['5', '10', '', '10', '5', '10'])))).toMatchObject({ ok: true });
    expect(
      await RubricMark.findOne({ offeringId: w.offering._id, studentId: w.second._id }, { criteria: 1 }).lean(),
    ).toMatchObject({ criteria: { practiceConcept: 5, practiceViva: 10 } });
    const audited = () => AuditLog.countDocuments({ action: 'marks.rubric_saved', entityId: String(w.second._id) });
    expect(await audited()).toBe(1);
    // The same marks again change nothing.
    await saveRubricMarks(form(grid(w, ['5', '10', '', '10', '5', '10'])));
    expect(await audited()).toBe(1);
    expect(await saveRubricMarks(form(grid(w, ['6', '10', '', '10', '5', '10'])))).toMatchObject({
      code: 'VALIDATION',
      message: 'Concept is out of 5.',
    });
    expect(await saveRubricMarks(form(grid(w, ['5', '10'])))).toMatchObject({ code: 'VALIDATION' });
    await Offering.updateOne({ _id: w.offering._id }, { $set: { lockedAt: new Date() } });
    expect(await saveRubricMarks(form(grid(w, ['4', '10', '', '10', '5', '10'])))).toMatchObject({ code: 'LOCKED' });
  });

  it('is not saved by a student or a head of department, and a project rubric needs project credits', async () => {
    const w = await world();
    await signInAs(w.student);
    expect(await saveRubricMarks(form(grid(w, ['5', '10', '', '10', '5', '10'])))).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(w.hod);
    await expect(saveRubricMarks(form(grid(w, ['5', '10', '', '10', '5', '10'])))).rejects.toMatchObject({
      digest: NOT_FOUND,
    });
    await signInAs(w.faculty);
    expect(
      await saveRubricMarks(form({ ...grid(w, ['1', '1', '1', '1', '1', '1']), component: 'project' })),
    ).toMatchObject({ code: 'VALIDATION' });
    expect(await requestRecompute(form({ offeringId: String(w.offering._id) }))).toMatchObject({ ok: true });
    expect(await requestRecompute(form({ offeringId: String(w.offering._id) }))).toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('the evaluation policy copy (AC-M06-04)', () => {
  it('changes no offering’s marks until an admin refreshes it, audited', async () => {
    const w = await world();
    await Setting.create({
      _id: 'evaluation',
      value: { ...POLICY, theoryMidTerm1: 20, theoryEndSem: 55 },
      updatedBy: newId(),
    });
    await recomputeInternalMarks(String(w.offering._id), new Date());
    expect((await marksOf(w, w.student))?.parts[0]).toMatchObject({ max: 15 });
    await signInAs(w.faculty);
    expect(await refreshEvaluation(form({ offeringId: String(w.offering._id) }))).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(w.admin);
    expect(await refreshEvaluation(form({ offeringId: String(w.offering._id) }))).toMatchObject({ ok: true });
    expect(
      await AuditLog.findOne({ action: 'offering.evaluation_refreshed', entityId: String(w.offering._id) }).lean(),
    ).toMatchObject({ before: { theoryMidTerm1: 15 }, after: { theoryMidTerm1: 20 } });
    await recomputeInternalMarks(String(w.offering._id), new Date());
    const part = (await marksOf(w, w.student))?.parts[0];
    expect([part?.max, roundHalfUp(part?.marks ?? Number.NaN, 2)]).toEqual([20, 13.6]);
    await Setting.deleteOne({ _id: 'evaluation' });
  });
});

describe('who reads the marks (09 §3, AC-M06-05)', () => {
  it('shows the class to its teacher and the department’s head, and a student only their own', async () => {
    const w = await world();
    await recomputeInternalMarks(String(w.offering._id), new Date());
    const id = String(w.offering._id);
    await signInAs(w.faculty);
    const sheet = await getMarksSheet(id, {}, 1);
    expect(sheet).toMatchObject({ canTeach: true, counts: { students: 2, complete: 1, dropping: 1 }, total: 2 });
    expect(sheet.counting.assignment.map((a) => a.title)).toEqual(['Assignment 1', 'Assignment 2', 'Assignment 3']);
    expect(sheet.notCounted).toBe(1);
    expect((await getMarksSheet(id, { show: 'incomplete' }, 1)).rows.map((r) => r.id)).toEqual([String(w.second._id)]);
    expect((await getRubricSheet(id, 'practice', undefined, 1)).rows).toHaveLength(2);
    await expect(getRubricSheet(id, 'project', undefined, 1)).rejects.toMatchObject({ digest: NOT_FOUND });

    await signInAs(w.hod);
    expect((await getMarksSheet(id, {}, 1)).canTeach).toBe(false);
    const report = await getCeReport({ termId: String(w.offering.termId) }, 1);
    expect(report.rows.map((r) => r.id)).toEqual([id]);
    expect(report.rows[0]).toMatchObject({ students: 2, completePct: 50, dropping: 1, averagePct: 76.7 });

    await signInAs(w.otherHod);
    await expect(getMarksSheet(id, {}, 1)).rejects.toMatchObject({ digest: NOT_FOUND });
    expect((await getCeReport({ termId: String(w.offering.termId) }, 1)).rows).toEqual([]);

    await signInAs(w.student);
    await expect(getMarksSheet(id, {}, 1)).rejects.toMatchObject({ digest: NOT_FOUND });
    const mine = await getMyMarks(id);
    expect(mine).toMatchObject({ complete: true, internalPct: 76.7, attendance: { attended: 17, held: 20, pct: 85 } });
    expect(mine.parts.find((p) => p.key === 'assignment')?.assessments).toEqual([
      { title: 'Assignment 1', counted: 8, maxMarks: 10 },
      { title: 'Assignment 2', counted: 30, maxMarks: 50 },
      { title: 'Assignment 3', counted: null, maxMarks: 10 },
    ]);
    expect(JSON.stringify(mine)).not.toContain(String(w.second._id));
  });

  it('never counts a standalone test', async () => {
    const w = await world();
    await makeAssessment({ offeringId: null, ownerIds: [w.faculty._id], maxMarks: 10, status: 'results_published' });
    await recomputeInternalMarks(String(w.offering._id), new Date());
    expect((await marksOf(w, w.student))?.points).toHaveLength(6);
  });
});
