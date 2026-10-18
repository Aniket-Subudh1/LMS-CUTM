import { notFound, redirect } from 'next/navigation';
import { AssessmentRunner } from '@/components/assessment-runner';
import { RichTextView } from '@/components/rich-text-view';
import { getAttemptForStudent } from '@/lib/data/assessments';
import { assessmentPath } from '@/lib/domain/test-links';

// T5 ("Runner B", M04 decision 4): the attempt on a page of its own, outside the sidebar and course header, like the
// live room. Without a running attempt the student goes back to the test's page to start one. Shared by a course's
// assessments and standalone tests (M04b).
export async function AssessmentAttempt({ params }: { params: Promise<{ offeringId?: string; aid: string }> }) {
  const { offeringId, aid } = await params;
  const path = assessmentPath(offeringId ?? null, aid);
  const attempt = await getAttemptForStudent(aid);
  if (!attempt) redirect(path);
  if (attempt.path !== path) notFound();
  // The questions and the sections' passages are rendered here (RichTextView is server-only) and handed to the runner
  // as nodes.
  const prompts = Object.fromEntries(
    attempt.items.map((item) => [item.id, item.prompt ? <RichTextView doc={item.prompt} /> : null]),
  );
  const passages = Object.fromEntries(
    attempt.sections.flatMap((section) =>
      section.passage ? [[section.id, <RichTextView key={section.id} doc={section.passage} />]] : [],
    ),
  );
  return <AssessmentRunner attempt={attempt} prompts={prompts} passages={passages} serverNow={new Date().getTime()} />;
}
