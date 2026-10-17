'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireTeach } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { handInAttempts } from '@/lib/data/attempts';
import { notify } from '@/lib/data/notify';
import { db } from '@/lib/db';
import { windowState } from '@/lib/domain/attempts';
import { attemptTotal, rubricTotal } from '@/lib/domain/grading';
import { isPermutation } from '@/lib/domain/order';
import { roundHalfUp } from '@/lib/domain/round';
import { parseIstLocal } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { Assessment } from '@/lib/models/assessment';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import {
  ASSESSMENT_LIMITS,
  AssessmentRef,
  CreateAssessment,
  GradeSubmission,
  MODE_DEFAULTS,
  MODE_ITEM_TYPES,
  ItemRef,
  ReorderItems,
  SaveInstructions,
  SaveItem,
  UpdateAssessmentSettings,
} from '@/lib/schemas/assessment';
import { marks as marksInput } from '@/lib/schemas/common';

const TEACH = ['admin', 'faculty'] as const;

const base = (offeringId: string) => `/courses/${offeringId}/assessments`;
const fit = (title: string) => (title.length > 160 ? `${title.slice(0, 159)}…` : title);
const questionsFixed = () => new AppError('CONFLICT', 'Questions cannot change after students have started.');

async function teachAssessment(viewer: Viewer, offeringId: string, assessmentId: string) {
  await requireTeach(viewer, offeringId);
  await db();
  const assessment = await Assessment.findOne({ _id: assessmentId, offeringId }).lean();
  if (!assessment) throw new AppError('NOT_FOUND', 'Assessment not found.');
  return assessment;
}

// 05 §3.8: while marks are locked nothing may change a score or the state of results.
async function requireUnlocked(offeringId: string) {
  const offering = await Offering.findById(offeringId, { lockedAt: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  if (offering.lockedAt) throw new AppError('LOCKED', 'Marks for this course are locked.');
}

// 05 §5.1: the stored total follows every change to the questions.
const recountMarks = (assessmentId: string) =>
  Assessment.updateOne({ _id: assessmentId }, [{ $set: { maxMarks: { $round: [{ $sum: '$items.maxMarks' }, 2] } } }], {
    updatePipeline: true,
  });

// A-M04-6: the type, title and window come from the dialog; the rest from the type's typical settings.
export const createAssessment = action({ input: CreateAssessment, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  if ((await Assessment.countDocuments({ offeringId: input.offeringId })) >= ASSESSMENT_LIMITS.perOffering) {
    throw new AppError('CONFLICT', `This class already has ${ASSESSMENT_LIMITS.perOffering} assessments.`);
  }
  const [created] = await Assessment.create([
    {
      offeringId: input.offeringId,
      mode: input.mode,
      title: input.title,
      opensAt: parseIstLocal(input.opensAt),
      closesAt: parseIstLocal(input.closesAt),
      ...MODE_DEFAULTS[input.mode],
      createdBy: viewer.id,
    },
  ]);
  return { next: `${base(input.offeringId)}/${created._id}/edit` };
});

// T4: everything while no student has started; afterwards only the title and the dates (05 §5.1).
export const updateAssessmentSettings = action(
  { input: UpdateAssessmentSettings, roles: TEACH },
  async (input, viewer) => {
    const assessment = await teachAssessment(viewer, input.offeringId, input.assessmentId);
    const started = Boolean(await Submission.exists({ assessmentId: assessment._id }));
    const dates = {
      title: input.title,
      opensAt: parseIstLocal(input.opensAt),
      closesAt: parseIstLocal(input.closesAt),
      lateUntil: input.lateUntil ? parseIstLocal(input.lateUntil) : null,
    };
    await Assessment.updateOne(
      { _id: assessment._id },
      {
        $set: started
          ? dates
          : {
              ...dates,
              durationMin: input.durationMin ?? null,
              attemptsAllowed: input.attemptsAllowed,
              attemptPolicy: input.attemptPolicy,
              shuffleItems: input.shuffleItems,
              shuffleOptions: input.shuffleOptions,
            },
      },
    );
    refresh();
  },
);

export const saveInstructions = action({ input: SaveInstructions, roles: TEACH }, async (input, viewer) => {
  const assessment = await teachAssessment(viewer, input.offeringId, input.assessmentId);
  await Assessment.updateOne(
    { _id: assessment._id },
    input.instructions ? { $set: { instructions: input.instructions } } : { $unset: { instructions: 1 } },
  );
  refresh();
});

// T4: one question at a time. CPP-05/06: on a credit course every question names at least one of the course's COs.
export const saveItem = action({ input: SaveItem, roles: TEACH }, async (input, viewer) => {
  const assessment = await teachAssessment(viewer, input.offeringId, input.assessmentId);
  if (!MODE_ITEM_TYPES[assessment.mode].includes(input.type)) {
    throw new AppError('VALIDATION', 'This kind of question is not used in this type of assessment.');
  }
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  const offering = await Offering.findById(input.offeringId, { category: 1, courseId: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  if (offering.category === 'ugc' && input.coIds.length === 0) {
    throw new AppError('VALIDATION', 'Tag the question with at least one course outcome.', {
      'cos[]': ['Tick at least one course outcome.'],
    });
  }
  if (input.coIds.length > 0) {
    const course = await Course.findById(offering.courseId, { 'cos._id': 1 }).lean();
    const known = new Set(course?.cos.map((co) => String(co._id)) ?? []);
    if (input.coIds.some((id) => !known.has(id))) {
      throw new AppError('VALIDATION', 'Pick outcomes of this course only.', {
        'cos[]': ['Pick outcomes of this course only.'],
      });
    }
  }
  const maxMarks = roundHalfUp(input.maxMarks, 2);
  const rubric = input.rubric?.map((row) => ({
    _id: new Types.ObjectId(),
    ...row,
    maxMarks: roundHalfUp(row.maxMarks, 2),
  }));
  if (rubric && rubricTotal(rubric.map((row) => row.maxMarks)) !== maxMarks) {
    const sum = rubricTotal(rubric.map((row) => row.maxMarks));
    throw new AppError('VALIDATION', 'The criteria must add up to the question’s marks.', {
      'criterion[]': [`The criteria add up to ${sum}; the question has ${maxMarks} marks.`],
    });
  }
  // A-M04-7: the options get new ids; no attempt refers to them yet.
  const options = input.options?.map((text) => ({ _id: new Types.ObjectId(), text }));
  const key = input.key;
  let answer:
    { optionId?: Types.ObjectId; optionIds?: Types.ObjectId[]; value?: number; tolerance?: number } | undefined;
  if (options && key?.correct) {
    answer =
      input.type === 'mcq'
        ? { optionId: options[key.correct[0]]._id }
        : { optionIds: key.correct.map((place) => options[place]._id) };
  } else if (key?.value !== undefined && key.tolerance !== undefined) {
    answer = { value: key.value, tolerance: key.tolerance };
  }
  const item = {
    type: input.type,
    prompt: input.prompt,
    maxMarks,
    coIds: input.coIds,
    bloomLevel: input.bloomLevel,
    options,
    answer,
    rubric,
  };
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
  const assessment = await teachAssessment(viewer, input.offeringId, input.assessmentId);
  if (await Submission.exists({ assessmentId: assessment._id })) throw questionsFixed();
  await Assessment.updateOne({ _id: assessment._id }, { $pull: { items: { _id: input.itemId } } });
  await recountMarks(String(assessment._id));
  refresh();
});

// M04 decision 3: a drag or a Move menu sends the whole new order.
export const reorderItems = action({ input: ReorderItems, roles: TEACH }, async (input, viewer) => {
  const assessment = await teachAssessment(viewer, input.offeringId, input.assessmentId);
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

// T4: AC-M04-01, a credit course's assessment is published only when every question names a CO.
export const publishAssessment = action({ input: AssessmentRef, roles: TEACH }, async (input, viewer) => {
  const assessment = await teachAssessment(viewer, input.offeringId, input.assessmentId);
  if (assessment.status !== 'draft') throw new AppError('CONFLICT', 'This assessment is already published.');
  if (assessment.items.length === 0) throw new AppError('VALIDATION', 'Add at least one question first.');
  const offering = await Offering.findById(input.offeringId, { category: 1, title: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  const untagged = assessment.items.flatMap((item, i) => (item.coIds.length === 0 ? [i + 1] : []));
  if (offering.category === 'ugc' && untagged.length > 0) {
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
        offeringId: input.offeringId,
        before: { status: 'draft' },
        after: { status: 'published' },
      },
      session,
    );
  });
  // COM-03.
  const students = await Enrollment.distinct('studentId', { offeringId: input.offeringId, status: 'active' });
  await notify(students.map(String), {
    kind: 'assessment.published',
    title: fit(`${assessment.title} — open until ${formatDateTime(assessment.closesAt)} (${offering.title})`),
    href: `${base(input.offeringId)}/${assessment._id}`,
  });
  refresh();
});

// 05 §5.1: only a draft is deleted; nothing refers to it yet.
export const deleteAssessment = action({ input: AssessmentRef, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  const removed = await Assessment.deleteOne({
    _id: input.assessmentId,
    offeringId: input.offeringId,
    status: 'draft',
  });
  if (removed.deletedCount === 0) throw new AppError('CONFLICT', 'Only a draft can be deleted.');
  redirect(base(input.offeringId));
});

// T6: marks per question (a rubric question's are its criteria), comments, and overrides of the automatic marks. Every
// change is audited with each question's marks before and after (AC-M04-07); regrading after publication is allowed.
export const gradeSubmission = action({ input: GradeSubmission, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  await requireUnlocked(input.offeringId);
  const attempt = await Submission.findOne(
    { _id: input.submissionId, offeringId: input.offeringId },
    { assessmentId: 1, status: 1, scores: 1 },
  ).lean();
  if (!attempt) throw new AppError('NOT_FOUND', 'Hand-in not found.');
  if (attempt.status === 'in_progress') throw new AppError('CONFLICT', 'This attempt is still running.');
  const assessment = await Assessment.findById(attempt.assessmentId, { items: 1 }).lean();
  if (!assessment) throw new AppError('NOT_FOUND', 'Assessment not found.');
  const posted = input['item[]'];
  const itemIds = assessment.items.map((item) => String(item._id));
  if (!isPermutation(itemIds, posted)) {
    throw new AppError('CONFLICT', 'The questions changed meanwhile. Reload the page and grade again.');
  }
  const errors: Record<string, string[]> = {};
  const readMarks = (raw: string, max: number, field: string): number | null | undefined => {
    if (raw === '') return null;
    const parsed = marksInput.safeParse(raw);
    if (!parsed.success || parsed.data > max) {
      errors[field] = [`Use 0 to ${max}.`];
      return undefined;
    }
    return roundHalfUp(parsed.data, 2);
  };
  const before = attempt.scores ?? {};
  const scores: Record<
    string,
    { marks: number; by: string; comment?: string; criteria?: { criterionId: Types.ObjectId; marks: number }[] }
  > = {};
  posted.forEach((itemId, row) => {
    const item = assessment.items.find((i) => String(i._id) === itemId);
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
      marks = readMarks(input['marks[]'][row], item.maxMarks, `marks-${itemId}`);
    }
    if (marks === undefined) return;
    if (marks === null) {
      if (comment) errors[`marks-${itemId}`] = ['Give marks to go with the comment.'];
      return;
    }
    const previous = before[itemId];
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
    const total = attemptTotal(itemIds, scores);
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
          offeringId: input.offeringId,
          before: Object.fromEntries(changed.map((id) => [id, before[id]?.marks ?? null])),
          after: Object.fromEntries(changed.map((id) => [id, scores[id]?.marks ?? null])),
        },
        session,
      );
    });
  }
  if (input.then === 'next') {
    // M04 decision 5: the next hand-in waiting for marks, else back to the list.
    const next = await Submission.findOne(
      { assessmentId: attempt.assessmentId, status: 'submitted', _id: { $ne: attempt._id } },
      { _id: 1 },
    )
      .sort({ submittedAt: 1, _id: 1 })
      .lean();
    const list = `${base(input.offeringId)}/${attempt.assessmentId}/grade`;
    redirect(next ? `${list}/${next._id}` : list);
  }
  refresh();
});

// T6: AC-M04-06. Results go out once the window has closed (A-M04-2) and every hand-in is marked; attempts still
// running have expired by then and are handed in first. Only students who handed something in are told.
export const publishResults = action({ input: AssessmentRef, roles: TEACH }, async (input, viewer) => {
  const assessment = await teachAssessment(viewer, input.offeringId, input.assessmentId);
  await requireUnlocked(input.offeringId);
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
  await mongoose.connection.transaction(async (session) => {
    const written = await Assessment.updateOne(
      { _id: assessment._id, status: 'published' },
      { $set: { status: 'results_published', resultsPublishedAt: now } },
      { session },
    );
    if (written.modifiedCount === 0) throw new AppError('CONFLICT', 'Results are already published.');
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'assessment.results_published',
        entity: 'assessment',
        entityId: String(assessment._id),
        offeringId: input.offeringId,
        before: { status: 'published' },
        after: { status: 'results_published' },
      },
      session,
    );
  });
  const offering = await Offering.findById(input.offeringId, { title: 1 }).lean();
  const students = await Submission.distinct('studentId', { assessmentId: assessment._id });
  await notify(students.map(String), {
    kind: 'results.published',
    title: fit(`Results: ${assessment.title} (${offering?.title ?? ''})`),
    href: `${base(input.offeringId)}/${assessment._id}`,
  });
  refresh();
});
