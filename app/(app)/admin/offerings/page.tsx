import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ChalkboardTeacherIcon, PlusIcon, UserSwitchIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { createOffering, setOfferingStatus, updateOfferingFaculty } from './actions';
import { ActionForm, Field } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { listProgramsForSelect } from '@/lib/data/courses';
import {
  listBatchesForSelect,
  listCoursesForSelect,
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
  // The New offering dialog's first step: the programme whose courses and batches it lists.
  program: objectId.optional().catch(undefined),
});

export default function OfferingsPage({ searchParams }: PageProps<'/admin/offerings'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Offerings searchParams={searchParams} />
    </Suspense>
  );
}

async function Offerings({ searchParams }: { searchParams: PageProps<'/admin/offerings'>['searchParams'] }) {
  const { page, term, department, status, program } = Search.parse(await searchParams);
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
        actions={<NewOffering program={program} terms={terms} />}
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

async function NewOffering({ program, terms }: { program?: string; terms: { id: string; label: string }[] }) {
  const [programs, courses, batches] = await Promise.all([
    listProgramsForSelect(),
    program ? listCoursesForSelect(program) : [],
    program ? listBatchesForSelect(program) : [],
  ]);
  const placeholder = program ? undefined : 'Choose a programme first';
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
      description="Creating an offering enrols every student of the batch (and section, if you give one)."
      openParam="offering"
      preface={
        <FilterForm action="/admin/offerings" submitLabel="Load courses" plain>
          <input type="hidden" name="new" value="offering" />
          <label className="grid min-w-60 flex-1 gap-1.5 text-sm font-medium">
            Programme
            <NativeSelect name="program" required defaultValue={program ?? ''}>
              <NativeSelectOption value="" disabled>
                Choose a programme
              </NativeSelectOption>
              {programs.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </FilterForm>
      }
      action={createOffering}
      submitLabel="Create offering and enrol students"
      successMessage="Offering created and students enrolled."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="courseId" label="Course">
          <NativeSelect name="courseId" required defaultValue="">
            <NativeSelectOption value="" disabled>
              {placeholder ?? 'Choose a course'}
            </NativeSelectOption>
            {courses.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="termId" label="Term">
          <NativeSelect name="termId" required defaultValue="">
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
        <Field name="batchId" label="Batch">
          <NativeSelect name="batchId" required defaultValue="">
            <NativeSelectOption value="" disabled>
              {placeholder ?? 'Choose a batch'}
            </NativeSelectOption>
            {batches.map((b) => (
              <NativeSelectOption key={b.id} value={b.id}>
                {b.label}
                {b.sections.length > 0 ? ` · sections ${b.sections.join(', ')}` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="section" label="Section" hint="Leave empty to offer the course to the whole batch.">
          <Input name="section" maxLength={10} />
        </Field>
      </div>
      <Field name="faculty" label="Faculty emails" hint="One to five, separated by commas or new lines.">
        <Textarea name="faculty" rows={3} required />
      </Field>
      <Field name="projectMode" label="Project mode" hint="Required when the course has a project component.">
        <NativeSelect name="projectMode" defaultValue="">
          <NativeSelectOption value="">Not applicable</NativeSelectOption>
          {PROJECT_MODES.map((m) => (
            <NativeSelectOption key={m} value={m}>
              {m === 'github' ? 'GitHub' : 'Tracker'}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </FormDialog>
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
        <Field name="faculty" label="Faculty emails" hint="One to five, separated by commas or new lines.">
          <Textarea name="faculty" rows={4} required defaultValue={offering.faculty.map((f) => f.email).join('\n')} />
        </Field>
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
