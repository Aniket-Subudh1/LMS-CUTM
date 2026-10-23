import 'server-only';
import { db } from '@/lib/db';
import { Notification, type NotificationKind } from '@/lib/models/notification';

const KEEP_MS = 90 * 86_400_000;

// COM-03: one row per recipient, written in chunks. Actions and the worker's assessment sweep both call it, so this
// file imports nothing from next/* or the session.
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
