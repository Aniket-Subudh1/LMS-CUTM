import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { istDayKey } from '@/lib/domain/time';
import { Batch } from '@/lib/models/batch';
import { Department } from '@/lib/models/department';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { pageSize } from '@/lib/schemas/common';

const skip = (page: number) => (page - 1) * pageSize;

export type DepartmentRow = { id: string; code: string; name: string; status: 'active' | 'archived' };

export async function listDepartments(page: number): Promise<{ rows: DepartmentRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    Department.find({}, { code: 1, name: 1, status: 1 }).sort({ code: 1 }).skip(skip(page)).limit(pageSize).lean(),
    Department.estimatedDocumentCount(),
  ]);
  return { rows: docs.map((d) => ({ id: String(d._id), code: d.code, name: d.name, status: d.status })), total };
}

export async function getDepartment(id: string): Promise<DepartmentRow> {
  await requireViewer(['admin']);
  if (!isValidObjectId(id)) notFound();
  await db();
  const d = await Department.findById(id, { code: 1, name: 1, status: 1 }).lean();
  if (!d) notFound();
  return { id: String(d._id), code: d.code, name: d.name, status: d.status };
}

// Departments are few (dozens); the cap keeps a select bounded all the same.
export async function listDepartmentsForSelect(): Promise<{ id: string; label: string }[]> {
  await requireViewer(['admin']);
  await db();
  const docs = await Department.find({ status: 'active' }, { code: 1, name: 1 }).sort({ code: 1 }).limit(200).lean();
  return docs.map((d) => ({ id: String(d._id), label: `${d.code} · ${d.name}` }));
}

export type ProgramRow = {
  id: string;
  code: string;
  name: string;
  departmentCode: string;
  category: 'ugc' | 'skill';
  durationSemesters: number;
  status: 'active' | 'archived';
};

export async function listPrograms(page: number): Promise<{ rows: ProgramRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    Program.find({}, { code: 1, name: 1, departmentId: 1, category: 1, durationSemesters: 1, status: 1 })
      .sort({ code: 1 })
      .skip(skip(page))
      .limit(pageSize)
      .lean(),
    Program.estimatedDocumentCount(),
  ]);
  const departments = await Department.find({ _id: { $in: docs.map((p) => p.departmentId) } }, { code: 1 }).lean();
  const codes = new Map(departments.map((d) => [String(d._id), d.code]));
  return {
    rows: docs.map((p) => ({
      id: String(p._id),
      code: p.code,
      name: p.name,
      departmentCode: codes.get(String(p.departmentId)) ?? '—',
      category: p.category,
      durationSemesters: p.durationSemesters,
      status: p.status,
    })),
    total,
  };
}

export type Outcome = { code: string; title: string; description: string };
export type ProgramDetail = {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  category: 'ugc' | 'skill';
  durationSemesters: number;
  status: 'active' | 'archived';
  pos: Outcome[];
  psos: Outcome[];
};

export async function getProgram(id: string): Promise<ProgramDetail> {
  await requireViewer(['admin']);
  if (!isValidObjectId(id)) notFound();
  await db();
  const p = await Program.findById(id).lean();
  if (!p) notFound();
  const outcome = (o: { code: string; title: string; description?: string | null }) => ({
    code: o.code,
    title: o.title,
    description: o.description ?? '',
  });
  return {
    id: String(p._id),
    code: p.code,
    name: p.name,
    departmentId: String(p.departmentId),
    category: p.category,
    durationSemesters: p.durationSemesters,
    status: p.status,
    pos: p.pos.map(outcome),
    psos: p.psos.map(outcome),
  };
}

export type BatchRow = {
  id: string;
  name: string;
  startYear: number;
  sections: string[];
  status: 'active' | 'graduated';
};

export async function listBatches(programId: string, page: number): Promise<{ rows: BatchRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    Batch.find({ programId }, { name: 1, startYear: 1, sections: 1, status: 1 })
      .sort({ startYear: -1 })
      .skip(skip(page))
      .limit(pageSize)
      .lean(),
    Batch.countDocuments({ programId }),
  ]);
  return {
    rows: docs.map((b) => ({
      id: String(b._id),
      name: b.name,
      startYear: b.startYear,
      sections: b.sections,
      status: b.status,
    })),
    total,
  };
}

export async function getBatch(programId: string, id: string): Promise<BatchRow> {
  await requireViewer(['admin']);
  if (!isValidObjectId(id)) notFound();
  await db();
  const b = await Batch.findOne({ _id: id, programId }, { name: 1, startYear: 1, sections: 1, status: 1 }).lean();
  if (!b) notFound();
  return { id: String(b._id), name: b.name, startYear: b.startYear, sections: b.sections, status: b.status };
}

export type TermRow = {
  id: string;
  code: string;
  name: string;
  academicYear: string;
  startsOn: string;
  endsOn: string;
  status: 'upcoming' | 'current' | 'closed';
};

const termRow = (t: {
  _id: unknown;
  code: string;
  name: string;
  academicYear: string;
  startsOn: Date;
  endsOn: Date;
  status: TermRow['status'];
}): TermRow => ({
  id: String(t._id),
  code: t.code,
  name: t.name,
  academicYear: t.academicYear,
  startsOn: istDayKey(t.startsOn),
  endsOn: istDayKey(t.endsOn),
  status: t.status,
});

const termFields = { code: 1, name: 1, academicYear: 1, startsOn: 1, endsOn: 1, status: 1 };

export async function listTerms(page: number): Promise<{ rows: TermRow[]; total: number }> {
  await requireViewer(['admin']);
  await db();
  const [docs, total] = await Promise.all([
    Term.find({}, termFields).sort({ code: -1 }).skip(skip(page)).limit(pageSize).lean(),
    Term.estimatedDocumentCount(),
  ]);
  return { rows: docs.map(termRow), total };
}

export async function getTerm(id: string): Promise<TermRow> {
  await requireViewer(['admin']);
  if (!isValidObjectId(id)) notFound();
  await db();
  const t = await Term.findById(id, termFields).lean();
  if (!t) notFound();
  return termRow(t);
}
