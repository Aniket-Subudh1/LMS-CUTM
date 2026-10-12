import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../loading';
import { addCo, deleteCo, saveCoMap, saveCourse, saveObjectives, updateCo } from '../actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { CoPoMatrix } from '@/components/co-po-matrix';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { getCourse, type CourseDetail } from '@/lib/data/courses';
import { BLOOM_LEVELS, COMPONENTS } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Course' };

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export default function CoursePage({ params }: PageProps<'/admin/courses/[id]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Course params={params} />
    </Suspense>
  );
}

async function Course({ params }: { params: PageProps<'/admin/courses/[id]'>['params'] }) {
  const course = await getCourse((await params).id);
  return (
    <>
      <PageHeader
        title={`${course.code} · ${course.title}`}
        description={`${course.programCode} · ${course.category === 'ugc' ? 'UGC' : 'Skill'} course`}
      />
      <div className="grid gap-6">
        <section className="bg-card max-w-2xl rounded-lg border p-5 sm:p-6">
          <h2 className="mb-4 font-semibold">Details</h2>
          <ActionForm action={saveCourse} submitLabel="Save changes" successMessage="Course saved.">
            <input type="hidden" name="id" value={course.id} />
            <input type="hidden" name="programId" value={course.programId} />
            <Field name="code" label="Code">
              <Input name="code" required maxLength={20} defaultValue={course.code} />
            </Field>
            <Field name="title" label="Title">
              <Input name="title" required maxLength={160} defaultValue={course.title} />
            </Field>
            <Field name="credits" label="Credits" hint="In steps of 0.5.">
              <Input name="credits" type="number" required min={0} max={30} step={0.5} defaultValue={course.credits} />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Components</legend>
              {COMPONENTS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    name="components[]"
                    value={c}
                    defaultChecked={course.components.includes(c)}
                    className="accent-primary size-4"
                  />
                  {c}
                </label>
              ))}
              <FieldErrors name="components[]" />
            </fieldset>
            <Field name="status" label="Status">
              <NativeSelect name="status" defaultValue={course.status}>
                <NativeSelectOption value="draft">Draft</NativeSelectOption>
                <NativeSelectOption value="active">Active</NativeSelectOption>
                <NativeSelectOption value="archived">Archived</NativeSelectOption>
              </NativeSelect>
            </Field>
          </ActionForm>
        </section>

        <section className="bg-card max-w-2xl rounded-lg border p-5 sm:p-6">
          <h2 className="mb-4 font-semibold">Objectives</h2>
          <ActionForm action={saveObjectives} submitLabel="Save objectives" successMessage="Objectives saved.">
            <input type="hidden" name="courseId" value={course.id} />
            <Field name="objectives" label="Objectives" hint="One per line, at most 20.">
              <Textarea name="objectives" rows={5} defaultValue={course.objectives.join('\n')} />
            </Field>
          </ActionForm>
        </section>

        {course.category === 'ugc' ? (
          <Outcomes course={course} />
        ) : (
          <p className="text-muted-foreground text-sm">Skill courses have no course outcomes or CO–PO–PSO matrix.</p>
        )}
      </div>
    </>
  );
}

function BloomSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Field name="bloomLevel" label="Bloom level">
      <NativeSelect name="bloomLevel" required defaultValue={defaultValue ?? ''}>
        <NativeSelectOption value="" disabled>
          Choose a level
        </NativeSelectOption>
        {BLOOM_LEVELS.map((level) => (
          <NativeSelectOption key={level} value={level}>
            {capitalize(level)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function Outcomes({ course }: { course: CourseDetail }) {
  return (
    <>
      <section className="bg-card rounded-lg border p-5 sm:p-6">
        <h2 className="font-semibold">Course outcomes</h2>
        <p className="text-muted-foreground mt-1 mb-4 max-w-prose text-sm">
          At most 15. Codes are assigned in order and never reused, so deleting CO2 leaves CO1 and CO3 as they are.
        </p>
        <ul className="grid gap-4">
          {course.cos.map((co) => (
            <li key={co.id} className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto]">
              <ActionForm action={updateCo} submitLabel={`Save ${co.code}`} successMessage={`${co.code} saved.`}>
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="coId" value={co.id} />
                <Field name="statement" label={`${co.code} statement`}>
                  <Textarea name="statement" required maxLength={500} rows={2} defaultValue={co.statement} />
                </Field>
                <BloomSelect defaultValue={co.bloomLevel} />
              </ActionForm>
              <ActionForm action={deleteCo} submitLabel={`Delete ${co.code}`} submitVariant="destructive">
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="coId" value={co.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 mb-3 text-sm font-semibold">Add a course outcome</h3>
        <ActionForm action={addCo} submitLabel="Add CO">
          <input type="hidden" name="courseId" value={course.id} />
          <Field name="statement" label="Statement">
            <Textarea name="statement" required maxLength={500} rows={2} />
          </Field>
          <BloomSelect />
        </ActionForm>
      </section>

      {course.cos.length > 0 && (
        <section className="bg-card rounded-lg border p-5 sm:p-6">
          <h2 className="font-semibold">CO–PO–PSO matrix</h2>
          <p className="text-muted-foreground mt-1 mb-4 max-w-prose text-sm">
            Correlation from 1 (slight) to 3 (high); “–” means no link.
          </p>
          <ActionForm action={saveCoMap} submitLabel="Save matrix" successMessage="Matrix saved.">
            <input type="hidden" name="courseId" value={course.id} />
            <CoPoMatrix cos={course.cos} outcomes={course.outcomes} cells={course.cells} mode="edit" />
            <FieldErrors name="cell[]" />
          </ActionForm>
        </section>
      )}
    </>
  );
}
