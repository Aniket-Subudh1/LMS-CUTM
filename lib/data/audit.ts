import 'server-only';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { AuditLog } from '@/lib/models/audit-log';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';

export type AuditRow = {
  id: string;
  at: Date;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  reason: string | null;
  before: unknown;
  after: unknown;
};

export type AuditFilters = {
  entity?: string;
  entityId?: string;
  actorEmail?: string;
  offeringId?: string;
  // Calendar days in IST (YYYY-MM-DD), both ends included.
  from?: string;
  to?: string;
};

const DAY = 24 * 60 * 60 * 1000;
const istStart = (day: string) => new Date(`${day}T00:00:00+05:30`);

export async function listAudit(page: number, filters: AuditFilters): Promise<{ rows: AuditRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const actor = filters.actorEmail
    ? await User.findOne({ email: filters.actorEmail.toLowerCase() }, { _id: 1 }).lean()
    : null;
  const at = {
    ...(filters.from ? { $gte: istStart(filters.from) } : {}),
    ...(filters.to ? { $lt: new Date(istStart(filters.to).getTime() + DAY) } : {}),
  };
  const filter = {
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.offeringId ? { offeringId: filters.offeringId } : {}),
    // An address nobody has can never have acted: match nothing rather than everything.
    ...(filters.actorEmail ? { actorId: actor?._id ?? null } : {}),
    ...(Object.keys(at).length > 0 ? { at } : {}),
  };
  const [docs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ at: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Object.keys(filter).length > 0 ? AuditLog.countDocuments(filter) : AuditLog.estimatedDocumentCount(),
  ]);
  const actors = await User.find({ _id: { $in: docs.map((d) => d.actorId) } }, { name: 1, email: 1 }).lean();
  const names = new Map(actors.map((u) => [String(u._id), `${u.name} (${u.email})`]));
  return {
    rows: docs.map((d) => ({
      id: String(d._id),
      at: d.at,
      actor: names.get(String(d.actorId)) ?? String(d.actorId),
      action: d.action,
      entity: d.entity,
      entityId: String(d.entityId),
      reason: d.reason ?? null,
      before: d.before,
      after: d.after,
    })),
    total,
  };
}
