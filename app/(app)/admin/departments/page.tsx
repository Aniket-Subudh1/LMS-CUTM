import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import Loading from '../../loading';
import { saveDepartment } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getDepartment, listDepartments } from '@/lib/data/structure';
import { statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Departments' };

const Search = z.object({ page: pageParam.catch(1), edit: objectId.optional().catch(undefined) });

export default function DepartmentsPage({ searchParams }: PageProps<'/admin/departments'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Departments searchParams={searchParams} />
    </Suspense>
  );
}

async function Departments({ searchParams }: { searchParams: PageProps<'/admin/departments'>['searchParams'] }) {
  const { page, edit } = Search.parse(await searchParams);
  const [{ rows, total }, editing] = await Promise.all([listDepartments(page), edit ? getDepartment(edit) : null]);
  return (
    <>
      <PageHeader title="Departments" description="Every programme and course belongs to one department." />
      <DataTable
        columns={[
          { header: 'Code', cell: (d) => <span className="font-medium">{d.code}</span> },
          { header: 'Name', cell: (d) => d.name },
          { header: 'Status', cell: (d) => <Badge variant={statusTone(d.status)}>{d.status}</Badge> },
          {
            header: '',
            className: 'text-right',
            cell: (d) => (
              <Link href={`/admin/departments?edit=${d.id}`} className="text-sm underline-offset-4 hover:underline">
                Edit<span className="sr-only"> {d.code}</span>
              </Link>
            ),
          },
        ]}
        rows={rows}
        rowKey={(d) => d.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={{}}
        path="/admin/departments"
        empty="Add the first department below."
      />
      <section className="bg-card mt-6 max-w-2xl rounded-lg border p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">{editing ? `Edit ${editing.code}` : 'Add a department'}</h2>
        <ActionForm
          key={editing?.id ?? 'new'}
          action={saveDepartment}
          submitLabel={editing ? 'Save changes' : 'Add department'}
          successMessage="Department added."
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field name="code" label="Code" hint="Short and unique, for example CSE.">
            <Input name="code" required maxLength={10} defaultValue={editing?.code} />
          </Field>
          <Field name="name" label="Name">
            <Input name="name" required maxLength={120} defaultValue={editing?.name} />
          </Field>
          <Field name="status" label="Status">
            <NativeSelect name="status" defaultValue={editing?.status ?? 'active'}>
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="archived">Archived</NativeSelectOption>
            </NativeSelect>
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
