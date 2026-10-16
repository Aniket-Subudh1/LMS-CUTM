import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { db } from '@/lib/db';
import { courseMode, normalizeCode, type Credits } from '@/lib/domain/catalog';
import { log } from '@/lib/log';
import { SETTINGS } from '@/lib/schemas/settings';
import { OUTCOME_CODES } from '@/lib/schemas/structure';

// M01b (11 §5): moves an M01/M02 database to catalogue v2. Back the database up first, run this, then
// `npm run db:indexes`. It is idempotent: a second run changes nothing and says so.
//   - courses: one per code (duplicates merged into the oldest; offerings and calendar CO ids follow), T-P-Pj
//     credits, Bloom levels as lists, the rich-text syllabus as one module, a curriculum link per old programme;
//   - programmes: POs and PSOs become titles of the fixed codes;
//   - offerings: copies of the credits and the evaluation policy; no scheme;
//   - the old indexes and the evaluationschemes collection are dropped; one `catalog.migrated` audit entry.

const OldCo = z.looseObject({
  _id: z.instanceof(Types.ObjectId),
  code: z.string(),
  statement: z.string(),
  bloomLevel: z.string().optional(),
  bloomLevels: z.array(z.string()).optional(),
});
const OldCourse = z.looseObject({
  _id: z.instanceof(Types.ObjectId),
  code: z.string(),
  programId: z.instanceof(Types.ObjectId).optional(),
  category: z.string().optional(),
  credits: z.union([z.number(), z.object({ theory: z.number(), practice: z.number(), project: z.number() })]),
  components: z.array(z.string()).optional(),
  syllabusText: z.unknown().optional(),
  syllabusFileKey: z.string().optional(),
  objectives: z.array(z.string()).default([]),
  cos: z.array(OldCo).default([]),
  coMap: z.array(z.object({ coId: z.instanceof(Types.ObjectId), outcome: z.string(), level: z.number() })).default([]),
  modules: z.array(z.unknown()).default([]),
  issues: z.array(z.string()).default([]),
});
type OldCourse = z.infer<typeof OldCourse>;
const Outcome = z.object({ code: z.string(), title: z.string() });

type TextNode = { text?: string; content?: TextNode[] };
const TextNode: z.ZodType<TextNode> = z.lazy(() =>
  z.looseObject({ text: z.string().optional(), content: z.array(TextNode).optional() }),
);
function plain(node: TextNode): string {
  const children = node.content ?? [];
  return node.text ?? children.map(plain).join(children.some((c) => c.text !== undefined) ? '' : '\n');
}

// One component takes all the credits; several share them in half steps (the rest to theory) and the course is
// flagged, since the old model never said how a 4-credit theory + practice course divides.
function splitCredits(course: OldCourse): { credits: Credits; guessed: boolean } {
  if (typeof course.credits !== 'number') return { credits: course.credits, guessed: false };
  if (course.category === 'skill') return { credits: { theory: 0, practice: 0, project: 0 }, guessed: false };
  const parts = (['theory', 'practice', 'project'] as const).filter((c) => course.components?.includes(c));
  const each = Math.floor((course.credits / Math.max(parts.length, 1)) * 2) / 2;
  const credits = { theory: 0, practice: 0, project: 0 };
  for (const part of parts) credits[part] = each;
  credits[parts[0] ?? 'theory'] += course.credits - each * Math.max(parts.length, 1);
  return { credits, guessed: parts.length > 1 };
}

await db();
const database = mongoose.connection.db;
if (!database) throw new Error('No database connection.');
const courses = database.collection('courses');
const offerings = database.collection('offerings');
const programs = database.collection('programs');
const curriculum = database.collection('curriculumentries');
const counts = { coursesMerged: 0, coursesChanged: 0, linksCreated: 0, programmesChanged: 0, offeringsChanged: 0 };

// --- Courses ---
const old = (
  await courses
    .find({
      $or: [
        { programId: { $exists: true } },
        { credits: { $type: 'number' } },
        { 'cos.bloomLevel': { $exists: true } },
        { syllabusText: { $exists: true } },
      ],
    })
    .sort({ _id: 1 })
    .toArray()
).map((doc) => OldCourse.parse(doc));
const groups = new Map<string, OldCourse[]>();
for (const course of old) {
  const code = normalizeCode(course.code);
  // A course already migrated under this code survives; old duplicates merge into it.
  if (!groups.has(code)) {
    const existing = await courses.findOne({ code, credits: { $type: 'object' }, programId: { $exists: false } });
    groups.set(code, existing ? [OldCourse.parse(existing)] : []);
  }
  groups.get(code)?.push(course);
}

for (const [code, group] of groups) {
  const [survivor, ...others] = group;
  const merged = { ...survivor };
  for (const other of others) {
    if (merged.objectives.length === 0) merged.objectives = other.objectives;
    if (merged.cos.length === 0) {
      merged.cos = other.cos;
      merged.coMap = other.coMap;
    }
    if (merged.syllabusText === undefined) merged.syllabusText = other.syllabusText;
    if (merged.syllabusFileKey === undefined) merged.syllabusFileKey = other.syllabusFileKey;
  }
  const { credits, guessed } = splitCredits(merged);
  const issues = [...merged.issues];
  if (guessed) issues.push('Credits were split between theory, practice and project automatically; check T-P-Pj.');
  const outcomeCodes: readonly string[] = OUTCOME_CODES;
  const coMap = merged.coMap.filter((cell) => outcomeCodes.includes(cell.outcome));
  if (coMap.length < merged.coMap.length) {
    log.warn('mapping cells dropped', { code, dropped: merged.coMap.length - coMap.length });
  }
  const text = TextNode.safeParse(merged.syllabusText);
  const topics = text.success ? plain(text.data).trim().slice(0, 3000) : '';
  await courses.updateOne(
    { _id: survivor._id },
    {
      $set: {
        code,
        credits,
        objectives: merged.objectives,
        cos: merged.cos.map(({ bloomLevel, bloomLevels, ...co }) => ({
          ...co,
          bloomLevels: bloomLevels ?? (bloomLevel ? [bloomLevel] : []),
          suggestedBloom: null,
        })),
        coMap,
        modules:
          merged.modules.length === 0 && topics
            ? [{ _id: new Types.ObjectId(), title: 'Syllabus', hours: null, topics, practicals: [] }]
            : merged.modules,
        ...(merged.syllabusFileKey ? { syllabusFileKey: merged.syllabusFileKey } : {}),
        issues,
        reviewNeeded: issues.length > 0,
      },
      $unset: { programId: 1, departmentId: 1, category: 1, components: 1, componentKey: 1, syllabusText: 1 },
    },
  );
  counts.coursesChanged++;
  for (const course of group) {
    if (!course.programId) continue;
    const link = await curriculum.updateOne(
      { programId: course.programId, courseId: survivor._id },
      {
        $setOnInsert: { courseCode: code, basket: null, stream: null, courseType: null },
        $currentDate: { updatedAt: true },
      },
      { upsert: true },
    );
    counts.linksCreated += link.upsertedCount;
  }
  for (const other of others) {
    // Offerings of a merged course follow it, and their calendar keeps pointing at the CO with the same code.
    const byCode = new Map(merged.cos.map((co) => [co.code, co._id]));
    const remap = new Map(
      other.cos.flatMap((co) => (byCode.has(co.code) ? [[String(co._id), byCode.get(co.code)]] : [])),
    );
    for (const offering of await offerings.find({ courseId: other._id }, { projection: { calendar: 1 } }).toArray()) {
      const calendar = z
        .array(z.looseObject({ coIds: z.array(z.instanceof(Types.ObjectId)) }))
        .parse(offering.calendar ?? []);
      await offerings.updateOne(
        { _id: offering._id },
        {
          $set: {
            courseId: survivor._id,
            calendar: calendar.map((row) => ({
              ...row,
              coIds: row.coIds.flatMap((id) => remap.get(String(id)) ?? []),
            })),
          },
        },
      );
    }
    await courses.deleteOne({ _id: other._id });
    counts.coursesMerged++;
  }
}

// --- Programmes ---
for (const doc of await programs
  .find({ $or: [{ pos: { $exists: true } }, { category: { $exists: true } }] })
  .toArray()) {
  const listed = [...z.array(Outcome).catch([]).parse(doc.pos), ...z.array(Outcome).catch([]).parse(doc.psos)];
  // M01 seeded "PO1" … as titles; a title that only repeats its code says nothing.
  const outcomeTitles = OUTCOME_CODES.flatMap((code) => {
    const title = listed.find((o) => o.code === code)?.title.trim();
    return title && title !== code ? [{ code, title: title.slice(0, 200) }] : [];
  });
  await programs.updateOne(
    { _id: doc._id },
    { $set: { outcomeTitles, baskets: doc.baskets ?? [] }, $unset: { category: 1, pos: 1, psos: 1 } },
  );
  counts.programmesChanged++;
}

// --- Offerings ---
const stored = await database.collection<{ _id: string; value?: unknown }>('settings').findOne({ _id: 'evaluation' });
const policy = SETTINGS.evaluation.schema.parse(stored?.value ?? {});
for (const doc of await offerings
  .find({ $or: [{ credits: { $exists: false } }, { schemeId: { $exists: true } }] })
  .toArray()) {
  const course = await courses.findOne({ _id: doc.courseId }, { projection: { credits: 1 } });
  const parsed = z.object({ theory: z.number(), practice: z.number(), project: z.number() }).safeParse(course?.credits);
  const credits = parsed.success ? parsed.data : { theory: 0, practice: 0, project: 0 };
  const credit = courseMode(credits) === 'credit';
  await offerings.updateOne(
    { _id: doc._id },
    {
      $set: {
        credits,
        evaluation: credit ? policy : null,
        category: credit ? 'ugc' : 'skill',
        ...(credits.project > 0 ? {} : { projectMode: null }),
      },
      $unset: { schemeId: 1 },
    },
  );
  counts.offeringsChanged++;
}

// --- Indexes and the old collection ---
const indexes = (await courses.indexes()).map((i) => i.name);
for (const name of ['programId_1_code_1', 'departmentId_1_status_1']) {
  if (indexes.includes(name)) await courses.dropIndex(name);
}
const schemes = await database.listCollections({ name: 'evaluationschemes' }).toArray();
if (schemes.length > 0) await database.dropCollection('evaluationschemes');

const changed = Object.values(counts).some((n) => n > 0) || schemes.length > 0;
if (changed) {
  const admin = await database.collection('users').findOne({ roles: 'admin' }, { projection: { _id: 1 } });
  if (admin) {
    await database.collection('auditlogs').insertOne({
      at: new Date(),
      actorId: admin._id,
      action: 'catalog.migrated',
      entity: 'catalog',
      entityId: new Types.ObjectId(),
      after: { ...counts, evaluationSchemesDropped: schemes.length > 0 },
    });
  }
}
console.log(
  changed ? `Catalogue v2 migration: ${JSON.stringify(counts)}` : 'Catalogue v2 migration: nothing to change.',
);
await mongoose.disconnect();
