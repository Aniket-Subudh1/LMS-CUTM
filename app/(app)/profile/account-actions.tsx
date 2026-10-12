'use client';

import { useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { ActionForm, Field } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changePassword, signOutEverywhere } from './actions';

export function AccountActions() {
  return (
    <div className="divide-y border-t">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-sm font-medium">Password</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">Changing it signs you out on every other device.</p>
        </div>
        <AccountDialog
          label="Change password"
          title="Change password"
          description="You stay signed in on this browser."
        >
          <ActionForm
            action={changePassword}
            submitLabel="Change password"
            successMessage="Your password has been changed."
          >
            <Field name="current" label="Current password">
              <Input name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field name="password" label="New password" hint="10 to 128 characters. Not your email address.">
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
              />
            </Field>
            <Field name="confirm" label="Repeat the new password">
              <Input name="confirm" type="password" autoComplete="new-password" required />
            </Field>
          </ActionForm>
        </AccountDialog>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-sm font-medium">Other devices</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">Ends every sign-in, including this browser.</p>
        </div>
        <AccountDialog
          label="Sign out everywhere"
          title="Sign out everywhere"
          description="You will need to sign in again on every device."
        >
          <ActionForm action={signOutEverywhere} submitLabel="Sign out everywhere" submitVariant="destructive" />
        </AccountDialog>
      </div>
    </div>
  );
}

function AccountDialog({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <div className="shrink-0">
      <Button type="button" variant="outline" size="sm" onClick={() => dialog.current?.showModal()}>
        {label}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="bg-popover text-popover-foreground backdrop:bg-foreground/40 relative m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border p-5 shadow-lg sm:p-6"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <h2 id={titleId} className="pr-8 text-lg font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground mt-1 mb-5 text-sm">{description}</p>
        {children}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          className="absolute top-3 right-3"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </Button>
      </dialog>
    </div>
  );
}
