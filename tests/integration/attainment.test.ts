import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import { importEndSem, publishGradeSheets } from '@/app/(app)/admin/exams/actions';
import { saveCoMap } from '@/app/(app)/catalog/actions';
import { requestAttainment } from '@/app/(app)/courses/[offeringId]/outcomes/actions';
import { recomputeAttainment } from '@/lib/data/attainment';
import { getOfferingAttainment, getProgramAttainment } from '@/lib/data/attainment-views';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Assessment } from '@/lib/models/assessment';
import { Attainment } from '@/lib/models/attainment';
import { AuditLog } from '@/lib/models/audit-log';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { EndSemMark } from '@/lib/models/end-sem-mark';
import { Enrollment } from '@/lib/models/enrollment';
import { GradeSheet } from '@/lib/models/grade-sheet';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import { SyncRun } from '@/lib/models/sync-run';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import { SETTINGS } from '@/lib/schemas/settings';
import { startComputeWorker } from '@/worker/jobs/compute';
import {
  enroll,
  form,
  makeAssessment,
  makeCourse,
  makeOffering,
  makeProgram,
  makeUser,
  newId,
  signInAs,
} from '../factories';

// M09 (07 §4–5): attainment worked out by the real compute worker from real tests, attempts and end-semester rows.
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
// 07 §4's example has the theory external out of 50: the other theory parts make up the rest of 100.
const POLICY = SETTINGS.evaluation.schema.parse({ theoryMidTerm1: 20, theoryMidTerm2: 20, theoryEndSem: 50 });
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
// The worked example's marks: q1 (CO1, 5), q2 (CO2, 5), a1 (CO2, 10), a2 (CO3, 10), end-sem /50 (null: AB).
const MARKS: [number, number, number, number, number | null][] = [
  [5, 4, 9, 8, 40],
  [4, 3, 7, 6, 32],
  [3, 2, 5, 5, 25],
  [5, 5, 10, 9, 45],
  [2, 1, 4, 3, null],
  [4, 4, 8, 7, 30],
  [3, 3, 6, 4, 29],
  [5, 2, 6, 6, 35],
  [1, 3, 5, 8, 31],
  [4, 5, 9, 2, 20],
];

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;
let n = 0;

beforeAll(async () => {
  await db();
  await Promise.all(
    [
      Assessment,
      Attainment,
      AuditLog,
      Batch,
      Course,
      EndSemMark,
      Enrollment,
      GradeSheet,
      Offering,
      Program,
      Setting,
      Submission,
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

// A programme of one department with titled outcomes, a term, a batch of `size` students, its teacher, head of
// department, another department's head and an admin, and the example course (3-0-0) offered to the batch.
async function world(size = MARKS.length) {
  const i = ++n;
  const departmentId = newId();
  const program = await makeProgram({
    departmentId,
    outcomeTitles: [
      { code: 'PO1', title: 'Engineering knowledge' },
      { code: 'PO2', title: 'Problem analysis' },
    ],
  });
  const term = await Term.create({
    code: `2026-ODD-A${i}`,
    name: `Odd semester A${i}`,
    academicYear: '2026-27',
    startsOn: new Date(Date.UTC(2026, 6, i)),
    endsOn: new Date(Date.UTC(2026, 11, 15)),
    status: 'current',
  });
  const batch = await Batch.create({
    programId: program._id,
    name: `Batch A${i}`,
    startYear: 2000 + i,
    sections: ['A'],
  });
  const [faculty, hod, otherHod, admin] = await Promise.all([
    makeUser({ roles: ['faculty'], departmentId }),
    makeUser({ roles: ['faculty', 'hod'], departmentId }),
    makeUser({ roles: ['faculty', 'hod'], departmentId: newId() }),
    makeUser({ roles: ['admin'] }),
  ]);
  const students = await Promise.all(
    Array.from({ length: size }, (_, s) =>
      makeUser({ batchId: batch._id, programId: program._id, rollNo: `A${i}R${String(s + 1).padStart(2, '0')}` }),
    ),
  );
  const [co1, co2, co3] = [newId(), newId(), newId()];
  const course = await makeCourse({
    credits: { theory: 3, practice: 0, project: 0 },
    cos: [
      { _id: co1, code: 'CO1', statement: 'Write a C program.' },
      { _id: co2, code: 'CO2', statement: 'Use loops.' },
      { _id: co3, code: 'CO3', statement: 'Use arrays.' },
    ],
    coMap: [
      { coId: co1, outcome: 'PO1', level: 3 },
      { coId: co1, outcome: 'PO2', level: 1 },
      { coId: co1, outcome: 'PSO3', level: 3 },
      { coId: co2, outcome: 'PO1', level: 2 },
      { coId: co2, outcome: 'PO2', level: 2 },
      { coId: co2, outcome: 'PO3', level: 1 },
      { coId: co2, outcome: 'PSO3', level: 3 },
      { coId: co3, outcome: 'PO1', level: 2 },
      { coId: co3, outcome: 'PO2', level: 3 },
      { coId: co3, outcome: 'PO3', level: 2 },
      { coId: co3, outcome: 'PSO1', level: 1 },
    ],
  });
  const offering = await makeOffering({
    courseId: course._id,
    termId: term._id,
    batchId: batch._id,
    programId: program._id,
    departmentId,
    credits: { theory: 3, practice: 0, project: 0 },
    evaluation: POLICY,
    facultyIds: [faculty._id],
  });
  await Promise.all(students.map((s) => enroll(offering._id, s._id)));
  return {
    program,
    term,
    batch,
    faculty,
    hod,
    otherHod,
    admin,
    students,
    course,
    offering,
    id: String(offering._id),
    cos: { co1, co2, co3 },
  };
}
type World = Awaited<ReturnType<typeof world>>;

// A test with these fixed questions, its results published, and one graded attempt per student with these marks.
async function marked(w: World, questions: { co: Types.ObjectId; max: number }[], marks: (number | null)[][]) {
  const items = questions.map((q) => ({
    _id: newId(),
    type: 'text',
    prompt: doc('Q'),
    maxMarks: q.max,
    coIds: [q.co],
  }));
  const test = await makeAssessment({
    offeringId: w.offering._id,
    items,
    maxMarks: questions.reduce((sum, q) => sum + q.max, 0),
    status: 'results_published',
  });
  const now = new Date();
  await Submission.create(
    w.students.flatMap((student, s) =>
      marks[s] === undefined
        ? []
        : [
            {
              assessmentId: test._id,
              offeringId: w.offering._id,
              studentId: student._id,
              attemptNo: 1,
              status: 'graded' as const,
              startedAt: now,
              deadlineAt: now,
              submittedAt: now,
              paper: items,
              scores: Object.fromEntries(
                items.map((item, q) => [String(item._id), { marks: marks[s][q] ?? 0, by: 'auto' }]),
              ),
              total: marks[s].reduce<number>((sum, m) => sum + (m ?? 0), 0),
            },
          ],
    ),
  );
  return test;
}

// 07 §4's two tests and end-semester rows (the theory external out of 50).
async function example(w: World, endSem = true) {
  await marked(
    w,
    [
      { co: w.cos.co1, max: 5 },
      { co: w.cos.co2, max: 5 },
    ],
    MARKS.map((m) => [m[0], m[1]]),
  );
  await marked(
    w,
    [
      { co: w.cos.co2, max: 10 },
      { co: w.cos.co3, max: 10 },
    ],
    MARKS.map((m) => [m[2], m[3]]),
  );
  if (!endSem) return;
  await EndSemMark.create(
    w.students.map((student, s) => ({
      offeringId: w.offering._id,
      studentId: student._id,
      externals: [{ component: 'theory' as const, marks: MARKS[s][4], max: 50, absent: MARKS[s][4] === null }],
      source: 'csv' as const,
      syncRunId: newId(),
      importedAt: new Date(),
    })),
  );
}

const record = (w: World) => Attainment.findOne({ offeringId: w.offering._id }).lean();
const values = (r: Awaited<ReturnType<typeof record>>) =>
  Object.fromEntries((r?.outcomes ?? []).map((o) => [o.code, o.value]));
async function finished(jobId: string) {
  const job = await computeQueue().getJob(jobId);
  await job?.waitUntilFinished(queueEvents);
}

describe('working attainment out (07 §4)', () => {
  it('stores the documented example from real attempts and end-semester rows (AC-M09-01)', async () => {
    const w = await world();
    await example(w);
    const now = new Date();
    expect(await recomputeAttainment(w.id, now)).toEqual({ students: 10, warnings: 0 });
    const r = await record(w);
    expect(r?.cos.map((co) => [co.code, co.cie, co.value, co.met])).toEqual([
      ['CO1', { assessed: 10, attained: 8, pct: 80, level: 3 }, 2.5, true],
      ['CO2', { assessed: 10, attained: 6, pct: 60, level: 2 }, 2, true],
      ['CO3', { assessed: 10, attained: 6, pct: 60, level: 2 }, 2, true],
    ]);
    expect(r?.see).toEqual({ considered: 10, attained: 6, pct: 60, level: 2, withoutMarks: 0 });
    expect(values(r)).toMatchObject({ PO1: 2.21, PO2: 2.08, PO3: 2, PO4: null, PSO1: 2, PSO2: null, PSO3: 2.25 });
    // The record keeps the settings and the map it used (A-181), and its denormalized keys for the programme report.
    expect(r).toMatchObject({
      config: SETTINGS.attainment.schema.parse({}),
      programId: w.program._id,
      batchId: w.batch._id,
      termId: w.term._id,
      computedAt: now,
      computedBy: null,
    });
    expect(r?.cells).toHaveLength(11);
  });

  it('follows the settings, and the record states the ones it used (AC-M09-05)', async () => {
    const w = await world();
    await example(w);
    await Setting.create({ _id: 'attainment', value: { cieWeight: 0.4, seeWeight: 0.6 }, updatedBy: w.admin._id });
    try {
      await recomputeAttainment(w.id, new Date());
      const r = await record(w);
      expect(r?.cos.map((co) => co.value)).toEqual([2.4, 2, 2]);
      expect(r?.config).toMatchObject({ cieWeight: 0.4, seeWeight: 0.6 });
    } finally {
      await Setting.deleteOne({ _id: 'attainment' });
    }
  });

  it('without end-semester rows each value is the CIE level, and says so', async () => {
    const w = await world();
    await example(w, false);
    await recomputeAttainment(w.id, new Date());
    const r = await record(w);
    expect(r?.cos.map((co) => co.value)).toEqual([3, 2, 2]);
    expect(r?.warnings).toEqual([
      'No end-semester marks yet: each value is the internal assessments alone (CIE only).',
    ]);
  });

  it('with no published assessment every CO is null with a warning, not 0 (AC-M09-03)', async () => {
    const w = await world(2);
    await recomputeAttainment(w.id, new Date());
    const r = await record(w);
    expect(r?.cos.map((co) => co.value)).toEqual([null, null, null]);
    expect(r?.warnings).toEqual([
      'No end-semester marks yet: each value is the internal assessments alone (CIE only).',
      'CO1 was not assessed in any published assessment.',
      'CO2 was not assessed in any published assessment.',
      'CO3 was not assessed in any published assessment.',
    ]);
    expect(values(r)).toMatchObject({ PO1: null, PSO3: null });
  });

  it('judges each student on their own drawn paper, and a missed draw at 0 (A-179)', async () => {
    const w = await world(3);
    const [d1, d2, d3, d4] = [newId(), newId(), newId(), newId()];
    const q = (id: Types.ObjectId, coIds: Types.ObjectId[]) => ({
      _id: id,
      type: 'text',
      prompt: doc('D'),
      maxMarks: 2,
      coIds,
    });
    const section = newId();
    const test = await makeAssessment({
      offeringId: w.offering._id,
      maxMarks: 4,
      status: 'results_published',
      sections: [
        {
          _id: section,
          title: 'Drawn',
          draw: { count: 2, easy: 50, medium: 50, hard: 0, coIds: [w.cos.co1, w.cos.co2], marksEach: 2 },
        },
      ],
    });
    const now = new Date();
    const attempt = (student: World['students'][number], paper: ReturnType<typeof q>[], marks: number[]) => ({
      assessmentId: test._id,
      offeringId: w.offering._id,
      studentId: student._id,
      attemptNo: 1,
      status: 'graded' as const,
      startedAt: now,
      deadlineAt: now,
      submittedAt: now,
      paper: paper.map((p) => ({ ...p, sectionId: section })),
      scores: Object.fromEntries(paper.map((p, i) => [String(p._id), { marks: marks[i], by: 'auto' }])),
      total: marks.reduce((a, b) => a + b, 0),
    });
    await Submission.create([
      attempt(w.students[0], [q(d1, [w.cos.co1]), q(d2, [w.cos.co2])], [2, 0]),
      attempt(w.students[1], [q(d3, [w.cos.co2]), q(d4, [w.cos.co2, w.cos.co3])], [2, 1]),
    ]);
    await recomputeAttainment(w.id, new Date());
    const r = await record(w);
    expect(r?.cos.map((co) => [co.code, co.cie?.assessed ?? null, co.cie?.attained ?? null, co.value])).toEqual([
      ['CO1', 2, 1, 1],
      ['CO2', 3, 1, 0],
      ['CO3', 1, 0, 0],
    ]);
  });

  it('works out a locked offering, and leaves a skill offering alone', async () => {
    const w = await world(2);
    await example(w, false);
    await Offering.updateOne({ _id: w.offering._id }, { $set: { lockedAt: new Date() } });
    expect(await recomputeAttainment(w.id, new Date())).toMatchObject({ students: 2 });
    await Offering.updateOne({ _id: w.offering._id }, { $set: { category: 'skill' } });
    expect(await recomputeAttainment(w.id, new Date())).toEqual({ skipped: 'skill' });
  });
});

describe('what queues it (EXM-06)', () => {
  it('importing end-semester marks works out the offerings the file touched (AC-M09-02)', async () => {
    const w = await world(2);
    await example(w, false);
    await signInAs(w.admin);
    const csv = [
      'rollNo,courseCode,termCode,theoryExternal,practiceExternal,projectExternal',
      ...w.students.map((s) => `${s.rollNo},${w.course.code},${w.term.code},40,,`),
    ].join('\n');
    const file = new File([csv], 'marks.csv', { type: 'text/csv' });
    expect(await importEndSem(form({ termId: String(w.term._id), batchId: String(w.batch._id), file }))).toMatchObject({
      ok: true,
    });
    await finished(`att-${w.id}`);
    expect((await record(w))?.see).toMatchObject({ considered: 2, attained: 2, pct: 100, level: 3 });
  }, 30_000);

  it('publishing the grade sheets works out the batch’s credit courses', async () => {
    const w = await world(1);
    await GradeSheet.create({
      termId: w.term._id,
      studentId: w.students[0]._id,
      programId: w.program._id,
      batchId: w.batch._id,
      status: 'draft',
      computedAt: new Date(),
    });
    await signInAs(w.admin);
    expect(await publishGradeSheets({ termId: String(w.term._id), batchId: String(w.batch._id) })).toMatchObject({
      ok: true,
    });
    await finished(`att-${w.id}`);
    expect(await record(w)).not.toBeNull();
  }, 30_000);

  it('a new map works into the course’s active offerings only', async () => {
    const w = await world(1);
    const completed = await makeOffering({
      courseId: w.course._id,
      credits: { theory: 3, practice: 0, project: 0 },
      status: 'completed',
    });
    await signInAs(w.admin);
    expect(await saveCoMap(form({ courseId: String(w.course._id), 'cell[]': [`${w.cos.co1}:PO1:3`] }))).toMatchObject({
      ok: true,
    });
    await finished(`att-${w.id}`);
    expect((await record(w))?.cells).toHaveLength(1);
    expect(await computeQueue().getJob(`att-${completed._id}`)).toBeUndefined();
  }, 30_000);

  it('"Work it out again" is for its teacher and admins, once a minute, and names who asked', async () => {
    const w = await world(1);
    await signInAs(w.students[0]);
    expect(await requestAttainment({ offeringId: w.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    await signInAs(w.faculty);
    expect(await requestAttainment({ offeringId: w.id })).toEqual({ ok: true, data: undefined });
    await finished(`att-${w.id}`);
    expect((await record(w))?.computedBy).toEqual(w.faculty._id);
    expect(await requestAttainment({ offeringId: w.id })).toMatchObject({ code: 'RATE_LIMITED' });
  }, 30_000);
});

describe('who reads it (09 §2)', () => {
  it('its teacher, its department’s head and admins; a student gets none, another department 404', async () => {
    const w = await world(1);
    await recomputeAttainment(w.id, new Date());
    await signInAs(w.faculty);
    const view = await getOfferingAttainment(w.id);
    expect(view?.canRecompute).toBe(true);
    expect(view?.record?.cos.map((co) => co.code)).toEqual(['CO1', 'CO2', 'CO3']);
    await signInAs(w.hod);
    expect(await getOfferingAttainment(w.id)).toMatchObject({ canRecompute: false });
    await signInAs(w.admin);
    expect(await getOfferingAttainment(w.id)).toMatchObject({ canRecompute: true });
    await signInAs(w.students[0]);
    expect(await getOfferingAttainment(w.id)).toBeNull();
    await signInAs(w.otherHod);
    await expect(getOfferingAttainment(w.id)).rejects.toThrow(NOT_FOUND);
  });

  it('the programme report counts a course’s sections once and keeps a head to their department (A-182)', async () => {
    const w = await world(1);
    const other = await makeCourse({ credits: { theory: 3, practice: 0, project: 0 } });
    const offeringFor = (courseId: Types.ObjectId, section: string) =>
      makeOffering({
        courseId,
        section,
        termId: w.term._id,
        batchId: w.batch._id,
        programId: w.program._id,
        departmentId: w.offering.departmentId,
      });
    const [sectionB, otherA] = await Promise.all([offeringFor(w.course._id, 'B'), offeringFor(other._id, 'A')]);
    const stored = (offeringId: Types.ObjectId, courseId: Types.ObjectId, po1: number) =>
      Attainment.create({
        offeringId,
        courseId,
        programId: w.program._id,
        batchId: w.batch._id,
        termId: w.term._id,
        config: SETTINGS.attainment.schema.parse({}),
        outcomes: [{ code: 'PO1', value: po1 }],
        computedAt: new Date(),
      });
    await Promise.all([
      stored(w.offering._id, w.course._id, 2.5),
      stored(sectionB._id, w.course._id, 2),
      stored(otherA._id, other._id, 1.5),
    ]);
    const input = { programId: String(w.program._id), batchId: String(w.batch._id) };
    await signInAs(w.hod);
    const report = await getProgramAttainment(input);
    expect(report.courses.map((c) => [c.code, c.outcomes?.find((o) => o.code === 'PO1')?.value])).toEqual(
      [
        [w.course.code, 2.25],
        [other.code, 1.5],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    expect(report.outcomes.find((o) => o.code === 'PO1')?.value).toBe(1.88);
    expect(report).toMatchObject({ target: 2, tooMany: false, program: { titles: { PO1: 'Engineering knowledge' } } });
    await signInAs(w.otherHod);
    await expect(getProgramAttainment(input)).rejects.toThrow(NOT_FOUND);
    await signInAs(w.faculty);
    await expect(getProgramAttainment(input)).rejects.toThrow();
  });
});
