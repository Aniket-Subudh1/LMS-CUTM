import { Suspense } from 'react';
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
import { getWorkspace, listRoster } from '@/lib/data/workspace';
import { statusTone } from '@/lib/format';
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
  const [workspace, { rows, total }] = await Promise.all([getWorkspace(offeringId), listRoster(offeringId, page)]);
  return (
    <Section
      icon={<UsersThreeIcon weight="duotone" />}
      title="Roster"
      description={`${total} ${total === 1 ? 'student' : 'students'} on this offering.`}
      action={
        workspace.canChangeEnrollments && (
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
        columns={[
          { header: 'Roll no.', cell: (s) => s.rollNo },
          { header: 'Name', cell: (s) => <span className="font-medium">{s.name}</span> },
          { header: 'Email', cell: (s) => s.email },
          { header: 'Status', cell: (s) => <Badge variant={statusTone(s.status)}>{s.status}</Badge> },
        ]}
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
