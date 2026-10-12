import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const ROLES = ['admin', 'hod', 'faculty', 'student', 'support'] as const;
export type Role = (typeof ROLES)[number];
