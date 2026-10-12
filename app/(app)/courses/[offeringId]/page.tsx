import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../loading';
import { CoPoMatrix } from '@/components/co-po-matrix';
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
    <div className="grid gap-6">
      <section className="bg-card rounded-lg border p-5 sm:p-6">
        <h2 className="text-base font-semibold">
          {course.code} · {course.title}
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-sm">Credits</dt>
            <dd className="text-sm font-medium">{course.credits}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Components</dt>
            <dd className="text-sm font-medium capitalize">{course.components.join(', ')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Programme</dt>
            <dd className="text-sm font-medium">{course.programCode}</dd>
          </div>
        </dl>
        {course.objectives.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold">Objectives</h3>
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
              {course.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        )}
      </section>
      {course.category === 'ugc' && (
        <>
          <section className="bg-card rounded-lg border p-5 sm:p-6">
            <h2 className="mb-4 text-base font-semibold">Course outcomes</h2>
            {course.cos.length === 0 ? (
              <p className="text-muted-foreground text-sm">No course outcomes have been defined yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {course.cos.map((co) => (
                  <li key={co.id} className="flex gap-3">
                    <span className="w-12 shrink-0 font-medium">{co.code}</span>
                    <span>
                      {co.statement} <span className="text-muted-foreground">({co.bloomLevel})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {course.cos.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold">CO–PO–PSO mapping</h2>
              <CoPoMatrix cos={course.cos} outcomes={course.outcomes} cells={course.cells} mode="levels" />
            </section>
          )}
        </>
      )}
    </div>
  );
}
