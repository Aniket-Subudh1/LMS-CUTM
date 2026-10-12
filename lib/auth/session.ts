import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getIronSession, type SessionOptions } from 'iron-session';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { User } from '@/lib/models/user';
import type { Role } from '@/lib/schemas/common';

export type SessionData = { uid: string; sv: number };
export type Viewer = { id: string; name: string; email: string; roles: Role[]; departmentId: string | null };

export const SESSION_COOKIE = 'lms_session';

function options(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: env().SESSION_PASSWORD,
    ttl: 60 * 60 * 12,
    cookieOptions: { secure: env().NODE_ENV === 'production', sameSite: 'lax', httpOnly: true, path: '/' },
    onUnsealError: (reason, error) => {
      if (reason !== 'expired') log.warn('session cookie rejected', { reason, error });
    },
  };
}

export async function session() {
  return getIronSession<SessionData>(await cookies(), options());
}

export async function signIn(user: { id: string; sessionVersion: number }): Promise<void> {
  const s = await session();
  s.uid = user.id;
  s.sv = user.sessionVersion;
  await s.save();
}

export async function signOut(): Promise<void> {
  (await session()).destroy();
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Without this, Next's runtime prerender evaluates the session read (which checks expiry against the clock).
  await connection();
  const s = await session();
  if (!s.uid || s.sv === undefined) return null;
  await db();
  const user = await User.findById(s.uid, {
    name: 1,
    email: 1,
    roles: 1,
    departmentId: 1,
    sessionVersion: 1,
    status: 1,
  }).lean();
  if (!user || user.status !== 'active' || user.sessionVersion !== s.sv) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    roles: user.roles,
    departmentId: user.departmentId ? String(user.departmentId) : null,
  };
});

export async function requireViewer(roles?: readonly Role[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  if (roles && !viewer.roles.some((r) => roles.includes(r))) redirect('/home');
  return viewer;
}
