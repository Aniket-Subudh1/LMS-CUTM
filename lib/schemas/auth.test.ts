import { describe, expect, it } from 'vitest';
import { LoginInput, Password, ResetInput } from '@/lib/schemas/auth';

describe('auth schemas', () => {
  it('accepts passwords of 10 to 128 characters', () => {
    expect(Password.safeParse('a'.repeat(9)).success).toBe(false);
    expect(Password.safeParse('a'.repeat(10)).success).toBe(true);
    expect(Password.safeParse('a'.repeat(128)).success).toBe(true);
    expect(Password.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('normalizes the email and reports a mismatched confirmation on its field', () => {
    expect(LoginInput.parse({ email: ' Asha@CUTM.ac.in ', password: 'x' }).email).toBe('asha@cutm.ac.in');
    const result = ResetInput.safeParse({ token: 't', password: 'a'.repeat(10), confirm: 'b'.repeat(10) });
    expect(result.error?.issues).toMatchObject([{ path: ['confirm'], message: 'The passwords do not match.' }]);
  });
});
