import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../loading';
import { LiveMonitor } from '@/components/live-monitor';

export const metadata: Metadata = { title: 'Live monitor' };

export default function TestMonitorPage({ params, searchParams }: PageProps<'/tests/[aid]/monitor'>) {
  return (
    <Suspense fallback={<Loading />}>
      <LiveMonitor params={params} searchParams={searchParams} />
    </Suspense>
  );
}
