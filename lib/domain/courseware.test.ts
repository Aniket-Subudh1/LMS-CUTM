import { describe, expect, it } from 'vitest';
import type { CoursewareBlock } from '@/lib/schemas/structure';
import { coursewarePageId, normalizeCourseware } from './courseware';

const line = (text: string, bold = false): CoursewareBlock => ({ kind: 'line', text, bold });
const table = (...rows: string[][]): CoursewareBlock => ({ kind: 'table', rows });
const page = (blocks: CoursewareBlock[], title = 'Programming in C', identifier: string | null = null) =>
  normalizeCourseware({ title, typeLabel: 'Core', identifier, blocks });

describe('normalizeCourseware: the course header', () => {
  it('reads the code, credits and faculty from the lines CUTM pages start with', () => {
    const course = page([line('Faculty:', true), line('Dr. Asha Rao'), line('Code(Credit) : CUTM1602(1-2-1)', true)]);
    expect(course).toMatchObject({
      code: 'CUTM1602',
      credits: { theory: 1, practice: 2, project: 1 },
      facultyName: 'Dr. Asha Rao',
      type: 'core',
      issues: [],
    });
  });

  it('reads a course descriptor table and flags a two-part credit split', () => {
    const course = page([
      table(
        ['Course\nTitle', 'Fundamentals\nof Agronomy', 'Credits', '3\n(2+1)'],
        ['Course\nCode', 'ASAG\n1101', 'School', 'CSSAG'],
        ['Course\nCoordinator', 'Dr.\nP. Kumar', '', ''],
      ),
    ]);
    expect(course).toMatchObject({ code: 'ASAG1101', credits: { theory: 2, practice: 1, project: 0 } });
    expect(course.facultyName).toBe('Dr. P. Kumar');
    expect(course.issues).toEqual([
      'The page gives credits in two parts; they were read as theory + practice with no project credits.',
    ]);
  });

  it('falls back to the code in the slug or title and says when there is none', () => {
    expect(page([], 'ADVANCED JAVA-CUST1051', 'advanced-java-cust1051')).toMatchObject({
      code: 'CUST1051',
      title: 'ADVANCED JAVA',
    });
    expect(page([], 'SKILL: Solar PV Installation', 'solar-pv-installer')).toMatchObject({
      code: null,
      title: 'Solar PV Installation',
      issues: ['The courseware page has no course code.', 'The courseware page gives no credits (T-P-Pj).'],
    });
  });
});

describe('normalizeCourseware: objectives and outcomes', () => {
  it('joins hard-wrapped lines, drops lead-ins and keeps bullets apart', () => {
    const course = page([
      line('Course Objectives:', true),
      line('The objectives of the course are'),
      line('●'),
      line('To equip the students with various concepts, tools and techniques of'),
      line('cost and management accounting.'),
      line('●'),
      line('To provide an understanding of costing.'),
    ]);
    expect(course.objectives).toEqual([
      'To equip the students with various concepts, tools and techniques of cost and management accounting.',
      'To provide an understanding of costing.',
    ]);
  });

  it('numbers plain learning outcomes, suggests a level and says they had no codes', () => {
    const course = page([
      line('Learning Outcomes', true),
      line('Upon successful completion of this course, students will be able to:'),
      line('Explain the structure of a C program.'),
      line('Get a deep understanding of pointers.'),
    ]);
    expect(course.cos).toEqual([
      {
        code: 'CO1',
        statement: 'Explain the structure of a C program.',
        bloomLevels: [],
        suggestedBloom: 'understand',
      },
      {
        code: 'CO2',
        statement: 'Get a deep understanding of pointers.',
        bloomLevels: [],
        suggestedBloom: 'understand',
      },
    ]);
    expect(course.issues).toContain('The outcomes had no CO numbers, so they were numbered in order.');
  });

  it('takes a CO table first, with the levels it states', () => {
    const course = page([
      line('Course Outcomes (COs):', true),
      line('CO1: Remember syntax.'),
      table(
        ['COs', 'Course outcomes', 'Bloom level'],
        ['CO1', 'Write programs\nwith loops and arrays', 'Apply, Create'],
        ['CO2', 'Implement servlets for web applications. (Apply, Analyze).', ''],
      ),
    ]);
    expect(course.cos).toEqual([
      {
        code: 'CO1',
        statement: 'Write programs with loops and arrays',
        bloomLevels: ['apply', 'create'],
        suggestedBloom: null,
      },
      { code: 'CO2', statement: 'Implement servlets for web applications.', bloomLevels: [], suggestedBloom: 'apply' },
    ]);
  });
});

describe('normalizeCourseware: CO-PO mapping', () => {
  const outcomes = [line('Course Outcomes', true), line('CO1: Explain loops.'), line('CO2: Design programs.')];

  it('reads numbers and H/M/L, ignores columns outside PO1–PO12 and PSO1–PSO3 and rows of unknown COs', () => {
    const course = page([
      ...outcomes,
      table(
        ['CO, PO Mapping Matrix'],
        ['CO\\PO', 'PO1', 'PO2', 'PO 13', 'PSO1'],
        ['CO1', 'H', '-', '3', '2'],
        ['CO2', 'L', 'M', '', ''],
        ['CO9', '3', '3', '3', '3'],
      ),
    ]);
    expect(course.coMap).toEqual([
      { co: 'CO1', outcome: 'PO1', level: 3 },
      { co: 'CO1', outcome: 'PSO1', level: 2 },
      { co: 'CO2', outcome: 'PO1', level: 1 },
      { co: 'CO2', outcome: 'PO2', level: 2 },
    ]);
    expect(course.issues).toContain(
      'The mapping has columns other than PO1–PO12 and PSO1–PSO3 (PO13); they were left out.',
    );
  });

  it('flags a mapping where every CO has the same row', () => {
    const course = page([
      ...outcomes,
      table(['COs', 'PO1', 'PO2', 'PO3'], ['CO1', '3', '3', ''], ['CO2', '3', '3', '']),
    ]);
    expect(course.issues).toContain('Every outcome has the same CO–PO mapping on the page; check that it is meant.');
  });
});

describe('normalizeCourseware: syllabus, projects and books', () => {
  it('reads modules with hours, topics, practicals and projects', () => {
    const course = page([
      line('Course Syllabus/Contents:', true),
      line('MODULE – I (3hr+2hr+0hr)', true),
      line('Data types, operators and'),
      line('expressions.'),
      line('Practice 1: Write a program to swap two numbers.'),
      line('PROJECT 1: Build a calculator.'),
      line('Module: II Pointers and', true),
      line('Memory', true),
      line('Topics: Pointer arithmetic, dynamic allocation.'),
      line('Experiments:'),
      line('• Reverse an array with pointers.'),
      line('Module 3: File handling (4 hours), SGJ/N0101', true),
      line('Practical (Credit: 1)'),
      table(
        ['S.No', 'Title', 'Description'],
        ['1', 'Copy a file', 'Read and write'],
        ['2', 'Count words', 'Use fgetc'],
      ),
    ]);
    expect(course.modules).toEqual([
      {
        title: 'Module I',
        hours: '3+2+0',
        topics: 'Data types, operators and expressions.',
        practicals: ['Write a program to swap two numbers.'],
      },
      {
        title: 'Pointers and Memory',
        hours: null,
        topics: 'Pointer arithmetic, dynamic allocation.',
        practicals: ['Reverse an array with pointers.'],
      },
      { title: 'File handling', hours: '4', topics: '', practicals: [] },
      { title: 'Practicals', hours: null, topics: '', practicals: ['Copy a file', 'Count words'] },
    ]);
    expect(course.projects).toEqual(['Build a calculator.']);
  });

  it('keeps project lists apart from their module sub-headings', () => {
    const course = page([
      line('Project Topics', true),
      line('Module I: Concept of Management', true),
      line('Accounting', true),
      line('• Role of management accounting in decision-making'),
      line('• Tools of management accounting'),
    ]);
    expect(course.projects).toEqual([
      'Role of management accounting in decision-making',
      'Tools of management accounting',
    ]);
  });

  it('attaches chapters to their book and runs wrapped book lines on', () => {
    const course = page([
      line('BOOK PRESCRIBED', true),
      line('1 L. V. Ahlfors, “Complex Analysis”, McGraw-Hill.'),
      line('Chapters: 4 (2.1, 4.2 to 4.5), 5 (1.2)'),
      line('Reference Book:', true),
      line('1. Donn, William L. 1965.'),
      line('Meteorology. McGraw-Hill, New York.'),
      line('2. Rao, V.S. 1992. Weed Science.'),
    ]);
    expect(course.textbooks).toEqual([
      'L. V. Ahlfors, “Complex Analysis”, McGraw-Hill. · Chapters: 4 (2.1, 4.2 to 4.5), 5 (1.2)',
    ]);
    expect(course.references).toEqual([
      'Donn, William L. 1965. Meteorology. McGraw-Hill, New York.',
      'Rao, V.S. 1992. Weed Science.',
    ]);
  });
});

describe('normalizeCourseware: the session plan', () => {
  it('expands "Session 8 & 9", drops links and reads project and practice sessions', () => {
    const course = page([
      line('Session Plan', true),
      line('Session 1'),
      line('Index of a point'),
      line('https://www.youtube.com/watch?v=abc'),
      line('Session 2 & 3'),
      line('Project-1 : Study on residues'),
      line('Session 4-5'),
      line('Foundation - Basics of inverters.'),
      line('Practice - Identify inverter types.'),
      line('Web link: https://drive.google.com/file/d/xyz'),
    ]);
    expect(course.sessionPlan).toEqual([
      { topic: 'Index of a point', kind: 'theory' },
      { topic: 'Study on residues', kind: 'project' },
      { topic: 'Study on residues', kind: 'project' },
      { topic: 'Foundation - Basics of inverters. Identify inverter types.', kind: 'practice' },
      { topic: 'Foundation - Basics of inverters. Identify inverter types.', kind: 'practice' },
    ]);
  });

  it('reads session tables by their header, and sessions with no heading above them', () => {
    const fromTable = page([
      line('Session Plan', true),
      table(
        ['Lect. No', 'Proposed Date', 'Points To Covered', 'Methodology/Activities'],
        ['1', '', 'https://drive.google.com/x\nPractice: Set up a server\nPractice: Deploy a page', 'Practical'],
        ['2', '', 'Project Session:1: SRS preparation', 'Project'],
      ),
      table(['Session 3: Market structure\nand pricing', 'E-material: https://x.org'], ['Meaning of market']),
    ]);
    expect(fromTable.sessionPlan).toEqual([
      { topic: 'Set up a server; Deploy a page', kind: 'practice' },
      { topic: 'SRS preparation', kind: 'project' },
      { topic: 'Market structure and pricing', kind: 'theory' },
    ]);
    const unheaded = page([
      line('Session 1', true),
      line('Concept of costing'),
      line('Session 2', true),
      line('Budgets'),
    ]);
    expect(unheaded.sessionPlan.map((s) => s.topic)).toEqual(['Concept of costing', 'Budgets']);
  });

  it('cuts what is too long and says so', () => {
    const course = page([line('Session Plan', true), line('Session 1'), line(`Topic ${'x'.repeat(400)}`)]);
    expect(course.sessionPlan[0].topic).toHaveLength(200);
    expect(course.sessionPlan[0].topic.endsWith('…')).toBe(true);
    expect(course.issues).toContain(
      'Some entries were too long or too many and were cut; check them against the page.',
    );
  });
});

describe('coursewarePageId', () => {
  const base = 'https://courseware.cutm.ac.in';
  it.each([
    ['836', 836],
    [' https://courseware.cutm.ac.in/course/836 ', 836],
    ['https://courseware.cutm.ac.in/course/1250/', 1250],
    ['https://evil.example/course/836', null],
    ['http://courseware.cutm.ac.in/course/836', null],
    ['https://courseware.cutm.ac.in/courses?page=2', null],
    ['/course/836', null],
    ['CUTM1535', null],
  ])('%s → %s', (input, id) => {
    expect(coursewarePageId(input, base)).toBe(id);
  });
});
