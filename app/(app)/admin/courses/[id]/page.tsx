import { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  BookOpenTextIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  GridFourIcon,
  ListChecksIcon,
  PencilSimpleIcon,
  PlusIcon,
  TargetIcon,
} from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { addCo, deleteCo, saveCoMap, saveCourse, saveObjectives, saveSyllabus, updateCo } from '../actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { CoPoMatrix } from '@/components/co-po-matrix';
import { FileUpload } from '@/components/file-upload';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RichTextView } from '@/components/rich-text-view';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { getCourse, type CourseDetail } from '@/lib/data/courses';
import { statusTone } from '@/lib/format';
import { BLOOM_LEVELS, COMPONENTS } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Course' };

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const MAX_COS = 15;

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
        icon={<BookOpenTextIcon weight="duotone" />}
        title={`${course.code} · ${course.title}`}
        description={`${course.programCode} · ${course.category === 'ugc' ? 'UGC' : 'Skill'} course`}
        actions={<DetailsDialog course={course} />}
      />
      <div className="grid gap-8">
        <dl className="surface grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-4">
          <Fact label="Programme">{course.programCode}</Fact>
          <Fact label="Credits">{course.credits}</Fact>
          <Fact label="Components">
            <span className="capitalize">{course.components.join(', ')}</span>
          </Fact>
          <Fact label="Status">
            <Badge variant={statusTone(course.status)}>{course.status}</Badge>
          </Fact>
        </dl>

        <Section
          icon={<ListChecksIcon weight="duotone" />}
          title="Objectives"
          description="What the course sets out to do. Students see these on the course overview."
          action={
            <FormDialog
              trigger={
                <Button variant="outline" size="sm">
                  <PencilSimpleIcon weight="duotone" /> Edit objectives
                </Button>
              }
              size="wide"
              icon={<ListChecksIcon weight="duotone" />}
              title="Edit objectives"
              description="One objective per line, at most 20."
              action={saveObjectives}
              submitLabel="Save objectives"
              successMessage="Objectives saved."
            >
              <input type="hidden" name="courseId" value={course.id} />
              <Field name="objectives" label="Objectives">
                <Textarea name="objectives" rows={8} defaultValue={course.objectives.join('\n')} />
              </Field>
            </FormDialog>
          }
        >
          {course.objectives.length === 0 ? (
            <p className="surface text-muted-foreground p-5 text-sm">
              No objectives yet. Add them with Edit objectives.
            </p>
          ) : (
            <ol className="surface grid gap-3 p-5">
              {course.objectives.map((o, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{o}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section
          icon={<FileTextIcon weight="duotone" />}
          title="Syllabus"
          description="Students see it on every offering's overview, and it is part of the course plan email."
          action={
            <FormDialog
              trigger={
                <Button variant="outline" size="sm">
                  <PencilSimpleIcon weight="duotone" /> Edit syllabus
                </Button>
              }
              size="wide"
              icon={<FileTextIcon weight="duotone" />}
              title="Edit syllabus"
              description="Write the units and topics, and attach the official PDF if there is one."
              action={saveSyllabus}
              submitLabel="Save syllabus"
              successMessage="Syllabus saved."
            >
              <input type="hidden" name="courseId" value={course.id} />
              <div className="grid gap-2">
                <span className="text-sm font-medium">Units and topics</span>
                <RichTextEditor
                  name="syllabusText"
                  initial={course.syllabusText}
                  placeholder="Unit 1 · Introduction: …"
                />
                <FieldErrors name="syllabusText" />
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-medium">PDF (optional)</span>
                {course.syllabusFileKey && (
                  <label className="text-muted-foreground flex items-center gap-2 text-sm">
                    <input type="checkbox" name="removeFile" value="true" className="accent-primary size-4" />
                    Remove the current PDF
                  </label>
                )}
                <FileUpload name="syllabusFile" purpose="syllabus" contextId={course.id} />
                <p className="text-muted-foreground text-xs">
                  {course.syllabusFileKey
                    ? 'Uploading a new PDF replaces the current one.'
                    : 'Students can download it from the course overview.'}
                </p>
                <FieldErrors name="syllabusFile[]" />
              </div>
            </FormDialog>
          }
        >
          {course.syllabusText || course.syllabusFileKey ? (
            <div className="surface grid gap-4 p-5">
              {course.syllabusText && <RichTextView doc={course.syllabusText} />}
              {course.syllabusFileKey && (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <a href={`/api/files/${course.syllabusFileKey}`} target="_blank" rel="noreferrer">
                    <DownloadSimpleIcon weight="duotone" /> Download the PDF
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <p className="surface text-muted-foreground p-5 text-sm">No syllabus yet. Add it with Edit syllabus.</p>
          )}
        </Section>

        {course.category === 'ugc' ? (
          <Outcomes course={course} />
        ) : (
          <p className="surface text-muted-foreground p-5 text-sm">
            Skill courses have no course outcomes or CO–PO–PSO matrix.
          </p>
        )}
      </div>
    </>
  );
}

function DetailsDialog({ course }: { course: CourseDetail }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <PencilSimpleIcon weight="duotone" /> Edit details
        </Button>
      }
      icon={<BookOpenTextIcon weight="duotone" />}
      title={`Edit ${course.code}`}
      description="The programme is fixed. Changing the components changes which evaluation scheme new offerings use."
      action={saveCourse}
      submitLabel="Save changes"
      successMessage="Course updated."
    >
      <input type="hidden" name="id" value={course.id} />
      <input type="hidden" name="programId" value={course.programId} />
      <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
        <Field name="code" label="Code">
          <Input name="code" required maxLength={20} defaultValue={course.code} />
        </Field>
        <Field name="title" label="Title">
          <Input name="title" required maxLength={160} defaultValue={course.title} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="credits" label="Credits" hint="In steps of 0.5.">
          <Input name="credits" type="number" required min={0} max={30} step={0.5} defaultValue={course.credits} />
        </Field>
        <Field name="status" label="Status">
          <NativeSelect name="status" defaultValue={course.status}>
            <NativeSelectOption value="draft">Draft</NativeSelectOption>
            <NativeSelectOption value="active">Active</NativeSelectOption>
            <NativeSelectOption value="archived">Archived</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Components</legend>
        <div className="flex flex-wrap gap-2">
          {COMPONENTS.map((c) => (
            <label
              key={c}
              className="ring-border has-checked:bg-primary/10 has-checked:ring-primary/40 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm capitalize ring-1 transition-colors"
            >
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
        </div>
        <FieldErrors name="components[]" />
      </fieldset>
    </FormDialog>
  );
}

function CoFields({ statement, bloomLevel }: { statement?: string; bloomLevel?: string }) {
  return (
    <>
      <Field name="statement" label="Statement" hint="Start with a verb: “Explain…”, “Design…”, “Analyse…”.">
        <Textarea name="statement" required maxLength={500} rows={3} defaultValue={statement} />
      </Field>
      <Field name="bloomLevel" label="Bloom level">
        <NativeSelect name="bloomLevel" required defaultValue={bloomLevel ?? ''}>
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
    </>
  );
}

function Outcomes({ course }: { course: CourseDetail }) {
  return (
    <>
      <Section
        icon={<TargetIcon weight="duotone" />}
        title="Course outcomes"
        description="At most 15. Codes are assigned in order and never reused, so deleting CO2 leaves CO1 and CO3 as they are."
        action={
          course.cos.length < MAX_COS && (
            <FormDialog
              trigger={
                <Button variant="outline" size="sm">
                  <PlusIcon weight="bold" /> Add CO
                </Button>
              }
              icon={<TargetIcon weight="duotone" />}
              title="Add a course outcome"
              description="It gets the next free code and appears as a new row in the CO–PO–PSO matrix."
              action={addCo}
              submitLabel="Add CO"
              successMessage="Course outcome added."
            >
              <input type="hidden" name="courseId" value={course.id} />
              <CoFields />
            </FormDialog>
          )
        }
      >
        {course.cos.length === 0 ? (
          <p className="surface text-muted-foreground p-5 text-sm">
            No course outcomes yet. Add the first with Add CO.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {course.cos.map((co) => (
              <li key={co.id} className="surface flex items-start gap-4 p-4">
                <span className="bg-primary/10 text-primary grid h-8 min-w-12 shrink-0 place-items-center rounded-lg px-2 text-xs font-bold">
                  {co.code}
                </span>
                <div className="grid min-w-0 flex-1 gap-2">
                  <p className="text-sm leading-relaxed">{co.statement}</p>
                  <Badge variant="secondary">{capitalize(co.bloomLevel)}</Badge>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <FormDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${co.code}`}>
                        <PencilSimpleIcon weight="duotone" />
                      </Button>
                    }
                    icon={<TargetIcon weight="duotone" />}
                    title={`Edit ${co.code}`}
                    description="The change is recorded in the audit log."
                    action={updateCo}
                    submitLabel={`Save ${co.code}`}
                    successMessage={`${co.code} saved.`}
                  >
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="coId" value={co.id} />
                    <CoFields statement={co.statement} bloomLevel={co.bloomLevel} />
                  </FormDialog>
                  <ActionForm
                    action={deleteCo}
                    submitLabel="Delete"
                    submitVariant="destructive"
                    submitSize="sm"
                    confirm={{
                      title: `Delete ${co.code}?`,
                      message: 'Its links in the CO–PO–PSO matrix are removed too. This cannot be undone.',
                    }}
                  >
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="coId" value={co.id} />
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {course.cos.length > 0 && (
        <Section
          icon={<GridFourIcon weight="duotone" />}
          title="CO–PO–PSO matrix"
          description="Correlation from 1 (slight) to 3 (high); “–” means no link."
          action={
            <FormDialog
              trigger={
                <Button variant="outline" size="sm">
                  <PencilSimpleIcon weight="duotone" /> Edit matrix
                </Button>
              }
              size="full"
              icon={<GridFourIcon weight="duotone" />}
              title="Edit the CO–PO–PSO matrix"
              description="Choose 1 (slight), 2 (moderate) or 3 (high) where a course outcome supports a programme outcome."
              action={saveCoMap}
              submitLabel="Save matrix"
              successMessage="Matrix saved."
            >
              <input type="hidden" name="courseId" value={course.id} />
              <div className="overflow-x-auto">
                <CoPoMatrix cos={course.cos} outcomes={course.outcomes} cells={course.cells} mode="edit" />
              </div>
              <FieldErrors name="cell[]" />
            </FormDialog>
          }
        >
          <div className="surface overflow-x-auto p-1">
            <CoPoMatrix cos={course.cos} outcomes={course.outcomes} cells={course.cells} mode="levels" />
          </div>
        </Section>
      )}
    </>
  );
}
