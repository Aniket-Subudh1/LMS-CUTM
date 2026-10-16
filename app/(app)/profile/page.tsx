import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DevicesIcon, KeyIcon, LockKeyIcon, ShieldCheckIcon, UserCircleIcon } from '@phosphor-icons/react/ssr';
import Loading from '../loading';
import { changePassword, signOutEverywhere } from './actions';
import { ActionForm, Field } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PasswordInput } from '@/components/password-input';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireViewer } from '@/lib/auth/session';
import { initials, ROLE_LABEL } from '@/lib/format';

export const metadata: Metadata = { title: 'Profile' };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const viewer = await requireViewer();
  return (
    <>
      <PageHeader
        icon={<UserCircleIcon weight="duotone" />}
        title="Profile"
        description="Name and email are set by the university."
      />
      <div className="grid gap-8">
        <section className="surface relative overflow-hidden">
          <div aria-hidden="true" className="brand-aurora h-20 sm:h-24" />
          <div className="flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-6">
            <p
              aria-hidden="true"
              className="bg-card text-primary ring-border -mt-10 grid size-20 shrink-0 place-items-center rounded-2xl text-2xl font-semibold ring-1"
            >
              {initials(viewer.name)}
            </p>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">{viewer.name}</h2>
              <p className="text-muted-foreground text-sm break-all">{viewer.email}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {viewer.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABEL[role]}
                </Badge>
              ))}
            </div>
          </div>
        </section>

        <Section
          icon={<ShieldCheckIcon weight="duotone" />}
          title="Security"
          description="Keep your account yours. Both actions are recorded in the audit log."
        >
          <ul className="grid gap-4 md:grid-cols-2">
            <li className="surface flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <span className="icon-chip size-10 [&_svg]:size-5">
                  <KeyIcon weight="duotone" />
                </span>
                <div>
                  <h3 className="font-medium">Password</h3>
                  <p className="text-muted-foreground text-sm">Changing it signs you out on every other device.</p>
                </div>
              </div>
              <FormDialog
                trigger={
                  <Button variant="outline" size="sm" className="mt-auto self-start">
                    <LockKeyIcon weight="duotone" /> Change password
                  </Button>
                }
                icon={<KeyIcon weight="duotone" />}
                title="Change password"
                description="You stay signed in on this browser."
                openParam="password"
                action={changePassword}
                submitLabel="Change password"
                successMessage="Your password has been changed."
              >
                <Field name="current" label="Current password">
                  <PasswordInput name="current" autoComplete="current-password" required />
                </Field>
                <Field name="password" label="New password" hint="10 to 128 characters. Not your email address.">
                  <PasswordInput name="password" autoComplete="new-password" required minLength={10} maxLength={128} />
                </Field>
                <Field name="confirm" label="Repeat the new password">
                  <PasswordInput name="confirm" autoComplete="new-password" required />
                </Field>
              </FormDialog>
            </li>
            <li className="surface flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <span className="icon-chip size-10 [&_svg]:size-5">
                  <DevicesIcon weight="duotone" />
                </span>
                <div>
                  <h3 className="font-medium">Other devices</h3>
                  <p className="text-muted-foreground text-sm">Ends every sign-in, including this browser.</p>
                </div>
              </div>
              <div className="mt-auto">
                <ActionForm
                  action={signOutEverywhere}
                  submitLabel="Sign out everywhere"
                  submitVariant="destructive"
                  submitSize="sm"
                  confirm={{
                    title: 'Sign out everywhere?',
                    message: 'You will need to sign in again on every device, including this one.',
                  }}
                />
              </div>
            </li>
          </ul>
        </Section>
      </div>
    </>
  );
}
