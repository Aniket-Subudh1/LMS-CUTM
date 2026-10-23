import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon, LockSimpleIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../../../../../loading';
import { saveReviewMarks } from '../../../actions';
import { ActionForm } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getReviewSheet, type ReviewSheet } from '@/lib/data/projects';
import { addedUp } from '@/lib/domain/evaluation';
import { formatDateTime, formatMarks } from '@/lib/format';

export const metadata: Metadata = { title: 'Review' };

export default function ReviewPage({
  params,
}: PageProps<'/courses/[offeringId]/projects/[projectId]/reviews/[reviewId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Review params={params} />
    </Suspense>
  );
}

// M07 T8 (P4): one review's marks — the policy's project rubric per member, saved together. Each member's project
// internal is the criterion-by-criterion average of their reviews (07 §2).
async function Review({
  params,
}: {
  params: PageProps<'/courses/[offeringId]/projects/[projectId]/reviews/[reviewId]'>['params'];
}) {
  const { offeringId, projectId, reviewId } = await params;
  const sheet = await getReviewSheet(offeringId, projectId, reviewId);
  const table = <Grid sheet={sheet} />;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/courses/${offeringId}/projects/${projectId}`}>
          <ArrowLeftIcon /> {sheet.project.title}
        </Link>
      </Button>
      <Section
        icon={<PageIcon name="evaluation" className="size-8" />}
        title={sheet.review.title}
        description={`${formatDateTime(sheet.review.heldOn)} · out of ${formatMarks(sheet.max)}, by the Examination Policy’s project rubric. The external relevance, report and defence marks come from the exam section.`}
        action={
          sheet.review.session && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/courses/${offeringId}/live/${sheet.review.session.id}`}>Live class</Link>
            </Button>
          )
        }
      >
        {sheet.locked && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-[0.8125rem]">
            <LockSimpleIcon className="size-4" /> The marks of this class are locked, so the review cannot change.
          </p>
        )}
        {sheet.canEdit ? (
          <ActionForm
            action={saveReviewMarks}
            submitLabel="Save the marks"
            successMessage="Saved. The project internals follow within a minute."
          >
            <input type="hidden" name="reviewId" value={sheet.review.id} />
            <p className="text-muted-foreground -mb-2 text-xs">
              A blank box leaves that criterion unmarked. Marks take up to two decimals. The figure under each name is
              from the team’s {sheet.project.mode === 'github' ? 'commits' : 'board'}, to help you weigh it.
            </p>
            {table}
          </ActionForm>
        ) : (
          table
        )}
      </Section>
    </>
  );
}

function Grid({ sheet }: { sheet: ReviewSheet }) {
  return (
    <DataTable
      bare
      columns={[
        {
          header: 'Member',
          cell: (row) => (
            <span className="grid min-w-36">
              <span className="font-semibold">{row.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {row.rollNo}
                {row.figure && ` · ${row.figure}`}
              </span>
              {sheet.canEdit && <input type="hidden" name="student[]" value={row.id} />}
            </span>
          ),
        },
        ...sheet.criteria.map((criterion) => ({
          header: `${criterion.label} · ${formatMarks(criterion.max)}`,
          className: 'min-w-24 whitespace-normal',
          cell: (row: ReviewSheet['rows'][number]) => {
            const value = row.marks[criterion.key];
            return sheet.canEdit ? (
              <Input
                name="mark[]"
                type="number"
                inputMode="decimal"
                min={0}
                max={criterion.max}
                step={0.01}
                defaultValue={value ?? ''}
                aria-label={`${row.name}, ${criterion.label}, out of ${formatMarks(criterion.max)}`}
                className="w-18 text-right tabular-nums"
              />
            ) : (
              <span className="tabular-nums">
                {value === undefined ? <span className="text-muted-foreground">—</span> : formatMarks(value)}
              </span>
            );
          },
        })),
        {
          header: `Total · ${formatMarks(sheet.max)}`,
          cell: (row) => {
            const total = addedUp(sheet.criteria.map((c) => row.marks[c.key]));
            return <b className="tabular-nums">{total === null ? '—' : formatMarks(total)}</b>;
          },
        },
      ]}
      rows={sheet.rows}
      rowKey={(row) => row.id}
      empty="The project has no members."
    />
  );
}
