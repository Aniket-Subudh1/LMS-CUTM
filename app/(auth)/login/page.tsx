import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { login } from '../actions';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your account</h1>
        <p className="text-muted-foreground text-sm">Use your university email address.</p>
      </div>
      <ActionForm action={login} submitLabel="Sign in" fullWidth>
        <Field name="email" label="Email">
          <Input name="email" type="email" autoComplete="username" placeholder="name@cutm.ac.in" required />
        </Field>
        <Field name="password" label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
      </ActionForm>
      <p className="text-muted-foreground text-center text-sm">
        Forgot your password?{' '}
        <Link href="/forgot-password" className="text-primary font-medium underline-offset-4 hover:underline">
          Reset it
        </Link>
      </p>
    </div>
  );
}
