import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { ActionForm, Field } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isTokenCurrent, readToken } from '@/lib/auth/tokens';
import { resetPassword } from '../actions';

export const metadata: Metadata = { title: 'Set password' };

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams;
  // Unsealing checks the token's expiry against the clock, so it must run at request time.
  await connection();
  const data = typeof token === 'string' ? await readToken(token, ['reset', 'invite']) : null;
  if (!data || !(await isTokenCurrent(data))) {
    return (
      <div className="grid gap-6 text-center">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Link not valid</h1>
          <p className="text-muted-foreground text-sm">This link has expired or was already used.</p>
        </div>
        <Button asChild>
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {data.purpose === 'invite' ? 'Set your password' : 'Choose a new password'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {data.purpose === 'invite'
            ? 'Welcome to the CUTM LMS. Choose a password to activate your account.'
            : 'You will be signed in once it is saved.'}
        </p>
      </div>
      <ActionForm action={resetPassword} submitLabel="Save password" fullWidth>
        <input type="hidden" name="token" value={token} />
        <Field name="password" label="New password" hint="10 to 128 characters. Not your email address.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
        </Field>
        <Field name="confirm" label="Repeat the password">
          <Input name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      </ActionForm>
    </div>
  );
}
