import { beforeAll, describe, expect, it } from 'vitest';
import { importCourseList } from '@/app/(app)/admin/imports/actions';
import { db } from '@/lib/db';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Program } from '@/lib/models/program';
import { form, makeCourse, makeProgram, makeUser, signInAs } from '../factories';

const HEADER = 'programme,stream,basket,type,code,title,credits,tpp';

beforeAll(async () => {
  await db();
  await Promise.all([
    Course.createIndexes(),
    Program.createIndexes(),
    CurriculumEntry.createIndexes(),
    AuditLog.createCollection(),
  ]);
});

function upload(rows: string[], createProgrammes = false) {
  const fd = form(createProgrammes ? { createProgrammes: 'true' } : {});
  fd.set('file', new File([[HEADER, ...rows].join('\n')], 'courses.csv', { type: 'text/csv' }));
  return importCourseList(fd);
}

const asAdmin = async () => signInAs(await makeUser({ roles: ['admin'] }));

describe('importCourseList (ADM-06, AC-M01b-01)', () => {
  it('is for admins only', async () => {
    await signInAs(await makeUser({ roles: ['faculty'] }));
    expect(await upload(['M.Sc Maths,,,Core,CUTM1535,Advanced complex analysis,4,3+0+1'])).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('writes nothing when one row of thousands is wrong, and names that row', async () => {
    await asAdmin();
    const program = await makeProgram({ code: 'BULK-P', name: 'Bulk programme' });
    const rows = Array.from(
      { length: 3000 },
      (_, i) => `BULK-P,,,Core,BLK${String(i).padStart(4, '0')},Course ${i},4,3+0+1`,
    );
    rows[1499] = 'BULK-P,,,Core,BLK1499,Course 1499,4,2+0+1';
    expect(await upload(rows)).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { file: ['Row 1500: Credits 4 do not match T+P+Pj 2-0-1.'] },
    });
    expect(await Course.countDocuments({ code: /^BLK/ })).toBe(0);
    expect(await CurriculumEntry.countDocuments({ programId: program._id })).toBe(0);
  });

  it('creates courses, baskets and links (programmes only when asked), and a second upload changes nothing', async () => {
    await asAdmin();
    const rows = [
      'M.Sc Mathematics,,Basket I,Core,CUTM1535,Advanced complex analysis,4,3+0+1',
      'M.Sc Mathematics,,Basket I,Core,CUTM1014,"Gender, Human Rights and Ethics",3,1.5+0+1.5',
      'B.Tech Agriculture,AG,Basket IV,Domain Elective,CUTM1014,"Gender, Human Rights and Ethics",3,1.5--0--1.5',
      'B.Tech Agriculture,AG,,Skill,CUTM9101,Drone basics,6,2--2--2',
    ];
    expect(await upload(rows)).toMatchObject({
      ok: false,
      fieldErrors: {
        file: [
          'Row 1: There is no programme "M.Sc Mathematics" (2 rows). Add it, or tick "Create programmes that do not exist yet".',
          'Row 3: There is no programme "B.Tech Agriculture" (2 rows). Add it, or tick "Create programmes that do not exist yet".',
        ],
      },
    });

    expect(await upload(rows, true)).toEqual({
      ok: true,
      data: {
        rows: 4,
        coursesCreated: 3,
        coursesUpdated: 0,
        linksCreated: 4,
        linksUpdated: 0,
        programmesCreated: 2,
        basketsCreated: 2,
      },
    });
    const msc = await Program.findOne({ name: 'M.Sc Mathematics' }).lean();
    expect(msc).toMatchObject({ code: 'MSC-MATHEMATICS', departmentId: null, baskets: [{ name: 'Basket I' }] });
    expect(await Course.findOne({ code: 'CUTM1014' }).lean()).toMatchObject({
      title: 'Gender, Human Rights and Ethics',
      credits: { theory: 1.5, practice: 0, project: 1.5 },
      type: 'core',
      status: 'active',
    });
    expect(await Course.findOne({ code: 'CUTM9101' }).lean()).toMatchObject({
      credits: { theory: 2, practice: 2, project: 2 },
      type: 'skill',
    });
    expect(await CurriculumEntry.findOne({ courseCode: 'CUTM1014', stream: 'AG' }).lean()).toMatchObject({
      basket: 'Basket IV',
      courseType: 'Domain Elective',
    });

    expect(await upload(rows, true)).toMatchObject({
      ok: true,
      data: {
        coursesCreated: 0,
        coursesUpdated: 0,
        linksCreated: 0,
        linksUpdated: 0,
        programmesCreated: 0,
        basketsCreated: 0,
      },
    });
    expect(await AuditLog.countDocuments({ action: 'course.list_imported' })).toBe(2);
  });

  it('matches a programme by name before code, so a second upload of look-alike names changes nothing', async () => {
    await asAdmin();
    const rows = ['M.Phil,,,Core,CUTM8101,Research methods,4,3+0+1', 'MPhil,,,Core,CUTM8102,Field work,4,0+0+4'];
    expect(await upload(rows, true)).toMatchObject({ ok: true, data: { programmesCreated: 2, linksCreated: 2 } });
    expect(await upload(rows, true)).toMatchObject({ ok: true, data: { programmesCreated: 0, linksCreated: 0 } });
    const mphil = await Program.findOne({ name: 'MPhil' }).lean();
    expect(mphil?.code).toBe('MPHIL-2');
    expect(await CurriculumEntry.find({ programId: mphil?._id }).distinct('courseCode')).toEqual(['CUTM8102']);
  });

  it('changes only the title and credits of a known course, and notes a credit change for review', async () => {
    await asAdmin();
    const program = await makeProgram({ code: 'KNOWN-P', name: 'Known programme' });
    const course = await makeCourse({
      code: 'CUTM8001',
      title: 'Old title',
      credits: { theory: 3, practice: 0, project: 1 },
      objectives: ['Kept as it is'],
      contentEditedAt: new Date(),
    });
    expect(await upload(['KNOWN-P,,,Core,CUTM8001,New title,4,2+1+1'])).toMatchObject({
      ok: true,
      data: { coursesUpdated: 1, linksCreated: 1 },
    });
    expect(await Course.findById(course._id).lean()).toMatchObject({
      title: 'New title',
      credits: { theory: 2, practice: 1, project: 1 },
      objectives: ['Kept as it is'],
      reviewNeeded: true,
      issues: ['Credits changed by the course list from 3-0-1 to 2-1-1.'],
    });
    expect(await CurriculumEntry.countDocuments({ programId: program._id })).toBe(1);
  });
});
