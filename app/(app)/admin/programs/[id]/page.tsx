import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import {
  addProgrammeCourse,
  removeProgrammeCourse,
  saveBaskets,
  saveBatch,
  saveProgram,
  saveProgramOutcomes,
} from '../../actions';
import { ChipInput } from '@/components/chip-input';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  getProgram,
  listBatches,
  listCurriculum,
  listDepartmentsForSelect,
  type BatchRow,
  type CurriculumRow,
  type ProgramDetail,
} from '@/lib/data/structure';
import { creditTotal, formatCredits } from '@/lib/domain/catalog';
import { statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Programme' };

// `basket=-` lists the courses in no basket.
const Search = z.object({
  page: pageParam.catch(1),
  cpage: pageParam.catch(1),
  basket: z.string().max(60).optional().catch(undefined),
});

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
  const { page, cpage, basket } = Search.parse(await searchParams);
  const program = await getProgram(id);
  const [departments, batches, curriculum] = await Promise.all([
    listDepartmentsForSelect(),
    listBatches(program.id, page),
    listCurriculum(program.id, cpage, basket === '-' ? '' : basket || undefined),
  ]);
  const department = departments.find((d) => d.id === program.departmentId)?.label ?? null;
  const listed = program.baskets.reduce((n, b) => n + b.courses, program.unbasketed.courses);
  const path = `/admin/programs/${program.id}`;
  return (
    <>
      <PageHeader
        icon={<PageIcon name="diploma" />}
        title={`${program.code} · ${program.name}`}
        description={department ?? 'No department yet: set one before creating offerings.'}
        actions={
          <FormDialog
            trigger={
              <Button variant="outline">
                <PencilSimpleIcon weight="duotone" /> Edit details
              </Button>
            }
            icon={<PageIcon name="diploma" className="size-8" />}
            title={`Edit ${program.code}`}
            description="Offerings copy the programme's department, so a programme with offerings keeps its department."
            action={saveProgram}
            submitLabel="Save changes"
            successMessage="Programme updated."
          >
            <input type="hidden" name="id" value={program.id} />
            <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
              <Field name="code" label="Code">
                <Input name="code" required maxLength={20} defaultValue={program.code} />
              </Field>
              <Field name="name" label="Name">
                <Input name="name" required maxLength={160} defaultValue={program.name} />
              </Field>
            </div>
            <Field name="departmentId" label="Department">
              <NativeSelect name="departmentId" required defaultValue={program.departmentId ?? ''}>
                <NativeSelectOption value="" disabled>
                  Choose a department
                </NativeSelectOption>
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
                  defaultValue={program.durationSemesters ?? 8}
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
          <Fact label="Department">{department ?? <Badge variant="warning">Not set</Badge>}</Fact>
          <Fact label="Duration">
            {program.durationSemesters ? `${program.durationSemesters} semesters` : 'Not set'}
          </Fact>
          <Fact label="Courses">{listed}</Fact>
          <Fact label="Status">
            <Badge variant={statusTone(program.status)}>{program.status}</Badge>
          </Fact>
        </dl>

        <Baskets program={program} />
        <Curriculum
          program={program}
          rows={curriculum.rows}
          total={curriculum.total}
          page={cpage}
          basket={basket}
          path={path}
        />
        <Outcomes program={program} />

        <Section
          icon={<PageIcon name="users" className="size-8" />}
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
            query={basket ? { basket, cpage: String(cpage) } : { cpage: String(cpage) }}
            path={path}
            empty="Add the first batch with Add batch."
          />
        </Section>
      </div>
    </>
  );
}

function Baskets({ program }: { program: ProgramDetail }) {
  const rows = [...program.baskets, ...Array.from({ length: Math.min(2, 12 - program.baskets.length) }, () => null)];
  return (
    <Section
      icon={<PageIcon name="baskets" className="size-8" />}
      title="Baskets"
      description="The groups of the programme structure, such as Basket I (core) or Basket IV (choice), with the credits a student takes from each."
      action={
        <FormDialog
          trigger={
            <Button variant="outline" size="sm">
              <PencilSimpleIcon weight="duotone" /> Edit baskets
            </Button>
          }
          size="wide"
          icon={<PageIcon name="baskets" className="size-8" />}
          title="Baskets"
          description="Renaming a basket keeps its courses. A basket that lists courses cannot be removed until they move."
          action={saveBaskets}
          submitLabel="Save baskets"
          successMessage="Baskets saved."
        >
          <input type="hidden" name="programId" value={program.id} />
          <input type="hidden" name="rows" value={rows.length} />
          <ol className="grid gap-3">
            {rows.map((b, i) => (
              <li key={b?.id ?? `new-${i}`} className="ring-border/80 grid gap-3 rounded-md p-4 ring-1">
                {b && <input type="hidden" name={`basketId_${i}`} value={b.id} />}
                <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                  <Field name={`name_${i}`} label="Name">
                    <Input name={`name_${i}`} maxLength={60} defaultValue={b?.name} placeholder="Basket I" />
                  </Field>
                  <Field name={`title_${i}`} label="Title (optional)">
                    <Input
                      name={`title_${i}`}
                      maxLength={120}
                      defaultValue={b?.title ?? ''}
                      placeholder="Foundation courses"
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Field name={`scope_${i}`} label="Kind">
                    <NativeSelect name={`scope_${i}`} defaultValue={b?.scope ?? ''}>
                      <NativeSelectOption value="">Not set</NativeSelectOption>
                      <NativeSelectOption value="core">Core: every course</NativeSelectOption>
                      <NativeSelectOption value="choice">Choice: students pick</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field name={`minCredits_${i}`} label="Minimum credits">
                    <Input
                      name={`minCredits_${i}`}
                      type="number"
                      min={0}
                      max={300}
                      step={0.5}
                      defaultValue={b?.minCredits ?? ''}
                    />
                  </Field>
                  {b && (
                    <label className="text-muted-foreground flex h-9 items-center gap-2 text-sm">
                      <input type="checkbox" name={`remove_${i}`} value="true" className="accent-destructive size-4" />
                      Remove
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </FormDialog>
      }
    >
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
        {program.baskets.map((b) => (
          <li key={b.id} className="surface grid content-start gap-1.5 p-4">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{b.name}</span>
              {b.scope && <Badge variant="outline">{b.scope === 'core' ? 'Core' : 'Choice'}</Badge>}
            </span>
            {b.title && <span className="text-muted-foreground text-sm">{b.title}</span>}
            <span className="text-sm tabular-nums">
              {b.courses} {b.courses === 1 ? 'course' : 'courses'} · {b.credits} credits
              {b.minCredits !== null && <span className="text-muted-foreground"> (at least {b.minCredits})</span>}
            </span>
          </li>
        ))}
        <li className="surface grid content-start gap-1.5 p-4">
          <span className="font-medium">No basket</span>
          <span className="text-sm tabular-nums">
            {program.unbasketed.courses} {program.unbasketed.courses === 1 ? 'course' : 'courses'} ·{' '}
            {program.unbasketed.credits} credits
          </span>
        </li>
      </ul>
    </Section>
  );
}

function Curriculum({
  program,
  rows,
  total,
  page,
  basket,
  path,
}: {
  program: ProgramDetail;
  rows: CurriculumRow[];
  total: number;
  page: number;
  basket?: string;
  path: string;
}) {
  return (
    <Section
      icon={<PageIcon name="books" className="size-8" />}
      title="Curriculum"
      description="The catalogue courses this programme lists. Offerings for its batches can only be of these courses."
      action={
        <FormDialog
          trigger={
            <Button variant="outline" size="sm">
              <PlusIcon weight="bold" /> Add course
            </Button>
          }
          icon={<PageIcon name="books" className="size-8" />}
          title="Add a course to the curriculum"
          description="The course must be in the catalogue. Most courses arrive with the course list upload."
          action={addProgrammeCourse}
          submitLabel="Add course"
          successMessage="Course added."
        >
          <input type="hidden" name="programId" value={program.id} />
          <Field name="code" label="Course code">
            <Input name="code" required maxLength={20} placeholder="CUTM1535" />
          </Field>
          <Field name="basket" label="Basket">
            <NativeSelect name="basket" defaultValue="">
              <NativeSelectOption value="">No basket</NativeSelectOption>
              {program.baskets.map((b) => (
                <NativeSelectOption key={b.id} value={b.name}>
                  {b.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </FormDialog>
      }
    >
      {program.baskets.length > 0 && (
        <FilterForm action={path} submitLabel="Show" plain>
          <label className="grid gap-1.5 text-sm font-medium">
            Basket
            <NativeSelect name="basket" defaultValue={basket ?? ''}>
              <NativeSelectOption value="">All baskets</NativeSelectOption>
              {program.baskets.map((b) => (
                <NativeSelectOption key={b.id} value={b.name}>
                  {b.name}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value="-">No basket</NativeSelectOption>
            </NativeSelect>
          </label>
        </FilterForm>
      )}
      <DataTable
        columns={[
          {
            header: 'Course',
            cell: (c: CurriculumRow) => (
              <Link href={`/catalog/${c.courseId}`} className="grid gap-0.5 hover:underline">
                <span className="font-medium">{c.code}</span>
                <span className="text-muted-foreground text-sm">{c.title}</span>
              </Link>
            ),
          },
          {
            header: 'Credits',
            cell: (c) => (
              <span className="tabular-nums" title={`${creditTotal(c.credits)} credits`}>
                {formatCredits(c.credits)}
              </span>
            ),
          },
          { header: 'Basket', cell: (c) => c.basket ?? '—' },
          { header: 'Listed as', cell: (c) => c.courseType ?? '—' },
          {
            header: 'Actions',
            className: 'w-0 text-right',
            cell: (c) => (
              <ActionForm
                action={removeProgrammeCourse}
                submitLabel="Remove"
                submitVariant="outline"
                submitSize="sm"
                confirm={{
                  title: `Remove ${c.code} from ${program.code}?`,
                  message: 'Its running offerings are not affected; new offerings for this programme cannot use it.',
                }}
              >
                <input type="hidden" name="programId" value={program.id} />
                <input type="hidden" name="courseId" value={c.courseId} />
              </ActionForm>
            ),
          },
        ]}
        rows={rows}
        rowKey={(c) => c.courseId}
        total={total}
        page={page}
        pageSize={pageSize}
        query={basket ? { basket } : {}}
        path={path}
        empty="No courses yet. Add them with Add course, or upload the course list on Imports."
      />
    </Section>
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
      icon={<PageIcon name="users" className="size-8" />}
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
      <ChipInput
        name="sections"
        label="Sections"
        kind="word"
        initial={batch?.sections ?? []}
        max={20}
        maxLength={10}
        placeholder="Add a section, like A"
        hint="Leave it empty when the batch has no sections."
      />
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
  const titled = program.outcomes.filter((o) => o.title).length;
  return (
    <Section
      icon={<PageIcon name="outcomes" className="size-8" />}
      title="Programme outcomes"
      description={`The codes PO1–PO12 and PSO1–PSO3 are the same in every programme; ${titled} of 15 have this programme's titles.`}
      action={
        <FormDialog
          trigger={
            <Button variant="outline" size="sm">
              <PencilSimpleIcon weight="duotone" /> Edit titles
            </Button>
          }
          size="wide"
          icon={<PageIcon name="outcomes" className="size-8" />}
          title="Programme outcome titles"
          description="Leave a box empty if the programme does not use that code; course mappings and reports then show the code alone."
          action={saveProgramOutcomes}
          submitLabel="Save titles"
          successMessage="Titles saved."
        >
          <input type="hidden" name="programId" value={program.id} />
          <div className="grid gap-2">
            {program.outcomes.map((o) => (
              <label key={o.code} className="grid items-center gap-2 sm:grid-cols-[4rem_1fr]">
                <span className="text-sm font-semibold">{o.code}</span>
                <Input name={`title_${o.code}`} maxLength={200} defaultValue={o.title} aria-label={`${o.code} title`} />
              </label>
            ))}
          </div>
          <FieldErrors name="outcomeTitles" />
        </FormDialog>
      }
    >
      <ul className="surface grid gap-2.5 p-5 lg:grid-cols-2">
        {program.outcomes.map((o) => (
          <li key={o.code} className="flex gap-3 text-sm">
            <span className="bg-primary/10 text-primary h-fit min-w-12 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold">
              {o.code}
            </span>
            <span className={o.title ? 'font-medium' : 'text-muted-foreground'}>{o.title || 'Not used'}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
