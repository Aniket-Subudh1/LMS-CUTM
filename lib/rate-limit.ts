import 'server-only';
import { headers } from 'next/headers';
import { AppError } from '@/lib/errors';
import { redis } from '@/lib/queue';

export async function limit(name: string, subject: string, max: number, windowMs: number): Promise<void> {
  const window = Math.floor(Date.now() / windowMs);
  const key = `rl:${name}:${subject}:${window}`;
  const count = await redis().incr(key);
  if (count === 1) await redis().pexpire(key, windowMs);
  if (count > max) {
    const minutes = Math.ceil(((window + 1) * windowMs - Date.now()) / 60_000);
    throw new AppError('RATE_LIMITED', `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

// The load balancer overwrites X-Forwarded-For (11 §4); Next fills it from the socket when it is absent.
export async function clientIp(): Promise<string> {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
