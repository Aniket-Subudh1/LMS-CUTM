import 'server-only';
import { sealData, unsealData } from 'iron-session';
import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { User } from '@/lib/models/user';

const TTL_SEC = { reset: 30 * 60, invite: 7 * 24 * 60 * 60 } as const;
export type TokenPurpose = keyof typeof TTL_SEC;

const TokenData = z.object({ uid: z.string(), sv: z.number().int(), purpose: z.enum(['reset', 'invite']) });
export type TokenData = z.infer<typeof TokenData>;

export function createToken(data: TokenData): Promise<string> {
  return sealData(data, { password: env().SESSION_PASSWORD, ttl: TTL_SEC[data.purpose] });
}

// An invalid, tampered or expired token is an expected outcome, reported as null.
export async function readToken(token: string, purposes: readonly TokenPurpose[]): Promise<TokenData | null> {
  try {
    const parsed = TokenData.safeParse(await unsealData(token, { password: env().SESSION_PASSWORD }));
    return parsed.success && purposes.includes(parsed.data.purpose) ? parsed.data : null;
  } catch (error) {
    log.debug('token rejected', { error });
    return null;
  }
}

// Setting a password bumps sessionVersion, so a used (or superseded) link no longer matches its user.
export async function isTokenCurrent(data: TokenData): Promise<boolean> {
  await db();
  const user = await User.exists({ _id: data.uid, sessionVersion: data.sv, status: { $in: ['active', 'invited'] } });
  return user !== null;
}
