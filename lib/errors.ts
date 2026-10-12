export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'LOCKED',
  'CLOSED',
  'RATE_LIMITED',
  'INTEGRATION',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    // Per-field messages for failures found after parsing (for example, the rows of a rejected CSV).
    readonly fieldErrors?: Partial<Record<string, string[]>>,
  ) {
    super(message);
  }
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: Partial<Record<string, string[]>> };
