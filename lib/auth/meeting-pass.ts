import 'server-only';
import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';
import { env } from '@/lib/env';

// M03c T14 (decision 9): what a right passcode gives a browser — one meeting, as the person whose link it was, for 12
// hours (A-223; a meeting lasts at most 6). Sealed like the session cookie, so nobody can write their own. Joining
// another meeting replaces it.
type MeetingPass = { sessionId?: string; personId?: string };

function options(): SessionOptions {
  return {
    cookieName: 'lms_meeting',
    password: env().SESSION_PASSWORD,
    ttl: 60 * 60 * 12,
    cookieOptions: { secure: env().NODE_ENV === 'production', sameSite: 'lax', httpOnly: true, path: '/' },
  };
}

const pass = async () => getIronSession<MeetingPass>(await cookies(), options());

export async function grantMeetingPass(sessionId: string, personId: string): Promise<void> {
  const p = await pass();
  p.sessionId = sessionId;
  p.personId = personId;
  await p.save();
}

// The person this browser may be in the meeting as, or null.
export async function meetingPassHolder(sessionId: string): Promise<string | null> {
  const p = await pass();
  return p.sessionId === sessionId && p.personId ? p.personId : null;
}
