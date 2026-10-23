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

const SIZE = { default: 'sm:max-w-xl', wide: 'sm:max-w-3xl', full: 'sm:max-w-6xl' } as const;
const SUCCESS_MS = 1600;
// The design Aniket chose on 13 Oct 2026 ("A · Clean"): a header with a hairline under it, a body that scrolls on its
// own, and a grey button bar that stays at the bottom. On phones the dialog is a full-width sheet from the bottom.
const FRAME = cn(
  'bg-card shadow-elevated ring-border flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-lg border-0 p-0 ring-1',
  'max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:data-[state=open]:slide-in-from-bottom-10',
  '[&>[data-slot=dialog-close]]:hover:bg-muted [&>[data-slot=dialog-close]]:top-4 [&>[data-slot=dialog-close]]:right-4 [&>[data-slot=dialog-close]]:rounded-lg [&>[data-slot=dialog-close]]:p-1.5',
);
// Fields take the full width (a select no longer sizes itself to its longest option and spills over the edge),
// and the button bar sticks to the bottom of the scrolling body.
const BODY = cn(
  'min-h-0 flex-1 overflow-y-auto overscroll-contain [&>form]:px-6 [&>form]:pt-5 [&>[role=status]]:px-6',
  '[&_fieldset>*]:min-w-0 [&_[data-slot=native-select-wrapper]]:w-full',
  '[&_[data-slot=form-footer]]:bg-background [&_[data-slot=form-footer]]:sticky [&_[data-slot=form-footer]]:bottom-0 [&_[data-slot=form-footer]]:z-10 [&_[data-slot=form-footer]]:-mx-6 [&_[data-slot=form-footer]]:mt-1 [&_[data-slot=form-footer]]:justify-end [&_[data-slot=form-footer]]:border-t [&_[data-slot=form-footer]]:px-6 [&_[data-slot=form-footer]]:py-3.5',
);

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
  // Absent for a dialog the page mounts only while `?new=<openParam>` is in the URL (a row menu's "Edit…" link).
  trigger?: ReactNode;
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
  const wanted = openParam !== undefined && params.get('new') === openParam;
  const [open, setOpen] = useState(wanted);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  // Next keeps a visited page mounted but hidden and restores its state. A fresh navigation back to it (a `?new=`
  // link from Home, again) gets a new bfcacheId, and the dialog starts over from the URL.
  const [visit, setVisit] = useState(router.bfcacheId);
  if (visit !== router.bfcacheId) {
    setVisit(router.bfcacheId);
    setOpen(wanted);
    setDone(false);
  }

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
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        showCloseButton={!pending && !done}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(FRAME, SIZE[size])}
      >
        <DialogHeader
          className={cn('shrink-0 flex-row items-start gap-4 border-b px-6 py-5 pr-14 text-left', done && 'sr-only')}
        >
          {icon && <span className="icon-chip size-11 [&_svg]:size-6">{icon}</span>}
          <div className="grid min-w-0 gap-1">
            <DialogTitle className="text-lg leading-snug">{title}</DialogTitle>
            {description && <DialogDescription className="leading-relaxed">{description}</DialogDescription>}
          </div>
        </DialogHeader>
        <div className={BODY}>
          {!done && preface && <div className="border-b px-6 py-4">{preface}</div>}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
