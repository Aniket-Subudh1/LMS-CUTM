import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

// TP-03: a guest's 6-digit email code. Only its keyed hash is stored, bound to the address and the link it was asked
// for, so a leaked database row neither reveals the code nor works for another link.
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_TRIES = 5;

const digest = (value: string) => createHmac('sha256', env().SESSION_PASSWORD).update(value).digest();

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function codeHash(email: string, linkId: string, code: string): string {
  return digest(`otp:${email}:${linkId}:${code}`).toString('hex');
}

export function codeMatches(hash: string, email: string, linkId: string, code: string): boolean {
  return timingSafeEqual(Buffer.from(hash, 'hex'), digest(`otp:${email}:${linkId}:${code}`));
}

// A link's access code, compared in constant time (both sides hashed, so their lengths match).
export function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(digest(`code:${a}`), digest(`code:${b}`));
}
