import { z } from 'zod';
import { Email } from '@/lib/schemas/auth';
import { istDateTime, objectId } from '@/lib/schemas/common';
import { ASSESSMENT_MODES } from '@/lib/schemas/assessment';

// M04b (TP-01–TP-03): standalone tests, share links and guest registration.

export const LINK_AUDIENCES = ['class', 'guests'] as const;
export type LinkAudience = (typeof LINK_AUDIENCES)[number];

export const TEST_LIMITS = { linksPerTest: 20, domains: 10, invitesPerSend: 500, label: 80, code: 40 } as const;

const blankIsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const title = z.string().trim().min(3, 'Use at least 3 characters.').max(160, 'Use at most 160 characters.');

// A standalone test (TP-02) starts like a course assessment: type, title and window.
export const CreateTest = z
  .object({ mode: z.enum(ASSESSMENT_MODES, 'Choose a type.'), title, opensAt: istDateTime, closesAt: istDateTime })
  .refine((input) => input.opensAt < input.closesAt, { path: ['closesAt'], message: 'Close it after it opens.' });

// "gmail.com, cutm.ac.in" → ['gmail.com', 'cutm.ac.in'].
const domains = z
  .string()
  .trim()
  .max(400)
  .default('')
  .transform((value) =>
    value
      .split(/[\s,;]+/)
      .map((d) => d.replace(/^@/, '').toLowerCase())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.string().regex(/^[a-z\d-]+(\.[a-z\d-]+)+$/, 'Write domains like cutm.ac.in, separated by commas.'))
      .max(TEST_LIMITS.domains, `Use at most ${TEST_LIMITS.domains} domains.`),
  );

export const SaveLink = z.object({
  assessmentId: objectId,
  audience: z.enum(LINK_AUDIENCES, 'Choose who the link is for.'),
  label: z
    .string()
    .trim()
    .min(1, 'Name the link.')
    .max(TEST_LIMITS.label, `Use at most ${TEST_LIMITS.label} characters.`),
  accessCode: blankIsMissing(
    z
      .string()
      .trim()
      .min(4, 'Use at least 4 characters.')
      .max(TEST_LIMITS.code, `Use at most ${TEST_LIMITS.code} characters.`),
  ),
  expiresAt: blankIsMissing(istDateTime),
  maxUses: blankIsMissing(z.coerce.number().int('Use a whole number.').min(1).max(100_000)),
  allowedDomains: domains,
});

export const LinkRef = z.object({ assessmentId: objectId, linkId: objectId });
export const SetLinkActive = z.object({ ...LinkRef.shape, active: z.stringbool() });

// Email invitations: one address per line or separated by commas (TP-01).
export const InviteToTest = z.object({
  ...LinkRef.shape,
  emails: z
    .string()
    .max(40_000)
    .transform((value) => [
      ...new Set(
        value
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z
        .array(z.email('One of these is not an email address.'))
        .min(1, 'Add at least one email address.')
        .max(TEST_LIMITS.invitesPerSend, `Send at most ${TEST_LIMITS.invitesPerSend} at a time.`),
    ),
});

export const linkToken = z.string().regex(/^[A-Za-z\d_-]{16,64}$/, 'This link is not valid.');
const accessCode = blankIsMissing(z.string().trim().max(TEST_LIMITS.code));

// TP-03: a guest asks for a code, then confirms it. The code step names the pending code by its id (in the page's
// address), so the email never travels in a URL.
export const RegisterGuest = z.object({
  token: linkToken,
  name: z.string().trim().min(2, 'Enter your full name.').max(120, 'Use at most 120 characters.'),
  email: Email,
  accessCode,
  consent: z.stringbool({ error: 'Agree to continue.' }).refine((v) => v, 'Agree to continue.'),
});
export const VerifyGuestCode = z.object({
  token: linkToken,
  otpId: objectId,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6 digits from the email.'),
});
// TP-03: someone who joined through the link asks for a code to sign in again.
export const ReturnAsGuest = z.object({ token: linkToken, email: Email });
// TP-01: an LMS user signs in on the link's own page, or continues when already signed in.
export const SignInToTest = z.object({
  token: linkToken,
  email: Email,
  password: z.string().min(1, 'Enter your password.').max(128),
  accessCode,
});
export const OpenLink = z.object({ token: linkToken, accessCode });
