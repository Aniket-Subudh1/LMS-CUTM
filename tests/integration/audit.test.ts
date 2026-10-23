import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getAuditStats, listAudit, listAuditEntities } from '@/lib/data/audit';
import { AuditLog } from '@/lib/models/audit-log';
import { makeUser, newId, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

const redirectsTo = (path: string) => ({ digest: expect.stringMatching(new RegExp(`;${path};`)) });

beforeAll(async () => {
  await db();
  await AuditLog.createCollection();
  await AuditLog.syncIndexes();
});

describe('listAudit', () => {
  it('is for admins only', async () => {
    await signInAs(await makeUser({ roles: ['support'] }));
    await expect(listAudit(1, {})).rejects.toMatchObject(redirectsTo('/home'));
    switchBrowser(new Map());
    await expect(listAudit(1, {})).rejects.toMatchObject(redirectsTo('/login'));
  });

  it('filters by entity, entity id, actor, offering and IST day, newest first', async () => {
    const admin = await makeUser({ roles: ['admin'], email: 'auditor@cutm.test', name: 'Auditor' });
    await signInAs(admin);
    const entityId = newId();
    const offeringId = newId();
    const entry = (at: string, over: Record<string, unknown> = {}) => ({
      at: new Date(at),
      actorId: admin._id,
      action: 'x.changed',
      entity: 'probe',
      entityId,
      ...over,
    });
    await AuditLog.create([
      entry('2026-03-10T18:29:59Z', { reason: 'late on the 10th IST' }),
      entry('2026-03-10T18:30:00Z', { reason: 'first moment of the 11th IST', offeringId, after: { n: 1 } }),
      entry('2026-03-11T18:29:59Z', { reason: 'last moment of the 11th IST' }),
      entry('2026-03-11T18:30:00Z', { reason: 'first moment of the 12th IST' }),
      entry('2026-03-11T00:00:00Z', { actorId: newId(), entity: 'other', entityId: newId() }),
    ]);

    const byEntity = await listAudit(1, { entityId: String(entityId) });
    expect(byEntity.total).toBe(4);
    expect(byEntity.rows.map((r) => r.reason)).toEqual([
      'first moment of the 12th IST',
      'last moment of the 11th IST',
      'first moment of the 11th IST',
      'late on the 10th IST',
    ]);
    expect(byEntity.rows[0]).toMatchObject({ actor: 'Auditor (auditor@cutm.test)', entity: 'probe' });

    const day = await listAudit(1, { entityId: String(entityId), from: '2026-03-11', to: '2026-03-11' });
    expect(day.rows.map((r) => r.reason)).toEqual(['last moment of the 11th IST', 'first moment of the 11th IST']);

    expect((await listAudit(1, { offeringId: String(offeringId) })).rows[0]).toMatchObject({ after: { n: 1 } });
    expect((await listAudit(1, { entity: 'other' })).total).toBe(1);
    expect((await listAudit(1, { actorEmail: 'AUDITOR@cutm.test', entityId: String(entityId) })).total).toBe(4);
    expect((await listAudit(1, { actorEmail: 'nobody@cutm.test' })).total).toBe(0);
  });

  it('pages 10 at a time', async () => {
    await signInAs(await makeUser({ roles: ['admin'] }));
    const entityId = newId();
    await AuditLog.insertMany(
      Array.from({ length: 13 }, (_, i) => ({
        at: new Date(Date.UTC(2026, 0, 1, 0, i)),
        actorId: newId(),
        action: 'bulk.row',
        entity: 'paging',
        entityId,
      })),
    );
    const first = await listAudit(1, { entity: 'paging' });
    const second = await listAudit(2, { entity: 'paging' });
    expect([first.rows.length, second.rows.length, first.total]).toEqual([10, 3, 13]);
  });
});

describe('getAuditStats and listAuditEntities', () => {
  it('counts entries today and in the last seven IST days, who made them, and lists the kinds of record', async () => {
    await signInAs(await makeUser({ roles: ['admin'] }));
    const [one, two] = [newId(), newId()];
    const entry = (actorId: typeof one, daysAgo: number, entity: string) => ({
      at: new Date(Date.now() - daysAgo * 86_400_000),
      actorId,
      action: 'stats.row',
      entity,
      entityId: newId(),
    });
    const before = await getAuditStats();
    await AuditLog.insertMany([entry(one, 0, 'stats_today'), entry(two, 3, 'stats_week'), entry(two, 30, 'stats_old')]);
    const after = await getAuditStats();
    expect(after.total - before.total).toBe(3);
    expect(after.week - before.week).toBe(2);
    expect(after.people - before.people).toBe(2);
    expect(after.today - before.today).toBe(1);
    expect(await listAuditEntities()).toEqual(expect.arrayContaining(['stats_old', 'stats_today', 'stats_week']));
    await signInAs(await makeUser({ roles: ['faculty'] }));
    await expect(getAuditStats()).rejects.toMatchObject(redirectsTo('/home'));
  });
});
