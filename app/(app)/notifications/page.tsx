import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CaretRightIcon, ChecksIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../loading';
import { markAllRead, openNotification } from './actions';
import { ActionForm } from '@/components/action-form';
import { EmptyState, PageNav } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { listMyNotifications, unreadCount } from '@/lib/data/notifications';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { NotificationKind } from '@/lib/models/notification';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Notifications' };

const Search = z.object({ page: pageParam.catch(1) });

const KIND: Record<NotificationKind, { label: string; icon: PageIconName }> = {
  'plan.requested': { label: 'Course plan needed', icon: 'plan' },
  'plan.published': { label: 'Course plan published', icon: 'plan' },
  'live.scheduled': { label: 'Live class scheduled', icon: 'live' },
  'live.changed': { label: 'Live class changed', icon: 'session' },
  'live.cancelled': { label: 'Live class cancelled', icon: 'missing' },
  'live.started': { label: 'Live class started', icon: 'live' },
  'meeting.invited': { label: 'Meeting invitation', icon: 'meetings' },
  'meeting.changed': { label: 'Meeting changed', icon: 'meetings' },
  'meeting.cancelled': { label: 'Meeting cancelled', icon: 'missing' },
  'meeting.started': { label: 'Meeting started', icon: 'meetings' },
  'assessment.published': { label: 'New assessment', icon: 'evaluation' },
  'assessment.dueSoon': { label: 'Due soon', icon: 'deadline' },
  'results.published': { label: 'Results published', icon: 'results' },
  'bank.drafted': { label: 'AI drafts', icon: 'sparkle' },
  'task.assigned': { label: 'Project task', icon: 'task' },
  'gradeSheet.published': { label: 'Grade sheet published', icon: 'results' },
};

export default function NotificationsPage({ searchParams }: PageProps<'/notifications'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Notifications searchParams={searchParams} />
    </Suspense>
  );
}

async function Notifications({ searchParams }: { searchParams: PageProps<'/notifications'>['searchParams'] }) {
  const { page } = Search.parse(await searchParams);
  const [{ rows, total }, unread] = await Promise.all([listMyNotifications(page), unreadCount()]);
  return (
    <>
      <PageHeader
        icon={<PageIcon name="notifications" />}
        title="Notifications"
        description={
          unread > 0
            ? `You have ${unread} unread notification${unread === 1 ? '' : 's'}. Open one to go straight to it.`
            : 'Updates about your courses appear here. Open one to go straight to it.'
        }
        actions={
          unread > 0 && (
            <ActionForm
              action={markAllRead}
              submitLabel="Mark all as read"
              submitVariant="outline"
              submitIcon={<ChecksIcon />}
            />
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<PageIcon name="notifications" />}
          text="Nothing yet. You will be told here when a course plan is published or needs your attention."
        />
      ) : (
        <>
          <ul className="surface divide-border/80 divide-y overflow-hidden">
            {rows.map((row) => {
              const { label, icon } = KIND[row.kind];
              return (
                <li key={row.id}>
                  <form action={openNotification}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className={cn(
                        'hover:bg-primary/3 focus-visible:bg-primary/4 group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors outline-none',
                        !row.read && 'bg-primary/2.5',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-10 shrink-0 place-items-center rounded-md ring-1',
                          row.read
                            ? 'bg-background text-muted-foreground ring-border'
                            : 'bg-primary/10 text-primary ring-primary/15',
                        )}
                      >
                        <PageIcon name={icon} className="size-8" />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className={cn('truncate', row.read ? 'font-medium' : 'font-semibold')}>{row.title}</span>
                        <span className="text-muted-foreground text-xs">
                          {label} · {formatDateTime(row.createdAt)}
                        </span>
                      </span>
                      {!row.read && (
                        <span className="bg-primary size-2 shrink-0 rounded-full">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                      <CaretRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
          <PageNav
            shown={rows.length}
            total={total}
            page={page}
            pageSize={pageSize}
            query={{}}
            path="/notifications"
            className="mt-5"
          />
        </>
      )}
    </>
  );
}
