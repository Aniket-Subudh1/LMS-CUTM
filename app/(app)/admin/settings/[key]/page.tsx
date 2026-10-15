import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, InfoIcon, VideoIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { saveSettings } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSettingsPage } from '@/lib/data/settings';
import { formatDateTime, formatPct } from '@/lib/format';
import { settingsKey } from '@/lib/schemas/settings';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingPage({ params }: PageProps<'/admin/settings/[key]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Setting params={params} />
    </Suspense>
  );
}

// Each settings key has its own form; M02 adds `lessons` (06 §7). Later milestones add theirs beside it.
async function Setting({ params }: { params: PageProps<'/admin/settings/[key]'>['params'] }) {
  const key = settingsKey.safeParse((await params).key);
  if (!key.success) notFound();
  const page = await getSettingsPage(key.data);
  return (
    <>
      <PageHeader
        icon={<VideoIcon weight="duotone" />}
        title={page.label}
        description={page.description}
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/settings">
              <ArrowLeftIcon />
              All settings
            </Link>
          </Button>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section
          icon={<VideoIcon weight="duotone" />}
          title="When is a video complete?"
          description={
            page.updated
              ? `Last changed by ${page.updated.by} on ${formatDateTime(page.updated.at)}.`
              : 'Nobody has changed this yet, so the recommended value applies.'
          }
        >
          <ActionForm action={saveSettings} submitLabel="Save" successMessage="Saved. New progress follows this rule.">
            <input type="hidden" name="key" value={page.key} />
            <Field
              name="completePct"
              label="Watched share that completes a video"
              hint={`${page.fieldHelp.completePct} Recommended: ${formatPct(page.defaults.completePct)}.`}
            >
              <span className="relative block w-40">
                <Input
                  name="completePct"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={100}
                  step="any"
                  required
                  defaultValue={page.value.completePct}
                  className="pr-9 tabular-nums"
                />
                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm">
                  %
                </span>
              </span>
            </Field>
          </ActionForm>
        </Section>

        <Section
          icon={<InfoIcon weight="duotone" />}
          title="Where this applies"
          description="What changes when you save."
        >
          <ul className="text-muted-foreground grid gap-3 text-sm leading-relaxed">
            <li>
              <span className="text-foreground font-medium">Video lessons.</span> A student&apos;s lesson turns complete
              the first time they reach this share. Lessons already complete stay complete.
            </li>
            <li>
              <span className="text-foreground font-medium">Skill-course attendance.</span> It is the share of published
              lessons a student has completed, so this rule decides when a video counts.
            </li>
            <li>
              <span className="text-foreground font-medium">Documents and links.</span> Not affected: they are complete
              when the student marks them done.
            </li>
          </ul>
        </Section>
      </div>
    </>
  );
}
