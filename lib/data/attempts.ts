import 'server-only';
import mongoose, { Types } from 'mongoose';
import { addEngagement } from '@/lib/data/engagement';
import { isLate } from '@/lib/domain/attempts';
import { attemptTotal, autoGrade } from '@/lib/domain/grading';
import { Assessment } from '@/lib/models/assessment';
import { Submission } from '@/lib/models/submission';

// A save sent just before 0:00 may arrive a moment after the deadline (M04 T5).
export const SAVE_GRACE_MS = 5_000;

const ids = (values: readonly Types.ObjectId[] | null | undefined) => (values ?? []).map(String);

// The one way an attempt is handed in (M04 T5, T8): the student's Submit, a save after time ran out, resuming an
// expired attempt, publishResults and the hourly sweep. Objective questions are marked at once (07 §14); when every
// question is marked the attempt is graded. An attempt handed in at or after its deadline is the timer's: its time is
// the deadline, so a sweep that comes later does not make it late (A-M04-3). The change is written only while the
// attempt is still in progress, together with its engagement counters, so a second run changes nothing. The worker
// calls this too, so the file imports nothing from next/* or the session.
export async function handInAttempts(submissionIds: readonly string[], now: Date): Promise<number> {
  const attempts = await Submission.find(
    { _id: { $in: submissionIds }, status: 'in_progress' },
    { assessmentId: 1, offeringId: 1, studentId: 1, deadlineAt: 1, answers: 1 },
  ).lean();
  if (attempts.length === 0) return 0;
  const assessments = await Assessment.find(
    { _id: { $in: [...new Set(attempts.map((a) => String(a.assessmentId)))] } },
    { closesAt: 1, items: 1 },
  ).lean();
  const assessmentOf = new Map(assessments.map((a) => [String(a._id), a]));
  let handedIn = 0;
  for (const attempt of attempts) {
    const assessment = assessmentOf.get(String(attempt.assessmentId));
    if (!assessment) continue;
    const timeUp = now >= attempt.deadlineAt;
    const submittedAt = timeUp ? attempt.deadlineAt : now;
    const late = isLate(submittedAt, assessment.closesAt);
    const scores: Record<string, { marks: number; by: string }> = {};
    for (const item of assessment.items) {
      const given = attempt.answers?.[String(item._id)];
      const key = item.answer;
      const marks = autoGrade(
        {
          type: item.type,
          maxMarks: item.maxMarks,
          answer: key
            ? {
                optionId: key.optionId ? String(key.optionId) : null,
                optionIds: ids(key.optionIds),
                value: key.value,
                tolerance: key.tolerance,
              }
            : null,
        },
        given
          ? {
              optionId: given.optionId ? String(given.optionId) : null,
              optionIds: ids(given.optionIds),
              value: given.value,
            }
          : null,
      );
      if (marks !== null) scores[String(item._id)] = { marks, by: 'auto' };
    }
    const total = attemptTotal(
      assessment.items.map((item) => String(item._id)),
      scores,
    );
    const changed = await mongoose.connection.transaction(async (session) => {
      const written = await Submission.updateOne(
        { _id: attempt._id, status: 'in_progress' },
        {
          $set: {
            status: total === null ? 'submitted' : 'graded',
            submittedAt,
            late,
            autoSubmitted: timeUp,
            scores,
            total,
            ...(total === null ? {} : { gradedAt: now }),
          },
        },
        { session },
      );
      if (written.modifiedCount === 0) return false;
      // ENG-01 signals (05 §7.1), counted on the day it was handed in; a standalone test has no course to count in.
      if (!attempt.offeringId) return true;
      await addEngagement(
        [
          {
            offeringId: String(attempt.offeringId),
            studentId: String(attempt.studentId),
            at: submittedAt,
            inc: { submissions: 1, onTimeSubmissions: late ? 0 : 1 },
          },
        ],
        session,
      );
      return true;
    });
    if (changed) handedIn++;
  }
  return handedIn;
}
