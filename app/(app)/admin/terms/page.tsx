import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import Loading from '../../loading';
import { saveTerm } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { istDateToDate } from '@/lib/domain/time';
import { getTerm, listTerms } from '@/lib/data/structure';
import { formatDate, statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';
import { TERM_STATUSES } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Terms' };

const Search = z.object({ page: pageParam.catch(1), edit: objectId.optional().catch(undefined) });

export default function TermsPage({ searchParams }: PageProps<'/admin/terms'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Terms searchParams={searchParams} />
    </Suspense>
  );
}

async function Terms({ searchParams }: { searchParams: PageProps<'/admin/terms'>['searchParams'] }) {
  const { page, edit } = Search.parse(await searchParams);
  const [{ rows, total }, editing] = await Promise.all([listTerms(page), edit ? getTerm(edit) : null]);
  return (
    <>
      <PageHeader
        title="Terms"
        description="Exactly one term is current. Making another current closes the previous one."
      />
      <DataTable
        columns={[
          { header: 'Code', cell: (t) => <span className="font-medium">{t.code}</span> },
          { header: 'Name', cell: (t) => t.name },
          { header: 'Year', cell: (t) => t.academicYear },
          { header: 'Starts', cell: (t) => formatDate(istDateToDate(t.startsOn)) },
          { header: 'Ends', cell: (t) => formatDate(istDateToDate(t.endsOn)) },
          { header: 'Status', cell: (t) => <Badge variant={statusTone(t.status)}>{t.status}</Badge> },
          {
            header: '',
            className: 'text-right',
            cell: (t) => (
              <Link href={`/admin/terms?edit=${t.id}`} className="text-sm underline-offset-4 hover:underline">
                Edit<span className="sr-only"> {t.code}</span>
              </Link>
            ),
          },
        ]}
        rows={rows}
        rowKey={(t) => t.id}
        total={total}
        page={page}
        pageSize={pageSize}
        query={{}}
        path="/admin/terms"
        empty="Add the first term below."
      />
      <section className="bg-card mt-6 max-w-2xl rounded-lg border p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">{editing ? `Edit ${editing.code}` : 'Add a term'}</h2>
        <ActionForm
          key={editing?.id ?? 'new'}
          action={saveTerm}
          submitLabel={editing ? 'Save changes' : 'Add term'}
          successMessage="Term added."
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field name="code" label="Code" hint="For example 2026-27-ODD.">
            <Input name="code" required maxLength={20} defaultValue={editing?.code} />
          </Field>
          <Field name="name" label="Name">
            <Input name="name" required maxLength={80} defaultValue={editing?.name} />
          </Field>
          <Field name="academicYear" label="Academic year" hint="Written as 2026-27.">
            <Input name="academicYear" required pattern="\d{4}-\d{2}" defaultValue={editing?.academicYear} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="startsOn" label="Starts on">
              <Input name="startsOn" type="date" required defaultValue={editing?.startsOn} />
            </Field>
            <Field name="endsOn" label="Ends on">
              <Input name="endsOn" type="date" required defaultValue={editing?.endsOn} />
            </Field>
          </div>
          <Field name="status" label="Status">
            <NativeSelect name="status" defaultValue={editing?.status ?? 'upcoming'}>
              {TERM_STATUSES.map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
