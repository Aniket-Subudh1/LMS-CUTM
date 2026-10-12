import { Suspense } from 'react';
import type { Metadata } from 'next';
import { z } from 'zod';
import Loading from '../../loading';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listAudit } from '@/lib/data/audit';
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
  const { rows, total } = await listAudit(page, filters);
  const query = Object.fromEntries(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change to marks, structure and access, newest first. Dates are in IST."
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        {(
          [
            ['entity', 'Entity', 'text', 'w-36'],
            ['entityId', 'Entity id', 'text', 'w-56'],
            ['actorEmail', 'Actor email', 'text', 'w-56'],
            ['offeringId', 'Offering id', 'text', 'w-56'],
            ['from', 'From', 'date', 'w-40'],
            ['to', 'To', 'date', 'w-40'],
          ] as const
        ).map(([name, label, type, width]) => (
          <label key={name} className="grid gap-1.5 text-sm font-medium">
            {label}
            <Input name={name} type={type} defaultValue={filters[name] ?? ''} className={width} />
          </label>
        ))}
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <DataTable
        columns={[
          { header: 'When', cell: (a) => <span className="whitespace-nowrap">{formatDateTime(a.at)}</span> },
          { header: 'Actor', cell: (a) => a.actor },
          { header: 'Action', cell: (a) => <span className="font-medium">{a.action}</span> },
          { header: 'Entity', cell: (a) => `${a.entity} ${a.entityId}` },
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
    </>
  );
}

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
