import { beforeAll, describe, expect, it } from 'vitest';
import { createSchemeVersion } from '@/app/(app)/admin/schemes/actions';
import { db } from '@/lib/db';
import { getLatestScheme, listActiveSchemes, listSchemeVersions } from '@/lib/data/schemes';
import { AuditLog } from '@/lib/models/audit-log';
import { EvaluationScheme } from '@/lib/models/evaluation-scheme';
import { Offering } from '@/lib/models/offering';
import { form, makeOffering, makeUser, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

type Row = { key: string; label: string; weight: string; modes: string[]; aggregation?: string; bestN?: string };

const QUIZ: Row = { key: 'quiz', label: 'Quizzes', weight: '30', modes: ['quiz'] };
const TEST: Row = { key: 'tests', label: 'Written tests', weight: '20', modes: ['written_test'] };

function scheme(componentKey: string, rows: Row[], over: Record<string, string> = {}) {
  const fields: Record<string, string | string[]> = {
    componentKey,
    name: 'Standard',
    internalMax: '50',
    externalMax: '50',
    decimals: '0',
    roundingMode: 'half_up',
    ...over,
  };
  rows.forEach((r, i) => {
    Object.assign(fields, {
      [`key_${i}`]: r.key,
      [`label_${i}`]: r.label,
      [`weight_${i}`]: r.weight,
      [`modes_${i}[]`]: r.modes,
      [`aggregation_${i}`]: r.aggregation ?? 'average',
      [`bestN_${i}`]: r.bestN ?? '',
    });
  });
  return form(fields);
}

beforeAll(async () => {
  await db();
  await Promise.all([EvaluationScheme.createCollection(), AuditLog.createCollection()]);
});

const asAdmin = async () => signInAs(await makeUser({ roles: ['admin'] }));

describe('createSchemeVersion', () => {
  it('is for admins only', async () => {
    switchBrowser(new Map());
    expect(await createSchemeVersion(scheme('theory', [QUIZ, TEST]))).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
    });
    await signInAs(await makeUser({ roles: ['faculty', 'hod', 'support'] }));
    expect(await createSchemeVersion(scheme('theory', [QUIZ, TEST]))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await EvaluationScheme.countDocuments()).toBe(0);
    await expect(listActiveSchemes()).rejects.toMatchObject({ digest: expect.stringContaining('/home') });
  });

  it('refuses weights that do not add up to the internal maximum and says both numbers', async () => {
    await asAdmin();
    expect(await createSchemeVersion(scheme('theory', [QUIZ, { ...TEST, weight: '15' }]))).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Weights add up to 45; they must add up to 50.',
    });
    expect(await EvaluationScheme.countDocuments({ componentKey: 'theory' })).toBe(0);
  });

  it('reports every problem at once', async () => {
    await asAdmin();
    const result = await createSchemeVersion(
      scheme('practice', [
        { key: 'lab', label: 'Lab', weight: '25', modes: ['lab_record'], aggregation: 'best_n' },
        { key: 'lab', label: 'Lab again', weight: '25', modes: ['lab_record'] },
      ]),
    );
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' });
    const message = result.ok ? '' : result.message;
    expect(message).toContain('The key "lab" is used by more than one component.');
    expect(message).toContain('counts the best N scores');
    const shared = await createSchemeVersion(scheme('practice', [QUIZ, { ...TEST, modes: ['written_test', 'quiz'] }]));
    expect(shared).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(shared.ok ? '' : shared.message).toContain('"quiz" is counted in both "quiz" and "tests"');
  });

  it('asks for a component and rejects an unknown component key or malformed rows', async () => {
    await asAdmin();
    expect(await createSchemeVersion(scheme('theory', []))).toMatchObject({
      ok: false,
      fieldErrors: { components: ['Add at least one component.'] },
    });
    expect(await createSchemeVersion(scheme('practice+theory', [QUIZ, TEST]))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await createSchemeVersion(scheme('theory', [{ ...QUIZ, weight: '-5' }, TEST]))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });

  it('retires the previous version, leaves other component keys alone and audits each version', async () => {
    await asAdmin();
    expect(await createSchemeVersion(scheme('theory+practice', [QUIZ, TEST]))).toMatchObject({ ok: true });
    expect(await createSchemeVersion(scheme('project', [{ ...QUIZ, weight: '50' }]))).toMatchObject({ ok: true });
    const v1 = await EvaluationScheme.findOne({ componentKey: 'theory+practice', version: 1 });

    const offering = await makeOffering({ schemeId: v1?._id });
    expect(
      await createSchemeVersion(
        scheme(
          'theory+practice',
          [
            { ...QUIZ, weight: '40' },
            { ...TEST, weight: '10' },
          ],
          { name: 'Revised' },
        ),
      ),
    ).toMatchObject({ ok: true });

    const versions = await EvaluationScheme.find({ componentKey: 'theory+practice' }).sort({ version: 1 });
    expect(versions.map((v) => [v.version, v.status, v.name])).toEqual([
      [1, 'retired', 'Standard'],
      [2, 'active', 'Revised'],
    ]);
    expect(versions[0].components[0].weight).toBe(30);
    expect((await EvaluationScheme.findOne({ componentKey: 'project' }))?.status).toBe('active');
    expect((await Offering.findById(offering._id))?.schemeId).toEqual(v1?._id);

    const audit = await AuditLog.find({ action: 'scheme.versioned', entityId: versions[1]._id }).lean();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      before: { version: 1 },
      after: { componentKey: 'theory+practice', version: 2, name: 'Revised' },
    });
  });

  it('stores N only for a best-N component and the rounding on the version', async () => {
    await asAdmin();
    const rows: Row[] = [
      { ...QUIZ, weight: '30', aggregation: 'best_n', bestN: '3' },
      { ...TEST, weight: '20', aggregation: 'sum', bestN: '9' },
    ];
    await createSchemeVersion(scheme('theory+project', rows, { decimals: '1', roundingMode: 'ceil' }));
    const saved = await getLatestScheme('theory+project');
    expect(saved?.components.map((c) => [c.aggregation, c.bestN])).toEqual([
      ['best_n', 3],
      ['sum', null],
    ]);
    expect(saved).toMatchObject({ decimals: 1, roundingMode: 'ceil', status: 'active', version: 1 });
  });

  it('never leaves two active versions when two admins save at once', async () => {
    await asAdmin();
    const results = await Promise.all([
      createSchemeVersion(scheme('practice+project', [QUIZ, TEST], { name: 'A' })),
      createSchemeVersion(scheme('practice+project', [QUIZ, TEST], { name: 'B' })),
    ]);
    for (const r of results) expect(r.ok || r.code === 'CONFLICT').toBe(true);
    const versions = await EvaluationScheme.find({ componentKey: 'practice+project' });
    expect(versions.filter((v) => v.status === 'active')).toHaveLength(1);
    expect(new Set(versions.map((v) => v.version)).size).toBe(versions.length);
  });
});

describe('reads', () => {
  it('lists active versions, history newest first, and the latest version', async () => {
    await asAdmin();
    for (const name of ['One', 'Two', 'Three']) {
      await createSchemeVersion(scheme('theory+practice+project', [QUIZ, TEST], { name }));
    }
    const history = await listSchemeVersions('theory+practice+project', 1);
    expect(history.total).toBe(3);
    expect(history.rows.map((v) => v.version)).toEqual([3, 2, 1]);
    expect((await getLatestScheme('theory+practice+project'))?.name).toBe('Three');
    const active = await listActiveSchemes();
    expect(active.filter((s) => s.componentKey === 'theory+practice+project').map((s) => s.version)).toEqual([3]);
    expect(await getLatestScheme('practice')).toBeNull();
  });
});
