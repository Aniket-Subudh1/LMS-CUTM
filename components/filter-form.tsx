'use client';

import type { ReactNode } from 'react';
import Form from 'next/form';
import { useFormStatus } from 'react-dom';
import { CircleNotchIcon, FunnelSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function FilterForm({
  action,
  submitLabel = 'Apply',
  plain = false,
  children,
}: {
  action: string;
  submitLabel?: string;
  // Without the toolbar card, for a filter step that sits inside another card or a dialog.
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <Form
      action={action}
      scroll={false}
      className={cn(
        'flex flex-wrap items-end gap-3',
        // Rounded white fields straight on the page, like the reference's filter pills.
        !plain &&
          '[&_input]:bg-card [&_select]:bg-card mb-5 [&_input]:rounded-full [&_input]:px-4 [&_select]:rounded-full [&_select]:pl-4',
      )}
    >
      {children}
      <Submit label={submitLabel} />
    </Form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="rounded-full" disabled={pending} aria-busy={pending}>
      {pending ? <CircleNotchIcon className="animate-spin" /> : <FunnelSimpleIcon weight="duotone" />}
      {label}
    </Button>
  );
}
