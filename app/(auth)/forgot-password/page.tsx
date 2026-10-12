import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon, EnvelopeSimpleIcon, KeyIcon } from '@phosphor-icons/react/ssr';
import { ActionForm, Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { requestPasswordReset } from '../actions';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-7">
      <div className="grid gap-3">
        <span className="icon-chip size-11 [&_svg]:size-6">
          <KeyIcon weight="duotone" />
        </span>
        <div className="grid gap-1.5">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">Forgot your password?</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Enter your university email. We will send you a link to choose a new password.
          </p>
        </div>
      </div>
      <ActionForm
        action={requestPasswordReset}
        submitLabel="Send link"
        successMessage="This email is registered. A reset link has been sent."
        replaceOnSuccess
        fullWidth
      >
        <Field name="email" label="Email">
          <span className="relative block">
            <EnvelopeSimpleIcon
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@cutm.ac.in"
              required
              className="h-10 pl-9"
            />
          </span>
        </Field>
      </ActionForm>
      <p className="border-t pt-5 text-sm">
        <Link
          href="/login"
          className="text-primary inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeftIcon className="size-4" /> Back to sign in
        </Link>
      </p>
    </div>
  );
}
