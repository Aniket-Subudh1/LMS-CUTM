import 'server-only';
import { cache } from 'react';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { Notification, type NotificationKind } from '@/lib/models/notification';
import { pageSize } from '@/lib/schemas/common';

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  href: string;
  createdAt: Date;
  read: boolean;
};

export async function listMyNotifications(page: number): Promise<{ rows: NotificationRow[]; total: number }> {
  const viewer = await requireViewer();
  await db();
  const filter = { userId: viewer.id };
  const [docs, total] = await Promise.all([
    Notification.find(filter, { kind: 1, title: 1, href: 1, createdAt: 1, readAt: 1 })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Notification.countDocuments(filter),
  ]);
  return {
    rows: docs.map((doc) => ({
      id: String(doc._id),
      kind: doc.kind,
      title: doc.title,
      href: doc.href,
      createdAt: doc.createdAt,
      read: Boolean(doc.readAt),
    })),
    total,
  };
}

// Once per request: the app layout's bell and Home both read it.
export const unreadCount = cache(async (): Promise<number> => {
  const viewer = await requireViewer();
  await db();
  return Notification.countDocuments({ userId: viewer.id, readAt: null });
});
