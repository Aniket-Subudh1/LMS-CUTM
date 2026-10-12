import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../loading';
import { saveCourse } from '../actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listProgramsForSelect } from '@/lib/data/courses';
import { COMPONENTS } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'New course' };

export default function NewCoursePage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewCourse />
    </Suspense>
  );
}

async function NewCourse() {
  const programs = await listProgramsForSelect();
  return (
    <>
      <PageHeader title="New course" description="Department and category come from the programme you choose." />
      <section className="bg-card max-w-2xl rounded-lg border p-5 sm:p-6">
        <ActionForm action={saveCourse} submitLabel="Create course">
          <input type="hidden" name="status" value="draft" />
          <Field name="programId" label="Programme">
            <NativeSelect name="programId" required defaultValue="">
              <NativeSelectOption value="" disabled>
                Choose a programme
              </NativeSelectOption>
              {programs.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field name="code" label="Code" hint="Unique within the programme, for example CS101.">
            <Input name="code" required maxLength={20} />
          </Field>
          <Field name="title" label="Title">
            <Input name="title" required maxLength={160} />
          </Field>
          <Field name="credits" label="Credits" hint="In steps of 0.5.">
            <Input name="credits" type="number" required min={0} max={30} step={0.5} />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Components</legend>
            {COMPONENTS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm capitalize">
                <input type="checkbox" name="components[]" value={c} className="accent-primary size-4" />
                {c}
              </label>
            ))}
            <FieldErrors name="components[]" />
          </fieldset>
        </ActionForm>
      </section>
    </>
  );
}
