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
import { getIntegrations, type IntegrationsView } from '@/lib/data/integrations';
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
        icon={<PageIcon name="integrations" />}
        title="Integrations"
        description="Services the LMS talks to, and background work that failed."
      />
      <div className="grid gap-5">
        <Section
          icon={<PageIcon name="github" className="size-8" />}
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
          icon={<PageIcon name="exams" className="size-8" />}
          title="Exam section"
          description="Files exchanged with the exam section, locks and grade sheets. Until the university’s exam system has an API, it is a CSV file each way."
        >
          <DataTable
            bare
            columns={[
              { header: 'What', cell: (r) => <span className="font-medium">{RUN_LABEL[r.kind]}</span> },
              { header: 'Batch', cell: (r) => r.batch?.name ?? '—' },
              {
                header: 'When',
                cell: (r) => <span className="text-xs whitespace-nowrap">{formatDateTime(r.at)}</span>,
              },
              { header: 'By', cell: (r) => r.by },
              { header: 'Result', className: 'whitespace-normal', cell: (r) => <RunResult run={r} /> },
              {
                header: '',
                className: 'w-20',
                cell: (r) =>
                  r.batch && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/exams/${r.batch.id}${r.termId ? `?term=${r.termId}` : ''}`}>Open</Link>
                    </Button>
                  ),
              },
            ]}
            rows={view.examRuns}
            rowKey={(r) => r.id}
            empty="Nothing has been exchanged with the exam section yet."
          />
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

type ExamRun = IntegrationsView['examRuns'][number];

const RUN_LABEL: Record<ExamRun['kind'], string> = {
  exam_push_csv: 'Sent internal marks',
  exam_pull_csv: 'Brought back marks',
  exam_push_api: 'Sent internal marks (API)',
  exam_pull_api: 'Brought back marks (API)',
  marks_lock: 'Locked courses',
  grade_sheets: 'Worked out grade sheets',
};

// M08 T8 (mock-up E6): what a run did, in the words of the batch page.
function RunResult({ run }: { run: ExamRun }) {
  const { rows, applied, failed } = run.stats;
  if (run.status === 'running') return <span className="text-muted-foreground text-xs">Running…</span>;
  if (run.status === 'stopped') return <span className="text-destructive text-xs">Stopped before it finished</span>;
  if (run.kind === 'marks_lock') {
    return (
      <span className={failed > 0 ? 'text-warning text-xs' : 'text-xs'}>
        {applied} of {rows ?? 0} locked
      </span>
    );
  }
  if (run.kind === 'grade_sheets') {
    return run.status === 'failed' ? (
      <span className="text-destructive text-xs">Failed</span>
    ) : (
      <span className="text-xs">
        {applied} ready · {failed} incomplete
      </span>
    );
  }
  return run.status === 'failed' ? (
    <span className="text-destructive text-xs">Nothing saved: {failed} rows need fixing</span>
  ) : (
    <span className="text-xs">{applied} rows</span>
  );
}
