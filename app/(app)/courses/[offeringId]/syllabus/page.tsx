import { Suspense } from 'react';
import type { Metadata } from 'next';
import { z } from 'zod';
import Loading from '../../../loading';
import { CourseSyllabus } from '@/components/course-syllabus';
import { Fact } from '@/components/section';
import { getOfferingCourse } from '@/lib/data/courses';
import { creditTotal, formatCredits, syllabusHours } from '@/lib/domain/catalog';
import { COURSE_TYPE_LABEL } from '@/lib/format';

export const metadata: Metadata = { title: 'Syllabus' };

// The dialog to show: module, module-<id>, objectives, books, projects, syllabus-pdf (URL-driven, M03b).
const Search = z.object({ new: z.string().max(60).optional().catch(undefined) });

export default function SyllabusPage({ params, searchParams }: PageProps<'/courses/[offeringId]/syllabus'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Syllabus params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Syllabus({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/syllabus'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/syllabus'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { new: open } = Search.parse(await searchParams);
  const course = await getOfferingCourse(offeringId);
  const hours = syllabusHours(course.modules);
  return (
    <div className="grid gap-5">
      <dl className="surface grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 md:grid-cols-5">
        <Fact label="Credits">
          {formatCredits(course.credits)} · {creditTotal(course.credits)} in all
        </Fact>
        <Fact label="Type">{course.type ? COURSE_TYPE_LABEL[course.type] : 'Not set'}</Fact>
        <Fact label="Coordinator">{course.coordinator?.name ?? 'Not assigned'}</Fact>
        <Fact label="Hours">
          {hours > 0 ? `${hours} in ${course.modules.length} modules` : `${course.modules.length} modules`}
        </Fact>
        <Fact label="Syllabus PDF">{course.syllabusFileKey ? 'Uploaded' : 'Not uploaded'}</Fact>
      </dl>
      <CourseSyllabus course={course} base={`/courses/${offeringId}/syllabus`} open={open} />
    </div>
  );
}
