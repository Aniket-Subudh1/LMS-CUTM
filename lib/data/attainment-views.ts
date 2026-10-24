import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { offeringAccess } from '@/lib/auth/access';
import { requireViewer } from '@/lib/auth/session';
import { attainmentSettings } from '@/lib/data/attainment';
import { db } from '@/lib/db';
import { computeProgramAttainment, type OfferingAttainment, type OutcomeCode } from '@/lib/domain/attainment';
import { Attainment } from '@/lib/models/attainment';
import { Course } from '@/lib/models/course';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';
import type { SettingsValue } from '@/lib/schemas/settings';

type Config = SettingsValue<'attainment'>;

// M09 (T3, T4): the attainment records as the Outcomes tab and Reports › Attainment show them.

export type AttainmentRecord = Omit<OfferingAttainment, 'warnings'> & {
  config: Config;
  cells: { coId: string; outcome: OutcomeCode; level: number }[];
  warnings: string[];
  computedAt: Date;
  computedBy: string | null;
};
export type OfferingAttainmentView = { canRecompute: boolean; record: AttainmentRecord | null };

// T3 (CPP-09, 09 §2): a credit offering's attainment for whoever teaches or oversees it; a student gets none, and
// someone with no access to the offering a 404.
export async function getOfferingAttainment(offeringId: string): Promise<OfferingAttainmentView | null> {
  const viewer = await requireViewer();
  const access = await offeringAccess(viewer, offeringId);
  if (access === 'learn') return null;
  const [offering, doc] = await Promise.all([
    Offering.findById(offeringId, { category: 1 }).lean(),
    Attainment.findOne({ offeringId }).lean(),
  ]);
  if (offering?.category === 'skill') return null;
  const by = doc?.computedBy ? await User.findById(doc.computedBy, { name: 1 }).lean() : null;
  return {
    canRecompute: access === 'teach' || viewer.roles.includes('admin'),
    record: doc
      ? {
          config: doc.config,
          cos: doc.cos.map((co) => ({
            coId: String(co.coId),
            code: co.code,
            statement: co.statement,
            cie: co.cie ?? null,
            value: co.value ?? null,
            met: co.met ?? null,
          })),
          see: doc.see ?? null,
          cells: doc.cells.map((cell) => ({ coId: String(cell.coId), outcome: cell.outcome, level: cell.level })),
          outcomes: doc.outcomes.map((o) => ({ code: o.code, value: o.value ?? null })),
          warnings: doc.warnings,
          computedAt: doc.computedAt,
          computedBy: by?.name ?? null,
        }
      : null,
  };
}

export type ProgramAttainment = {
  program: { id: string; code: string; name: string; titles: Partial<Record<OutcomeCode, string>> };
  target: number;
  // Over 200 credit offerings in the batch across every term: the viewer is asked to pick a term.
  tooMany: boolean;
  courses: {
    courseId: string;
    code: string;
    title: string;
    terms: string;
    // An offering of it, for the link to its Outcomes tab.
    offeringId: string;
    outcomes: { code: OutcomeCode; value: number | null }[] | null;
  }[];
  outcomes: { code: OutcomeCode; value: number | null }[];
};

// T4 (07 §5, M09 decision 4): a programme's attainment for one batch, in one term or every term, worked out from the
// courses' stored records when the report opens. Admins see every programme; a head of department their own
// department's.
export async function getProgramAttainment(input: {
  programId: string;
  batchId: string;
  termId?: string;
}): Promise<ProgramAttainment> {
  const viewer = await requireViewer(['admin', 'hod']);
  if (![input.programId, input.batchId, input.termId ?? input.batchId].every(isValidObjectId)) notFound();
  await db();
  const program = await Program.findById(input.programId, {
    code: 1,
    name: 1,
    departmentId: 1,
    outcomeTitles: 1,
  }).lean();
  if (!program) notFound();
  if (!viewer.roles.includes('admin') && !program.departmentId?.equals(viewer.departmentId ?? '')) notFound();
  const offerings = await Offering.find(
    {
      batchId: input.batchId,
      ...(input.termId ? { termId: input.termId } : {}),
      programId: program._id,
      category: 'ugc',
    },
    { courseId: 1, termId: 1 },
  )
    .limit(201)
    .lean();
  const settings = await attainmentSettings();
  const base = {
    program: {
      id: String(program._id),
      code: program.code,
      name: program.name,
      titles: Object.fromEntries(program.outcomeTitles.map((t) => [t.code, t.title])),
    },
    target: settings.defaultTargetLevel,
  };
  if (offerings.length > 200) return { ...base, tooMany: true, courses: [], outcomes: [] };
  const [records, courses, terms] = await Promise.all([
    Attainment.find({ offeringId: { $in: offerings.map((o) => o._id) } }, { offeringId: 1, outcomes: 1 }).lean(),
    Course.find({ _id: { $in: offerings.map((o) => o.courseId) } }, { code: 1, title: 1 }).lean(),
    Term.find({ _id: { $in: offerings.map((o) => o.termId) } }, { code: 1 }).lean(),
  ]);
  const courseOf = new Map(offerings.map((o) => [String(o._id), String(o.courseId)]));
  const merged = computeProgramAttainment(
    records.map((r) => ({
      courseId: courseOf.get(String(r.offeringId)) ?? '',
      outcomes: r.outcomes.map((o) => ({ code: o.code, value: o.value ?? null })),
    })),
  );
  const termCode = new Map(terms.map((t) => [String(t._id), t.code]));
  return {
    ...base,
    tooMany: false,
    courses: courses
      .map((c) => {
        const mine = offerings.filter((o) => o.courseId.equals(c._id));
        return {
          courseId: String(c._id),
          code: c.code,
          title: c.title,
          terms: [...new Set(mine.map((o) => termCode.get(String(o.termId)) ?? ''))].sort().join(', '),
          offeringId: String(mine[0]._id),
          outcomes: merged.courses.find((m) => m.courseId === String(c._id))?.outcomes ?? null,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code)),
    outcomes: merged.outcomes,
  };
}
