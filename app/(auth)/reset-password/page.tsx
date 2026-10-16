import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { CheckCircleIcon, CircleIcon, LinkBreakIcon } from '@phosphor-icons/react/ssr';
import { ActionForm, Field } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/password-input';
import { Skeleton } from '@/components/ui/skeleton';
import { isTokenCurrent, readToken } from '@/lib/auth/tokens';
import { resetPassword } from '../actions';

export const metadata: Metadata = { title: 'Set password' };

export default function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <ResetForm searchParams={searchParams} />
    </Suspense>
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-8" aria-busy="true" aria-label="Loading">
      <div className="grid justify-items-center gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="grid gap-5">
        <Skeleton className="h-12 rounded-full" />
        <Skeleton className="h-12 rounded-full" />
        <Skeleton className="h-12 rounded-full" />
      </div>
    </div>
  );
}

async function ResetForm({ searchParams }: { searchParams: PageProps<'/reset-password'>['searchParams'] }) {
  const { token } = await searchParams;
  // Unsealing checks the token's expiry against the clock, so it must run at request time.
  await connection();
  const data = typeof token === 'string' ? await readToken(token, ['reset', 'invite']) : null;
  if (!data || !(await isTokenCurrent(data))) {
    return (
      <div className="grid gap-8">
        <div className="grid justify-items-center gap-3 text-center">
          <span className="bg-warning/12 text-warning grid size-12 place-items-center rounded-full">
            <LinkBreakIcon weight="duotone" className="size-6" />
          </span>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">Link not valid</h1>
          <p className="text-muted-foreground text-sm">This link has expired or was already used.</p>
        </div>
        <Button asChild className="h-12 rounded-full text-[0.9375rem]">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }
  const invite = data.purpose === 'invite';
  return (
    <div className="grid gap-8">
      <div className="grid gap-2 text-center">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight">
          {invite ? 'Set up your account' : 'Choose a new password'}
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          {invite
            ? 'Welcome to the CUTM LMS. Choose a password to activate your account; you will be signed in once it is saved.'
            : 'You will be signed in once it is saved.'}
        </p>
      </div>
      <ActionForm action={resetPassword} submitLabel="Save password" fullWidth>
        <input type="hidden" name="token" value={token} />
        <div className="group/rules grid gap-2.5">
          <Field name="password" label="New password">
            <PasswordInput
              name="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              className="bg-card h-12 rounded-full border-transparent pl-5"
            />
          </Field>
          <ul className="grid gap-1 px-5 text-xs" aria-label="Password rules">
            <li className="text-muted-foreground group-has-[[name=password]:valid]/rules:text-success flex items-center gap-1.5 transition-colors">
              <CircleIcon className="size-3.5 group-has-[[name=password]:valid]/rules:hidden" />
              <CheckCircleIcon
                weight="fill"
                className="hidden size-3.5 group-has-[[name=password]:valid]/rules:block"
              />
              10 to 128 characters
            </li>
            <li className="text-muted-foreground flex items-center gap-1.5">
              <CircleIcon className="size-3.5" />
              Not your email address
            </li>
          </ul>
        </div>
        <Field name="confirm" label="Repeat the password">
          <PasswordInput
            name="confirm"
            autoComplete="new-password"
            required
            className="bg-card h-12 rounded-full border-transparent pl-5"
          />
        </Field>
      </ActionForm>
    </div>
  );
}
