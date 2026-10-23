import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../../loading';
import { GradeSheetCard } from '@/components/grade-sheet';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Button } from '@/components/ui/button';
import { getBatchSheet } from '@/lib/data/exams';
import { objectId } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Grade sheet' };

const Search = z.object({ term: objectId.optional().catch(undefined) });

export default function BatchSheetPage({ params, searchParams }: PageProps<'/admin/exams/[batchId]/[studentId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <BatchSheet params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// M08 (mock-up E4 → E5 B): one student's sheet, laid out as they will see it once published.
async function BatchSheet({
  params,
  searchParams,
}: {
  params: PageProps<'/admin/exams/[batchId]/[studentId]'>['params'];
  searchParams: PageProps<'/admin/exams/[batchId]/[studentId]'>['searchParams'];
}) {
  const { batchId, studentId } = await params;
  const { term } = Search.parse(await searchParams);
  const sheet = await getBatchSheet(batchId, studentId, term);
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          icon={<PageIcon name="diploma" />}
          title={sheet.student.name}
          description={`${sheet.student.rollNo} · ${sheet.student.batch} · as the student sees it once published`}
          actions={
            <Button variant="outline" asChild className="print:hidden">
              <Link href={`/admin/exams/${batchId}?term=${term ?? ''}&sheets=${sheet.status}`}>
                <ArrowLeftIcon />
                The batch
              </Link>
            </Button>
          }
        />
      </div>
      <GradeSheetCard sheet={sheet} />
    </>
  );
}
