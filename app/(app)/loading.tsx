import { Skeleton } from '@/components/ui/skeleton';

// Shaped like a list page (PageHeader, filter bar, table) so content does not jump when it arrives.
export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-wrap items-center justify-between gap-4 lg:mb-2">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-lg max-sm:hidden" />
          <div className="grid gap-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72 max-w-[60vw]" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="surface flex flex-wrap items-end gap-3 p-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="surface overflow-hidden">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-t px-4 py-3.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20 max-sm:hidden" />
            <Skeleton className="h-5 w-16 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
