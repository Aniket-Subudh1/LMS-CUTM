import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import Loading from '../../loading';
import { saveProgram } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
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
      <PageHeader title="Programmes" description="UGC programmes carry POs and PSOs; skill programmes do not." />
      <DataTable
        columns={[
          {
            header: 'Code',
            cell: (p) => (
              <Link href={`/admin/programs/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                {p.code}
              </Link>
            ),
          },
          { header: 'Name', cell: (p) => p.name },
          { header: 'Department', cell: (p) => p.departmentCode },
          { header: 'Category', cell: (p) => (p.category === 'ugc' ? 'UGC' : 'Skill') },
          { header: 'Semesters', cell: (p) => p.durationSemesters, className: 'text-right' },
          { header: 'Status', cell: (p) => <Badge variant={statusTone(p.status)}>{p.status}</Badge> },
        ]}
        rows={rows}
        rowKey={(p) => p.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={{}}
        path="/admin/programs"
        empty="Add a department first, then the first programme below."
      />
      <section className="bg-card mt-6 max-w-2xl rounded-lg border p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">Add a programme</h2>
        <ActionForm action={saveProgram} submitLabel="Add programme">
          <input type="hidden" name="status" value="active" />
          <Field name="code" label="Code" hint="For example BTECH-CSE.">
            <Input name="code" required maxLength={20} />
          </Field>
          <Field name="name" label="Name">
            <Input name="name" required maxLength={160} />
          </Field>
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
          <Field
            name="category"
            label="Category"
            hint="A UGC programme starts with PO1–PO12 and PSO1–PSO3. This cannot be changed later."
          >
            <NativeSelect name="category" defaultValue="ugc">
              <NativeSelectOption value="ugc">UGC</NativeSelectOption>
              <NativeSelectOption value="skill">Skill</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field name="durationSemesters" label="Duration (semesters)">
            <Input name="durationSemesters" type="number" required min={1} max={12} defaultValue={8} />
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
