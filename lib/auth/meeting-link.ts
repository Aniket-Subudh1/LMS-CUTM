import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

// M03c T4, T14 (decision 9): everyone invited to a meeting has a personal link. A guest's names their guest id
// (`<guestId>.<sig>`); a member's or co-host's names the meeting and their account (`<sessionId>.<userId>.<sig>`). Each
// is signed with the session secret, so nothing secret is stored, a re-sent invitation keeps the same link, and it stops
// working when the person is taken off the meeting.
export type LinkHolder = { kind: 'guest'; guestId: string } | { kind: 'member'; sessionId: string; userId: string };

const sign = (holder: LinkHolder) =>
  createHmac('sha256', env().SESSION_PASSWORD)
    .update(
      holder.kind === 'guest'
        ? `meeting-guest:${holder.guestId}`
        : `meeting-member:${holder.sessionId}:${holder.userId}`,
    )
    .digest('base64url');

export const meetingLinkToken = (holder: LinkHolder) =>
  `${holder.kind === 'guest' ? holder.guestId : `${holder.sessionId}.${holder.userId}`}.${sign(holder)}`;

export const meetingLinkUrl = (holder: LinkHolder) => new URL(`/m/${meetingLinkToken(holder)}`, env().APP_URL).href;

// Whom a token names, or null when its signature does not match (a typed or altered link).
export function linkHolderOf(token: string): LinkHolder | null {
  const parts = token.split('.');
  const holder: LinkHolder | null =
    parts.length === 2
      ? { kind: 'guest', guestId: parts[0] }
      : parts.length === 3
        ? { kind: 'member', sessionId: parts[0], userId: parts[1] }
        : null;
  if (!holder) return null;
  const expected = Buffer.from(sign(holder));
  const given = Buffer.from(parts.at(-1) ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected) ? holder : null;
}
