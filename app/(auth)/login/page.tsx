import type { Metadata } from 'next';
import Link from 'next/link';
import { EnvelopeSimpleIcon, LockKeyIcon, SignInIcon } from '@phosphor-icons/react/ssr';
import { ActionForm, Field } from '@/components/action-form';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { login } from '../actions';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="grid gap-7">
      <div className="grid gap-3">
        <span className="icon-chip size-11 [&_svg]:size-6">
          <SignInIcon weight="duotone" />
        </span>
        <div className="grid gap-1.5">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">Sign in to your account</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">Use your university email address.</p>
        </div>
      </div>
      <ActionForm action={login} submitLabel="Sign in" fullWidth>
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
        <Field name="password" label="Password">
          <span className="relative block">
            <LockKeyIcon
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2"
            />
            <PasswordInput name="password" autoComplete="current-password" required className="h-10 pl-9" />
          </span>
        </Field>
      </ActionForm>
      <div className="grid gap-3 border-t pt-5 text-sm">
        <p className="text-muted-foreground">
          Forgot your password?{' '}
          <Link href="/forgot-password" className="text-primary font-medium underline-offset-4 hover:underline">
            Reset it
          </Link>
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          New here? Accounts are created by the university. Look for the “Your CUTM LMS account” email to set up yours.
        </p>
      </div>
    </div>
  );
}
