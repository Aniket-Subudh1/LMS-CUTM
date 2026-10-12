import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Loading from '../../loading';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { listActiveSchemes } from '@/lib/data/schemes';
import { COMPONENT_KEYS } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Evaluation schemes' };

export default function SchemesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Schemes />
    </Suspense>
  );
}

async function Schemes() {
  const active = new Map((await listActiveSchemes()).map((s) => [s.componentKey, s]));
  return (
    <>
      <PageHeader
        title="Evaluation schemes"
        description="One scheme per component combination decides how internal marks are made up. Saving a change creates a new version; offerings keep the version they were created with."
      />
      <DataTable
        columns={[
          {
            header: 'Components',
            cell: (key) => (
              <Link
                href={`/admin/schemes/${key}`}
                className="font-medium capitalize underline-offset-4 hover:underline"
              >
                {key.replaceAll('+', ' + ')}
              </Link>
            ),
          },
          {
            header: 'Active version',
            cell: (key) => {
              const scheme = active.get(key);
              return scheme ? (
                <>
                  <Badge variant="default">v{scheme.version}</Badge> <span className="ml-1">{scheme.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              );
            },
          },
          {
            header: 'Internal / external',
            cell: (key) => {
              const scheme = active.get(key);
              return scheme ? `${scheme.internalMax} / ${scheme.externalMax}` : '—';
            },
          },
        ]}
        rows={[...COMPONENT_KEYS]}
        rowKey={(key) => key}
        total={COMPONENT_KEYS.length}
        page={1}
        pageSize={COMPONENT_KEYS.length}
        query={{}}
        path="/admin/schemes"
        empty="No component combinations."
      />
    </>
  );
}
