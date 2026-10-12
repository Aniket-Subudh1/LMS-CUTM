import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
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
  if (rows.length === 0) {
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (target: number) => {
    const params = new URLSearchParams(query);
    params.set('page', String(target));
    return `${path}?${params}`;
  };
  const first = (page - 1) * pageSize + 1;
  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.header} className={c.className}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((c) => (
                <TableCell key={c.header} className={c.className}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {first}–{first + rows.length - 1} of {total}
        </p>
        {pages > 1 && (
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PageLink href={page > 1 ? href(page - 1) : null}>
                  <ChevronLeft /> Previous
                </PageLink>
              </PaginationItem>
              <PaginationItem className="text-muted-foreground px-2 text-sm">
                Page {page} of {pages}
              </PaginationItem>
              <PaginationItem>
                <PageLink href={page < pages ? href(page + 1) : null}>
                  Next <ChevronRight />
                </PageLink>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
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
