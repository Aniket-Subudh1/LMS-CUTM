import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ env: () => ({ SESSION_PASSWORD: 'unit-test-password-at-least-32-chars' }) }));

const data = { uid: '665f1c2b9a1e4b0012345678', sv: 3, purpose: 'reset' } as const;

afterEach(() => {
  vi.useRealTimers();
});

describe('tokens', () => {
  it('round-trips and checks the purpose', async () => {
    const { createToken, readToken } = await import('@/lib/auth/tokens');
    const token = await createToken(data);
    expect(await readToken(token, ['reset', 'invite'])).toEqual(data);
    expect(await readToken(token, ['invite'])).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const { createToken, readToken } = await import('@/lib/auth/tokens');
    const token = await createToken(data);
    const i = Math.floor(token.length / 2);
    const tampered = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
    expect(await readToken(tampered, ['reset'])).toBeNull();
  });

  it('expires a reset token after 30 minutes', async () => {
    const { createToken, readToken } = await import('@/lib/auth/tokens');
    vi.useFakeTimers({ now: new Date('2026-07-01T10:00:00Z') });
    const token = await createToken(data);
    vi.setSystemTime(new Date('2026-07-01T10:29:00Z'));
    expect(await readToken(token, ['reset'])).toEqual(data);
    vi.setSystemTime(new Date('2026-07-01T10:32:00Z'));
    expect(await readToken(token, ['reset'])).toBeNull();
  });
});
