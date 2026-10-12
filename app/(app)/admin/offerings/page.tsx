import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import Loading from '../../loading';
import { setOfferingStatus, updateOfferingFaculty } from './actions';
import { ActionForm, Field } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { listOfferings, listTermsForSelect, type OfferingRow } from '@/lib/data/offerings';
import { listDepartmentsForSelect } from '@/lib/data/structure';
import { statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';
import { OFFERING_STATUSES } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Offerings' };

const Search = z.object({
  page: pageParam.catch(1),
  term: objectId.optional().catch(undefined),
  department: objectId.optional().catch(undefined),
  status: z.enum(OFFERING_STATUSES).optional().catch(undefined),
});

export default function OfferingsPage({ searchParams }: PageProps<'/admin/offerings'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Offerings searchParams={searchParams} />
    </Suspense>
  );
}

async function Offerings({ searchParams }: { searchParams: PageProps<'/admin/offerings'>['searchParams'] }) {
  const { page, term, department, status } = Search.parse(await searchParams);
  const [{ rows, total }, terms, departments] = await Promise.all([
    listOfferings(page, { termId: term, departmentId: department, status }),
    listTermsForSelect(),
    listDepartmentsForSelect(),
  ]);
  const query = Object.fromEntries(
    Object.entries({ term, department, status }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return (
    <>
      <PageHeader
        title="Offerings"
        description="A course taught to one batch (or section) in one term. Students see an offering once it is active."
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Term
            <NativeSelect name="term" defaultValue={term ?? ''}>
              <NativeSelectOption value="">All terms</NativeSelectOption>
              {terms.map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Department
            <NativeSelect name="department" defaultValue={department ?? ''}>
              <NativeSelectOption value="">All departments</NativeSelectOption>
              {departments.map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Status
            <NativeSelect name="status" defaultValue={status ?? ''}>
              <NativeSelectOption value="">Any status</NativeSelectOption>
              {OFFERING_STATUSES.map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        <Link href="/admin/offerings/new" className={buttonVariants()}>
          New offering
        </Link>
      </div>
      <DataTable
        columns={[
          { header: 'Offering', cell: (o) => <span className="font-medium">{o.title}</span> },
          { header: 'Term', cell: (o) => o.termCode },
          { header: 'Faculty', cell: (o) => <FacultyCell offering={o} /> },
          { header: 'Students', cell: (o) => o.students, className: 'text-right' },
          { header: 'Status', cell: (o) => <Badge variant={statusTone(o.status)}>{o.status}</Badge> },
          { header: '', cell: (o) => <StatusAction offering={o} />, className: 'text-right' },
        ]}
        rows={rows}
        rowKey={(o) => o.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        path="/admin/offerings"
        empty="No offerings match. Create one with New offering."
      />
    </>
  );
}

function FacultyCell({ offering }: { offering: OfferingRow }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm">
        {offering.faculty.map((f) => f.name).join(', ') || 'None'}
        <span className="text-muted-foreground ml-2 underline underline-offset-4">Change</span>
      </summary>
      <div className="mt-3 min-w-64">
        <ActionForm action={updateOfferingFaculty} submitLabel="Save faculty" successMessage="Faculty saved.">
          <input type="hidden" name="offeringId" value={offering.id} />
          <Field name="faculty" label="Faculty emails" hint="One to five, separated by commas or new lines.">
            <Textarea name="faculty" rows={3} required defaultValue={offering.faculty.map((f) => f.email).join('\n')} />
          </Field>
        </ActionForm>
      </div>
    </details>
  );
}

function StatusAction({ offering }: { offering: OfferingRow }) {
  if (offering.status === 'completed') return <span className="text-muted-foreground text-sm">—</span>;
  const activating = offering.status === 'draft';
  return (
    <ActionForm
      action={setOfferingStatus}
      submitLabel={activating ? 'Activate' : 'Mark completed'}
      submitVariant={activating ? 'default' : 'destructive'}
      confirm={
        activating
          ? { title: 'Activate this offering?', message: 'Enrolled students will see it in their courses.' }
          : { title: 'Mark this offering completed?', message: 'It cannot be set back to active.' }
      }
    >
      <input type="hidden" name="offeringId" value={offering.id} />
      <input type="hidden" name="status" value={activating ? 'active' : 'completed'} />
    </ActionForm>
  );
}
