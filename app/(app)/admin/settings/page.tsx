import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon, ExamIcon, GearSixIcon, VideoIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../loading';
import { LinkSpinner } from '@/components/link-spinner';
import { PageHeader } from '@/components/page-header';
import { listSettings } from '@/lib/data/settings';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const cards = await listSettings();
  return (
    <>
      <PageHeader
        icon={<GearSixIcon weight="duotone" />}
        title="Settings"
        description="Rules that apply across the whole university. Each change is recorded in the audit log."
      />
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
        {cards.map((card) => (
          <li key={card.key}>
            <Link
              href={`/admin/settings/${card.key}`}
              className="surface-interactive group flex h-full flex-col gap-4 p-5"
            >
              <span className="icon-chip size-12 [&_svg]:size-7">
                {card.key === 'evaluation' ? <ExamIcon weight="duotone" /> : <VideoIcon weight="duotone" />}
              </span>
              <span className="grid gap-1">
                <span className="font-semibold">{card.label}</span>
                <span className="text-muted-foreground text-sm">{card.description}</span>
              </span>
              <span className="text-muted-foreground mt-auto flex items-center gap-1.5 text-xs">
                {card.updatedAt ? `Last changed ${formatDateTime(card.updatedAt)}` : 'Using the recommended defaults'}
                <ArrowRightIcon className="text-primary ml-auto size-4 transition-transform group-hover:translate-x-0.5" />
                <LinkSpinner />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
