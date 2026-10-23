import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../../../../loading';
import { GradingPage } from '@/components/grading-view';

export const metadata: Metadata = { title: 'Grade a hand-in' };

export default function GradePage({
  params,
}: PageProps<'/courses/[offeringId]/assessments/[aid]/grade/[submissionId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <GradingPage params={params} />
    </Suspense>
  );
}
