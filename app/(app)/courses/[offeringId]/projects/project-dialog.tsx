import { saveProject } from './actions';
import { Field, FieldErrors } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ProjectsView } from '@/lib/data/projects';
import { istDayKey } from '@/lib/domain/time';
import type { RichTextDoc } from '@/lib/schemas/common';

export type ProjectDraft = {
  id: string;
  title: string;
  description: RichTextDoc | null;
  memberIds: string[];
  guideId: string;
  startsOn: Date;
  dueOn: Date;
};

// M07 T3: a team's project — its title, what it is about, its members (a student is in one project only), its guide and
// its dates. Opened from the URL (`?new=project`, or `?new=edit` on the project's page).
export function ProjectDialog({
  offeringId,
  openParam,
  view,
  project,
}: {
  offeringId: string;
  openParam: string;
  view: Pick<ProjectsView, 'students' | 'faculty'>;
  project?: ProjectDraft;
}) {
  const free = view.students.filter((s) => !s.projectId || s.projectId === project?.id);
  return (
    <FormDialog
      openParam={openParam}
      size="wide"
      icon={<PageIcon name="projects" className="size-8" />}
      title={project ? 'Edit the project' : 'New project'}
      description="A team of this class. A student is in one project at a time."
      action={saveProject}
      submitLabel={project ? 'Save the project' : 'Create the project'}
      successMessage={project ? 'Project saved.' : 'Project created.'}
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      {project && <input type="hidden" name="projectId" value={project.id} />}
      <Field name="title" label="Title">
        <Input
          name="title"
          required
          minLength={3}
          maxLength={160}
          defaultValue={project?.title}
          placeholder="Smart attendance app"
        />
      </Field>
      <Field name="description" label="What it is about" hint="Optional.">
        <RichTextEditor name="description" initial={project?.description ?? null} />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Team</legend>
        {free.length === 0 ? (
          <p className="text-muted-foreground text-[0.8125rem]">Every student of the class is already in a team.</p>
        ) : (
          <div className="ring-border grid max-h-56 gap-1 overflow-y-auto rounded-md p-2 ring-1 sm:grid-cols-2">
            {free.map((s) => (
              <label
                key={s.id}
                className="hover:bg-muted/50 flex items-center gap-2.5 rounded px-1.5 py-1 text-[0.8125rem]"
              >
                <input
                  type="checkbox"
                  name="member[]"
                  value={s.id}
                  defaultChecked={project?.memberIds.includes(s.id)}
                  className="accent-foreground size-4"
                />
                <span className="min-w-0 truncate">
                  {s.name} <span className="text-muted-foreground text-xs tabular-nums">{s.rollNo}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <FieldErrors name="member[]" />
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field name="guideId" label="Guide">
          <NativeSelect name="guideId" required defaultValue={project?.guideId ?? view.faculty[0]?.id}>
            {view.faculty.map((f) => (
              <NativeSelectOption key={f.id} value={f.id}>
                {f.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="startsOn" label="Starts on">
          <Input
            name="startsOn"
            type="date"
            required
            defaultValue={project ? istDayKey(project.startsOn) : undefined}
          />
        </Field>
        <Field name="dueOn" label="Due on">
          <Input name="dueOn" type="date" required defaultValue={project ? istDayKey(project.dueOn) : undefined} />
        </Field>
      </div>
    </FormDialog>
  );
}
