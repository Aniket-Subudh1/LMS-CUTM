import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { EnvelopeSimpleIcon, LockKeyIcon, WarningCircleIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import { leaveLink, openLink, registerGuest, returnAsGuest, signInToTest, verifyGuestCode } from './actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { PageIcon } from '@/components/page-icon';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { getLinkLanding, type LandingState, type LinkLanding } from '@/lib/data/test-links';
import { formatDateTime, formatDuration, MODE_LABEL } from '@/lib/format';
import { linkToken } from '@/lib/schemas/tests';

export const metadata: Metadata = { title: 'Test' };

const Search = z.object({ otp: z.string().max(40).optional().catch(undefined) });

const CLOSED: Record<Exclude<LandingState, 'open'>, string> = {
  draft: 'This test is not open to anyone yet. Try the link again later.',
  closed: 'This test has closed.',
  off: 'This link has been turned off. Ask whoever sent it for a new one.',
  expired: 'This link has expired. Ask whoever sent it for a new one.',
  full: 'This link has been used as many times as it allows. Ask whoever sent it for a new one.',
};

const INPUT = 'bg-card h-10 rounded-md pl-3';

export default function TestLinkPage({ params, searchParams }: PageProps<'/t/[token]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-center text-sm">Opening the test…</p>}>
      <Landing params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// TP-01, TP-03 (M04b decision 5, "landing like sign-in"): the test's facts, then whatever this visitor needs — sign
// in, register and confirm an email code, or continue as who they already are. Someone a link already let in comes
// back through it even after it (or the test) has closed, to finish or to read their results.
async function Landing({
  params,
  searchParams,
}: {
  params: PageProps<'/t/[token]'>['params'];
  searchParams: PageProps<'/t/[token]'>['searchParams'];
}) {
  const { token } = await params;
  // The link's state depends on the clock (open, closed, expired), so it is read at request time.
  await connection();
  if (!linkToken.safeParse(token).success) notFound();
  const { otp } = Search.parse(await searchParams);
  const landing = await getLinkLanding(token, otp);
  const { test } = landing;
  return (
    <div className="grid gap-7">
      <div className="grid gap-3">
        <span className="bg-primary/8 text-primary inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium">
          {landing.audience === 'guests' ? (
            <PageIcon name="guests" className="size-3.5" />
          ) : (
            <PageIcon name="users" className="size-3.5" />
          )}
          {landing.audience === 'guests' ? 'Open to registered guests' : 'For CUTM LMS users'} · {MODE_LABEL[test.mode]}
        </span>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">{test.title}</h1>
        <p className="text-muted-foreground text-sm">{test.by}</p>
        <dl className="grid grid-cols-3 gap-2">
          {[
            ['Opens', formatDateTime(test.opensAt)],
            ['Time limit', test.durationMin ? formatDuration(test.durationMin * 60) : 'None'],
            ['Questions', `${test.questions} · ${test.maxMarks} marks`],
          ].map(([label, value]) => (
            <div key={label} className="bg-card ring-border/70 grid content-start gap-0.5 rounded-md p-2.5 ring-1">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-[0.8125rem] leading-snug font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {landing.viewer ? (
        <div className="grid gap-4">
          {landing.entered ? (
            <Button asChild size="lg" className="h-10 w-full">
              <Link href={landing.entered}>Open the test</Link>
            </Button>
          ) : landing.state === 'open' ? (
            <ActionForm action={openLink} submitLabel="Continue to the test" fullWidth>
              <Hidden landing={landing} askCode />
            </ActionForm>
          ) : (
            <Closed state={landing.state} />
          )}
          <NotYou token={landing.token} viewer={landing.viewer} />
        </div>
      ) : landing.pending ? (
        <ConfirmCode landing={landing} pending={landing.pending} />
      ) : landing.state !== 'open' ? (
        <>
          <Closed state={landing.state} />
          {landing.audience === 'guests' ? (
            <ActionForm action={returnAsGuest} submitLabel="Email me a sign-in code" fullWidth>
              <p className="text-muted-foreground text-sm">Took this test already? Sign in to see it.</p>
              <Hidden landing={landing} askCode={false} />
              <Field name="email" label="Email you registered with">
                <Input name="email" type="email" autoComplete="email" required className={INPUT} />
              </Field>
            </ActionForm>
          ) : (
            <SignIn landing={landing} askCode={false} />
          )}
        </>
      ) : landing.audience === 'guests' ? (
        <>
          <Register landing={landing} />
          <details className="ring-foreground/10 rounded-lg px-4 py-3 text-sm ring-1 [&[open]>summary]:mb-5">
            <summary className="text-muted-foreground cursor-pointer font-medium">
              Have a CUTM LMS account? Sign in with your password
            </summary>
            <SignIn landing={landing} askCode />
          </details>
        </>
      ) : (
        <SignIn landing={landing} askCode />
      )}
    </div>
  );
}

function Closed({ state }: { state: Exclude<LandingState, 'open'> }) {
  return (
    <p className="bg-muted text-foreground flex gap-2.5 rounded-md px-4 py-3 text-sm">
      <WarningCircleIcon className="text-warning mt-0.5 size-4 shrink-0" weight="fill" />
      {CLOSED[state]}
    </p>
  );
}

// The token, and the access code when someone new joins (a person already let in is not asked again).
function Hidden({ landing, askCode }: { landing: LinkLanding; askCode: boolean }) {
  return (
    <>
      <input type="hidden" name="token" value={landing.token} />
      {askCode && landing.needsCode && (
        <Field name="accessCode" label="Access code" hint="The code you were given with this link.">
          <Input name="accessCode" required autoComplete="off" maxLength={40} className={INPUT} />
        </Field>
      )}
    </>
  );
}

const domainHint = (landing: LinkLanding) =>
  landing.domains.length > 0 ? `Use an address at ${landing.domains.join(' or ')}.` : undefined;

function NotYou({ token, viewer }: { token: string; viewer: { name: string; email: string } }) {
  return (
    <form action={leaveLink} className="text-muted-foreground text-center text-sm">
      <input type="hidden" name="token" value={token} />
      Signed in as <b className="text-foreground font-semibold">{viewer.name}</b> ({viewer.email}). Not you?{' '}
      <button type="submit" className="text-foreground font-medium underline underline-offset-4">
        Sign out
      </button>
    </form>
  );
}

function SignIn({ landing, askCode }: { landing: LinkLanding; askCode: boolean }) {
  return (
    <ActionForm action={signInToTest} submitLabel="Sign in and continue" fullWidth>
      <Hidden landing={landing} askCode={askCode} />
      <Field name="email" label="Email" hint={domainHint(landing)}>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="name@cutm.ac.in"
          required
          className={INPUT}
        />
      </Field>
      <Field name="password" label="Password">
        <PasswordInput name="password" autoComplete="current-password" required className={INPUT} />
      </Field>
    </ActionForm>
  );
}

function Register({ landing }: { landing: LinkLanding }) {
  return (
    <ActionForm action={registerGuest} submitLabel="Email me a code" fullWidth>
      <Hidden landing={landing} askCode />
      <Field name="name" label="Full name">
        <Input name="name" autoComplete="name" required minLength={2} maxLength={120} className={INPUT} />
      </Field>
      <Field
        name="email"
        label="Email"
        hint={`${domainHint(landing) ?? ''} We send a 6-digit code to confirm it. Registered before? Use the same email.`.trim()}
      >
        <Input name="email" type="email" autoComplete="email" required className={INPUT} />
      </Field>
      <div className="grid gap-2">
        <label className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed">
          <input type="checkbox" name="consent" value="true" required className="accent-foreground mt-1 size-4" />
          The university keeps my name, email and answers as the record of this test.
        </label>
        <FieldErrors name="consent" />
      </div>
    </ActionForm>
  );
}

function ConfirmCode({ landing, pending }: { landing: LinkLanding; pending: { otpId: string; email: string } }) {
  return (
    <div className="grid gap-4">
      <p className="flex gap-3 text-sm leading-relaxed">
        <span className="icon-chip size-9 shrink-0">
          <EnvelopeSimpleIcon className="size-4.5" />
        </span>
        <span>
          We sent a 6-digit code to <b className="font-semibold">{pending.email}</b>. It works for 10 minutes.
        </span>
      </p>
      <ActionForm action={verifyGuestCode} submitLabel="Confirm and continue" submitIcon={<LockKeyIcon />} fullWidth>
        <input type="hidden" name="token" value={landing.token} />
        <input type="hidden" name="otpId" value={pending.otpId} />
        <Field name="code" label="Code">
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            className={`${INPUT} text-center text-lg font-semibold tracking-[0.5em]`}
          />
        </Field>
      </ActionForm>
      <p className="text-muted-foreground text-center text-sm">
        No email? Check spam, or{' '}
        <Link href={`/t/${landing.token}`} className="text-foreground font-medium underline underline-offset-4">
          send a new code
        </Link>
        .
      </p>
    </div>
  );
}
