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
  bare = false,
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
  // Inside a PageHeader card, which already draws the card.
  bare?: boolean;
}) {
  if (rows.length === 0) return bare ? <EmptyMessage text={empty} /> : <EmptyState text={empty} />;
  return (
    <div className={cn('grid gap-3', !bare && 'surface p-3 sm:p-4')}>
      {/* A grey header band over striped rows with hairlines between them (design B, 17 Oct 2026). */}
      <Table className="border-separate border-spacing-0 [&_td]:px-3.5 [&_td]:py-3 [&_td]:whitespace-normal [&_th]:px-3.5">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead
                key={c.header}
                className={cn(
                  'bg-muted text-muted-foreground h-9 text-xs font-medium first:rounded-l-lg last:rounded-r-lg',
                  c.className,
                )}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              className="even:[&>td]:bg-muted/40 [&:hover>td]:bg-primary/[0.04] [&>td]:border-border/70 border-0 hover:bg-transparent [&:not(:last-child)>td]:border-b"
            >
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
        className="border-t px-1 pt-3"
      />
    </div>
  );
}

// The empty sentence inside a card that already has its header.
function EmptyMessage({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
      <TrayIcon weight="duotone" className="size-5 shrink-0" />
      {text}
    </p>
  );
}

export function EmptyState({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <Empty className="surface border-0">
      <EmptyHeader>
        <EmptyMedia className="icon-chip size-14 [&_svg]:size-7">{icon ?? <TrayIcon weight="duotone" />}</EmptyMedia>
        <EmptyTitle>Nothing here yet</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

// The range, then Previous, the page numbers around the current one (the first and last always) and Next.
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
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-muted-foreground text-sm">
        Showing{' '}
        <span className="text-foreground font-medium tabular-nums">
          {total === 0 ? 0 : first}–{first + shown - 1}
        </span>{' '}
        of <span className="text-foreground font-medium tabular-nums">{total}</span>
      </p>
      <Pagination className="mx-0 w-auto">
        <PaginationContent className="gap-1.5">
          <PaginationItem>
            <PageLink href={page > 1 ? href(page - 1) : null} label="Previous page">
              <CaretLeftIcon />
            </PageLink>
          </PaginationItem>
          {numbers.map((n, i) => (
            <PaginationItem key={n} className="flex items-center gap-1.5">
              {i > 0 && n - numbers[i - 1] > 1 && <span className="text-muted-foreground px-0.5">…</span>}
              {n === page ? (
                <span
                  aria-current="page"
                  className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-medium tabular-nums"
                >
                  {n}
                </span>
              ) : (
                <PageLink href={href(n)} label={`Page ${n}`}>
                  {n}
                </PageLink>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <PageLink href={page < pages ? href(page + 1) : null} label="Next page">
              <CaretRightIcon />
            </PageLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: ReactNode }) {
  const className = cn(
    buttonVariants({ variant: 'outline', size: 'icon-sm' }),
    'rounded-lg text-sm font-medium tabular-nums',
  );
  return href ? (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  ) : (
    <span aria-disabled="true" aria-label={label} className={cn(className, 'pointer-events-none opacity-40')}>
      {children}
    </span>
  );
}
