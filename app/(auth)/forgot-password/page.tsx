import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field } from '@/components/action-form';
import { requestPasswordReset } from '../actions';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <section className="card">
      <h1>Forgot your password?</h1>
      <p>Enter your university email. We will send you a link to choose a new password.</p>
      <ActionForm
        action={requestPasswordReset}
        submitLabel="Send link"
        successMessage="If that email is registered, a link has been sent."
      >
        <Field name="email" label="Email">
          <input name="email" type="email" autoComplete="username" required className="input" />
        </Field>
      </ActionForm>
      <Link href="/login">Back to sign in</Link>
    </section>
  );
}
