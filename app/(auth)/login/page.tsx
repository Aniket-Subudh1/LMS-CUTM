import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field } from '@/components/action-form';
import { login } from '../actions';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <section className="card">
      <h1>Sign in</h1>
      <ActionForm action={login} submitLabel="Sign in">
        <Field name="email" label="Email">
          <input name="email" type="email" autoComplete="username" required className="input" />
        </Field>
        <Field name="password" label="Password">
          <input name="password" type="password" autoComplete="current-password" required className="input" />
        </Field>
      </ActionForm>
      <Link href="/forgot-password">Forgot your password?</Link>
    </section>
  );
}
