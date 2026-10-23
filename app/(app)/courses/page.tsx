import { Suspense } from 'react';
import type { Metadata } from 'next';
import { z } from 'zod';
import Loading from '../loading';
import { EmptyState, PageNav } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { OfferingCard } from '@/components/offering-card';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { requireViewer } from '@/lib/auth/session';
import { listTermsForSelect } from '@/lib/data/offerings';
import { listDepartmentsForSelect } from '@/lib/data/structure';
import { listMyOfferings } from '@/lib/data/workspace';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'My courses' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
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
  const { page, q, term, department } = Search.parse(await searchParams);
  const isAdmin = viewer.roles.includes('admin');
  const [{ rows, total }, terms, departments] = await Promise.all([
    listMyOfferings(page, { q, termId: term, departmentId: department }),
    isAdmin ? listTermsForSelect() : [],
    isAdmin ? listDepartmentsForSelect() : [],
  ]);
  const query = Object.fromEntries(
    Object.entries({ q, term, department }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return (
    <>
      <PageHeader
        icon={<PageIcon name="courses" />}
        title="My courses"
        description={
          isAdmin
            ? 'Every course offering. Open one to see its workspace.'
            : 'The course offerings you teach or are enrolled in.'
        }
      >
        <FilterForm
          action="/courses"
          submitLabel="Search"
          search={{ name: 'q', label: 'Search courses', placeholder: 'Course code or title', defaultValue: q }}
        >
          {isAdmin && (
            <>
              <NativeSelect name="term" aria-label="Term" defaultValue={term ?? ''}>
                <NativeSelectOption value="">All terms</NativeSelectOption>
                {terms.map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {t.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                name="department"
                aria-label="Department"
                defaultValue={department ?? ''}
                className="max-w-60"
              >
                <NativeSelectOption value="">All departments</NativeSelectOption>
                {departments.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>
                    {d.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </>
          )}
        </FilterForm>
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState
          icon={<PageIcon name="courses" />}
          text={
            Object.keys(query).length > 0
              ? 'No course matches this search. Try a course code or another word from its title.'
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
