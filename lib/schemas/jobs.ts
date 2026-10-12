import { z } from 'zod';
import { objectId } from '@/lib/schemas/common';

export const MailSend = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().min(1),
});
export type MailSend = z.infer<typeof MailSend>;

// A job that expands into one `mail/send` per recipient (06 §6). Producers chunk `userIds` to at most 500.
export const MailJob = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('invitation'), userIds: z.array(objectId).min(1).max(500) }),
]);
export type MailJob = z.infer<typeof MailJob>;
