import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpenTextIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { saveCourse } from './actions';
import { Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listCourses, listProgramsForSelect } from '@/lib/data/courses';
import { statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';
import { COMPONENTS } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Courses' };

const Search = z.object({ page: pageParam.catch(1), program: objectId.optional().catch(undefined) });

export default function CoursesPage({ searchParams }: PageProps<'/admin/courses'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Courses searchParams={searchParams} />
    </Suspense>
  );
}

async function Courses({ searchParams }: { searchParams: PageProps<'/admin/courses'>['searchParams'] }) {
  const { page, program } = Search.parse(await searchParams);
  const [{ rows, total }, programs] = await Promise.all([listCourses(page, program), listProgramsForSelect()]);
  return (
    <>
      <PageHeader
        icon={<BookOpenTextIcon weight="duotone" />}
        title="Courses"
        description="The catalog: each course belongs to one programme."
        actions={
          <FormDialog
            trigger={
              <Button>
                <PlusIcon weight="bold" /> New course
              </Button>
            }
            icon={<BookOpenTextIcon weight="duotone" />}
            title="New course"
            description="Department and category come from the programme. You will continue on the course page to add its outcomes."
            openParam="course"
            action={saveCourse}
            submitLabel="Create course"
            successMessage="Course created. Opening it…"
          >
            <input type="hidden" name="status" value="draft" />
            <Field name="programId" label="Programme">
              <NativeSelect name="programId" required defaultValue={program ?? ''}>
                <NativeSelectOption value="" disabled>
                  Choose a programme
                </NativeSelectOption>
                {programs.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
              <Field name="code" label="Code" hint="Unique within the programme, for example CS101.">
                <Input name="code" required maxLength={20} />
              </Field>
              <Field name="title" label="Title">
                <Input name="title" required maxLength={160} />
              </Field>
            </div>
            <Field name="credits" label="Credits" hint="In steps of 0.5.">
              <Input name="credits" type="number" required min={0} max={30} step={0.5} className="max-w-32" />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Components</legend>
              <div className="flex flex-wrap gap-2">
                {COMPONENTS.map((c) => (
                  <label
                    key={c}
                    className="ring-border has-checked:bg-primary/10 has-checked:ring-primary/40 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm capitalize ring-1 transition-colors"
                  >
                    <input type="checkbox" name="components[]" value={c} className="accent-primary size-4" />
                    {c}
                  </label>
                ))}
              </div>
              <FieldErrors name="components[]" />
            </fieldset>
          </FormDialog>
        }
      />
      <FilterForm action="/admin/courses">
        <label className="grid gap-1.5 text-sm font-medium">
          Programme
          <NativeSelect name="program" defaultValue={program ?? ''}>
            <NativeSelectOption value="">All programmes</NativeSelectOption>
            {programs.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </FilterForm>
      <DataTable
        columns={[
          {
            header: 'Code',
            cell: (c) => (
              <Link href={`/admin/courses/${c.id}`} className="text-primary font-medium hover:underline">
                {c.code}
              </Link>
            ),
          },
          { header: 'Title', cell: (c) => c.title },
          { header: 'Programme', cell: (c) => c.programCode },
          { header: 'Credits', cell: (c) => c.credits, className: 'text-right tabular-nums' },
          { header: 'Components', cell: (c) => <span className="capitalize">{c.components.join(', ')}</span> },
          { header: 'Status', cell: (c) => <Badge variant={statusTone(c.status)}>{c.status}</Badge> },
        ]}
        rows={rows}
        rowKey={(c) => c.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={program ? { program } : {}}
        path="/admin/courses"
        empty="No courses match. Add one with New course."
      />
    </>
  );
}
