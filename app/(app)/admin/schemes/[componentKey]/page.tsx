import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import Loading from '../../../loading';
import { createSchemeVersion } from '../actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getLatestScheme, listSchemeVersions, type SchemeVersion } from '@/lib/data/schemes';
import { formatDateTime, statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';
import { AGGREGATIONS, ASSESSMENT_MODES, COMPONENT_KEYS } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Evaluation scheme' };

const Search = z.object({ page: pageParam.catch(1) });
const ROWS = 10;
const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());

export default function SchemePage({ params, searchParams }: PageProps<'/admin/schemes/[componentKey]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Scheme params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Scheme({
  params,
  searchParams,
}: {
  params: PageProps<'/admin/schemes/[componentKey]'>['params'];
  searchParams: PageProps<'/admin/schemes/[componentKey]'>['searchParams'];
}) {
  const key = z.enum(COMPONENT_KEYS).safeParse((await params).componentKey);
  if (!key.success) notFound();
  const { page } = Search.parse(await searchParams);
  const [versions, latest] = await Promise.all([listSchemeVersions(key.data, page), getLatestScheme(key.data)]);
  const path = `/admin/schemes/${key.data}`;
  return (
    <>
      <PageHeader
        title={`Scheme: ${key.data.replaceAll('+', ' + ')}`}
        description="Applies to courses with exactly these components. Saving creates the next version and retires the current one."
      />
      <div className="grid gap-6">
        <DataTable
          columns={[
            { header: 'Version', cell: (v) => <span className="font-medium">v{v.version}</span> },
            { header: 'Name', cell: (v) => v.name },
            { header: 'Status', cell: (v) => <Badge variant={statusTone(v.status)}>{v.status}</Badge> },
            { header: 'Internal / external', cell: (v) => `${v.internalMax} / ${v.externalMax}` },
            { header: 'Weights', cell: (v) => v.components.map((c) => `${c.label} ${c.weight}`).join(' · ') },
            { header: 'Saved', cell: (v) => formatDateTime(v.createdAt) },
          ]}
          rows={versions.rows}
          rowKey={(v) => v.id}
          total={versions.total}
          page={page}
          pageSize={pageSize}
          query={{}}
          path={path}
          empty="No version yet. Create the first one below."
        />
        <section className="bg-card rounded-lg border p-5 sm:p-6">
          <h2 className="font-semibold">{latest ? `New version (v${latest.version + 1})` : 'First version'}</h2>
          <p className="text-muted-foreground mt-1 mb-4 max-w-prose text-sm">
            {latest ? `Starts from v${latest.version}. ` : ''}Weights must add up to the internal maximum. Leave unused
            rows empty.
          </p>
          <ActionForm
            key={latest?.id ?? 'none'}
            action={createSchemeVersion}
            submitLabel="Save as new version"
            successMessage="New version saved."
          >
            <input type="hidden" name="componentKey" value={key.data} />
            <Field name="name" label="Name">
              <Input name="name" required maxLength={120} defaultValue={latest?.name} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field name="internalMax" label="Internal maximum">
                <Input
                  name="internalMax"
                  type="number"
                  required
                  min={1}
                  max={200}
                  step="any"
                  defaultValue={latest?.internalMax ?? 50}
                />
              </Field>
              <Field name="externalMax" label="External maximum">
                <Input
                  name="externalMax"
                  type="number"
                  required
                  min={0}
                  max={200}
                  step="any"
                  defaultValue={latest?.externalMax ?? 50}
                />
              </Field>
              <Field name="decimals" label="Decimals">
                <NativeSelect name="decimals" defaultValue={String(latest?.decimals ?? 0)}>
                  {[0, 1, 2].map((d) => (
                    <NativeSelectOption key={d} value={d}>
                      {d}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field name="roundingMode" label="Rounding">
                <NativeSelect name="roundingMode" defaultValue={latest?.roundingMode ?? 'half_up'}>
                  <NativeSelectOption value="half_up">Half up</NativeSelectOption>
                  <NativeSelectOption value="ceil">Always up</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            <FieldErrors name="components" />
            <ol className="grid gap-4">
              {Array.from({ length: ROWS }, (_, i) => (
                <li key={i}>
                  <ComponentRow index={i} row={latest?.components[i]} />
                </li>
              ))}
            </ol>
          </ActionForm>
        </section>
      </div>
    </>
  );
}

function ComponentRow({ index: i, row }: { index: number; row: SchemeVersion['components'][number] | undefined }) {
  return (
    <fieldset className="grid gap-3 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">Component {i + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_6rem]">
        <Input
          name={`key_${i}`}
          aria-label={`Component ${i + 1} key`}
          placeholder="key, e.g. quiz"
          maxLength={40}
          defaultValue={row?.key}
        />
        <Input
          name={`label_${i}`}
          aria-label={`Component ${i + 1} label`}
          placeholder="Label shown to students"
          maxLength={80}
          defaultValue={row?.label}
        />
        <Input
          name={`weight_${i}`}
          aria-label={`Component ${i + 1} weight`}
          type="number"
          step="any"
          min={0}
          placeholder="Weight"
          defaultValue={row?.weight}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[12rem_6rem]">
        <NativeSelect
          name={`aggregation_${i}`}
          aria-label={`Component ${i + 1} aggregation`}
          defaultValue={row?.aggregation ?? 'average'}
        >
          {AGGREGATIONS.map((a) => (
            <NativeSelectOption key={a} value={a}>
              {a === 'best_n' ? 'Best N of the scores' : label(a)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          name={`bestN_${i}`}
          aria-label={`Component ${i + 1} N`}
          type="number"
          min={1}
          placeholder="N"
          defaultValue={row?.bestN ?? undefined}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {ASSESSMENT_MODES.map((mode) => (
          <label key={mode} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={`modes_${i}[]`}
              value={mode}
              defaultChecked={row?.modes.includes(mode)}
              className="accent-primary size-4"
            />
            {label(mode)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
