import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FileArrowUpIcon, UserPlusIcon, UsersThreeIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { createUser, importUsers } from './actions';
import { Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { requireViewer } from '@/lib/auth/session';
import { getUserFormOptions, listUsers } from '@/lib/data/users';
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
  const { rows, total } = await listUsers(page, { q, role, status });
  const query = Object.fromEntries(
    Object.entries({ q, role, status }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return (
    <>
      <PageHeader
        icon={<UsersThreeIcon weight="duotone" />}
        title="Users"
        description="Search by name, roll number or email address."
        actions={
          viewer.roles.includes('admin') && (
            <>
              <ImportUsers />
              <NewUser />
            </>
          )
        }
      />
      <FilterForm action="/admin/users" submitLabel="Search">
        <label className="grid min-w-56 flex-1 gap-1.5 text-sm font-medium sm:max-w-80">
          Search
          <Input
            name="q"
            type="search"
            defaultValue={q ?? ''}
            maxLength={100}
            placeholder="Name, roll number or email"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Role
          <NativeSelect name="role" defaultValue={role ?? ''}>
            <NativeSelectOption value="">Any role</NativeSelectOption>
            {ROLES.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {ROLE_LABEL[r]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Status
          <NativeSelect name="status" defaultValue={status ?? ''}>
            <NativeSelectOption value="">Any status</NativeSelectOption>
            {STATUSES.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </FilterForm>
      <DataTable
        columns={[
          {
            header: 'Name',
            cell: (u) => (
              <Link href={`/admin/users/${u.id}`} className="group flex items-center gap-2.5 font-medium">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="bg-primary/10 text-primary rounded-lg text-xs font-semibold">
                    {initials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="group-hover:text-primary group-hover:underline">{u.name}</span>
              </Link>
            ),
          },
          { header: 'Email', cell: (u) => u.email },
          { header: 'Roll no. / Employee id', cell: (u) => u.identifier ?? '—' },
          { header: 'Roles', cell: (u) => u.roles.map((r) => ROLE_LABEL[r]).join(', ') },
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
    </>
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
      icon={<UserPlusIcon weight="duotone" />}
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
      <fieldset className="bg-muted/50 grid gap-5 rounded-xl p-4 sm:grid-cols-3">
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
      <fieldset className="bg-muted/50 grid gap-5 rounded-xl p-4 sm:grid-cols-2">
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
      icon={<FileArrowUpIcon weight="duotone" />}
      title="Import users"
      description="Upload a CSV with one row per person. If any row is wrong nothing is saved, and the rows to fix are listed."
      openParam="import"
      action={importUsers}
      submitLabel="Import"
      successMessage="Users imported. Invitations are on their way."
    >
      <div className="bg-muted/50 grid gap-2 rounded-xl p-4 text-sm leading-relaxed">
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
