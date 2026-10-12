import 'server-only';
import type { ClientSession } from 'mongoose';
import { AuditLog } from '@/lib/models/audit-log';

export type AuditEntry = {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  offeringId?: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  await AuditLog.create([{ ...entry, at: new Date() }], { session });
}
