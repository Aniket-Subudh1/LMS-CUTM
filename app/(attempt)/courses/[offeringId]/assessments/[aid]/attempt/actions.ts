'use server';

import { redirect } from 'next/navigation';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { assessmentAccess } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { handInAttempts, SAVE_GRACE_MS } from '@/lib/data/attempts';
import { addEngagement } from '@/lib/data/engagement';
import { buildPaper } from '@/lib/data/papers';
import { db, isDuplicateKey } from '@/lib/db';
import { canStart, deadlineAt, planSectionMove, sectionOpen, type SectionRule } from '@/lib/domain/attempts';
import { isPermutation } from '@/lib/domain/order';
import { connectionGap, recordEvent, sessionCheck } from '@/lib/domain/proctoring';
import { assessmentPath } from '@/lib/domain/test-links';
import { parseKey, sanitizeFileName } from '@/lib/domain/uploads';
import { AppError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { Assessment } from '@/lib/models/assessment';
import { BankItem } from '@/lib/models/bank-item';
import { Submission } from '@/lib/models/submission';
import { limit } from '@/lib/rate-limit';
import {
  AddSnapshot,
  AssessmentRef,
  EnterSection,
  FlagItem,
  PROCTOR_LIMITS,
  ProctorBeat,
  SaveAnswer,
  SubmissionRef,
  type ProctorEvent,
} from '@/lib/schemas/assessment';

// A course's students, and the candidates and LMS users a share link let into a standalone test (M04b).
const TAKERS = ['student', 'candidate', 'faculty', 'hod', 'admin', 'support'] as const;
const RELOAD = 'Reload the page and answer again.';

async function requireTake(viewer: Viewer, assessmentId: string) {
  const found = await assessmentAccess(viewer, assessmentId);
  if (found.access !== 'take') throw new AppError('FORBIDDEN', 'Only the people this test was set for take it.');
  await db();
  return found.offeringId;
}

const isExpired = (attempt: { deadlineAt: Date }, now: Date) =>
  now.getTime() > attempt.deadlineAt.getTime() + SAVE_GRACE_MS;

// T5. An attempt left running past its deadline is handed in first; a second tab starting at the same moment finds the
// unique attempt number taken and resumes the first one. M04b: the attempt keeps its own paper (drawn from the bank
// where sections say so), opens the first section, and gets the person's extra time.
export const startAttempt = action({ input: AssessmentRef, roles: TAKERS }, async ({ assessmentId }, viewer) => {
  const offeringId = await requireTake(viewer, assessmentId);
  const assessment = await Assessment.findOne(
    { _id: assessmentId, status: { $ne: 'draft' } },
    {
      offeringId: 1,
      ownerIds: 1,
      mode: 1,
      opensAt: 1,
      closesAt: 1,
      lateUntil: 1,
      durationMin: 1,
      attemptsAllowed: 1,
      shuffleItems: 1,
      shuffleOptions: 1,
      items: 1,
      sections: 1,
      extraTime: 1,
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
  const runner = `${assessmentPath(offeringId, assessmentId)}/attempt`;
  if (check === 'not_open') throw new AppError('CLOSED', `This opens on ${formatDateTime(assessment.opensAt)}.`);
  if (check === 'closed')
    throw new AppError('CLOSED', `This closed on ${formatDateTime(lateUntil ?? assessment.closesAt)}.`);
  if (check === 'no_attempts_left') throw new AppError('CONFLICT', 'You have used all your attempts.');
  if (check === 'start') {
    const _id = new Types.ObjectId();
    const { paper, drawn } = await buildPaper(assessment, String(_id));
    const first = assessment.sections[0];
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
                extraMin: assessment.extraTime.find((entry) => entry.userId.equals(viewer.id))?.minutes ?? 0,
              }),
              paper,
              visits: first ? [{ sectionId: first._id, startedAt: now, closedAt: null }] : [],
              currentSectionId: first?._id ?? null,
            },
          ],
          { session },
        );
        // The bank's "Used" column (TP-05).
        if (drawn.length > 0)
          await BankItem.updateMany({ _id: { $in: drawn } }, { $inc: { usedCount: 1 } }, { session });
        // SKL-02, ENG-01: a quiz attempt counts once, when it starts (a course's quizzes only).
        if (offeringId && assessment.mode === 'quiz') {
          await addEngagement([{ offeringId, studentId: viewer.id, at: now, inc: { quizAttempts: 1 } }], session);
        }
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  redirect(runner);
});

// The running attempt of this viewer: handed in instead when its time is up (AC-M04-03).
async function runningAttempt(viewer: Viewer, submissionId: string) {
  await db();
  const attempt = await Submission.findOne(
    { _id: submissionId, studentId: viewer.id },
    { assessmentId: 1, status: 1, deadlineAt: 1, paper: 1, visits: 1, currentSectionId: 1 },
  ).lean();
  if (!attempt) throw new AppError('NOT_FOUND', 'Attempt not found.');
  await requireTake(viewer, String(attempt.assessmentId));
  if (attempt.status !== 'in_progress') throw new AppError('CLOSED', 'These answers were already handed in.');
  const now = new Date();
  if (isExpired(attempt, now)) {
    await handInAttempts([String(attempt._id)], now);
    throw new AppError('CLOSED', 'Time is up — your answers were submitted.');
  }
  const assessment = await Assessment.findById(attempt.assessmentId, { sections: 1 }).lean();
  const rules: SectionRule[] = (assessment?.sections ?? []).map((section) => ({
    id: String(section._id),
    durationMin: section.durationMin ?? null,
    locked: section.locked,
  }));
  const visits = attempt.visits.map((visit) => ({
    sectionId: String(visit.sectionId),
    startedAt: visit.startedAt,
    closedAt: visit.closedAt ?? null,
  }));
  return { attempt, now, rules, visits };
}

// T5: one question's answer, an atomic $set on its key (05 §5.2), checked against the question on this attempt's
// paper. M04b: a section that closed (left for good, or out of time) takes no more answers; the seconds spent on the
// question add up (TP-07). 60 saves a minute (09 §4).
export const saveAnswer = action({ input: SaveAnswer, roles: TAKERS }, async (input, viewer) => {
  const { attempt, now, rules, visits } = await runningAttempt(viewer, input.submissionId);
  await limit('autosave', viewer.id, 60, 60_000);
  const item = attempt.paper.find((i) => String(i._id) === input.itemId);
  const { answer } = input;
  if (!item || item.type !== answer.type) throw new AppError('VALIDATION', RELOAD);
  if (item.sectionId) {
    const rule = rules.find((r) => r.id === String(item.sectionId));
    const visit = visits.find((v) => v.sectionId === String(item.sectionId));
    if (!rule || !sectionOpen(rule, visit, now, attempt.deadlineAt)) {
      throw new AppError('CLOSED', 'This section is closed; its answers can no longer change.');
    }
  }
  const options = (item.options ?? []).map((o) => String(o._id));
  let value: Record<string, unknown> | null = null;
  switch (answer.type) {
    case 'mcq':
    case 'msq': {
      const chosen = answer.type === 'mcq' ? (answer.optionId ? [answer.optionId] : []) : answer.optionIds;
      if (chosen.some((id) => !options.includes(id))) throw new AppError('VALIDATION', RELOAD);
      if (chosen.length > 0)
        value = answer.type === 'mcq' ? { optionId: chosen[0] } : { optionIds: [...new Set(chosen)] };
      break;
    }
    case 'ordering':
      if (answer.optionIds.length > 0) {
        if (!isPermutation(options, answer.optionIds)) throw new AppError('VALIDATION', RELOAD);
        value = { optionIds: answer.optionIds };
      }
      break;
    case 'true_false':
      if (answer.truth !== null) value = { truth: answer.truth };
      break;
    case 'numeric':
      if (answer.value !== null) value = { value: answer.value };
      break;
    case 'fill_blank': {
      if (answer.texts.length > (item.blanks?.length ?? 0)) throw new AppError('VALIDATION', RELOAD);
      if (answer.texts.some((text) => text.trim() !== '')) value = { texts: answer.texts };
      break;
    }
    case 'matching': {
      const lefts = new Set((item.pairs ?? []).map((pair) => String(pair._id)));
      const rights = new Set((item.pairs ?? []).map((pair) => String(pair.rightId)));
      if (answer.matches.some((m) => !lefts.has(m.left) || !rights.has(m.right))) {
        throw new AppError('VALIDATION', RELOAD);
      }
      const unique = new Map(answer.matches.map((m) => [m.left, m.right]));
      if (unique.size > 0) value = { matches: [...unique].map(([left, right]) => ({ left, right })) };
      break;
    }
    case 'text':
      if (answer.text) value = { text: answer.text };
      break;
    case 'file': {
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
      break;
    }
  }
  const path = `answers.${input.itemId}`;
  const spent = input.spentSec > 0 ? { $inc: { [`spent.${input.itemId}`]: input.spentSec } } : {};
  const written = await Submission.updateOne(
    { _id: attempt._id, status: 'in_progress' },
    value ? { $set: { [path]: value }, ...spent } : { $unset: { [path]: 1 }, ...spent },
  );
  if (written.matchedCount === 0) throw new AppError('CLOSED', 'These answers were already handed in.');
  return { savedAt: now };
});

// TP-07: "Flag for review", kept with the attempt so it survives a reload.
export const flagItem = action({ input: FlagItem, roles: TAKERS }, async (input, viewer) => {
  const { attempt } = await runningAttempt(viewer, input.submissionId);
  if (!attempt.paper.some((item) => String(item._id) === input.itemId)) throw new AppError('VALIDATION', RELOAD);
  await Submission.updateOne(
    { _id: attempt._id, status: 'in_progress' },
    input.flagged ? { $addToSet: { flags: input.itemId } } : { $pull: { flags: input.itemId } },
  );
});

// TP-06: opening a section (a tab, or the runner's move on). A "no going back" section left closes for good, and a
// closed or gated section stays shut; the server, not the page, decides.
export const enterSection = action({ input: EnterSection, roles: TAKERS }, async (input, viewer) => {
  const { attempt, now, rules, visits } = await runningAttempt(viewer, input.submissionId);
  const from = attempt.currentSectionId ? String(attempt.currentSectionId) : null;
  const move = planSectionMove(rules, visits, from, input.sectionId, now, attempt.deadlineAt);
  if (!move.ok) {
    throw new AppError(
      'CLOSED',
      move.reason === 'closed'
        ? 'That section is closed.'
        : 'Finish the section before it first; it has no going back.',
    );
  }
  // At most ASSESSMENT_LIMITS.sections visits: the list is written whole, and only over the one read (two tabs).
  const next = [
    ...visits.map((visit) => (move.close.includes(visit.sectionId) ? { ...visit, closedAt: now } : visit)),
    ...(visits.some((visit) => visit.sectionId === input.sectionId)
      ? []
      : [{ sectionId: input.sectionId, startedAt: now, closedAt: null }]),
  ];
  const written = await Submission.updateOne(
    { _id: attempt._id, status: 'in_progress', visits: { $size: visits.length } },
    { $set: { currentSectionId: input.sectionId, visits: next } },
  );
  if (written.matchedCount === 0) throw new AppError('CONFLICT', 'Your test changed in another tab. Reload the page.');
});

// A count read as 0 matches an attempt that has none yet.
const asRead = (count: number) => (count === 0 ? { $in: [0, null] } : count);

// TP-08: the runner's beat (07 §15), every BEAT_MS and at once with what it noticed. A proctored attempt stays on one
// tab or device: another one still beating is refused, and recorded once as a serious warning. It records the events
// and any lost connection, hands the attempt in at the serious-warning limit, and answers with the deadline (the
// monitor may have added time), the serious warnings so far and the monitor's messages. Unproctored attempts beat too,
// for the monitor's "last seen", time and messages. 30 a minute (09 §4).
export const proctorBeat = action({ input: ProctorBeat, roles: TAKERS }, async (input, viewer) => {
  await db();
  const found = await Submission.findOne({ _id: input.submissionId, studentId: viewer.id }, { assessmentId: 1 }).lean();
  if (!found) throw new AppError('NOT_FOUND', 'Attempt not found.');
  await requireTake(viewer, String(found.assessmentId));
  await limit('proctor', viewer.id, 30, 60_000);
  const rules = (await Assessment.findById(found.assessmentId, { proctoring: 1 }).lean())?.proctoring ?? null;
  // A warning sent just as the clock beats arrives twice at once: each write is guarded by the tally it read, and
  // the one that loses reads again.
  for (let round = 0; round < 3; round++) {
    const attempt = await Submission.findById(found._id, { status: 1, deadlineAt: 1, endedBy: 1, proctor: 1 }).lean();
    if (!attempt) throw new AppError('NOT_FOUND', 'Attempt not found.');
    if (attempt.status !== 'in_progress') return { state: 'ended' as const, endedBy: attempt.endedBy ?? null };
    const now = new Date();
    if (isExpired(attempt, now)) {
      await handInAttempts([String(attempt._id)], now);
      return { state: 'ended' as const, endedBy: null };
    }
    const held = {
      hard: attempt.proctor?.hard ?? 0,
      soft: attempt.proctor?.soft ?? 0,
      lastHardAt: attempt.proctor?.lastHardAt ?? null,
      sessionId: attempt.proctor?.sessionId ?? null,
      lastBeatAt: attempt.proctor?.lastBeatAt ?? null,
    };
    const blocked = rules !== null && sessionCheck(held, input.sessionId, now) === 'clash';
    let tally = { hard: held.hard, soft: held.soft, lastHardAt: held.lastHardAt };
    let end = false;
    const events: { type: ProctorEvent; at: Date; counted: boolean; detail?: string }[] = [];
    const note = (type: ProctorEvent, detail?: string) => {
      if (!rules) return;
      const result = recordEvent(tally, type, now, rules.hardLimit);
      tally = result.tally;
      end ||= result.end;
      events.push({ type, at: now, counted: result.counted, ...(detail ? { detail } : {}) });
    };
    const tab = input.sessionId.slice(0, 8);
    if (blocked) {
      if (!attempt.proctor?.events.some((e) => e.type === 'second_device' && e.detail === tab)) note('second_device', tab);
    } else {
      const gap = connectionGap(held.lastBeatAt, now);
      if (gap !== null) note('connection_gap', `${gap} s`);
      for (const type of input.events) note(type);
    }
    const written = await Submission.updateOne(
      {
        _id: attempt._id,
        status: 'in_progress',
        'proctor.hard': asRead(held.hard),
        'proctor.soft': asRead(held.soft),
        'proctor.lastBeatAt': held.lastBeatAt,
      },
      {
        $set: {
          ...(blocked ? {} : { 'proctor.sessionId': input.sessionId, 'proctor.lastBeatAt': now }),
          'proctor.hard': tally.hard,
          'proctor.soft': tally.soft,
          'proctor.lastHardAt': tally.lastHardAt,
        },
        ...(events.length > 0
          ? { $push: { 'proctor.events': { $each: events, $slice: -PROCTOR_LIMITS.events } } }
          : {}),
      },
    );
    if (written.matchedCount === 0) continue;
    if (end) {
      await handInAttempts([String(attempt._id)], now, 'warnings');
      return { state: 'ended' as const, endedBy: 'warnings' as const };
    }
    return {
      state: blocked ? ('blocked' as const) : ('live' as const),
      hard: tally.hard,
      deadlineAt: attempt.deadlineAt,
      messages: (attempt.proctor?.messages ?? []).map((m) => ({ id: String(m._id), text: m.text, at: m.at })),
    };
  }
  throw new AppError('CONFLICT', 'Your test changed in another tab. Reload the page.');
});

// TP-08: a camera snapshot the runner uploaded (createUpload checked the attempt, the test's camera rule and the
// limit), recorded while the attempt runs. Only staff see it (09 §11).
export const addSnapshot = action({ input: AddSnapshot, roles: TAKERS }, async (input, viewer) => {
  const { attempt, now } = await runningAttempt(viewer, input.submissionId);
  const owner = parseKey(input.key);
  if (
    !owner ||
    owner.purpose !== 'proctor-snapshot' ||
    owner.contextId !== input.submissionId ||
    owner.userId !== viewer.id
  ) {
    throw new AppError('VALIDATION', 'That snapshot is not from this attempt.');
  }
  const written = await Submission.updateOne(
    {
      _id: attempt._id,
      status: 'in_progress',
      [`proctor.snapshots.${PROCTOR_LIMITS.snapshots - 1}`]: { $exists: false },
      'proctor.snapshots.key': { $ne: input.key },
    },
    { $push: { 'proctor.snapshots': { key: input.key, at: now } } },
  );
  if (written.matchedCount === 0) throw new AppError('CONFLICT', 'No more snapshots are kept for this attempt.');
});

// T5: the student's Submit, or the runner's at 0:00 (handInAttempts marks that one as the timer's).
export const submitAttempt = action({ input: SubmissionRef, roles: TAKERS }, async ({ submissionId }, viewer) => {
  await db();
  const attempt = await Submission.findOne({ _id: submissionId, studentId: viewer.id }, { assessmentId: 1 }).lean();
  if (!attempt) throw new AppError('NOT_FOUND', 'Attempt not found.');
  const offeringId = await requireTake(viewer, String(attempt.assessmentId));
  await handInAttempts([submissionId], new Date());
  redirect(assessmentPath(offeringId, String(attempt.assessmentId)));
});
