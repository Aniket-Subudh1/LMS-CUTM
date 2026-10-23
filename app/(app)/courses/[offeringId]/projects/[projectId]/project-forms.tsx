import { linkRepository, saveReview, saveTask } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ProjectView, TaskView } from '@/lib/data/projects';
import { istDayKey, istTimeOfDay } from '@/lib/domain/time';

// M07 T7: a task for one member, due at the end of a day; a new one starts in Backlog and its assignee is told.
export function TaskDialog({
  openParam,
  project,
  task,
}: {
  openParam: string;
  project: ProjectView['project'];
  task?: TaskView;
}) {
  return (
    <FormDialog
      openParam={openParam}
      icon={<PageIcon name="plan" className="size-8" />}
      title={task ? 'Edit the task' : 'New task'}
      description={task ? 'Changing the assignee tells the new one.' : 'It starts in Backlog. Its assignee is told.'}
      action={saveTask}
      submitLabel={task ? 'Save the task' : 'Add the task'}
      successMessage={task ? 'Task saved.' : 'Task added.'}
    >
      <input type="hidden" name="projectId" value={project.id} />
      {task && <input type="hidden" name="taskId" value={task.id} />}
      <Field name="title" label="Task">
        <Input
          name="title"
          required
          minLength={3}
          maxLength={160}
          defaultValue={task?.title}
          placeholder="Interview 10 residents"
        />
      </Field>
      <Field name="description" label="Details" hint="Optional.">
        <RichTextEditor name="description" initial={task?.description ?? null} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="assigneeId" label="Assignee">
          <NativeSelect name="assigneeId" required defaultValue={task?.assignee.id ?? project.members[0]?.id}>
            {project.members.map((m) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {m.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="dueOn" label="Due on">
          <Input name="dueOn" type="date" required defaultValue={task ? istDayKey(task.dueAt) : undefined} />
        </Field>
      </div>
    </FormDialog>
  );
}

// M07 T8: a review on a date and time; a new one may be held as a live class, which only the team is told about.
export function ReviewDialog({
  openParam,
  projectId,
  review,
}: {
  openParam: string;
  projectId: string;
  review?: ProjectView['reviews'][number];
}) {
  return (
    <FormDialog
      openParam={openParam}
      icon={<PageIcon name="evaluation" className="size-8" />}
      title={review ? 'Edit the review' : 'New review'}
      description="Marked on the Examination Policy’s project rubric. The project internal is the average of the reviews."
      action={saveReview}
      submitLabel={review ? 'Save the review' : 'Add the review'}
      successMessage={review ? 'Review saved.' : 'Review added.'}
    >
      <input type="hidden" name="projectId" value={projectId} />
      {review && <input type="hidden" name="reviewId" value={review.id} />}
      <Field name="title" label="Title">
        <Input
          name="title"
          required
          minLength={3}
          maxLength={120}
          defaultValue={review?.title}
          placeholder="Mid-semester review"
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field name="date" label="Date">
          <Input name="date" type="date" required defaultValue={review ? istDayKey(review.heldOn) : undefined} />
        </Field>
        <Field name="time" label="Time">
          <Input name="time" type="time" required defaultValue={review ? istTimeOfDay(review.heldOn) : '10:00'} />
        </Field>
        <Field name="lengthMin" label="Length (minutes)">
          <Input name="lengthMin" type="number" min={15} max={240} defaultValue={60} />
        </Field>
      </div>
      {review ? (
        review.sessionId && (
          <p className="text-muted-foreground text-xs">Its live class moves with it, if it has not started.</p>
        )
      ) : (
        <label className="flex items-start gap-2.5 text-[0.8125rem]">
          <input type="checkbox" name="live" value="true" className="accent-foreground mt-0.5 size-4" />
          Hold it as a live class. Only the team is told; it takes no attendance.
        </label>
      )}
    </FormDialog>
  );
}

// M07 T5: the team links its repository once the CUTM LMS GitHub App is installed on it.
export function LinkRepositoryForm({ projectId, installUrl }: { projectId: string; installUrl: string | null }) {
  return (
    <ActionForm
      action={linkRepository}
      submitLabel="Link the repository"
      successMessage="Linked. Its commits arrive within a minute."
    >
      <input type="hidden" name="projectId" value={projectId} />
      <Field
        name="repo"
        label="Repository"
        hint="As GitHub shows it, owner/name. Install the CUTM LMS GitHub App on it first."
      >
        <Input name="repo" required placeholder="cutm-cse/smart-attendance" className="max-w-sm font-mono" />
      </Field>
      {installUrl && (
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary text-[0.8125rem] font-medium hover:underline"
        >
          Install the App on a repository
        </a>
      )}
    </ActionForm>
  );
}
