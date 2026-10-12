import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { offeringAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { Course } from '@/lib/models/course';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { pageSize } from '@/lib/schemas/common';
import type { BLOOM_LEVELS, CATEGORIES, COMPONENTS } from '@/lib/schemas/structure';

async function readProgramOptions() {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  await db();
  const docs = await Program.find({ status: 'active' }, { code: 1, name: 1 }).sort({ code: 1 }).limit(500).lean();
  return docs.map((p) => ({ id: String(p._id), label: `${p.code} · ${p.name}` }));
}

export async function listProgramsForSelect(): Promise<{ id: string; label: string }[]> {
  await requireViewer(['admin']);
  return readProgramOptions();
}

export type CourseRow = {
  id: string;
  code: string;
  title: string;
  programCode: string;
  credits: number;
  components: (typeof COMPONENTS)[number][];
  status: 'draft' | 'active' | 'archived';
};

export async function listCourses(
  page: number,
  programId: string | undefined,
): Promise<{ rows: CourseRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const filter = programId ? { programId } : {};
  const [docs, total] = await Promise.all([
    Course.find(filter, { programId: 1, code: 1, title: 1, credits: 1, components: 1, status: 1 })
      .sort({ programId: 1, code: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    programId ? Course.countDocuments(filter) : Course.estimatedDocumentCount(),
  ]);
  const programs = await Program.find({ _id: { $in: docs.map((c) => c.programId) } }, { code: 1 }).lean();
  const codes = new Map(programs.map((p) => [String(p._id), p.code]));
  return {
    rows: docs.map((c) => ({
      id: String(c._id),
      code: c.code,
      title: c.title,
      programCode: codes.get(String(c.programId)) ?? '—',
      credits: c.credits,
      components: c.components,
      status: c.status,
    })),
    total,
  };
}

export type CourseDetail = {
  id: string;
  programId: string;
  programCode: string;
  code: string;
  title: string;
  credits: number;
  components: (typeof COMPONENTS)[number][];
  category: (typeof CATEGORIES)[number];
  status: 'draft' | 'active' | 'archived';
  objectives: string[];
  cos: { id: string; code: string; statement: string; bloomLevel: (typeof BLOOM_LEVELS)[number] }[];
  // The programme's PO codes, then its PSO codes: the matrix columns.
  outcomes: string[];
  // `<coId>:<outcome code>` → level 1–3; only linked cells are present.
  cells: Record<string, number>;
};

async function readCourse(id: string): Promise<CourseDetail> {
  if (!isValidObjectId(id)) notFound();
  await db();
  const course = await Course.findById(id).lean();
  if (!course) notFound();
  const program = await Program.findById(course.programId, { code: 1, pos: 1, psos: 1 }).lean();
  if (!program) notFound();
  return {
    id: String(course._id),
    programId: String(course.programId),
    programCode: program.code,
    code: course.code,
    title: course.title,
    credits: course.credits,
    components: course.components,
    category: course.category,
    status: course.status,
    objectives: course.objectives,
    cos: course.cos.map((c) => ({
      id: String(c._id),
      code: c.code,
      statement: c.statement,
      bloomLevel: c.bloomLevel,
    })),
    outcomes: [...program.pos, ...program.psos].map((o) => o.code),
    cells: Object.fromEntries(course.coMap.map((m) => [`${m.coId}:${m.outcome}`, m.level])),
  };
}

export async function getCourse(id: string): Promise<CourseDetail> {
  await requireViewer(['admin']);
  return readCourse(id);
}

// The course behind an offering, for anyone who may open that offering's workspace.
export async function getOfferingCourse(offeringId: string): Promise<CourseDetail> {
  const viewer = await requireViewer();
  await offeringAccess(viewer, offeringId);
  const offering = await Offering.findById(offeringId, { courseId: 1 }).lean();
  if (!offering) notFound();
  return readCourse(String(offering.courseId));
}
