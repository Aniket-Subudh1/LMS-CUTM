import 'server-only';
import { headers } from 'next/headers';
import { AppError } from '@/lib/errors';
import { redis } from '@/lib/queue';

// Returns `refund`: an attempt is counted before the check (so parallel guesses are limited) and a caller that
// limits failures only (login) gives the slot back on success.
export async function limit(name: string, subject: string, max: number, windowMs: number) {
  const key = `rl:${name}:${subject}:${Math.floor(Date.now() / windowMs)}`;
  const count = await redis().incr(key);
  if (count === 1) await redis().pexpire(key, windowMs);
  if (count > max) {
    const minutes = Math.ceil((windowMs - (Date.now() % windowMs)) / 60_000);
    throw new AppError('RATE_LIMITED', `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
  return { refund: () => redis().multi().decr(key).pexpire(key, windowMs).exec() };
}

// The load balancer overwrites X-Forwarded-For (11 §4); Next fills it from the socket when it is absent.
export async function clientIp(): Promise<string> {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
