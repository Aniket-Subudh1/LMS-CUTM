import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import Loading from '../../../loading';
import { saveBatch, saveProgram, saveProgramOutcomes } from '../../actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  getBatch,
  getProgram,
  listBatches,
  listDepartmentsForSelect,
  type Outcome,
  type ProgramDetail,
} from '@/lib/data/structure';
import { statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Programme' };

const Search = z.object({ page: pageParam.catch(1), batch: objectId.optional().catch(undefined) });
const PO_ROWS = 20;
const PSO_ROWS = 10;

export default function ProgramPage({ params, searchParams }: PageProps<'/admin/programs/[id]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Program params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Program({
  params,
  searchParams,
}: {
  params: PageProps<'/admin/programs/[id]'>['params'];
  searchParams: PageProps<'/admin/programs/[id]'>['searchParams'];
}) {
  const { id } = await params;
  const { page, batch } = Search.parse(await searchParams);
  const program = await getProgram(id);
  const [departments, batches, editing] = await Promise.all([
    listDepartmentsForSelect(),
    listBatches(program.id, page),
    batch ? getBatch(program.id, batch) : null,
  ]);
  const path = `/admin/programs/${program.id}`;
  return (
    <>
      <PageHeader
        title={`${program.code} · ${program.name}`}
        description={program.category === 'ugc' ? 'UGC programme' : 'Skill programme'}
      />
      <div className="grid gap-6">
        <section className="bg-card max-w-2xl rounded-lg border p-5 sm:p-6">
          <h2 className="mb-4 font-semibold">Details</h2>
          <ActionForm action={saveProgram} submitLabel="Save changes" successMessage="Programme saved.">
            <input type="hidden" name="id" value={program.id} />
            <input type="hidden" name="category" value={program.category} />
            <Field name="code" label="Code">
              <Input name="code" required maxLength={20} defaultValue={program.code} />
            </Field>
            <Field name="name" label="Name">
              <Input name="name" required maxLength={160} defaultValue={program.name} />
            </Field>
            <Field name="departmentId" label="Department">
              <NativeSelect name="departmentId" required defaultValue={program.departmentId}>
                {departments.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>
                    {d.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field name="durationSemesters" label="Duration (semesters)">
              <Input
                name="durationSemesters"
                type="number"
                required
                min={1}
                max={12}
                defaultValue={program.durationSemesters}
              />
            </Field>
            <Field name="status" label="Status">
              <NativeSelect name="status" defaultValue={program.status}>
                <NativeSelectOption value="active">Active</NativeSelectOption>
                <NativeSelectOption value="archived">Archived</NativeSelectOption>
              </NativeSelect>
            </Field>
          </ActionForm>
        </section>

        {program.category === 'ugc' && <Outcomes program={program} />}

        <section className="grid gap-4">
          <h2 className="font-semibold">Batches</h2>
          <DataTable
            columns={[
              { header: 'Name', cell: (b) => <span className="font-medium">{b.name}</span> },
              { header: 'Starts', cell: (b) => b.startYear },
              { header: 'Sections', cell: (b) => (b.sections.length > 0 ? b.sections.join(', ') : '—') },
              { header: 'Status', cell: (b) => <Badge variant={statusTone(b.status)}>{b.status}</Badge> },
              {
                header: '',
                className: 'text-right',
                cell: (b) => (
                  <Link href={`${path}?batch=${b.id}`} className="text-sm underline-offset-4 hover:underline">
                    Edit<span className="sr-only"> {b.name}</span>
                  </Link>
                ),
              },
            ]}
            rows={batches.rows}
            rowKey={(b) => b.id}
            total={batches.total}
            page={page}
            pageSize={pageSize}
            query={{}}
            path={path}
            empty="Add the first batch below."
          />
          <div className="bg-card max-w-2xl rounded-lg border p-5 sm:p-6">
            <h3 className="mb-4 font-semibold">{editing ? `Edit ${editing.name}` : 'Add a batch'}</h3>
            <ActionForm
              key={editing?.id ?? 'new'}
              action={saveBatch}
              submitLabel={editing ? 'Save changes' : 'Add batch'}
              successMessage="Batch added."
            >
              <input type="hidden" name="programId" value={program.id} />
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field name="name" label="Name" hint="For example 2026 intake.">
                <Input name="name" required maxLength={80} defaultValue={editing?.name} />
              </Field>
              <Field name="startYear" label="Start year">
                <Input
                  name="startYear"
                  type="number"
                  required
                  min={1990}
                  max={2100}
                  defaultValue={editing?.startYear}
                />
              </Field>
              <Field
                name="sections"
                label="Sections"
                hint="Separate with commas or spaces, for example A, B, C. Leave empty for none."
              >
                <Input name="sections" defaultValue={editing?.sections.join(', ')} />
              </Field>
              <Field name="status" label="Status">
                <NativeSelect name="status" defaultValue={editing?.status ?? 'active'}>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="graduated">Graduated</NativeSelectOption>
                </NativeSelect>
              </Field>
            </ActionForm>
          </div>
        </section>
      </div>
    </>
  );
}

function Outcomes({ program }: { program: ProgramDetail }) {
  return (
    <section className="bg-card rounded-lg border p-5 sm:p-6">
      <h2 className="font-semibold">Programme outcomes</h2>
      <p className="text-muted-foreground mt-1 mb-4 max-w-prose text-sm">
        A row with an empty code is ignored. An outcome that a course maps to cannot be removed until that mapping is
        cleared.
      </p>
      <ActionForm action={saveProgramOutcomes} submitLabel="Save outcomes" successMessage="Outcomes saved.">
        <input type="hidden" name="programId" value={program.id} />
        <OutcomeGrid label="POs" prefix="po" rows={PO_ROWS} outcomes={program.pos} />
        <FieldErrors name="pos" />
        <OutcomeGrid label="PSOs" prefix="pso" rows={PSO_ROWS} outcomes={program.psos} />
        <FieldErrors name="psos" />
      </ActionForm>
    </section>
  );
}

function OutcomeGrid({
  label,
  prefix,
  rows,
  outcomes,
}: {
  label: string;
  prefix: 'po' | 'pso';
  rows: number;
  outcomes: Outcome[];
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {Array.from({ length: rows }, (_, i) => {
        const o: Outcome | undefined = outcomes[i];
        return (
          <div key={i} className="grid gap-2 sm:grid-cols-[6rem_1fr_1.5fr]">
            <Input
              name={`${prefix}_code_${i}`}
              aria-label={`${label} row ${i + 1} code`}
              placeholder={`${prefix.toUpperCase()}${i + 1}`}
              maxLength={10}
              defaultValue={o?.code}
            />
            <Input
              name={`${prefix}_title_${i}`}
              aria-label={`${label} row ${i + 1} title`}
              placeholder="Title"
              maxLength={200}
              defaultValue={o?.title}
            />
            <Input
              name={`${prefix}_description_${i}`}
              aria-label={`${label} row ${i + 1} description`}
              placeholder="Description (optional)"
              maxLength={1000}
              defaultValue={o?.description}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
