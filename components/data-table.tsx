import type { ReactNode } from 'react';
import Link from 'next/link';
import { CaretLeftIcon, CaretRightIcon, TrayIcon } from '@phosphor-icons/react/ssr';
import { buttonVariants } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/cn';

type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string };

// Filters and sorting are GET parameters (04 §1): the links keep `query` and only change `page`.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  total,
  page,
  pageSize,
  query,
  path,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  query: Record<string, string>;
  path: string;
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState text={empty} />;
  return (
    <div className="surface overflow-hidden">
      <Table className="[&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead
                key={c.header}
                className={cn('text-muted-foreground h-10 text-xs font-medium tracking-wide uppercase', c.className)}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} className="hover:bg-primary/[0.03]">
              {columns.map((c) => (
                <TableCell key={c.header} className={c.className}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PageNav
        shown={rows.length}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        path={path}
        className="border-t px-4 py-3"
      />
    </div>
  );
}

export function EmptyState({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <Empty className="surface border-0">
      <EmptyHeader>
        <EmptyMedia className="icon-chip size-12 [&_svg]:size-7">{icon ?? <TrayIcon weight="duotone" />}</EmptyMedia>
        <EmptyTitle>Nothing here yet</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

// The range and Previous/Next links under a table or a card grid.
export function PageNav({
  shown,
  total,
  page,
  pageSize,
  query,
  path,
  className,
}: {
  shown: number;
  total: number;
  page: number;
  pageSize: number;
  query: Record<string, string>;
  path: string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (target: number) => {
    const params = new URLSearchParams(query);
    params.set('page', String(target));
    return `${path}?${params}`;
  };
  const first = (page - 1) * pageSize + 1;
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-muted-foreground text-sm">
        Showing{' '}
        <span className="text-foreground font-medium tabular-nums">
          {first}–{first + shown - 1}
        </span>{' '}
        of <span className="text-foreground font-medium tabular-nums">{total}</span>
      </p>
      {pages > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PageLink href={page > 1 ? href(page - 1) : null}>
                <CaretLeftIcon /> Previous
              </PageLink>
            </PaginationItem>
            <PaginationItem className="text-muted-foreground px-2 text-sm tabular-nums">
              Page {page} of {pages}
            </PaginationItem>
            <PaginationItem>
              <PageLink href={page < pages ? href(page + 1) : null}>
                Next <CaretRightIcon />
              </PageLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function PageLink({ href, children }: { href: string | null; children: ReactNode }) {
  const className = buttonVariants({ variant: 'outline', size: 'sm' });
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span aria-disabled="true" className={cn(className, 'pointer-events-none opacity-50')}>
      {children}
    </span>
  );
}
