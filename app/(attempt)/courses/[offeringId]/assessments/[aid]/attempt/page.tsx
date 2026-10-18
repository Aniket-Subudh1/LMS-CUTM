import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AssessmentAttempt } from '@/components/assessment-attempt';

export const metadata: Metadata = { title: 'Attempt' };

export default function AttemptPage({ params }: PageProps<'/courses/[offeringId]/assessments/[aid]/attempt'>) {
  return (
    <Suspense
      fallback={
        <p className="text-muted-foreground grid min-h-dvh place-items-center text-sm">Opening your attempt…</p>
      }
    >
      <AssessmentAttempt params={params} />
    </Suspense>
  );
}
