import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

// M03c T4 (decision 7): a meeting guest's personal link is their guest id and its signature under the session secret.
// Nothing secret is stored, the link stays the same when the invitation is sent again, and it stops working when the
// guest is taken off the meeting.
const sign = (guestId: string) =>
  createHmac('sha256', env().SESSION_PASSWORD).update(`meeting-guest:${guestId}`).digest('base64url');

export const guestLinkToken = (guestId: string) => `${guestId}.${sign(guestId)}`;

export const guestLinkUrl = (guestId: string) => new URL(`/m/${guestLinkToken(guestId)}`, env().APP_URL).href;

// The guest id a token names, or null when its signature does not match (a typed or altered link).
export function guestIdOf(token: string): string | null {
  const [guestId = '', signature = ''] = token.split('.');
  const expected = Buffer.from(sign(guestId));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? guestId : null;
}
