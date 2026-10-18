import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../loading';
import { AssessmentOverview } from '@/components/assessment-overview';

export const metadata: Metadata = { title: 'Test' };

export default function TestPage({ params }: PageProps<'/tests/[aid]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <AssessmentOverview params={params} />
    </Suspense>
  );
}
