'use server';

import { redirect } from 'next/navigation';
import mongoose from 'mongoose';
import { action, publicAction } from '@/lib/action';
import { codeHash, codeMatches, newCode, OTP_TRIES, OTP_TTL_MS, sameSecret } from '@/lib/auth/otp';
import { signIn, signOut } from '@/lib/auth/session';
import { passwordSignIn } from '@/lib/auth/sign-in';
import { linkUrl } from '@/lib/data/test-links';
import { db } from '@/lib/db';
import { windowState } from '@/lib/domain/attempts';
import { guestCodeEmail } from '@/lib/domain/email-templates';
import { assessmentPath, emailAllowed, linkState, type LinkState } from '@/lib/domain/test-links';
import { AppError } from '@/lib/errors';
import { Assessment } from '@/lib/models/assessment';
import { Otp } from '@/lib/models/otp';
import { TestGrant } from '@/lib/models/test-grant';
import { TestLink } from '@/lib/models/test-link';
import { User } from '@/lib/models/user';
import { mailQueue } from '@/lib/queue';
import { clientIp, limit } from '@/lib/rate-limit';
import { ROLES } from '@/lib/schemas/common';
import { linkToken, OpenLink, RegisterGuest, ReturnAsGuest, SignInToTest, VerifyGuestCode } from '@/lib/schemas/tests';

const MINUTE = 60_000;

const NOT_OPEN: Record<Exclude<LinkState, 'open'>, string> = {
  off: 'This link has been turned off. Ask whoever sent it for a new one.',
  expired: 'This link has expired. Ask whoever sent it for a new one.',
  full: 'This link has been used as many times as it allows. Ask whoever sent it for a new one.',
};

const onlyCandidate = (user: { roles: string[] }) => user.roles.every((role) => role === 'candidate');

async function findLink(token: string) {
  await db();
  const link = await TestLink.findOne({ token }).lean();
  if (!link) throw new AppError('NOT_FOUND', 'This link is not valid.');
  return link;
}
type LinkRead = Awaited<ReturnType<typeof findLink>>;

// Someone a link already let into a standalone test goes straight to it, whatever the link's state now: the grant,
// not the link, is their access, and how they come back for their results.
async function alreadyIn(link: LinkRead, userId: string): Promise<string | null> {
  const granted = await TestGrant.exists({ assessmentId: link.assessmentId, userId });
  return granted ? assessmentPath(null, String(link.assessmentId)) : null;
}

// TP-01: what a link checks before letting anyone new in — the test is published and not over, and the link is on,
// in date and under its limit. The access code and email domains are checked where they are typed in.
async function usableLink(link: LinkRead) {
  const test = await Assessment.findById(link.assessmentId, {
    offeringId: 1,
    status: 1,
    title: 1,
    opensAt: 1,
    closesAt: 1,
    lateUntil: 1,
  }).lean();
  if (!test || test.status === 'draft') throw new AppError('CLOSED', 'This test is not open to anyone yet.');
  const now = new Date();
  const window = { now, opensAt: test.opensAt, closesAt: test.closesAt, lateUntil: test.lateUntil ?? null };
  if (test.status === 'results_published' || windowState(window) === 'closed') {
    throw new AppError('CLOSED', 'This test has closed.');
  }
  const state = linkState({ ...link, expiresAt: link.expiresAt ?? null, maxUses: link.maxUses ?? null }, now);
  if (state !== 'open') throw new AppError('CLOSED', NOT_OPEN[state]);
  return { link, test };
}
type Usable = Awaited<ReturnType<typeof usableLink>>;

function requireCode(link: LinkRead, accessCode: string | undefined) {
  if (link.accessCode && !(accessCode && sameSecret(link.accessCode, accessCode))) {
    throw new AppError('VALIDATION', 'The access code is not right.', {
      accessCode: ['Check the code you were given.'],
    });
  }
}

function requireDomain(link: LinkRead, email: string) {
  if (!emailAllowed(email, link.allowedDomains)) {
    throw new AppError('FORBIDDEN', `This link is for addresses at ${link.allowedDomains.join(', ')}.`);
  }
}

// Lets the signed-in person in and sends them to the test. A standalone test records a grant once (counting one use
// of the link, under its limit, in one transaction); a course's assessment needs none, as enrolment decides.
async function enter({ link, test }: Usable, userId: string): Promise<never> {
  if (!test.offeringId) {
    await mongoose.connection.transaction(async (session) => {
      if (await TestGrant.exists({ assessmentId: test._id, userId }).session(session)) return;
      const claimed = await TestLink.updateOne(
        { _id: link._id, $or: [{ maxUses: null }, { $expr: { $lt: ['$uses', '$maxUses'] } }] },
        { $inc: { uses: 1 } },
        { session },
      );
      if (claimed.modifiedCount === 0) throw new AppError('CLOSED', NOT_OPEN.full);
      await TestGrant.create([{ assessmentId: test._id, userId, linkId: link._id, grantedAt: new Date() }], {
        session,
      });
    });
  }
  redirect(assessmentPath(test.offeringId ? String(test.offeringId) : null, String(test._id)));
}

// TP-03: a 6-digit code to `email`, kept only as its hash, for 10 minutes and 5 tries; the page then asks for it.
async function sendCode(link: LinkRead, test: string, email: string, name: string): Promise<never> {
  const code = newCode();
  const otp = await Otp.findOneAndUpdate(
    { email, linkId: link._id },
    {
      $set: {
        codeHash: codeHash(email, String(link._id), code),
        name,
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    },
    { upsert: true, returnDocument: 'after', projection: { _id: 1 } },
  ).lean();
  if (!otp) throw new AppError('INTERNAL', 'The code could not be saved. Try again.');
  const page = `/t/${link.token}?otp=${String(otp._id)}`;
  await mailQueue().add(
    'send',
    guestCodeEmail({ to: email, name, code, test, link: `${linkUrl(link.token)}?otp=${String(otp._id)}` }),
    {
      jobId: `mail-otp-${String(otp._id)}-${Date.now()}`,
    },
  );
  redirect(page);
}

// TP-01: someone already signed in continues to the test.
export const openLink = action({ input: OpenLink, roles: ROLES }, async ({ token, accessCode }, viewer) => {
  const link = await findLink(token);
  const back = await alreadyIn(link, viewer.id);
  if (back) redirect(back);
  const usable = await usableLink(link);
  requireCode(link, accessCode);
  requireDomain(link, viewer.email);
  return enter(usable, viewer.id);
});

// TP-01: an LMS user signs in with their password on the link's page and goes straight on.
export const signInToTest = publicAction(SignInToTest, async ({ token, email, password, accessCode }) => {
  const link = await findLink(token);
  const known = await User.findOne({ email }, { _id: 1 }).lean();
  const back = known ? await alreadyIn(link, String(known._id)) : null;
  if (back) {
    await passwordSignIn(email, password);
    redirect(back);
  }
  const usable = await usableLink(link);
  requireCode(link, accessCode);
  requireDomain(link, email);
  await passwordSignIn(email, password);
  if (!known) throw new AppError('UNAUTHENTICATED', 'Please sign in again.');
  return enter(usable, String(known._id));
});

// TP-03: a guest gives a name and email, and a code goes to that email. An LMS account's email signs in with its
// password instead, so a guest link is never a way into a staff or student account.
export const registerGuest = publicAction(RegisterGuest, async ({ token, name, email, accessCode }) => {
  await limit('guest-ip', await clientIp(), 20, 15 * MINUTE);
  await limit('guest-email', email, 5, 15 * MINUTE);
  const link = await findLink(token);
  if (link.audience !== 'guests') throw new AppError('FORBIDDEN', 'This link is for LMS users. Sign in instead.');
  const existing = await User.findOne({ email }, { roles: 1, status: 1, name: 1 }).lean();
  if (existing && !onlyCandidate(existing)) {
    throw new AppError('CONFLICT', 'This email has an LMS account. Sign in with your password below instead.', {
      email: ['This email has an LMS account.'],
    });
  }
  if (existing?.status === 'disabled') throw new AppError('FORBIDDEN', 'This account has been turned off.');
  if (existing && (await alreadyIn(link, String(existing._id)))) {
    const test = await Assessment.findById(link.assessmentId, { title: 1 }).lean();
    return sendCode(link, test?.title ?? 'your test', email, existing.name);
  }
  const { test } = await usableLink(link);
  requireCode(link, accessCode);
  requireDomain(link, email);
  return sendCode(link, test.title, email, name);
});

// TP-03: someone who joined through this link before asks for a code to sign in again (to finish, or to read their
// results once the link or the test has closed).
export const returnAsGuest = publicAction(ReturnAsGuest, async ({ token, email }) => {
  await limit('guest-ip', await clientIp(), 20, 15 * MINUTE);
  await limit('guest-email', email, 5, 15 * MINUTE);
  const link = await findLink(token);
  const user = await User.findOne({ email, status: 'active' }, { roles: 1, name: 1 }).lean();
  if (!user || !onlyCandidate(user) || !(await alreadyIn(link, String(user._id)))) {
    throw new AppError('NOT_FOUND', 'No one has joined this test through this link with that email.', {
      email: ['Use the email you registered with.'],
    });
  }
  const test = await Assessment.findById(link.assessmentId, { title: 1 }).lean();
  return sendCode(link, test?.title ?? 'your test', email, user.name);
});

// TP-03: the code confirms the email. The guest's candidate account is made (or found) and signed in; someone new is
// let in, someone returning goes straight back to the test.
export const verifyGuestCode = publicAction(VerifyGuestCode, async ({ token, otpId, code }) => {
  await limit('guest-verify-ip', await clientIp(), 30, 15 * MINUTE);
  const link = await findLink(token);
  // Each try is counted before the check, so parallel guesses share the five.
  const otp = await Otp.findOneAndUpdate(
    { _id: otpId, linkId: link._id, expiresAt: { $gt: new Date() }, attempts: { $lt: OTP_TRIES } },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!otp) throw new AppError('CLOSED', 'This code has expired or had too many tries. Ask for a new one.');
  if (!codeMatches(otp.codeHash, otp.email, String(link._id), code)) {
    const left = OTP_TRIES - otp.attempts;
    throw new AppError('VALIDATION', 'That code is not right.', {
      code: [left > 0 ? `${left} ${left === 1 ? 'try' : 'tries'} left.` : 'No tries left. Ask for a new code.'],
    });
  }
  await Otp.deleteOne({ _id: otp._id });
  const existing = await User.findOne({ email: otp.email }, { roles: 1, status: 1, sessionVersion: 1 }).lean();
  if (existing && (!onlyCandidate(existing) || existing.status !== 'active')) {
    throw new AppError('FORBIDDEN', 'This email cannot sign in with a code. Sign in with your password instead.');
  }
  const back = existing ? await alreadyIn(link, String(existing._id)) : null;
  // The access code and domains were checked when the code was sent; whether the link still lets people in is not.
  const usable = back ? null : await usableLink(link);
  const user =
    existing ??
    (await User.findOneAndUpdate(
      { email: otp.email },
      { $setOnInsert: { name: otp.name, email: otp.email, roles: ['candidate'], status: 'active' } },
      { upsert: true, returnDocument: 'after', projection: { roles: 1, status: 1, sessionVersion: 1 } },
    ).lean());
  if (!user) throw new AppError('INTERNAL', 'The account could not be made. Try again.');
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await signIn({ id: String(user._id), sessionVersion: user.sessionVersion });
  return usable ? enter(usable, String(user._id)) : redirect(back ?? '/tests');
});

// "Not you?": signs out and comes back to the same link.
export async function leaveLink(form: FormData): Promise<void> {
  const token = linkToken.safeParse(form.get('token'));
  await signOut();
  redirect(token.success ? `/t/${token.data}` : '/login');
}
