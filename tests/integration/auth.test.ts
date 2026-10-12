import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { browser, switchBrowser } from '../next-request';

// redirect() throws an error whose digest carries the target.
const REDIRECT_HOME = { digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/home;/) };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function load() {
  const [{ db }, { User }, { AuditLog }, { hashPassword }, { getViewer }, { mailQueue, redis }, actions] =
    await Promise.all([
      import('@/lib/db'),
      import('@/lib/models/user'),
      import('@/lib/models/audit-log'),
      import('@/lib/auth/password'),
      import('@/lib/auth/session'),
      import('@/lib/queue'),
      import('@/app/(auth)/actions'),
    ]);
  return { db, User, AuditLog, hashPassword, getViewer, mailQueue, redis, ...actions };
}
let m: Awaited<ReturnType<typeof load>>;

async function makeUser(email: string, fields: { status?: 'invited' | 'active' | 'disabled'; password?: string } = {}) {
  const passwordHash = fields.password ? await m.hashPassword(fields.password) : undefined;
  const user = await m.User.create({
    name: 'Asha Mohanty',
    email,
    roles: ['student'],
    status: fields.status ?? 'active',
    passwordHash,
  });
  return String(user._id);
}

async function queuedLink(to: string): Promise<string> {
  const jobs = await m.mailQueue().getJobs(['waiting', 'delayed', 'prioritized']);
  const job = jobs.find((j) => j.data.to === to);
  const link = job?.data.text.match(/http\S+/)?.[0];
  if (!link) throw new Error(`no email queued for ${to}`);
  return link;
}

beforeAll(async () => {
  m = await load();
  await m.db();
  await Promise.all([m.User.createCollection(), m.AuditLog.createCollection()]);
});

beforeEach(() => {
  switchBrowser(new Map());
});

afterAll(async () => {
  await m.mailQueue().close();
  await m.redis().quit();
});

describe('login', () => {
  it('signs in an active user, records the time and redirects home', async () => {
    const id = await makeUser('login.ok@cutm.local', { password: 'correct-horse-1' });
    await expect(m.login(form({ email: ' Login.OK@cutm.local ', password: 'correct-horse-1' }))).rejects.toMatchObject(
      REDIRECT_HOME,
    );
    expect(browser.cookies.has('lms_session')).toBe(true);
    expect(await m.getViewer()).toMatchObject({ id, email: 'login.ok@cutm.local', roles: ['student'] });
    expect((await m.User.findById(id).lean())?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('gives the same answer for a wrong password, a disabled user, an invited user and an unknown email', async () => {
    await makeUser('login.wrong@cutm.local', { password: 'correct-horse-1' });
    await makeUser('login.disabled@cutm.local', { status: 'disabled', password: 'correct-horse-1' });
    await makeUser('login.invited@cutm.local', { status: 'invited' });
    const incorrect = { ok: false, code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.' };
    expect(await m.login(form({ email: 'login.wrong@cutm.local', password: 'wrong-horse-1' }))).toEqual(incorrect);
    expect(await m.login(form({ email: 'login.disabled@cutm.local', password: 'correct-horse-1' }))).toEqual(incorrect);
    expect(await m.login(form({ email: 'login.invited@cutm.local', password: 'anything-12' }))).toEqual(incorrect);
    expect(await m.login(form({ email: 'nobody@cutm.local', password: 'anything-12' }))).toEqual(incorrect);
    expect(browser.cookies.size).toBe(0);
  });

  it('blocks the 6th failed attempt for one email, even with the right password', async () => {
    await makeUser('login.limited@cutm.local', { password: 'correct-horse-1' });
    for (let i = 0; i < 5; i++) {
      expect(await m.login(form({ email: 'login.limited@cutm.local', password: 'wrong-horse-1' }))).toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    }
    expect(await m.login(form({ email: 'login.limited@cutm.local', password: 'correct-horse-1' }))).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      message: expect.stringMatching(/^Too many attempts\. Try again in \d+ minutes?\.$/),
    });
  });

  it('does not count successful sign-ins toward the limit', async () => {
    await makeUser('login.often@cutm.local', { password: 'correct-horse-1' });
    for (let i = 0; i < 7; i++) {
      await expect(
        m.login(form({ email: 'login.often@cutm.local', password: 'correct-horse-1' })),
      ).rejects.toMatchObject(REDIRECT_HOME);
    }
  });

  it('rejects invalid input before touching the database', async () => {
    expect(await m.login(form({ email: 'not-an-email', password: '' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { email: ['Enter a valid email address.'], password: ['Enter your password.'] },
    });
  });
});

describe('password reset', () => {
  it('says when the email is missing and queues one email when it is registered', async () => {
    await makeUser('reset.known@cutm.local', { password: 'correct-horse-1' });
    expect(await m.requestPasswordReset(form({ email: 'reset.unknown@cutm.local' }))).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'This email does not exist in the database.',
    });
    expect(await m.requestPasswordReset(form({ email: 'reset.known@cutm.local' }))).toEqual({ ok: true });
    expect(await queuedLink('reset.known@cutm.local')).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=/);
    await expect(queuedLink('reset.unknown@cutm.local')).rejects.toThrow('no email queued');
  });

  it('limits requests to 3 per hour per email', async () => {
    for (let i = 0; i < 3; i++) {
      expect(await m.requestPasswordReset(form({ email: 'reset.limit@cutm.local' }))).toMatchObject({
        code: 'NOT_FOUND',
      });
    }
    expect(await m.requestPasswordReset(form({ email: 'reset.limit@cutm.local' }))).toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('sets the password once, signs in, revokes old sessions and is audited', async () => {
    const id = await makeUser('reset.use@cutm.local', { password: 'old-password-1' });
    const before = (await m.User.findById(id).lean())?.sessionVersion;
    await m.requestPasswordReset(form({ email: 'reset.use@cutm.local' }));
    const token = new URL(await queuedLink('reset.use@cutm.local')).searchParams.get('token') ?? '';

    expect(
      await m.resetPassword(form({ token, password: 'reset.use@cutm.local', confirm: 'reset.use@cutm.local' })),
    ).toEqual({ ok: false, code: 'VALIDATION', message: 'Your password must not be your email address.' });
    expect(
      await m.resetPassword(form({ token, password: 'new-password-1', confirm: 'other-password-1' })),
    ).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { confirm: ['The passwords do not match.'] },
    });
    await expect(
      m.resetPassword(form({ token, password: 'new-password-1', confirm: 'new-password-1' })),
    ).rejects.toMatchObject(REDIRECT_HOME);
    expect(await m.getViewer()).toMatchObject({ id });
    expect((await m.User.findById(id).lean())?.sessionVersion).toBe((before ?? 0) + 1);
    expect(await m.AuditLog.countDocuments({ entityId: id, action: 'user.password_changed' })).toBe(1);

    switchBrowser(new Map());
    expect(await m.resetPassword(form({ token, password: 'third-password-1', confirm: 'third-password-1' }))).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'This link has expired or was already used.',
    });
    await expect(m.login(form({ email: 'reset.use@cutm.local', password: 'new-password-1' }))).rejects.toMatchObject(
      REDIRECT_HOME,
    );
  });

  it('activates an invited user from an invite token', async () => {
    const { createToken } = await import('@/lib/auth/tokens');
    const id = await makeUser('invite.accept@cutm.local', { status: 'invited' });
    const token = await createToken({ uid: id, sv: 1, purpose: 'invite' });
    await expect(
      m.resetPassword(form({ token, password: 'first-password-1', confirm: 'first-password-1' })),
    ).rejects.toMatchObject(REDIRECT_HOME);
    expect((await m.User.findById(id).lean())?.status).toBe('active');
    expect(await m.AuditLog.findOne({ entityId: id }, { _id: 0, action: 1, before: 1, after: 1 }).lean()).toEqual({
      action: 'user.password_changed',
      before: { status: 'invited' },
      after: { status: 'active' },
    });
  });

  it('rejects a tampered token', async () => {
    expect(
      await m.resetPassword(
        form({ token: 'Fe26.2*garbage', password: 'first-password-1', confirm: 'first-password-1' }),
      ),
    ).toMatchObject({ code: 'VALIDATION', message: 'This link has expired or was already used.' });
  });
});
