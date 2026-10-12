import { Suspense } from 'react';
import type { Metadata } from 'next';
import { BooksIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../loading';
import { EmptyState, PageNav } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { OfferingCard } from '@/components/offering-card';
import { PageHeader } from '@/components/page-header';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { requireViewer } from '@/lib/auth/session';
import { listTermsForSelect } from '@/lib/data/offerings';
import { listDepartmentsForSelect } from '@/lib/data/structure';
import { listMyOfferings } from '@/lib/data/workspace';
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
        icon={<BooksIcon weight="duotone" />}
        title="My courses"
        description={
          isAdmin
            ? 'Every course offering. Open one to see its workspace.'
            : 'The course offerings you teach or are enrolled in.'
        }
      />
      {isAdmin && (
        <FilterForm action="/courses">
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
        </FilterForm>
      )}
      {rows.length === 0 ? (
        <EmptyState
          icon={<BooksIcon weight="duotone" />}
          text={
            isAdmin && Object.keys(query).length > 0
              ? 'No offerings match these filters.'
              : 'You have no courses yet. They appear here once an administrator enrols you or assigns you to one.'
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3 sm:gap-4">
            {rows.map((o) => (
              <li key={o.id}>
                <OfferingCard offering={o} />
              </li>
            ))}
          </ul>
          <PageNav
            shown={rows.length}
            total={total}
            page={page}
            pageSize={pageSize}
            query={query}
            path="/courses"
            className="mt-5"
          />
        </>
      )}
    </>
  );
}
