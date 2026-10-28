import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { saveProgram } from '../actions';
import { Field } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getStructureCounts, listDepartmentsForSelect, listPrograms } from '@/lib/data/structure';
import { statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Programmes' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  department: objectId.optional().catch(undefined),
  status: z.enum(['active', 'archived']).optional().catch(undefined),
});

export default function ProgramsPage({ searchParams }: PageProps<'/admin/programs'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Programs searchParams={searchParams} />
    </Suspense>
  );
}

async function Programs({ searchParams }: { searchParams: PageProps<'/admin/programs'>['searchParams'] }) {
  const { page, q, department, status } = Search.parse(await searchParams);
  const [{ rows, total }, departments, counts] = await Promise.all([
    listPrograms(page, { q, departmentId: department, status }),
    listDepartmentsForSelect(),
    getStructureCounts(),
  ]);
  const query = Object.fromEntries(
    Object.entries({ q, department, status }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return (
    <PageHeader
      icon={<PageIcon name="programmes" />}
      title="Programmes"
      description="A programme lists its courses in baskets, titles its outcomes and holds the batches students belong to."
      actions={
        <FormDialog
          trigger={
            <Button>
              <PlusIcon weight="bold" /> Add programme
            </Button>
          }
          icon={<PageIcon name="programmes" className="size-8" />}
          title="Add a programme"
          description="You will continue on the programme page to add its courses, outcome titles and batches."
          action={saveProgram}
          submitLabel="Add programme"
          successMessage="Programme added. Opening it…"
        >
          <input type="hidden" name="status" value="active" />
          <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
            <Field name="code" label="Code" hint="For example BTECH-CSE.">
              <Input name="code" required maxLength={20} />
            </Field>
            <Field name="name" label="Name">
              <Input name="name" required maxLength={160} />
            </Field>
          </div>
          <Field name="departmentId" label="Department">
            <NativeSelect name="departmentId" required defaultValue="">
              <NativeSelectOption value="" disabled>
                Choose a department
              </NativeSelectOption>
              {departments.map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field name="durationSemesters" label="Duration (semesters)">
            <Input name="durationSemesters" type="number" required min={1} max={12} defaultValue={8} />
          </Field>
        </FormDialog>
      }
      stats={[
        { label: 'Programmes', value: counts.programs, icon: <PageIcon name="programmes" className="size-7" /> },
        { label: 'Departments', value: counts.departments, icon: <PageIcon name="departments" className="size-7" /> },
        { label: 'Batches', value: counts.batches, icon: <PageIcon name="batches" className="size-7" /> },
        {
          label: 'No department yet',
          value: counts.noDepartment,
          icon: <PageIcon name="departments" className="size-7" />,
        },
      ]}
    >
      <FilterForm
        action="/admin/programs"
        submitLabel="Search"
        search={{ name: 'q', label: 'Search programmes', placeholder: 'Code or name, like BTECH-CSE', defaultValue: q }}
      >
        <NativeSelect name="department" aria-label="Department" defaultValue={department ?? ''} className="max-w-60">
          <NativeSelectOption value="">All departments</NativeSelectOption>
          {departments.map((d) => (
            <NativeSelectOption key={d.id} value={d.id}>
              {d.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="status" aria-label="Status" defaultValue={status ?? ''}>
          <NativeSelectOption value="">Any status</NativeSelectOption>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="archived">Archived</NativeSelectOption>
        </NativeSelect>
      </FilterForm>
      <DataTable
        bare
        columns={[
          {
            header: 'Programme',
            cell: (p) => (
              <Link href={`/admin/programs/${p.id}`} className="group grid leading-tight">
                <span className="group-hover:text-primary font-medium">{p.code}</span>
                <span className="text-muted-foreground text-xs">{p.name}</span>
              </Link>
            ),
          },
          {
            header: 'Department',
            cell: (p) => p.departmentCode ?? <Badge variant="warning">Not set</Badge>,
          },
          { header: 'Semesters', cell: (p) => p.durationSemesters ?? '—', className: 'text-right tabular-nums' },
          { header: 'Status', cell: (p) => <Badge variant={statusTone(p.status)}>{p.status}</Badge> },
        ]}
        rows={rows}
        rowKey={(p) => p.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        path="/admin/programs"
        empty={
          Object.keys(query).length > 0
            ? 'No programme matches. Try another code or name.'
            : 'Add a department first, then the first programme with Add programme.'
        }
      />
    </PageHeader>
  );
}
