'use client';

import { createContext, use, useActionState, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/errors';

type Result = ActionResult<unknown> | null;
const FormErrors = createContext<Partial<Record<string, string[]>> | undefined>(undefined);

export function ActionForm({
  action,
  submitLabel,
  successMessage,
  children,
}: {
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  successMessage?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<Result, FormData>((_prev, fd) => action(fd), null);
  return (
    <form action={formAction} className="form">
      {state && !state.ok && (
        <p role="alert" className="form-error">
          {state.message}
        </p>
      )}
      {state?.ok && successMessage && (
        <p role="status" className="form-success">
          {successMessage}
        </p>
      )}
      <FormErrors value={state && !state.ok ? state.fieldErrors : undefined}>{children}</FormErrors>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Please wait…' : submitLabel}
      </button>
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
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {errors?.map((e) => (
        <span key={e} className="field-error">
          {e}
        </span>
      ))}
    </label>
  );
}
