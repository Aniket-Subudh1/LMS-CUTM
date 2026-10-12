import 'server-only';
import { sealData, unsealData } from 'iron-session';
import { z } from 'zod';
import { env } from '@/lib/env';
import { log } from '@/lib/log';

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
