import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="grid gap-7" aria-busy="true" aria-label="Loading">
      <div className="grid gap-3">
        <Skeleton className="size-11 rounded-lg" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="h-10" />
      </div>
    </div>
  );
}
