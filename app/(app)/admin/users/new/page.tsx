import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../../../loading';
import { createUser } from '../actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getUserFormOptions } from '@/lib/data/users';
import { ROLE_LABEL } from '@/lib/format';
import { ROLES } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'New user' };

export default function NewUserPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewUser />
    </Suspense>
  );
}

async function NewUser() {
  const { departments, batches } = await getUserFormOptions();
  return (
    <>
      <PageHeader
        title="New user"
        description="The person receives an email to set their password. Fill in the student fields for a student and the staff fields for faculty or head of department."
      />
      <section className="bg-card max-w-2xl rounded-lg border p-5 sm:p-6">
        <ActionForm action={createUser} submitLabel="Create and invite">
          <Field name="name" label="Name">
            <Input name="name" required maxLength={120} />
          </Field>
          <Field name="email" label="Email address">
            <Input name="email" type="email" required maxLength={254} />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Roles</legend>
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roles[]" value={r} className="accent-primary size-4" />
                {ROLE_LABEL[r]}
              </label>
            ))}
            <FieldErrors name="roles[]" />
          </fieldset>
          <Field name="rollNo" label="Roll number" hint="Students only.">
            <Input name="rollNo" maxLength={30} />
          </Field>
          <Field name="batchId" label="Batch" hint="Students only. The programme follows from the batch.">
            <NativeSelect name="batchId" defaultValue="">
              <NativeSelectOption value="">None</NativeSelectOption>
              {batches.map((b) => (
                <NativeSelectOption key={b.id} value={b.id}>
                  {b.label}
                  {b.sections.length > 0 ? ` (sections ${b.sections.join(', ')})` : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field name="section" label="Section" hint="Students only. Must be one of the batch’s sections.">
            <Input name="section" maxLength={10} />
          </Field>
          <Field name="employeeId" label="Employee id" hint="Faculty and head of department.">
            <Input name="employeeId" maxLength={30} />
          </Field>
          <Field name="departmentId" label="Department" hint="Faculty and head of department.">
            <NativeSelect name="departmentId" defaultValue="">
              <NativeSelectOption value="">None</NativeSelectOption>
              {departments.map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
