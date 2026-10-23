import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../../../loading';
import { LiveMonitor } from '@/components/live-monitor';

export const metadata: Metadata = { title: 'Live monitor' };

export default function MonitorPage({
  params,
  searchParams,
}: PageProps<'/courses/[offeringId]/assessments/[aid]/monitor'>) {
  return (
    <Suspense fallback={<Loading />}>
      <LiveMonitor params={params} searchParams={searchParams} />
    </Suspense>
  );
}
