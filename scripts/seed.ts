import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import mongoose, { Types } from 'mongoose';
import { hashPassword } from '@/lib/auth/password';
import { addEngagement, snapshotEngagement } from '@/lib/data/engagement';
import { recomputeInternalMarks } from '@/lib/data/internal-marks';
import { db } from '@/lib/db';
import { DEFAULT_OUTCOME_TITLES, mergeCos } from '@/lib/domain/catalog';
import { normalizeCourseware } from '@/lib/domain/courseware';
import { parseCoursePage } from '@/lib/integrations/courseware';
import { Assessment } from '@/lib/models/assessment';
import { Attainment } from '@/lib/models/attainment';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Department } from '@/lib/models/department';
import { EndSemMark } from '@/lib/models/end-sem-mark';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { GradeSheet } from '@/lib/models/grade-sheet';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { RubricMark } from '@/lib/models/rubric-mark';
import { Submission } from '@/lib/models/submission';
import { SyncRun } from '@/lib/models/sync-run';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { Password } from '@/lib/schemas/auth';
import { SETTINGS } from '@/lib/schemas/settings';

// Development data (10 §3). Safe to run again: every record is inserted only if it is missing.
// With --e2e the fixture users also get a password (E2E_PASSWORD, set in .env.e2e) and an active account, and an
// administrator is created; without it they stay invited unless SEED_PASSWORD is set, which does the same.
// The courses are real CUTM courses (codes, titles and T-P-Pj from the Course Repository); CUTM1535's content is
// its public courseware page (tests/fixtures/courseware/836.html). CUTM1602's outcomes, mapping, modules and
// sessions are fixtures for the tests, not CUTM's. Without --e2e, four CSE courses are added whose code, credits
// and content are their courseware pages, each offered to section A.
const { values } = parseArgs({ options: { e2e: { type: 'boolean' }, 'allow-remote': { type: 'boolean' } } });
const e2e = values.e2e === true;

function found<T>(doc: T | null, what: string): T {
  if (!doc) throw new Error(`seed: ${what} was not created`);
  return doc;
}

// Fixture data must never reach a shared or hosted database unless the developer names it with --allow-remote, and
// never a production one.
const host = new URL(process.env.MONGODB_URI ?? 'mongodb://invalid').hostname;
const local = ['localhost', '127.0.0.1'].includes(host);
if (process.env.NODE_ENV === 'production' || (!local && values['allow-remote'] !== true)) {
  console.error(
    `Refusing to seed "${host}": the seed only runs against a local MongoDB unless --allow-remote is given.`,
  );
  process.exit(1);
}

const wanted = e2e ? process.env.E2E_PASSWORD : process.env.SEED_PASSWORD;
const password = Password.safeParse(wanted);
if ((e2e || wanted !== undefined) && !password.success) {
  console.error(`${e2e ? 'E2E_PASSWORD' : 'SEED_PASSWORD'} needs at least 10 characters.`);
  process.exit(1);
}
const passwordHash = password.success ? await hashPassword(password.data) : undefined;

await db();

const person = (
  email: string,
  name: string,
  roles: ('admin' | 'hod' | 'faculty' | 'student')[],
  extra: object = {},
) => ({
  updateOne: {
    filter: { email },
    update: {
      $setOnInsert: { name, email, roles, sessionVersion: 1, ...extra },
      $set: passwordHash ? { passwordHash, status: 'active' } : { status: 'invited' },
    },
    upsert: true,
  },
});

const upsert = <T>(model: mongoose.Model<T>, filter: object, doc: object) =>
  model.findOneAndUpdate(filter, { $setOnInsert: doc }, { upsert: true, returnDocument: 'after' }).lean();

const [cse, math] = await Promise.all([
  upsert(Department, { code: 'CSE' }, { code: 'CSE', name: 'Computer Science and Engineering' }),
  upsert(Department, { code: 'MATH' }, { code: 'MATH', name: 'Mathematics' }),
]);
const department = found(cse, 'department CSE');
const mathematics = found(math, 'department MATH');

// NBA's twelve programme outcomes for B.Tech, and CPP-02's PSO titles.
const BTECH_POS = [
  'Engineering knowledge',
  'Problem analysis',
  'Design/development of solutions',
  'Conduct investigations of complex problems',
  'Modern tool usage',
  'The engineer and society',
  'Environment and sustainability',
  'Ethics',
  'Individual and team work',
  'Communication',
  'Project management and finance',
  'Life-long learning',
].map((title, i) => ({ code: `PO${i + 1}`, title }));
const psos = DEFAULT_OUTCOME_TITLES.map((o) => ({ ...o }));

const [btech, msc] = await Promise.all([
  upsert(
    Program,
    { code: 'BTECH-CSE' },
    {
      code: 'BTECH-CSE',
      name: 'B.Tech Computer Science and Engineering',
      departmentId: department._id,
      durationSemesters: 8,
      outcomeTitles: [...BTECH_POS, ...psos],
      // The Programme Structure's basket names; their scope and minimum credits are not confirmed, so not set.
      baskets: ['Basket I', 'Basket II', 'Basket IV'].map((name) => ({ name })),
    },
  ),
  upsert(
    Program,
    { code: 'MSC-MATH' },
    {
      code: 'MSC-MATH',
      name: 'M.Sc Mathematics',
      departmentId: mathematics._id,
      durationSemesters: 4,
      outcomeTitles: psos,
      baskets: [{ name: 'Basket I' }],
    },
  ),
]);
const program = found(btech, 'programme BTECH-CSE');
const mscMath = found(msc, 'programme MSC-MATH');

const batch = found(
  await upsert(
    Batch,
    { programId: program._id, startYear: 2025 },
    { programId: program._id, name: '2025', startYear: 2025, sections: ['A', 'B'] },
  ),
  'batch 2025',
);
const term = found(
  await upsert(
    Term,
    { code: '2026-ODD' },
    {
      code: '2026-ODD',
      name: 'Odd semester 2026',
      academicYear: '2026-27',
      startsOn: new Date('2026-07-01T00:00:00+05:30'),
      endsOn: new Date('2026-12-31T00:00:00+05:30'),
      status: 'current',
    },
  ),
  'term 2026-ODD',
);

const staff = [
  person('hod@seed.cutm.test', 'Hema Mishra', ['hod', 'faculty'], { employeeId: 'E001', departmentId: department._id }),
  person('faculty1@seed.cutm.test', 'Pradeep Sahoo', ['faculty'], {
    employeeId: 'E002',
    departmentId: department._id,
  }),
  person('faculty2@seed.cutm.test', 'Lipika Das', ['faculty'], { employeeId: 'E003', departmentId: department._id }),
  ...(passwordHash ? [person('admin@seed.cutm.test', 'Anil Admin', ['admin'])] : []),
];
const students = Array.from({ length: 20 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return person(`student${n}@seed.cutm.test`, `Student ${n}`, ['student'], {
    rollNo: `2501CSE0${n}`,
    programId: program._id,
    batchId: batch._id,
    section: 'A',
    departmentId: department._id,
  });
});
await User.bulkWrite([...staff, ...students]);

const faculty1 = found(await User.findOne({ email: 'faculty1@seed.cutm.test' }, { _id: 1 }).lean(), 'faculty1');
const faculty2 = found(await User.findOne({ email: 'faculty2@seed.cutm.test' }, { _id: 1 }).lean(), 'faculty2');

const co = ['CO1', 'CO2', 'CO3'].map((code) => ({ _id: new Types.ObjectId(), code }));
const cutm1535 = normalizeCourseware(parseCoursePage(readFileSync('tests/fixtures/courseware/836.html', 'utf8')));
const [cutm1602, , cutm1014, , sk01] = await Promise.all([
  upsert(
    Course,
    { code: 'CUTM1602' },
    {
      code: 'CUTM1602',
      title: 'Programming in C',
      type: 'core',
      credits: { theory: 1, practice: 2, project: 1 },
      status: 'active',
      coordinatorId: faculty1._id,
      objectives: ['Write structured programs in C.', 'Use pointers, arrays and files correctly.'],
      cos: [
        { _id: co[0]._id, code: 'CO1', statement: 'Explain the basic constructs of C.', bloomLevels: ['understand'] },
        {
          _id: co[1]._id,
          code: 'CO2',
          statement: 'Write programs with functions and arrays.',
          bloomLevels: ['apply'],
        },
        {
          _id: co[2]._id,
          code: 'CO3',
          statement: 'Design programs that use pointers and files.',
          bloomLevels: ['apply', 'create'],
        },
      ],
      coMap: [
        { coId: co[0]._id, outcome: 'PO1', level: 3 },
        { coId: co[1]._id, outcome: 'PO2', level: 2 },
        { coId: co[1]._id, outcome: 'PO3', level: 2 },
        { coId: co[2]._id, outcome: 'PO3', level: 3 },
        { coId: co[2]._id, outcome: 'PSO3', level: 1 },
      ],
      modules: [
        {
          title: 'Basics of C',
          hours: '2+4+2',
          topics: 'Data types, operators and expressions; control flow.',
          practicals: ['Swap two numbers.', 'Print a multiplication table.'],
        },
        {
          title: 'Pointers and files',
          hours: '2+4+2',
          topics: 'Pointers, arrays and strings; reading and writing files.',
          practicals: ['Reverse an array with pointers.'],
        },
      ],
      projects: ['A student records manager in C.'],
      textbooks: ['B. W. Kernighan and D. M. Ritchie, The C Programming Language, 2nd edition, Prentice Hall.'],
      sessionPlan: [
        { topic: 'Structure of a C program', kind: 'theory' },
        { topic: 'Operators and expressions', kind: 'practice' },
        { topic: 'Control flow', kind: 'theory' },
        { topic: 'Arrays and functions', kind: 'practice' },
        { topic: 'Pointers', kind: 'theory' },
        { topic: 'Student records manager', kind: 'project' },
      ],
    },
  ),
  upsert(
    Course,
    { code: 'CUTM1001' },
    {
      code: 'CUTM1001',
      title: 'Differential Equations and Linear Algebra',
      type: 'core',
      credits: { theory: 2, practice: 0, project: 1 },
      status: 'active',
    },
  ),
  upsert(
    Course,
    { code: 'CUTM1014' },
    {
      code: 'CUTM1014',
      title: 'Gender, Human Rights and Ethics',
      type: 'core',
      credits: { theory: 1.5, practice: 0, project: 1.5 },
      status: 'active',
    },
  ),
  upsert(
    Course,
    { code: 'CUTM1535' },
    {
      code: 'CUTM1535',
      title: 'Advanced complex analysis',
      type: 'core',
      credits: { theory: 3, practice: 0, project: 1 },
      status: 'active',
      objectives: cutm1535.objectives,
      cos: cutm1535.cos,
      modules: cutm1535.modules,
      projects: cutm1535.projects,
      textbooks: cutm1535.textbooks,
      references: cutm1535.references,
      sessionPlan: cutm1535.sessionPlan,
      issues: cutm1535.issues,
      reviewNeeded: cutm1535.issues.length > 0,
    },
  ),
  upsert(
    Course,
    { code: 'SK01' },
    {
      code: 'SK01',
      title: 'Excel Basics',
      type: 'skill',
      credits: { theory: 0, practice: 0, project: 0 },
      status: 'active',
    },
  ),
]);
const programming = found(cutm1602, 'course CUTM1602');
const ethics = found(cutm1014, 'course CUTM1014');
const excel = found(sk01, 'course SK01');
const byCode = new Map(
  (
    await Course.find({ code: { $in: ['CUTM1602', 'CUTM1001', 'CUTM1014', 'CUTM1535', 'SK01'] } }, { code: 1 }).lean()
  ).map((c) => [c.code, c._id]),
);
const curriculum: [Types.ObjectId, string, string | null, string | null][] = [
  [program._id, 'CUTM1602', null, null],
  [program._id, 'CUTM1001', 'Basket I', 'Foundation'],
  [program._id, 'CUTM1014', 'Basket II', 'Humanities and Management(A)'],
  [program._id, 'SK01', null, null],
  [mscMath._id, 'CUTM1535', 'Basket I', 'Core'],
];
await CurriculumEntry.bulkWrite(
  curriculum.map(([programId, code, basket, courseType]) => ({
    updateOne: {
      filter: { programId, courseId: byCode.get(code) },
      update: { $setOnInsert: { programId, courseId: byCode.get(code), courseCode: code, basket, courseType } },
      upsert: true,
    },
  })),
);

const offering = found(
  await upsert(
    Offering,
    { courseId: programming._id, termId: term._id, batchId: batch._id, section: 'A' },
    {
      courseId: programming._id,
      termId: term._id,
      batchId: batch._id,
      section: 'A',
      programId: program._id,
      departmentId: department._id,
      category: 'ugc',
      credits: programming.credits,
      evaluation: SETTINGS.evaluation.schema.parse({}),
      title: 'CUTM1602 · Programming in C · 2026-ODD · A',
      facultyIds: [faculty1._id],
      projectMode: 'github',
      modules: programming.modules.map((m, order) => ({ title: m.title, order })),
      status: 'active',
    },
  ),
  'offering CUTM1602 A',
);
await upsert(
  Offering,
  { courseId: excel._id, termId: term._id, batchId: batch._id, section: 'B' },
  {
    courseId: excel._id,
    termId: term._id,
    batchId: batch._id,
    section: 'B',
    programId: program._id,
    departmentId: department._id,
    category: 'skill',
    credits: excel.credits,
    evaluation: null,
    title: 'SK01 · Excel Basics · 2026-ODD · B',
    facultyIds: [faculty2._id],
    status: 'active',
  },
);

// M07: a project course on the task tracker (projects.spec.ts), to section A as well.
const tracker = found(
  await upsert(
    Offering,
    { courseId: ethics._id, termId: term._id, batchId: batch._id, section: 'A' },
    {
      courseId: ethics._id,
      termId: term._id,
      batchId: batch._id,
      section: 'A',
      programId: program._id,
      departmentId: department._id,
      category: 'ugc',
      credits: ethics.credits,
      evaluation: SETTINGS.evaluation.schema.parse({}),
      title: 'CUTM1014 · Gender, Human Rights and Ethics · 2026-ODD · A',
      facultyIds: [faculty2._id],
      projectMode: 'tracker',
      modules: [],
      status: 'active',
    },
  ),
  'offering CUTM1014 A',
);

const enrolled = await User.find({ batchId: batch._id, section: 'A', roles: 'student' }, { _id: 1 }).lean();
await Enrollment.bulkWrite(
  [offering, tracker].flatMap(({ _id: offeringId }) =>
    enrolled.map((s) => ({
      updateOne: {
        filter: { offeringId, studentId: s._id },
        update: { $setOnInsert: { offeringId, studentId: s._id, status: 'active' } },
        upsert: true,
      },
    })),
  ),
);

// M08 (tests/e2e/exams.spec.ts): a closed term with one practice-only course, so its grade sheets hold nothing else;
// every student's practice rubric is filled. Each e2e seed starts this term's lock, marks and sheets over.
if (e2e) {
  const past = found(
    await upsert(
      Term,
      { code: '2025-EVEN' },
      {
        code: '2025-EVEN',
        name: 'Even semester 2025-26',
        academicYear: '2025-26',
        startsOn: new Date('2026-01-05T00:00:00+05:30'),
        endsOn: new Date('2026-05-30T00:00:00+05:30'),
        status: 'closed',
      },
    ),
    'term 2025-EVEN',
  );
  const lab = found(
    await upsert(
      Course,
      { code: 'LAB0201' },
      { code: 'LAB0201', title: 'Programming Lab', credits: { theory: 0, practice: 2, project: 0 }, status: 'active' },
    ),
    'course LAB0201',
  );
  const labOffering = found(
    await upsert(
      Offering,
      { courseId: lab._id, termId: past._id, batchId: batch._id, section: 'A' },
      {
        courseId: lab._id,
        termId: past._id,
        batchId: batch._id,
        section: 'A',
        programId: program._id,
        departmentId: department._id,
        category: 'ugc',
        credits: lab.credits,
        evaluation: SETTINGS.evaluation.schema.parse({}),
        title: 'LAB0201 · Programming Lab · 2025-EVEN · A',
        facultyIds: [faculty1._id],
        modules: [],
        status: 'completed',
      },
    ),
    'offering LAB0201 A',
  );
  await Promise.all([
    Offering.updateOne({ _id: labOffering._id }, { $unset: { lockedAt: 1, lockedBy: 1, lastPushedAt: 1 } }),
    EndSemMark.deleteMany({ offeringId: labOffering._id }),
    GradeSheet.deleteMany({ termId: past._id }),
    SyncRun.deleteMany({ termId: past._id }),
  ]);
  const criteria = {
    practiceConcept: 4,
    practicePlanning: 8,
    practiceResult: 7.5,
    practiceRecord: 9,
    practiceConduct: 4,
    practiceViva: 8,
  };
  await Enrollment.bulkWrite(
    enrolled.map((s) => ({
      updateOne: {
        filter: { offeringId: labOffering._id, studentId: s._id },
        update: { $setOnInsert: { offeringId: labOffering._id, studentId: s._id, status: 'active' } },
        upsert: true,
      },
    })),
  );
  await RubricMark.bulkWrite(
    enrolled.map((s) => ({
      updateOne: {
        filter: { offeringId: labOffering._id, studentId: s._id, component: 'practice' },
        update: { $set: { criteria, updatedBy: faculty1._id } },
        upsert: true,
      },
    })),
  );
  // As saving the rubric would, so the batch page reads complete marks.
  await recomputeInternalMarks(String(labOffering._id), new Date());
}

// M09 (tests/e2e/outcomes.spec.ts): CUTM1602 A gets a published quiz with one question per outcome, a marked attempt
// for every student, and end-semester marks for all but the last, so its teacher has attainment to work out. Each e2e
// seed starts the attempts, the marks and the attainment record over. 15, 12 and 9 of 20 reach 60 % on CO1–CO3, and
// 13 of 19 on the end-semester marks (credits 1-2-1).
if (e2e) {
  const now = new Date();
  const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const quiz = found(
    await upsert(
      Assessment,
      { offeringId: offering._id, title: 'Outcomes quiz (seeded)' },
      {
        offeringId: offering._id,
        mode: 'quiz',
        title: 'Outcomes quiz (seeded)',
        opensAt: new Date(now.getTime() - 7 * 86_400_000),
        closesAt: new Date(now.getTime() - 6 * 86_400_000),
        status: 'results_published',
        createdBy: faculty1._id,
        maxMarks: 15,
        items: programming.cos.map((c) => ({
          _id: new Types.ObjectId(),
          type: 'text',
          prompt: doc(`Answer on ${c.code}: ${c.statement}`),
          maxMarks: 5,
          coIds: [c._id],
        })),
      },
    ),
    'the seeded outcomes quiz',
  );
  const reached = [15, 12, 9];
  await Promise.all([
    Submission.deleteMany({ assessmentId: quiz._id }),
    EndSemMark.deleteMany({ offeringId: offering._id }),
    Attainment.deleteMany({ offeringId: offering._id }),
  ]);
  await Submission.insertMany(
    enrolled.map((s, i) => {
      const marks = quiz.items.map((_, q) => (i < reached[q] ? 4 : 2));
      return {
        assessmentId: quiz._id,
        offeringId: offering._id,
        studentId: s._id,
        attemptNo: 1,
        status: 'graded',
        startedAt: quiz.opensAt,
        deadlineAt: quiz.closesAt,
        submittedAt: quiz.opensAt,
        paper: quiz.items,
        scores: Object.fromEntries(quiz.items.map((item, q) => [String(item._id), { marks: marks[q], by: 'auto' }])),
        total: marks.reduce((sum, m) => sum + m, 0),
      };
    }),
  );
  const syncRunId = new Types.ObjectId();
  await EndSemMark.insertMany(
    enrolled.slice(0, -1).map((s, i) => ({
      offeringId: offering._id,
      studentId: s._id,
      externals: [
        { component: 'theory', marks: i < 13 ? 45 : 25, max: 60, absent: false },
        { component: 'practice', marks: i < 13 ? 35 : 20, max: 50, absent: false },
        { component: 'project', marks: i < 13 ? 35 : 25, max: 50, absent: false },
      ],
      source: 'csv',
      syncRunId,
      importedAt: now,
    })),
  );
}

// M10 (tests/e2e/people.spec.ts, home.spec.ts): CUTM1014 A has no classes, assessments or videos, so its engagement is
// its study counters alone. Student 01–10 make five quiz attempts on each of the last five days and Student 11–20 one,
// on one day, and the snapshot is written: half the class is high (100) and half low (10). Each e2e seed starts the
// counters over.
if (e2e) {
  const now = new Date();
  const trackerId = String(tracker._id);
  const roll = await User.find({ _id: { $in: enrolled.map((s) => s._id) } }, { rollNo: 1 })
    .sort({ rollNo: 1 })
    .lean();
  await EngagementDaily.deleteMany({ offeringId: tracker._id });
  await addEngagement(
    roll.flatMap((s, i) =>
      Array.from({ length: i < 10 ? 5 : 1 }, (_, day) => ({
        offeringId: trackerId,
        studentId: String(s._id),
        at: new Date(now.getTime() - (day + 1) * 86_400_000),
        inc: { quizAttempts: i < 10 ? 5 : 1 },
      })),
    ),
  );
  await snapshotEngagement(trackerId, now);
}

const hod = found(await User.findOne({ email: 'hod@seed.cutm.test' }, { _id: 1 }).lean(), 'hod');
const csePages = e2e
  ? []
  : [
      { page: 1137, facultyIds: [faculty1._id], projectMode: null },
      { page: 750, facultyIds: [faculty2._id], projectMode: 'github' as const },
      { page: 334, facultyIds: [faculty1._id, faculty2._id], projectMode: 'tracker' as const },
      { page: 461, facultyIds: [hod._id], projectMode: 'github' as const },
    ];
for (const { page, facultyIds, projectMode } of csePages) {
  const imported = normalizeCourseware(parseCoursePage(readFileSync(`tests/fixtures/courseware/${page}.html`, 'utf8')));
  const { code, credits } = imported;
  if (!code || !credits) throw new Error(`seed: courseware page ${page} gives no course code or credits`);
  const cos = mergeCos([], imported.cos, () => new Types.ObjectId());
  const idOf = new Map(cos.map((c) => [c.code, c._id]));
  const course = found(
    await upsert(
      Course,
      { code },
      {
        code,
        title: imported.title,
        type: imported.type,
        credits,
        status: 'active',
        coordinatorId: facultyIds[0],
        objectives: imported.objectives,
        cos,
        coMap: imported.coMap.flatMap((cell) => {
          const coId = idOf.get(cell.co);
          return coId ? [{ coId, outcome: cell.outcome, level: cell.level }] : [];
        }),
        modules: imported.modules,
        projects: imported.projects,
        textbooks: imported.textbooks,
        references: imported.references,
        sessionPlan: imported.sessionPlan,
        issues: imported.issues,
        reviewNeeded: imported.issues.length > 0,
      },
    ),
    `course ${code}`,
  );
  await CurriculumEntry.updateOne(
    { programId: program._id, courseId: course._id },
    {
      $setOnInsert: { programId: program._id, courseId: course._id, courseCode: code, basket: null, courseType: null },
    },
    { upsert: true },
  );
  const cse = found(
    await upsert(
      Offering,
      { courseId: course._id, termId: term._id, batchId: batch._id, section: 'A' },
      {
        courseId: course._id,
        termId: term._id,
        batchId: batch._id,
        section: 'A',
        programId: program._id,
        departmentId: department._id,
        category: 'ugc',
        credits: course.credits,
        evaluation: SETTINGS.evaluation.schema.parse({}),
        title: `${code} · ${course.title} · ${term.code} · A`,
        facultyIds,
        projectMode: course.credits.project > 0 ? projectMode : null,
        modules: course.modules.slice(0, 40).map((m, order) => ({ title: m.title.slice(0, 160), order })),
        status: 'active',
      },
    ),
    `offering ${code} A`,
  );
  await Enrollment.bulkWrite(
    enrolled.map((s) => ({
      updateOne: {
        filter: { offeringId: cse._id, studentId: s._id },
        update: { $setOnInsert: { offeringId: cse._id, studentId: s._id, status: 'active' } },
        upsert: true,
      },
    })),
  );
}

const cseNote = csePages.length ? ` and the ${csePages.length} CSE courses from courseware` : '';
console.log(
  `Seeded ${e2e ? 'e2e fixtures' : 'development data'}: 2 departments, 2 programmes, ${5 + csePages.length} courses, ` +
    `${3 + csePages.length} offerings, ${enrolled.length} students enrolled in CUTM1602, CUTM1014${cseNote}` +
    `${e2e ? '; the exams term 2025-EVEN with LAB0201; a published outcomes quiz and end-semester marks on CUTM1602; engagement on CUTM1014' : ''}` +
    `${passwordHash ? '; every account signs in with the seed password' : ''}.`,
);
await mongoose.disconnect();
