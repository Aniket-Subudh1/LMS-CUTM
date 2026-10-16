import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GraduationCapIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { saveProgram } from '../actions';
import { Field } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listDepartmentsForSelect, listPrograms } from '@/lib/data/structure';
import { statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Programmes' };

const Search = z.object({ page: pageParam.catch(1) });

export default function ProgramsPage({ searchParams }: PageProps<'/admin/programs'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Programs searchParams={searchParams} />
    </Suspense>
  );
}

async function Programs({ searchParams }: { searchParams: PageProps<'/admin/programs'>['searchParams'] }) {
  const { page } = Search.parse(await searchParams);
  const [{ rows, total }, departments] = await Promise.all([listPrograms(page), listDepartmentsForSelect()]);
  return (
    <>
      <PageHeader
        icon={<GraduationCapIcon weight="duotone" />}
        title="Programmes"
        description="A programme lists its courses in baskets, titles its outcomes and holds the batches students belong to."
        actions={
          <FormDialog
            trigger={
              <Button>
                <PlusIcon weight="bold" /> Add programme
              </Button>
            }
            icon={<GraduationCapIcon weight="duotone" />}
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
      />
      <DataTable
        columns={[
          {
            header: 'Code',
            cell: (p) => (
              <Link href={`/admin/programs/${p.id}`} className="text-primary font-medium hover:underline">
                {p.code}
              </Link>
            ),
          },
          { header: 'Name', cell: (p) => p.name },
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
        query={{}}
        path="/admin/programs"
        empty="Add a department first, then the first programme with Add programme."
      />
    </>
  );
}
