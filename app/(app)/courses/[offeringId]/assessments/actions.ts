'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { assessmentAccess, requireManage, requireTeach } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { handInAttempts, totalOf } from '@/lib/data/attempts';
import { assertUnlocked } from '@/lib/data/offerings';
import { notify } from '@/lib/data/notify';
import { sectionPools, shortfallMessages } from '@/lib/data/papers';
import { requireOfferedLanguages } from '@/lib/data/code';
import { questionOf, storedItem } from '@/lib/data/questions';
import { releaseResults, rulesOf } from '@/lib/data/results';
import { db } from '@/lib/db';
import { countedAttempt, deadlineAt, windowState } from '@/lib/domain/attempts';
import { rubricTotal } from '@/lib/domain/grading';
import { isPermutation } from '@/lib/domain/order';
import { roundHalfUp } from '@/lib/domain/round';
import { earnsCertificate } from '@/lib/domain/test-files';
import { assessmentPath } from '@/lib/domain/test-links';
import { parseIstLocal } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { Assessment } from '@/lib/models/assessment';
import { BankItem } from '@/lib/models/bank-item';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { TestFile } from '@/lib/models/test-file';
import { TestLink } from '@/lib/models/test-link';
import { User } from '@/lib/models/user';
import { queueAttainment, queueGradeCode, queueInternalMarks, queueTestFile, queueTestStats } from '@/lib/queue';
import { limit } from '@/lib/rate-limit';
import {
  ASSESSMENT_LIMITS,
  AssessmentRef,
  CreateAssessment,
  ExtendAttempts,
  type CountsToward,
  GradeSubmission,
  MessageTakers,
  MODE_DEFAULTS,
  MODE_ITEM_TYPES,
  ItemRef,
  PROCTOR_LIMITS,
  ReorderItems,
  ReorderSections,
  RequestTestFile,
  SaveInstructions,
  SaveItem,
  SaveProctoring,
  SaveResultRules,
  SaveSection,
  SectionRef,
  SetExtraTime,
  SubmissionRef,
  UpdateAssessmentSettings,
  WaivePenalty,
} from '@/lib/schemas/assessment';
import { AddFromBank } from '@/lib/schemas/bank';
import { marks as marksInput, ROLES } from '@/lib/schemas/common';

const TEACH = ['admin', 'faculty'] as const;

// These actions serve a course's assessments and standalone tests alike (M04b): access comes from the assessment.
const fit = (title: string) => (title.length > 160 ? `${title.slice(0, 159)}…` : title);
const questionsFixed = () => new AppError('CONFLICT', 'Questions cannot change after students have started.');
const pathOf = (assessment: { _id: Types.ObjectId; offeringId?: Types.ObjectId | null }) =>
  assessmentPath(assessment.offeringId ? String(assessment.offeringId) : null, String(assessment._id));

async function manageAssessment(viewer: Viewer, assessmentId: string) {
  await requireManage(viewer, assessmentId);
  await db();
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw new AppError('NOT_FOUND', 'Assessment not found.');
  return assessment;
}

// M06 (Q-41): what a form posted for "Counts toward" — undefined when it had no such field. Only a credit course with
// theory credits counts its assessments toward the theory parts.
async function countsTowardOf(
  offeringId: Types.ObjectId | string | null | undefined,
  posted: CountsToward | 'none' | undefined,
): Promise<CountsToward | null | undefined> {
  if (posted === undefined) return undefined;
  const offering = offeringId ? await Offering.findById(offeringId, { category: 1, credits: 1 }).lean() : null;
  if (!offering || offering.category !== 'ugc' || offering.credits.theory === 0) {
    const message = 'Only an assessment of a course with theory credits counts toward the theory marks.';
    throw new AppError('VALIDATION', message, { countsToward: [message] });
  }
  return posted === 'none' ? null : posted;
}

// 05 §5.1: the stored total follows every change to the questions and to the sections' draws (M04b).
const recountMarks = (assessmentId: string) =>
  Assessment.updateOne(
    { _id: assessmentId },
    [
      {
        $set: {
          maxMarks: {
            $round: [
              {
                $add: [
                  { $sum: '$items.maxMarks' },
                  {
                    $sum: {
                      $map: {
                        input: '$sections',
                        as: 'section',
                        in: {
                          $multiply: [
                            { $ifNull: ['$$section.draw.count', 0] },
                            { $ifNull: ['$$section.draw.marksEach', 0] },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
              2,
            ],
          },
        },
      },
    ],
    { updatePipeline: true },
  );

// TP-09: at most ASSESSMENT_LIMITS.codeItems code questions a test, in languages the codeRunner setting offers.
async function requireCode(
  items: readonly { _id: Types.ObjectId; type: string }[],
  adding: readonly { type: string; code?: { languages: readonly string[] } | null }[],
  replacing?: string,
) {
  const added = adding.filter((item) => item.type === 'code');
  if (added.length === 0) return;
  const kept = items.filter((item) => item.type === 'code' && String(item._id) !== replacing).length;
  if (kept + added.length > ASSESSMENT_LIMITS.codeItems) {
    throw new AppError('CONFLICT', `A test holds at most ${ASSESSMENT_LIMITS.codeItems} code questions.`);
  }
  await requireOfferedLanguages(added);
}

// CPP-05/06: the outcomes must be the course's own; a standalone test has none (M04b).
async function requireCourseCos(
  offeringId: Types.ObjectId | null | undefined,
  coIds: readonly string[],
  field: string,
) {
  if (coIds.length === 0) return;
  if (!offeringId) {
    throw new AppError('VALIDATION', 'A test outside a course has no course outcomes.', {
      [field]: ['A test outside a course has no course outcomes.'],
    });
  }
  const offering = await Offering.findById(offeringId, { courseId: 1 }).lean();
  const course = offering ? await Course.findById(offering.courseId, { 'cos._id': 1 }).lean() : null;
  const known = new Set(course?.cos.map((co) => String(co._id)) ?? []);
  if (coIds.some((id) => !known.has(id))) {
    throw new AppError('VALIDATION', 'Pick outcomes of this course only.', {
      [field]: ['Pick outcomes of this course only.'],
    });
  }
}

// A-107: the type, title and window come from the dialog; the rest from the type's typical settings.
export const createAssessment = action({ input: CreateAssessment, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  if ((await Assessment.countDocuments({ offeringId: input.offeringId })) >= ASSESSMENT_LIMITS.perOffering) {
    throw new AppError('CONFLICT', `This class already has ${ASSESSMENT_LIMITS.perOffering} assessments.`);
  }
  // Nothing is published yet, so no mark moves and there is nothing to audit.
  const countsToward = await countsTowardOf(input.offeringId, input.countsToward);
  const [created] = await Assessment.create([
    {
      offeringId: input.offeringId,
      mode: input.mode,
      countsToward: countsToward ?? null,
      title: input.title,
      opensAt: parseIstLocal(input.opensAt),
      closesAt: parseIstLocal(input.closesAt),
      ...MODE_DEFAULTS[input.mode],
      createdBy: viewer.id,
    },
  ]);
  return { next: `${assessmentPath(input.offeringId, String(created._id))}/edit` };
});

// T4: everything while no student has started; afterwards only the title and the dates (05 §5.1).
export const updateAssessmentSettings = action(
  { input: UpdateAssessmentSettings, roles: TEACH },
  async (input, viewer) => {
    const assessment = await manageAssessment(viewer, input.assessmentId);
    const started = Boolean(await Submission.exists({ assessmentId: assessment._id }));
    const dates = {
      title: input.title,
      opensAt: parseIstLocal(input.opensAt),
      closesAt: parseIstLocal(input.closesAt),
      lateUntil: input.lateUntil ? parseIstLocal(input.lateUntil) : null,
    };
    // M06: what it counts toward may change after students start (it changes no answer), but moves internal marks.
    const countsToward = await countsTowardOf(assessment.offeringId, input.countsToward);
    const before = assessment.countsToward ?? null;
    const moved = countsToward !== undefined && countsToward !== before;
    if (moved) await assertUnlocked(assessment.offeringId);
    await mongoose.connection.transaction(async (session) => {
      await Assessment.updateOne(
        { _id: assessment._id },
        {
          $set: {
            ...dates,
            ...(started
              ? {}
              : {
                  durationMin: input.durationMin ?? null,
                  attemptsAllowed: input.attemptsAllowed,
                  attemptPolicy: input.attemptPolicy,
                  shuffleItems: input.shuffleItems,
                  shuffleOptions: input.shuffleOptions,
                }),
            ...(moved ? { countsToward } : {}),
          },
        },
        { session },
      );
      if (moved) {
        await writeAudit(
          {
            actorId: viewer.id,
            action: 'assessment.counts_toward',
            entity: 'assessment',
            entityId: String(assessment._id),
            offeringId: String(assessment.offeringId),
            before: { countsToward: before },
            after: { countsToward },
          },
          session,
        );
      }
    });
    if (moved && assessment.status === 'results_published') await queueInternalMarks(String(assessment.offeringId));
    refresh();
  },
);

export const saveInstructions = action({ input: SaveInstructions, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  await Assessment.updateOne(
    { _id: assessment._id },
    input.instructions ? { $set: { instructions: input.instructions } } : { $unset: { instructions: 1 } },
  );
  refresh();
});

// T4: one question at a time. CPP-05/06: on a credit course every question names at least one of the course's COs.
export const saveItem = action({ input: SaveItem, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (!MODE_ITEM_TYPES[assessment.mode].includes(input.type)) {
    throw new AppError('VALIDATION', 'This kind of question is not used in this type of assessment.');
  }
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  const offering = assessment.offeringId
    ? await Offering.findById(assessment.offeringId, { category: 1 }).lean()
    : null;
  if (offering?.category === 'ugc' && input.coIds.length === 0) {
    throw new AppError('VALIDATION', 'Tag the question with at least one course outcome.', {
      'cos[]': ['Tick at least one course outcome.'],
    });
  }
  await requireCourseCos(assessment.offeringId, input.coIds, 'cos[]');
  await requireCode(assessment.items, [input], input.itemId);
  // M04b: a question belongs to a section once the test has any; a new one without a choice goes to the first.
  const sectionIds = assessment.sections.map((section) => String(section._id));
  if (input.sectionId && !sectionIds.includes(input.sectionId)) {
    throw new AppError('NOT_FOUND', 'That section was deleted. Reload the page.');
  }
  const current = assessment.items.find((i) => String(i._id) === input.itemId);
  const sectionId = input.sectionId ?? (current?.sectionId ? String(current.sectionId) : sectionIds[0]) ?? null;
  // A-108: the options get new ids; no attempt refers to them yet.
  const item = { ...storedItem(input), sectionId };
  if (input.itemId) {
    const written = await Assessment.updateOne(
      { _id: assessment._id, 'items._id': input.itemId },
      { $set: { 'items.$': { _id: input.itemId, ...item } } },
    );
    if (written.matchedCount === 0) throw new AppError('NOT_FOUND', 'That question was deleted. Reload the page.');
  } else {
    // The size guard sits in the filter, so two parallel adds cannot pass the limit.
    const written = await Assessment.updateOne(
      { _id: assessment._id, [`items.${ASSESSMENT_LIMITS.items - 1}`]: { $exists: false } },
      { $push: { items: item } },
    );
    if (written.matchedCount === 0) {
      throw new AppError('CONFLICT', `An assessment holds at most ${ASSESSMENT_LIMITS.items} questions.`);
    }
  }
  await recountMarks(String(assessment._id));
  refresh();
});

export const deleteItem = action({ input: ItemRef, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  await Assessment.updateOne({ _id: assessment._id }, { $pull: { items: { _id: input.itemId } } });
  await recountMarks(String(assessment._id));
  refresh();
});

// M04 decision 3: a drag or a Move menu sends the whole new order.
export const reorderItems = action({ input: ReorderItems, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  const current = assessment.items.map((item) => String(item._id));
  const proposed = input['ids[]'];
  if (!isPermutation(current, proposed)) {
    throw new AppError('CONFLICT', 'The questions changed meanwhile. Reload the page and try again.');
  }
  const byId = new Map(assessment.items.map((item) => [String(item._id), item]));
  const written = await Assessment.updateOne(
    { _id: assessment._id, items: { $size: current.length }, 'items._id': { $all: current } },
    { $set: { items: proposed.flatMap((id) => byId.get(id) ?? []) } },
  );
  if (written.matchedCount === 0) {
    throw new AppError('CONFLICT', 'The questions changed meanwhile. Reload the page and try again.');
  }
  refresh();
});

// TP-05: bank questions copied in as the test's own, into a section (the first when none is chosen). The bank is the
// course's, or the viewer's own for a standalone test.
export const addFromBank = action({ input: AddFromBank, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  const offering = assessment.offeringId
    ? await Offering.findById(assessment.offeringId, { courseId: 1 }).lean()
    : null;
  const docs = await BankItem.find({
    _id: { $in: input['bankItemIds[]'] },
    ...(offering ? { courseId: offering.courseId } : { ownerId: viewer.id }),
    // TP-10: an AI draft waits for its review.
    aiDraft: { $ne: true },
  }).lean();
  const unfit = docs.filter((doc) => !MODE_ITEM_TYPES[assessment.mode].includes(doc.type)).length;
  if (unfit > 0) {
    throw new AppError('VALIDATION', `${unfit} of these questions are of a kind this type of assessment does not use.`);
  }
  if (docs.length === 0) throw new AppError('NOT_FOUND', 'Those questions were deleted. Reload the page.');
  const sectionIds = assessment.sections.map((section) => String(section._id));
  if (input.sectionId && !sectionIds.includes(input.sectionId)) {
    throw new AppError('NOT_FOUND', 'That section was deleted. Reload the page.');
  }
  const sectionId = input.sectionId ?? sectionIds[0] ?? null;
  if (assessment.items.length + docs.length > ASSESSMENT_LIMITS.items) {
    throw new AppError('CONFLICT', `An assessment holds at most ${ASSESSMENT_LIMITS.items} questions.`);
  }
  await requireCode(assessment.items, docs);
  const written = await Assessment.updateOne(
    { _id: assessment._id, items: { $size: assessment.items.length } },
    { $push: { items: { $each: docs.map((doc) => ({ ...questionOf(doc), sectionId })) } } },
  );
  if (written.matchedCount === 0) {
    throw new AppError('CONFLICT', 'The questions changed meanwhile. Reload the page and try again.');
  }
  await recountMarks(String(assessment._id));
  refresh();
  return { added: docs.length };
});

// M04b (TP-05, TP-06): a section's name, clock, order rule, passage and draw from the bank. The first section takes
// every question there is; a section's draw is worth its marks each, so the total follows.
export const saveSection = action({ input: SaveSection, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  await requireCourseCos(assessment.offeringId, input['drawCos[]'], 'drawCos[]');
  const section = {
    title: input.title,
    durationMin: input.durationMin ?? null,
    locked: input.locked,
    passage: input.passage,
    draw:
      input.drawCount === undefined || input.marksEach === undefined
        ? null
        : {
            count: input.drawCount,
            easy: input.easy,
            medium: input.medium,
            hard: input.hard,
            coIds: input['drawCos[]'].map((id) => new Types.ObjectId(id)),
            topics: input.drawTopics,
            marksEach: roundHalfUp(input.marksEach, 2),
            negativeEach: roundHalfUp(input.negativeEach, 2),
          },
  };
  if (input.sectionId) {
    const written = await Assessment.updateOne(
      { _id: assessment._id, 'sections._id': input.sectionId },
      { $set: { 'sections.$': { _id: input.sectionId, ...section } } },
    );
    if (written.matchedCount === 0) throw new AppError('NOT_FOUND', 'That section was deleted. Reload the page.');
  } else {
    const _id = new Types.ObjectId();
    const first = assessment.sections.length === 0;
    const written = await Assessment.updateOne(
      { _id: assessment._id, [`sections.${ASSESSMENT_LIMITS.sections - 1}`]: { $exists: false } },
      { $push: { sections: { _id, ...section } }, ...(first ? { $set: { 'items.$[].sectionId': _id } } : {}) },
    );
    if (written.matchedCount === 0) {
      throw new AppError('CONFLICT', `A test has at most ${ASSESSMENT_LIMITS.sections} sections.`);
    }
  }
  await recountMarks(String(assessment._id));
  refresh();
});

// A section goes only once its questions have moved to another or been deleted.
export const deleteSection = action({ input: SectionRef, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  if (assessment.items.some((item) => String(item.sectionId) === input.sectionId)) {
    throw new AppError('CONFLICT', 'Move this section’s questions to another section, or delete them, first.');
  }
  await Assessment.updateOne({ _id: assessment._id }, { $pull: { sections: { _id: input.sectionId } } });
  await recountMarks(String(assessment._id));
  refresh();
});

export const reorderSections = action({ input: ReorderSections, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  const current = assessment.sections.map((section) => String(section._id));
  if (!isPermutation(current, input['ids[]'])) {
    throw new AppError('CONFLICT', 'The sections changed meanwhile. Reload the page and try again.');
  }
  const byId = new Map(assessment.sections.map((section) => [String(section._id), section]));
  const written = await Assessment.updateOne(
    { _id: assessment._id, sections: { $size: current.length }, 'sections._id': { $all: current } },
    { $set: { sections: input['ids[]'].flatMap((id) => byId.get(id) ?? []) } },
  );
  if (written.matchedCount === 0) {
    throw new AppError('CONFLICT', 'The sections changed meanwhile. Reload the page and try again.');
  }
  refresh();
});

// TP-07: extra minutes for one person, found by email or roll number; a running attempt gets them at once. Audited,
// as the time a person had bears on their marks.
export const setExtraTime = action({ input: SetExtraTime, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  const who = input.who.trim();
  const person = await User.findOne(
    { $or: [{ email: who.toLowerCase() }, { rollNo: who.toUpperCase() }] },
    { _id: 1 },
  ).lean();
  if (!person) {
    throw new AppError('VALIDATION', 'No one has that email or roll number.', {
      who: ['No one has that email or roll number.'],
    });
  }
  const before = assessment.extraTime.find((entry) => entry.userId.equals(person._id))?.minutes ?? 0;
  const others = assessment.extraTime.filter((entry) => !entry.userId.equals(person._id));
  if (input.minutes > 0 && others.length >= ASSESSMENT_LIMITS.extraTime) {
    throw new AppError('CONFLICT', `Extra time can go to at most ${ASSESSMENT_LIMITS.extraTime} people per test.`);
  }
  const running = await Submission.find(
    { assessmentId: assessment._id, studentId: person._id, status: 'in_progress' },
    { startedAt: 1 },
  ).lean();
  await mongoose.connection.transaction(async (session) => {
    await Assessment.updateOne(
      { _id: assessment._id },
      {
        $set: {
          extraTime: input.minutes > 0 ? [...others, { userId: person._id, minutes: input.minutes }] : others,
        },
      },
      { session },
    );
    for (const attempt of running) {
      await Submission.updateOne(
        { _id: attempt._id, status: 'in_progress' },
        {
          $set: {
            deadlineAt: deadlineAt({
              startedAt: attempt.startedAt,
              durationMin: assessment.durationMin ?? null,
              closesAt: assessment.closesAt,
              lateUntil: assessment.lateUntil ?? null,
              extraMin: input.minutes,
            }),
          },
        },
        { session },
      );
    }
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'assessment.extra_time',
        entity: 'assessment',
        entityId: String(assessment._id),
        offeringId: assessment.offeringId ? String(assessment.offeringId) : undefined,
        before: { userId: String(person._id), minutes: before },
        after: { userId: String(person._id), minutes: input.minutes },
      },
      session,
    );
  });
  refresh();
});

// TP-08: proctoring is set while nobody has started, like the other settings, so every attempt runs under the same
// rules (07 §15). Unticking "Proctor this test" turns it off.
export const saveProctoring = action({ input: SaveProctoring, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (await Submission.exists({ assessmentId: assessment._id })) {
    throw new AppError('CONFLICT', 'Proctoring cannot change after anyone has started.');
  }
  const { fullscreen, camera, snapshotEverySec, blockCopy, hardLimit, penaltyEach } = input;
  await Assessment.updateOne(
    { _id: assessment._id },
    {
      $set: {
        proctoring: input.enabled ? { fullscreen, camera, snapshotEverySec, blockCopy, hardLimit, penaltyEach } : null,
      },
    },
  );
  refresh();
});

// --- The live monitor (TP-08). Each acts on one running attempt when a submission is posted, else on all of them. ---

const running = (assessmentId: Types.ObjectId, submissionId: string | undefined, now: Date) => ({
  assessmentId,
  status: 'in_progress' as const,
  deadlineAt: { $gt: now },
  ...(submissionId ? { _id: new Types.ObjectId(submissionId) } : {}),
});
const nobodyRunning = (submissionId: string | undefined) =>
  new AppError(
    'CONFLICT',
    submissionId ? 'That attempt has already been handed in.' : 'Nobody is writing this test now.',
  );

// Minutes added to running attempts reach each runner at its next beat. Audited, as the time a person had bears on
// their marks.
export const extendAttempts = action({ input: ExtendAttempts, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  const now = new Date();
  await mongoose.connection.transaction(async (session) => {
    const written = await Submission.updateMany(
      running(assessment._id, input.submissionId, now),
      [
        {
          $set: {
            deadlineAt: { $add: ['$deadlineAt', input.minutes * 60_000] },
            'proctor.addedMin': { $add: [{ $ifNull: ['$proctor.addedMin', 0] }, input.minutes] },
          },
        },
      ],
      { session, updatePipeline: true },
    );
    if (written.matchedCount === 0) throw nobodyRunning(input.submissionId);
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'assessment.time_added',
        entity: input.submissionId ? 'submission' : 'assessment',
        entityId: input.submissionId ?? String(assessment._id),
        offeringId: assessment.offeringId ? String(assessment.offeringId) : undefined,
        after: { minutes: input.minutes, attempts: written.modifiedCount },
      },
      session,
    );
  });
  refresh();
});

// Shown by each runner at its next beat; a runner keeps the newest PROCTOR_LIMITS.messages.
export const messageTakers = action({ input: MessageTakers, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  await limit('monitor-message', viewer.id, 30, 60_000);
  const written = await Submission.updateMany(running(assessment._id, input.submissionId, new Date()), {
    $push: {
      'proctor.messages': { $each: [{ text: input.text, at: new Date() }], $slice: -PROCTOR_LIMITS.messages },
    },
  });
  if (written.matchedCount === 0) throw nobodyRunning(input.submissionId);
});

// "End attempt": the answers saved so far are handed in now. Audited.
export const endAttempt = action({ input: SubmissionRef, roles: TEACH }, async (input, viewer) => {
  await db();
  const attempt = await Submission.findById(input.submissionId, { assessmentId: 1 }).lean();
  if (!attempt) throw new AppError('NOT_FOUND', 'Attempt not found.');
  const { offeringId } = await requireManage(viewer, String(attempt.assessmentId));
  if ((await handInAttempts([input.submissionId], new Date(), 'teacher')) === 0) {
    throw nobodyRunning(input.submissionId);
  }
  await writeAudit({
    actorId: viewer.id,
    action: 'submission.ended',
    entity: 'submission',
    entityId: input.submissionId,
    offeringId: offeringId ?? undefined,
    before: { status: 'in_progress' },
    after: { endedBy: 'teacher' },
  });
  refresh();
});

// 07 §15: a grader waives the penalty for serious warnings, or puts it back, and the total follows. Audited and refused
// while marks are locked, like grading.
export const waivePenalty = action({ input: WaivePenalty, roles: TEACH }, async (input, viewer) => {
  await db();
  const attempt = await Submission.findById(input.submissionId, {
    assessmentId: 1,
    status: 1,
    scores: 1,
    paper: 1,
    proctor: 1,
    total: 1,
  }).lean();
  if (!attempt) throw new AppError('NOT_FOUND', 'Hand-in not found.');
  const { offeringId } = await requireManage(viewer, String(attempt.assessmentId));
  await assertUnlocked(offeringId);
  if (attempt.status === 'in_progress') throw new AppError('CONFLICT', 'This attempt is still running.');
  const rules = await Assessment.findById(attempt.assessmentId, { proctoring: 1, status: 1 }).lean();
  const hard = attempt.proctor?.hard ?? 0;
  if (!rules?.proctoring?.penaltyEach || hard === 0) {
    throw new AppError('VALIDATION', 'This attempt has no penalty for warnings.');
  }
  const waived = attempt.proctor?.waived ?? false;
  if (waived === input.waived) return refresh();
  const total = totalOf(attempt.paper, attempt.scores ?? {}, rules.proctoring, { hard, waived: input.waived });
  await mongoose.connection.transaction(async (session) => {
    const written = await Submission.updateOne(
      { _id: attempt._id, status: { $ne: 'in_progress' }, 'proctor.waived': waived ? true : { $ne: true } },
      { $set: { 'proctor.waived': input.waived, total } },
      { session },
    );
    if (written.matchedCount === 0) throw new AppError('CONFLICT', 'This changed meanwhile. Reload the page.');
    await writeAudit(
      {
        actorId: viewer.id,
        action: input.waived ? 'submission.penalty_waived' : 'submission.penalty_restored',
        entity: 'submission',
        entityId: String(attempt._id),
        offeringId: offeringId ?? undefined,
        before: { waived, total: attempt.total ?? null },
        after: { waived: input.waived, total },
      },
      session,
    );
  });
  if (rules.status === 'results_published') {
    await queueTestStats(String(attempt.assessmentId));
    if (offeringId) {
      await queueInternalMarks(offeringId);
      await queueAttainment(offeringId);
    }
  }
  refresh();
});

// T4: AC-M04-01, a credit course's assessment is published only when every question names a CO.
export const publishAssessment = action({ input: AssessmentRef, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  if (assessment.status !== 'draft') throw new AppError('CONFLICT', 'This assessment is already published.');
  if (assessment.items.length === 0 && !assessment.sections.some((section) => section.draw)) {
    throw new AppError('VALIDATION', 'Add at least one question first.');
  }
  // M04b: every draw must be possible from the bank as it is now.
  const short = shortfallMessages(assessment.sections, await sectionPools(assessment));
  if (short.length > 0) throw new AppError('VALIDATION', `${short[0]}.`);
  const offering = assessment.offeringId
    ? await Offering.findById(assessment.offeringId, { category: 1, title: 1 }).lean()
    : null;
  const untagged = assessment.items.flatMap((item, i) => (item.coIds.length === 0 ? [i + 1] : []));
  if (offering?.category === 'ugc' && untagged.length > 0) {
    const list = untagged.length === 1 ? `question ${untagged[0]}` : `questions ${untagged.join(', ')}`;
    throw new AppError('VALIDATION', `Tag ${list} with a course outcome before publishing.`);
  }
  const unbalanced = assessment.items.flatMap((item, i) =>
    item.rubric && rubricTotal(item.rubric.map((row) => row.maxMarks)) !== item.maxMarks ? [i + 1] : [],
  );
  if (unbalanced.length > 0) {
    throw new AppError('VALIDATION', `The rubric of question ${unbalanced.join(', ')} does not add up to its marks.`);
  }
  await mongoose.connection.transaction(async (session) => {
    const written = await Assessment.updateOne(
      { _id: assessment._id, status: 'draft' },
      { $set: { status: 'published', publishedAt: new Date() } },
      { session },
    );
    if (written.modifiedCount === 0) throw new AppError('CONFLICT', 'This assessment is already published.');
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'assessment.published',
        entity: 'assessment',
        entityId: String(assessment._id),
        offeringId: assessment.offeringId ? String(assessment.offeringId) : undefined,
        before: { status: 'draft' },
        after: { status: 'published' },
      },
      session,
    );
  });
  // COM-03: a course's students are told; a standalone test reaches people through its share links.
  if (offering) {
    const students = await Enrollment.distinct('studentId', { offeringId: offering._id, status: 'active' });
    await notify(students.map(String), {
      kind: 'assessment.published',
      title: fit(`${assessment.title} — open until ${formatDateTime(assessment.closesAt)} (${offering.title})`),
      href: pathOf(assessment),
    });
  }
  refresh();
});

// 05 §5.1: only a draft is deleted; nothing refers to it yet.
export const deleteAssessment = action({ input: AssessmentRef, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  const removed = await Assessment.deleteOne({ _id: assessment._id, status: 'draft' });
  if (removed.deletedCount === 0) throw new AppError('CONFLICT', 'Only a draft can be deleted.');
  // Nobody can have joined through a draft's links (a link lets no one into a draft), so they go with it.
  await TestLink.deleteMany({ assessmentId: assessment._id });
  redirect(assessment.offeringId ? `/courses/${assessment.offeringId}/assessments` : '/tests');
});

// T6: marks per question (a rubric question's are its criteria), comments, and overrides of the automatic marks. Every
// change is audited with each question's marks before and after (AC-M04-07); regrading after publication is allowed.
export const gradeSubmission = action({ input: GradeSubmission, roles: TEACH }, async (input, viewer) => {
  await db();
  const attempt = await Submission.findById(input.submissionId, {
    assessmentId: 1,
    status: 1,
    scores: 1,
    paper: 1,
    proctor: 1,
  }).lean();
  if (!attempt) throw new AppError('NOT_FOUND', 'Hand-in not found.');
  const { offeringId } = await requireManage(viewer, String(attempt.assessmentId));
  await assertUnlocked(offeringId);
  if (attempt.status === 'in_progress') throw new AppError('CONFLICT', 'This attempt is still running.');
  const rules = await Assessment.findById(attempt.assessmentId, { proctoring: 1, status: 1 }).lean();
  // M04b: the questions this attempt was given.
  const paper = attempt.paper;
  const posted = input['item[]'];
  const itemIds = paper.map((item) => String(item._id));
  if (!isPermutation(itemIds, posted)) {
    throw new AppError('CONFLICT', 'The questions changed meanwhile. Reload the page and grade again.');
  }
  const errors: Record<string, string[]> = {};
  // An objective question answered wrongly may keep its negative marks (07 §14, M04b).
  const readMarks = (raw: string, max: number, field: string, min = 0): number | null | undefined => {
    if (raw === '') return null;
    const negative = raw.startsWith('-');
    const parsed = marksInput.safeParse(negative ? raw.slice(1) : raw);
    const value = parsed.success ? (negative ? -parsed.data : parsed.data) : NaN;
    if (!parsed.success || value > max || value < min) {
      errors[field] = [`Use ${min} to ${max}.`];
      return undefined;
    }
    return roundHalfUp(value, 2);
  };
  const before = attempt.scores ?? {};
  const scores: Record<
    string,
    { marks: number; by: string; comment?: string; criteria?: { criterionId: Types.ObjectId; marks: number }[] }
  > = {};
  posted.forEach((itemId, row) => {
    const item = paper.find((i) => String(i._id) === itemId);
    if (!item) return;
    const comment = input['comment[]'][row];
    let marks: number | null | undefined;
    let criteria: { criterionId: Types.ObjectId; marks: number }[] | undefined;
    if (item.rubric && item.rubric.length > 0) {
      const given = item.rubric.map((criterion) => {
        const at = input['criterion[]'].indexOf(`${itemId}:${criterion._id}`);
        return readMarks(at < 0 ? '' : input['criterionMarks[]'][at], criterion.maxMarks, `criterion-${criterion._id}`);
      });
      if (given.some((m) => m === undefined)) return;
      const numbers = given.filter((m): m is number => typeof m === 'number');
      if (numbers.length === given.length) {
        criteria = item.rubric.map((criterion, i) => ({ criterionId: criterion._id, marks: numbers[i] }));
        marks = rubricTotal(numbers);
      } else if (numbers.length > 0) {
        errors[`marks-${itemId}`] = ['Mark every criterion, or leave them all empty.'];
        return;
      } else marks = null;
    } else {
      marks = readMarks(input['marks[]'][row], item.maxMarks, `marks-${itemId}`, -item.negativeMarks);
    }
    if (marks === undefined) return;
    const previous = before[itemId];
    // TP-09: a code question's mark left empty keeps the one its tests gave (they may have finished after the page
    // was opened).
    if (marks === null && item.type === 'code' && previous) {
      scores[itemId] = { marks: previous.marks, by: previous.by, ...(comment ? { comment } : {}) };
      return;
    }
    if (marks === null) {
      if (comment) errors[`marks-${itemId}`] = ['Give marks to go with the comment.'];
      return;
    }
    const same = previous && previous.marks === marks && (previous.comment ?? '') === comment;
    scores[itemId] = {
      marks,
      // An automatic mark kept as it was stays the server's; any change is the grader's.
      by: same && previous ? previous.by : viewer.id,
      ...(comment ? { comment } : {}),
      ...(criteria ? { criteria } : {}),
    };
  });
  if (Object.keys(errors).length > 0) throw new AppError('VALIDATION', 'Please correct the highlighted marks.', errors);
  const changed = itemIds.filter((id) => {
    const a = before[id];
    const b = scores[id];
    return (
      (a?.marks ?? null) !== (b?.marks ?? null) ||
      (a?.comment ?? '') !== (b?.comment ?? '') ||
      JSON.stringify((a?.criteria ?? []).map((c) => c.marks)) !==
        JSON.stringify((b?.criteria ?? []).map((c) => c.marks))
    );
  });
  if (changed.length > 0) {
    const total = totalOf(paper, scores, rules?.proctoring, attempt.proctor);
    const now = new Date();
    await mongoose.connection.transaction(async (session) => {
      const written = await Submission.updateOne(
        { _id: attempt._id, status: { $ne: 'in_progress' } },
        {
          $set: {
            scores,
            total,
            status: total === null ? 'submitted' : 'graded',
            ...(total === null ? {} : { gradedAt: now, gradedBy: viewer.id }),
          },
        },
        { session },
      );
      if (written.matchedCount === 0) throw new AppError('NOT_FOUND', 'Hand-in not found.');
      // 09 §6: marks only, never answers or comments.
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'submission.graded',
          entity: 'submission',
          entityId: String(attempt._id),
          offeringId: offeringId ?? undefined,
          before: Object.fromEntries(changed.map((id) => [id, before[id]?.marks ?? null])),
          after: Object.fromEntries(changed.map((id) => [id, scores[id]?.marks ?? null])),
        },
        session,
      );
    });
  }
  // TP-11, M06, M09: marks changed after the results went out, so the ranks, the internal marks and attainment follow.
  if (changed.length > 0 && rules?.status === 'results_published') {
    await queueTestStats(String(attempt.assessmentId));
    if (offeringId) {
      await queueInternalMarks(offeringId);
      await queueAttainment(offeringId);
    }
  }
  if (input.then === 'next') {
    // M04 decision 5: the next hand-in waiting for marks, else back to the list.
    const next = await Submission.findOne(
      { assessmentId: attempt.assessmentId, status: 'submitted', _id: { $ne: attempt._id } },
      { _id: 1 },
    )
      .sort({ submittedAt: 1, _id: 1 })
      .lean();
    const list = `${assessmentPath(offeringId, String(attempt.assessmentId))}/grade`;
    redirect(next ? `${list}/${next._id}` : list);
  }
  refresh();
});

// TP-11 (07 §19): when the results go out and what they show — answers, explanations, a leaderboard and the
// recommendation bands. They change no mark, so they may change at any time; whoever saves an automatic release is
// the one the audit log names when it publishes the results.
export const saveResultRules = action({ input: SaveResultRules, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  const { release, showAnswers, showExplanations, leaderboard, certificateFromPct, bands } = input;
  const results = { release, showAnswers, showExplanations, leaderboard, certificateFromPct, bands, setBy: viewer.id };
  await Assessment.updateOne({ _id: assessment._id }, { $set: { results } });
  refresh();
});

// TP-11: "Work them out again" on the results page — ranks, analysis and similar answers (the testStats job).
export const refreshResults = action({ input: AssessmentRef, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  await queueTestStats(String(assessment._id));
});

// TP-12: ask the worker to make a file from a test's results. The staff's Excel export and reports PDF (a head of
// department's too: they read the results) once anyone has handed in; a taker's scorecard once their result shows, and
// their certificate when it reaches the test's threshold. Asking again makes it anew.
export const requestTestFile = action({ input: RequestTestFile, roles: ROLES }, async (input, viewer) => {
  const { access } = await assessmentAccess(viewer, input.assessmentId);
  await db();
  const test = await Assessment.findById(input.assessmentId, {
    status: 1,
    attemptPolicy: 1,
    maxMarks: 1,
    results: 1,
  }).lean();
  if (!test) throw new AppError('NOT_FOUND', 'Assessment not found.');
  let submissionId: Types.ObjectId | null = null;
  if (input.kind === 'results_xlsx' || input.kind === 'reports_pdf') {
    if (access === 'take') throw new AppError('FORBIDDEN', 'Only the test’s teachers export its results.');
    if (!(await Submission.exists({ assessmentId: test._id, status: { $in: ['submitted', 'graded'] } }))) {
      throw new AppError('CONFLICT', 'Nobody has handed in yet.');
    }
  } else {
    if (access !== 'take') throw new AppError('FORBIDDEN', 'Scorecards and certificates are for the people taking it.');
    const rules = rulesOf(test);
    const mine = await Submission.find(
      { assessmentId: test._id, studentId: viewer.id },
      { attemptNo: 1, status: 1, total: 1 },
    ).lean();
    const counted = countedAttempt(mine, test.attemptPolicy);
    if (!counted || (test.status !== 'results_published' && rules.release !== 'instant')) {
      throw new AppError('CONFLICT', 'Your result is not out yet.');
    }
    const pct = test.maxMarks > 0 ? roundHalfUp((100 * counted.total) / test.maxMarks, 2) : 0;
    if (input.kind === 'certificate' && !earnsCertificate(pct, rules.certificateFromPct)) {
      throw new AppError('FORBIDDEN', 'This result does not earn a certificate.');
    }
    submissionId = counted._id;
  }
  await limit('test-file', viewer.id, 10, 60 * 60_000);
  const requestedAt = new Date();
  const file = await TestFile.findOneAndUpdate(
    { assessmentId: test._id, kind: input.kind, submissionId },
    { $set: { status: 'making', requestedAt, requestedBy: viewer.id } },
    { upsert: true, returnDocument: 'after', projection: { _id: 1 } },
  ).lean();
  if (!file) throw new Error('The file request was not saved.');
  await queueTestFile(String(file._id), requestedAt);
  refresh();
});

// TP-09: a grader's "Run the tests again" — the code questions of a handed-in attempt are run on every test and
// marked anew by the gradeCode job (marks a grader gave stay). Audited, as marks may change; refused while marks are
// locked.
export const rerunCode = action({ input: SubmissionRef, roles: TEACH }, async (input, viewer) => {
  await db();
  const attempt = await Submission.findById(input.submissionId, { assessmentId: 1, status: 1, paper: 1 }).lean();
  if (!attempt) throw new AppError('NOT_FOUND', 'Hand-in not found.');
  const { offeringId } = await requireManage(viewer, String(attempt.assessmentId));
  await assertUnlocked(offeringId);
  if (attempt.status === 'in_progress') throw new AppError('CONFLICT', 'This attempt is still running.');
  if (!attempt.paper.some((item) => item.type === 'code')) {
    throw new AppError('VALIDATION', 'This attempt has no code questions.');
  }
  await queueGradeCode(input.submissionId, true);
  await writeAudit({
    actorId: viewer.id,
    action: 'submission.code_rerun',
    entity: 'submission',
    entityId: input.submissionId,
    offeringId: offeringId ?? undefined,
  });
  refresh();
});

// T6: AC-M04-06. Results go out once the window has closed (A-103) and every hand-in is marked; attempts still
// running have expired by then and are handed in first. Only students who handed something in are told.
export const publishResults = action({ input: AssessmentRef, roles: TEACH }, async (input, viewer) => {
  const assessment = await manageAssessment(viewer, input.assessmentId);
  await assertUnlocked(assessment.offeringId);
  if (assessment.status === 'draft') throw new AppError('CONFLICT', 'Publish the assessment first.');
  if (assessment.status === 'results_published') throw new AppError('CONFLICT', 'Results are already published.');
  const now = new Date();
  const state = windowState({
    now,
    opensAt: assessment.opensAt,
    closesAt: assessment.closesAt,
    lateUntil: assessment.lateUntil ?? null,
  });
  if (state !== 'closed') {
    throw new AppError(
      'CLOSED',
      `Results can be published after it closes on ${formatDateTime(assessment.lateUntil ?? assessment.closesAt)}.`,
    );
  }
  const running = await Submission.find({ assessmentId: assessment._id, status: 'in_progress' }, { _id: 1 }).lean();
  await handInAttempts(
    running.map((s) => String(s._id)),
    now,
  );
  const ungraded = await Submission.countDocuments({ assessmentId: assessment._id, status: 'submitted' });
  if (ungraded > 0) {
    throw new AppError(
      'VALIDATION',
      `${ungraded} submission${ungraded === 1 ? '' : 's'} still need${ungraded === 1 ? 's' : ''} grading.`,
    );
  }
  if (!(await releaseResults(assessment, viewer.id, now))) {
    throw new AppError('CONFLICT', 'Results are already published.');
  }
  refresh();
});
