import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, CalculatorIcon, ExamIcon, InfoIcon, VideoIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { saveSettings } from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSettingsPage, type SettingsPage } from '@/lib/data/settings';
import { coursePercentage } from '@/lib/domain/evaluation';
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

// Each settings key has its own form (06 §7): M02's `lessons`, M01b's `evaluation`.
async function Setting({ params }: { params: PageProps<'/admin/settings/[key]'>['params'] }) {
  const key = settingsKey.safeParse((await params).key);
  if (!key.success) notFound();
  return key.data === 'lessons' ? (
    <Lessons page={await getSettingsPage('lessons')} />
  ) : (
    <Evaluation page={await getSettingsPage('evaluation')} />
  );
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
      <Header page={page} icon={<VideoIcon weight="duotone" />} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section icon={<VideoIcon weight="duotone" />} title="When is a video complete?" description={changed(page)}>
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
const PRACTICE: Part[] = [
  ['practiceConcept', 'Concept'],
  ['practicePlanning', 'Planning and execution'],
  ['practiceResult', 'Result and interpretation'],
  ['practiceRecord', 'Record'],
  ['practiceConduct', 'Conduct'],
  ['practiceViva', 'Viva'],
];
const PROJECT_INTERNAL: Part[] = [
  ['projectRelevance', 'Relevance'],
  ['projectLiterature', 'Literature'],
  ['projectMethodology', 'Methodology'],
  ['projectAnalysis', 'Analysis and results'],
  ['projectInterpretation', 'Interpretation'],
  ['projectReport', 'Report'],
];
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
      <Header page={page} icon={<ExamIcon weight="duotone" />} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section icon={<ExamIcon weight="duotone" />} title="Marks of each part" description={changed(page)}>
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
          icon={<CalculatorIcon weight="duotone" />}
          title="How a course mark is calculated"
          description="The policy's own example."
        >
          <div className="grid gap-3 text-sm leading-relaxed">
            <p>
              Each part a course has credits for is marked out of 100. The course percentage is their average weighted
              by the credits, rounded up once.
            </p>
            <p className="bg-muted/50 rounded-xl p-4 font-mono text-xs leading-relaxed">
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
