'use client';

import {
  createContext,
  startTransition,
  use,
  useActionState,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  fullWidth = false,
  children,
}: {
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  successMessage?: string;
  submitVariant?: 'default' | 'destructive';
  fullWidth?: boolean;
  children?: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<Result, FormData>(async (_prev, fd) => {
    const result = await action(fd);
    if (result.ok) form.current?.reset();
    return result;
  }, null);
  // Before hydration onSubmit is not attached: a native submit would send the fields (a password) in the URL.
  // The button stays disabled until then, which also blocks Enter; method="post" keeps fields out of the URL regardless.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
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
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state?.ok && successMessage && (
        <Alert role="status" className="border-success/30 text-success">
          <CircleCheck />
          <AlertDescription className="text-success">{successMessage}</AlertDescription>
        </Alert>
      )}
      <FormErrors value={state && !state.ok ? state.fieldErrors : undefined}>{children}</FormErrors>
      <Button
        type="submit"
        variant={submitVariant}
        disabled={pending || !hydrated}
        className={cn(fullWidth ? 'w-full' : 'justify-self-start')}
      >
        {pending && <LoaderCircle className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
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
    <div className="grid gap-2">
      <label className="grid gap-2">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
      {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} className="text-destructive text-sm">
          {e}
        </p>
      ))}
    </div>
  );
}
