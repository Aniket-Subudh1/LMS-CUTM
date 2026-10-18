import 'server-only';
import mongoose, { type Types } from 'mongoose';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/data/notify';
import { db } from '@/lib/db';
import { proctorPenalty } from '@/lib/domain/proctoring';
import { bandOf, breakdown } from '@/lib/domain/results';
import { docOf, plainText } from '@/lib/domain/rich-text';
import { roundHalfUp } from '@/lib/domain/round';
import { earnsCertificate } from '@/lib/domain/test-files';
import { assessmentPath } from '@/lib/domain/test-links';
import { Assessment, type AssessmentDoc } from '@/lib/models/assessment';
import { Course } from '@/lib/models/course';
import { Offering } from '@/lib/models/offering';
import { Submission, type SubmissionDoc } from '@/lib/models/submission';
import { TestStats } from '@/lib/models/test-stats';
import { User } from '@/lib/models/user';
import { queueTestStats } from '@/lib/queue';
import type { ReleaseRule } from '@/lib/schemas/assessment';

export type PaperItem = SubmissionDoc['paper'][number];
type StoredAnswer = NonNullable<SubmissionDoc['answers']>[string];

// TP-11: when a test's results go out and what they show (an assessment saved before M04b has none: the defaults).
export type ResultRules = {
  release: ReleaseRule;
  showAnswers: boolean;
  showExplanations: boolean;
  leaderboard: boolean;
  // TP-12: certificates from this percentage; null gives none.
  certificateFromPct: number | null;
  bands: { label: string; minPct: number }[];
};

export const rulesOf = ({ results: r }: Pick<AssessmentDoc, 'results'>): ResultRules => ({
  release: r?.release ?? 'manual',
  showAnswers: r?.showAnswers ?? false,
  showExplanations: r?.showExplanations ?? false,
  leaderboard: r?.leaderboard ?? false,
  certificateFromPct: r?.certificateFromPct ?? null,
  bands: (r?.bands ?? []).map((band) => ({ label: band.label, minPct: band.minPct })),
});

// An answer in words, for the results page (TP-11) and the files made from it (TP-12). Written and uploaded answers say
// what they are; code is called `code` ("Your code" to its writer).
export function givenText(item: PaperItem, answer: StoredAnswer | undefined, code: string): string | null {
  const option = (id: Types.ObjectId) => item.options?.find((o) => o._id.equals(id))?.text ?? '?';
  switch (item.type) {
    case 'mcq':
      return answer?.optionId ? option(answer.optionId) : null;
    case 'msq':
      return answer?.optionIds?.length ? answer.optionIds.map(option).join(', ') : null;
    case 'ordering':
      return answer?.optionIds?.length ? answer.optionIds.map(option).join(' → ') : null;
    case 'true_false':
      return typeof answer?.truth === 'boolean' ? (answer.truth ? 'True' : 'False') : null;
    case 'numeric':
      return typeof answer?.value === 'number' ? String(answer.value) : null;
    case 'fill_blank':
      return answer?.texts?.some((text) => text.trim()) ? answer.texts.join(' · ') : null;
    case 'matching': {
      const right = new Map((item.pairs ?? []).map((pair) => [String(pair.rightId), pair.right]));
      const left = new Map((item.pairs ?? []).map((pair) => [String(pair._id), pair.left]));
      return answer?.matches?.length
        ? answer.matches.map((m) => `${left.get(String(m.left))} → ${right.get(String(m.right))}`).join('; ')
        : null;
    }
    case 'text': {
      const text = plainText(docOf(answer?.text)).trim();
      return text ? (text.length > 200 ? `${text.slice(0, 199)}…` : text) : null;
    }
    case 'code':
      return answer?.code?.source.trim() ? code : null;
    case 'file':
      return answer?.files?.length ? `${answer.files.length} file${answer.files.length === 1 ? '' : 's'}` : null;
  }
}

export function correctText(item: PaperItem): string | null {
  const key = item.answer;
  const option = (id: Types.ObjectId) => item.options?.find((o) => o._id.equals(id))?.text ?? '?';
  switch (item.type) {
    case 'mcq':
      return key?.optionId ? option(key.optionId) : null;
    case 'msq':
      return key?.optionIds ? key.optionIds.map(option).join(', ') : null;
    case 'ordering':
      return key?.optionIds ? key.optionIds.map(option).join(' → ') : null;
    case 'true_false':
      return typeof key?.truth === 'boolean' ? (key.truth ? 'True' : 'False') : null;
    case 'numeric':
      return typeof key?.value === 'number' ? `${key.value}${key.tolerance ? ` ± ${key.tolerance}` : ''}` : null;
    case 'fill_blank':
      return item.blanks ? item.blanks.map((blank) => blank.accepted[0] ?? '').join(' · ') : null;
    case 'matching':
      return item.pairs ? item.pairs.map((pair) => `${pair.left} → ${pair.right}`).join('; ') : null;
    case 'text':
    case 'code':
    case 'file':
      return null;
  }
}

export type ResultFigures = {
  total: number;
  maxMarks: number;
  pct: number;
  // TP-11: the recommendation band the percentage reaches ("Recommended"), if the test has bands.
  band: string | null;
  // Once the results are published and worked out: the place among everyone who took it.
  standing: { rank: number; of: number; percentile: number } | null;
  // TP-08: serious warnings on the counted attempt, and the marks they cost (0 when none or waived).
  warnings: number;
  penalty: number;
  // TP-11: marks per section and per course outcome (an outcome by its code and statement).
  sections: { title: string; marks: number; maxMarks: number }[];
  outcomes: { code: string; statement: string; marks: number; maxMarks: number }[];
};

// TP-11 and TP-12: a counted attempt's figures, the same on its result page, scorecard and certificate. `takers` is
// given once the results are published and worked out; the course's outcomes name the per-outcome marks.
export function figuresOf(
  test: Pick<AssessmentDoc, 'maxMarks' | 'sections' | 'proctoring' | 'results'>,
  paper: Pick<SubmissionDoc, 'paper' | 'scores' | 'rank' | 'percentile' | 'proctor'>,
  total: number,
  { takers, cos }: { takers: number | null; cos: readonly { _id: Types.ObjectId; code: string; statement: string }[] },
): ResultFigures {
  const pct = test.maxMarks > 0 ? roundHalfUp((100 * total) / test.maxMarks, 2) : 0;
  const sectionTitle = new Map(test.sections.map((section) => [String(section._id), section.title]));
  const marksOf = (item: PaperItem) => paper.scores?.[String(item._id)]?.marks ?? null;
  const bySection = breakdown(
    paper.paper.flatMap((item) =>
      item.sectionId ? [{ groups: [String(item.sectionId)], maxMarks: item.maxMarks, marks: marksOf(item) }] : [],
    ),
  );
  const byCo = breakdown(
    paper.paper.map((item) => ({ groups: item.coIds.map(String), maxMarks: item.maxMarks, marks: marksOf(item) })),
  );
  return {
    total,
    maxMarks: test.maxMarks,
    pct,
    band: bandOf(pct, rulesOf(test).bands),
    standing:
      takers !== null && paper.rank !== null && paper.rank !== undefined
        ? { rank: paper.rank, of: takers, percentile: paper.percentile ?? 0 }
        : null,
    warnings: paper.proctor?.hard ?? 0,
    penalty: proctorPenalty(
      paper.proctor?.hard ?? 0,
      test.proctoring?.penaltyEach ?? 0,
      paper.proctor?.waived ?? false,
    ),
    sections: [...bySection].map(([id, sum]) => ({ title: sectionTitle.get(id) ?? 'Section', ...sum })),
    outcomes: cos.flatMap((co) => {
      const sum = byCo.get(String(co._id));
      return sum ? [{ code: co.code, statement: co.statement, ...sum }] : [];
    }),
  };
}

// T6 and TP-11: publishing a test's results — by hand (publishResults) or by its release rule (the hourly sweep,
// whose actor is whoever chose the rule). The status change and its audit entry commit together; then everyone who
// handed in is told and the testStats job works out ranks. False when they were already out. The worker calls this
// too, so it imports nothing from next/* or the session.
export async function releaseResults(
  test: { _id: Types.ObjectId; title: string; offeringId?: Types.ObjectId | null },
  actorId: string,
  now: Date,
  reason?: string,
): Promise<boolean> {
  const released = await mongoose.connection.transaction(async (session) => {
    const written = await Assessment.updateOne(
      { _id: test._id, status: 'published' },
      { $set: { status: 'results_published', resultsPublishedAt: now } },
      { session },
    );
    if (written.modifiedCount === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'assessment.results_published',
        entity: 'assessment',
        entityId: String(test._id),
        offeringId: test.offeringId ? String(test.offeringId) : undefined,
        ...(reason ? { reason } : {}),
        before: { status: 'published' },
        after: { status: 'results_published' },
      },
      session,
    );
    return true;
  });
  if (!released) return false;
  const offering = test.offeringId ? await Offering.findById(test.offeringId, { title: 1 }).lean() : null;
  const students = await Submission.distinct('studentId', { assessmentId: test._id });
  const title = `Results: ${test.title}${offering ? ` (${offering.title})` : ''}`;
  await notify(students.map(String), {
    kind: 'results.published',
    title: title.length > 160 ? `${title.slice(0, 159)}…` : title,
    href: assessmentPath(test.offeringId ? String(test.offeringId) : null, String(test._id)),
  });
  await queueTestStats(String(test._id));
  return true;
}

export type CertificateCheck = {
  name: string;
  test: string;
  // The course (its code and title), or null for a standalone test.
  course: string | null;
  takenOn: Date;
  pct: number;
  band: string | null;
  standing: { rank: number; of: number } | null;
  // False when a later change of marks took the result below the test's threshold.
  valid: boolean;
};

// TP-12: the public check of a certificate (/v/<code>) for whoever holds one — no session. It states what the
// certificate states, read from the record as it is now.
export async function getCertificate(code: string): Promise<CertificateCheck | null> {
  await db();
  const paper = await Submission.findOne(
    { certificateCode: code },
    { assessmentId: 1, studentId: 1, status: 1, total: 1, rank: 1, submittedAt: 1, startedAt: 1 },
  ).lean();
  if (!paper) return null;
  const [test, person] = await Promise.all([
    Assessment.findById(paper.assessmentId, { title: 1, maxMarks: 1, results: 1, offeringId: 1, status: 1 }).lean(),
    User.findById(paper.studentId, { name: 1 }).lean(),
  ]);
  if (!test || !person) return null;
  const [course, stats] = await Promise.all([
    test.offeringId
      ? Offering.findById(test.offeringId, { courseId: 1 })
          .lean()
          .then((o) => (o ? Course.findById(o.courseId, { code: 1, title: 1 }).lean() : null))
      : null,
    test.status === 'results_published' ? TestStats.findById(test._id, { takers: 1 }).lean() : null,
  ]);
  const total = paper.status === 'graded' && typeof paper.total === 'number' ? paper.total : null;
  const pct = total !== null && test.maxMarks > 0 ? roundHalfUp((100 * total) / test.maxMarks, 2) : 0;
  const rules = rulesOf(test);
  return {
    name: person.name,
    test: test.title,
    course: course ? `${course.code} · ${course.title}` : null,
    takenOn: paper.submittedAt ?? paper.startedAt,
    pct,
    band: bandOf(pct, rules.bands),
    standing: stats && paper.rank !== null && paper.rank !== undefined ? { rank: paper.rank, of: stats.takers } : null,
    valid: total !== null && earnsCertificate(pct, rules.certificateFromPct),
  };
}
