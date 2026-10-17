'use client';

import type { FormEvent, ReactNode } from 'react';
import Form from 'next/form';
import { useFormStatus } from 'react-dom';
import { CircleNotchIcon, FunnelSimpleIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// A list's toolbar (design B, 17 Oct 2026): the search box on the left, the filters as pills on the right. A filter
// applies as soon as it changes; the search applies on Enter. `plain` keeps labelled fields and a visible button, for a
// filter step inside another card or a dialog.
export function FilterForm({
  action,
  search,
  submitLabel = 'Apply',
  plain = false,
  children,
}: {
  action: string;
  search?: { name: string; label: string; placeholder: string; defaultValue?: string };
  submitLabel?: string;
  plain?: boolean;
  children?: ReactNode;
}) {
  if (plain) {
    return (
      <Form action={action} scroll={false} className="flex flex-wrap items-end gap-3">
        {children}
        <Submit label={submitLabel} />
      </Form>
    );
  }
  return (
    <Form
      action={action}
      scroll={false}
      onChange={applyFilter}
      className="[&_select]:bg-card [&_input[type=date]]:bg-card flex flex-wrap items-center gap-2 [&_input[type=date]]:h-9 [&_input[type=date]]:w-auto [&_input[type=date]]:rounded-full [&_input[type=date]]:px-4 [&_select]:h-9 [&_select]:rounded-full [&_select]:pl-4"
    >
      {search && <SearchField {...search} />}
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {children}
        {!search && <Pending />}
      </div>
      <button type="submit" className="sr-only">
        {submitLabel}
      </button>
    </Form>
  );
}

// Selects, checkboxes and dates apply at once; text boxes wait for Enter, so typing does not reload the list.
function applyFilter(event: FormEvent<HTMLFormElement>) {
  const field = event.target;
  if (
    field instanceof HTMLSelectElement ||
    (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'date'))
  ) {
    event.currentTarget.requestSubmit();
  }
}

function SearchField({
  name,
  label,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <label className="relative w-full sm:w-80">
      <span className="sr-only">{label}</span>
      {pending ? (
        <CircleNotchIcon className="text-muted-foreground absolute top-1/2 left-3.5 size-4 -translate-y-1/2 animate-spin" />
      ) : (
        <MagnifyingGlassIcon className="text-muted-foreground absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
      )}
      <Input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={100}
        className="bg-muted focus-visible:bg-card rounded-full border-transparent pl-10"
      />
    </label>
  );
}

function Pending() {
  const { pending } = useFormStatus();
  return (
    <CircleNotchIcon
      aria-hidden="true"
      className={pending ? 'text-muted-foreground size-4 animate-spin' : 'size-4 opacity-0'}
    />
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
