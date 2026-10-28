import { describe, expect, it } from 'vitest';
import { LoginInput, NextPath, Password, ResetInput } from '@/lib/schemas/auth';

describe('auth schemas', () => {
  it('accepts passwords of 10 to 128 characters', () => {
    expect(Password.safeParse('a'.repeat(9)).success).toBe(false);
    expect(Password.safeParse('a'.repeat(10)).success).toBe(true);
    expect(Password.safeParse('a'.repeat(128)).success).toBe(true);
    expect(Password.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('returns sign-in to paths on this site only (M03c T14)', () => {
    for (const path of ['/m/abc.def', '/meetings/1/room?x=1', '/home'])
      expect(NextPath.safeParse(path).success).toBe(true);
    for (const path of ['//evil.example', '/\\evil.example', 'https://evil.example', 'home', '/a b', '']) {
      expect(NextPath.safeParse(path).success).toBe(false);
    }
    expect(LoginInput.parse({ email: 'a@cutm.ac.in', password: 'x', next: '//evil.example' }).next).toBeUndefined();
    expect(LoginInput.parse({ email: 'a@cutm.ac.in', password: 'x', next: '/m/t' }).next).toBe('/m/t');
  });

  it('normalizes the email and reports a mismatched confirmation on its field', () => {
    expect(LoginInput.parse({ email: ' Asha@CUTM.ac.in ', password: 'x' }).email).toBe('asha@cutm.ac.in');
    const result = ResetInput.safeParse({ token: 't', password: 'a'.repeat(10), confirm: 'b'.repeat(10) });
    expect(result.error?.issues).toMatchObject([{ path: ['confirm'], message: 'The passwords do not match.' }]);
  });
});
