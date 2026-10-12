import type { Metadata } from 'next';
import { importUsers } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { requireViewer } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Import users' };

export default async function ImportUsersPage() {
  await requireViewer(['admin']);
  return (
    <>
      <PageHeader
        title="Import users"
        description="Upload a CSV with one row per person. If any row is wrong nothing is saved, and the rows to fix are listed."
      />
      <section className="bg-card max-w-2xl rounded-lg border p-5 sm:p-6">
        <p className="mb-5 text-sm">
          Columns: <code>role</code>, <code>name</code>, <code>email</code>, then <code>rollNo</code>,{' '}
          <code>program</code>, <code>batchStartYear</code>, <code>section</code> for students, or{' '}
          <code>employeeId</code>, <code>department</code> for faculty and hod. Role is student, faculty, hod or
          support. People who already exist are updated and keep their password; new people are sent an invitation.
        </p>
        <ActionForm
          action={importUsers}
          submitLabel="Import"
          successMessage="Users imported. Invitations are on their way."
        >
          <Field name="file" label="CSV file">
            <Input name="file" type="file" accept=".csv,text/csv" required />
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
