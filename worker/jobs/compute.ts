import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { type Types } from 'mongoose';
import { handInAttempts, totalOf } from '@/lib/data/attempts';
import { addEngagement, type EngagementRow } from '@/lib/data/engagement';
import { notify } from '@/lib/data/notify';
import { releaseResults } from '@/lib/data/results';
import { countedAttempt, windowState } from '@/lib/domain/attempts';
import { deriveAttendance } from '@/lib/domain/attendance';
import { codeItemMarks, testStatus } from '@/lib/domain/code';
import { histogram, itemStats, rankAll, type ItemRow } from '@/lib/domain/results';
import { plainText } from '@/lib/domain/rich-text';
import { roundHalfUp } from '@/lib/domain/round';
import { similarPairs } from '@/lib/domain/similarity';
import { assessmentPath } from '@/lib/domain/test-links';
import { closeRoom, muteMicrophone, roomPeople, setRights, tell } from '@/lib/integrations/live';
import { runBatch, type RunJob } from '@/lib/integrations/code-runner';
import { deleteObjects } from '@/lib/integrations/storage';
import { formatDateTime } from '@/lib/format';
import { log } from '@/lib/log';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { BankItem } from '@/lib/models/bank-item';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import { TestGrant } from '@/lib/models/test-grant';
import { TestStats } from '@/lib/models/test-stats';
import { User } from '@/lib/models/user';
import { queueLiveFinalize, queueTestStats } from '@/lib/queue';
import { RESULT_LIMITS, type RunStatus } from '@/lib/schemas/assessment';
import { RichTextDoc } from '@/lib/schemas/common';
import {
  AssessmentSweepJob,
  FinalizeLiveJob,
  GradeCodeJob,
  LiveControlJob,
  LiveSweepJob,
  ProctorRetentionJob,
  TestStatsJob,
} from '@/lib/schemas/jobs';
import { ALL_RIGHTS } from '@/lib/schemas/live';
import { SETTINGS } from '@/lib/schemas/settings';

type ComputeName =
  | 'finalizeLiveSession'
  | 'liveSweep'
  | 'liveControl'
  | 'assessmentSweep'
  | 'proctorRetention'
  | 'gradeCode'
  | 'testStats';
type ComputeData =
  | FinalizeLiveJob
  | LiveSweepJob
  | LiveControlJob
  | AssessmentSweepJob
  | ProctorRetentionJob
  | GradeCodeJob
  | TestStatsJob;
type Ops = Parameters<typeof Attendance.bulkWrite>[0];

const MINUTE_MS = 60_000;

// 07 §10 (ATT-03, LIV-04). The claim and every write commit together: a crash rolls the claim back so the retry
// redoes the work, and a second run finds nothing to claim.
async function finalizeLiveSession({ sessionId }: FinalizeLiveJob): Promise<void> {
  // getSettings is cached for the web process; the worker reads the key itself.
  const stored = await Setting.findById('attendance', { value: 1 }).lean();
  const { liveThresholdPct } = SETTINGS.attendance.schema.parse(stored?.value ?? {});
  const students = await mongoose.connection.transaction(async (session) => {
    const live = await LiveSession.findOneAndUpdate(
      { _id: sessionId, status: 'ended', finalizedAt: null },
      { $set: { finalizedAt: new Date() } },
      { session, projection: { offeringId: 1, startedAt: 1, endedAt: 1, attendanceMode: 1 } },
    ).lean();
    // Already finalized, or a class that never started: no attendance.
    if (!live?.startedAt || !live.endedAt) return 0;
    const { startedAt, endedAt, offeringId, attendanceMode } = live;
    const [enrolled, rows] = await Promise.all([
      Enrollment.distinct('studentId', { offeringId, status: 'active' }).session(session),
      Attendance.find({ sessionId }, { studentId: 1, presence: 1 }).session(session).lean(),
    ]);
    const presence = new Map(
      rows.map((row) => [
        String(row.studentId),
        row.presence.map(({ joinedAt, leftAt }) => ({ joinedAt, leftAt: leftAt ?? null })),
      ]),
    );
    const ops: Ops = [];
    const engagement: EngagementRow[] = [];
    for (const studentId of enrolled) {
      const key = { sessionId, studentId };
      const derived = deriveAttendance(presence.get(String(studentId)) ?? [], startedAt, endedAt, liveThresholdPct);
      ops.push({
        updateOne: {
          filter: key,
          update: {
            $set: { presenceSec: derived.presenceSec },
            $setOnInsert: { offeringId, source: 'derived', presence: [], focusedSec: 0 },
          },
          upsert: true,
        },
      });
      // AC-M03-03: a teacher's mark is never overwritten. In a manual class only unmarked students get a status.
      ops.push({
        updateOne:
          attendanceMode === 'derived'
            ? { filter: { ...key, source: { $ne: 'manual' } }, update: { $set: { status: derived.status } } }
            : { filter: { ...key, status: { $exists: false } }, update: { $set: { status: 'absent' } } },
      });
      engagement.push({
        offeringId: String(offeringId),
        studentId: String(studentId),
        at: startedAt,
        inc: { liveSec: derived.presenceSec },
      });
    }
    // Ordered, so each student's row exists before its status is set.
    if (ops.length > 0) await Attendance.bulkWrite(ops, { session });
    await addEngagement(engagement, session);
    return enrolled.length;
  });
  log.info('live session finalized', { sessionId, students });
}

// The hourly scheduler `liveSweep` (02 §8): classes nobody ended, and ended classes whose finalize never ran.
async function liveSweep(now: Date): Promise<void> {
  const overdue = await LiveSession.find(
    { status: 'live', scheduledEnd: { $lt: new Date(now.getTime() - 30 * MINUTE_MS) } },
    { roomName: 1, scheduledEnd: 1 },
  )
    .limit(100)
    .lean();
  for (const { _id, roomName, scheduledEnd } of overdue) {
    await closeRoom(roomName);
    await LiveSession.updateOne({ _id, status: 'live' }, { $set: { status: 'ended', endedAt: scheduledEnd } });
  }
  const unfinalized = await LiveSession.find(
    { status: 'ended', finalizedAt: null, endedAt: { $lt: new Date(now.getTime() - 10 * MINUTE_MS) } },
    { _id: 1 },
  )
    .limit(100)
    .lean();
  for (const { _id } of [...overdue, ...unfinalized]) await queueLiveFinalize(String(_id));
  log.info('live sweep', { ended: overdue.length, finalizing: unfinalized.length });
}

// M03c T2: once the class has ended there is no room to change.
async function liveControl(job: LiveControlJob): Promise<void> {
  const live = await LiveSession.findOne(
    { _id: job.sessionId, status: 'live' },
    { roomName: 1, studentsMay: 1 },
  ).lean();
  if (!live) return;
  const people = await roomPeople(live.roomName);
  if (job.op === 'rights') {
    const rights = { ...ALL_RIGHTS, ...live.studentsMay };
    await Promise.all(people.filter((p) => !p.host).map((p) => setRights(live.roomName, p.identity, rights)));
    return;
  }
  const others = people.filter((p) => p.identity !== job.byId);
  await Promise.all(others.map((p) => muteMicrophone(live.roomName, p.identity, p.microphones)));
  if (others.length > 0) {
    await tell(
      live.roomName,
      'notice',
      `${job.byName} muted everyone`,
      others.map((p) => p.identity),
    );
  }
}

// The hourly scheduler `assessmentSweep` (02 §8, M04 T8): the 24-hour reminder (COM-03) to students who have not
// handed in (for a standalone test, those its links let in, M04b), claimed once per assessment by `dueNotifiedAt`; then every attempt whose deadline passed more than five
// minutes ago (a closed tab) is handed in, in batches, through the same path as the student's Submit.
async function assessmentSweep(now: Date): Promise<void> {
  const due = await Assessment.find(
    {
      status: 'published',
      closesAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 60 * MINUTE_MS) },
      dueNotifiedAt: null,
    },
    { offeringId: 1, title: 1, closesAt: 1 },
  )
    .limit(100)
    .lean();
  let reminded = 0;
  for (const assessment of due) {
    const claimed = await Assessment.updateOne(
      { _id: assessment._id, dueNotifiedAt: null },
      { $set: { dueNotifiedAt: now } },
    );
    if (claimed.modifiedCount === 0) continue;
    const offeringId = assessment.offeringId ? String(assessment.offeringId) : null;
    const [takers, handedIn, offering] = await Promise.all([
      offeringId
        ? Enrollment.distinct('studentId', { offeringId, status: 'active' })
        : TestGrant.distinct('userId', { assessmentId: assessment._id }),
      Submission.distinct('studentId', { assessmentId: assessment._id, status: { $in: ['submitted', 'graded'] } }),
      offeringId ? Offering.findById(offeringId, { title: 1 }).lean() : null,
    ]);
    const done = new Set(handedIn.map(String));
    const title = `Due ${formatDateTime(assessment.closesAt)}: ${assessment.title}${offering ? ` (${offering.title})` : ''}`;
    await notify(
      takers.map(String).filter((id) => !done.has(id)),
      {
        kind: 'assessment.dueSoon',
        title: title.length > 160 ? `${title.slice(0, 159)}…` : title,
        href: assessmentPath(offeringId, String(assessment._id)),
      },
    );
    reminded++;
  }
  let handedIn = 0;
  for (let batch = 0; batch < 20; batch++) {
    const expired = await Submission.find(
      { status: 'in_progress', deadlineAt: { $lt: new Date(now.getTime() - 5 * MINUTE_MS) } },
      { _id: 1 },
    )
      .limit(500)
      .lean();
    if (expired.length === 0) break;
    handedIn += await handInAttempts(
      expired.map((s) => String(s._id)),
      now,
    );
    if (expired.length < 500) break;
  }
  // TP-11: a test whose rule publishes its results does so once it has closed, nobody is writing and every hand-in
  // is marked; the audit log names whoever chose the rule.
  const closed = await Assessment.find(
    { 'results.release': 'on_close', status: 'published', closesAt: { $lte: now } },
    { title: 1, offeringId: 1, opensAt: 1, closesAt: 1, lateUntil: 1, results: 1, createdBy: 1 },
  )
    .limit(100)
    .lean();
  let released = 0;
  for (const test of closed) {
    const state = windowState({
      now,
      opensAt: test.opensAt,
      closesAt: test.closesAt,
      lateUntil: test.lateUntil ?? null,
    });
    if (state !== 'closed') continue;
    if (await Submission.exists({ assessmentId: test._id, status: { $in: ['in_progress', 'submitted'] } })) continue;
    const actor = String(test.results?.setBy ?? test.createdBy);
    if (await releaseResults(test, actor, now, 'Published by its release rule')) released++;
  }
  log.info('assessment sweep', { reminded, handedIn, released });
}

// The daily scheduler `proctorRetention` (05 §8, M04b TP-08): the camera snapshots of tests whose results went out
// more than `snapshotRetentionDays` ago are deleted from storage, then from their attempts, and the test is marked
// done. Storage goes first, so a crash between the two only repeats a deletion.
async function proctorRetention(now: Date): Promise<void> {
  const stored = await Setting.findById('proctoring', { value: 1 }).lean();
  const { snapshotRetentionDays } = SETTINGS.proctoring.schema.parse(stored?.value ?? {});
  const tests = await Assessment.find(
    {
      'proctoring.camera': true,
      snapshotsDeletedAt: null,
      resultsPublishedAt: { $lt: new Date(now.getTime() - snapshotRetentionDays * 24 * 60 * MINUTE_MS) },
    },
    { _id: 1 },
  )
    .limit(50)
    .lean();
  let deleted = 0;
  for (const test of tests) {
    // At most PROCTOR_LIMITS.snapshots keys per attempt, so a batch of 100 attempts is at most 24,000 keys.
    for (let batch = 0; batch < 1000; batch++) {
      const attempts = await Submission.find(
        { assessmentId: test._id, 'proctor.snapshots.0': { $exists: true } },
        { proctor: 1 },
      )
        .limit(100)
        .lean();
      if (attempts.length === 0) break;
      const keys = attempts.flatMap((attempt) => attempt.proctor?.snapshots.map((snapshot) => snapshot.key) ?? []);
      await deleteObjects(keys);
      await Submission.updateMany(
        { _id: { $in: attempts.map((attempt) => attempt._id) } },
        { $set: { 'proctor.snapshots': [] } },
      );
      deleted += keys.length;
    }
    await Assessment.updateOne({ _id: test._id }, { $set: { snapshotsDeletedAt: now } });
  }
  log.info('proctor retention', { tests: tests.length, deleted });
}

// `compute/gradeCode` (06 §6, TP-09, LAB-05): each answered code question of a handed-in attempt is run on all its
// tests, hidden ones too, and marked by the weight of the tests it passed (07 §14); an unanswered one scores 0, and one
// in a language the setting no longer has fails every test. A mark a grader gave stays. Results and marks replace the
// last run's, so a repeat changes nothing; the write is guarded by the attempt's `updatedAt`, so a grader saving at the
// same moment makes this read again. A runner failure throws, and BullMQ retries.
async function gradeCode({ submissionId }: GradeCodeJob): Promise<void> {
  const stored = await Setting.findById('codeRunner', { value: 1 }).lean();
  const { languages } = SETTINGS.codeRunner.schema.parse(stored?.value ?? {});
  const attempt = await Submission.findById(submissionId, { status: 1, paper: 1, answers: 1 }).lean();
  if (!attempt || attempt.status === 'in_progress') return;
  const jobs: RunJob[] = [];
  const tests: { itemId: Types.ObjectId; testCaseId: Types.ObjectId; expected: string; run: number | null }[] = [];
  for (const item of attempt.paper) {
    if (item.type !== 'code' || !item.code) continue;
    const answer = attempt.answers?.[String(item._id)]?.code;
    if (!answer || answer.source.trim() === '') continue;
    const language = item.code.languages.includes(answer.language)
      ? languages.find((l) => l.key === answer.language)
      : undefined;
    for (const test of item.code.testCases) {
      tests.push({
        itemId: item._id,
        testCaseId: test._id,
        expected: test.expected,
        run: language ? jobs.length : null,
      });
      if (language) {
        jobs.push({
          runnerLanguageId: language.runnerId,
          source: answer.source,
          stdin: test.input,
          timeLimitSec: item.code.timeLimitSec,
          memoryKb: item.code.memoryKb,
        });
      }
    }
  }
  const runs = await runBatch(jobs);
  const results = tests.map((test) => {
    const run = test.run === null ? undefined : runs[test.run];
    const status: RunStatus = run ? testStatus(run.status, run.stdout, test.expected) : 'internal_error';
    return {
      itemId: test.itemId,
      testCaseId: test.testCaseId,
      status,
      timeMs: run?.timeMs ?? null,
      memoryKb: run?.memoryKb ?? null,
    };
  });
  const codeMarks = new Map(
    attempt.paper.flatMap((item) =>
      item.type === 'code' && item.code
        ? [
            [
              String(item._id),
              codeItemMarks(
                item.maxMarks,
                item.code.testCases.map((test) => ({
                  weight: test.weight,
                  passed: results.some(
                    (r) => r.itemId.equals(item._id) && r.testCaseId.equals(test._id) && r.status === 'accepted',
                  ),
                })),
              ),
            ] as const,
          ]
        : [],
    ),
  );
  for (let round = 0; round < 3; round++) {
    const current = await Submission.findById(submissionId, {
      assessmentId: 1,
      status: 1,
      paper: 1,
      scores: 1,
      proctor: 1,
      updatedAt: 1,
    }).lean();
    if (!current || current.status === 'in_progress') return;
    const scores = { ...current.scores };
    for (const [itemId, marks] of codeMarks) {
      const kept = scores[itemId];
      if (!kept || kept.by === 'auto') scores[itemId] = { marks, by: 'auto' };
    }
    const rules = await Assessment.findById(current.assessmentId, { proctoring: 1 }).lean();
    const total = totalOf(current.paper, scores, rules?.proctoring, current.proctor);
    const now = new Date();
    const written = await Submission.updateOne(
      { _id: submissionId, status: { $ne: 'in_progress' }, updatedAt: current.updatedAt },
      {
        $set: {
          results,
          scores,
          total,
          status: total === null ? 'submitted' : 'graded',
          codeGradedAt: now,
          ...(total === null ? {} : { gradedAt: now }),
        },
      },
    );
    if (written.matchedCount > 0) {
      log.info('code graded', { submissionId, runs: jobs.length });
      // Marks changed after the results went out: ranks follow.
      const test = await Assessment.findById(current.assessmentId, { status: 1 }).lean();
      if (test?.status === 'results_published') await queueTestStats(String(current.assessmentId));
      return;
    }
  }
  throw new Error('The attempt kept changing while its code was marked; the job will try again.');
}

const plainOf = (value: unknown) => {
  const doc = RichTextDoc.safeParse(value);
  return doc.success ? plainText(doc.data) : '';
};
const titleOf = (prompt: unknown) => {
  const text = plainOf(prompt).replace(/\s+/g, ' ').trim();
  return (text.length > 117 ? `${text.slice(0, 116)}…` : text) || 'Question';
};

type StatsRow = {
  _id: Types.ObjectId;
  total: number;
  scores: Record<string, { marks: number } | undefined>;
  paper: {
    _id: Types.ObjectId;
    type: string;
    maxMarks: number;
    bankItemId: Types.ObjectId | null;
    sectionId: Types.ObjectId | null;
    coIds: Types.ObjectId[];
    options: { _id: Types.ObjectId; text: string }[] | null;
    answer: { optionId?: Types.ObjectId; truth?: boolean } | null;
  }[];
  picks: { k: string; optionId?: Types.ObjectId; truth?: boolean }[];
};

// `compute/testStats` (06 §6, TP-11, 07 §19): a test's results over each taker's counted attempt — rank and percentile
// on those attempts (cleared on the others), the histogram, item analysis (a drawn question by its bank id, across
// papers), alike written and code answers, and the leaderboard — into `testStats`, rebuilt whole, so a repeat writes
// the same. Attempts are read slim and in batches.
async function testStats({ assessmentId }: TestStatsJob): Promise<void> {
  const test = await Assessment.findById(assessmentId, { attemptPolicy: 1, maxMarks: 1, items: 1, sections: 1 }).lean();
  if (!test) return;
  const attempts = await Submission.find(
    { assessmentId: test._id, status: { $ne: 'in_progress' } },
    { studentId: 1, attemptNo: 1, status: 1, total: 1 },
  ).lean();
  const byStudent = Map.groupBy(attempts, (attempt) => String(attempt.studentId));
  const counted = [...byStudent.values()].flatMap((mine) => countedAttempt(mine, test.attemptPolicy) ?? []);
  const pctOf = (total: number) => (test.maxMarks > 0 ? roundHalfUp((100 * total) / test.maxMarks, 2) : 0);

  const ranks = rankAll(counted.map((attempt) => ({ id: String(attempt._id), total: attempt.total })));
  await Submission.updateMany(
    { assessmentId: test._id, rank: { $ne: null } },
    { $set: { rank: null, percentile: null } },
  );
  if (counted.length > 0) {
    await Submission.bulkWrite(
      counted.map((attempt) => ({
        updateOne: { filter: { _id: attempt._id }, update: { $set: { ...ranks.get(String(attempt._id)) } } },
      })),
    );
  }

  const rows: ItemRow[] = [];
  const meta = new Map<
    string,
    {
      type: string;
      sectionId: Types.ObjectId | null;
      coIds: Types.ObjectId[];
      right: string | null;
      options: Map<string, string>;
    }
  >();
  for (let at = 0; at < counted.length; at += 500) {
    const docs = await Submission.aggregate<StatsRow>([
      { $match: { _id: { $in: counted.slice(at, at + 500).map((attempt) => attempt._id) } } },
      {
        $project: {
          total: 1,
          scores: 1,
          paper: {
            $map: {
              input: '$paper',
              as: 'p',
              in: {
                _id: '$$p._id',
                type: '$$p.type',
                maxMarks: '$$p.maxMarks',
                bankItemId: { $ifNull: ['$$p.bankItemId', null] },
                sectionId: { $ifNull: ['$$p.sectionId', null] },
                coIds: { $ifNull: ['$$p.coIds', []] },
                options: { $ifNull: ['$$p.options', null] },
                answer: { $ifNull: ['$$p.answer', null] },
              },
            },
          },
          picks: {
            $map: {
              input: { $objectToArray: { $ifNull: ['$answers', {}] } },
              as: 'a',
              in: { k: '$$a.k', optionId: '$$a.v.optionId', truth: '$$a.v.truth' },
            },
          },
        },
      },
    ]);
    for (const doc of docs) {
      const picks = new Map(doc.picks.map((pick) => [pick.k, pick]));
      const items: Record<string, { earned: number; picked: string | null }> = {};
      for (const item of doc.paper) {
        const score = doc.scores?.[String(item._id)];
        if (!score) continue;
        const key = String(item.bankItemId ?? item._id);
        const pick = picks.get(String(item._id));
        const picked =
          item.type === 'mcq' && pick?.optionId
            ? String(pick.optionId)
            : item.type === 'true_false' && typeof pick?.truth === 'boolean'
              ? String(pick.truth)
              : null;
        items[key] = { earned: item.maxMarks > 0 ? Math.min(1, Math.max(0, score.marks / item.maxMarks)) : 0, picked };
        if (!meta.has(key)) {
          meta.set(key, {
            type: item.type,
            sectionId: item.sectionId,
            coIds: item.coIds,
            right:
              item.type === 'mcq' && item.answer?.optionId
                ? String(item.answer.optionId)
                : item.type === 'true_false' && typeof item.answer?.truth === 'boolean'
                  ? String(item.answer.truth)
                  : null,
            options: new Map([
              ...(item.options ?? []).map((option): [string, string] => [String(option._id), option.text]),
              ['true', 'True'],
              ['false', 'False'],
            ]),
          });
        }
      }
      rows.push({ pct: pctOf(doc.total), items });
    }
  }
  const analysed = itemStats(rows, (key) => meta.get(key)?.right ?? null);
  const fixed = new Map(test.items.map((item) => [String(item._id), item.prompt]));
  const drawn = await BankItem.find(
    { _id: { $in: [...meta.keys()].filter((key) => !fixed.has(key)) } },
    { prompt: 1 },
  ).lean();
  const prompts = new Map([...fixed, ...drawn.map((doc): [string, unknown] => [String(doc._id), doc.prompt])]);
  const sectionTitle = new Map(test.sections.map((section) => [String(section._id), section.title]));

  // Alike answers to the test's own written and code questions (drawn ones are all marked automatically), at most
  // 600 answers a question.
  const alike = new Map<string, { submissionId: Types.ObjectId; itemId: Types.ObjectId; score: number }[]>();
  const countedIds = counted.map((attempt) => attempt._id);
  for (const item of test.items) {
    if (item.type !== 'text' && item.type !== 'code') continue;
    const path = `answers.${String(item._id)}`;
    const answered = await Submission.aggregate<{
      _id: Types.ObjectId;
      answer: { code?: { source?: string }; text?: unknown };
    }>([
      { $match: { _id: { $in: countedIds }, [path]: { $exists: true } } },
      { $limit: 600 },
      { $project: { answer: `$${path}` } },
    ]);
    const texts = answered.flatMap((doc) => {
      const text = item.type === 'code' ? (doc.answer.code?.source ?? '') : plainOf(doc.answer.text);
      return text ? [{ id: String(doc._id), text }] : [];
    });
    for (const pair of similarPairs(texts)) {
      for (const [one, other] of [
        [pair.a, pair.b],
        [pair.b, pair.a],
      ]) {
        const list = alike.get(one) ?? [];
        list.push({ submissionId: new mongoose.Types.ObjectId(other), itemId: item._id, score: pair.score });
        alike.set(one, list);
      }
    }
  }
  await Submission.updateMany({ assessmentId: test._id, 'similar.0': { $exists: true } }, { $set: { similar: [] } });
  if (alike.size > 0) {
    await Submission.bulkWrite(
      [...alike].map(([id, list]) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { similar: list.sort((a, b) => b.score - a.score).slice(0, RESULT_LIMITS.similar) } },
        },
      })),
    );
  }

  const top = counted
    .map((attempt) => ({ attempt, rank: ranks.get(String(attempt._id))?.rank ?? 0 }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, RESULT_LIMITS.leaderboard);
  const people = await User.find({ _id: { $in: top.map((t) => t.attempt.studentId) } }, { name: 1 }).lean();
  const nameOf = new Map(people.map((person) => [String(person._id), person.name]));
  const pcts = counted.map((attempt) => pctOf(attempt.total));
  await TestStats.replaceOne(
    { _id: test._id },
    {
      _id: test._id,
      computedAt: new Date(),
      takers: counted.length,
      averagePct: pcts.length > 0 ? roundHalfUp(pcts.reduce((sum, pct) => sum + pct, 0) / pcts.length, 2) : null,
      highestPct: pcts.length > 0 ? Math.max(...pcts) : null,
      histogram: histogram(pcts),
      items: [...analysed].slice(0, RESULT_LIMITS.statsItems).map(([key, stat]) => {
        const about = meta.get(key);
        return {
          key: new mongoose.Types.ObjectId(key),
          type: about?.type ?? 'text',
          title: titleOf(prompts.get(key)),
          sectionTitle: about?.sectionId ? (sectionTitle.get(String(about.sectionId)) ?? null) : null,
          coIds: about?.coIds ?? [],
          n: stat.n,
          correctPct: stat.correctPct,
          discrimination: stat.discrimination,
          wrongPick: stat.wrongPick
            ? { text: about?.options.get(stat.wrongPick.optionId) ?? 'Another option', pct: stat.wrongPick.pct }
            : null,
        };
      }),
      flagged: alike.size,
      leaderboard: top.map(({ attempt, rank }) => ({
        studentId: attempt.studentId,
        name: nameOf.get(String(attempt.studentId)) ?? 'Unknown',
        total: attempt.total,
        rank,
      })),
    },
    { upsert: true },
  );
  log.info('test stats', { assessmentId, takers: counted.length, flagged: alike.size });
}

async function run(job: Job<ComputeData, void, ComputeName>): Promise<void> {
  if (job.name === 'finalizeLiveSession') return finalizeLiveSession(FinalizeLiveJob.parse(job.data));
  if (job.name === 'liveControl') return liveControl(LiveControlJob.parse(job.data));
  if (job.name === 'assessmentSweep') {
    AssessmentSweepJob.parse(job.data);
    return assessmentSweep(new Date());
  }
  if (job.name === 'gradeCode') return gradeCode(GradeCodeJob.parse(job.data));
  if (job.name === 'testStats') return testStats(TestStatsJob.parse(job.data));
  if (job.name === 'proctorRetention') {
    ProctorRetentionJob.parse(job.data);
    return proctorRetention(new Date());
  }
  LiveSweepJob.parse(job.data);
  return liveSweep(new Date());
}

export function startComputeWorker(redisUrl: string): Worker<ComputeData, void, ComputeName> {
  const worker = new Worker<ComputeData, void, ComputeName>('compute', run, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    concurrency: 4,
  });
  worker.on('failed', (job, error) =>
    log.error('job failed', { queue: 'compute', id: job?.id, attemptsMade: job?.attemptsMade, error }),
  );
  return worker;
}
