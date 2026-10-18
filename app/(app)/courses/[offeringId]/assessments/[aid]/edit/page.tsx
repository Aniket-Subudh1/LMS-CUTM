import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../../../loading';
import { AssessmentBuilder } from '@/components/assessment-builder';

export const metadata: Metadata = { title: 'Assessment builder' };

export default function BuilderPage({
  params,
  searchParams,
}: PageProps<'/courses/[offeringId]/assessments/[aid]/edit'>) {
  return (
    <Suspense fallback={<Loading />}>
      <AssessmentBuilder params={params} searchParams={searchParams} />
    </Suspense>
  );
}
