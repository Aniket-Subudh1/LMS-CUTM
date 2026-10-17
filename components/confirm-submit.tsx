'use client';

import { useRef, useState, type ReactNode } from 'react';
import { CircleNotchIcon } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

// `children` is the button that opens the dialog; confirming submits the form this component sits in.
// The dialog stays open until that form's action settles, so the confirm button cannot be pressed twice.
export function ConfirmSubmit({
  title,
  message,
  confirmLabel,
  variant = 'default',
  pending,
  children,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: 'default' | 'destructive' | 'outline';
  pending: boolean;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending) setOpen(false);
  }
  return (
    <>
      <span ref={anchor} hidden />
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
        <AlertDialogContent className="bg-card shadow-elevated ring-border rounded-lg border-0 ring-1">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant={variant}
              disabled={pending}
              aria-busy={pending}
              onClick={() => anchor.current?.closest('form')?.requestSubmit()}
            >
              {pending && <CircleNotchIcon className="animate-spin" />}
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
