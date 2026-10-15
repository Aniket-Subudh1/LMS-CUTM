import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { FileArrowUpIcon, UsersThreeIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import { changeEnrollments } from '../../actions';
import { Field } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { getWorkspace, listRoster } from '@/lib/data/workspace';
import { formatDateTime, formatPct, statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'People' };

const Search = z.object({ page: pageParam.catch(1) });

export default function PeoplePage({ params, searchParams }: PageProps<'/courses/[offeringId]/people'>) {
  return (
    <Suspense fallback={<Loading />}>
      <People params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function People({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/people'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/people'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { page } = Search.parse(await searchParams);
  const [workspace, { rows, total, publishedLessons }] = await Promise.all([
    getWorkspace(offeringId),
    listRoster(offeringId, page),
  ]);
  type Row = (typeof rows)[number];
  // T9 (SKL-02, SKL-04): on a skill course, attendance is completed lessons over published lessons; there is no
  // attendance register to fill in.
  const skill: { header: string; cell: (s: Row) => ReactNode; className?: string }[] =
    publishedLessons === null
      ? []
      : [
          {
            header: 'Lessons done',
            cell: (s) => (
              <span className="tabular-nums">
                {s.skill?.completed ?? 0} / {publishedLessons}
              </span>
            ),
          },
          {
            header: 'Attendance',
            cell: (s) =>
              s.skill?.attendancePct == null ? (
                '–'
              ) : (
                <span className="flex min-w-28 items-center gap-2">
                  <Progress value={s.skill.attendancePct} className="bg-muted h-1.5 w-16" aria-hidden="true" />
                  <span className="tabular-nums">{formatPct(s.skill.attendancePct)}</span>
                </span>
              ),
          },
          { header: 'Watched', cell: (s) => <span className="tabular-nums">{s.skill?.watchedMin ?? 0} min</span> },
          {
            header: 'Last active',
            cell: (s) =>
              s.skill?.lastActiveAt ? (
                <span className="whitespace-nowrap">{formatDateTime(s.skill.lastActiveAt)}</span>
              ) : (
                'Not yet'
              ),
          },
        ];
  const columns: { header: string; cell: (s: Row) => ReactNode; className?: string }[] = [
    { header: 'Roll no.', cell: (s) => s.rollNo },
    { header: 'Name', cell: (s) => <span className="font-medium">{s.name}</span> },
    { header: 'Email', cell: (s) => s.email },
    { header: 'Status', cell: (s) => <Badge variant={statusTone(s.status)}>{s.status}</Badge> },
    ...skill,
  ];
  return (
    <Section
      icon={<UsersThreeIcon weight="duotone" />}
      title="Roster"
      description={
        publishedLessons === null
          ? `${total} ${total === 1 ? 'student' : 'students'} on this offering.`
          : `${total} ${total === 1 ? 'student' : 'students'}. On a skill course, attendance is the share of the ${publishedLessons} published lessons each student has completed.`
      }
      action={
        workspace.canTeach && (
          <FormDialog
            trigger={
              <Button variant="outline" size="sm">
                <FileArrowUpIcon weight="duotone" /> Change enrolment
              </Button>
            }
            icon={<FileArrowUpIcon weight="duotone" />}
            title="Change enrolment"
            description="Upload a CSV with the columns rollNo and action (add or drop). If any row is wrong nothing is changed."
            action={changeEnrollments}
            submitLabel="Apply changes"
            successMessage="Enrolment updated."
          >
            <input type="hidden" name="offeringId" value={workspace.id} />
            <Field name="file" label="CSV file">
              <Input name="file" type="file" accept=".csv,text/csv" required />
            </Field>
          </FormDialog>
        )
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={{}}
        path={`/courses/${workspace.id}/people`}
        empty="Nobody is enrolled in this offering."
      />
    </Section>
  );
}
