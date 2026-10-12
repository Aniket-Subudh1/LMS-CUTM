import type { Metadata } from 'next';
import { ActionForm, Field } from '@/components/action-form';
import { requireViewer } from '@/lib/auth/session';
import { changePassword, signOutEverywhere } from './actions';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  return (
    <>
      <header className="page-header">
        <h1>Profile</h1>
        <p className="text-muted">
          {viewer.name} · {viewer.email}
        </p>
      </header>
      <div className="flex max-w-xl flex-col gap-6">
        <section className="card">
          <h2>Change password</h2>
          <ActionForm
            action={changePassword}
            submitLabel="Change password"
            successMessage="Your password has been changed."
          >
            <Field name="current" label="Current password">
              <input name="current" type="password" autoComplete="current-password" required className="input" />
            </Field>
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
            <Field name="confirm" label="Repeat the new password">
              <input name="confirm" type="password" autoComplete="new-password" required className="input" />
            </Field>
          </ActionForm>
        </section>
        <section className="card">
          <h2>Sign out everywhere</h2>
          <ActionForm action={signOutEverywhere} submitLabel="Sign out everywhere">
            <p>Signs you out on every device and browser, including this one.</p>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
