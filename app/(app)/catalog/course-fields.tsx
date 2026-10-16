import { Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { Credits } from '@/lib/domain/catalog';
import { COURSE_TYPE_LABEL } from '@/lib/format';
import { COURSE_TYPES } from '@/lib/schemas/structure';

// The fields of New course (/catalog) and Edit details (/catalog/[id]): code, title, type, T-P-Pj, status.
export function CourseFields({
  course,
  codeLocked = false,
}: {
  course?: { code: string; title: string; type: string | null; credits: Credits; status: string };
  codeLocked?: boolean;
}) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
        <Field
          name="code"
          label="Code"
          hint={codeLocked ? 'Fixed: the course has been offered.' : 'As in the Course Repository, such as CUTM1535.'}
        >
          <Input name="code" required maxLength={20} defaultValue={course?.code} readOnly={codeLocked} />
        </Field>
        <Field name="title" label="Title">
          <Input name="title" required maxLength={160} defaultValue={course?.title} />
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Credits (T-P-Pj)</legend>
        <p className="text-muted-foreground -mt-1 mb-1 text-xs">
          Theory, practice and project credits, in steps of 0.5. A course with no credits at all (0-0-0) is a non-credit
          course: videos and quizzes, without outcomes or marks.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(['theory', 'practice', 'project'] as const).map((part) => (
            <Field key={part} name={part} label={part.charAt(0).toUpperCase() + part.slice(1)}>
              <Input
                name={part}
                type="number"
                inputMode="decimal"
                required
                min={0}
                max={20}
                step={0.5}
                defaultValue={course?.credits[part] ?? 0}
                className="tabular-nums"
              />
            </Field>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="type" label="Type" hint="A label, as on courseware.">
          <NativeSelect name="type" defaultValue={course?.type ?? ''}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {COURSE_TYPES.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {COURSE_TYPE_LABEL[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="status" label="Status">
          <NativeSelect name="status" defaultValue={course?.status ?? 'active'}>
            <NativeSelectOption value="active">Active</NativeSelectOption>
            <NativeSelectOption value="draft">Draft</NativeSelectOption>
            <NativeSelectOption value="archived">Archived</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
    </>
  );
}
