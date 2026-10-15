'use client';

import {
  createContext,
  startTransition,
  use,
  useActionState,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CheckCircleIcon, CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { ActionResult } from '@/lib/errors';

type Result = ActionResult<unknown> | null;
const FormErrors = createContext<Partial<Record<string, string[]>> | undefined>(undefined);
const noSubscription = () => () => {};

export function ActionForm({
  action,
  submitLabel,
  successMessage,
  submitVariant = 'default',
  submitSize = 'default',
  submitIcon,
  iconOnly = false,
  fullWidth = false,
  confirm,
  replaceOnSuccess = false,
  onSuccess,
  onPendingChange,
  secondary,
  children,
}: {
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  successMessage?: string;
  submitVariant?: 'default' | 'destructive' | 'outline';
  submitSize?: 'default' | 'sm';
  // An icon before the label; with `iconOnly` the label becomes the button's accessible name and tooltip.
  submitIcon?: ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
  // Asks first: the submit button opens a dialog and only its confirm button submits the form.
  confirm?: { title: string; message: string };
  replaceOnSuccess?: boolean;
  onSuccess?: (data: unknown) => void;
  onPendingChange?: (pending: boolean) => void;
  secondary?: ReactNode;
  children?: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<Result, FormData>(async (_prev, fd) => {
    const result = await action(fd);
    if (result.ok) {
      form.current?.reset();
      onSuccess?.(result.data);
    }
    return result;
  }, null);
  useEffect(() => onPendingChange?.(pending), [pending, onPendingChange]);
  // Before hydration onSubmit is not attached: a native submit would send the fields (a password) in the URL.
  // The button stays disabled until then, which also blocks Enter; method="post" keeps fields out of the URL regardless.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (replaceOnSuccess && state?.ok) return <SuccessState message={successMessage ?? 'Saved.'} />;
  const submit = (
    <Button
      type={confirm ? 'button' : 'submit'}
      variant={submitVariant}
      size={iconOnly ? 'icon-sm' : submitSize}
      disabled={pending || !hydrated}
      aria-busy={pending}
      aria-label={iconOnly ? submitLabel : undefined}
      title={iconOnly ? submitLabel : undefined}
      className={cn(fullWidth && 'h-10 w-full')}
    >
      {pending ? <CircleNotchIcon className="animate-spin" /> : submitIcon}
      {!iconOnly && submitLabel}
    </Button>
  );
  // `<form action>` would make React clear every field after each submit, including a failed one.
  return (
    <form
      ref={form}
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="grid gap-5"
    >
      {state && !state.ok && (
        <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
          <WarningCircleIcon weight="duotone" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state?.ok && successMessage && (
        <Alert role="status" className="border-success/25 bg-success/5 text-success">
          <CheckCircleIcon weight="duotone" />
          <AlertDescription className="text-success">{successMessage}</AlertDescription>
        </Alert>
      )}
      <FormErrors value={state && !state.ok ? state.fieldErrors : undefined}>
        <fieldset
          disabled={pending}
          className="grid min-w-0 gap-5 transition-opacity not-has-[>:not([type=hidden])]:hidden disabled:opacity-60"
        >
          {children}
        </fieldset>
      </FormErrors>
      <div data-slot="form-footer" className={cn('flex flex-wrap items-center gap-2', secondary && 'justify-end')}>
        {secondary}
        {confirm ? (
          <ConfirmSubmit {...confirm} confirmLabel={submitLabel} variant={submitVariant} pending={pending}>
            {submit}
          </ConfirmSubmit>
        ) : (
          submit
        )}
      </div>
    </form>
  );
}

function SuccessState({ message }: { message: string }) {
  return (
    <div role="status" className="grid justify-items-center gap-4 py-8 text-center">
      <svg viewBox="0 0 52 52" aria-hidden="true" className="text-success motion-safe:animate-success-pop size-16">
        <circle cx="26" cy="26" r="25" fill="currentColor" opacity="0.12" />
        <circle cx="26" cy="26" r="19" fill="currentColor" />
        <path
          d="M17 26.5l6 6 12-13"
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          className="motion-safe:animate-success-draw"
        />
      </svg>
      <p className="max-w-sm text-base font-semibold text-balance">{message}</p>
    </div>
  );
}

export function Field({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const errors = use(FormErrors)?.[name];
  return (
    <div className="grid content-start gap-2">
      <label className="grid gap-2">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
      {hint && <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} className="text-destructive text-sm">
          {e}
        </p>
      ))}
    </div>
  );
}

// For a group of controls that share one error list (a grid of rows), where `Field`'s single <label> does not fit.
export function FieldErrors({ name }: { name: string }) {
  const errors = use(FormErrors)?.[name];
  return errors?.map((e) => (
    <p key={e} className="text-destructive text-sm">
      {e}
    </p>
  ));
}
