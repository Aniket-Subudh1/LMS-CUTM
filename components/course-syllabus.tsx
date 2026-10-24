import Link from 'next/link';
import { ArrowSquareOutIcon, PencilSimpleIcon, PlusIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react/ssr';
import {
  clearSyllabusFile,
  deleteCourseModule,
  reorderCourseModules,
  saveBooks,
  saveCourseModule,
  saveObjectives,
  saveProjects,
  setSyllabusFile,
} from '@/app/(app)/catalog/actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { EmptyState } from '@/components/data-table';
import { FileUpload } from '@/components/file-upload';
import { FormDialog } from '@/components/form-dialog';
import { ListEditor } from '@/components/list-editor';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { RowMenu } from '@/components/row-menu';
import { Section } from '@/components/section';
import { SortableList } from '@/components/sortable-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import type { EditableCourse } from '@/lib/data/courses';
import { keptBy } from '@/lib/format';
import { CATALOG_LIMITS } from '@/lib/schemas/structure';

type Unit = EditableCourse['modules'][number];

// The workspace's Syllabus tab and the catalogue course page (M03b, round 3): the modules in teaching order, which
// the coordinator and admins add, edit, delete and drag; then objectives, books, projects and the official PDF as
// small cards. Everyone else reads. Edit dialogs open from the URL on `base`, the page's own path.
export function CourseSyllabus({
  course,
  base,
  open,
}: {
  course: EditableCourse;
  base: string;
  open: string | undefined;
}) {
  const { canEdit, modules } = course;
  const here = (dialog: string) => `${base}?new=${dialog}`;
  const room = canEdit && modules.length < CATALOG_LIMITS.modules;
  const editing = canEdit ? modules.find((m) => open === `module-${m.id}`) : undefined;
  const row = (unit: Unit, index: number) => (
    <ModuleRow key={unit.id} course={course} unit={unit} index={index} edit={here(`module-${unit.id}`)} />
  );
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Section
        icon={<PageIcon name="lessons" className="size-8" />}
        title="Modules"
        description={
          canEdit
            ? 'The syllabus in teaching order, with hours and practicals. Drag a module, or use its menu, to reorder.'
            : `The syllabus in teaching order. ${keptBy(course.coordinator)}`
        }
        action={
          room &&
          modules.length > 0 && (
            <Button asChild size="sm">
              <Link href={here('module')} scroll={false}>
                <PlusIcon /> Add module
              </Link>
            </Button>
          )
        }
      >
        {modules.length === 0 ? (
          <EmptyState
            icon={<PageIcon name="lessons" className="size-8" />}
            text={canEdit ? 'Add the first module of the syllabus.' : 'The syllabus has no modules yet.'}
          />
        ) : canEdit ? (
          <SortableList
            items={modules.map((unit, i) => ({ id: unit.id, label: unit.title, node: row(unit, i) }))}
            action={reorderCourseModules}
            fields={{ courseId: course.id }}
            noun="module"
            className="gap-1"
          />
        ) : (
          <ol className="grid gap-1">{modules.map((unit, i) => row(unit, i))}</ol>
        )}
        {room && (
          <Link
            href={here('module')}
            scroll={false}
            className="text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-[0.8125rem] transition-colors"
          >
            <PlusIcon className="size-4" /> Add a module
          </Link>
        )}
      </Section>

      <div className="grid gap-5">
        <ListCard
          icon="plan"
          title="Objectives"
          description="What the course sets out to do."
          items={course.objectives}
          ordered
          empty="No objectives yet."
          edit={canEdit ? here('objectives') : null}
        />
        {course.mode === 'credit' && (
          <ListCard
            icon="books"
            title="Books"
            description="Textbooks students need, and further reading."
            items={[
              ...course.textbooks.map((b) => ({ label: 'Textbook', text: b })),
              ...course.references.map((b) => ({ label: 'Reference', text: b })),
            ]}
            empty="No books yet."
            edit={canEdit ? here('books') : null}
          />
        )}
        <ListCard
          icon="baskets"
          title="Projects"
          description="Projects students choose from."
          items={course.projects}
          empty="No projects yet."
          edit={canEdit ? here('projects') : null}
        />
        <SyllabusPdf course={course} replace={here('syllabus-pdf')} />
      </div>

      {room && open === 'module' && <ModuleDialog key={open} course={course} />}
      {editing && <ModuleDialog key={open} course={course} unit={editing} />}
      {canEdit && open === 'objectives' && (
        <TextDialog
          key={open}
          course={course}
          param="objectives"
          icon="plan"
          title="Objectives"
          action={saveObjectives}
          fields={[
            {
              name: 'objectives',
              label: 'Objectives',
              hint: `At most ${CATALOG_LIMITS.objectives}.`,
              noun: 'objective',
              max: CATALOG_LIMITS.objectives,
              maxLength: CATALOG_LIMITS.objective,
              lines: course.objectives,
            },
          ]}
        />
      )}
      {canEdit && open === 'books' && (
        <TextDialog
          key={open}
          course={course}
          param="books"
          icon="books"
          title="Books"
          action={saveBooks}
          fields={[
            {
              name: 'textbooks',
              label: 'Textbooks',
              noun: 'textbook',
              max: CATALOG_LIMITS.textbooks,
              maxLength: CATALOG_LIMITS.book,
              lines: course.textbooks,
            },
            {
              name: 'references',
              label: 'References',
              noun: 'reference',
              max: CATALOG_LIMITS.references,
              maxLength: CATALOG_LIMITS.book,
              lines: course.references,
            },
          ]}
        />
      )}
      {canEdit && open === 'projects' && (
        <TextDialog
          key={open}
          course={course}
          param="projects"
          icon="baskets"
          title="Projects"
          action={saveProjects}
          fields={[
            {
              name: 'projects',
              label: 'Projects',
              hint: `At most ${CATALOG_LIMITS.projects}.`,
              noun: 'project',
              max: CATALOG_LIMITS.projects,
              maxLength: CATALOG_LIMITS.project,
              lines: course.projects,
            },
          ]}
        />
      )}
      {canEdit && open === 'syllabus-pdf' && <PdfDialog key={open} course={course} />}
    </div>
  );
}

function ModuleRow({ course, unit, index, edit }: { course: EditableCourse; unit: Unit; index: number; edit: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md px-2 py-2.5">
      <span className="text-muted-foreground grid size-6 shrink-0 place-items-center text-xs font-semibold tabular-nums">
        {index + 1}
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-[0.8125rem] font-semibold">{unit.title}</span>
          {unit.hours && <span className="text-muted-foreground text-xs tabular-nums">{unit.hours} h</span>}
        </p>
        {unit.topics && (
          <p className="text-muted-foreground line-clamp-3 text-[0.8125rem] leading-relaxed whitespace-pre-line">
            {unit.topics}
          </p>
        )}
        {unit.practicals.length > 0 && (
          <details className="group text-[0.8125rem]">
            <summary className="text-primary w-fit cursor-pointer list-none font-medium hover:underline">
              {unit.practicals.length} practical{unit.practicals.length === 1 ? '' : 's'}
            </summary>
            <ol className="text-muted-foreground mt-1.5 grid list-decimal gap-1 pl-5">
              {unit.practicals.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </details>
        )}
      </div>
      {course.canEdit && (
        <RowMenu
          label={unit.title}
          move={{
            id: unit.id,
            ids: course.modules.map((m) => m.id),
            action: reorderCourseModules,
            fields: { courseId: course.id },
          }}
          items={[
            { kind: 'link', label: 'Edit', href: edit, icon: <PencilSimpleIcon /> },
            { kind: 'moves' },
            { kind: 'separator' },
            {
              kind: 'action',
              label: 'Delete',
              icon: <TrashIcon />,
              destructive: true,
              action: deleteCourseModule,
              fields: { courseId: course.id, moduleId: unit.id },
              confirm: {
                title: `Delete “${unit.title}”?`,
                message: 'Its topics, hours and practicals go with it.',
                confirmLabel: 'Delete',
                destructive: true,
              },
            },
          ]}
        />
      )}
    </div>
  );
}

// A small card of lines (objectives, books, projects) with an Edit link for the course's editors.
function ListCard({
  icon,
  title,
  description,
  items,
  ordered = false,
  empty,
  edit,
}: {
  icon: PageIconName;
  title: string;
  description: string;
  items: (string | { label: string; text: string })[];
  ordered?: boolean;
  empty: string;
  edit: string | null;
}) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <Section
      icon={<PageIcon name={icon} className="size-8" />}
      title={title}
      description={description}
      action={
        edit && (
          <Button asChild variant="outline" size="sm">
            <Link href={edit} scroll={false}>
              <PencilSimpleIcon /> Edit
            </Link>
          </Button>
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground text-[0.8125rem]">{empty}</p>
      ) : (
        <List
          className={cn('grid gap-1.5 pl-5 text-[0.8125rem] leading-relaxed', ordered ? 'list-decimal' : 'list-disc')}
        >
          {items.map((item, i) => (
            <li key={i}>
              {typeof item === 'string' ? (
                item
              ) : (
                <>
                  <span className="font-semibold">{item.label}</span> · {item.text}
                </>
              )}
            </li>
          ))}
        </List>
      )}
    </Section>
  );
}

function SyllabusPdf({ course, replace }: { course: EditableCourse; replace: string }) {
  const key = course.syllabusFileKey;
  return (
    <Section
      icon={<PageIcon name="course" className="size-8" />}
      title="Official syllabus"
      description={key ? 'The university’s syllabus document, as a PDF.' : 'No PDF has been uploaded.'}
      action={
        course.canEdit && (
          <Button asChild variant="outline" size="sm">
            <Link href={replace} scroll={false}>
              <UploadSimpleIcon /> {key ? 'Replace' : 'Upload PDF'}
            </Link>
          </Button>
        )
      }
    >
      {key && (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/files/${key}`} target="_blank" rel="noreferrer">
              <ArrowSquareOutIcon /> Open the PDF
            </a>
          </Button>
          {course.canEdit && (
            <ActionForm
              action={clearSyllabusFile}
              submitLabel="Remove"
              submitVariant="outline"
              submitSize="sm"
              submitIcon={<TrashIcon />}
              confirm={{ title: 'Remove the syllabus PDF?', message: 'The file is deleted. You can upload it again.' }}
            >
              <input type="hidden" name="courseId" value={course.id} />
            </ActionForm>
          )}
        </div>
      )}
    </Section>
  );
}

function ModuleDialog({ course, unit }: { course: EditableCourse; unit?: Unit }) {
  return (
    <FormDialog
      openParam={unit ? `module-${unit.id}` : 'module'}
      size="wide"
      icon={<PageIcon name="lessons" className="size-7" />}
      title={unit ? 'Edit module' : 'Add a module'}
      description={unit ? 'Changes show to everyone at once.' : 'It goes at the end; drag it into place afterwards.'}
      action={saveCourseModule}
      submitLabel={unit ? 'Save module' : 'Add module'}
      successMessage={unit ? 'Module saved.' : 'Module added.'}
    >
      <input type="hidden" name="courseId" value={course.id} />
      {unit && <input type="hidden" name="moduleId" value={unit.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field name="title" label="Title">
          <Input name="title" maxLength={CATALOG_LIMITS.moduleTitle} defaultValue={unit?.title} required />
        </Field>
        <Field name="hours" label="Hours" hint="6 or 4+0+2">
          <Input name="hours" maxLength={CATALOG_LIMITS.moduleHours} defaultValue={unit?.hours ?? ''} />
        </Field>
      </div>
      <Field name="topics" label="Topics">
        <Textarea name="topics" rows={4} maxLength={CATALOG_LIMITS.moduleTopics} defaultValue={unit?.topics} />
      </Field>
      <ListEditor
        name="practicals"
        label="Practicals"
        noun="practical"
        initial={(unit?.practicals ?? []).map((text) => ({ text }))}
        max={CATALOG_LIMITS.practicals}
        maxLength={CATALOG_LIMITS.practical}
      />
    </FormDialog>
  );
}

function TextDialog({
  course,
  param,
  icon,
  title,
  action,
  fields,
}: {
  course: EditableCourse;
  param: string;
  icon: PageIconName;
  title: string;
  action: Parameters<typeof FormDialog>[0]['action'];
  // The fields round (mock-up F5): each list a row an item.
  fields: {
    name: string;
    label: string;
    hint?: string;
    noun: string;
    max: number;
    maxLength: number;
    lines: string[];
  }[];
}) {
  return (
    <FormDialog
      openParam={param}
      size="wide"
      icon={<PageIcon name={icon} className="size-7" />}
      title={title}
      action={action}
      submitLabel="Save"
      successMessage="Saved."
    >
      <input type="hidden" name="courseId" value={course.id} />
      {fields.map((field) => (
        <ListEditor
          key={field.name}
          name={field.name}
          label={field.label}
          hint={field.hint}
          noun={field.noun}
          initial={field.lines.map((text) => ({ text }))}
          max={field.max}
          maxLength={field.maxLength}
        />
      ))}
    </FormDialog>
  );
}

function PdfDialog({ course }: { course: EditableCourse }) {
  return (
    <FormDialog
      openParam="syllabus-pdf"
      icon={<PageIcon name="fileq" className="size-8" />}
      title={course.syllabusFileKey ? 'Replace the syllabus PDF' : 'Upload the syllabus PDF'}
      description="The university’s official syllabus. Everyone who can see the course can open it."
      action={setSyllabusFile}
      submitLabel="Save"
      successMessage="Syllabus PDF saved."
    >
      <input type="hidden" name="courseId" value={course.id} />
      <FileUpload name="syllabusFile" purpose="syllabus" contextId={course.id} required />
      <FieldErrors name="syllabusFile[]" />
    </FormDialog>
  );
}
