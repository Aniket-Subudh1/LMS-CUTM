import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarBlankIcon, PlusIcon, UsersThreeIcon, UserIcon, WarningIcon } from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import Loading from '../../../loading';
import { ProjectDialog } from './project-dialog';
import { DataTable } from '@/components/data-table';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { listProjects, type ProjectRow } from '@/lib/data/projects';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, initials } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Projects' };

const Search = z.object({
  page: pageParam.catch(1),
  new: z.literal('project').optional().catch(undefined),
});

export default function ProjectsPage({ params, searchParams }: PageProps<'/courses/[offeringId]/projects'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Projects params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const dates = (p: ProjectRow) => `${formatDate(p.startsOn)} – ${formatDate(p.dueOn)}`;

// M07 T3 (P1): the class's teams for its teachers and the head of department; a student sees their own project.
async function Projects({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/projects'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/projects'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { page, new: open } = Search.parse(await searchParams);
  const view = await listProjects(offeringId, page);
  const base = `/courses/${offeringId}/projects`;
  if (view.learn) {
    const mine = view.rows[0];
    return (
      <Section
        icon={<PageIcon name="projects" className="size-8" />}
        title="Your project"
        description={mine ? `${mine.title} · guide ${mine.guide} · ${dates(mine)}` : 'You are not in a project yet.'}
        action={
          mine && (
            <Button asChild size="sm">
              <Link href={`${base}/${mine.id}`}>Open</Link>
            </Button>
          )
        }
      >
        {mine ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Fact label="Team">{mine.members.map((m) => m.name).join(', ')}</Fact>
            <Fact label={view.mode === 'github' ? 'Repository' : 'Board'}>
              {view.mode === 'github' ? (mine.repo?.fullName ?? 'Not linked yet') : 'Tasks from your teacher'}
            </Fact>
            <Fact label="Reviews">
              {mine.review ? `${mine.review.title} · ${formatDateTime(mine.review.heldOn)}` : 'None scheduled yet'}
            </Fact>
          </div>
        ) : (
          <p className="text-muted-foreground text-[0.8125rem]">Your teacher puts the class into teams.</p>
        )}
      </Section>
    );
  }
  const { counts } = view;
  const tiles: { icon: Icon; value: string; label: string; tone?: string }[] = [
    { icon: UsersThreeIcon, value: String(counts.projects), label: 'Projects' },
    { icon: UserIcon, value: `${counts.inTeams} of ${counts.students}`, label: 'Students in a team' },
    {
      icon: WarningIcon,
      value: String(counts.students - counts.inTeams),
      label: 'Without a team',
      tone: counts.students > counts.inTeams ? 'text-warning' : undefined,
    },
    { icon: CalendarBlankIcon, value: String(counts.reviews), label: 'Reviews held' },
  ];
  return (
    <>
      <Section
        icon={<PageIcon name="projects" className="size-8" />}
        title="Projects"
        description={
          view.mode === 'github'
            ? 'Teams of this class. Their projects live on GitHub, and their commits are synced here.'
            : 'Teams of this class. You set each team’s tasks and check their deadlines.'
        }
        action={
          view.canTeach && (
            <Button asChild size="sm">
              <Link href={`${base}?new=project`} scroll={false}>
                <PlusIcon /> New project
              </Link>
            </Button>
          )
        }
      >
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
                <tile.icon className={cn('size-[1.125rem]', tile.tone)} />
              </span>
              <div className="grid min-w-0">
                <dd className={cn('text-lg leading-tight font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
                <dt className="text-muted-foreground order-first truncate text-xs">{tile.label}</dt>
              </div>
            </div>
          ))}
        </dl>
        <DataTable
          bare
          columns={[
            {
              header: 'Project',
              cell: (p) => (
                <span className="grid min-w-48">
                  <Link href={`${base}/${p.id}`} className="font-semibold hover:underline">
                    {p.title}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {dates(p)} · guide {p.guide}
                  </span>
                </span>
              ),
            },
            {
              header: 'Team',
              cell: (p) => (
                <span className="flex items-center gap-2">
                  <span className="flex -space-x-1.5">
                    {p.members.map((m) => (
                      <Avatar key={m.id} className="ring-card size-6 ring-2" title={m.name}>
                        <AvatarFallback className="bg-primary/10 text-primary text-[0.55rem] font-semibold">
                          {initials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {p.members.length} student{p.members.length === 1 ? '' : 's'}
                  </span>
                </span>
              ),
            },
            ...(view.mode === 'github'
              ? [
                  {
                    header: 'Repository',
                    cell: (p: ProjectRow) =>
                      p.repo ? (
                        <span className="grid">
                          <span className="font-mono text-xs">{p.repo.fullName}</span>
                          <span
                            className={cn('text-xs', p.repo.syncError ? 'text-destructive' : 'text-muted-foreground')}
                          >
                            {p.repo.syncError
                              ? `Sync failed: ${p.repo.syncError}`
                              : p.repo.lastSyncedAt
                                ? `Synced ${formatDateTime(p.repo.lastSyncedAt)}`
                                : 'Not synced yet'}
                          </span>
                        </span>
                      ) : (
                        <span className="text-warning text-xs">No repository linked yet</span>
                      ),
                  },
                ]
              : []),
            {
              header: 'Review',
              cell: (p) =>
                p.review ? (
                  <span className="grid text-xs">
                    <span>{p.review.title}</span>
                    <span className="text-muted-foreground">
                      {p.review.upcoming ? 'Next: ' : 'Last: '}
                      {formatDateTime(p.review.heldOn)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">None yet</span>
                ),
            },
            {
              header: '',
              className: 'w-20',
              cell: (p) => (
                <Button asChild variant="outline" size="sm">
                  <Link href={`${base}/${p.id}`}>Open</Link>
                </Button>
              ),
            },
          ]}
          rows={view.rows}
          rowKey={(p) => p.id}
          total={counts.projects}
          page={page}
          pageSize={pageSize}
          query={{}}
          path={base}
          empty={view.canTeach ? 'No projects yet. Make one with New project.' : 'No projects yet.'}
        />
      </Section>
      {view.canTeach && open && <ProjectDialog key={open} offeringId={offeringId} openParam="project" view={view} />}
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ring-border/70 grid content-start gap-1 rounded-md p-3 ring-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-[0.8125rem]">{children}</p>
    </div>
  );
}
