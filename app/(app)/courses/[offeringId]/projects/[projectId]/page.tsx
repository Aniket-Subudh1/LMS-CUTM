import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowsClockwiseIcon, PencilSimpleIcon, PlusIcon, WarningIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../../loading';
import { deleteReview, deleteTask, moveTask, requestGithubSync } from '../actions';
import { ProjectDialog } from '../project-dialog';
import { LinkRepositoryForm, ReviewDialog, TaskDialog } from './project-forms';
import { ActionForm } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { getProject, listProjects, type GithubView, type ProjectView, type TaskView } from '@/lib/data/projects';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatPct } from '@/lib/format';
import type { TaskStatus } from '@/lib/schemas/projects';

export const metadata: Metadata = { title: 'Project' };

const Search = z.object({ new: z.string().max(40).optional().catch(undefined) });

export default function ProjectPage({ params, searchParams }: PageProps<'/courses/[offeringId]/projects/[projectId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Project params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// M07 T6–T8 (P2 A, P3 A): one project — its GitHub activity or its board — and its reviews.
async function Project({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/projects/[projectId]'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/projects/[projectId]'>['searchParams'];
}) {
  const { offeringId, projectId } = await params;
  const { new: open } = Search.parse(await searchParams);
  const view = await getProject(offeringId, projectId);
  const { project } = view;
  const here = `/courses/${offeringId}/projects/${projectId}`;
  const dialog = (name: string) => `${here}?new=${name}`;
  const editing = open === 'edit' && view.canTeach ? await listProjects(offeringId) : null;
  const task = open?.startsWith('task-') ? view.tracker?.tasks.find((t) => t.id === open.slice(5)) : undefined;
  const review = open?.startsWith('review-') ? view.reviews.find((r) => r.id === open.slice(7)) : undefined;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/courses/${offeringId}/projects`}>
          <ArrowLeftIcon /> Projects
        </Link>
      </Button>
      <section className="surface mb-4 grid gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h2 className="text-[1.0625rem] font-semibold tracking-tight">{project.title}</h2>
            <p className="text-muted-foreground text-[0.8125rem]">
              {project.members.map((m) => m.name).join(', ')} · guide {project.guide.name} ·{' '}
              {formatDate(project.startsOn)} – {formatDate(project.dueOn)}
            </p>
            {project.repo && (
              <p className="text-[0.8125rem]">
                <span className="font-mono">{project.repo.fullName}</span> · {project.repo.branch} ·{' '}
                <span className="text-muted-foreground">
                  {project.repo.lastSyncedAt ? `synced ${formatDateTime(project.repo.lastSyncedAt)}` : 'not synced yet'}
                </span>
              </p>
            )}
          </div>
          {view.canTeach && (
            <div className="flex flex-wrap gap-2">
              {project.repo && (
                <ActionForm
                  action={requestGithubSync}
                  submitLabel="Sync now"
                  submitVariant="outline"
                  submitSize="sm"
                  submitIcon={<ArrowsClockwiseIcon />}
                >
                  <input type="hidden" name="projectId" value={project.id} />
                </ActionForm>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href={dialog('edit')} scroll={false}>
                  <PencilSimpleIcon /> Edit
                </Link>
              </Button>
              {project.mode === 'tracker' && (
                <Button asChild size="sm">
                  <Link href={dialog('task')} scroll={false}>
                    <PlusIcon /> New task
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
        {project.repo?.syncError && (
          <p className="text-destructive flex gap-1.5 text-[0.8125rem]">
            <WarningIcon className="mt-0.5 size-4 shrink-0" /> The last sync failed: {project.repo.syncError}
          </p>
        )}
      </section>
      <div className="grid gap-4">
        {view.github && <Github view={view} github={view.github} />}
        {view.tracker && <Board view={view} tasks={view.tracker.tasks} here={here} />}
        {view.tracker && <Deadlines view={view} />}
        <Reviews view={view} here={here} offeringId={offeringId} dialog={dialog} />
      </div>
      {editing && (
        <ProjectDialog
          key="edit"
          offeringId={offeringId}
          openParam="edit"
          view={editing}
          project={{
            id: project.id,
            title: project.title,
            description: project.description,
            memberIds: project.members.map((m) => m.id),
            guideId: project.guide.id,
            startsOn: project.startsOn,
            dueOn: project.dueOn,
          }}
        />
      )}
      {view.canTeach && open === 'task' && <TaskDialog key="task" openParam="task" project={project} />}
      {view.canTeach && task && <TaskDialog key={open} openParam={open ?? ''} project={project} task={task} />}
      {view.canTeach && open === 'review' && <ReviewDialog key="review" openParam="review" projectId={project.id} />}
      {view.canTeach && review && (
        <ReviewDialog key={open} openParam={open ?? ''} projectId={project.id} review={review} />
      )}
    </>
  );
}

function Weekly({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const w = 300;
  const h = 56;
  const bw = (w - 8) / Math.max(1, counts.length);
  return (
    <div className="ring-border/70 grid gap-1 rounded-md p-3 ring-1">
      <p className="text-xs font-medium">Commits per week, whole team</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="text-primary h-16 w-full"
        role="img"
        aria-label={`Commits per week, oldest first: ${counts.join(', ')}.`}
      >
        {counts.map((c, i) => (
          <rect
            key={i}
            x={4 + i * bw + 2}
            y={h - 2 - (c / max) * (h - 6)}
            width={Math.max(1, bw - 4)}
            height={(c / max) * (h - 6)}
            rx={1.5}
            fill="currentColor"
            opacity={0.85}
          />
        ))}
        <line x1={4} x2={w - 4} y1={h - 1} y2={h - 1} className="stroke-border" />
      </svg>
      <p className="text-muted-foreground flex justify-between text-[0.6875rem]">
        <span>week 1</span>
        <span>week {counts.length}</span>
      </p>
    </div>
  );
}

// P2 A: a member table with the metrics and the suggested score (07 §12), the team's weekly commits, the latest ones.
function Github({ view, github }: { view: ProjectView; github: GithubView }) {
  const { project } = view;
  if (!github.ready) {
    return (
      <Section
        icon={<PageIcon name="github" className="size-8" />}
        title="GitHub"
        description="GitHub is not set up for the LMS yet. Ask an administrator."
      >
        {null}
      </Section>
    );
  }
  if (!project.repo) {
    return (
      <Section
        icon={<PageIcon name="github" className="size-8" />}
        title="Link the repository"
        description="CSE projects live on GitHub. Once linked, the team’s commits arrive here within a minute of each push."
      >
        {view.canTeach || view.isMember ? (
          <LinkRepositoryForm projectId={project.id} installUrl={github.installUrl} />
        ) : (
          <p className="text-muted-foreground text-[0.8125rem]">The team has not linked a repository yet.</p>
        )}
      </Section>
    );
  }
  const unlinkedMembers = project.members.filter((m) => !m.github);
  return (
    <>
      <Section
        icon={<PageIcon name="github" className="size-8" />}
        title="Team activity"
        description="From the repository’s commits, merges left out. The suggested score helps a teacher mark a review; the teacher enters the marks."
      >
        <DataTable
          bare
          columns={[
            {
              header: 'Member',
              cell: (m) => (
                <span className="grid min-w-36">
                  <span className="font-semibold">{m.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {m.github ? `@${m.github}` : 'GitHub not linked'}
                  </span>
                </span>
              ),
            },
            { header: 'Commits', cell: (m) => <span className="tabular-nums">{m.commits}</span> },
            {
              header: 'Active weeks',
              cell: (m) => (
                <span className="whitespace-nowrap tabular-nums">{`${m.activeWeeks} of ${github.totalWeeks}`}</span>
              ),
            },
            {
              header: 'Last-minute',
              cell: (m) => <span className="tabular-nums">{formatPct(Math.round(100 * m.lastMinuteShare))}</span>,
            },
            {
              header: 'Good messages',
              cell: (m) => <span className="tabular-nums">{formatPct(Math.round(100 * m.messageQuality))}</span>,
            },
            {
              header: 'Lines · share',
              cell: (m) => (
                <span className="whitespace-nowrap tabular-nums">
                  {m.lines.toLocaleString('en-IN')} · {formatPct(Math.round(100 * m.share))}
                </span>
              ),
            },
            { header: 'Huge', cell: (m) => <span className="tabular-nums">{m.hugeCommits}</span> },
            {
              header: 'Suggested score',
              cell: (m) => (
                <span className="flex items-center gap-2">
                  <span className="bg-muted h-1.5 w-20 overflow-hidden rounded-full">
                    <span className="bg-primary block h-full rounded-full" style={{ width: `${m.score}%` }} />
                  </span>
                  <b className="tabular-nums">{m.score}</b>
                </span>
              ),
            },
          ]}
          rows={github.members}
          rowKey={(m) => m.studentId}
          empty="No members."
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Suggested score = 35 % regular weeks + 20 % good messages + 15 % not last-minute + 20 % fair share of lines +
          10 % steady volume (07 §12).
        </p>
        {(github.unattributed > 0 || unlinkedMembers.length > 0) && (
          <p className="text-warning flex gap-1.5 text-xs leading-relaxed">
            <WarningIcon className="mt-0.5 size-3.5 shrink-0" />
            {github.unattributed > 0 &&
              `${github.unattributed} commit${github.unattributed === 1 ? '' : 's'} came from GitHub accounts not linked to a member${github.unlinkedLogins.length > 0 ? ` (${github.unlinkedLogins.join(', ')})` : ''}. `}
            {unlinkedMembers.length > 0 &&
              `${unlinkedMembers.map((m) => m.name).join(', ')} ${unlinkedMembers.length === 1 ? 'has' : 'have'} not linked GitHub on their profile yet.`}
          </p>
        )}
        <Weekly counts={github.teamWeekly} />
      </Section>
      <section className="surface grid gap-2 p-4 sm:p-5">
        <h3 className="text-[0.9375rem] font-semibold">Latest commits</h3>
        {github.recent.length === 0 ? (
          <p className="text-muted-foreground text-[0.8125rem]">No commits yet.</p>
        ) : (
          <ul className="grid text-[0.8125rem]">
            {github.recent.map((c) => (
              <li
                key={c.sha}
                className="border-border/70 grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b py-2 last:border-0"
              >
                <span className="text-muted-foreground font-mono text-xs">{c.sha}</span>
                <span className="min-w-0">
                  <span className="block truncate">{c.message}</span>
                  <span className="text-muted-foreground block text-xs">
                    {c.author}
                    {c.linked ? '' : ' (not linked)'} · {formatDateTime(c.at)}
                  </span>
                </span>
                <span className="font-mono text-xs tabular-nums">
                  +{c.additions} −{c.deletions}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

const COLUMNS: [TaskStatus, string][] = [
  ['backlog', 'Backlog'],
  ['in_progress', 'In progress'],
  ['review', 'Review'],
  ['done', 'Done'],
];
const MOVE_LABEL: Partial<Record<string, string>> = {
  'backlog>in_progress': 'Start',
  'in_progress>review': 'Send for review',
  'review>done': 'Mark done',
  'review>in_progress': 'Back to in progress',
  'done>in_progress': 'Reopen',
};

// P3 A: four columns, a card per task with the moves its viewer may make (07 §13). No drag and drop.
function Board({ view, tasks, here }: { view: ProjectView; tasks: TaskView[]; here: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map(([status, label]) => {
        const mine = tasks.filter((t) => t.status === status);
        return (
          <section key={status} className="bg-muted/50 grid content-start gap-2 rounded-md p-2.5" aria-label={label}>
            <p className="flex items-center justify-between px-1 text-xs font-semibold tracking-wide uppercase">
              <span>{label}</span>
              <span className="text-muted-foreground tabular-nums">{mine.length}</span>
            </p>
            {mine.length === 0 && <p className="text-muted-foreground px-1 py-2 text-xs">Nothing here.</p>}
            {mine.map((t) => (
              <article key={t.id} className="bg-card ring-border/70 grid gap-1.5 rounded-md p-3 ring-1">
                {view.canTeach ? (
                  <Link
                    href={`${here}?new=task-${t.id}`}
                    scroll={false}
                    className="text-[0.8125rem] leading-snug font-medium hover:underline"
                  >
                    {t.title}
                  </Link>
                ) : (
                  <p className="text-[0.8125rem] leading-snug font-medium">{t.title}</p>
                )}
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                  <span>
                    {t.assignee.name} · due {formatDate(t.dueAt)}
                  </span>
                  {t.overdue && (
                    <span className="text-destructive inline-flex items-center gap-1.5 text-[0.6875rem] font-medium before:size-1.5 before:rounded-full before:bg-current">
                      Overdue
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {t.moves.flatMap((to) => {
                    const move = MOVE_LABEL[`${t.status}>${to}`];
                    return move
                      ? [
                          <ActionForm
                            key={to}
                            action={moveTask}
                            submitLabel={move}
                            submitSize="sm"
                            submitVariant={to === 'done' ? 'default' : 'outline'}
                          >
                            <input type="hidden" name="taskId" value={t.id} />
                            <input type="hidden" name="to" value={to} />
                          </ActionForm>,
                        ]
                      : [];
                  })}
                  {view.canTeach && t.status === 'backlog' && (
                    <ActionForm
                      action={deleteTask}
                      submitLabel="Delete"
                      submitSize="sm"
                      submitVariant="outline"
                      confirm={{
                        title: `Delete “${t.title}”?`,
                        message: 'It has not started, so nothing else changes.',
                      }}
                    >
                      <input type="hidden" name="taskId" value={t.id} />
                    </ActionForm>
                  )}
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Deadlines({ view }: { view: ProjectView }) {
  const tracker = view.tracker;
  if (!tracker) return null;
  return (
    <Section
      icon={<PageIcon name="projects" className="size-8" />}
      title="Deadlines"
      description="Per member, from the board (07 §13). Students send their own tasks for review; the teacher marks them done."
    >
      <DataTable
        bare
        columns={[
          { header: 'Member', cell: (m) => <span className="font-semibold">{m.name}</span> },
          { header: 'Assigned', cell: (m) => <span className="tabular-nums">{m.assigned}</span> },
          { header: 'Done', cell: (m) => <span className="tabular-nums">{m.done}</span> },
          { header: 'On time', cell: (m) => <span className="tabular-nums">{m.doneOnTime}</span> },
          {
            header: 'Overdue',
            cell: (m) => (
              <span className={cn('tabular-nums', m.overdue > 0 && 'text-destructive font-medium')}>{m.overdue}</span>
            ),
          },
          {
            header: 'On-time rate',
            cell: (m) => (
              <span className="tabular-nums">
                {m.onTimeRate === null ? '—' : formatPct(Math.round(100 * m.onTimeRate))}
              </span>
            ),
          },
        ]}
        rows={tracker.members}
        rowKey={(m) => m.id}
        empty="No members."
      />
      <p className="text-muted-foreground text-xs">
        {tracker.dueSoon.length === 0
          ? 'Nothing is due in the next 7 days.'
          : `Due in the next 7 days: ${tracker.dueSoon.map((t) => `${t.title} (${t.assignee.name}, ${formatDate(t.dueAt)})`).join(' · ')}.`}
      </p>
    </Section>
  );
}

// T8: the project's reviews; each is marked on its own page and their average is the project internal.
function Reviews({
  view,
  here,
  offeringId,
  dialog,
}: {
  view: ProjectView;
  here: string;
  offeringId: string;
  dialog: (name: string) => string;
}) {
  return (
    <Section
      icon={<PageIcon name="evaluation" className="size-8" />}
      title="Reviews"
      description="Marked on the Examination Policy’s project rubric. Each member’s project internal is the average of their reviews."
      action={
        view.canTeach && (
          <Button asChild size="sm" variant="outline">
            <Link href={dialog('review')} scroll={false}>
              <PlusIcon /> New review
            </Link>
          </Button>
        )
      }
    >
      {view.reviews.length === 0 ? (
        <p className="text-muted-foreground text-[0.8125rem]">No reviews yet.</p>
      ) : (
        <ul className="grid text-[0.8125rem]">
          {view.reviews.map((r) => (
            <li
              key={r.id}
              className="border-border/70 flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2.5 last:border-0"
            >
              <span className="grid min-w-48 flex-1">
                <span className="font-medium">{r.title}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(r.heldOn)}
                  {r.sessionId && (
                    <>
                      {' · '}
                      <Link href={`/courses/${offeringId}/live/${r.sessionId}`} className="hover:underline">
                        live class
                      </Link>
                    </>
                  )}
                </span>
              </span>
              <span className="text-muted-foreground text-xs">
                {r.marked} of {view.project.members.length} marked
              </span>
              {view.canTeach && (
                <span className="flex gap-1.5">
                  <Button asChild size="sm">
                    <Link href={`${here}/reviews/${r.id}`}>Mark</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={dialog(`review-${r.id}`)} scroll={false}>
                      Edit
                    </Link>
                  </Button>
                  {r.marked === 0 && (
                    <ActionForm
                      action={deleteReview}
                      submitLabel="Delete"
                      submitSize="sm"
                      submitVariant="outline"
                      confirm={{
                        title: `Delete “${r.title}”?`,
                        message: 'It has no marks. A live class not held yet is cancelled.',
                      }}
                    >
                      <input type="hidden" name="reviewId" value={r.id} />
                    </ActionForm>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
