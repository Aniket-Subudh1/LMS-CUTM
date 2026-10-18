import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../loading';
import { TestResultsView } from '@/components/test-results';

export const metadata: Metadata = { title: 'Results' };

export default function TestResultsPage({ params, searchParams }: PageProps<'/tests/[aid]/results'>) {
  return (
    <Suspense fallback={<Loading />}>
      <TestResultsView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
