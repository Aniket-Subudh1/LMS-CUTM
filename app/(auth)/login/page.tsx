import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field } from '@/components/action-form';
import { PageIcon } from '@/components/page-icon';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { login } from '../actions';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="grid gap-8">
      <div className="grid justify-items-center gap-4 text-center">
        <PageIcon name="signin" className="size-16" />
        <div className="grid gap-2">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">Sign in to your account</h1>
          <p className="text-muted-foreground text-sm">Use your university email address.</p>
        </div>
      </div>
      <ActionForm action={login} submitLabel="Sign in" fullWidth>
        <Field name="email" label="Email">
          <Input
            name="email"
            type="email"
            autoComplete="username"
            placeholder="name@cutm.ac.in"
            required
            className="bg-card h-10 rounded-md pl-3"
          />
        </Field>
        <Field name="password" label="Password">
          <PasswordInput
            name="password"
            autoComplete="current-password"
            required
            className="bg-card h-10 rounded-md pl-3"
          />
        </Field>
      </ActionForm>
      <div className="grid gap-4 text-center text-sm">
        <p className="text-muted-foreground">
          Forgot your password?{' '}
          <Link href="/forgot-password" className="text-foreground font-medium underline underline-offset-4">
            Reset it
          </Link>
        </p>
        <p className="text-muted-foreground ring-foreground/10 rounded-lg px-4 py-3 text-xs leading-relaxed ring-1">
          New here? Accounts are created by the university. Look for the “Your CUTM LMS account” email to set up yours.
        </p>
      </div>
    </div>
  );
}
