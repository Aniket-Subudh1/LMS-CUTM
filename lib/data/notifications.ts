import 'server-only';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { Notification, type NotificationKind } from '@/lib/models/notification';
import { pageSize } from '@/lib/schemas/common';

const KEEP_MS = 90 * 86_400_000;

// COM-03: one row per recipient, written in chunks; actions and the worker both call it.
export async function notify(
  userIds: readonly string[],
  input: { kind: NotificationKind; title: string; href: string },
) {
  const unique = [...new Set(userIds)];
  await db();
  const expiresAt = new Date(Date.now() + KEEP_MS);
  for (let start = 0; start < unique.length; start += 1_000) {
    await Notification.insertMany(
      unique.slice(start, start + 1_000).map((userId) => ({ userId, ...input, expiresAt })),
      { ordered: false },
    );
  }
}

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

export async function unreadCount(): Promise<number> {
  const viewer = await requireViewer();
  await db();
  return Notification.countDocuments({ userId: viewer.id, readAt: null });
}
