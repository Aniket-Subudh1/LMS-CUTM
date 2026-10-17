import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { canEditCourse, offeringAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  courseMode,
  courseReadiness,
  normalizeCode,
  type BloomLevel,
  type CourseType,
  type Credits,
  type ReadinessKey,
  type SessionKind,
} from '@/lib/domain/catalog';
import { Course, type CourseDoc } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';
import { OUTCOME_CODES } from '@/lib/schemas/structure';

type OutcomeCode = (typeof OUTCOME_CODES)[number];
type Status = 'draft' | 'active' | 'archived';
// The catalogue is for staff (09 §3); students see a course through their offering's Overview.
const STAFF = ['admin', 'hod', 'faculty'] as const;

async function readProgramOptions() {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  await db();
  const docs = await Program.find({ status: 'active' }, { code: 1, name: 1, baskets: 1 })
    .sort({ code: 1 })
    .limit(500)
    .lean();
  return docs.map((p) => ({
    id: String(p._id),
    label: `${p.code} · ${p.name}`,
    baskets: p.baskets.map((b) => b.name),
  }));
}

export async function listProgramsForSelect(): Promise<{ id: string; label: string; baskets: string[] }[]> {
  await requireViewer(STAFF);
  return readProgramOptions();
}

export type CatalogRow = {
  id: string;
  code: string;
  title: string;
  credits: Credits;
  type: CourseType | null;
  coordinator: string | null;
  status: Status;
  reviewNeeded: boolean;
};

export type CatalogFilter = {
  q?: string;
  type?: CourseType;
  programId?: string;
  basket?: string;
  status?: Status;
  review?: boolean;
  mine?: boolean;
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type CatalogStats = { total: number; active: number; review: number; unassigned: number };

// The tiles above the catalogue, each served by one of the course indexes.
export async function getCatalogStats(): Promise<CatalogStats> {
  await requireViewer(STAFF);
  await db();
  const [total, active, review, unassigned] = await Promise.all([
    Course.estimatedDocumentCount(),
    Course.countDocuments({ status: 'active' }),
    Course.countDocuments({ reviewNeeded: true }),
    Course.countDocuments({ coordinatorId: null }),
  ]);
  return { total, active, review, unassigned };
}

export async function listCatalog(
  page: number,
  filters: CatalogFilter,
): Promise<{ rows: CatalogRow[]; total: number }> {
  const viewer = await requireViewer(STAFF);
  await db();
  const q = filters.q?.trim() ?? '';
  // "CUTM15" or "cutm 1535" is the start of a code; anything else searches codes and titles by word.
  const search = !q
    ? {}
    : /^[a-z]{2,6}\s?-?\d{0,4}$/i.test(q)
      ? { code: { $regex: `^${escapeRegex(normalizeCode(q))}` } }
      : { $text: { $search: q } };
  const inProgramme =
    filters.programId && isValidObjectId(filters.programId)
      ? {
          _id: {
            $in: await CurriculumEntry.distinct('courseId', {
              programId: filters.programId,
              ...(filters.basket ? { basket: filters.basket } : {}),
            }),
          },
        }
      : {};
  const filter = {
    ...search,
    ...inProgramme,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.review ? { reviewNeeded: true } : {}),
    ...(filters.mine ? { coordinatorId: viewer.id } : {}),
  };
  const [docs, total] = await Promise.all([
    Course.find(filter, { code: 1, title: 1, credits: 1, type: 1, coordinatorId: 1, status: 1, reviewNeeded: 1 })
      // A word search lists the closest matches first (text score); otherwise the usual order.
      .sort('$text' in filter ? { score: { $meta: 'textScore' }, code: 1 } : { code: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Object.keys(filter).length > 0 ? Course.countDocuments(filter) : Course.estimatedDocumentCount(),
  ]);
  const coordinators = await User.find(
    { _id: { $in: docs.flatMap((c) => c.coordinatorId ?? []) } },
    { name: 1 },
  ).lean();
  const names = new Map(coordinators.map((u) => [String(u._id), u.name]));
  return {
    rows: docs.map((c) => ({
      id: String(c._id),
      code: c.code,
      title: c.title,
      credits: c.credits,
      type: c.type ?? null,
      coordinator: c.coordinatorId ? (names.get(String(c.coordinatorId)) ?? null) : null,
      status: c.status,
      reviewNeeded: c.reviewNeeded,
    })),
    total,
  };
}

export type CourseDetail = {
  id: string;
  code: string;
  title: string;
  type: CourseType | null;
  credits: Credits;
  mode: 'credit' | 'noncredit';
  status: Status;
  coordinator: { id: string; name: string } | null;
  objectives: string[];
  cos: { id: string; code: string; statement: string; bloomLevels: BloomLevel[]; suggestedBloom: BloomLevel | null }[];
  // `<coId>:<outcome code>` → level 1–3; only linked cells are present.
  cells: Record<string, number>;
  modules: { id: string; title: string; hours: string | null; topics: string; practicals: string[] }[];
  projects: string[];
  textbooks: string[];
  references: string[];
  sessionPlan: { topic: string; kind: SessionKind }[];
  syllabusFileKey: string | null;
  source: { url: string; importedAt: Date } | null;
  issues: string[];
};

async function detailOf(course: CourseDoc & { _id: unknown }): Promise<CourseDetail> {
  const coordinator = course.coordinatorId ? await User.findById(course.coordinatorId, { name: 1 }).lean() : null;
  return {
    id: String(course._id),
    code: course.code,
    title: course.title,
    type: course.type ?? null,
    credits: course.credits,
    mode: courseMode(course.credits),
    status: course.status,
    coordinator: coordinator ? { id: String(coordinator._id), name: coordinator.name } : null,
    objectives: course.objectives,
    cos: course.cos.map((co) => ({
      id: String(co._id),
      code: co.code,
      statement: co.statement,
      bloomLevels: co.bloomLevels,
      suggestedBloom: co.suggestedBloom ?? null,
    })),
    cells: Object.fromEntries(course.coMap.map((m) => [`${m.coId}:${m.outcome}`, m.level])),
    modules: course.modules.map((m) => ({
      id: String(m._id),
      title: m.title,
      hours: m.hours ?? null,
      topics: m.topics,
      practicals: m.practicals,
    })),
    projects: course.projects,
    textbooks: course.textbooks,
    references: course.references,
    sessionPlan: course.sessionPlan.map((s) => ({ topic: s.topic, kind: s.kind })),
    syllabusFileKey: course.syllabusFileKey ?? null,
    source: course.source ? { url: course.source.url, importedAt: course.source.importedAt } : null,
    issues: course.issues,
  };
}

const readiness = (course: CourseDoc) =>
  courseReadiness({
    credits: course.credits,
    reviewNeeded: course.reviewNeeded,
    hasCoordinator: Boolean(course.coordinatorId),
    objectives: course.objectives.length,
    cos: course.cos.map((co) => ({ id: String(co._id), bloomLevels: co.bloomLevels })),
    mappedCoIds: new Set(course.coMap.map((m) => String(m.coId))),
    modules: course.modules.length,
    hasSyllabusFile: Boolean(course.syllabusFileKey),
    textbooks: course.textbooks.length + course.references.length,
    sessions: course.sessionPlan.length,
  });

export type CatalogCourse = CourseDetail & {
  canEdit: boolean;
  isAdmin: boolean;
  // A course that has been offered keeps its code (A-62).
  offered: boolean;
  readiness: { key: ReadinessKey; done: boolean }[];
  programmes: { id: string; code: string; name: string; basket: string | null }[];
};

export async function getCatalogCourse(id: string): Promise<CatalogCourse> {
  const viewer = await requireViewer(STAFF);
  if (!isValidObjectId(id)) notFound();
  await db();
  const course = await Course.findById(id).lean();
  if (!course) notFound();
  const [detail, canEdit, offered, entries] = await Promise.all([
    detailOf(course),
    canEditCourse(viewer, id),
    Offering.exists({ courseId: id }),
    CurriculumEntry.find({ courseId: id }, { programId: 1, basket: 1 }).limit(50).lean(),
  ]);
  const programs = await Program.find({ _id: { $in: entries.map((e) => e.programId) } }, { code: 1, name: 1 }).lean();
  const byId = new Map(programs.map((p) => [String(p._id), p]));
  return {
    ...detail,
    canEdit,
    isAdmin: viewer.roles.includes('admin'),
    offered: Boolean(offered),
    readiness: readiness(course),
    programmes: entries
      .flatMap((e) => {
        const program = byId.get(String(e.programId));
        return program
          ? [{ id: String(program._id), code: program.code, name: program.name, basket: e.basket ?? null }]
          : [];
      })
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export type OfferingCourse = CourseDetail & {
  // PO1–PO12 and PSO1–PSO3 with the offering programme's titles ('' where it has none).
  outcomes: { code: OutcomeCode; title: string }[];
  canEdit: boolean;
  readiness: { key: ReadinessKey; done: boolean }[];
};

// The course behind an offering, for anyone who may open that offering's workspace.
export async function getOfferingCourse(offeringId: string): Promise<OfferingCourse> {
  const viewer = await requireViewer();
  await offeringAccess(viewer, offeringId);
  const offering = await Offering.findById(offeringId, { courseId: 1, programId: 1 }).lean();
  if (!offering) notFound();
  const [course, program] = await Promise.all([
    Course.findById(offering.courseId).lean(),
    Program.findById(offering.programId, { outcomeTitles: 1 }).lean(),
  ]);
  if (!course) notFound();
  const titles = new Map(program?.outcomeTitles.map((o) => [o.code, o.title]));
  const [detail, canEdit] = await Promise.all([detailOf(course), canEditCourse(viewer, String(course._id))]);
  return {
    ...detail,
    outcomes: OUTCOME_CODES.map((code) => ({ code, title: titles.get(code) ?? '' })),
    canEdit,
    readiness: readiness(course),
  };
}

export type FacultyMatch = { id: string; name: string; email: string };

// The coordinator picker: faculty whose name or email matches what the admin typed (20 at most).
export async function listFacultyMatches(q: string): Promise<FacultyMatch[]> {
  await requireViewer(['admin']);
  const text = q.trim();
  if (text.length < 2) return [];
  await db();
  const docs = await User.find(
    {
      roles: 'faculty',
      status: { $ne: 'disabled' },
      ...(text.includes('@') ? { email: text.toLowerCase() } : { $text: { $search: text } }),
    },
    { name: 1, email: 1 },
  )
    .sort({ name: 1 })
    .limit(20)
    .lean();
  return docs.map((u) => ({ id: String(u._id), name: u.name, email: u.email }));
}
