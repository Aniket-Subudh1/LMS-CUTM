import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import Loading from '../../loading';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listCourses, listProgramsForSelect } from '@/lib/data/courses';
import { statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

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
      <PageHeader title="Courses" description="The catalog: each course belongs to one programme." />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
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
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        <Link href="/admin/courses/new" className={buttonVariants()}>
          New course
        </Link>
      </div>
      <DataTable
        columns={[
          {
            header: 'Code',
            cell: (c) => (
              <Link href={`/admin/courses/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                {c.code}
              </Link>
            ),
          },
          { header: 'Title', cell: (c) => c.title },
          { header: 'Programme', cell: (c) => c.programCode },
          { header: 'Credits', cell: (c) => c.credits, className: 'text-right' },
          { header: 'Components', cell: (c) => c.components.join(', ') },
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
