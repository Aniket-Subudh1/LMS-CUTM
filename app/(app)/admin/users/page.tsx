import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FileArrowUpIcon, UserPlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { createUser, importUsers } from './actions';
import { Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { requireViewer } from '@/lib/auth/session';
import { getUserFormOptions, getUserStats, listUsers } from '@/lib/data/users';
import { initials, ROLE_LABEL, statusTone } from '@/lib/format';
import { page as pageParam, pageSize, ROLES } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Users' };

const STATUSES = ['invited', 'active', 'disabled'] as const;

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  role: z.enum(ROLES).optional().catch(undefined),
  status: z.enum(STATUSES).optional().catch(undefined),
});

export default function UsersPage({ searchParams }: PageProps<'/admin/users'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: { searchParams: PageProps<'/admin/users'>['searchParams'] }) {
  const viewer = await requireViewer(['admin', 'support']);
  const { page, q, role, status } = Search.parse(await searchParams);
  const [{ rows, total }, stats] = await Promise.all([listUsers(page, { q, role, status }), getUserStats()]);
  const query = Object.fromEntries(
    Object.entries({ q, role, status }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return (
    <PageHeader
      icon={<PageIcon name="users" />}
      title="Users"
      description="Everyone who can sign in: students, faculty, heads of department and staff."
      actions={
        viewer.roles.includes('admin') && (
          <>
            <ImportUsers />
            <NewUser />
          </>
        )
      }
      stats={[
        { label: 'Users', value: stats.total, icon: <PageIcon name="users" className="size-7" /> },
        { label: 'Students', value: stats.students, icon: <PageIcon name="badge" className="size-7" /> },
        { label: 'Faculty and HoDs', value: stats.staff, icon: <PageIcon name="profile" className="size-7" /> },
        { label: 'Yet to sign in', value: stats.invited, icon: <PageIcon name="envelope" className="size-7" /> },
      ]}
    >
      <FilterForm
        action="/admin/users"
        submitLabel="Search"
        search={{ name: 'q', label: 'Search users', placeholder: 'Search name, roll number or email', defaultValue: q }}
      >
        <NativeSelect name="role" aria-label="Role" defaultValue={role ?? ''}>
          <NativeSelectOption value="">Any role</NativeSelectOption>
          {ROLES.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {ROLE_LABEL[r]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="status" aria-label="Status" defaultValue={status ?? ''}>
          <NativeSelectOption value="">Any status</NativeSelectOption>
          {STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FilterForm>
      <DataTable
        bare
        columns={[
          {
            header: 'Name',
            cell: (u) => (
              <Link href={`/admin/users/${u.id}`} className="group flex min-w-0 items-center gap-3">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 leading-tight">
                  <span className="group-hover:text-primary truncate font-medium">{u.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{u.email}</span>
                </span>
              </Link>
            ),
          },
          {
            header: 'Roll no. / Employee id',
            cell: (u) => <span className="text-muted-foreground tabular-nums">{u.identifier ?? '—'}</span>,
          },
          {
            header: 'Roles',
            cell: (u) => (
              <span className="flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <span key={r} className="bg-muted rounded-md px-2 py-0.5 text-xs">
                    {ROLE_LABEL[r]}
                  </span>
                ))}
              </span>
            ),
          },
          { header: 'Status', cell: (u) => <Badge variant={statusTone(u.status)}>{u.status}</Badge> },
        ]}
        rows={rows}
        rowKey={(u) => u.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        path="/admin/users"
        empty="No users match this search."
      />
    </PageHeader>
  );
}

async function NewUser() {
  const { departments, batches } = await getUserFormOptions();
  return (
    <FormDialog
      trigger={
        <Button>
          <UserPlusIcon weight="duotone" /> New user
        </Button>
      }
      size="wide"
      icon={<PageIcon name="users" className="size-8" />}
      title="New user"
      description="The person receives an email to set their password. Fill in the student fields for a student and the staff fields for faculty or head of department."
      openParam="user"
      action={createUser}
      submitLabel="Create and invite"
      successMessage="User created and invited. Opening their page…"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="Name">
          <Input name="name" required maxLength={120} />
        </Field>
        <Field name="email" label="Email address">
          <Input name="email" type="email" required maxLength={254} />
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Roles</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <label
              key={r}
              className="ring-border has-checked:bg-primary/10 has-checked:ring-primary/40 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 transition-colors"
            >
              <input type="checkbox" name="roles[]" value={r} className="accent-primary size-4" />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
        <FieldErrors name="roles[]" />
      </fieldset>
      <fieldset className="bg-muted/50 grid gap-5 rounded-md p-4 sm:grid-cols-3">
        <legend className="sr-only">Student</legend>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase sm:col-span-3">Student</p>
        <Field name="rollNo" label="Roll number">
          <Input name="rollNo" maxLength={30} />
        </Field>
        <Field name="batchId" label="Batch" hint="The programme follows from the batch.">
          <NativeSelect name="batchId" defaultValue="">
            <NativeSelectOption value="">None</NativeSelectOption>
            {batches.map((b) => (
              <NativeSelectOption key={b.id} value={b.id}>
                {b.label}
                {b.sections.length > 0 ? ` (sections ${b.sections.join(', ')})` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="section" label="Section" hint="One of the batch’s sections.">
          <Input name="section" maxLength={10} />
        </Field>
      </fieldset>
      <fieldset className="bg-muted/50 grid gap-5 rounded-md p-4 sm:grid-cols-2">
        <legend className="sr-only">Faculty and head of department</legend>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase sm:col-span-2">
          Faculty and head of department
        </p>
        <Field name="employeeId" label="Employee id">
          <Input name="employeeId" maxLength={30} />
        </Field>
        <Field name="departmentId" label="Department">
          <NativeSelect name="departmentId" defaultValue="">
            <NativeSelectOption value="">None</NativeSelectOption>
            {departments.map((d) => (
              <NativeSelectOption key={d.id} value={d.id}>
                {d.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </fieldset>
    </FormDialog>
  );
}

function ImportUsers() {
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <FileArrowUpIcon weight="duotone" /> Import CSV
        </Button>
      }
      size="wide"
      icon={<PageIcon name="imports" className="size-8" />}
      title="Import users"
      description="Upload a CSV with one row per person. If any row is wrong nothing is saved, and the rows to fix are listed."
      openParam="import"
      action={importUsers}
      submitLabel="Import"
      successMessage="Users imported. Invitations are on their way."
    >
      <div className="bg-muted/50 grid gap-2 rounded-md p-4 text-sm leading-relaxed">
        <p>
          Columns: <code>role</code>, <code>name</code>, <code>email</code>, then <code>rollNo</code>,{' '}
          <code>program</code>, <code>batchStartYear</code>, <code>section</code> for students, or{' '}
          <code>employeeId</code>, <code>department</code> for faculty and hod.
        </p>
        <p className="text-muted-foreground">
          Role is student, faculty, hod or support. People who already exist are updated and keep their password; new
          people are sent an invitation.
        </p>
      </div>
      <Field name="file" label="CSV file">
        <Input name="file" type="file" accept=".csv,text/csv" required />
      </Field>
    </FormDialog>
  );
}
