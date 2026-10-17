import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { saveDepartment } from '../actions';
import { Field } from '@/components/action-form';
import { EmptyState, PageNav } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listDepartments, type DepartmentRow } from '@/lib/data/structure';
import { statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Departments' };

const Search = z.object({ page: pageParam.catch(1) });

export default function DepartmentsPage({ searchParams }: PageProps<'/admin/departments'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Departments searchParams={searchParams} />
    </Suspense>
  );
}

async function Departments({ searchParams }: { searchParams: PageProps<'/admin/departments'>['searchParams'] }) {
  const { page } = Search.parse(await searchParams);
  const { rows, total } = await listDepartments(page);
  return (
    <>
      <PageHeader
        icon={<PageIcon name="departments" />}
        title="Departments"
        description="Every programme and course belongs to one department."
        actions={<DepartmentDialog />}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<PageIcon name="departments" />} text="Add the first department with Add department." />
      ) : (
        <div className="grid gap-5">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
            {rows.map((d) => (
              <li key={d.id} className="surface flex items-start gap-4 p-5">
                <span className="icon-chip size-11">
                  <PageIcon name="departments" className="size-8" />
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide">{d.code}</p>
                  <p className="leading-snug font-medium">{d.name}</p>
                  <Badge variant={statusTone(d.status)} className="mt-1">
                    {d.status}
                  </Badge>
                </div>
                <DepartmentDialog department={d} />
              </li>
            ))}
          </ul>
          <PageNav
            shown={rows.length}
            total={total}
            page={page}
            pageSize={pageSize}
            query={{}}
            path="/admin/departments"
          />
        </div>
      )}
    </>
  );
}

function DepartmentDialog({ department }: { department?: DepartmentRow }) {
  return (
    <FormDialog
      trigger={
        department ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${department.code}`}>
            <PencilSimpleIcon weight="duotone" />
          </Button>
        ) : (
          <Button>
            <PlusIcon weight="bold" /> Add department
          </Button>
        )
      }
      icon={<PageIcon name="departments" className="size-8" />}
      title={department ? `Edit ${department.code}` : 'Add a department'}
      description="Programmes and courses are filed under a department."
      openParam={department ? undefined : 'department'}
      action={saveDepartment}
      submitLabel={department ? 'Save changes' : 'Add department'}
      successMessage={department ? 'Department updated.' : 'Department added.'}
    >
      {department && <input type="hidden" name="id" value={department.id} />}
      <Field name="code" label="Code" hint="Short and unique, for example CSE.">
        <Input name="code" required maxLength={10} defaultValue={department?.code} />
      </Field>
      <Field name="name" label="Name">
        <Input name="name" required maxLength={120} defaultValue={department?.name} />
      </Field>
      <Field name="status" label="Status">
        <NativeSelect name="status" defaultValue={department?.status ?? 'active'}>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="archived">Archived</NativeSelectOption>
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}
