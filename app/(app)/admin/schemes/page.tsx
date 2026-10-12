import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon, SlidersHorizontalIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../loading';
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
        icon={<SlidersHorizontalIcon weight="duotone" />}
        title="Evaluation schemes"
        description="One scheme per component combination decides how internal marks are made up. Saving a change creates a new version; offerings keep the version they were created with."
      />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
        {COMPONENT_KEYS.map((key) => {
          const scheme = active.get(key);
          return (
            <li key={key}>
              <Link href={`/admin/schemes/${key}`} className="surface-interactive group flex h-full flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="icon-chip size-11 [&_svg]:size-6">
                    <SlidersHorizontalIcon weight="duotone" />
                  </span>
                  {scheme ? (
                    <Badge variant="success">v{scheme.version} active</Badge>
                  ) : (
                    <Badge variant="warning">Not set</Badge>
                  )}
                </div>
                <div className="grid gap-1">
                  <p className="font-semibold capitalize">{key.replaceAll('+', ' + ')}</p>
                  <p className="text-muted-foreground text-sm">
                    {scheme
                      ? `${scheme.name} · internal ${scheme.internalMax} / external ${scheme.externalMax}`
                      : 'No scheme yet: UGC offerings of these courses cannot be created.'}
                  </p>
                </div>
                <span className="text-primary mt-auto flex items-center gap-1.5 text-sm font-medium">
                  {scheme ? 'View versions' : 'Create the first version'}
                  <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
