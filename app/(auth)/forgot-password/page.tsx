import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon } from '@phosphor-icons/react/ssr';
import { ActionForm, Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { requestPasswordReset } from '../actions';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-8">
      <div className="grid gap-2 text-center">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Enter your university email. We will send you a link to choose a new password.
        </p>
      </div>
      <ActionForm
        action={requestPasswordReset}
        submitLabel="Send link"
        successMessage="This email is registered. A reset link has been sent."
        replaceOnSuccess
        fullWidth
      >
        <Field name="email" label="Email">
          <Input
            name="email"
            type="email"
            autoComplete="username"
            placeholder="name@cutm.ac.in"
            required
            className="bg-card h-12 rounded-full border-transparent pl-5"
          />
        </Field>
      </ActionForm>
      <p className="text-center text-sm">
        <Link href="/login" className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline">
          <ArrowLeftIcon className="size-4" /> Back to sign in
        </Link>
      </p>
    </div>
  );
}
