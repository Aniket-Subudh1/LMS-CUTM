import { describe, expect, it } from 'vitest';
import {
  courseReadiness,
  courseTypeFromLabel,
  creditTotal,
  extractCode,
  formatCredits,
  inferBloom,
  mappingCoverage,
  mergeCos,
  nextCoCode,
  normalizeCode,
  normalizePersonName,
  normalizeTitle,
  parseBloomLevels,
  parseCredits,
  parseSessionLines,
  programmeCode,
  syllabusHours,
  type ReadinessInput,
} from './catalog';

const c = (theory: number, practice: number, project: number) => ({ theory, practice, project });

describe('parseCredits', () => {
  it.each([
    ['3+0+1', c(3, 0, 1), false],
    ['2--2--2', c(2, 2, 2), false],
    ['1.5+0+1.5', c(1.5, 0, 1.5), false],
    ['(3-0-1)', c(3, 0, 1), false],
    ['CUTM 3114 (0-3-1)', c(0, 3, 1), false],
    ['Code(Credit) : CUTM1535(3-0-1)', c(3, 0, 1), false],
    ['3 – 1 – 0', c(3, 1, 0), false],
    ['3 (2+1)', c(2, 1, 0), true],
    ['0+0+24', c(0, 0, 24), false],
    ['0-26.5-0', c(0, 26.5, 0), false],
  ])('%s → %o', (text, credits, twoPart) => {
    expect(parseCredits(text)).toEqual({ credits, twoPart });
  });

  it.each(['4', '1.25+0+1', '2021-2022', ''])('%s → null', (text) => {
    expect(parseCredits(text)).toBeNull();
  });

  it('totals and prints credits the way CUTM does', () => {
    expect(creditTotal(c(1.5, 0, 1.5))).toBe(3);
    expect(formatCredits(c(3, 0, 1))).toBe('3-0-1');
    expect(formatCredits(c(1.5, 0, 1.5))).toBe('1.5-0-1.5');
  });
});

describe('course codes and titles', () => {
  it.each([
    [' cutm 1535 ', 'CUTM1535'],
    ['ASAG 1101', 'ASAG1101'],
    ['CUTM-1535', 'CUTM1535'],
    ['SK01', 'SK01'],
  ])('normalizeCode(%s) = %s', (raw, code) => {
    expect(normalizeCode(raw)).toBe(code);
  });

  it.each([
    ['ADVANCED JAVA-CUST1051', 'CUST1051'],
    ['- GENERAL ANATOMY CUTM 2603', 'CUTM2603'],
    ['DECT0901', 'DECT0901'],
    ['Module I (2 hour), SGJ/N0101', null],
    ['PO12', null],
    ['26507', null],
  ])('extractCode(%s) = %s', (text, code) => {
    expect(extractCode(text)).toBe(code);
  });

  it.each([
    ['Core', 'core'],
    ['Domain Elective', 'domain'],
    ['SKILL', 'skill'],
    ['Certificate', 'certificate'],
    ['Advanced Certificate', 'advanced_certificate'],
    ['Diploma', 'diploma'],
    ['Open', null],
  ])('courseTypeFromLabel(%s) = %s', (label, type) => {
    expect(courseTypeFromLabel(label)).toBe(type);
  });

  it('compares titles and people loosely', () => {
    expect(normalizeTitle('SKILL: Solar PV Installation')).toBe('solar pv installation');
    expect(normalizeTitle('Accounting & Finance')).toBe(normalizeTitle('accounting and finance'));
    expect(normalizePersonName('Dr. Goutam Kumar  Mahato')).toBe('goutam kumar mahato');
    expect(normalizePersonName('Mrs. Saubhagyalaxmi Singh')).toBe('saubhagyalaxmi singh');
  });

  it('makes a programme code from its name', () => {
    expect(programmeCode('M.Sc Mathematics', new Set())).toBe('MSC-MATHEMATICS');
    expect(programmeCode('M.Sc Mathematics', new Set(['MSC-MATHEMATICS']))).toBe('MSC-MATHEMATICS-2');
    expect(programmeCode('B.Tech Computer Science and Engineering', new Set()).length).toBeLessThanOrEqual(20);
  });
});

describe('Bloom levels', () => {
  it.each([
    ['Explain the structure of a C program.', 'understand'],
    ['Evaluate definite and improper real integrals using Cauchy’s Residue Theorem.', 'evaluate'],
    ['Understand the fundamentals of residues, Laurent series.', 'understand'],
    ['Get a deep understanding of complex numbers.', 'understand'],
    ['Critically analyze the operations of organisations.', 'analyse'],
    ['Read and interpret financial statements.', null],
    ['Design a solar PV system for a house.', 'create'],
    ['Analyze financial statements.', 'analyse'],
    ['The student will able to develop dynamic web pages.', 'create'],
    ['Students will be able to apply residues to integrals.', 'apply'],
    ['CO3: Implement servlets.', 'apply'],
  ])('inferBloom(%s) = %s', (statement, level) => {
    expect(inferBloom(statement)).toBe(level);
  });

  it.each([
    ['Apply, Create', ['apply', 'create'], false],
    ['L2 - Understand', ['understand'], false],
    ['Analyzing', ['analyse'], false],
    ['K3', ['apply'], false],
    ['Understand, Apply, Analyse, Create', ['understand', 'apply', 'analyse'], true],
    ['', [], false],
  ])('parseBloomLevels(%s)', (text, levels, extra) => {
    expect(parseBloomLevels(text)).toEqual({ levels, extra });
  });
});

describe('session plan lines', () => {
  const sessions = [
    { topic: 'Index of a point with respect to a closed curve', kind: 'theory' as const },
    { topic: 'Residue calculations', kind: 'project' as const },
    { topic: 'Write a program with loops', kind: 'practice' as const },
  ];

  it('reads one session per line with a kind prefix, as the session plan editor posts them', () => {
    const text =
      'Index of a point with respect to a closed curve\nProject: Residue calculations\nPractice: Write a program with loops';
    expect(parseSessionLines(`${text}\n\n  `)).toEqual(sessions);
    expect(parseSessionLines('Lab: Set up Tomcat')).toEqual([{ topic: 'Set up Tomcat', kind: 'practice' }]);
  });
});

describe('course outcomes', () => {
  it('numbers a new CO after the highest code ever given, never reusing one', () => {
    expect(nextCoCode([], 0)).toBe('CO1');
    expect(nextCoCode([{ code: 'CO1' }, { code: 'CO4' }], 0)).toBe('CO5');
    // CO6 was deleted: the course remembers it gave 6, so the next is CO7, not CO6 again.
    expect(nextCoCode([{ code: 'CO1' }, { code: 'CO5' }], 6)).toBe('CO7');
    // An import may bring codes above the remembered number.
    expect(nextCoCode([{ code: 'CO9' }], 6)).toBe('CO10');
    expect(nextCoCode([{ code: 'Outcome 1' }], 0)).toBe('CO1');
  });

  it('adds up the syllabus hours as CUTM writes them', () => {
    expect(syllabusHours([{ hours: '4+0+2' }, { hours: '6' }, { hours: null }, { hours: '1.5+0+0.5' }])).toBe(14);
    expect(syllabusHours([])).toBe(0);
  });

  it('measures how well each PO and PSO is covered by the mapping', () => {
    // The mock-up's course: four COs; PO1 linked 2, 3, 3, 2; PO6 by CO1 and CO4 at 1; PO4 at 2, 2, 1; nothing to PO7.
    const cells = {
      'a:PO1': 2,
      'b:PO1': 3,
      'c:PO1': 3,
      'd:PO1': 2,
      'b:PO4': 2,
      'c:PO4': 2,
      'd:PO4': 1,
      'a:PO6': 1,
      'd:PO6': 1,
    };
    expect(mappingCoverage(['a', 'b', 'c', 'd', 'e'], ['PO1', 'PO4', 'PO6', 'PO7'], cells)).toEqual({
      outcomes: [
        { code: 'PO1', links: 4, average: 2.5 },
        { code: 'PO4', links: 3, average: 1.67 },
        { code: 'PO6', links: 2, average: 1 },
        { code: 'PO7', links: 0, average: null },
      ],
      uncovered: ['PO7'],
      unmappedCoIds: ['e'],
    });
    expect(mappingCoverage([], ['PO1'], {})).toEqual({
      outcomes: [{ code: 'PO1', links: 0, average: null }],
      uncovered: ['PO1'],
      unmappedCoIds: [],
    });
  });

  it('keeps CO ids by code when content is imported again', () => {
    let n = 0;
    const merged = mergeCos(
      [
        { _id: 'a', code: 'CO1' },
        { _id: 'b', code: 'CO2' },
      ],
      [
        { code: 'CO1', statement: 'New one' },
        { code: 'CO3', statement: 'New three' },
      ],
      () => `new-${++n}`,
    );
    expect(merged).toEqual([
      { _id: 'a', code: 'CO1', statement: 'New one' },
      { _id: 'new-1', code: 'CO3', statement: 'New three' },
    ]);
  });
});

describe('courseReadiness', () => {
  const imported: ReadinessInput = {
    credits: c(3, 0, 1),
    reviewNeeded: false,
    hasCoordinator: false,
    objectives: 2,
    cos: [
      { id: '1', bloomLevels: ['understand'] },
      { id: '2', bloomLevels: [] },
    ],
    mappedCoIds: new Set(),
    modules: 7,
    hasSyllabusFile: false,
    textbooks: 1,
    sessions: 43,
  };

  it('lists the steps of a credit course in order (CUTM1535 freshly imported: 5 of 8 done)', () => {
    const steps = courseReadiness(imported);
    expect(steps.map((s) => s.key)).toEqual([
      'coordinator',
      'objectives',
      'outcomes',
      'bloom',
      'mapping',
      'syllabus',
      'books',
      'sessions',
    ]);
    expect(steps.filter((s) => s.done).length).toBe(5);
  });

  it('adds a review step first when the import left notes, and drops outcome steps for a non-credit course', () => {
    expect(courseReadiness({ ...imported, reviewNeeded: true })[0]).toEqual({ key: 'review', done: false });
    expect(courseReadiness({ ...imported, credits: c(0, 0, 0) }).map((s) => s.key)).toEqual([
      'coordinator',
      'objectives',
      'syllabus',
      'sessions',
    ]);
  });

  it('counts the mapping done only when every CO has at least one link', () => {
    const mapped = courseReadiness({ ...imported, mappedCoIds: new Set(['1']) });
    expect(mapped.find((s) => s.key === 'mapping')?.done).toBe(false);
    expect(
      courseReadiness({ ...imported, mappedCoIds: new Set(['1', '2']) }).find((s) => s.key === 'mapping')?.done,
    ).toBe(true);
  });
});
