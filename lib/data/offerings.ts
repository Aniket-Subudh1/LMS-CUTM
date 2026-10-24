import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { formatCredits } from '@/lib/domain/catalog';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';
import type { OFFERING_STATUSES } from '@/lib/schemas/structure';
import type { Types } from 'mongoose';

type Option = { id: string; label: string };

export type CourseOption = Option & { basket: string | null; project: boolean };

// The courses a programme lists, for the New offering dialog (grouped by basket there).
async function readCurriculumOptions(programId: string): Promise<CourseOption[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  await db();
  const entries = await CurriculumEntry.find({ programId }, { courseId: 1, basket: 1 }).limit(1000).lean();
  const basketOf = new Map(entries.map((e) => [String(e.courseId), e.basket ?? null]));
  const courses = await Course.find(
    { _id: { $in: entries.map((e) => e.courseId) }, status: { $ne: 'archived' } },
    { code: 1, title: 1, credits: 1 },
  )
    .sort({ code: 1 })
    .lean();
  return courses.map((c) => ({
    id: String(c._id),
    label: `${c.code} · ${c.title} · ${formatCredits(c.credits)}`,
    basket: basketOf.get(String(c._id)) ?? null,
    project: c.credits.project > 0,
  }));
}

export async function listCurriculumForSelect(programId: string): Promise<CourseOption[]> {
  await requireViewer(['admin']);
  return readCurriculumOptions(programId);
}

export type BatchOption = Option & {
  programId: string;
  programme: string;
  departmentId: string | null;
  sections: string[];
};

// Active batches of every programme, for the first step of the New offering dialog.
export async function listBatchesForSelect(): Promise<BatchOption[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await Batch.find({ status: 'active' }, { programId: 1, name: 1, startYear: 1, sections: 1 })
    .sort({ programId: 1, startYear: -1 })
    .limit(500)
    .lean();
  const programs = await Program.find(
    { _id: { $in: docs.map((b) => b.programId) } },
    { code: 1, name: 1, departmentId: 1 },
  ).lean();
  const byId = new Map(programs.map((p) => [String(p._id), p]));
  return docs.map((b) => {
    const program = byId.get(String(b.programId));
    return {
      id: String(b._id),
      label: b.name.includes(String(b.startYear)) ? `${b.name} intake` : `${b.name} (${b.startYear} intake)`,
      programId: String(b.programId),
      programme: program ? `${program.code} · ${program.name}` : '—',
      departmentId: program?.departmentId ? String(program.departmentId) : null,
      sections: b.sections,
    };
  });
}

export async function listTermsForSelect(): Promise<(Option & { current: boolean })[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await Term.find({}, { code: 1, name: 1, status: 1 }).sort({ code: -1 }).limit(100).lean();
  return docs.map((t) => ({
    id: String(t._id),
    label: `${t.code} · ${t.name}${t.status === 'current' ? ' (current)' : ''}`,
    current: t.status === 'current',
  }));
}

// The faculty of a department, ticked by name in the offering dialogs (A department has at most a few hundred).
export async function listDepartmentFaculty(departmentId: string | null): Promise<Option[]> {
  await requireViewer(['admin']);
  if (!departmentId) return [];
  await db();
  const docs = await User.find({ departmentId, roles: 'faculty', status: { $ne: 'disabled' } }, { name: 1, email: 1 })
    .sort({ name: 1 })
    .limit(200)
    .lean();
  return docs.map((u) => ({ id: String(u._id), label: u.name }));
}

export type OfferingRow = {
  id: string;
  title: string;
  termCode: string;
  status: (typeof OFFERING_STATUSES)[number];
  faculty: { id: string; name: string; email: string }[];
  students: number;
  // M06: a credit offering whose marks are not locked, so an admin may refresh its evaluation policy.
  refreshable: boolean;
};

export type OfferingFilter = {
  q?: string;
  termId?: string;
  departmentId?: string;
  status?: (typeof OFFERING_STATUSES)[number];
};

export type OfferingStats = { total: number; active: number; draft: number; completed: number };

// The tiles above the admin offering list, each a count on the { status, _id } index.
export async function getOfferingStats(): Promise<OfferingStats> {
  await requireViewer(['admin']);
  await db();
  const [total, active, draft, completed] = await Promise.all([
    Offering.estimatedDocumentCount(),
    Offering.countDocuments({ status: 'active' }),
    Offering.countDocuments({ status: 'draft' }),
    Offering.countDocuments({ status: 'completed' }),
  ]);
  return { total, active, draft, completed };
}

export async function listOfferings(
  page: number,
  filters: OfferingFilter,
): Promise<{ rows: OfferingRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const q = filters.q?.trim();
  const filter = {
    ...(q ? { $text: { $search: q } } : {}),
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [docs, total] = await Promise.all([
    Offering.find(filter, { title: 1, termId: 1, status: 1, facultyIds: 1, category: 1, lockedAt: 1 })
      // A word search lists the closest matches first (text score); otherwise the usual order.
      .sort('$text' in filter ? { score: { $meta: 'textScore' }, _id: -1 } : { _id: -1 })
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
  const people = new Map(faculty.map((f) => [String(f._id), { id: String(f._id), name: f.name, email: f.email }]));
  const students = new Map(counts.map((c) => [String(c._id), c.n]));
  return {
    rows: docs.map((o) => ({
      id: String(o._id),
      title: o.title,
      termCode: termCodes.get(String(o.termId)) ?? '—',
      status: o.status,
      faculty: o.facultyIds.flatMap((id) => people.get(String(id)) ?? []),
      students: students.get(String(o._id)) ?? 0,
      refreshable: o.category === 'ugc' && !o.lockedAt,
    })),
    total,
  };
}

// 05 §3.8: while an offering's marks are locked, nothing may change a score, the state of results, an enrolment, the
// evaluation copy or what feeds the internal marks. A standalone test has no offering and no lock.
export async function assertUnlocked(offeringId: Types.ObjectId | string | null | undefined): Promise<void> {
  if (!offeringId) return;
  await db();
  const offering = await Offering.findById(offeringId, { lockedAt: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  if (offering.lockedAt) throw new AppError('LOCKED', 'Marks for this course are locked.');
}
