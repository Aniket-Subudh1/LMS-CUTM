import { Skeleton } from '@/components/ui/skeleton';

// The shape every role's Home shares: the greeting, the quick actions, then the two columns.
export default function Loading() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-36 rounded-md" />
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4">
          <Skeleton className="h-64 rounded-md" />
          <Skeleton className="h-52 rounded-md" />
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-44 rounded-md" />
          <Skeleton className="h-13 rounded-md" />
        </div>
      </div>
    </div>
  );
}
