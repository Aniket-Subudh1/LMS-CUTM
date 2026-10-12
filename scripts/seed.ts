import { parseArgs } from 'node:util';
import mongoose, { Types } from 'mongoose';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db';
import { defaultOutcomes } from '@/lib/domain/structure';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { EvaluationScheme } from '@/lib/models/evaluation-scheme';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { Password } from '@/lib/schemas/auth';

// Development data (10 §3). Safe to run again: every record is inserted only if it is missing.
// With --e2e the fixture users also get a password (E2E_PASSWORD, set in .env.e2e) and an active account, and an
// administrator is created; without it they stay invited and the first existing administrator owns the scheme.
const { values } = parseArgs({ options: { e2e: { type: 'boolean' } } });
const e2e = values.e2e === true;

function found<T>(doc: T | null, what: string): T {
  if (!doc) throw new Error(`seed: ${what} was not created`);
  return doc;
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

const department = await Department.findOneAndUpdate(
  { code: 'CSE' },
  { $setOnInsert: { code: 'CSE', name: 'Computer Science and Engineering' } },
  { upsert: true, returnDocument: 'after' },
);

const outcomes = defaultOutcomes();
const [btech, skill] = await Promise.all([
  Program.findOneAndUpdate(
    { code: 'BTECH-CSE' },
    {
      $setOnInsert: {
        code: 'BTECH-CSE',
        name: 'B.Tech Computer Science and Engineering',
        departmentId: department._id,
        category: 'ugc',
        durationSemesters: 8,
        ...outcomes,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ),
  Program.findOneAndUpdate(
    { code: 'SKILL' },
    {
      $setOnInsert: {
        code: 'SKILL',
        name: 'Skill courses',
        departmentId: department._id,
        category: 'skill',
        durationSemesters: 2,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ),
]);
const program = found(btech, 'programme BTECH-CSE');
const skillProgram = found(skill, 'programme SKILL');

const batch = await Batch.findOneAndUpdate(
  { programId: program._id, startYear: 2025 },
  { $setOnInsert: { programId: program._id, name: '2025', startYear: 2025, sections: ['A', 'B'] } },
  { upsert: true, returnDocument: 'after' },
);
const skillBatch = await Batch.findOneAndUpdate(
  { programId: skillProgram._id, startYear: 2025 },
  { $setOnInsert: { programId: skillProgram._id, name: '2025', startYear: 2025, sections: ['A'] } },
  { upsert: true, returnDocument: 'after' },
);
const term = await Term.findOneAndUpdate(
  { code: '2026-ODD' },
  {
    $setOnInsert: {
      code: '2026-ODD',
      name: 'Odd semester 2026',
      academicYear: '2026-27',
      startsOn: new Date('2026-07-01T00:00:00+05:30'),
      endsOn: new Date('2026-12-31T00:00:00+05:30'),
      status: 'current',
    },
  },
  { upsert: true, returnDocument: 'after' },
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
const owner = found(
  await User.findOne(e2e ? { email: 'admin@seed.cutm.test' } : { roles: 'admin' }, { _id: 1 }).lean(),
  'an administrator (run `npm run admin:create` first)',
);

const scheme = await EvaluationScheme.findOneAndUpdate(
  { componentKey: 'theory+practice', version: 1 },
  {
    $setOnInsert: {
      componentKey: 'theory+practice',
      version: 1,
      name: 'Theory and practice',
      internalMax: 50,
      externalMax: 50,
      components: [
        { key: 'quiz', label: 'Quiz', weight: 15, modes: ['quiz'], aggregation: 'average' },
        {
          key: 'assignment',
          label: 'Assignment',
          weight: 10,
          modes: ['assignment'],
          aggregation: 'best_n',
          bestN: 2,
        },
        {
          key: 'learning_record',
          label: 'Learning record',
          weight: 5,
          modes: ['learning_record'],
          aggregation: 'average',
        },
        { key: 'lab_record', label: 'Lab record', weight: 5, modes: ['lab_record'], aggregation: 'sum' },
        {
          key: 'lab_test',
          label: 'Lab test',
          weight: 15,
          modes: ['lab_test', 'coding_test'],
          aggregation: 'average',
        },
      ],
      rounding: { decimals: 0, mode: 'half_up' },
      status: 'active',
      createdBy: owner._id,
    },
  },
  { upsert: true, returnDocument: 'after' },
);

const co = ['CO1', 'CO2', 'CO3'].map((code) => ({ _id: new Types.ObjectId(), code }));
const cs101 = await Course.findOneAndUpdate(
  { programId: program._id, code: 'CS101' },
  {
    $setOnInsert: {
      programId: program._id,
      departmentId: department._id,
      category: 'ugc',
      code: 'CS101',
      title: 'C Programming',
      credits: 4,
      components: ['theory', 'practice'],
      componentKey: 'theory+practice',
      objectives: ['Write structured programs in C.', 'Use pointers, arrays and files correctly.'],
      cos: [
        { _id: co[0]._id, code: 'CO1', statement: 'Explain the basic constructs of C.', bloomLevel: 'understand' },
        { _id: co[1]._id, code: 'CO2', statement: 'Write programs with functions and arrays.', bloomLevel: 'apply' },
        {
          _id: co[2]._id,
          code: 'CO3',
          statement: 'Design programs that use pointers and files.',
          bloomLevel: 'create',
        },
      ],
      coMap: [
        { coId: co[0]._id, outcome: 'PO1', level: 3 },
        { coId: co[1]._id, outcome: 'PO2', level: 2 },
        { coId: co[1]._id, outcome: 'PO3', level: 2 },
        { coId: co[2]._id, outcome: 'PO3', level: 3 },
        { coId: co[2]._id, outcome: 'PSO3', level: 1 },
      ],
      status: 'active',
    },
  },
  { upsert: true, returnDocument: 'after' },
);
const sk01 = await Course.findOneAndUpdate(
  { programId: skillProgram._id, code: 'SK01' },
  {
    $setOnInsert: {
      programId: skillProgram._id,
      departmentId: department._id,
      category: 'skill',
      code: 'SK01',
      title: 'Excel Basics',
      credits: 1,
      components: ['practice'],
      componentKey: 'practice',
      status: 'active',
    },
  },
  { upsert: true, returnDocument: 'after' },
);

const cs101Offering = await Offering.findOneAndUpdate(
  { courseId: cs101._id, termId: term._id, batchId: batch._id, section: 'A' },
  {
    $setOnInsert: {
      courseId: cs101._id,
      termId: term._id,
      batchId: batch._id,
      section: 'A',
      programId: program._id,
      departmentId: department._id,
      category: 'ugc',
      title: 'CS101 · C Programming · 2026-ODD · A',
      facultyIds: [faculty1._id],
      schemeId: scheme._id,
      status: 'active',
    },
  },
  { upsert: true, returnDocument: 'after' },
);
await Offering.updateOne(
  { courseId: sk01._id, termId: term._id, batchId: skillBatch._id, section: null },
  {
    $setOnInsert: {
      courseId: sk01._id,
      termId: term._id,
      batchId: skillBatch._id,
      section: null,
      programId: skillProgram._id,
      departmentId: department._id,
      category: 'skill',
      title: 'SK01 · Excel Basics · 2026-ODD',
      facultyIds: [faculty2._id],
      schemeId: null,
      status: 'active',
    },
  },
  { upsert: true },
);

const enrolled = await User.find({ batchId: batch._id, section: 'A', roles: 'student' }, { _id: 1 }).lean();
await Enrollment.bulkWrite(
  enrolled.map((s) => ({
    updateOne: {
      filter: { offeringId: cs101Offering._id, studentId: s._id },
      update: { $setOnInsert: { offeringId: cs101Offering._id, studentId: s._id, status: 'active' } },
      upsert: true,
    },
  })),
);

console.log(
  `Seeded ${e2e ? 'e2e fixtures' : 'development data'}: 1 department, 2 programmes, 2 courses, 2 offerings, ` +
    `${enrolled.length} students enrolled in CS101.`,
);
await mongoose.disconnect();
