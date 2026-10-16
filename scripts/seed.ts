import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import mongoose, { Types } from 'mongoose';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db';
import { DEFAULT_OUTCOME_TITLES } from '@/lib/domain/catalog';
import { normalizeCourseware } from '@/lib/domain/courseware';
import { parseCoursePage } from '@/lib/integrations/courseware';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { Password } from '@/lib/schemas/auth';
import { SETTINGS } from '@/lib/schemas/settings';

// Development data (10 §3). Safe to run again: every record is inserted only if it is missing.
// With --e2e the fixture users also get a password (E2E_PASSWORD, set in .env.e2e) and an active account, and an
// administrator is created; without it they stay invited.
// The courses are real CUTM courses (codes, titles and T-P-Pj from the Course Repository); CUTM1535's content is
// its public courseware page (tests/fixtures/courseware/836.html). CUTM1602's outcomes, mapping, modules and
// sessions are fixtures for the tests, not CUTM's.
const { values } = parseArgs({ options: { e2e: { type: 'boolean' } } });
const e2e = values.e2e === true;

function found<T>(doc: T | null, what: string): T {
  if (!doc) throw new Error(`seed: ${what} was not created`);
  return doc;
}

// Fixture data must never reach a shared or hosted database.
const host = new URL(process.env.MONGODB_URI ?? 'mongodb://invalid').hostname;
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(host)) {
  console.error(`Refusing to seed "${host}": the seed only runs against a local MongoDB.`);
  process.exit(1);
}

const password = Password.safeParse(process.env.E2E_PASSWORD);
if (e2e && !password.success) {
  console.error('--e2e needs E2E_PASSWORD (at least 10 characters) in .env.e2e.');
  process.exit(1);
}
const passwordHash = e2e && password.success ? await hashPassword(password.data) : undefined;

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
  person('faculty1@seed.cutm.test', 'Farhan Khan', ['faculty'], { employeeId: 'E002', departmentId: department._id }),
  person('faculty2@seed.cutm.test', 'Fatima Das', ['faculty'], { employeeId: 'E003', departmentId: department._id }),
  ...(e2e ? [person('admin@seed.cutm.test', 'Anil Admin', ['admin'])] : []),
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
const [cutm1602, , , , sk01] = await Promise.all([
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

const enrolled = await User.find({ batchId: batch._id, section: 'A', roles: 'student' }, { _id: 1 }).lean();
await Enrollment.bulkWrite(
  enrolled.map((s) => ({
    updateOne: {
      filter: { offeringId: offering._id, studentId: s._id },
      update: { $setOnInsert: { offeringId: offering._id, studentId: s._id, status: 'active' } },
      upsert: true,
    },
  })),
);

console.log(
  `Seeded ${e2e ? 'e2e fixtures' : 'development data'}: 2 departments, 2 programmes, 5 courses, 2 offerings, ` +
    `${enrolled.length} students enrolled in CUTM1602.`,
);
await mongoose.disconnect();
