'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { action } from '@/lib/action';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { Notification } from '@/lib/models/notification';
import { objectId, ROLES } from '@/lib/schemas/common';

// markRead (M02 T6): opening a notification marks it read and goes to its page. Like `logout`, it is a plain form
// action, so it works before the page hydrates. The filter keeps it to the viewer's own rows.
export async function openNotification(input: FormData): Promise<void> {
  const viewer = await requireViewer();
  const id = objectId.safeParse(input.get('id'));
  if (!id.success) redirect('/notifications');
  await db();
  const row = await Notification.findOneAndUpdate(
    { _id: id.data, userId: viewer.id },
    { $min: { readAt: new Date() } },
    { projection: { href: 1 } },
  ).lean();
  redirect(row?.href ?? '/notifications');
}

export const markAllRead = action({ input: z.object({}), roles: ROLES }, async (_input, viewer) => {
  await db();
  await Notification.updateMany({ userId: viewer.id, readAt: null }, { $set: { readAt: new Date() } });
  refresh();
});
