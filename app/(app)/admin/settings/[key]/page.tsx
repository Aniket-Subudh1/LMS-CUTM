import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { saveSettings } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getRunnerLanguages, getSettingsPage, type SettingsPage } from '@/lib/data/settings';
import { coursePercentage, RUBRICS } from '@/lib/domain/evaluation';
import { CRITERION_LABEL, formatDateTime, formatPct } from '@/lib/format';
import { settingsKey } from '@/lib/schemas/settings';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingPage({ params }: PageProps<'/admin/settings/[key]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Setting params={params} />
    </Suspense>
  );
}

// Each settings key has its own form (06 §7): M02's `lessons`, M01b's `evaluation`, M03's `attendance`, M04b's
// `codeRunner` and `proctoring`, M06's `ceTrend`, M07's `projects`.
async function Setting({ params }: { params: PageProps<'/admin/settings/[key]'>['params'] }) {
  const key = settingsKey.safeParse((await params).key);
  if (!key.success) notFound();
  switch (key.data) {
    case 'lessons':
      return <Lessons page={await getSettingsPage('lessons')} />;
    case 'evaluation':
      return <Evaluation page={await getSettingsPage('evaluation')} />;
    case 'attendance':
      return <Attendance page={await getSettingsPage('attendance')} />;
    case 'codeRunner':
      return <CodeRunner page={await getSettingsPage('codeRunner')} runner={await getRunnerLanguages()} />;
    case 'proctoring':
      return <Proctoring page={await getSettingsPage('proctoring')} />;
    case 'ceTrend':
      return <CeTrend page={await getSettingsPage('ceTrend')} />;
    case 'projects':
      return <Projects page={await getSettingsPage('projects')} />;
  }
}

function Header({ page, icon }: { page: { label: string; description: string }; icon: ReactNode }) {
  return (
    <PageHeader
      icon={icon}
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
  );
}

const changed = (page: { updated: { at: Date; by: string } | null }) =>
  page.updated
    ? `Last changed by ${page.updated.by} on ${formatDateTime(page.updated.at)}.`
    : 'Nobody has changed this yet, so the recommended values apply.';

function Lessons({ page }: { page: SettingsPage<'lessons'> }) {
  return (
    <>
      <Header page={page} icon={<PageIcon name="video" />} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section
          icon={<PageIcon name="video" className="size-8" />}
          title="When is a video complete?"
          description={changed(page)}
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
          icon={<PageIcon name="video" className="size-8" />}
          title="Where this applies"
          description="What changes when you save."
        >
          <ul className="text-muted-foreground grid gap-3 text-sm leading-relaxed">
            <li>
              <span className="text-foreground font-medium">Video lessons.</span> A student&apos;s lesson turns complete
              the first time they reach this share. Lessons already complete stay complete.
            </li>
            <li>
              <span className="text-foreground font-medium">Non-credit course attendance.</span> It is the share of
              published lessons a student has completed, so this rule decides when a video counts.
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

// M04b (TP-09): the languages code questions can use and the wait between runs; beside them, the runner's own list
// so the ids can be checked.
function CodeRunner({
  page,
  runner,
}: {
  page: SettingsPage<'codeRunner'>;
  runner: { id: number; name: string }[] | null;
}) {
  return (
    <>
      <Header page={page} icon={<PageIcon name="evaluation" />} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section
          icon={<PageIcon name="evaluation" className="size-8" />}
          title="Languages and runs"
          description={changed(page)}
        >
          <ActionForm action={saveSettings} submitLabel="Save" successMessage="Saved. New runs follow this.">
            <input type="hidden" name="key" value={page.key} />
            <Field name="languages" label="Languages" hint={page.fieldHelp.languages}>
              <Textarea
                name="languages"
                required
                rows={6}
                className="font-mono text-[0.8125rem]"
                defaultValue={page.value.languages.map((l) => `${l.key} | ${l.label} | ${l.runnerId}`).join('\n')}
              />
            </Field>
            <Field
              name="runCooldownSec"
              label="Wait between runs"
              hint={`${page.fieldHelp.runCooldownSec} Recommended: ${page.defaults.runCooldownSec} seconds.`}
            >
              <span className="relative block w-40">
                <Input
                  name="runCooldownSec"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  step={1}
                  required
                  defaultValue={page.value.runCooldownSec}
                  className="pr-12 tabular-nums"
                />
                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm">
                  s
                </span>
              </span>
            </Field>
          </ActionForm>
        </Section>
        <Section
          icon={<PageIcon name="evaluation" className="size-8" />}
          title="The code runner’s languages"
          description={runner ? `${runner.length} languages, with the id to use.` : 'The code runner did not answer.'}
        >
          {runner && (
            <ul className="grid max-h-96 gap-1 overflow-y-auto text-[0.8125rem]">
              {runner.map((language) => (
                <li key={language.id} className="flex justify-between gap-3">
                  <span>{language.name}</span>
                  <b className="tabular-nums">{language.id}</b>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

// M04b (TP-08): how long proctoring's camera snapshots are kept (05 §8).
function Proctoring({ page }: { page: SettingsPage<'proctoring'> }) {
  return (
    <>
      <Header page={page} icon={<PageIcon name="devices" />} />
      <div className="max-w-3xl">
        <Section
          icon={<PageIcon name="devices" className="size-8" />}
          title="How long are camera snapshots kept?"
          description={changed(page)}
        >
          <ActionForm
            action={saveSettings}
            submitLabel="Save"
            successMessage="Saved. The nightly clean-up follows this from now on."
          >
            <input type="hidden" name="key" value={page.key} />
            <Field
              name="snapshotRetentionDays"
              label="Days after results are published"
              hint={`${page.fieldHelp.snapshotRetentionDays} Recommended: ${page.defaults.snapshotRetentionDays} days.`}
            >
              <span className="relative block w-40">
                <Input
                  name="snapshotRetentionDays"
                  type="number"
                  inputMode="numeric"
                  min={7}
                  max={365}
                  step={1}
                  required
                  defaultValue={page.value.snapshotRetentionDays}
                  className="pr-12 tabular-nums"
                />
                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm">
                  days
                </span>
              </span>
            </Field>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

// M07: how a GitHub project's commits are read for the suggested score (07 §12).
function Projects({ page }: { page: SettingsPage<'projects'> }) {
  return (
    <>
      <Header page={page} icon={<PageIcon name="code" />} />
      <div className="max-w-3xl">
        <Section
          icon={<PageIcon name="code" className="size-8" />}
          title="How are commits read?"
          description={changed(page)}
        >
          <ActionForm
            action={saveSettings}
            submitLabel="Save"
            successMessage="Saved. Project pages follow this from now on."
          >
            <input type="hidden" name="key" value={page.key} />
            <Field
              name="lastMinuteHours"
              label="Last-minute window"
              hint={`${page.fieldHelp.lastMinuteHours} Recommended: ${page.defaults.lastMinuteHours} hours.`}
            >
              <Input
                name="lastMinuteHours"
                type="number"
                inputMode="numeric"
                min={1}
                max={168}
                required
                defaultValue={page.value.lastMinuteHours}
                className="w-40 tabular-nums"
              />
            </Field>
            <Field
              name="hugeCommitLines"
              label="A huge commit"
              hint={`${page.fieldHelp.hugeCommitLines} Recommended: ${page.defaults.hugeCommitLines} lines.`}
            >
              <Input
                name="hugeCommitLines"
                type="number"
                inputMode="numeric"
                min={100}
                max={100000}
                required
                defaultValue={page.value.hugeCommitLines}
                className="w-40 tabular-nums"
              />
            </Field>
            <Field name="messageStopWords" label="Messages that say nothing" hint={page.fieldHelp.messageStopWords}>
              <Textarea
                name="messageStopWords"
                rows={6}
                defaultValue={page.value.messageStopWords.join('\n')}
                className="max-w-xs font-mono text-[0.8125rem]"
              />
            </Field>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

// M06: how the Marks tab and the CE report read a student's results as rising or dropping (07 §3).
function CeTrend({ page }: { page: SettingsPage<'ceTrend'> }) {
  const fields = [
    { name: 'window', label: 'Results looked at', unit: 'results', min: 3, max: 12, step: 1 },
    { name: 'minPoints', label: 'Fewest results for a trend', unit: 'results', min: 2, max: 12, step: 1 },
    { name: 'slopeThreshold', label: 'Change that counts', unit: 'points', min: 0.5, max: 20, step: 0.5 },
  ] as const;
  return (
    <>
      <Header page={page} icon={<PageIcon name="chart" />} />
      <div className="max-w-3xl">
        <Section
          icon={<PageIcon name="chart" className="size-8" />}
          title="When is a student rising or dropping?"
          description={changed(page)}
        >
          <ActionForm
            action={saveSettings}
            submitLabel="Save"
            successMessage="Saved. Marks follow this the next time they are worked out."
          >
            <input type="hidden" name="key" value={page.key} />
            {fields.map((f) => (
              <Field
                key={f.name}
                name={f.name}
                label={f.label}
                hint={`${page.fieldHelp[f.name]} Recommended: ${page.defaults[f.name]}.`}
              >
                <span className="relative block w-40">
                  <Input
                    name={f.name}
                    type="number"
                    inputMode="decimal"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    required
                    defaultValue={page.value[f.name]}
                    className="pr-16 tabular-nums"
                  />
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm">
                    {f.unit}
                  </span>
                </span>
              </Field>
            ))}
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

// M03: when a student counts as present in a class whose attendance is automatic (07 §10).
function Attendance({ page }: { page: SettingsPage<'attendance'> }) {
  const minutes = Math.ceil((60 * page.value.liveThresholdPct) / 100);
  return (
    <>
      <Header page={page} icon={<PageIcon name="attendance" />} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section
          icon={<PageIcon name="attendance" className="size-8" />}
          title="When is a student present?"
          description={changed(page)}
        >
          <ActionForm
            action={saveSettings}
            submitLabel="Save"
            successMessage="Saved. Classes that end from now on follow this rule."
          >
            <input type="hidden" name="key" value={page.key} />
            <Field
              name="liveThresholdPct"
              label="Time in class needed to count as present"
              hint={`${page.fieldHelp.liveThresholdPct} Recommended: ${formatPct(page.defaults.liveThresholdPct)}.`}
            >
              <span className="relative block w-40">
                <Input
                  name="liveThresholdPct"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={100}
                  step="any"
                  required
                  defaultValue={page.value.liveThresholdPct}
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
          icon={<PageIcon name="attendance" className="size-8" />}
          title="For example"
          description="With the value saved now."
        >
          <ul className="text-muted-foreground grid gap-3 text-sm leading-relaxed">
            <li>
              <span className="text-foreground font-medium">A 60-minute class:</span> present after {minutes} minutes in
              the room, counted from when the teacher starts it to when it ends.
            </li>
            <li>
              <span className="text-foreground font-medium">Two tabs or a reconnect:</span> the same minute counts once.
            </li>
            <li>
              <span className="text-foreground font-medium">Classes the teacher marks:</span> not affected; the
              teacher&apos;s marks stand, and anyone left unmarked is recorded absent.
            </li>
          </ul>
        </Section>
      </div>
    </>
  );
}

type Policy = SettingsPage<'evaluation'>['value'];
type Part = [field: keyof Policy, label: string];

// The Examination Policy's parts; their names are fixed and only their marks are settings (07 §2).
const THEORY: Part[] = [
  ['theoryMidTerm1', 'Mid-term I (online)'],
  ['theoryMidTerm2', 'Mid-term II (presentation)'],
  ['theoryAssignment', 'Assignment'],
  ['theoryAttendance', 'Attendance'],
  ['theoryEndSem', 'End-semester examination'],
];
const PRACTICE: Part[] = RUBRICS.practice.map((key) => [key, CRITERION_LABEL[key]]);
const PROJECT_INTERNAL: Part[] = RUBRICS.project.map((key) => [key, CRITERION_LABEL[key]]);
const PROJECT_EXTERNAL: Part[] = [
  ['projectExtRelevance', 'Relevance'],
  ['projectExtReport', 'Report'],
  ['projectExtDefence', 'Defence'],
];
const BANDS = [1, 2, 3, 4] as const;

function Marks({
  page,
  field,
  label,
  suffix,
}: {
  page: SettingsPage<'evaluation'>;
  field: keyof Policy;
  label: string;
  suffix?: string;
}) {
  return (
    <Field name={field} label={label} hint={`Policy: ${page.defaults[field]}${suffix ?? ''}`}>
      <Input
        name={field}
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={0.5}
        required
        defaultValue={page.value[field]}
        className="tabular-nums"
      />
    </Field>
  );
}

function Group({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-1 grid gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground text-sm">{note}</span>
      </legend>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Evaluation({ page }: { page: SettingsPage<'evaluation'> }) {
  const p = page.value;
  const internal = p.theoryMidTerm1 + p.theoryMidTerm2 + p.theoryAssignment + p.theoryAttendance;
  const practice = PRACTICE.reduce((sum, [field]) => sum + p[field], 0);
  const project = [...PROJECT_INTERNAL, ...PROJECT_EXTERNAL].reduce((sum, [field]) => sum + p[field], 0);
  const example = coursePercentage({ theory: 1, practice: 2, project: 2 }, { theory: 87, practice: 89, project: 92 });
  return (
    <>
      <Header page={page} icon={<PageIcon name="evaluation" />} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section
          icon={<PageIcon name="evaluation" className="size-8" />}
          title="Marks of each part"
          description={changed(page)}
        >
          <ActionForm
            action={saveSettings}
            submitLabel="Save policy"
            successMessage="Saved. Offerings created from now on use it."
          >
            <input type="hidden" name="key" value={page.key} />
            <Group
              title="Theory, out of 100"
              note={`Internal ${internal} + end-semester ${p.theoryEndSem} = ${internal + p.theoryEndSem}.`}
            >
              {THEORY.map(([field, label]) => (
                <Marks key={field} page={page} field={field} label={label} />
              ))}
            </Group>
            <Group
              title="Attendance marks"
              note="The attendance part of theory, from the share of classes attended. Below the last band it is 0."
            >
              {BANDS.map((n) => (
                <div key={n} className="col-span-2 grid grid-cols-2 gap-4 sm:col-span-3 sm:grid-cols-3">
                  <Marks page={page} field={`band${n}Pct`} label={`Band ${n}: at least (%)`} suffix=" %" />
                  <Marks page={page} field={`band${n}Marks`} label="Marks" />
                </div>
              ))}
              <Marks page={page} field="attendanceMinPct" label="Minimum attendance (%)" suffix=" %" />
            </Group>
            <Group
              title="Practice rubric, internal 50"
              note={`The external examiner marks the other 50 with the same rubric. Now ${practice} × 2 = ${practice * 2}.`}
            >
              {PRACTICE.map(([field, label]) => (
                <Marks key={field} page={page} field={field} label={label} />
              ))}
            </Group>
            <Group title="Project rubric, internal" note="Marked by the teaching faculty.">
              {PROJECT_INTERNAL.map(([field, label]) => (
                <Marks key={field} page={page} field={field} label={label} />
              ))}
            </Group>
            <Group title="Project rubric, external" note={`Internal and external together: ${project} of 100.`}>
              {PROJECT_EXTERNAL.map(([field, label]) => (
                <Marks key={field} page={page} field={field} label={label} />
              ))}
            </Group>
          </ActionForm>
        </Section>

        <Section
          icon={<PageIcon name="evaluation" className="size-8" />}
          title="How a course mark is calculated"
          description="The policy's own example."
        >
          <div className="grid gap-3 text-sm leading-relaxed">
            <p>
              Each part a course has credits for is marked out of 100. The course percentage is their average weighted
              by the credits, rounded up once.
            </p>
            <p className="bg-muted/50 rounded-md p-4 font-mono text-xs leading-relaxed">
              DECT0901, credits 1-2-2
              <br />
              Theory 87, practice 89, project 92
              <br />
              (87 × 1 + 89 × 2 + 92 × 2) ÷ 5 = 89.8
              <br />
              Rounded up: <span className="font-semibold">{example}</span> → grade O
            </p>
            <p className="text-muted-foreground">
              Each offering keeps the policy as it was when the offering was created, so a change here applies to new
              offerings only.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
