import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowSquareOutIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../loading';
import { DataTable } from '@/components/data-table';
import { MeetingDialog } from '@/components/meeting-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listMeetings, type MeetingRow } from '@/lib/data/meetings';
import { formatDay, formatTime } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Meetings' };

// `up` pages the upcoming meetings, `page` the past ones.
const Search = z.object({ page: pageParam.catch(1), up: pageParam.catch(1) });

export default function MeetingsPage({ searchParams }: PageProps<'/meetings'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Meetings searchParams={searchParams} />
    </Suspense>
  );
}

const STATE: Record<MeetingRow['state'], string> = {
  upcoming: 'Upcoming',
  live: 'Live now',
  ended: 'Held',
  cancelled: 'Cancelled',
  not_held: 'Not held',
};

// M03c T4, mock-up R2-A: the meetings the viewer hosts or is invited to; staff schedule new ones.
async function Meetings({ searchParams }: { searchParams: PageProps<'/meetings'>['searchParams'] }) {
  const { page, up } = Search.parse(await searchParams);
  const list = await listMeetings(up, page);
  const columns = (past: boolean) => [
    {
      header: 'When',
      cell: (m: MeetingRow) => (
        <span className="grid min-w-28">
          <b className="font-semibold">{formatDay(m.scheduledStart)}</b>
          <span className="text-muted-foreground text-xs">
            {formatTime(m.scheduledStart)}–{formatTime(m.scheduledEnd)}
          </span>
        </span>
      ),
    },
    {
      header: 'Meeting',
      cell: (m: MeetingRow) => (
        <span className="grid min-w-56">
          <Link href={`/meetings/${m.id}`} className="font-semibold hover:underline">
            {m.title}
          </Link>
          <span className="text-muted-foreground text-xs">{m.hosting ? 'You host' : `Hosted by ${m.hosts}`}</span>
        </span>
      ),
    },
    {
      header: 'People',
      cell: (m: MeetingRow) => (
        <span className="text-xs">
          {m.people} from the LMS{m.guests > 0 ? ` · ${m.guests} guest${m.guests === 1 ? '' : 's'}` : ''}
        </span>
      ),
    },
    {
      header: '',
      className: 'text-right',
      cell: (m: MeetingRow) =>
        m.state === 'live' ? (
          <Button asChild size="sm">
            <a href={`/meetings/${m.id}/room`} target="_blank" rel="noopener">
              <ArrowSquareOutIcon /> Join
            </a>
          </Button>
        ) : (
          <Badge variant={past && m.state !== 'ended' ? 'secondary' : 'outline'}>{STATE[m.state]}</Badge>
        ),
    },
  ];
  return (
    <div className="grid gap-5">
      <PageHeader
        icon={<PageIcon name="meetings" />}
        title="Meetings"
        description="Meetings outside classes, with people from the LMS and guests by email. Everyone invited gets an email with the link and a calendar file."
        actions={
          list.canSchedule && (
            <MeetingDialog
              trigger={
                <Button>
                  <PlusIcon /> New meeting
                </Button>
              }
            />
          )
        }
      />
      <Section icon={<PageIcon name="meetings" className="size-8" />} title="Upcoming" description="Soonest first.">
        <DataTable
          columns={columns(false)}
          rows={list.upcoming}
          rowKey={(m) => m.id}
          total={list.upcomingTotal}
          page={up}
          pageSize={pageSize}
          query={{ page: String(page) }}
          path="/meetings"
          param="up"
          empty={list.canSchedule ? 'No meetings ahead. Schedule one with New meeting.' : 'No meetings ahead.'}
          bare
        />
      </Section>
      <Section icon={<PageIcon name="session" className="size-8" />} title="Past" description="Latest first.">
        <DataTable
          columns={columns(true)}
          rows={list.past}
          rowKey={(m) => m.id}
          total={list.pastTotal}
          page={page}
          pageSize={pageSize}
          query={{ up: String(up) }}
          path="/meetings"
          empty="No past meetings yet."
          bare
        />
      </Section>
    </div>
  );
}
