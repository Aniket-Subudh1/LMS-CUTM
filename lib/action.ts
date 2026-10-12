import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { getViewer, type Viewer } from '@/lib/auth/session';
import { AppError, type ActionResult } from '@/lib/errors';
import { log } from '@/lib/log';
import type { Role } from '@/lib/schemas/common';

function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    const values = fd.getAll(key);
    out[key] = key.endsWith('[]') || values.length > 1 ? values : values[0];
  }
  return out;
}

async function settle<R>(work: () => Promise<ActionResult<R>>): Promise<ActionResult<R>> {
  try {
    return await work();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) {
      return { ok: false, code: error.code, message: error.message, fieldErrors: error.fieldErrors };
    }
    const errorId = crypto.randomUUID();
    log.error('action failed', { errorId, error });
    return { ok: false, code: 'INTERNAL', message: `Something went wrong. Reference: ${errorId}` };
  }
}

async function validated<S extends z.ZodType, R>(
  schema: S,
  raw: unknown,
  run: (input: z.infer<S>) => Promise<R>,
): Promise<ActionResult<R>> {
  const parsed = schema.safeParse(raw instanceof FormData ? formDataToObject(raw) : raw);
  if (!parsed.success) {
    const { fieldErrors, formErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      code: 'VALIDATION',
      message: formErrors[0] ?? 'Please correct the highlighted fields.',
      fieldErrors,
    };
  }
  return { ok: true, data: await run(parsed.data) };
}

export function action<S extends z.ZodType, R>(
  config: { input: S; roles: readonly Role[] },
  run: (input: z.infer<S>, viewer: Viewer) => Promise<R>,
) {
  return async (raw: z.input<S> | FormData): Promise<ActionResult<R>> =>
    settle(async () => {
      const viewer = await getViewer();
      if (!viewer) return { ok: false, code: 'UNAUTHENTICATED', message: 'Please sign in again.' };
      if (!viewer.roles.some((r) => config.roles.includes(r))) {
        return { ok: false, code: 'FORBIDDEN', message: 'You do not have access to this action.' };
      }
      return validated(config.input, raw, (input) => run(input, viewer));
    });
}

// Only for actions that run before sign-in (login, password reset).
export function publicAction<S extends z.ZodType, R>(input: S, run: (input: z.infer<S>) => Promise<R>) {
  return async (raw: z.input<S> | FormData): Promise<ActionResult<R>> => settle(() => validated(input, raw, run));
}
