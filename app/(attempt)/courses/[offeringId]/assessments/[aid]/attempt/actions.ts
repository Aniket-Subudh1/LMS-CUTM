'use server';

import { redirect } from 'next/navigation';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { offeringAccess } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { handInAttempts, SAVE_GRACE_MS } from '@/lib/data/attempts';
import { addEngagement } from '@/lib/data/engagement';
import { db, isDuplicateKey } from '@/lib/db';
import { canStart, deadlineAt } from '@/lib/domain/attempts';
import { seededShuffle } from '@/lib/domain/shuffle';
import { parseKey, sanitizeFileName } from '@/lib/domain/uploads';
import { AppError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { Assessment } from '@/lib/models/assessment';
import { Submission } from '@/lib/models/submission';
import { limit } from '@/lib/rate-limit';
import { AssessmentRef, SaveAnswer, SubmissionRef } from '@/lib/schemas/assessment';

const LEARN = ['student'] as const;

async function requireLearn(viewer: Viewer, offeringId: string) {
  if ((await offeringAccess(viewer, offeringId)) !== 'learn') {
    throw new AppError('FORBIDDEN', 'Only students of this course take its assessments.');
  }
  await db();
}

const isExpired = (attempt: { deadlineAt: Date }, now: Date) =>
  now.getTime() > attempt.deadlineAt.getTime() + SAVE_GRACE_MS;

// T5. An attempt left running past its deadline is handed in first; a second tab starting at the same moment finds the
// unique attempt number taken and resumes the first one.
export const startAttempt = action(
  { input: AssessmentRef, roles: LEARN },
  async ({ offeringId, assessmentId }, viewer) => {
    await requireLearn(viewer, offeringId);
    const assessment = await Assessment.findOne(
      { _id: assessmentId, offeringId, status: { $ne: 'draft' } },
      {
        mode: 1,
        opensAt: 1,
        closesAt: 1,
        lateUntil: 1,
        durationMin: 1,
        attemptsAllowed: 1,
        shuffleItems: 1,
        shuffleOptions: 1,
        items: 1,
      },
    ).lean();
    if (!assessment) throw new AppError('NOT_FOUND', 'Assessment not found.');
    const now = new Date();
    const mine = await Submission.find({ assessmentId, studentId: viewer.id }, { status: 1, deadlineAt: 1 }).lean();
    const expired = mine.filter((s) => s.status === 'in_progress' && isExpired(s, now));
    if (expired.length > 0)
      await handInAttempts(
        expired.map((s) => String(s._id)),
        now,
      );
    const lateUntil = assessment.lateUntil ?? null;
    const check = canStart({
      now,
      opensAt: assessment.opensAt,
      closesAt: assessment.closesAt,
      lateUntil,
      attemptsUsed: mine.length,
      attemptsAllowed: assessment.attemptsAllowed,
      inProgress: mine.some((s) => s.status === 'in_progress' && !isExpired(s, now)),
    });
    const runner = `/courses/${offeringId}/assessments/${assessmentId}/attempt`;
    if (check === 'not_open') throw new AppError('CLOSED', `This opens on ${formatDateTime(assessment.opensAt)}.`);
    if (check === 'closed')
      throw new AppError('CLOSED', `This closed on ${formatDateTime(lateUntil ?? assessment.closesAt)}.`);
    if (check === 'no_attempts_left') throw new AppError('CONFLICT', 'You have used all your attempts.');
    if (check === 'start') {
      const _id = new Types.ObjectId();
      const seed = String(_id);
      const items = assessment.shuffleItems ? seededShuffle(assessment.items, seed) : assessment.items;
      const order = items.map((item) => {
        const optionIds = item.options?.map((o) => o._id);
        return {
          itemId: item._id,
          optionIds:
            optionIds && assessment.shuffleOptions ? seededShuffle(optionIds, `${seed}:${item._id}`) : optionIds,
        };
      });
      try {
        await mongoose.connection.transaction(async (session) => {
          await Submission.create(
            [
              {
                _id,
                assessmentId,
                offeringId,
                studentId: viewer.id,
                attemptNo: mine.length + 1,
                startedAt: now,
                deadlineAt: deadlineAt({
                  startedAt: now,
                  durationMin: assessment.durationMin ?? null,
                  closesAt: assessment.closesAt,
                  lateUntil,
                }),
                order,
              },
            ],
            { session },
          );
          // SKL-02, ENG-01: a quiz attempt counts once, when it starts.
          if (assessment.mode === 'quiz') {
            await addEngagement([{ offeringId, studentId: viewer.id, at: now, inc: { quizAttempts: 1 } }], session);
          }
        });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
    redirect(runner);
  },
);

// T5: one question's answer, an atomic $set on its key (05 §5.2). The deadline is the server's (AC-M04-03): a save more
// than a moment after it hands the attempt in instead. 60 saves a minute (09 §4).
export const saveAnswer = action({ input: SaveAnswer, roles: LEARN }, async (input, viewer) => {
  await requireLearn(viewer, input.offeringId);
  const attempt = await Submission.findOne(
    { _id: input.submissionId, offeringId: input.offeringId, studentId: viewer.id },
    { assessmentId: 1, status: 1, deadlineAt: 1 },
  ).lean();
  if (!attempt) throw new AppError('NOT_FOUND', 'Attempt not found.');
  if (attempt.status !== 'in_progress') throw new AppError('CLOSED', 'These answers were already handed in.');
  const now = new Date();
  if (isExpired(attempt, now)) {
    await handInAttempts([String(attempt._id)], now);
    throw new AppError('CLOSED', 'Time is up — your answers were submitted.');
  }
  await limit('autosave', viewer.id, 60, 60_000);
  const assessment = await Assessment.findById(attempt.assessmentId, {
    'items._id': 1,
    'items.type': 1,
    'items.options': 1,
  }).lean();
  const item = assessment?.items.find((i) => String(i._id) === input.itemId);
  const { answer } = input;
  if (!item || item.type !== answer.type) throw new AppError('VALIDATION', 'Reload the page and answer again.');
  const options = new Set((item.options ?? []).map((o) => String(o._id)));
  let value: Record<string, unknown> | null = null;
  if (answer.type === 'mcq' || answer.type === 'msq') {
    const chosen = answer.type === 'mcq' ? (answer.optionId ? [answer.optionId] : []) : answer.optionIds;
    if (chosen.some((id) => !options.has(id))) throw new AppError('VALIDATION', 'Reload the page and answer again.');
    if (chosen.length > 0)
      value = answer.type === 'mcq' ? { optionId: chosen[0] } : { optionIds: [...new Set(chosen)] };
  } else if (answer.type === 'numeric') {
    if (answer.value !== null) value = { value: answer.value };
  } else if (answer.type === 'text') {
    if (answer.text) value = { text: answer.text };
  } else {
    // 09 §5: only this student's uploads for this assessment.
    const files = answer.files.map((file) => {
      const owner = parseKey(file.key);
      if (
        !owner ||
        owner.purpose !== 'submission' ||
        owner.contextId !== String(attempt.assessmentId) ||
        owner.userId !== viewer.id
      ) {
        throw new AppError('VALIDATION', 'Upload the file again.');
      }
      return {
        key: file.key,
        fileName: sanitizeFileName(file.fileName),
        contentType: file.contentType,
        size: file.size,
      };
    });
    if (files.length > 0) value = { files };
  }
  const path = `answers.${input.itemId}`;
  const written = await Submission.updateOne(
    { _id: attempt._id, status: 'in_progress' },
    value ? { $set: { [path]: value } } : { $unset: { [path]: 1 } },
  );
  if (written.matchedCount === 0) throw new AppError('CLOSED', 'These answers were already handed in.');
  return { savedAt: now };
});

// T5: the student's Submit, or the runner's at 0:00 (handInAttempts marks that one as the timer's).
export const submitAttempt = action(
  { input: SubmissionRef, roles: LEARN },
  async ({ offeringId, submissionId }, viewer) => {
    await requireLearn(viewer, offeringId);
    const attempt = await Submission.findOne(
      { _id: submissionId, offeringId, studentId: viewer.id },
      { assessmentId: 1 },
    ).lean();
    if (!attempt) throw new AppError('NOT_FOUND', 'Attempt not found.');
    await handInAttempts([submissionId], new Date());
    redirect(`/courses/${offeringId}/assessments/${attempt.assessmentId}`);
  },
);
