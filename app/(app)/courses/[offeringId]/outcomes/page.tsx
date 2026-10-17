import { Suspense } from 'react';
import type { Metadata } from 'next';
import { z } from 'zod';
import Loading from '../../../loading';
import { CourseOutcomes } from '@/components/course-outcomes';
import { EmptyState } from '@/components/data-table';
import { PageIcon } from '@/components/page-icon';
import { getOfferingCourse } from '@/lib/data/courses';

export const metadata: Metadata = { title: 'Outcomes' };

// The dialog to show: co, co-<id> (URL-driven, M03b).
const Search = z.object({ new: z.string().max(60).optional().catch(undefined) });

export default function OutcomesPage({ params, searchParams }: PageProps<'/courses/[offeringId]/outcomes'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Outcomes params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Outcomes({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/outcomes'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/outcomes'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { new: open } = Search.parse(await searchParams);
  const course = await getOfferingCourse(offeringId);
  if (course.mode !== 'credit') {
    return (
      <EmptyState
        icon={<PageIcon name="outcomes" className="size-8" />}
        text="This is a non-credit course, so it has no course outcomes or mapping."
      />
    );
  }
  return (
    <CourseOutcomes course={course} outcomes={course.outcomes} base={`/courses/${offeringId}/outcomes`} open={open} />
  );
}
