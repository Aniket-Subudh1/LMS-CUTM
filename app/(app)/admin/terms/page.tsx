import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CalendarDotsIcon, PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { saveTerm } from '../actions';
import { Field } from '@/components/action-form';
import { EmptyState, PageNav } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/cn';
import { istDateToDate } from '@/lib/domain/time';
import { listTerms, type TermRow } from '@/lib/data/structure';
import { formatDate, statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';
import { TERM_STATUSES } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Terms' };

const Search = z.object({ page: pageParam.catch(1) });

export default function TermsPage({ searchParams }: PageProps<'/admin/terms'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Terms searchParams={searchParams} />
    </Suspense>
  );
}

async function Terms({ searchParams }: { searchParams: PageProps<'/admin/terms'>['searchParams'] }) {
  const { page } = Search.parse(await searchParams);
  const { rows, total } = await listTerms(page);
  return (
    <>
      <PageHeader
        icon={<CalendarDotsIcon weight="duotone" />}
        title="Terms"
        description="Exactly one term is current. Making another current closes the previous one."
        actions={<TermDialog />}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarDotsIcon weight="duotone" />} text="Add the first term with Add term." />
      ) : (
        <div className="grid gap-5">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
            {rows.map((t) => (
              <li
                key={t.id}
                className={cn('surface flex items-start gap-4 p-5', t.status === 'current' && 'ring-primary/40')}
              >
                <span className="icon-chip size-11 [&_svg]:size-6">
                  <CalendarDotsIcon weight={t.status === 'current' ? 'fill' : 'duotone'} />
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide">
                    {t.code} · {t.academicYear}
                  </p>
                  <p className="leading-snug font-medium">{t.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatDate(istDateToDate(t.startsOn))} – {formatDate(istDateToDate(t.endsOn))}
                  </p>
                  <Badge variant={statusTone(t.status)} className="mt-1">
                    {t.status}
                  </Badge>
                </div>
                <TermDialog term={t} />
              </li>
            ))}
          </ul>
          <PageNav shown={rows.length} total={total} page={page} pageSize={pageSize} query={{}} path="/admin/terms" />
        </div>
      )}
    </>
  );
}

function TermDialog({ term }: { term?: TermRow }) {
  return (
    <FormDialog
      trigger={
        term ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${term.code}`}>
            <PencilSimpleIcon weight="duotone" />
          </Button>
        ) : (
          <Button>
            <PlusIcon weight="bold" /> Add term
          </Button>
        )
      }
      icon={<CalendarDotsIcon weight="duotone" />}
      title={term ? `Edit ${term.code}` : 'Add a term'}
      description="Offerings run in a term. Making this term current closes the one that is current now."
      openParam={term ? undefined : 'term'}
      action={saveTerm}
      submitLabel={term ? 'Save changes' : 'Add term'}
      successMessage={term ? 'Term updated.' : 'Term added.'}
    >
      {term && <input type="hidden" name="id" value={term.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="code" label="Code" hint="For example 2026-27-ODD.">
          <Input name="code" required maxLength={20} defaultValue={term?.code} />
        </Field>
        <Field name="academicYear" label="Academic year" hint="Written as 2026-27.">
          <Input name="academicYear" required pattern="\d{4}-\d{2}" defaultValue={term?.academicYear} />
        </Field>
      </div>
      <Field name="name" label="Name">
        <Input name="name" required maxLength={80} defaultValue={term?.name} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="startsOn" label="Starts on">
          <Input name="startsOn" type="date" required defaultValue={term?.startsOn} />
        </Field>
        <Field name="endsOn" label="Ends on">
          <Input name="endsOn" type="date" required defaultValue={term?.endsOn} />
        </Field>
      </div>
      <Field name="status" label="Status">
        <NativeSelect name="status" defaultValue={term?.status ?? 'upcoming'}>
          {TERM_STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}
