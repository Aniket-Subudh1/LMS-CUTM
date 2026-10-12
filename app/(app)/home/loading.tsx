import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="grid gap-6 lg:gap-8" aria-busy="true" aria-label="Loading">
      <div className="surface grid gap-2.5 p-5 sm:p-7">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 sm:gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="surface grid gap-4 p-4 sm:p-5">
            <Skeleton className="size-10 rounded-lg" />
            <div className="grid gap-1.5">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4">
          <Skeleton className="h-10 w-56" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
