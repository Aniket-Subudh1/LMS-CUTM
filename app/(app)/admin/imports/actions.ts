'use server';

import { refresh, updateTag } from 'next/cache';
import mongoose, { Types, type AnyBulkWriteOperation } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { coursewarePageFor, createCoursewareRun } from '@/lib/data/imports';
import { db } from '@/lib/db';
import {
  courseTypeFromLabel,
  DEFAULT_OUTCOME_TITLES,
  formatCredits,
  programmeCode,
  type Credits,
} from '@/lib/domain/catalog';
import { formatCsvErrors, parseCourseListCsv, type CsvError } from '@/lib/domain/csv';
import { AppError, csvRejected } from '@/lib/errors';
import { Course, type CourseDoc } from '@/lib/models/course';
import { CurriculumEntry, type CurriculumEntryDoc } from '@/lib/models/curriculum-entry';
import { Program, type ProgramDoc } from '@/lib/models/program';
import { syncQueue } from '@/lib/queue';
import { ImportCourseList, StartCoursewareImport } from '@/lib/schemas/structure';

const MAX_CURRICULUM = 1000;
const MAX_BASKETS = 12;
const loose = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const sameCredits = (a: Credits, b: Credits) =>
  a.theory === b.theory && a.practice === b.practice && a.project === b.project;

// ADM-06, 06 §8.5: CUTM's Course Repository as a CSV. All or nothing; courses are matched by code and only their
// title and credits change (content is never touched); programmes, baskets and links are matched or created;
// nothing is ever removed (A-64). One transaction and one audit entry.
export const importCourseList = action(
  { input: ImportCourseList, roles: ['admin'] },
  async ({ file, createProgrammes }, viewer) => {
    const parsed = parseCourseListCsv(await file.text());
    if (!parsed.ok) throw csvRejected(formatCsvErrors(parsed.errors));
    const { rows } = parsed;
    await db();

    const programmes = await Program.find({}, { code: 1, name: 1, baskets: 1 }).limit(2000).lean();
    const byCode = new Map(programmes.map((p) => [p.code, p]));
    const byName = new Map(programmes.map((p) => [loose(p.name), p]));
    const taken = new Set(programmes.map((p) => p.code));
    type Plan = {
      id: Types.ObjectId;
      code: string;
      isNew: boolean;
      baskets: Map<string, string>;
      newBaskets: string[];
    };
    const plans = new Map<string, Plan>();
    const errors: CsvError[] = [];
    const missing = new Set<string>();
    for (const row of rows) {
      const key = loose(row.programme);
      if (plans.has(key) || missing.has(key)) continue;
      const found = byCode.get(row.programme.toUpperCase().replace(/\s+/g, '')) ?? byName.get(key);
      if (found) {
        plans.set(key, {
          id: found._id,
          code: found.code,
          isNew: false,
          baskets: new Map(found.baskets.map((b) => [loose(b.name), b.name])),
          newBaskets: [],
        });
      } else if (createProgrammes) {
        const code = programmeCode(row.programme, taken);
        taken.add(code);
        plans.set(key, { id: new Types.ObjectId(), code, isNew: true, baskets: new Map(), newBaskets: [] });
      } else {
        missing.add(key);
        const uses = rows.filter((r) => loose(r.programme) === key).length;
        errors.push({
          row: row.row,
          message: `There is no programme "${row.programme}"${uses > 1 ? ` (${uses} rows)` : ''}. Add it, or tick "Create programmes that do not exist yet".`,
        });
      }
    }

    const existing = await Course.find(
      { code: { $in: [...new Set(rows.map((r) => r.code))] } },
      { code: 1, title: 1, credits: 1, type: 1, issues: 1 },
    ).lean();
    const courseByCode = new Map(existing.map((c) => [c.code, c]));
    const newCourses: (Pick<CourseDoc, 'code' | 'title' | 'credits' | 'type' | 'status'> & { _id: Types.ObjectId })[] =
      [];
    const courseOps: AnyBulkWriteOperation<CourseDoc>[] = [];
    const courseIds = new Map(existing.map((c) => [c.code, c._id]));
    let coursesCreated = 0;
    let coursesUpdated = 0;
    const linkOps: AnyBulkWriteOperation<CurriculumEntryDoc>[] = [];
    const links = new Map<string, Set<string>>();
    // A link that already says the same is left alone, so uploading the same file twice writes nothing.
    const current = new Map(
      (
        await CurriculumEntry.find(
          { programId: { $in: [...plans.values()].map((p) => p.id) }, courseCode: { $in: [...courseIds.keys()] } },
          { programId: 1, courseCode: 1, basket: 1, stream: 1, courseType: 1 },
        ).lean()
      ).map((e) => [`${e.programId}:${e.courseCode}`, `${e.basket ?? ''}|${e.stream ?? ''}|${e.courseType ?? ''}`]),
    );

    for (const row of rows) {
      const plan = plans.get(loose(row.programme));
      if (!plan) continue;
      let basket: string | null = null;
      if (row.basket) {
        basket = plan.baskets.get(loose(row.basket)) ?? null;
        if (!basket) {
          if (plan.baskets.size >= MAX_BASKETS) {
            errors.push({ row: row.row, message: `${plan.code} would have more than ${MAX_BASKETS} baskets.` });
            continue;
          }
          basket = row.basket;
          plan.baskets.set(loose(row.basket), basket);
          plan.newBaskets.push(basket);
        }
      }
      if (!courseIds.has(row.code)) {
        const id = new Types.ObjectId();
        courseIds.set(row.code, id);
        coursesCreated++;
        newCourses.push({
          _id: id,
          code: row.code,
          title: row.title,
          credits: row.credits,
          type: row.type ? courseTypeFromLabel(row.type) : null,
          status: 'active',
        });
      } else {
        const course = courseByCode.get(row.code);
        if (course) {
          courseByCode.delete(row.code);
          const set: Record<string, unknown> = {};
          if (course.title !== row.title) set.title = row.title;
          if (!course.type && row.type && courseTypeFromLabel(row.type)) set.type = courseTypeFromLabel(row.type);
          if (!sameCredits(course.credits, row.credits)) {
            set.credits = row.credits;
            set.reviewNeeded = true;
            set.issues = [
              ...course.issues,
              `Credits changed by the course list from ${formatCredits(course.credits)} to ${formatCredits(row.credits)}.`,
            ].slice(-20);
          }
          if (Object.keys(set).length > 0) {
            coursesUpdated++;
            courseOps.push({ updateOne: { filter: { _id: course._id }, update: { $set: set } } });
          }
        }
      }
      const linked = links.get(String(plan.id)) ?? new Set<string>();
      linked.add(row.code);
      links.set(String(plan.id), linked);
      if (current.get(`${plan.id}:${row.code}`) === `${basket ?? ''}|${row.stream ?? ''}|${row.type ?? ''}`) continue;
      linkOps.push({
        updateOne: {
          filter: { programId: plan.id, courseId: courseIds.get(row.code) },
          update: {
            $set: { courseCode: row.code, basket, stream: row.stream ?? null, courseType: row.type ?? null },
          },
          upsert: true,
        },
      });
    }
    for (const plan of plans.values()) {
      const listed = plan.isNew
        ? 0
        : await CurriculumEntry.countDocuments({
            programId: plan.id,
            courseCode: { $nin: [...(links.get(String(plan.id)) ?? [])] },
          });
      if (listed + (links.get(String(plan.id))?.size ?? 0) > MAX_CURRICULUM) {
        errors.push({ row: 0, message: `${plan.code} would list more than ${MAX_CURRICULUM} courses.` });
      }
    }
    if (errors.length > 0) throw csvRejected(formatCsvErrors(errors.sort((a, b) => a.row - b.row)));

    const newProgrammes = [...plans.entries()].flatMap(([key, plan]) =>
      plan.isNew
        ? [
            {
              _id: plan.id,
              code: plan.code,
              name: rows.find((r) => loose(r.programme) === key)?.programme ?? plan.code,
              outcomeTitles: DEFAULT_OUTCOME_TITLES.map((o) => ({ ...o })),
              baskets: plan.newBaskets.map((name) => ({ name })),
            },
          ]
        : [],
    );
    const basketOps: AnyBulkWriteOperation<ProgramDoc>[] = [...plans.values()].flatMap((plan) =>
      !plan.isNew && plan.newBaskets.length > 0
        ? [
            {
              updateOne: {
                filter: { _id: plan.id },
                update: { $push: { baskets: { $each: plan.newBaskets.map((name) => ({ name })) } } },
              },
            },
          ]
        : [],
    );
    const counts = await mongoose.connection.transaction(async (session) => {
      if (newProgrammes.length > 0) await Program.insertMany(newProgrammes, { session });
      if (basketOps.length > 0) await Program.bulkWrite(basketOps, { session });
      if (newCourses.length > 0) await Course.insertMany(newCourses, { session });
      if (courseOps.length > 0) await Course.bulkWrite(courseOps, { session });
      const written = linkOps.length
        ? await CurriculumEntry.bulkWrite(linkOps, { session })
        : { upsertedCount: 0, modifiedCount: 0 };
      const after = {
        rows: rows.length,
        coursesCreated,
        coursesUpdated,
        linksCreated: written.upsertedCount,
        linksUpdated: written.modifiedCount,
        programmesCreated: [...plans.values()].filter((p) => p.isNew).length,
        basketsCreated: [...plans.values()].reduce((n, p) => n + p.newBaskets.length, 0),
      };
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'course.list_imported',
          entity: 'course_list',
          entityId: String(new Types.ObjectId()),
          after,
        },
        session,
      );
      return after;
    });
    updateTag('catalog');
    refresh();
    return counts;
  },
);

// ADM-07: a courseware import runs in the worker (pages take 30–60 s each); the run page shows its progress.
export const startCoursewareImport = action(
  { input: StartCoursewareImport, roles: ['admin'] },
  async ({ mode, page }, viewer) => {
    const coursewareId = mode === 'one' ? coursewarePageFor(page ?? '') : null;
    if (mode === 'one' && coursewareId === null) {
      const message = 'Enter a page number such as 836, or a link on the courseware site.';
      throw new AppError('VALIDATION', message, { page: [message] });
    }
    const syncRunId = await createCoursewareRun(viewer.id, mode);
    await writeAudit({
      actorId: viewer.id,
      action: 'courseware.import_started',
      entity: 'sync_run',
      entityId: syncRunId,
      after: { mode, coursewareId },
    });
    if (coursewareId !== null) {
      await syncQueue().add(
        'coursewarePage',
        { syncRunId, coursewareId, force: false },
        { jobId: `cw-${syncRunId}-${coursewareId}` },
      );
    } else if (mode !== 'one') {
      await syncQueue().add('coursewareList', { syncRunId, mode, page: 1 }, { jobId: `cw-list-${syncRunId}-1` });
    }
    refresh();
    return { next: `/admin/imports/${syncRunId}` };
  },
);
