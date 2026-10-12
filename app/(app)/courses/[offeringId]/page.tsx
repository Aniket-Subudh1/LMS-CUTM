import { Suspense } from 'react';
import type { Metadata } from 'next';
import { GridFourIcon, InfoIcon, TargetIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../loading';
import { CoPoMatrix } from '@/components/co-po-matrix';
import { EmptyState } from '@/components/data-table';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { getOfferingCourse } from '@/lib/data/courses';

export const metadata: Metadata = { title: 'Course overview' };

export default function OverviewPage({ params }: PageProps<'/courses/[offeringId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<'/courses/[offeringId]'>['params'] }) {
  const course = await getOfferingCourse((await params).offeringId);
  return (
    <div className="grid gap-8">
      <Section
        icon={<InfoIcon weight="duotone" />}
        title={`${course.code} · ${course.title}`}
        description="The catalogue course this offering runs."
      >
        <dl className="surface grid gap-4 p-5 sm:grid-cols-3">
          <Fact label="Credits">{course.credits}</Fact>
          <Fact label="Components">
            <span className="capitalize">{course.components.join(', ')}</span>
          </Fact>
          <Fact label="Programme">{course.programCode}</Fact>
        </dl>
        {course.objectives.length > 0 && (
          <div className="surface p-5">
            <h3 className="text-sm font-semibold">Objectives</h3>
            <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm">
              {course.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>
      {course.category === 'ugc' && (
        <>
          <Section
            icon={<TargetIcon weight="duotone" />}
            title="Course outcomes"
            description="What a student can do after this course."
          >
            {course.cos.length === 0 ? (
              <EmptyState text="No course outcomes have been defined yet." icon={<TargetIcon weight="duotone" />} />
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3">
                {course.cos.map((co) => (
                  <li key={co.id} className="surface flex gap-3 p-4">
                    <span className="icon-chip h-8 min-w-12 px-2 text-xs font-semibold">{co.code}</span>
                    <span className="grid content-start gap-1.5 text-sm">
                      {co.statement}
                      <Badge variant="secondary" className="w-fit capitalize">
                        {co.bloomLevel}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {course.cos.length > 0 && (
            <Section
              icon={<GridFourIcon weight="duotone" />}
              title="CO–PO–PSO mapping"
              description="How strongly each course outcome supports each programme outcome (1 low, 3 high)."
            >
              <CoPoMatrix cos={course.cos} outcomes={course.outcomes} cells={course.cells} mode="levels" />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
