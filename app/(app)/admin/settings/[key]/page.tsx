import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { saveSettings } from '../actions';
import { ChipInput } from '@/components/chip-input';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { GradeScaleEditor, LanguagesEditor } from '@/components/settings-tables';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getRunnerLanguages, getSettingsPage, type SettingsPage } from '@/lib/data/settings';
import { ATTAINMENT_EXAMPLE, computeOfferingAttainment } from '@/lib/domain/attainment';
import { engagementBand, engagementScore } from '@/lib/domain/engagement';
import { coursePercentage, RUBRICS } from '@/lib/domain/evaluation';
import { gradeFor } from '@/lib/domain/grades';
import { cn } from '@/lib/cn';
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
// `codeRunner` and `proctoring`, M06's `ceTrend`, M07's `projects`, M08's `grading`, M09's `attainment`, M10's
// `engagement`.
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
    case 'grading':
      return <Grading page={await getSettingsPage('grading')} />;
    case 'attainment':
      return <Attainment page={await getSettingsPage('attainment')} />;
    case 'engagement':
      return <Engagement page={await getSettingsPage('engagement')} />;
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
            <LanguagesEditor name="languages" initial={page.value.languages} hint={page.fieldHelp.languages} />
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

// M08 (07 §6, mock-up E6): the grade scale typed a grade a line, the absent grade, and whether the SGPA shows; beside
// them, the policy's example graded by the saved scale.
function Grading({ page }: { page: SettingsPage<'grading'> }) {
  const examples = [
    {
      code: 'DECT0901',
      credits: { theory: 1, practice: 2, project: 2 },
      marks: { theory: 87, practice: 89, project: 92 },
    },
    { code: 'CUTM1535', credits: { theory: 3, practice: 0, project: 1 }, marks: { theory: 74, project: 80 } },
  ];
  return (
    <>
      <Header page={page} icon={<PageIcon name="results" />} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section icon={<PageIcon name="results" className="size-8" />} title="Grades" description={changed(page)}>
          <ActionForm
            action={saveSettings}
            submitLabel="Save"
            successMessage="Saved. Grade sheets worked out from now follow this."
          >
            <input type="hidden" name="key" value={page.key} />
            <GradeScaleEditor
              name="scale"
              initial={page.value.scale}
              recommended={page.defaults.scale}
              hint={page.fieldHelp.scale}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                name="absentGrade"
                label="Grade when absent"
                hint={`${page.fieldHelp.absentGrade} Recommended: ${page.defaults.absentGrade}.`}
              >
                <Input name="absentGrade" required maxLength={4} defaultValue={page.value.absentGrade} />
              </Field>
              <Field
                name="absentPoints"
                label="Points when absent"
                hint={`Recommended: ${page.defaults.absentPoints}.`}
              >
                <Input
                  name="absentPoints"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={10}
                  step={0.5}
                  required
                  defaultValue={page.value.absentPoints}
                  className="tabular-nums"
                />
              </Field>
              <Field name="showSgpa" label="SGPA" hint={page.fieldHelp.showSgpa}>
                <NativeSelect name="showSgpa" defaultValue={page.value.showSgpa ? 'yes' : 'no'}>
                  <NativeSelectOption value="yes">Show it</NativeSelectOption>
                  <NativeSelectOption value="no">Hide it</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
          </ActionForm>
        </Section>
        <Section
          icon={<PageIcon name="results" className="size-8" />}
          title="Worked example"
          description="Graded by the saved scale."
        >
          <ul className="grid gap-2 text-[0.8125rem]">
            {examples.map((example) => {
              const pct = coursePercentage(example.credits, example.marks);
              const grade = pct === null ? null : gradeFor(pct, page.value.scale);
              return (
                <li key={example.code}>
                  {example.code}: {Object.values(example.marks).join(', ')} →{' '}
                  <b>{pct === null ? '—' : formatPct(pct)}</b> →{' '}
                  <b>{grade ? `${grade.grade}, ${grade.points} points` : '—'}</b>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-xs">
            Only O from 90 % is in CUTM’s Examination Policy; the rest is the UGC scale until the university confirms
            it.
          </p>
        </Section>
      </div>
    </>
  );
}

// M09 (07 §4, mock-up A6): when a student attains an outcome, the levels, the weights and the target, and 07 §4's example
// worked out by the saved values.
function Attainment({ page }: { page: SettingsPage<'attainment'> }) {
  const v = page.value;
  const example = computeOfferingAttainment({ ...ATTAINMENT_EXAMPLE, settings: v });
  const n = ATTAINMENT_EXAMPLE.students.length;
  const fieldset = (legend: string, help: string, fields: ReactNode, columns = 'sm:grid-cols-3') => (
    <fieldset className="grid gap-4">
      <legend className="mb-1 grid gap-0.5">
        <span className="font-semibold">{legend}</span>
        <span className="text-muted-foreground text-sm">{help}</span>
      </legend>
      <div className={cn('grid gap-4', columns)}>{fields}</div>
    </fieldset>
  );
  const number = (name: keyof typeof v, label: string, step: number, min: number, max: number, unit = '') => (
    <Field name={name} label={label} hint={`${page.fieldHelp[name]} Recommended: ${page.defaults[name]}${unit}.`}>
      <Input
        name={name}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        required
        defaultValue={v[name]}
        className="tabular-nums"
      />
    </Field>
  );
  return (
    <>
      <Header page={page} icon={<PageIcon name="outcomes" />} />
      <div className="max-w-3xl">
        <Section
          icon={<PageIcon name="outcomes" className="size-8" />}
          title="How attainment is worked out"
          description={`${changed(page)} A proposal until the university confirms it.`}
        >
          <ActionForm
            action={saveSettings}
            submitLabel="Save"
            successMessage="Saved. Attainment worked out from now follows this; each course shows the settings it used."
          >
            <input type="hidden" name="key" value={page.key} />
            {fieldset(
              'When a student attains an outcome',
              'On the questions tagged with the outcome (CIE), and on the end-semester marks weighted by credits (SEE).',
              number('targetPct', 'Score needed (%)', 1, 1, 100, ' %'),
            )}
            {fieldset(
              'Levels',
              'The share of students who attain an outcome gives its level.',
              <>
                {number('level3Pct', 'Level 3 from (%)', 1, 0, 100, ' %')}
                {number('level2Pct', 'Level 2 from (%)', 1, 0, 100, ' %')}
                {number('level1Pct', 'Level 1 from (%)', 1, 0, 100, ' %')}
              </>,
            )}
            {fieldset(
              'Weights and target',
              'Attainment = CIE weight × CIE level + SEE weight × SEE level; the two weights add up to 1.',
              <>
                {number('cieWeight', 'CIE weight', 0.05, 0, 1)}
                {number('seeWeight', 'SEE weight', 0.05, 0, 1)}
                {number('defaultTargetLevel', 'Target level', 0.1, 0, 3)}
              </>,
            )}
            <div className="ring-border/70 grid content-start gap-1.5 rounded-md p-3 text-[0.8125rem] ring-1">
              <p className="font-semibold">Worked example, with the saved settings</p>
              <p>
                {n} students, four questions, end-semester marks out of 50. SEE: {example.see?.attained} of {n} reach{' '}
                {v.targetPct} % → {example.see ? formatPct(example.see.pct) : '—'} → level <b>{example.see?.level}</b>.
              </p>
              <ul className="grid gap-0.5">
                {example.cos.map((co) => (
                  <li key={co.coId}>
                    {co.code}: {co.cie?.attained} of {co.cie?.assessed} → {co.cie ? formatPct(co.cie.pct) : '—'} → level{' '}
                    {co.cie?.level}; {v.cieWeight} × {co.cie?.level} + {v.seeWeight} × {example.see?.level} ={' '}
                    <b>{co.value}</b>, {co.met ? 'met' : 'not met'}.
                  </li>
                ))}
              </ul>
              <p>
                Then{' '}
                {example.outcomes
                  .filter((o) => o.value !== null)
                  .map((o) => `${o.code} ${o.value}`)
                  .join(', ')}
                ; the other outcomes have nothing mapped to them.
              </p>
            </div>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

// M10 (07 §7): the window, each signal's weight, the bands and the trend's change; then 07 §7's two examples worked
// out with the saved values.
function Engagement({ page }: { page: SettingsPage<'engagement'> }) {
  const v = page.value;
  const signals = { attendance: 0.75, video: 0.6, timeliness: 0.75, practice: 0.75, activity: 0.5 };
  const examples = [
    { label: 'Every signal', signals },
    { label: 'No live classes yet', signals: { ...signals, attendance: null } },
  ].map((e) => {
    const score = engagementScore(e.signals, v);
    return { ...e, score, band: engagementBand(score, v) };
  });
  const number = (name: keyof typeof v, label: string, min: number, max: number, unit: string) => (
    <Field name={name} label={label} hint={`${page.fieldHelp[name]} Recommended: ${page.defaults[name]} ${unit}.`}>
      <Input
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        required
        defaultValue={v[name]}
        className="tabular-nums"
      />
    </Field>
  );
  const group = (legend: string, help: string, fields: ReactNode) => (
    <fieldset className="grid gap-4">
      <legend className="mb-1 grid gap-0.5">
        <span className="font-semibold">{legend}</span>
        <span className="text-muted-foreground text-sm">{help}</span>
      </legend>
      <div className="grid gap-4 sm:grid-cols-3">{fields}</div>
    </fieldset>
  );
  return (
    <>
      <Header page={page} icon={<PageIcon name="people" />} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section
          icon={<PageIcon name="people" className="size-8" />}
          title="How engagement is worked out"
          description={`${changed(page)} A proposal until the university confirms it.`}
        >
          <ActionForm
            action={saveSettings}
            submitLabel="Save"
            successMessage="Saved. Scores follow this from the next nightly run, or when a teacher works them out again."
          >
            <input type="hidden" name="key" value={page.key} />
            {group(
              'Days looked at',
              'Only what a student did in these days counts, except videos, which count since the course began.',
              number('windowDays', 'Window', 7, 90, 'days'),
            )}
            {group(
              'Weights',
              'How much each signal counts. A signal that does not apply yet, such as attendance before the first live class, is left out and the others share its weight.',
              <>
                {number('attendanceWeight', 'Live attendance', 0, 100, 'points')}
                {number('videoWeight', 'Videos watched', 0, 100, 'points')}
                {number('timelinessWeight', 'On-time work', 0, 100, 'points')}
                {number('practiceWeight', 'Practice', 0, 100, 'points')}
                {number('activityWeight', 'Active days', 0, 100, 'points')}
              </>,
            )}
            {group(
              'Bands and trend',
              'The score is out of 100.',
              <>
                {number('highBand', 'High from', 1, 100, 'points')}
                {number('mediumBand', 'Medium from', 1, 100, 'points')}
                {number('trendDelta', 'Change that counts', 1, 50, 'points')}
              </>,
            )}
          </ActionForm>
        </Section>
        <Section
          icon={<PageIcon name="people" className="size-8" />}
          title="Worked example"
          description="With the values saved now."
        >
          <p className="text-muted-foreground text-[0.8125rem]">
            6 of 8 live classes, 60 % of the videos, 3 of 4 assessments on time, 12 practice runs where the class’s most
            active do 16, and 10 active days where they do 20.
          </p>
          <ul className="grid gap-2 text-[0.8125rem]">
            {examples.map((e) => (
              <li key={e.label}>
                {e.label}: <b>{e.score ?? '—'}</b>
                {e.band && `, ${e.band}`}
              </li>
            ))}
          </ul>
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
            <ChipInput
              name="messageStopWords"
              label="Messages that say nothing"
              kind="phrase"
              initial={page.value.messageStopWords}
              max={50}
              maxLength={40}
              placeholder="Add a message"
              hint={page.fieldHelp.messageStopWords}
            />
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
      <Header page={page} icon={<PageIcon name="marks" />} />
      <div className="max-w-3xl">
        <Section
          icon={<PageIcon name="marks" className="size-8" />}
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
