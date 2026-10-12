import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import Loading from '../../loading';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { requireViewer } from '@/lib/auth/session';
import { listUsers } from '@/lib/data/users';
import { ROLE_LABEL, statusTone } from '@/lib/format';
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
      <PageHeader title="Users" description="Search by name, roll number or email address." />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Search
            <Input name="q" type="search" defaultValue={q ?? ''} maxLength={100} className="w-64" />
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
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {viewer.roles.includes('admin') && (
          <div className="flex gap-2">
            <Link href="/admin/users/import" className={buttonVariants({ variant: 'secondary' })}>
              Import CSV
            </Link>
            <Link href="/admin/users/new" className={buttonVariants()}>
              New user
            </Link>
          </div>
        )}
      </div>
      <DataTable
        columns={[
          {
            header: 'Name',
            cell: (u) => (
              <Link href={`/admin/users/${u.id}`} className="font-medium underline-offset-4 hover:underline">
                {u.name}
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
