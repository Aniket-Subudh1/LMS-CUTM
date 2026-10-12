'use client';

import { useLinkStatus } from 'next/link';
import { CircleNotchIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';

// Must sit inside a <Link>: it shows while that link's navigation is pending. Fixed size, so nothing shifts.
export function LinkSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <CircleNotchIcon
      aria-hidden="true"
      className={cn(
        'size-4 shrink-0 transition-opacity',
        pending ? 'animate-spin opacity-100' : 'opacity-0',
        className,
      )}
    />
  );
}
