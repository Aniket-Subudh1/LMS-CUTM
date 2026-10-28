import { type ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, ChatCircleTextIcon, StopCircleIcon, TimerIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import { endAttempt, extendAttempts, messageTakers } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { Field } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { RowMenu } from '@/components/row-menu';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getMonitor, type Monitor, type MonitorRow } from '@/lib/data/assessments';
import { GAP_MS } from '@/lib/domain/proctoring';
import { assessmentPath } from '@/lib/domain/test-links';
import { cn } from '@/lib/cn';
import { formatClock, PROCTOR_EVENT_LABEL } from '@/lib/format';
import { PROCTOR_LIMITS } from '@/lib/schemas/assessment';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

const Search = z.object({
  page: pageParam.catch(1),
  new: z.string().max(40).optional().catch(undefined),
});

function lastSeen(row: MonitorRow, now: Date): { text: string; tone: string } {
  if (!row.lastSeenAt) return { text: 'Not yet', tone: 'text-muted-foreground' };
  const seconds = Math.round((now.getTime() - row.lastSeenAt.getTime()) / 1000);
  if (seconds * 1000 > GAP_MS) {
    const minutes = Math.floor(seconds / 60);
    return { text: `${minutes} min ago`, tone: 'text-destructive' };
  }
  return { text: 'Just now', tone: 'text-success' };
}

function Warnings({ row }: { row: MonitorRow }) {
  if (row.warnings.includes('second_device')) {
    return <span className="text-destructive font-medium">Opened in a second tab or device</span>;
  }
  if (row.hard === 0) {
    return row.soft > 0 ? (
      <span className="text-muted-foreground">{row.soft} minor</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  return (
    <span className="text-warning font-medium">
      {row.hard} · {row.warnings.map((type) => PROCTOR_EVENT_LABEL[type].toLowerCase()).join(', ')}
    </span>
  );
}

// TP-08 (mock-up "Live monitor"): who is writing now, how far they are, their time and warnings, and when each was
// last heard from. Whoever manages the test adds time, sends a message or ends an attempt — one person or everyone; a
// head of department watches. It reloads every 15 seconds. Shared by a course's assessments and standalone tests.
export async function LiveMonitor({
  params,
  searchParams,
}: {
  params: Promise<{ offeringId?: string; aid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { offeringId, aid } = await params;
  const { page, new: open } = Search.parse(await searchParams);
  const m = await getMonitor(aid, page);
  if (m.path !== assessmentPath(offeringId ?? null, aid)) notFound();
  const base = `${m.path}/monitor`;
  const { counts } = m;
  const tiles: { icon: ReactNode; value: number; label: string; tone: string }[] = [
    { icon: <PageIcon name="tests" className="size-7" />, value: counts.writing, label: 'Writing now', tone: '' },
    { icon: <PageIcon name="handin" className="size-7" />, value: counts.handedIn, label: 'Handed in', tone: '' },
    {
      icon: <PageIcon name="warning" className="size-7" />,
      value: counts.warned,
      label: 'With warnings',
      tone: counts.warned > 0 ? 'text-warning' : '',
    },
    {
      icon: <PageIcon name="missing" className="size-7" />,
      value: counts.lost,
      label: 'Connection lost',
      tone: counts.lost > 0 ? 'text-destructive' : '',
    },
  ];
  const target = open?.match(/^(time|message)-([a-f\d]{24})$/);
  const person = target ? m.rows.find((row) => row.id === target[2]) : undefined;
  return (
    <>
      <AutoRefresh seconds={15} />
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`${m.path}/edit`}>
          <ArrowLeftIcon /> {m.assessment.title}
        </Link>
      </Button>
      <Section
        icon={<PageIcon name="live" className="size-8" />}
        title="Live monitor"
        description={`Who is writing now, how far they are${m.assessment.proctoring ? ', and every warning as it happens' : ''}. Refreshes every 15 seconds.`}
        action={
          m.canAct &&
          counts.writing > 0 && (
            <>
              <TimeDialog m={m} trigger="Add time to all" />
              <MessageDialog m={m} trigger="Message all" />
            </>
          )
        }
      >
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
                {tile.icon}
              </span>
              <div className="grid min-w-0">
                <dd className={cn('text-lg leading-tight font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
                <dt className="text-muted-foreground order-first text-xs">{tile.label}</dt>
              </div>
            </div>
          ))}
        </dl>
        {!m.assessment.proctoring && (
          <p className="text-muted-foreground text-[0.8125rem]">
            This test is not proctored, so no warnings are recorded. You can still add time, send messages and end
            attempts.
          </p>
        )}
        <DataTable
          bare
          columns={[
            {
              header: offeringId ? 'Student' : 'Candidate',
              cell: (row) => (
                <span className="grid min-w-44">
                  <span className="truncate font-semibold">{row.student.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{row.student.email}</span>
                </span>
              ),
            },
            {
              header: 'Progress',
              cell: (row) => (
                <span className="flex min-w-36 items-center gap-3">
                  <span className="bg-muted h-1.5 w-24 shrink-0 overflow-hidden rounded-full">
                    <span
                      className="bg-foreground block h-full rounded-full"
                      style={{ width: `${row.questions ? (100 * row.answered) / row.questions : 0}%` }}
                    />
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {row.answered} / {row.questions}
                  </span>
                </span>
              ),
            },
            {
              header: 'Time left',
              cell: (row) => {
                const left = row.deadlineAt.getTime() - m.now.getTime();
                return (
                  <span className="whitespace-nowrap">
                    <b className="font-semibold tabular-nums">{left > 0 ? formatClock(left) : 'Time up'}</b>
                    {row.extraMin > 0 && <span className="text-primary"> +{row.extraMin} min</span>}
                  </span>
                );
              },
            },
            { header: 'Warnings', cell: (row) => <Warnings row={row} /> },
            {
              header: 'Last seen',
              cell: (row) => {
                const seen = lastSeen(row, m.now);
                return <span className={cn('whitespace-nowrap', seen.tone)}>{seen.text}</span>;
              },
            },
            {
              header: '',
              className: 'w-12',
              cell: (row) =>
                m.canAct && (
                  <RowMenu
                    label={row.student.name}
                    items={[
                      { kind: 'link', label: 'Add time', href: `${base}?new=time-${row.id}`, icon: <TimerIcon /> },
                      {
                        kind: 'link',
                        label: 'Send a message',
                        href: `${base}?new=message-${row.id}`,
                        icon: <ChatCircleTextIcon />,
                      },
                      { kind: 'separator' },
                      {
                        kind: 'action',
                        label: 'End attempt',
                        icon: <StopCircleIcon />,
                        action: endAttempt,
                        fields: { submissionId: row.id },
                        destructive: true,
                        confirm: {
                          title: `End ${row.student.name}’s attempt?`,
                          message:
                            'The answers they have saved are handed in now and they cannot write any more. This is recorded.',
                          confirmLabel: 'End attempt',
                          destructive: true,
                        },
                      },
                    ]}
                  />
                ),
            },
          ]}
          rows={m.rows}
          rowKey={(row) => row.id}
          total={counts.writing}
          page={page}
          pageSize={pageSize}
          query={{}}
          path={base}
          empty={
            m.assessment.state === 'upcoming'
              ? 'It has not opened yet. People appear here as they start.'
              : 'Nobody is writing now.'
          }
        />
      </Section>
      {m.canAct && person && target?.[1] === 'time' && <TimeDialog m={m} person={person} />}
      {m.canAct && person && target?.[1] === 'message' && <MessageDialog m={m} person={person} />}
    </>
  );
}

function TimeDialog({ m, person, trigger }: { m: Monitor; person?: MonitorRow; trigger?: string }) {
  return (
    <FormDialog
      trigger={
        trigger && (
          <Button variant="outline" size="sm">
            <TimerIcon /> {trigger}
          </Button>
        )
      }
      openParam={person && `time-${person.id}`}
      icon={<PageIcon name="session" className="size-8" />}
      title={person ? `Add time for ${person.student.name}` : 'Add time for everyone writing'}
      description="Added to each running attempt now, and shown on their timer within 15 seconds. This is recorded."
      action={extendAttempts}
      submitLabel="Add time"
      successMessage="Time added."
    >
      <input type="hidden" name="assessmentId" value={m.assessment.id} />
      {person && <input type="hidden" name="submissionId" value={person.id} />}
      <Field name="minutes" label="Minutes">
        <Input name="minutes" type="number" min={1} max={PROCTOR_LIMITS.addMinutes} required className="w-32" />
      </Field>
    </FormDialog>
  );
}

function MessageDialog({ m, person, trigger }: { m: Monitor; person?: MonitorRow; trigger?: string }) {
  return (
    <FormDialog
      trigger={
        trigger && (
          <Button variant="outline" size="sm">
            <ChatCircleTextIcon /> {trigger}
          </Button>
        )
      }
      openParam={person && `message-${person.id}`}
      icon={<PageIcon name="chat" className="size-8" />}
      title={person ? `Message ${person.student.name}` : 'Message everyone writing'}
      description="It appears at the top of their test within 15 seconds."
      action={messageTakers}
      submitLabel="Send"
      successMessage="Message sent."
    >
      <input type="hidden" name="assessmentId" value={m.assessment.id} />
      {person && <input type="hidden" name="submissionId" value={person.id} />}
      <Field name="text" label="Message">
        <Textarea name="text" required maxLength={PROCTOR_LIMITS.message} rows={3} />
      </Field>
    </FormDialog>
  );
}
