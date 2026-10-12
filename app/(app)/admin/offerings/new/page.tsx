import { Suspense } from 'react';
import type { Metadata } from 'next';
import { z } from 'zod';
import Loading from '../../../loading';
import { createOffering } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { listProgramsForSelect } from '@/lib/data/courses';
import { listBatchesForSelect, listCoursesForSelect, listTermsForSelect } from '@/lib/data/offerings';
import { objectId } from '@/lib/schemas/common';
import { PROJECT_MODES } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'New offering' };

const Search = z.object({ program: objectId.optional().catch(undefined) });

export default function NewOfferingPage({ searchParams }: PageProps<'/admin/offerings/new'>) {
  return (
    <Suspense fallback={<Loading />}>
      <NewOffering searchParams={searchParams} />
    </Suspense>
  );
}

async function NewOffering({ searchParams }: { searchParams: PageProps<'/admin/offerings/new'>['searchParams'] }) {
  const { program } = Search.parse(await searchParams);
  const programs = await listProgramsForSelect();
  return (
    <>
      <PageHeader
        title="New offering"
        description="Creating an offering enrolls every student of the batch (and section, if you give one)."
      />
      <div className="grid max-w-2xl gap-6">
        <form method="get" className="bg-card flex flex-wrap items-end gap-2 rounded-lg border p-5 sm:p-6">
          <label className="grid gap-1.5 text-sm font-medium">
            Programme
            <NativeSelect name="program" defaultValue={program ?? ''}>
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
          <Button type="submit" variant="secondary">
            Continue
          </Button>
        </form>
        {program && <OfferingForm programId={program} />}
      </div>
    </>
  );
}

async function OfferingForm({ programId }: { programId: string }) {
  const [courses, batches, terms] = await Promise.all([
    listCoursesForSelect(programId),
    listBatchesForSelect(programId),
    listTermsForSelect(),
  ]);
  return (
    <section className="bg-card rounded-lg border p-5 sm:p-6">
      <ActionForm action={createOffering} submitLabel="Create offering and enroll students">
        <Field name="courseId" label="Course">
          <NativeSelect name="courseId" required defaultValue="">
            <NativeSelectOption value="" disabled>
              Choose a course
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
              Choose a batch
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
      </ActionForm>
    </section>
  );
}
