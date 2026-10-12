import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { switchBrowser } from '../next-request';

// redirect() throws an error whose digest carries the target.
const REDIRECT_LOGIN = { digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/login;/) };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function load() {
  const [{ db }, { User }, { AuditLog }, { hashPassword }, { getViewer, signIn }, { redis }, actions] =
    await Promise.all([
      import('@/lib/db'),
      import('@/lib/models/user'),
      import('@/lib/models/audit-log'),
      import('@/lib/auth/password'),
      import('@/lib/auth/session'),
      import('@/lib/queue'),
      import('@/app/(app)/profile/actions'),
    ]);
  return { db, User, AuditLog, hashPassword, getViewer, signIn, redis, ...actions };
}
let m: Awaited<ReturnType<typeof load>>;

// Signs the user in on two browsers and leaves the first one active.
async function twoBrowsers(email: string) {
  const user = await m.User.create({
    name: 'Ravi Patnaik',
    email,
    roles: ['faculty'],
    status: 'active',
    passwordHash: await m.hashPassword('current-password-1'),
  });
  const id = String(user._id);
  const first = new Map<string, string>();
  const second = new Map<string, string>();
  for (const jar of [second, first]) {
    switchBrowser(jar);
    await m.signIn({ id, sessionVersion: user.sessionVersion });
  }
  return { id, first, second };
}

beforeAll(async () => {
  m = await load();
  await m.db();
  await Promise.all([m.User.createCollection(), m.AuditLog.createCollection()]);
});

afterAll(async () => {
  await m.redis().quit();
});

describe('changePassword', () => {
  it('requires a session', async () => {
    switchBrowser(new Map());
    expect(
      await m.changePassword(form({ current: 'x', password: 'new-password-12', confirm: 'new-password-12' })),
    ).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  });

  it('checks the current password and the email rule', async () => {
    await twoBrowsers('change.rules@cutm.local');
    expect(
      await m.changePassword(
        form({ current: 'wrong-password', password: 'new-password-12', confirm: 'new-password-12' }),
      ),
    ).toEqual({ ok: false, code: 'VALIDATION', message: 'Your current password is incorrect.' });
    expect(
      await m.changePassword(
        form({
          current: 'current-password-1',
          password: 'Change.Rules@cutm.local',
          confirm: 'Change.Rules@cutm.local',
        }),
      ),
    ).toEqual({ ok: false, code: 'VALIDATION', message: 'Your password must not be your email address.' });
  });

  it('keeps this browser signed in, signs out the other one and is audited', async () => {
    const { id, second } = await twoBrowsers('change.ok@cutm.local');
    expect(
      await m.changePassword(
        form({ current: 'current-password-1', password: 'new-password-12', confirm: 'new-password-12' }),
      ),
    ).toEqual({ ok: true, data: undefined });
    expect((await m.User.findById(id).lean())?.sessionVersion).toBe(2);
    expect(await m.getViewer()).toMatchObject({ id });
    switchBrowser(second);
    expect(await m.getViewer()).toBeNull();
    expect(await m.AuditLog.countDocuments({ entityId: id, actorId: id, action: 'user.password_changed' })).toBe(1);
  });
});

describe('signOutEverywhere', () => {
  it('revokes every session, clears this cookie, redirects to /login and is audited', async () => {
    const { id, first, second } = await twoBrowsers('everywhere@cutm.local');
    await expect(m.signOutEverywhere(form({}))).rejects.toMatchObject(REDIRECT_LOGIN);
    expect(first.has('lms_session')).toBe(false);
    switchBrowser(second);
    expect(await m.getViewer()).toBeNull();
    expect(await m.AuditLog.countDocuments({ entityId: id, action: 'user.sessions_revoked' })).toBe(1);
  });
});
