import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { ActionForm, Field } from '@/components/action-form';
import { readToken } from '@/lib/auth/tokens';
import { resetPassword } from '../actions';

export const metadata: Metadata = { title: 'Set password' };

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams;
  // Unsealing checks the token's expiry against the clock, so it must run at request time.
  await connection();
  const data = typeof token === 'string' ? await readToken(token, ['reset', 'invite']) : null;
  if (!data) {
    return (
      <section className="card">
        <h1>Link not valid</h1>
        <p>This link has expired or was already used.</p>
        <Link href="/forgot-password">Request a new link</Link>
      </section>
    );
  }
  return (
    <section className="card">
      <h1>{data.purpose === 'invite' ? 'Set your password' : 'Choose a new password'}</h1>
      <ActionForm action={resetPassword} submitLabel="Save password">
        <input type="hidden" name="token" value={token} />
        <Field name="password" label="New password" hint="10 to 128 characters.">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            className="input"
          />
        </Field>
        <Field name="confirm" label="Repeat the password">
          <input name="confirm" type="password" autoComplete="new-password" required className="input" />
        </Field>
      </ActionForm>
    </section>
  );
}
