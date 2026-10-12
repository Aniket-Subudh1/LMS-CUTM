import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { requestPasswordReset } from '../actions';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm">
          Enter your university email. We will send you a link to choose a new password.
        </p>
      </div>
      <ActionForm
        action={requestPasswordReset}
        submitLabel="Send link"
        successMessage="If that email is registered, a link has been sent."
        fullWidth
      >
        <Field name="email" label="Email">
          <Input name="email" type="email" autoComplete="username" placeholder="name@cutm.ac.in" required />
        </Field>
      </ActionForm>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
