import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../loading';
import { AssessmentBuilder } from '@/components/assessment-builder';

export const metadata: Metadata = { title: 'Test builder' };

export default function TestBuilderPage({ params, searchParams }: PageProps<'/tests/[aid]/edit'>) {
  return (
    <Suspense fallback={<Loading />}>
      <AssessmentBuilder params={params} searchParams={searchParams} />
    </Suspense>
  );
}
