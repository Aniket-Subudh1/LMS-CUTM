import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../loading';
import { EmptyState } from '@/components/data-table';
import { GradeSheetCard } from '@/components/grade-sheet';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { getMyResults } from '@/lib/data/exams';

export const metadata: Metadata = { title: 'Results' };

export default function ResultsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Results />
    </Suspense>
  );
}

// DSH-07 (mock-up E5 B): a student's published grade sheets, newest term first.
async function Results() {
  const sheets = await getMyResults();
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          icon={<PageIcon name="results" />}
          title="Results"
          description="Your grade sheets, once the university publishes them."
        />
      </div>
      {sheets.length === 0 ? (
        <EmptyState text="No grade sheet has been published for you yet." />
      ) : (
        <div className="grid gap-5">
          {sheets.map((sheet) => (
            <GradeSheetCard key={sheet.term.code} sheet={sheet} />
          ))}
        </div>
      )}
    </>
  );
}
