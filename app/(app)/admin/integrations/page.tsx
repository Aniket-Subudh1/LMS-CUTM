import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Loading from '../../loading';
import { requestGithubSync } from '../../courses/[offeringId]/projects/actions';
import { retryJob } from './actions';
import { ActionForm } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { getIntegrations } from '@/lib/data/integrations';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Integrations' };

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Integrations />
    </Suspense>
  );
}

// M07 T9 (P5): whether GitHub is set up, the projects whose sync failed, and every queue's jobs that ran out of tries.
async function Integrations() {
  const view = await getIntegrations();
  const { github, runs } = view;
  return (
    <>
      <PageHeader
        icon={<PageIcon name="globe" />}
        title="Integrations"
        description="Services the LMS talks to, and background work that failed."
      />
      <div className="grid gap-5">
        <Section
          icon={<PageIcon name="code" className="size-8" />}
          title="GitHub"
          description={
            github.ready
              ? `Set up · ${github.linked} repositor${github.linked === 1 ? 'y' : 'ies'} linked`
              : 'Not set up yet: the server needs the GitHub App’s six settings, then a restart.'
          }
          action={
            github.installUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={github.installUrl} target="_blank" rel="noreferrer">
                  Install on a repository
                </a>
              </Button>
            )
          }
        >
          <DataTable
            bare
            columns={[
              {
                header: 'Project',
                cell: (p) => (
                  <Link href={`/courses/${p.offeringId}/projects/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                ),
              },
              { header: 'Repository', cell: (p) => <span className="font-mono text-xs">{p.repo}</span> },
              {
                header: 'Problem',
                className: 'whitespace-normal',
                cell: (p) => <span className="text-destructive text-xs">{p.error}</span>,
              },
              {
                header: '',
                className: 'w-24',
                cell: (p) => (
                  <ActionForm action={requestGithubSync} submitLabel="Sync now" submitVariant="outline" submitSize="sm">
                    <input type="hidden" name="projectId" value={p.id} />
                  </ActionForm>
                ),
              },
            ]}
            rows={view.failingProjects}
            rowKey={(p) => p.id}
            empty="No project’s last sync failed."
          />
          <p className="text-muted-foreground text-xs">
            {runs.total === 0
              ? 'No sync has run yet.'
              : `Last ${runs.total} syncs: ${runs.succeeded} succeeded, ${runs.failed} failed.`}
          </p>
        </Section>
        <Section
          icon={<PageIcon name="settings" className="size-8" />}
          title="Failed background jobs"
          description="Each queue’s latest 20 jobs that ran out of tries. Fix the cause, then try them again."
        >
          <DataTable
            bare
            columns={[
              { header: 'Queue', cell: (j) => j.queue },
              {
                header: 'Job',
                cell: (j) => (
                  <span className="font-mono text-xs">
                    {j.name} · {j.id.length > 24 ? `${j.id.slice(0, 24)}…` : j.id}
                  </span>
                ),
              },
              {
                header: 'Why',
                className: 'whitespace-normal',
                cell: (j) => <span className="text-xs">{j.reason}</span>,
              },
              { header: 'Tries', cell: (j) => <span className="tabular-nums">{j.attempts}</span> },
              {
                header: 'Failed',
                cell: (j) => <span className="text-xs whitespace-nowrap">{j.at ? formatDateTime(j.at) : '—'}</span>,
              },
              {
                header: '',
                className: 'w-20',
                cell: (j) => (
                  <ActionForm action={retryJob} submitLabel="Retry" submitVariant="outline" submitSize="sm">
                    <input type="hidden" name="queue" value={j.queue} />
                    <input type="hidden" name="jobId" value={j.id} />
                  </ActionForm>
                ),
              },
            ]}
            rows={view.failedJobs}
            rowKey={(j) => `${j.queue}:${j.id}`}
            empty="Nothing failed."
          />
        </Section>
      </div>
    </>
  );
}
