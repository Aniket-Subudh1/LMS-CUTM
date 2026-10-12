import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import Loading from '../loading';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { requireViewer } from '@/lib/auth/session';
import { listTermsForSelect } from '@/lib/data/offerings';
import { listDepartmentsForSelect } from '@/lib/data/structure';
import { listMyOfferings } from '@/lib/data/workspace';
import { statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'My courses' };

const Search = z.object({
  page: pageParam.catch(1),
  term: objectId.optional().catch(undefined),
  department: objectId.optional().catch(undefined),
});

export default function CoursesPage({ searchParams }: PageProps<'/courses'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Courses searchParams={searchParams} />
    </Suspense>
  );
}

async function Courses({ searchParams }: { searchParams: PageProps<'/courses'>['searchParams'] }) {
  const viewer = await requireViewer(['admin', 'hod', 'faculty', 'student']);
  const { page, term, department } = Search.parse(await searchParams);
  const isAdmin = viewer.roles.includes('admin');
  const [{ rows, total }, terms, departments] = await Promise.all([
    listMyOfferings(page, { termId: term, departmentId: department }),
    isAdmin ? listTermsForSelect() : [],
    isAdmin ? listDepartmentsForSelect() : [],
  ]);
  const query = Object.fromEntries(
    Object.entries({ term, department }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return (
    <>
      <PageHeader
        title="My courses"
        description={
          isAdmin
            ? 'Every course offering. Open one to see its workspace.'
            : 'The course offerings you teach or are enrolled in.'
        }
      />
      {isAdmin && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Term
            <NativeSelect name="term" defaultValue={term ?? ''}>
              <NativeSelectOption value="">All terms</NativeSelectOption>
              {terms.map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Department
            <NativeSelect name="department" defaultValue={department ?? ''}>
              <NativeSelectOption value="">All departments</NativeSelectOption>
              {departments.map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      )}
      <DataTable
        columns={[
          {
            header: 'Course',
            cell: (o) => (
              <Link href={`/courses/${o.id}`} className="font-medium underline-offset-4 hover:underline">
                {o.title}
              </Link>
            ),
          },
          { header: 'Term', cell: (o) => o.termCode },
          { header: 'Faculty', cell: (o) => o.faculty.join(', ') || '—' },
          { header: 'Status', cell: (o) => <Badge variant={statusTone(o.status)}>{o.status}</Badge> },
        ]}
        rows={rows}
        rowKey={(o) => o.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        path="/courses"
        empty="You have no courses yet. They appear here once an administrator enrols you or assigns you to one."
      />
    </>
  );
}
