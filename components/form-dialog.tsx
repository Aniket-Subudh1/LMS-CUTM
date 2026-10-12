'use client';

import { useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import type { ActionResult } from '@/lib/errors';

const SIZE = { default: 'sm:max-w-lg', wide: 'sm:max-w-3xl', full: 'sm:max-w-6xl' } as const;
const SUCCESS_MS = 1600;
// The footer stays in view while a long form scrolls inside the dialog.
const STICKY_FOOTER =
  '[&_[data-slot=form-footer]]:bg-card [&_[data-slot=form-footer]]:sticky [&_[data-slot=form-footer]]:bottom-0 [&_[data-slot=form-footer]]:-mx-6 [&_[data-slot=form-footer]]:-mb-6 [&_[data-slot=form-footer]]:border-t [&_[data-slot=form-footer]]:px-6 [&_[data-slot=form-footer]]:py-4';

function nextOf(data: unknown) {
  return typeof data === 'object' && data !== null && 'next' in data && typeof data.next === 'string'
    ? data.next
    : null;
}

export function FormDialog({
  trigger,
  title,
  description,
  icon,
  size = 'default',
  openParam,
  preface,
  action,
  submitLabel,
  successMessage,
  submitVariant,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  icon?: ReactNode;
  size?: keyof typeof SIZE;
  openParam?: string;
  // Rendered above the form, outside it: a GET step (pick a programme) that reloads the options the form needs.
  preface?: ReactNode;
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  successMessage: string;
  submitVariant?: 'default' | 'destructive';
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(() => openParam !== undefined && params.get('new') === openParam);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  function close() {
    setOpen(false);
    if (openParam === undefined || params.get('new') !== openParam) return;
    const rest = new URLSearchParams(params);
    rest.delete('new');
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) return close();
        setDone(false);
        setOpen(true);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={!pending && !done}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'bg-card shadow-elevated ring-border max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-2xl border-0 ring-1',
          STICKY_FOOTER,
          SIZE[size],
        )}
      >
        <DialogHeader className={cn('flex-row items-start gap-4 pr-6 text-left', done && 'sr-only')}>
          {icon && <span className="icon-chip size-11 [&_svg]:size-6">{icon}</span>}
          <div className="grid gap-1">
            <DialogTitle className="text-lg">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </DialogHeader>
        {!done && preface}
        <ActionForm
          action={action}
          submitLabel={submitLabel}
          successMessage={successMessage}
          submitVariant={submitVariant}
          replaceOnSuccess
          onPendingChange={setPending}
          onSuccess={(data) => {
            setDone(true);
            const next = nextOf(data);
            setTimeout(() => {
              close();
              if (next) router.push(next);
            }, SUCCESS_MS);
          }}
          secondary={
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
          }
        >
          {children}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
