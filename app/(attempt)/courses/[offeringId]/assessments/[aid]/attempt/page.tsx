import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AssessmentRunner } from '@/components/assessment-runner';
import { RichTextView } from '@/components/rich-text-view';
import { getAttemptForStudent } from '@/lib/data/assessments';

export const metadata: Metadata = { title: 'Attempt' };

// T5 ("Runner B", M04 decision 4): the attempt on a page of its own, outside the sidebar and course header, like the
// live room. Without a running attempt the student goes back to the assessment's page to start one.
export default function AttemptPage({ params }: PageProps<'/courses/[offeringId]/assessments/[aid]/attempt'>) {
  return (
    <Suspense
      fallback={
        <p className="text-muted-foreground grid min-h-dvh place-items-center text-sm">Opening your attempt…</p>
      }
    >
      <Attempt params={params} />
    </Suspense>
  );
}

async function Attempt({ params }: { params: PageProps<'/courses/[offeringId]/assessments/[aid]/attempt'>['params'] }) {
  const { offeringId, aid } = await params;
  const attempt = await getAttemptForStudent(offeringId, aid);
  if (!attempt) redirect(`/courses/${offeringId}/assessments/${aid}`);
  // The questions are rendered here (RichTextView is server-only) and handed to the runner as nodes.
  const prompts = Object.fromEntries(
    attempt.items.map((item) => [item.id, item.prompt ? <RichTextView doc={item.prompt} /> : null]),
  );
  return <AssessmentRunner attempt={attempt} prompts={prompts} serverNow={new Date().getTime()} />;
}
