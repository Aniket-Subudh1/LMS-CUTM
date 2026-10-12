'use client';

import { ArrowClockwiseIcon, WarningIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="surface mx-auto grid max-w-lg justify-items-center gap-4 p-8 text-center">
      <span className="bg-warning/12 text-warning grid size-14 place-items-center rounded-2xl">
        <WarningIcon weight="duotone" className="size-8" />
      </span>
      <div className="grid gap-1.5">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          Try again. If it keeps happening, contact support
          {error.digest ? ` and quote the reference ${error.digest}` : ''}.
        </p>
      </div>
      <Button onClick={() => retry()}>
        <ArrowClockwiseIcon weight="bold" /> Try again
      </Button>
    </div>
  );
}
