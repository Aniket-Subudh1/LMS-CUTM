import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildInternalMarksCsv,
  checkEndSemRow,
  formatCsvErrors,
  parseBankCsv,
  parseCourseListCsv,
  parseEndSemCsv,
  parseEnrollmentCsv,
  parseUsersCsv,
  type EndSemRow,
} from './csv';

const HEADER = 'role,name,email,rollno,employeeid,department,program,batchstartyear,section';

describe('parseUsersCsv', () => {
  it('reads students, faculty and HoD rows; headers are case-insensitive', () => {
    const result = parseUsersCsv(
      [
        'Role, Name ,EMAIL,RollNo,EmployeeID,Department,Program,BatchStartYear,Section',
        'student,Asha Rao,ASHA@cutm.ac.in,21CSE001,,,btech-cse,2025,A',
        'hod,Dr Rao,rao@cutm.ac.in,,E100,cse,,,',
      ].join('\n'),
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          row: 1,
          role: 'student',
          name: 'Asha Rao',
          email: 'asha@cutm.ac.in',
          rollNo: '21CSE001',
          program: 'BTECH-CSE',
          batchStartYear: 2025,
          section: 'A',
        },
        { row: 2, role: 'hod', name: 'Dr Rao', email: 'rao@cutm.ac.in', employeeId: 'E100', department: 'CSE' },
      ],
    });
  });

  it('names a missing required column once', () => {
    const result = parseUsersCsv('role,name\nsupport,Sam');
    expect(result).toEqual({ ok: false, errors: [{ row: 0, message: 'Missing column "email".' }] });
  });

  it('requires the student columns only when the file has students', () => {
    expect(parseUsersCsv('role,name,email\nsupport,Sam,sam@cutm.ac.in').ok).toBe(true);
    const result = parseUsersCsv('role,name,email\nstudent,Asha,asha@cutm.ac.in');
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? [] : result.errors.map((e) => e.message)).toContain('Missing column "rollno".');
  });

  it('rejects more than 5,000 rows', () => {
    const rows = Array.from({ length: 5001 }, (_, i) => `support,User ${i},u${i}@cutm.ac.in`);
    const result = parseUsersCsv(['role,name,email', ...rows].join('\n'));
    expect(result).toEqual({
      ok: false,
      errors: [{ row: 0, message: 'The file has more than 5,000 rows. Split it into smaller files.' }],
    });
  });

  it('accepts exactly 5,000 rows', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => `support,User ${i},u${i}@cutm.ac.in`);
    expect(parseUsersCsv(['role,name,email', ...rows].join('\n')).ok).toBe(true);
  });

  it('reports a student row without a roll number as a row error', () => {
    const result = parseUsersCsv(`${HEADER}\nstudent,Asha,asha@cutm.ac.in,,,,BTECH-CSE,2025,A`);
    expect(result).toEqual({ ok: false, errors: [{ row: 1, message: 'Roll number is required for students.' }] });
  });

  it('reports a duplicate email inside the file on the later row', () => {
    const result = parseUsersCsv(`${HEADER}\nsupport,Sam,sam@cutm.ac.in,,,,,,\nsupport,Sam Two,SAM@cutm.ac.in,,,,,,`);
    expect(result).toEqual({
      ok: false,
      errors: [{ row: 2, message: 'Email "sam@cutm.ac.in" already appears in row 1.' }],
    });
  });

  it('reports an unknown role and an invalid email on their rows', () => {
    const result = parseUsersCsv(`${HEADER}\nadmin,Root,root@cutm.ac.in,,,,,,\nsupport,Sam,not-an-email,,,,,,`);
    expect(result).toEqual({
      ok: false,
      errors: [
        { row: 1, message: 'Role must be student, faculty, hod or support.' },
        { row: 2, message: 'Enter a valid email address.' },
      ],
    });
  });

  it('reads a file with a byte-order mark', () => {
    expect(parseUsersCsv('\uFEFFrole,name,email\nsupport,Sam,sam@cutm.ac.in').ok).toBe(true);
  });
});

describe('parseEnrollmentCsv', () => {
  it('reads add and drop rows', () => {
    expect(parseEnrollmentCsv('RollNo,Action\n21CSE001,ADD\n21CSE002,drop')).toEqual({
      ok: true,
      rows: [
        { row: 1, rollNo: '21CSE001', action: 'add' },
        { row: 2, rollNo: '21CSE002', action: 'drop' },
      ],
    });
  });

  it('reports a bad action and a repeated roll number', () => {
    const result = parseEnrollmentCsv('rollno,action\n21CSE001,remove\n21CSE002,add\n21CSE002,drop');
    expect(result).toEqual({
      ok: false,
      errors: [
        { row: 1, message: 'Action must be add or drop.' },
        { row: 3, message: 'Roll number "21CSE002" already appears in row 2.' },
      ],
    });
  });

  it('names a missing column', () => {
    expect(parseEnrollmentCsv('rollno\n21CSE001')).toEqual({
      ok: false,
      errors: [{ row: 0, message: 'Missing column "action".' }],
    });
  });
});

describe('formatCsvErrors', () => {
  it('prefixes row numbers, leaves file errors bare and caps the list', () => {
    expect(
      formatCsvErrors([
        { row: 0, message: 'Missing column "email".' },
        { row: 12, message: 'Bad.' },
      ]),
    ).toEqual(['Missing column "email".', 'Row 12: Bad.']);
    const many = Array.from({ length: 205 }, (_, i) => ({ row: i + 1, message: 'Bad.' }));
    const lines = formatCsvErrors(many);
    expect(lines).toHaveLength(201);
    expect(lines.at(-1)).toBe('…and 5 more rows with errors.');
  });
});

describe('parseCourseListCsv', () => {
  const header = 'programme,stream,basket,type,code,title,credits,tpp';

  it('reads the repository columns, half credits and separator variants', () => {
    const result = parseCourseListCsv(
      [
        header,
        'M.Sc Mathematics,,Basket I,Core,CUTM1535,Advanced complex analysis,4,3+0+1',
        'B.Tech CSE,CSE/MCA,Basket IV,Core,cutm 1024,IT Infrastructure Management,6,2--2--2',
        'B.Tech CSE,All,Basket II,Humanities and Management(A),CUTM1014,"Gender, Human Rights and Ethics",3,1.5+0+1.5',
        'MBA,,Basket IV,,CUTM1014,"Gender, Human Rights and Ethics",3,1.5-0-1.5',
      ].join('\n'),
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          row: 1,
          programme: 'M.Sc Mathematics',
          stream: undefined,
          basket: 'Basket I',
          type: 'Core',
          code: 'CUTM1535',
          title: 'Advanced complex analysis',
          credits: { theory: 3, practice: 0, project: 1 },
        },
        expect.objectContaining({
          row: 2,
          code: 'CUTM1024',
          stream: 'CSE/MCA',
          credits: { theory: 2, practice: 2, project: 2 },
        }),
        expect.objectContaining({ row: 3, code: 'CUTM1014', credits: { theory: 1.5, practice: 0, project: 1.5 } }),
        expect.objectContaining({ row: 4, programme: 'MBA', type: undefined }),
      ],
    });
  });

  it('reports every bad row: credits that do not add up, two-part splits, clashes and duplicates', () => {
    const result = parseCourseListCsv(
      [
        header,
        'BTech,,,,CUTM1001,Differential Equations,4,2+0+1',
        'BTech,,,,CUTM1002,Laplace Transforms,3,2+1',
        'BTech,,,,CUTM1003,Complex Analysis,3,2+0+1',
        'MBA,,,,CUTM1003,Complex Analysis and Methods,3,2+0+1',
        'BTech,,,,CUTM1003,Complex Analysis,3,2+0+1',
        'BTech,,,,,No code,3,2+0+1',
      ].join('\n'),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { row: 1, message: 'Credits 4 do not match T+P+Pj 2-0-1.' },
      { row: 2, message: 'T+P+Pj "2+1" must be three numbers, such as 3+0+1.' },
      { row: 4, message: 'CUTM1003 has a different title in row 3.' },
      { row: 5, message: 'CUTM1003 is already listed under BTech in row 3.' },
      { row: 6, message: 'Course code is required, such as CUTM1535.' },
    ]);
  });

  it('needs the five required columns and at most 5,000 rows', () => {
    expect(parseCourseListCsv('programme,code,title\nBTech,CUTM1,X')).toEqual({
      ok: false,
      errors: [
        { row: 0, message: 'Missing column "credits".' },
        { row: 0, message: 'Missing column "tpp".' },
      ],
    });
    const many = [header, ...Array.from({ length: 5001 }, (_, i) => `BTech,,,,C${i},T,3,2+0+1`)].join('\n');
    expect(parseCourseListCsv(many)).toMatchObject({ ok: false, errors: [{ row: 0 }] });
  });
});

describe('parseBankCsv (06 §8.6)', () => {
  const header = 'type,question,options,answer,marks,difficulty,topic,cos,negative';
  it('reads each kind a line can say', () => {
    const parsed = parseBankCsv(
      [
        header,
        'One answer,Which is LIFO?,Queue|Stack,2,1,Easy,Stacks,co1,0.5',
        'several answers,Pick two,A|B|C,1|3,2,,,CO1|CO2,',
        'true or false,FIFO?,,TRUE,1,,,,',
        'number,Pi?,,3.14 ± 0.01,1,,,,',
        'written answer,Explain.,,,5,hard,,,',
      ].join('\n'),
    );
    expect(parsed.ok && parsed.rows.map((r) => [r.type, r.correct, r.truth, r.value, r.tolerance])).toEqual([
      ['mcq', [1], null, null, 0],
      ['msq', [0, 2], null, null, 0],
      ['true_false', null, true, null, 0],
      ['numeric', null, null, 3.14, 0.01],
      ['text', null, null, null, 0],
    ]);
    expect(parsed.ok && parsed.rows[0]).toMatchObject({
      difficulty: 'easy',
      topic: 'stacks',
      coCodes: ['CO1'],
      negativeMarks: 0.5,
    });
  });

  it.each([
    ['an unknown type', 'essay,Q,,,1', 'Type is one of'],
    ['one option', 'one answer,Q,A,1,1', 'Give 2 to 8 options'],
    ['an answer past the options', 'one answer,Q,A|B,3,1', 'Answer is the number'],
    ['two answers to one answer', 'one answer,Q,A|B,1|2,1', 'exactly one'],
    ['a true or false answer', 'true or false,Q,,yes,1', 'Answer is true or false'],
    ['no marks', 'number,Q,,4,', 'Marks is'],
  ])('refuses %s, by row', (_, line, message) => {
    const parsed = parseBankCsv(`${header}\n${line}`);
    expect(parsed.ok ? [] : parsed.errors).toEqual([{ row: 1, message: expect.stringContaining(message) }]);
  });
});

// 06 §8.3–8.4 (M08 decision 1): the export goes out, and comes back with its external columns filled in.
const EXAM_HEADER =
  'rollno,name,coursecode,termcode,theoryinternal,practiceinternal,projectinternal,theoryexternal,practiceexternal,projectexternal';

describe('buildInternalMarksCsv (06 §8.4)', () => {
  it('writes the shared header, internals at 2 dp and empty external columns', () => {
    const csv = buildInternalMarksCsv([
      {
        rollNo: '2501CSE001',
        name: 'Asha Rao',
        courseCode: 'CUTM1602',
        termCode: '2026-ODD',
        internals: { theory: 28.5333333, practice: 40.5, project: 42 },
      },
      {
        rollNo: '2501CSE002',
        name: 'Ravi Das',
        courseCode: 'CUTM1014',
        termCode: '2026-ODD',
        internals: { theory: null, project: 38 },
      },
    ]);
    expect(csv.split('\r\n')).toEqual([
      EXAM_HEADER,
      '2501CSE001,Asha Rao,CUTM1602,2026-ODD,28.53,40.5,42,,,',
      '2501CSE002,Ravi Das,CUTM1014,2026-ODD,,,38,,,',
    ]);
  });

  it('escapes a name a spreadsheet would run as a formula', () => {
    const csv = buildInternalMarksCsv([
      { rollNo: 'R1', name: '=HYPERLINK("x")', courseCode: 'C1', termCode: 'T', internals: {} },
    ]);
    expect(csv.split('\r\n')[1]).toBe(`R1,"'=HYPERLINK(""x"")",C1,T,,,,,,`);
  });
});

describe('parseEndSemCsv (06 §8.3)', () => {
  it('reads the filled-in export: marks, AB in any case, blanks; other columns ignored', () => {
    const result = parseEndSemCsv(
      [
        EXAM_HEADER,
        '2501CSE001,Asha Rao,cutm 1602,2026-odd,28.53,40.5,42,48,ab,41.25',
        '2501CSE002,Ravi Das,CUTM1014,2026-ODD,,,38,AB,,35',
      ].join('\n'),
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          row: 1,
          rollNo: '2501CSE001',
          courseCode: 'CUTM1602',
          termCode: '2026-ODD',
          theory: 48,
          practice: 'AB',
          project: 41.25,
        },
        {
          row: 2,
          rollNo: '2501CSE002',
          courseCode: 'CUTM1014',
          termCode: '2026-ODD',
          theory: 'AB',
          practice: null,
          project: 35,
        },
      ],
    });
  });

  it('names a missing external column', () => {
    const result = parseEndSemCsv('rollno,coursecode,termcode,theoryexternal\nR1,C1,T,40');
    expect(result).toEqual({
      ok: false,
      errors: [
        { row: 0, message: 'Missing column "practiceexternal".' },
        { row: 0, message: 'Missing column "projectexternal".' },
      ],
    });
  });

  it('reports a value that is not a mark and a repeated student and course', () => {
    const result = parseEndSemCsv(
      [
        'rollno,coursecode,termcode,theoryexternal,practiceexternal,projectexternal',
        'R1,C1,T,4.567,,',
        'R2,C1,T,-3,,',
        'R3,C1,T,40,,',
        'R3,c1,t,41,,',
      ].join('\n'),
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        { row: 1, message: 'theoryexternal "4.567" is not a mark with at most two decimals, or AB.' },
        { row: 2, message: 'theoryexternal "-3" is not a mark with at most two decimals, or AB.' },
        { row: 4, message: 'R3 in C1 already appears in row 3.' },
      ],
    });
  });
});

describe('checkEndSemRow', () => {
  const course = {
    code: 'CUTM1001',
    credits: { theory: 2, practice: 0, project: 1 },
    maxima: { theory: 60, practice: 50, project: 50 },
  };
  const row = (
    theory: EndSemRow['theory'],
    practice: EndSemRow['practice'],
    project: EndSemRow['project'],
  ): EndSemRow => ({
    row: 1,
    rollNo: 'R1',
    courseCode: 'CUTM1001',
    termCode: '2026-ODD',
    theory,
    practice,
    project,
  });

  it('turns marks and AB into one external per component the course has', () => {
    expect(checkEndSemRow(row(51, null, 'AB'), course)).toEqual({
      ok: true,
      externals: [
        { component: 'theory', marks: 51, max: 60, absent: false },
        { component: 'project', marks: null, max: 50, absent: true },
      ],
    });
  });

  it.each([
    [row(64, null, 40), 'theoryexternal 64 is more than 60.'],
    [row(51, 40, 40), 'practiceexternal has a mark, but CUTM1001 has no practice.'],
    [row(null, null, 40), 'theoryexternal is empty: give the mark, or AB.'],
  ])('refuses %o', (input, message) => {
    expect(checkEndSemRow(input, course)).toEqual({ ok: false, message });
  });
});

// Each import's "Download sample CSV" (public/samples) is accepted by the parser it is for.
describe('sample files', () => {
  it.each([
    ['users.csv', parseUsersCsv],
    ['enrolment-changes.csv', parseEnrollmentCsv],
    ['course-list.csv', parseCourseListCsv],
    ['question-bank.csv', parseBankCsv],
    ['my-question-bank.csv', parseBankCsv],
    ['exam-marks.csv', parseEndSemCsv],
  ] as const)('%s', (name, parse) => {
    expect(parse(readFileSync(`public/samples/${name}`, 'utf8'))).toMatchObject({ ok: true });
  });
});
