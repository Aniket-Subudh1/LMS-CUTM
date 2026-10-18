import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../../../loading';
import { HandInsView } from '@/components/hand-ins';

export const metadata: Metadata = { title: 'Hand-ins' };

export default function HandInsPage({
  params,
  searchParams,
}: PageProps<'/courses/[offeringId]/assessments/[aid]/grade'>) {
  return (
    <Suspense fallback={<Loading />}>
      <HandInsView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
