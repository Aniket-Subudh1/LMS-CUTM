import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { PencilSimpleIcon, ProhibitIcon, SignOutIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { revokeUserSessions, sendResetLink, setUserStatus, updateUserRoles } from '../actions';
import { ActionForm, FieldErrors } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireViewer } from '@/lib/auth/session';
import { getUserDetail, type UserDetail } from '@/lib/data/users';
import { formatDateTime, ROLE_LABEL, statusTone } from '@/lib/format';
import { ROLES } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'User' };

export default function UserPage({ params }: PageProps<'/admin/users/[id]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <User params={params} />
    </Suspense>
  );
}

async function User({ params }: { params: PageProps<'/admin/users/[id]'>['params'] }) {
  const viewer = await requireViewer(['admin', 'support']);
  const user = await getUserDetail((await params).id);
  const isAdmin = viewer.roles.includes('admin');
  const facts: [string, string | null][] = [
    ['Email', user.email],
    ['Roll number', user.rollNo],
    ['Employee id', user.employeeId],
    ['Department', user.department],
    ['Programme', user.program],
    ['Batch', user.batch],
    ['Section', user.section],
    ['Last sign-in', user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'],
  ];
  return (
    <>
      <PageHeader
        icon={<PageIcon name="badge" />}
        title={user.name}
        description={user.roles.map((r) => ROLE_LABEL[r]).join(', ')}
        actions={<Badge variant={statusTone(user.status)}>{user.status}</Badge>}
      />
      <div className="grid gap-8">
        <dl className="surface grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-x-6 gap-y-4 p-5">
          {facts
            .filter((f): f is [string, string] => f[1] !== null)
            .map(([label, value]) => (
              <Fact key={label} label={label}>
                {value}
              </Fact>
            ))}
        </dl>
        {user.roles.includes('student') && <Enrollments enrollments={user.enrollments} />}
        <Access user={user} isAdmin={isAdmin} />
      </div>
    </>
  );
}

function Enrollments({ enrollments }: { enrollments: UserDetail['enrollments'] }) {
  return (
    <Section
      icon={<PageIcon name="courses" className="size-8" />}
      title="Enrolments"
      description="The offerings this student is on."
    >
      {enrollments.length === 0 ? (
        <p className="surface text-muted-foreground p-5 text-sm">Not enrolled in any offering.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
          {enrollments.map((e) => (
            <li key={e.offeringId} className="surface flex items-center justify-between gap-3 p-4 text-sm">
              <span className="font-medium">{e.title}</span>
              <Badge variant={statusTone(e.status)}>{e.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AccessCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <li className="surface flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="icon-chip size-10 [&_svg]:size-5">{icon}</span>
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </li>
  );
}

function Access({ user, isAdmin }: { user: UserDetail; isAdmin: boolean }) {
  const disabled = user.status === 'disabled';
  return (
    <Section
      icon={<PageIcon name="signin" className="size-8" />}
      title="Access"
      description="Every change here is recorded in the audit log."
    >
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
        {!disabled && (
          <AccessCard
            icon={<PageIcon name="envelope" className="size-8" />}
            title="Password link"
            description="Emails a link, valid for 30 minutes, to set a new password."
          >
            <ActionForm
              action={sendResetLink}
              submitLabel="Send password link"
              submitSize="sm"
              successMessage="The link has been queued."
            >
              <input type="hidden" name="userId" value={user.id} />
            </ActionForm>
          </AccessCard>
        )}
        {isAdmin && (
          <>
            <AccessCard
              icon={<PageIcon name="badge" className="size-8" />}
              title="Roles"
              description={user.roles.map((r) => ROLE_LABEL[r]).join(', ')}
            >
              <FormDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <PencilSimpleIcon weight="duotone" /> Change roles
                  </Button>
                }
                icon={<PageIcon name="badge" className="size-8" />}
                title={`Roles of ${user.name}`}
                description="A student needs a batch and a head of department needs a department."
                action={updateUserRoles}
                submitLabel="Save roles"
                successMessage="Roles saved."
              >
                <input type="hidden" name="userId" value={user.id} />
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-medium">Roles</legend>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((r) => (
                      <label
                        key={r}
                        className="ring-border has-checked:bg-primary/10 has-checked:ring-primary/40 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 transition-colors"
                      >
                        <input
                          type="checkbox"
                          name="roles[]"
                          value={r}
                          defaultChecked={user.roles.includes(r)}
                          className="accent-primary size-4"
                        />
                        {ROLE_LABEL[r]}
                      </label>
                    ))}
                  </div>
                  <FieldErrors name="roles[]" />
                </fieldset>
              </FormDialog>
            </AccessCard>
            <AccessCard
              icon={<ProhibitIcon weight="duotone" />}
              title={disabled ? 'Account disabled' : 'Account status'}
              description={
                disabled ? 'The person cannot sign in.' : 'Disabling signs the person out and blocks sign-in.'
              }
            >
              <ActionForm
                action={setUserStatus}
                submitLabel={disabled ? 'Enable account' : 'Disable account'}
                submitVariant={disabled ? 'default' : 'destructive'}
                submitSize="sm"
                confirm={
                  disabled
                    ? { title: 'Enable this account?', message: 'The person can sign in again.' }
                    : { title: 'Disable this account?', message: 'They are signed out everywhere and cannot sign in.' }
                }
              >
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="status" value={disabled ? 'active' : 'disabled'} />
              </ActionForm>
            </AccessCard>
            <AccessCard
              icon={<SignOutIcon weight="duotone" />}
              title="Sessions"
              description="End every session and retire any unused password link."
            >
              <ActionForm
                action={revokeUserSessions}
                submitLabel="Sign out everywhere"
                submitVariant="destructive"
                submitSize="sm"
                successMessage="All sessions ended."
                confirm={{
                  title: 'Sign this user out everywhere?',
                  message: 'Every session ends, and any unused password link stops working.',
                }}
              >
                <input type="hidden" name="userId" value={user.id} />
              </ActionForm>
            </AccessCard>
          </>
        )}
      </ul>
    </Section>
  );
}
