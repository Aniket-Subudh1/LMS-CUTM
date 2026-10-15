import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeCourseware } from '@/lib/domain/courseware';
import { parseCoursePage } from './courseware';

// Real courseware pages (tests/fixtures/courseware, fetched 15 Oct 2026) read the way the import reads them.
const fixture = (id: number) => readFileSync(`tests/fixtures/courseware/${id}.html`, 'utf8');
const course = (id: number) => normalizeCourseware(parseCoursePage(fixture(id)));
const count = <T extends string>(list: readonly { kind: T }[]) =>
  list.reduce<Partial<Record<T, number>>>((totals, { kind }) => ({ ...totals, [kind]: (totals[kind] ?? 0) + 1 }), {});

describe('parseCoursePage', () => {
  it('reads the title, the two labels above it and the body as lines', () => {
    const page = parseCoursePage(fixture(836));
    expect(page).toMatchObject({ title: 'Advanced Complex Analysis', typeLabel: 'Core', identifier: '26507' });
    expect(page.blocks.slice(0, 4)).toEqual([
      { kind: 'line', text: 'Faculty: Dr. Goutam Kumar Mahato', bold: false },
      { kind: 'line', text: 'Course Name : Advanced Complex Analysis', bold: true },
      { kind: 'line', text: 'Code(Credit) : CUTM1535(3-0-1)', bold: true },
      { kind: 'line', text: 'Course Objectives', bold: true },
    ]);
  });

  it('keeps a wrapped list item on one line', () => {
    const lines = parseCoursePage(fixture(1160)).blocks.flatMap((b) => (b.kind === 'line' ? [b.text] : []));
    expect(lines).toContain(
      '• Role of Management Accounting in Strategic Decision-Making: A Study of Selected Companies',
    );
  });

  it('never passes on contact details', () => {
    const text = JSON.stringify(parseCoursePage(fixture(1250)));
    expect(text).not.toContain('9000012345');
    expect(text).not.toContain('coordinator@example.edu');
    expect(text).toContain('Swaraj Kumar');
  });

  it('refuses a page that is not a course page', () => {
    expect(() => parseCoursePage('<html><body><main><p>Not found</p></main></body></html>')).toThrow(
      'The courseware page has no course title',
    );
  });
});

describe('courseware pages as catalogue courses', () => {
  it('836: CUTM1535 Advanced Complex Analysis, the standard template', () => {
    const c = course(836);
    expect(c).toMatchObject({
      code: 'CUTM1535',
      title: 'Advanced Complex Analysis',
      type: 'core',
      credits: { theory: 3, practice: 0, project: 1 },
      facultyName: 'Dr. Goutam Kumar Mahato',
      coMap: [],
      issues: ['The outcomes had no CO numbers, so they were numbered in order.'],
    });
    expect(c.objectives).toHaveLength(2);
    expect(c.cos.map((co) => [co.code, co.suggestedBloom])).toEqual([
      ['CO1', 'understand'],
      ['CO2', 'evaluate'],
    ]);
    expect(c.modules).toHaveLength(7);
    expect(c.modules[1]).toEqual({
      title: 'Module II',
      hours: '4+0+2',
      topics: 'Residue, process for finding out the residues, Residue theorem, the Argument Principle.',
      practicals: [],
    });
    expect(c.projects).toHaveLength(6);
    expect(c.textbooks).toEqual([
      'L. V. Ahlfors, “Complex Analysis”, McGraw-Hill, Inc. · Chapters: 4 (2.1, 4.2 to 4.5, 5.1 to 5.3, 6.1 to 6.3), 5 (1.2, 1.3, 2.2, 3.1, 4.1), 7 (1.1, 2.1, 2.2, 2.3)',
    ]);
    expect(c.sessionPlan).toHaveLength(43);
    expect(count(c.sessionPlan)).toEqual({ theory: 31, project: 12 });
    expect(c.sessionPlan[7]).toEqual({ topic: 'Study on Residues and their Applications', kind: 'project' });
  });

  it('500: a 0-3-1 skill course with practicals, projects and long practice sessions', () => {
    const c = course(500);
    expect(c).toMatchObject({ code: 'CUTM3073', type: 'skill', credits: { theory: 0, practice: 3, project: 1 } });
    expect(c.modules.map((m) => [m.title, m.hours, m.practicals.length])).toEqual([
      ['Work Organization and management', '2', 1],
      ["Site survey and customer's requirement", '4', 2],
      ['Basics of electrical, electronics and solar energy', '6', 3],
      ['Basics of SPV system and components', '8', 4],
      ['Design and Installation of SPV System', '8', 4],
      ['Testing and Commissioning of SPV System', '6', 6],
    ]);
    expect(c.projects).toHaveLength(12);
    expect([c.textbooks.length, c.references.length]).toEqual([3, 4]);
    expect(count(c.sessionPlan)).toEqual({ practice: 20 });
  });

  it('1114: CO table with stated levels, list-item experiments and a session table', () => {
    const c = course(1114);
    expect(c).toMatchObject({
      code: 'CUST1051',
      credits: null,
      issues: ['The courseware page gives no credits (T-P-Pj).'],
    });
    expect(c.cos[1]).toEqual({
      code: 'CO2',
      statement: 'Implement servlet to control web applications.',
      bloomLevels: ['apply', 'analyse'],
      suggestedBloom: null,
    });
    expect(c.modules.map((m) => m.practicals.length)).toEqual([5, 5, 9, 5, 5, 10, 5]);
    expect(count(c.sessionPlan)).toEqual({ practice: 30, project: 30 });
    expect(c.sessionPlan[0].topic).toBe(
      'Set up a simple HTTP server and client; Create a basic web page and deploy on a web server',
    );
  });

  it('1160: a uniform mapping is imported and flagged', () => {
    const c = course(1160);
    expect(c).toMatchObject({ code: 'CUFM2350', credits: { theory: 3, practice: 0, project: 1 } });
    expect(c.coMap).toHaveLength(40);
    expect(c.issues).toEqual([
      'The outcomes had no CO numbers, so they were numbered in order.',
      'Every outcome has the same CO–PO mapping on the page; check that it is meant.',
    ]);
    expect(c.modules.map((m) => m.title)).toEqual([
      'Concept of Management Accounting',
      'Financial Performance Analysis',
      'Standard Costing and CVP Analysis',
      'Budgetary Control',
    ]);
    expect(c.projects).toHaveLength(20);
  });

  it('1173: numbered COs, a 1–3 mapping and a session table split by module rows', () => {
    const c = course(1173);
    expect(c.code).toBe('ASEC3103');
    // Its practice sessions are described at length, so their topics are cut to 200 characters.
    expect(c.issues).toEqual([
      'The courseware page gives no credits (T-P-Pj).',
      'Some entries were too long or too many and were cut; check them against the page.',
    ]);
    expect(c.objectives).toHaveLength(5);
    expect(c.cos.map((co) => co.code)).toEqual(['CO1', 'CO2', 'CO3', 'CO4', 'CO5']);
    expect(c.coMap.filter((cell) => cell.co === 'CO1')).toHaveLength(8);
    expect(c.modules).toHaveLength(5);
    expect(c.textbooks).toHaveLength(9);
    expect(count(c.sessionPlan)).toEqual({ theory: 18, practice: 15 });
  });

  it('1250: a DOCX course file with a descriptor table and H/M/L mapping', () => {
    const c = course(1250);
    expect(c).toMatchObject({
      code: 'ASAG1101',
      credits: { theory: 2, practice: 1, project: 0 },
      facultyName: 'Dr. P. Swaraj Kumar',
      issues: ['The page gives credits in two parts; they were read as theory + practice with no project credits.'],
    });
    expect(c.coMap.slice(0, 2)).toEqual([
      { co: 'CO1', outcome: 'PO1', level: 3 },
      { co: 'CO1', outcome: 'PO2', level: 2 },
    ]);
    expect(c.modules.at(-1)).toMatchObject({ title: 'Practicals' });
    expect(c.modules.at(-1)?.practicals).toHaveLength(12);
    expect(c.references).toHaveLength(6);
    expect(c.sessionPlan).toHaveLength(27);
  });
});
