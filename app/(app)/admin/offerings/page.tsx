import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { ChalkboardTeacherIcon, PlusIcon, UserSwitchIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { createOfferings, setOfferingStatus, updateOfferingFaculty } from './actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  listBatchesForSelect,
  listCurriculumForSelect,
  listDepartmentFaculty,
  listOfferings,
  listTermsForSelect,
  type OfferingRow,
} from '@/lib/data/offerings';
import { listDepartmentsForSelect } from '@/lib/data/structure';
import { statusTone } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';
import { OFFERING_STATUSES, PROJECT_MODES } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Offerings' };

const Search = z.object({
  page: pageParam.catch(1),
  term: objectId.optional().catch(undefined),
  department: objectId.optional().catch(undefined),
  status: z.enum(OFFERING_STATUSES).optional().catch(undefined),
  // The New offering dialog's first step: the batch, whose programme's curriculum and faculty it lists.
  batch: objectId.optional().catch(undefined),
});

export default function OfferingsPage({ searchParams }: PageProps<'/admin/offerings'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Offerings searchParams={searchParams} />
    </Suspense>
  );
}

async function Offerings({ searchParams }: { searchParams: PageProps<'/admin/offerings'>['searchParams'] }) {
  const { page, term, department, status, batch } = Search.parse(await searchParams);
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
        icon={<ChalkboardTeacherIcon weight="duotone" />}
        title="Offerings"
        description="A course taught to one batch (or section) in one term. Students see an offering once it is active."
        actions={<NewOffering batchId={batch} terms={terms} />}
      />
      <FilterForm action="/admin/offerings">
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
      </FilterForm>
      <DataTable
        columns={[
          { header: 'Offering', cell: (o) => <span className="font-medium">{o.title}</span> },
          { header: 'Term', cell: (o) => o.termCode },
          { header: 'Faculty', cell: (o) => <FacultyCell offering={o} /> },
          { header: 'Students', cell: (o) => o.students, className: 'text-right tabular-nums' },
          { header: 'Status', cell: (o) => <Badge variant={statusTone(o.status)}>{o.status}</Badge> },
          { header: 'Actions', cell: (o) => <StatusAction offering={o} /> },
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

async function NewOffering({
  batchId,
  terms,
}: {
  batchId?: string;
  terms: { id: string; label: string; current: boolean }[];
}) {
  const batches = await listBatchesForSelect();
  const batch = batches.find((b) => b.id === batchId);
  const [courses, faculty] = batch
    ? await Promise.all([listCurriculumForSelect(batch.programId), listDepartmentFaculty(batch.departmentId)])
    : [[], []];
  const programmes = [...new Set(batches.map((b) => b.programme))];
  const baskets = [...new Set(courses.map((c) => c.basket))];
  const current = terms.find((t) => t.current)?.id ?? '';
  return (
    <FormDialog
      trigger={
        <Button>
          <PlusIcon weight="bold" /> New offering
        </Button>
      }
      size="wide"
      icon={<ChalkboardTeacherIcon weight="duotone" />}
      title="New offering"
      description="One offering per ticked section, each with its students enrolled. The course must be in the batch's programme."
      openParam="offering"
      preface={
        <FilterForm action="/admin/offerings" submitLabel="Continue" plain>
          <input type="hidden" name="new" value="offering" />
          <label className="grid min-w-60 flex-1 gap-1.5 text-sm font-medium">
            Batch
            <NativeSelect name="batch" required defaultValue={batch?.id ?? ''}>
              <NativeSelectOption value="" disabled>
                Choose a batch
              </NativeSelectOption>
              {programmes.map((programme) => (
                <optgroup key={programme} label={programme}>
                  {batches
                    .filter((b) => b.programme === programme)
                    .map((b) => (
                      <NativeSelectOption key={b.id} value={b.id}>
                        {b.label}
                      </NativeSelectOption>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          </label>
        </FilterForm>
      }
      action={createOfferings}
      submitLabel="Create offerings and enrol students"
      successMessage="Offerings created and students enrolled."
    >
      {!batch ? (
        <p className="text-muted-foreground text-sm">Choose the batch above and press Continue.</p>
      ) : (
        <div className="group/offering grid gap-5">
          <input type="hidden" name="batchId" value={batch.id} />
          {!batch.departmentId && (
            <p className="text-warning text-sm">
              {batch.programme} has no department yet. Set it on the programme page first.
            </p>
          )}
          <Field name="courseId" label="Course" hint={`From the curriculum of ${batch.programme}.`}>
            <NativeSelect name="courseId" required defaultValue="">
              <NativeSelectOption value="" disabled>
                {courses.length ? 'Choose a course' : 'The programme lists no courses yet'}
              </NativeSelectOption>
              {baskets.map((basket) => (
                <optgroup key={basket ?? '-'} label={basket ?? 'No basket'}>
                  {courses
                    .filter((c) => c.basket === basket)
                    .map((c) => (
                      <NativeSelectOption key={c.id} value={c.id} data-project={c.project || undefined}>
                        {c.label}
                      </NativeSelectOption>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="termId" label="Term">
              <NativeSelect name="termId" required defaultValue={current}>
                <NativeSelectOption value="" disabled>
                  Choose a term
                </NativeSelectOption>
                {terms.map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {t.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <fieldset className="grid content-start gap-2">
              <legend className="mb-2 text-sm font-medium">Sections</legend>
              {batch.sections.length === 0 ? (
                <>
                  <input type="hidden" name="sections[]" value="*" />
                  <p className="text-muted-foreground text-sm">
                    The batch has no sections: one offering for all of it.
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {batch.sections.map((section) => (
                    <Chip key={section} name="sections[]" value={section} checked>
                      Section {section}
                    </Chip>
                  ))}
                </div>
              )}
              <FieldErrors name="sections[]" />
            </fieldset>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Faculty</legend>
            {faculty.length > 0 ? (
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {faculty.map((f) => (
                  <Chip key={f.id} name="faculty[]" value={f.id}>
                    {f.label}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No faculty in this programme&apos;s department yet.</p>
            )}
            <FieldErrors name="faculty[]" />
          </fieldset>
          <Field
            name="otherFaculty"
            label="Faculty from other departments (optional)"
            hint="Their emails, separated by commas. One to five faculty in all."
          >
            <Textarea name="otherFaculty" rows={2} />
          </Field>
          {/* Shown only when the chosen course has project credits (CSS only); the server checks it either way. */}
          <fieldset className="hidden gap-2 group-has-[option[data-project]:checked]/offering:grid">
            <legend className="mb-2 text-sm font-medium">How projects are tracked</legend>
            <div className="flex flex-wrap gap-2">
              {PROJECT_MODES.map((mode) => (
                <label
                  key={mode}
                  className="ring-border has-checked:bg-primary/10 has-checked:ring-primary/40 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1"
                >
                  <input type="radio" name="projectMode" value={mode} className="accent-primary size-4" />
                  {mode === 'github' ? 'GitHub repositories' : 'Task tracker'}
                </label>
              ))}
            </div>
            <FieldErrors name="projectMode" />
          </fieldset>
        </div>
      )}
    </FormDialog>
  );
}

function Chip({
  name,
  value,
  checked,
  children,
}: {
  name: string;
  value: string;
  checked?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="ring-border has-checked:bg-primary/10 has-checked:text-primary has-checked:ring-primary/40 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 transition-colors">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="accent-primary size-4" />
      {children}
    </label>
  );
}

function FacultyCell({ offering }: { offering: OfferingRow }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm">{offering.faculty.map((f) => f.name).join(', ') || 'None'}</span>
      <FormDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Change faculty of ${offering.title}`}>
            <UserSwitchIcon weight="duotone" />
          </Button>
        }
        icon={<UserSwitchIcon weight="duotone" />}
        title="Change faculty"
        description={offering.title}
        action={updateOfferingFaculty}
        submitLabel="Save faculty"
        successMessage="Faculty saved."
      >
        <input type="hidden" name="offeringId" value={offering.id} />
        <Field name="otherFaculty" label="Faculty emails" hint="One to five, separated by commas or new lines.">
          <Textarea
            name="otherFaculty"
            rows={4}
            required
            defaultValue={offering.faculty.map((f) => f.email).join('\n')}
          />
        </Field>
        <FieldErrors name="faculty[]" />
      </FormDialog>
    </div>
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
      submitSize="sm"
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
