import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';
import type { OFFERING_STATUSES } from '@/lib/schemas/structure';

type Option = { id: string; label: string };

async function readCourseOptions(programId: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  await db();
  const docs = await Course.find({ programId, status: { $ne: 'archived' } }, { code: 1, title: 1 })
    .sort({ code: 1 })
    .limit(500)
    .lean();
  return docs.map((c) => ({ id: String(c._id), label: `${c.code} · ${c.title}` }));
}

export async function listCoursesForSelect(programId: string): Promise<Option[]> {
  await requireViewer(['admin']);
  return readCourseOptions(programId);
}

export type BatchOption = Option & { sections: string[] };

export async function listBatchesForSelect(programId: string): Promise<BatchOption[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await Batch.find({ programId, status: 'active' }, { name: 1, startYear: 1, sections: 1 })
    .sort({ startYear: -1 })
    .limit(50)
    .lean();
  return docs.map((b) => ({ id: String(b._id), label: `${b.name} (${b.startYear})`, sections: b.sections }));
}

export async function listTermsForSelect(): Promise<Option[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await Term.find({}, { code: 1, name: 1, status: 1 }).sort({ code: -1 }).limit(100).lean();
  return docs.map((t) => ({ id: String(t._id), label: `${t.code} · ${t.name} (${t.status})` }));
}

export type OfferingRow = {
  id: string;
  title: string;
  termCode: string;
  status: (typeof OFFERING_STATUSES)[number];
  faculty: { name: string; email: string }[];
  students: number;
};

export type OfferingFilter = { termId?: string; departmentId?: string; status?: (typeof OFFERING_STATUSES)[number] };

export async function listOfferings(
  page: number,
  filters: OfferingFilter,
): Promise<{ rows: OfferingRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const filter = {
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [docs, total] = await Promise.all([
    Offering.find(filter, { title: 1, termId: 1, status: 1, facultyIds: 1 })
      .sort({ _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Offering.countDocuments(filter),
  ]);
  const [terms, faculty, counts] = await Promise.all([
    Term.find({ _id: { $in: docs.map((o) => o.termId) } }, { code: 1 }).lean(),
    User.find({ _id: { $in: docs.flatMap((o) => o.facultyIds) } }, { name: 1, email: 1 }).lean(),
    Enrollment.aggregate<{ _id: unknown; n: number }>([
      { $match: { offeringId: { $in: docs.map((o) => o._id) }, status: 'active' } },
      { $group: { _id: '$offeringId', n: { $sum: 1 } } },
    ]),
  ]);
  const termCodes = new Map(terms.map((t) => [String(t._id), t.code]));
  const people = new Map(faculty.map((f) => [String(f._id), { name: f.name, email: f.email }]));
  const students = new Map(counts.map((c) => [String(c._id), c.n]));
  return {
    rows: docs.map((o) => ({
      id: String(o._id),
      title: o.title,
      termCode: termCodes.get(String(o.termId)) ?? '—',
      status: o.status,
      faculty: o.facultyIds.flatMap((id) => people.get(String(id)) ?? []),
      students: students.get(String(o._id)) ?? 0,
    })),
    total,
  };
}
