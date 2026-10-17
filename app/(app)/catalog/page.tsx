import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon, UploadSimpleIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../loading';
import { saveCourse } from './actions';
import { CourseFields } from './course-fields';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { LinkSpinner } from '@/components/link-spinner';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { requireViewer } from '@/lib/auth/session';
import { getCatalogStats, listCatalog, listProgramsForSelect, type CatalogRow } from '@/lib/data/courses';
import { creditTotal, formatCredits } from '@/lib/domain/catalog';
import { COURSE_TYPE_LABEL, statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';
import { COURSE_TYPES } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Course catalogue' };

// A checkbox filter drawn as a pill beside the selects; it turns blue while on.
const TOGGLE =
  'ring-border bg-card has-checked:bg-primary/10 has-checked:text-primary has-checked:ring-primary/30 flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-sm ring-1 transition-colors';

const flag = z.literal('1').optional().catch(undefined);
const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(80).optional().catch(undefined),
  type: z.enum(COURSE_TYPES).optional().catch(undefined),
  program: objectId.optional().catch(undefined),
  basket: z.string().max(60).optional().catch(undefined),
  status: z.enum(['draft', 'active', 'archived']).optional().catch(undefined),
  review: flag,
  mine: flag,
});

export default function CatalogPage({ searchParams }: PageProps<'/catalog'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Catalog searchParams={searchParams} />
    </Suspense>
  );
}

async function Catalog({ searchParams }: { searchParams: PageProps<'/catalog'>['searchParams'] }) {
  const search = Search.parse(await searchParams);
  const viewer = await requireViewer(['admin', 'hod', 'faculty']);
  const isAdmin = viewer.roles.includes('admin');
  const [{ rows, total }, programmes, stats] = await Promise.all([
    listCatalog(search.page, {
      q: search.q,
      type: search.type,
      programId: search.program,
      basket: search.program ? search.basket : undefined,
      status: search.status,
      review: search.review === '1',
      mine: search.mine === '1',
    }),
    listProgramsForSelect(),
    getCatalogStats(),
  ]);
  const baskets = programmes.find((p) => p.id === search.program)?.baskets ?? [];
  const query = Object.fromEntries(
    Object.entries(search).filter(
      (entry): entry is [string, string] => entry[0] !== 'page' && typeof entry[1] === 'string',
    ),
  );
  return (
    <PageHeader
      icon={<PageIcon name="catalog" />}
      title="Course catalogue"
      description="Every CUTM course, once. Open a course to see what it teaches; its coordinator keeps it complete."
      actions={
        isAdmin && (
          <>
            <Button asChild variant="outline">
              <Link href="/admin/imports">
                <UploadSimpleIcon weight="duotone" /> Import courses
                <LinkSpinner />
              </Link>
            </Button>
            <FormDialog
              trigger={
                <Button>
                  <PlusIcon weight="bold" /> New course
                </Button>
              }
              icon={<PageIcon name="catalog" className="size-8" />}
              title="New course"
              description="Most courses come from the course list upload. Add one here when it is not in the list yet."
              openParam="course"
              action={saveCourse}
              submitLabel="Add course"
              successMessage="Course added. Opening it…"
            >
              <CourseFields />
            </FormDialog>
          </>
        )
      }
      stats={[
        { label: 'Courses', value: stats.total, icon: <PageIcon name="catalog" className="size-7" /> },
        { label: 'Active', value: stats.active, icon: <PageIcon name="course" className="size-7" /> },
        { label: 'Need review', value: stats.review, icon: <PageIcon name="missing" className="size-7" /> },
        { label: 'No coordinator', value: stats.unassigned, icon: <PageIcon name="profile" className="size-7" /> },
      ]}
    >
      <FilterForm
        action="/catalog"
        submitLabel="Search"
        search={{
          name: 'q',
          label: 'Search courses',
          placeholder: 'Code or title, like CUTM1535',
          defaultValue: search.q,
        }}
      >
        <NativeSelect name="program" aria-label="Programme" defaultValue={search.program ?? ''} className="max-w-56">
          <NativeSelectOption value="">All programmes</NativeSelectOption>
          {programmes.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {baskets.length > 0 && (
          <NativeSelect name="basket" aria-label="Basket" defaultValue={search.basket ?? ''} className="max-w-48">
            <NativeSelectOption value="">All baskets</NativeSelectOption>
            {baskets.map((b) => (
              <NativeSelectOption key={b} value={b}>
                {b}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <NativeSelect name="type" aria-label="Type" defaultValue={search.type ?? ''}>
          <NativeSelectOption value="">Any type</NativeSelectOption>
          {COURSE_TYPES.map((type) => (
            <NativeSelectOption key={type} value={type}>
              {COURSE_TYPE_LABEL[type]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="status" aria-label="Status" defaultValue={search.status ?? ''}>
          <NativeSelectOption value="">Any status</NativeSelectOption>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="draft">Draft</NativeSelectOption>
          <NativeSelectOption value="archived">Archived</NativeSelectOption>
        </NativeSelect>
        <label className={TOGGLE}>
          <input
            type="checkbox"
            name="review"
            value="1"
            defaultChecked={search.review === '1'}
            className="accent-primary size-4"
          />
          Needs review
        </label>
        {viewer.roles.includes('faculty') && (
          <label className={TOGGLE}>
            <input
              type="checkbox"
              name="mine"
              value="1"
              defaultChecked={search.mine === '1'}
              className="accent-primary size-4"
            />
            Courses I coordinate
          </label>
        )}
      </FilterForm>
      <DataTable
        bare
        columns={[
          {
            header: 'Course',
            cell: (c: CatalogRow) => (
              <Link href={`/catalog/${c.id}`} className="group grid leading-tight">
                <span className="group-hover:text-primary font-medium">{c.code}</span>
                <span className="text-muted-foreground text-xs">{c.title}</span>
              </Link>
            ),
          },
          {
            header: 'Credits',
            cell: (c) => (
              <span className="tabular-nums" title={`${creditTotal(c.credits)} credits`}>
                {formatCredits(c.credits)}
              </span>
            ),
          },
          { header: 'Type', cell: (c) => (c.type ? COURSE_TYPE_LABEL[c.type] : '—') },
          {
            header: 'Coordinator',
            cell: (c) => c.coordinator ?? <span className="text-muted-foreground">Not assigned</span>,
          },
          {
            header: 'Status',
            cell: (c) => (
              <span className="flex flex-wrap gap-1.5">
                <Badge variant={statusTone(c.status)}>{c.status}</Badge>
                {c.reviewNeeded && <Badge variant="warning">Needs review</Badge>}
              </span>
            ),
          },
        ]}
        rows={rows}
        rowKey={(c) => c.id}
        total={total}
        page={search.page}
        pageSize={pageSize}
        query={query}
        path="/catalog"
        empty={
          Object.keys(query).length > 0
            ? 'No course matches. Try fewer filters or another spelling.'
            : 'The catalogue is empty. An administrator loads it from Import courses.'
        }
      />
    </PageHeader>
  );
}
