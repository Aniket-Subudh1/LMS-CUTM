import { beforeAll, describe, expect, it, vi } from 'vitest';
import { suggestCoMap } from '@/app/(app)/catalog/actions';
import { suggestItemTags } from '@/app/(app)/tests/bank/actions';
import { db } from '@/lib/db';
import { Assessment } from '@/lib/models/assessment';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { form, makeAssessment, makeCourse, makeOffering, makeProgram, makeUser, newId, signInAs } from '../factories';

// M09 T5 (CPP-07, AC-M09-04): the two AI suggestions, with the AI replaced by these answers (06 §4.7).
type Tags = { coCodes: string[]; bloomLevel: string; rationale: string } | null;
type Cells = { co: string; outcome: string; level: number; rationale: string }[] | null;
const { ai } = vi.hoisted(() => ({
  ai: {
    configured: true,
    tags: vi.fn<(input: { promptText: string; cos: { code: string }[] }) => Promise<Tags>>(),
    map: vi.fn<(input: { cos: unknown[]; outcomes: { code: string; title: string }[] }) => Promise<Cells>>(),
  },
}));
vi.mock('@/lib/integrations/ai', () => ({
  aiConfigured: () => ai.configured,
  suggestItemTags: (input: never) => ai.tags(input),
  suggestCoMap: (input: never) => ai.map(input),
}));

const doc = (text: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, Course, CurriculumEntry, Offering, Program].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
});

async function world() {
  const [co1, co2] = [newId(), newId()];
  const course = await makeCourse({
    credits: { theory: 3, practice: 0, project: 0 },
    cos: [
      { _id: co1, code: 'CO1', statement: 'Explain pointers.' },
      { _id: co2, code: 'CO2', statement: 'Use files.' },
    ],
    coMap: [{ coId: co1, outcome: 'PO1', level: 2 }],
  });
  const program = await makeProgram({
    code: `ZZ${String(course._id).slice(-6)}`,
    outcomeTitles: [{ code: 'PO1', title: 'Engineering knowledge' }],
  });
  const faculty = await makeUser({ roles: ['faculty'], name: 'Ritu Faculty', email: `ritu.${String(co1)}@cutm.test` });
  const student = await makeUser({ roles: ['student'], name: 'Sanjay Student', rollNo: `R${String(co2).slice(-6)}` });
  const offering = await makeOffering({ courseId: course._id, programId: program._id, facultyIds: [faculty._id] });
  const test = await makeAssessment({ offeringId: offering._id, status: 'draft' });
  return { co1: String(co1), co2: String(co2), course, program, faculty, student, offering, test };
}

describe('suggestItemTags', () => {
  it('suggests from the dialog’s unsaved question, in the builder and in the course bank, and stores nothing', async () => {
    const w = await world();
    await signInAs(w.faculty);
    ai.tags.mockResolvedValue({ coCodes: ['CO2'], bloomLevel: 'apply', rationale: 'Opens and reads a file.' });
    const fields = { prompt: doc('Read a file line by line.'), 'option[]': ['fopen', 'malloc'] };
    expect(await suggestItemTags(form({ ...fields, assessmentId: String(w.test._id) }))).toEqual({
      ok: true,
      data: { coIds: [w.co2], bloomLevel: 'apply', rationale: 'Opens and reads a file.' },
    });
    expect(await suggestItemTags(form({ ...fields, offeringId: String(w.offering._id) }))).toMatchObject({ ok: true });
    // Only the question's words and the course's outcomes are sent — nobody's name, email or roll number.
    const brief = JSON.stringify(ai.tags.mock.calls.at(-1)?.[0]);
    expect(ai.tags.mock.calls.at(-1)?.[0].promptText).toBe(
      'Read a file line by line.\nOption 1: fopen\nOption 2: malloc',
    );
    for (const value of [w.faculty.name, w.faculty.email, w.student.name, w.student.email, w.student.rollNo]) {
      expect(brief).not.toContain(value);
    }
    expect((await Assessment.findById(w.test._id).lean())?.items).toEqual([]);
  });

  it('says when there is no suggestion, when the AI is not set up, and when the hour’s 30 are used', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const ask = () => suggestItemTags(form({ prompt: doc('Q?'), assessmentId: String(w.test._id) }));
    ai.tags.mockResolvedValue(null);
    expect(await ask()).toEqual({ ok: true, data: null });
    ai.configured = false;
    expect(await ask()).toMatchObject({ code: 'CONFLICT', message: 'AI suggestions are not set up.' });
    ai.configured = true;
    for (let i = 0; i < 29; i++) await ask();
    expect(await ask()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('refuses a standalone test, which has no course outcomes, and someone who does not teach the class', async () => {
    const w = await world();
    const standalone = await makeAssessment({ offeringId: null, ownerIds: [w.faculty._id], status: 'draft' });
    await signInAs(w.faculty);
    expect(await suggestItemTags(form({ prompt: doc('Q?'), assessmentId: String(standalone._id) }))).toMatchObject({
      code: 'CONFLICT',
    });
    await signInAs(await makeUser({ roles: ['faculty'] }));
    await expect(suggestItemTags(form({ prompt: doc('Q?'), offeringId: String(w.offering._id) }))).rejects.toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
  });
});

describe('suggestCoMap', () => {
  it('asks with the programme’s titled outcomes only, names the untitled, and changes no map', async () => {
    const w = await world();
    const admin = await makeUser({ roles: ['admin'] });
    await signInAs(admin);
    ai.map.mockResolvedValue([{ co: 'CO2', outcome: 'PO1', level: 3, rationale: 'Files are core knowledge.' }]);
    const result = await suggestCoMap({ courseId: String(w.course._id), offeringId: String(w.offering._id) });
    expect(result).toMatchObject({
      ok: true,
      data: { cells: [{ coId: w.co2, outcome: 'PO1', level: 3, rationale: 'Files are core knowledge.' }] },
    });
    expect(result.ok && result.data?.untitled).toContain('PO2');
    // An admin is shown where to give the untitled codes their titles.
    expect(result.ok && result.data?.titlesAt).toEqual([{ id: String(w.program._id), code: w.program.code }]);
    expect(ai.map.mock.calls.at(-1)?.[0].outcomes).toEqual([{ code: 'PO1', title: 'Engineering knowledge' }]);
    expect((await Course.findById(w.course._id).lean())?.coMap).toHaveLength(1);
  });

  it('on the catalogue course takes each code’s first title among the programmes listing it, by programme code', async () => {
    const w = await world();
    const earlier = await makeProgram({
      code: `AA${String(w.course._id).slice(-6)}`,
      outcomeTitles: [{ code: 'PO2', title: 'Problem analysis' }],
    });
    await CurriculumEntry.create([
      { programId: w.program._id, courseId: w.course._id, courseCode: w.course.code, basket: 'Core' },
      { programId: earlier._id, courseId: w.course._id, courseCode: w.course.code, basket: 'Core' },
    ]);
    await signInAs(await makeUser({ roles: ['admin'] }));
    ai.map.mockResolvedValue(null);
    expect(await suggestCoMap({ courseId: String(w.course._id) })).toEqual({ ok: true, data: null });
    expect(ai.map.mock.calls.at(-1)?.[0].outcomes).toEqual([
      { code: 'PO1', title: 'Engineering knowledge' },
      { code: 'PO2', title: 'Problem analysis' },
    ]);
  });
});
