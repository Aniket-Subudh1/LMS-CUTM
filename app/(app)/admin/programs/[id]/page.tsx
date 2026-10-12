import { Suspense } from 'react';
import type { Metadata } from 'next';
import { GraduationCapIcon, PencilSimpleIcon, PlusIcon, TargetIcon, UsersFourIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import { saveBatch, saveProgram, saveProgramOutcomes } from '../../actions';
import { Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  getProgram,
  listBatches,
  listDepartmentsForSelect,
  type BatchRow,
  type Outcome,
  type ProgramDetail,
} from '@/lib/data/structure';
import { statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Programme' };

const Search = z.object({ page: pageParam.catch(1) });
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
  const { page } = Search.parse(await searchParams);
  const program = await getProgram(id);
  const [departments, batches] = await Promise.all([listDepartmentsForSelect(), listBatches(program.id, page)]);
  const department = departments.find((d) => d.id === program.departmentId)?.label ?? '—';
  return (
    <>
      <PageHeader
        icon={<GraduationCapIcon weight="duotone" />}
        title={`${program.code} · ${program.name}`}
        description={program.category === 'ugc' ? 'UGC programme' : 'Skill programme'}
        actions={
          <FormDialog
            trigger={
              <Button variant="outline">
                <PencilSimpleIcon weight="duotone" /> Edit details
              </Button>
            }
            icon={<GraduationCapIcon weight="duotone" />}
            title={`Edit ${program.code}`}
            description="The category is fixed at creation. A programme with courses cannot move department."
            action={saveProgram}
            submitLabel="Save changes"
            successMessage="Programme updated."
          >
            <input type="hidden" name="id" value={program.id} />
            <input type="hidden" name="category" value={program.category} />
            <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
              <Field name="code" label="Code">
                <Input name="code" required maxLength={20} defaultValue={program.code} />
              </Field>
              <Field name="name" label="Name">
                <Input name="name" required maxLength={160} defaultValue={program.name} />
              </Field>
            </div>
            <Field name="departmentId" label="Department">
              <NativeSelect name="departmentId" required defaultValue={program.departmentId}>
                {departments.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>
                    {d.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
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
            </div>
          </FormDialog>
        }
      />
      <div className="grid gap-6">
        <dl className="surface grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-4">
          <Fact label="Department">{department}</Fact>
          <Fact label="Category">{program.category === 'ugc' ? 'UGC' : 'Skill'}</Fact>
          <Fact label="Duration">{program.durationSemesters} semesters</Fact>
          <Fact label="Status">
            <Badge variant={statusTone(program.status)}>{program.status}</Badge>
          </Fact>
        </dl>

        {program.category === 'ugc' && <Outcomes program={program} />}

        <Section
          icon={<UsersFourIcon weight="duotone" />}
          title="Batches"
          description="An intake year of students. Sections split a batch for offerings and enrolment."
          action={<BatchDialog programId={program.id} />}
        >
          <DataTable
            columns={[
              { header: 'Name', cell: (b) => <span className="font-medium">{b.name}</span> },
              { header: 'Starts', cell: (b) => b.startYear, className: 'tabular-nums' },
              { header: 'Sections', cell: (b) => (b.sections.length > 0 ? b.sections.join(', ') : '—') },
              { header: 'Status', cell: (b) => <Badge variant={statusTone(b.status)}>{b.status}</Badge> },
              {
                header: 'Actions',
                className: 'w-0 text-right',
                cell: (b) => <BatchDialog programId={program.id} batch={b} />,
              },
            ]}
            rows={batches.rows}
            rowKey={(b) => b.id}
            total={batches.total}
            page={page}
            pageSize={pageSize}
            query={{}}
            path={`/admin/programs/${program.id}`}
            empty="Add the first batch with Add batch."
          />
        </Section>
      </div>
    </>
  );
}

function BatchDialog({ programId, batch }: { programId: string; batch?: BatchRow }) {
  return (
    <FormDialog
      trigger={
        batch ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${batch.name}`}>
            <PencilSimpleIcon weight="duotone" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon weight="bold" /> Add batch
          </Button>
        )
      }
      icon={<UsersFourIcon weight="duotone" />}
      title={batch ? `Edit ${batch.name}` : 'Add a batch'}
      description="Students are created into a batch and section; offerings enrol a whole batch or one section."
      action={saveBatch}
      submitLabel={batch ? 'Save changes' : 'Add batch'}
      successMessage={batch ? 'Batch updated.' : 'Batch added.'}
    >
      <input type="hidden" name="programId" value={programId} />
      {batch && <input type="hidden" name="id" value={batch.id} />}
      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <Field name="name" label="Name" hint="For example 2026 intake.">
          <Input name="name" required maxLength={80} defaultValue={batch?.name} />
        </Field>
        <Field name="startYear" label="Start year">
          <Input name="startYear" type="number" required min={1990} max={2100} defaultValue={batch?.startYear} />
        </Field>
      </div>
      <Field
        name="sections"
        label="Sections"
        hint="Separate with commas or spaces, for example A, B, C. Leave empty for none."
      >
        <Input name="sections" defaultValue={batch?.sections.join(', ')} />
      </Field>
      <Field name="status" label="Status">
        <NativeSelect name="status" defaultValue={batch?.status ?? 'active'}>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="graduated">Graduated</NativeSelectOption>
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}

function Outcomes({ program }: { program: ProgramDetail }) {
  return (
    <Section
      icon={<TargetIcon weight="duotone" />}
      title="Programme outcomes"
      description={`${program.pos.length} POs and ${program.psos.length} PSOs. Course outcomes map to these.`}
      action={
        <FormDialog
          trigger={
            <Button variant="outline" size="sm">
              <PencilSimpleIcon weight="duotone" /> Edit outcomes
            </Button>
          }
          size="full"
          icon={<TargetIcon weight="duotone" />}
          title="Edit programme outcomes"
          description="A row with an empty code is ignored. An outcome that a course maps to cannot be removed until that mapping is cleared."
          action={saveProgramOutcomes}
          submitLabel="Save outcomes"
          successMessage="Outcomes saved."
        >
          <input type="hidden" name="programId" value={program.id} />
          <OutcomeGrid label="POs" prefix="po" rows={PO_ROWS} outcomes={program.pos} />
          <FieldErrors name="pos" />
          <OutcomeGrid label="PSOs" prefix="pso" rows={PSO_ROWS} outcomes={program.psos} />
          <FieldErrors name="psos" />
        </FormDialog>
      }
    >
      <div className="surface grid gap-x-8 gap-y-6 p-5 lg:grid-cols-2">
        <OutcomeList label="Programme outcomes (POs)" outcomes={program.pos} />
        <OutcomeList label="Programme-specific outcomes (PSOs)" outcomes={program.psos} />
      </div>
    </Section>
  );
}

function OutcomeList({ label, outcomes }: { label: string; outcomes: Outcome[] }) {
  return (
    <div className="grid content-start gap-3">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</h3>
      {outcomes.length === 0 ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <ul className="grid gap-2.5">
          {outcomes.map((o) => (
            <li key={o.code} className="flex gap-3 text-sm">
              <span className="bg-primary/10 text-primary h-fit min-w-12 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold">
                {o.code}
              </span>
              <span>
                <span className="font-medium">{o.title}</span>
                {o.description && <span className="text-muted-foreground block">{o.description}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
