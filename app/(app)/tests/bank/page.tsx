import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../loading';
import { QuestionBank } from '@/components/question-bank';

export const metadata: Metadata = { title: 'Question bank' };

export default function OwnBankPage({ searchParams }: PageProps<'/tests/bank'>) {
  return (
    <Suspense fallback={<Loading />}>
      <QuestionBank offeringId={null} base="/tests/bank" searchParams={searchParams} />
    </Suspense>
  );
}
