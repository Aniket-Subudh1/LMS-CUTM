import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-48" />
      <div className="grid items-start gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="grid gap-5">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
        <div className="grid gap-5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
