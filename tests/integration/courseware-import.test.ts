import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CoursewarePage } from '@/lib/schemas/structure';

// The courseware site is served from tests/fixtures/courseware (real pages, contact details replaced) plus two
// made-up pages for the coordinator rule; the parser stays real.
vi.mock('@/lib/integrations/courseware', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/integrations/courseware')>();
  const line = (text: string, bold = false) => ({ kind: 'line' as const, text, bold });
  const madeUp = (code: string, faculty: string): CoursewarePage => ({
    title: `Made-up course ${code}`,
    typeLabel: 'Core',
    identifier: code,
    blocks: [
      line(`Faculty: ${faculty}`),
      line(`Code(Credit) : ${code}(3-0-1)`, true),
      line('Learning Outcomes', true),
      line('Explain the made-up topic.'),
    ],
  });
  const pages: Record<number, () => CoursewarePage> = {
    9001: () => madeUp('TEST9001', 'Dr. Asha Rao'),
    9002: () => madeUp('TEST9002', 'Prof. Ravi Das'),
  };
  return {
    ...real,
    listCourseIds: vi.fn(async (page: number) =>
      page === 1 ? { ids: [836, 500], lastPage: 2 } : { ids: [1173, 1250, 999], lastPage: 2 },
    ),
    fetchCoursePage: vi.fn(async (id: number) => {
      if (pages[id]) return pages[id]();
      try {
        return real.parseCoursePage(readFileSync(`tests/fixtures/courseware/${id}.html`, 'utf8'));
      } catch {
        return null;
      }
    }),
  };
});

const actions = await import('@/app/(app)/admin/imports/actions');
const catalog = await import('@/app/(app)/catalog/actions');
const { form, makeCourse, makeUser, signInAs } = await import('../factories');

type Models = {
  Course: typeof import('@/lib/models/course').Course;
  SyncRun: typeof import('@/lib/models/sync-run').SyncRun;
  AuditLog: typeof import('@/lib/models/audit-log').AuditLog;
  User: typeof import('@/lib/models/user').User;
};
let m: Models;
let worker: ReturnType<typeof import('@/worker/jobs/sync').startSyncWorker>;

beforeAll(async () => {
  const { env } = await import('@/lib/env');
  const { db } = await import('@/lib/db');
  const { startSyncWorker } = await import('@/worker/jobs/sync');
  m = {
    ...(await import('@/lib/models/course')),
    ...(await import('@/lib/models/sync-run')),
    ...(await import('@/lib/models/audit-log')),
    ...(await import('@/lib/models/user')),
  };
  await db();
  await Promise.all([
    m.Course.createIndexes(),
    m.User.createIndexes(),
    m.SyncRun.createCollection(),
    m.AuditLog.createCollection(),
  ]);
  worker = startSyncWorker(env().REDIS_URL);
});

afterAll(async () => {
  const { syncQueue, redis } = await import('@/lib/queue');
  await Promise.all([worker.close(), syncQueue().close()]);
  await redis().quit();
});

const asAdmin = async () => signInAs(await makeUser({ roles: ['admin'] }));

// Starts an import and waits for the worker to finish it.
async function run(fields: Record<string, string>) {
  const started = await actions.startCoursewareImport(form(fields));
  if (!started.ok || !started.data) throw new Error(`not started: ${JSON.stringify(started)}`);
  const runId = started.data.next.split('/').at(-1);
  await vi.waitFor(
    async () => {
      const current = await m.SyncRun.findById(runId).lean();
      expect(current?.status).not.toBe('running');
    },
    { timeout: 30_000, interval: 100 },
  );
  return m.SyncRun.findById(runId).lean();
}

describe('the courseware import (ADM-07)', () => {
  it('reads every listed page into its catalogue course, counts each page once, and lists what failed', async () => {
    await asAdmin();
    await makeCourse({
      code: 'CUTM1535',
      title: 'Advanced complex analysis',
      credits: { theory: 3, practice: 0, project: 1 },
    });
    await makeCourse({
      code: 'ASAG1101',
      title: 'Fundamentals of Agronomy',
      credits: { theory: 2, practice: 1, project: 0 },
    });

    const result = await run({ mode: 'all' });
    expect(result).toMatchObject({ status: 'partial', stats: { rows: 5, applied: 3, skipped: 0, failed: 2 } });
    expect(result?.failures.map((f) => [f.key, f.message])).toEqual(
      expect.arrayContaining([
        ['course/1173', 'ASEC3103 is not in the catalogue and its page gives no credits.'],
        ['course/999', 'There is no courseware page 999.'],
      ]),
    );

    // AC-M01b-02
    const cutm1535 = await m.Course.findOne({ code: 'CUTM1535' }).lean();
    expect(cutm1535).toMatchObject({
      title: 'Advanced complex analysis',
      credits: { theory: 3, practice: 0, project: 1 },
      source: { coursewareId: 836, url: 'http://courseware.test/course/836', facultyName: 'Dr. Goutam Kumar Mahato' },
      contentEditedAt: null,
      reviewNeeded: true,
    });
    expect(cutm1535?.objectives).toHaveLength(2);
    expect(cutm1535?.cos.map((co) => [co.code, co.bloomLevels, co.suggestedBloom])).toEqual([
      ['CO1', [], 'understand'],
      ['CO2', [], 'evaluate'],
    ]);
    expect([cutm1535?.modules.length, cutm1535?.projects.length, cutm1535?.textbooks.length]).toEqual([7, 6, 1]);
    expect(cutm1535?.sessionPlan).toHaveLength(43);
    expect(cutm1535?.sessionPlan.filter((s) => s.kind === 'project')).toHaveLength(12);

    // A code the course list does not have becomes a draft for an admin to check.
    expect(await m.Course.findOne({ code: 'CUTM3073' }).lean()).toMatchObject({
      status: 'draft',
      credits: { theory: 0, practice: 3, project: 1 },
      type: 'skill',
      reviewNeeded: true,
    });
    // The catalogue's credits stand; the two-part split on the page is a note.
    expect((await m.Course.findOne({ code: 'ASAG1101' }).lean())?.issues).toContain(
      'The page gives credits in two parts; they were read as theory + practice with no project credits.',
    );
    expect(
      JSON.stringify(await m.Course.find({ code: { $in: ['ASAG1101', 'CUTM1535', 'CUTM3073'] } }).lean()),
    ).not.toMatch(/9000012345|coordinator@example\.edu/);
    expect(await m.AuditLog.countDocuments({ action: 'course.imported' })).toBe(3);

    // A second run reads the same pages and changes nothing.
    expect(await run({ mode: 'all' })).toMatchObject({
      status: 'partial',
      stats: { rows: 5, applied: 0, skipped: 3, failed: 2 },
    });
    // "Pages not imported yet" lists only the pages no course is bound to.
    expect(await run({ mode: 'new' })).toMatchObject({ stats: { rows: 2, applied: 0, failed: 2 } });
  });

  it('never overwrites content edited here, unless an admin replaces it, which keeps the outcome ids (AC-M01b-03)', async () => {
    await asAdmin();
    const course = await m.Course.findOne({ code: 'CUTM1535' }).lean();
    const [co1, co2] = course?.cos ?? [];
    const courseId = String(course?._id);
    expect(
      await catalog.saveCos(
        form({
          courseId,
          rows: '2',
          coId_0: String(co1?._id),
          statement_0: 'Explain residues, edited here.',
          'bloom_0[]': 'understand',
          coId_1: String(co2?._id),
          statement_1: co2?.statement ?? '',
          'bloom_1[]': 'evaluate',
        }),
      ),
    ).toMatchObject({ ok: true });

    // The page "changed" since it was imported: the edit stands and the course gets a note.
    await m.Course.updateOne({ _id: courseId }, { $set: { 'source.contentHash': 'an older page' } });
    expect(await run({ mode: 'one', page: 'http://courseware.test/course/836' })).toMatchObject({
      status: 'succeeded',
      stats: { applied: 0, skipped: 1 },
    });
    let after = await m.Course.findById(courseId).lean();
    expect(after?.cos[0].statement).toBe('Explain residues, edited here.');
    expect(after?.issues).toContain(
      'The courseware page changed after this course was edited here; the changes were not applied.',
    );

    const replaced = await catalog.reimportCourse(form({ courseId }));
    expect(replaced).toMatchObject({ ok: true, data: { next: expect.stringMatching(/^\/admin\/imports\//) } });
    const runId = replaced.ok ? (replaced.data?.next.split('/').at(-1) ?? '') : '';
    await vi.waitFor(async () => expect((await m.SyncRun.findById(runId).lean())?.status).toBe('succeeded'), {
      timeout: 30_000,
      interval: 100,
    });
    after = await m.Course.findById(courseId).lean();
    expect(after?.cos[0].statement).toBe(co1?.statement);
    expect(after?.cos.map((co) => String(co._id))).toEqual([String(co1?._id), String(co2?._id)]);
    expect(after?.contentEditedAt).toBeNull();
  });

  it('prefills the coordinator only when exactly one faculty member has the page’s name', async () => {
    await asAdmin();
    await makeUser({ roles: ['faculty'], name: 'Asha Rao' });
    await Promise.all([
      makeUser({ roles: ['faculty'], name: 'Ravi Das' }),
      makeUser({ roles: ['faculty'], name: 'Ravi  Das' }),
    ]);
    await makeCourse({ code: 'TEST9001' });
    await makeCourse({ code: 'TEST9002' });
    await run({ mode: 'one', page: '9001' });
    await run({ mode: 'one', page: '9002' });
    const asha = await m.User.findOne({ name: 'Asha Rao' }).lean();
    expect((await m.Course.findOne({ code: 'TEST9001' }).lean())?.coordinatorId?.equals(asha?._id)).toBe(true);
    expect((await m.Course.findOne({ code: 'TEST9002' }).lean())?.coordinatorId).toBeNull();
  });

  it('runs one import at a time and takes a page only from the courseware site', async () => {
    await asAdmin();
    expect(
      await actions.startCoursewareImport(form({ mode: 'one', page: 'https://evil.example/course/836' })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { page: ['Enter a page number such as 836, or a link on the courseware site.'] },
    });
    const busy = await m.SyncRun.create({ kind: 'courseware', mode: 'all', startedAt: new Date(), stats: { rows: 0 } });
    expect(await actions.startCoursewareImport(form({ mode: 'new' }))).toMatchObject({ ok: false, code: 'CONFLICT' });
    await m.SyncRun.updateOne({ _id: busy._id }, { $set: { status: 'failed' } });
  });
});
