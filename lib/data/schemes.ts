import 'server-only';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { EvaluationScheme, type EvaluationSchemeDoc } from '@/lib/models/evaluation-scheme';
import { pageSize } from '@/lib/schemas/common';
import type { AGGREGATIONS, ASSESSMENT_MODES, COMPONENT_KEYS } from '@/lib/schemas/structure';

type ComponentKey = (typeof COMPONENT_KEYS)[number];

export type SchemeVersion = {
  id: string;
  componentKey: ComponentKey;
  version: number;
  name: string;
  status: 'active' | 'retired';
  internalMax: number;
  externalMax: number;
  decimals: number;
  roundingMode: 'half_up' | 'ceil';
  components: {
    key: string;
    label: string;
    weight: number;
    modes: (typeof ASSESSMENT_MODES)[number][];
    aggregation: (typeof AGGREGATIONS)[number];
    bestN: number | null;
  }[];
  createdAt: Date;
};

const dto = (s: EvaluationSchemeDoc & { _id: unknown }): SchemeVersion => ({
  id: String(s._id),
  componentKey: s.componentKey,
  version: s.version,
  name: s.name,
  status: s.status,
  internalMax: s.internalMax,
  externalMax: s.externalMax,
  decimals: s.rounding.decimals,
  roundingMode: s.rounding.mode,
  components: s.components.map((c) => ({
    key: c.key,
    label: c.label,
    weight: c.weight,
    modes: c.modes,
    aggregation: c.aggregation,
    bestN: c.bestN ?? null,
  })),
  createdAt: s.createdAt,
});

// At most one active version per component key and there are seven keys, so this list is bounded by construction.
export async function listActiveSchemes(): Promise<SchemeVersion[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await EvaluationScheme.find({ status: 'active' }).limit(20).lean();
  return docs.map(dto);
}

export async function listSchemeVersions(
  componentKey: ComponentKey,
  page: number,
): Promise<{ rows: SchemeVersion[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    EvaluationScheme.find({ componentKey })
      .sort({ version: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    EvaluationScheme.countDocuments({ componentKey }),
  ]);
  return { rows: docs.map(dto), total };
}

export async function getLatestScheme(componentKey: ComponentKey): Promise<SchemeVersion | null> {
  await requireViewer(['admin']);
  await db();
  const doc = await EvaluationScheme.findOne({ componentKey }).sort({ version: -1 }).lean();
  return doc ? dto(doc) : null;
}
