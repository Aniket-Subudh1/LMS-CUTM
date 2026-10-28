import { z } from 'zod';

export const Email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));
export const Password = z.string().min(10, 'Use at least 10 characters.').max(128, 'Use at most 128 characters.');

const matching = <T extends { password: string; confirm: string }>(v: T) => v.password === v.confirm;
const mismatch = { message: 'The passwords do not match.', path: ['confirm'] };

// M03c T14: where sign-in returns to — a path on this site only. `//host` and `/\host` are other sites to a browser, so
// they (and anything else) fall back to Home.
export const NextPath = z
  .string()
  .max(500)
  .regex(/^\/(?![/\\])[^\s\\]*$/);
export const LoginInput = z.object({
  email: Email,
  password: z.string().min(1, 'Enter your password.').max(128),
  next: NextPath.optional().catch(undefined),
});
export const ResetRequestInput = z.object({ email: Email });
export const ResetInput = z
  .object({ token: z.string().min(1), password: Password, confirm: z.string() })
  .refine(matching, mismatch);
export const ChangePasswordInput = z
  .object({
    current: z.string().min(1, 'Enter your current password.').max(128),
    password: Password,
    confirm: z.string(),
  })
  .refine(matching, mismatch);
