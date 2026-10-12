import type { Metadata } from 'next';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireViewer } from '@/lib/auth/session';
import { ROLE_LABEL } from '@/lib/format';
import { changePassword, signOutEverywhere } from './actions';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  return (
    <>
      <PageHeader title="Profile" description="Your account details and sign-in security." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Managed by the university. Ask the LMS administrator to change these details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm">
              <div className="grid gap-1">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{viewer.name}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium break-all">{viewer.email}</dd>
              </div>
              <div className="grid gap-1.5">
                <dt className="text-muted-foreground">Roles</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {viewer.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {ROLE_LABEL[role]}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Changing your password signs you out on every other device.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={changePassword}
                submitLabel="Change password"
                successMessage="Your password has been changed."
              >
                <Field name="current" label="Current password">
                  <Input name="current" type="password" autoComplete="current-password" required />
                </Field>
                <Field name="password" label="New password" hint="10 to 128 characters. Not your email address.">
                  <Input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={128}
                  />
                </Field>
                <Field name="confirm" label="Repeat the new password">
                  <Input name="confirm" type="password" autoComplete="new-password" required />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>Sign out everywhere</CardTitle>
              <CardDescription>
                Use this if you signed in on a shared computer or lost a device. You will be signed out here too.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={signOutEverywhere} submitLabel="Sign out everywhere" submitVariant="destructive" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
