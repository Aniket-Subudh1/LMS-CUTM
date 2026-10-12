import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../loading';
import { revokeUserSessions, sendResetLink, setUserStatus, updateUserRoles } from '../actions';
import { ActionForm, FieldErrors } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
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
    ['Status', user.status],
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
      <PageHeader title={user.name} description={user.roles.map((r) => ROLE_LABEL[r]).join(', ')} />
      <div className="grid max-w-3xl gap-6">
        <section className="bg-card rounded-lg border p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold">Details</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            {facts
              .filter((f): f is [string, string] => f[1] !== null)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-sm">{label}</dt>
                  <dd className="text-sm font-medium">{value}</dd>
                </div>
              ))}
          </dl>
        </section>
        {user.roles.includes('student') && <Enrollments enrollments={user.enrollments} />}
        <Access user={user} isAdmin={isAdmin} />
      </div>
    </>
  );
}

function Enrollments({ enrollments }: { enrollments: UserDetail['enrollments'] }) {
  return (
    <section className="bg-card rounded-lg border p-5 sm:p-6">
      <h2 className="mb-4 text-base font-semibold">Enrolments</h2>
      {enrollments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Not enrolled in any offering.</p>
      ) : (
        <ul className="grid gap-2 text-sm">
          {enrollments.map((e) => (
            <li key={e.offeringId} className="flex items-center justify-between gap-3">
              <span>{e.title}</span>
              <Badge variant={statusTone(e.status)}>{e.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Access({ user, isAdmin }: { user: UserDetail; isAdmin: boolean }) {
  const disabled = user.status === 'disabled';
  return (
    <section className="bg-card grid gap-6 rounded-lg border p-5 sm:p-6">
      <h2 className="text-base font-semibold">Access</h2>
      {!disabled && (
        <div className="grid gap-1.5">
          <ActionForm
            action={sendResetLink}
            submitLabel="Send password link"
            successMessage="The link has been queued."
          >
            <input type="hidden" name="userId" value={user.id} />
          </ActionForm>
          <p className="text-muted-foreground text-sm">Emails a link, valid for 30 minutes, to set a new password.</p>
        </div>
      )}
      {isAdmin && (
        <>
          <ActionForm action={updateUserRoles} submitLabel="Save roles" successMessage="Roles saved.">
            <input type="hidden" name="userId" value={user.id} />
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Roles</legend>
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
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
              <FieldErrors name="roles[]" />
            </fieldset>
          </ActionForm>
          <div className="flex flex-wrap gap-3">
            <ActionForm
              action={setUserStatus}
              submitLabel={disabled ? 'Enable account' : 'Disable account'}
              submitVariant={disabled ? 'default' : 'destructive'}
              confirm={
                disabled
                  ? { title: 'Enable this account?', message: 'The person can sign in again.' }
                  : { title: 'Disable this account?', message: 'They are signed out everywhere and cannot sign in.' }
              }
            >
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="status" value={disabled ? 'active' : 'disabled'} />
            </ActionForm>
            <ActionForm
              action={revokeUserSessions}
              submitLabel="Sign out everywhere"
              submitVariant="destructive"
              successMessage="All sessions ended."
              confirm={{
                title: 'Sign this user out everywhere?',
                message: 'Every session ends, and any unused password link stops working.',
              }}
            >
              <input type="hidden" name="userId" value={user.id} />
            </ActionForm>
          </div>
        </>
      )}
    </section>
  );
}
