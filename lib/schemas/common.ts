import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const page = z.coerce.number().int().min(1).max(10_000).default(1);
export const pageSize = 25;

// A calendar date typed into <input type="date">; the action turns it into 00:00 IST with istDateToDate (06 §2).
export const istDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date.')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Enter a real date.');

export const ROLES = ['admin', 'hod', 'faculty', 'student', 'support'] as const;
export type Role = (typeof ROLES)[number];
