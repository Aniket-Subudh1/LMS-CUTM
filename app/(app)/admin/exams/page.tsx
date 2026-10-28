import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LockSimpleIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getExamsTerm, type ExamsTerm } from '@/lib/data/exams';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Exams' };

const Search = z.object({ page: pageParam.catch(1), term: objectId.optional().catch(undefined) });

export default function ExamsPage({ searchParams }: PageProps<'/admin/exams'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Exams searchParams={searchParams} />
    </Suspense>
  );
}

// M08 (mock-up E1): a term's batches with credit courses, each with how far it has got; a batch's page does the work.
async function Exams({ searchParams }: { searchParams: PageProps<'/admin/exams'>['searchParams'] }) {
  const { page, term } = Search.parse(await searchParams);
  const view = await getExamsTerm(term, page);
  const query: Record<string, string> = view.termId ? { term: view.termId } : {};
  const tiles: { icon: ReactNode; value: string; label: string }[] = [
    {
      icon: <PageIcon name="users" className="size-7" />,
      value: String(view.totals.batches),
      label: 'Batches this term',
    },
    {
      icon: <LockSimpleIcon className="size-[1.125rem]" />,
      value: `${view.totals.locked} of ${view.totals.courses}`,
      label: 'Courses locked',
    },
    {
      icon: <PageIcon name="exams" className="size-7" />,
      value: String(view.totals.ready),
      label: 'Grade sheets ready',
    },
    {
      icon: <PageIcon name="results" className="size-7" />,
      value: String(view.totals.published),
      label: 'Grade sheets published',
    },
  ];
  return (
    <PageHeader
      icon={<PageIcon name="exams" />}
      title="Exams"
      description="Lock each batch’s internal marks, exchange them with the exam section, and publish grade sheets."
    >
      <FilterForm action="/admin/exams">
        <NativeSelect name="term" aria-label="Term" defaultValue={view.termId ?? ''}>
          {view.terms.map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FilterForm>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
            <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
              {tile.icon}
            </span>
            <div className="grid min-w-0">
              <dd className="text-lg leading-tight font-semibold tabular-nums">{tile.value}</dd>
              <dt className="text-muted-foreground order-first truncate text-xs">{tile.label}</dt>
            </div>
          </div>
        ))}
      </dl>
      <DataTable
        bare
        columns={[
          { header: 'Batch', cell: (b) => <span className="font-semibold">{b.name}</span> },
          { header: 'Students', cell: (b) => <span className="tabular-nums">{b.students}</span> },
          {
            header: 'Courses locked',
            cell: (b) => (
              <span className="tabular-nums">
                {b.locked} of {b.courses}
              </span>
            ),
          },
          {
            header: 'End-sem marks',
            cell: (b) => (
              <span className="tabular-nums">
                {b.marks.done} of {b.marks.of}
              </span>
            ),
          },
          { header: 'Grade sheets', cell: (b) => <Sheets counts={b.sheets} /> },
          {
            header: '',
            className: 'w-20',
            cell: (b) => (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/exams/${b.id}${view.termId ? `?term=${view.termId}` : ''}`}>Open</Link>
              </Button>
            ),
          },
        ]}
        rows={view.rows}
        rowKey={(b) => b.id}
        total={view.total}
        page={page}
        pageSize={pageSize}
        query={query}
        path="/admin/exams"
        empty="No batch has a credit course this term."
      />
    </PageHeader>
  );
}

function Sheets({ counts }: { counts: ExamsTerm['rows'][number]['sheets'] }) {
  if (counts.published > 0 && counts.draft + counts.incomplete === 0) {
    return (
      <Badge variant="success" className="normal-case">
        {counts.published} published
      </Badge>
    );
  }
  if (counts.draft + counts.incomplete > 0) {
    return (
      <Badge variant={counts.incomplete > 0 ? 'warning' : 'success'} className="normal-case">
        {[
          counts.draft > 0 && `${counts.draft} ready`,
          counts.incomplete > 0 && `${counts.incomplete} incomplete`,
          counts.published > 0 && `${counts.published} published`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Badge>
    );
  }
  return <span className="text-muted-foreground text-xs">Not worked out</span>;
}
