import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../loading';
import { QuestionBank } from '@/components/question-bank';

export const metadata: Metadata = { title: 'Question bank' };

export default function CourseBankPage({ params, searchParams }: PageProps<'/courses/[offeringId]/bank'>) {
  return (
    <Suspense fallback={<Loading />}>
      <CourseBank params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CourseBank({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/bank'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/bank'>['searchParams'];
}) {
  const { offeringId } = await params;
  return <QuestionBank offeringId={offeringId} base={`/courses/${offeringId}/bank`} searchParams={searchParams} />;
}
