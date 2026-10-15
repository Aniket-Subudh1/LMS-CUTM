import { describe, expect, it } from 'vitest';
import { formatCsvErrors, parseCourseListCsv, parseEnrollmentCsv, parseUsersCsv } from './csv';

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
        expect.objectContaining({ row: 2, code: 'CUTM1024', stream: 'CSE/MCA', credits: { theory: 2, practice: 2, project: 2 } }),
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
