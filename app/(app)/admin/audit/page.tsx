import { Suspense } from 'react';
import type { Metadata } from 'next';
import { z } from 'zod';
import Loading from '../../loading';
import { SlidersHorizontalIcon } from '@phosphor-icons/react/ssr';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getAuditStats, listAudit, listAuditEntities } from '@/lib/data/audit';
import { formatDateTime } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Audit log' };

const Search = z.object({
  page: pageParam.catch(1),
  entity: z.string().trim().min(1).max(40).optional().catch(undefined),
  entityId: objectId.optional().catch(undefined),
  actorEmail: z.string().trim().min(1).max(254).optional().catch(undefined),
  offeringId: objectId.optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
});

export default function AuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: { searchParams: PageProps<'/admin/audit'>['searchParams'] }) {
  const { page, ...filters } = Search.parse(await searchParams);
  const [{ rows, total }, stats, entities] = await Promise.all([
    listAudit(page, filters),
    getAuditStats(),
    listAuditEntities(),
  ]);
  const query = Object.fromEntries(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return (
    <PageHeader
      icon={<PageIcon name="audit" />}
      title="Audit log"
      description="Every change to marks, structure and access, newest first. Dates are in IST."
      stats={[
        { label: 'Entries', value: stats.total, icon: <PageIcon name="audit" className="size-7" /> },
        { label: 'Today', value: stats.today, icon: <PageIcon name="terms" className="size-7" /> },
        { label: 'Last 7 days', value: stats.week, icon: <PageIcon name="audit" className="size-7" /> },
        { label: 'People in the last 7 days', value: stats.people, icon: <PageIcon name="users" className="size-7" /> },
      ]}
    >
      <FilterForm
        action="/admin/audit"
        submitLabel="Search"
        search={{
          name: 'actorEmail',
          label: 'Email of the person who made the change',
          placeholder: 'Search by email',
          defaultValue: filters.actorEmail,
        }}
      >
        <NativeSelect name="entity" aria-label="Kind of record" defaultValue={filters.entity ?? ''}>
          <NativeSelectOption value="">All records</NativeSelectOption>
          {entities.map((e) => (
            <NativeSelectOption key={e} value={e}>
              {entityLabel(e)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input name="from" type="date" aria-label="From" defaultValue={filters.from ?? ''} />
        <Input name="to" type="date" aria-label="To" defaultValue={filters.to ?? ''} />
        {/* The record and offering ids (M01) are for links from other pages; they stay out of the way until needed. */}
        <details className="relative" open={Boolean(filters.entityId || filters.offeringId)}>
          <summary className="ring-border bg-card hover:bg-muted flex h-8 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-sm ring-1 transition-colors [&::-webkit-details-marker]:hidden">
            <SlidersHorizontalIcon className="size-4" /> More filters
          </summary>
          <div className="bg-popover ring-border absolute right-0 z-10 mt-2 grid w-72 gap-3 rounded-md p-3 ring-1">
            <label className="grid gap-1.5 text-sm font-medium">
              Record id
              <Input name="entityId" defaultValue={filters.entityId ?? ''} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Offering id
              <Input name="offeringId" defaultValue={filters.offeringId ?? ''} />
            </label>
            <p className="text-muted-foreground text-xs">Press Enter to apply.</p>
          </div>
        </details>
      </FilterForm>
      <DataTable
        bare
        columns={[
          {
            header: 'When',
            cell: (a) => <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(a.at)}</span>,
          },
          { header: 'Person', cell: (a) => a.actor },
          { header: 'Action', cell: (a) => <span className="font-medium">{a.action}</span> },
          {
            header: 'Record',
            cell: (a) => (
              <span className="grid leading-tight">
                <span>{entityLabel(a.entity)}</span>
                <span className="text-muted-foreground font-mono text-xs">{a.entityId}</span>
              </span>
            ),
          },
          { header: 'Reason', cell: (a) => a.reason ?? '—' },
          { header: 'Change', cell: (a) => <Change before={a.before} after={a.after} /> },
        ]}
        rows={rows}
        rowKey={(a) => a.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        path="/admin/audit"
        empty="No audit entries match these filters."
      />
    </PageHeader>
  );
}

// "course_list" → "Course list".
const entityLabel = (entity: string) => {
  const words = entity.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function Change({ before, after }: { before: unknown; after: unknown }) {
  if (before === undefined && after === undefined) return '—';
  const show = (value: unknown) => JSON.stringify(value) ?? '—';
  return (
    <details>
      <summary className="max-w-64 cursor-pointer truncate font-mono text-xs">{show(after ?? before)}</summary>
      <dl className="mt-2 grid gap-1 font-mono text-xs break-all">
        {before !== undefined && (
          <div>
            <dt className="text-muted-foreground">Before</dt>
            <dd>{show(before)}</dd>
          </div>
        )}
        {after !== undefined && (
          <div>
            <dt className="text-muted-foreground">After</dt>
            <dd>{show(after)}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}
