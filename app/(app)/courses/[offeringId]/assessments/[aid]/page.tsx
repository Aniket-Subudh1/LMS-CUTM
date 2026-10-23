import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../../loading';
import { AssessmentOverview } from '@/components/assessment-overview';

export const metadata: Metadata = { title: 'Assessment' };

export default function AssessmentPage({ params }: PageProps<'/courses/[offeringId]/assessments/[aid]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <AssessmentOverview params={params} />
    </Suspense>
  );
}
