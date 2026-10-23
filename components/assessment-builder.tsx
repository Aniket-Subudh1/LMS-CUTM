import Link from 'next/link';
import Form from 'next/form';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  DatabaseIcon,
  EnvelopeSimpleIcon,
  LockIcon,
  LockSimpleIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  PowerIcon,
  PulseIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react/ssr';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  addFromBank,
  deleteItem,
  deleteSection,
  publishAssessment,
  reorderItems,
  reorderSections,
  saveInstructions,
  saveItem,
  saveProctoring,
  saveResultRules,
  saveSection,
  setExtraTime,
  updateAssessmentSettings,
} from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { copyToBank } from '@/app/(app)/tests/bank/actions';
import { createLink, deleteLink, inviteToTest, setLinkActive } from '@/app/(app)/tests/actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { ModeChip, STATE_LABEL } from '@/components/assessment-lists';
import { BloomChip } from '@/components/bloom-chip';
import { CopyButton } from '@/components/copy-button';
import { FormDialog } from '@/components/form-dialog';
import { CountsTowardField, istLocal } from '@/components/new-assessment-dialog';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { QuestionDialog, TYPE_ICON } from '@/components/question-dialog';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RichTextView } from '@/components/rich-text-view';
import { RowMenu } from '@/components/row-menu';
import { Section } from '@/components/section';
import { SortableList } from '@/components/sortable-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { getBuilder, type Builder, type BuilderSection, type TeacherItem } from '@/lib/data/assessments';
import { pickFromBank, type BankRow } from '@/lib/data/bank';
import { listLinks, type ShareLink } from '@/lib/data/test-links';
import { PAPERS_CAP } from '@/lib/domain/papers';
import { plainText } from '@/lib/domain/rich-text';
import { formatDateTime, formatDuration, ITEM_LABEL, ordinal, PART_LABEL, statusTone } from '@/lib/format';
import {
  ASSESSMENT_LIMITS,
  MODE_ITEM_TYPES,
  PROCTOR_LIMITS,
  RELEASE_RULES,
  RESULT_LIMITS,
} from '@/lib/schemas/assessment';
import type { RichTextDoc } from '@/lib/schemas/common';
import { TEST_LIMITS } from '@/lib/schemas/tests';

const plain = (doc: RichTextDoc | null) => plainText(doc) || 'Untitled question';

const Search = z.object({
  new: z.string().max(40).optional().catch(undefined),
  // The "Add from the bank" dialog's own search (TP-05).
  bq: z.string().trim().max(80).optional().catch(undefined),
  btopic: z.string().trim().max(60).optional().catch(undefined),
});

// T4 ("Builder A", M04 decision 3): questions are rows, each edited in its own dialog; Settings and Instructions beside
// them; a readiness strip above Publish. A head of department reads it with no controls. Shared by a course's
// assessments and standalone tests (M04b), so the route's course must be the assessment's own.
export async function AssessmentBuilder({
  params,
  searchParams,
}: {
  params: Promise<{ offeringId?: string; aid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { offeringId, aid } = await params;
  const { new: open, bq, btopic } = Search.parse(await searchParams);
  const b = await getBuilder(aid);
  if (b.offeringId !== (offeringId ?? null)) notFound();
  const a = b.assessment;
  const base = `${b.path}/edit`;
  const here = (name: string) => `${base}?new=${name}`;
  const editQuestions = b.canEdit && !b.locked;
  const ref = <input type="hidden" name="assessmentId" value={aid} />;
  const course = b.offeringId !== null;
  const links = b.canEdit ? await listLinks(aid) : [];
  const qr = await Promise.all(links.map((link) => QRCode.toString(link.url, { type: 'svg', margin: 1 })));
  const inviting = open?.startsWith('invite-') ? links.find((link) => link.id === open.slice(7)) : undefined;
  const editing = open?.startsWith('item-') ? open.slice(5) : undefined;
  const editItem = a.items.find((item) => item.id === editing);
  const newType = MODE_ITEM_TYPES[a.mode].find((type) => type === editing);
  const editingSection = open?.startsWith('section-') ? b.sections.find((s) => s.id === open.slice(8)) : undefined;
  const picking =
    editQuestions && open === 'bank'
      ? await pickFromBank(b.offeringId, MODE_ITEM_TYPES[a.mode], { q: bq, topic: btopic })
      : null;
  const sectionTitle = new Map(b.sections.map((section) => [section.id, section.title]));

  const rows = a.items.map((item, i) => ({
    id: item.id,
    label: `Question ${i + 1}`,
    node: (
      <QuestionRow
        key={item.id}
        item={item}
        n={i + 1}
        b={b}
        editable={editQuestions}
        here={here}
        section={item.sectionId ? (sectionTitle.get(item.sectionId) ?? null) : null}
      />
    ),
  }));
  const checks = [
    {
      ok: a.questions > 0,
      text:
        a.questions > 0
          ? `${a.questions} question${a.questions === 1 ? '' : 's'} · ${a.maxMarks} marks`
          : 'No questions yet',
    },
    // TP-05: every section's draw must be possible from the bank.
    ...b.bank.shortfalls.map((text) => ({ ok: false, text })),
    ...(b.credit
      ? [
          {
            ok: b.missingCos.length === 0,
            text:
              b.missingCos.length === 0
                ? 'Every question has a course outcome'
                : `Question${b.missingCos.length === 1 ? '' : 's'} ${b.missingCos.join(', ')} ${b.missingCos.length === 1 ? 'has' : 'have'} no outcome`,
          },
        ]
      : []),
    { ok: true, text: `Opens ${formatDateTime(a.opensAt)}` },
  ];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={b.offeringId ? `/courses/${b.offeringId}/assessments` : '/tests'}>
          <ArrowLeftIcon /> {course ? 'All assessments' : 'All tests'}
        </Link>
      </Button>
      <section className="surface mb-4 grid gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1.5">
            <ModeChip mode={a.mode} />
            <h1 className="text-[1.0625rem] font-semibold tracking-tight text-balance">{a.title}</h1>
            <p className="text-muted-foreground text-[0.8125rem]">
              Opens {formatDateTime(a.opensAt)} · closes {formatDateTime(a.closesAt)} ·{' '}
              {a.durationMin ? formatDuration(a.durationMin * 60) : 'no time limit'} · {a.attemptsAllowed} attempt
              {a.attemptsAllowed === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={statusTone(a.state)}>{STATE_LABEL[a.state]}</Badge>
            {a.status !== 'draft' && (
              <Button asChild variant="outline" size="sm">
                <Link href={`${b.path}/monitor`}>
                  <PulseIcon /> Live monitor
                  {b.counts.inProgress > 0 && (
                    <span className="text-success tabular-nums">· {b.counts.inProgress} writing</span>
                  )}
                </Link>
              </Button>
            )}
            {a.status !== 'draft' && (
              <Button asChild variant="outline" size="sm">
                <Link href={`${b.path}/results`}>
                  <PageIcon name="chart" className="size-4" /> Results
                </Link>
              </Button>
            )}
            {a.status !== 'draft' && (
              <Button asChild variant="outline" size="sm">
                <Link href={`${b.path}/grade`}>
                  <CheckSquareIcon /> Hand-ins
                  {b.counts.toGrade > 0 && (
                    <span className="text-warning tabular-nums">· {b.counts.toGrade} to grade</span>
                  )}
                </Link>
              </Button>
            )}
            {b.canEdit && a.status === 'draft' && (
              <ActionForm
                action={publishAssessment}
                submitLabel="Publish"
                submitSize="sm"
                submitIcon={<PaperPlaneTiltIcon />}
                confirm={{
                  title: `Publish “${a.title}”?`,
                  message: course
                    ? `Enrolled students are told now and can start it from ${formatDateTime(a.opensAt)}.`
                    : `People with one of its links can start it from ${formatDateTime(a.opensAt)}.`,
                }}
              >
                {ref}
              </ActionForm>
            )}
          </div>
        </div>
        {a.status === 'draft' && (
          <ul className="grid gap-2 border-t pt-4 text-[0.8125rem] sm:grid-cols-3">
            {checks.map((check) => (
              <li
                key={check.text}
                className={check.ok ? 'flex items-center gap-2' : 'text-warning flex items-center gap-2 font-medium'}
              >
                {check.ok ? (
                  <CheckCircleIcon weight="fill" className="text-success size-4" />
                ) : (
                  <WarningIcon weight="fill" className="size-4" />
                )}
                {check.text}
              </li>
            ))}
          </ul>
        )}
        {b.locked && (
          <p className="text-muted-foreground bg-muted/60 flex items-center gap-2 rounded-md px-3 py-2 text-[0.8125rem]">
            <LockIcon className="size-4 shrink-0" />
            {course ? 'Students' : 'People'} have started, so the questions are fixed. You can still change the title,
            instructions and dates.
          </p>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-4">
          <Sections b={b} editable={editQuestions} here={here} />
          <Section
            icon={<PageIcon name="evaluation" className="size-8" />}
            title="Questions"
            description={
              !course
                ? 'Drag to reorder.'
                : b.credit
                  ? 'Drag to reorder. Each question needs at least one course outcome.'
                  : 'Drag to reorder. Course outcomes are optional on a non-credit course.'
            }
          >
            {a.items.length === 0 && !editQuestions ? (
              <p className="text-muted-foreground text-[0.8125rem]">No questions yet.</p>
            ) : editQuestions && a.items.length > 0 ? (
              <SortableList items={rows} action={reorderItems} fields={{ assessmentId: aid }} noun="question" />
            ) : (
              <ol className="grid gap-2">
                {rows.map((row) => (
                  <li key={row.id}>{row.node}</li>
                ))}
              </ol>
            )}
            {editQuestions && a.items.length < ASSESSMENT_LIMITS.items && (
              <div className="grid gap-2 rounded-md border border-dashed p-3">
                <p className="text-muted-foreground flex items-center gap-2 text-[0.8125rem]">
                  <PlusIcon className="size-4" /> Add a question
                </p>
                <div className="flex flex-wrap gap-2">
                  {MODE_ITEM_TYPES[a.mode].map((type) => (
                    <Button key={type} asChild variant="outline" size="sm">
                      <Link href={here(`item-${type}`)} scroll={false}>
                        <PageIcon name={TYPE_ICON[type]} className="size-4" /> {ITEM_LABEL[type]}
                      </Link>
                    </Button>
                  ))}
                  <Button asChild variant="secondary" size="sm">
                    <Link href={here('bank')} scroll={false}>
                      <PageIcon name="bank" className="size-4" /> From the bank
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className="grid gap-4">
          <Section
            icon={<PageIcon name="settings" className="size-8" />}
            title="Settings"
            description="When it runs and how it is attempted."
            action={
              b.canEdit && (
                <Button asChild variant="outline" size="sm">
                  <Link href={here('settings')} scroll={false}>
                    <PencilSimpleIcon /> Edit
                  </Link>
                </Button>
              )
            }
          >
            <dl className="grid gap-2 text-[0.8125rem]">
              {[
                ...(b.theory ? [['Counts toward', a.countsToward ? PART_LABEL[a.countsToward] : 'Not counted']] : []),
                ['Opens', formatDateTime(a.opensAt)],
                ['Closes', formatDateTime(a.closesAt)],
                ['Late hand-ins', a.lateUntil ? `Until ${formatDateTime(a.lateUntil)}` : 'Not allowed'],
                ['Time limit', a.durationMin ? formatDuration(a.durationMin * 60) : 'None'],
                ['Attempts', a.attemptsAllowed === 1 ? '1' : `${a.attemptsAllowed} · ${a.attemptPolicy} counts`],
                [
                  'Shuffle',
                  a.shuffleItems && a.shuffleOptions
                    ? 'Questions and options'
                    : a.shuffleItems
                      ? 'Questions'
                      : a.shuffleOptions
                        ? 'Options'
                        : 'No',
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="border-border/70 flex justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>
          <Proctoring b={b} here={here} />
          <ResultRules b={b} here={here} />
          {b.canEdit && (
            <ShareLinks links={links} qr={qr} here={here} aid={aid} draft={a.status === 'draft'} course={course} />
          )}
          {b.canEdit && <ExtraTime b={b} />}
          <Section
            icon={<PageIcon name="plan" className="size-8" />}
            title="Instructions"
            description={course ? 'Shown to students before they start.' : 'Shown to everyone before they start.'}
            action={
              b.canEdit && (
                <Button asChild variant="outline" size="sm">
                  <Link href={here('instructions')} scroll={false}>
                    <PencilSimpleIcon /> Edit
                  </Link>
                </Button>
              )
            }
          >
            {a.instructions ? (
              <RichTextView doc={a.instructions} />
            ) : (
              <p className="text-muted-foreground text-[0.8125rem]">No instructions yet.</p>
            )}
          </Section>
        </div>
      </div>

      {b.canEdit && open === 'settings' && <SettingsDialog key={open} b={b} />}
      {editQuestions && open === 'proctoring' && <ProctoringDialog key={open} b={b} />}
      {b.canEdit && open === 'results' && <ResultRulesDialog key={open} b={b} />}
      {b.canEdit && open === 'instructions' && (
        <FormDialog
          key={open}
          openParam="instructions"
          icon={<PageIcon name="plan" className="size-8" />}
          title="Instructions"
          description="What students read before they start: what to bring, how long it takes, how it is marked."
          action={saveInstructions}
          submitLabel="Save"
          successMessage="Instructions saved."
        >
          {ref}
          <RichTextEditor name="instructions" initial={a.instructions} placeholder="Answer all questions…" />
          <FieldErrors name="instructions" />
        </FormDialog>
      )}
      {b.canEdit && open === 'link' && <NewLinkDialog aid={aid} course={course} />}
      {b.canEdit && inviting && <InviteDialog key={open} aid={aid} link={inviting} openParam={open ?? ''} />}
      {editQuestions && open && (editItem || newType) && (
        <QuestionDialog
          key={open}
          openParam={open}
          title={`Question ${editItem ? a.items.indexOf(editItem) + 1 : a.items.length + 1} · ${ITEM_LABEL[editItem?.type ?? newType ?? 'text']}`}
          type={editItem?.type ?? newType ?? 'text'}
          item={editItem}
          action={saveItem}
          hidden={
            <>
              {ref}
              {editItem && <input type="hidden" name="itemId" value={editItem.id} />}
            </>
          }
          cos={course ? b.cos : null}
          credit={b.credit}
          sections={b.sections}
          languages={b.languages}
        />
      )}
      {editQuestions && (open === 'section' || editingSection) && (
        <SectionDialog key={open} b={b} section={editingSection} openParam={open ?? 'section'} />
      )}
      {picking && <BankPicker key={`${bq}-${btopic}`} b={b} rows={picking} base={base} bq={bq} />}
    </>
  );
}

function QuestionRow({
  item,
  n,
  b,
  editable,
  here,
  section,
}: {
  item: TeacherItem;
  n: number;
  b: Builder;
  editable: boolean;
  here: (name: string) => string;
  section: string | null;
}) {
  const codes = item.coIds.flatMap((id) => b.cos.find((co) => co.id === id)?.code ?? []);
  const how =
    item.type === 'text' || item.type === 'file'
      ? item.rubric
        ? `Rubric · ${item.rubric.length} criteria`
        : item.type === 'file'
          ? 'Photo or PDF · you mark it'
          : 'You mark it'
      : item.key && 'tolerance' in item.key
        ? `Marked automatically · ±${item.key.tolerance}`
        : 'Marked automatically';
  return (
    <div className="flex min-w-0 items-center gap-3 py-1">
      <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold tabular-nums">
        {n}
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="truncate text-[0.8125rem] font-medium">{plain(item.prompt)}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="bg-muted rounded-sm px-1.5 py-px text-[0.6875rem] font-medium">{ITEM_LABEL[item.type]}</span>
          {codes.map((code) => (
            <span
              key={code}
              className="bg-primary/8 text-primary ring-primary/15 rounded-sm px-1.5 py-px text-[0.6875rem] font-medium ring-1"
            >
              {code}
            </span>
          ))}
          {b.credit && codes.length === 0 && (
            <span className="bg-warning/10 text-warning inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[0.6875rem] font-medium">
              <WarningIcon className="size-3" /> No outcome
            </span>
          )}
          {item.bloomLevel && <BloomChip level={item.bloomLevel} />}
          {section && <span className="text-muted-foreground text-xs">{section} ·</span>}
          <span className="text-muted-foreground text-xs">{how}</span>
        </div>
      </div>
      <span className="text-[0.8125rem] font-medium whitespace-nowrap tabular-nums">
        {item.maxMarks} mark{item.maxMarks === 1 ? '' : 's'}
      </span>
      {b.canEdit && (
        <RowMenu
          label={`Question ${n}`}
          move={{
            id: item.id,
            ids: b.assessment.items.map((i) => i.id),
            action: reorderItems,
            fields: { assessmentId: b.assessment.id },
          }}
          items={[
            ...(editable
              ? ([
                  { kind: 'link', label: 'Edit', href: here(`item-${item.id}`), icon: <PencilSimpleIcon /> },
                  { kind: 'moves' },
                ] as const)
              : []),
            {
              kind: 'action',
              label: 'Save to the bank',
              icon: <DatabaseIcon />,
              action: copyToBank,
              fields: { assessmentId: b.assessment.id, 'itemIds[]': [item.id] },
            },
            ...(editable
              ? ([
                  { kind: 'separator' },
                  {
                    kind: 'action',
                    label: 'Delete',
                    icon: <TrashIcon />,
                    destructive: true,
                    action: deleteItem,
                    fields: { assessmentId: b.assessment.id, itemId: item.id },
                    confirm: {
                      title: `Delete question ${n}?`,
                      message: 'Its marks come off the assessment’s total.',
                      confirmLabel: 'Delete',
                      destructive: true,
                    },
                  },
                ] as const)
              : []),
          ]}
        />
      )}
    </div>
  );
}

function SettingsDialog({ b }: { b: Builder }) {
  const a = b.assessment;
  // Once students have started only the title and dates change (05 §5.1); the rest is shown, disabled.
  const fixed = b.locked;
  return (
    <FormDialog
      openParam="settings"
      size="wide"
      icon={<PageIcon name="settings" className="size-8" />}
      title="Settings"
      description={
        fixed
          ? `Students have started, so only the title, the dates${b.theory ? ' and what it counts toward' : ''} can change.`
          : 'Times are Indian Standard Time. A time limit runs from when each student starts.'
      }
      action={updateAssessmentSettings}
      submitLabel="Save settings"
      successMessage="Settings saved."
    >
      <input type="hidden" name="assessmentId" value={a.id} />
      <Field name="title" label="Title">
        <Input name="title" required minLength={3} maxLength={160} defaultValue={a.title} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field name="opensAt" label="Opens">
          <Input name="opensAt" type="datetime-local" required defaultValue={istLocal(a.opensAt)} />
        </Field>
        <Field name="closesAt" label="Closes">
          <Input name="closesAt" type="datetime-local" required defaultValue={istLocal(a.closesAt)} />
        </Field>
        <Field name="lateUntil" label="Late hand-ins until" hint="Leave empty for none. Late hand-ins are flagged.">
          <Input name="lateUntil" type="datetime-local" defaultValue={a.lateUntil ? istLocal(a.lateUntil) : ''} />
        </Field>
      </div>
      {b.theory && <CountsTowardField value={a.countsToward} />}
      <fieldset disabled={fixed} className="grid gap-5 disabled:opacity-60">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field name="durationMin" label="Time limit (minutes)" hint="Leave empty for no limit.">
            <Input name="durationMin" type="number" min={1} max={600} defaultValue={a.durationMin ?? ''} />
          </Field>
          <Field name="attemptsAllowed" label="Attempts">
            <NativeSelect name="attemptsAllowed" defaultValue={String(a.attemptsAllowed)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {n}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field name="attemptPolicy" label="With several attempts, count">
            <NativeSelect name="attemptPolicy" defaultValue={a.attemptPolicy}>
              <NativeSelectOption value="best">The best one</NativeSelectOption>
              <NativeSelectOption value="last">The last one</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        <div className="grid gap-2 text-[0.8125rem]">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              name="shuffleItems"
              defaultChecked={a.shuffleItems}
              className="accent-foreground size-4"
            />
            Shuffle the questions for each student
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              name="shuffleOptions"
              defaultChecked={a.shuffleOptions}
              className="accent-foreground size-4"
            />
            Shuffle the options of each question
          </label>
        </div>
      </fieldset>
    </FormDialog>
  );
}

const RELEASE: Record<Builder['results']['release'], { label: string; hint: string }> = {
  manual: { label: 'By hand', hint: 'You publish them once it closes and every hand-in is marked.' },
  on_close: {
    label: 'By themselves once it closes',
    hint: 'Published within the hour after it closes, once nobody is writing and every hand-in is marked.',
  },
  instant: {
    label: 'Each person’s at once',
    hint: 'Each person sees their marks as soon as their attempt is marked; ranks wait for the published results.',
  },
};

// TP-11: when the results go out and what they show. They change no mark, so they can change at any time.
function ResultRules({ b, here }: { b: Builder; here: (name: string) => string }) {
  const r = b.results;
  const rows: [string, string][] = [
    ['Released', RELEASE[r.release].label],
    [
      'Shows',
      r.showAnswers && r.showExplanations
        ? 'Marks, answers and explanations'
        : r.showAnswers
          ? 'Marks and the right answers'
          : r.showExplanations
            ? 'Marks and explanations'
            : 'Marks only',
    ],
    ['Leaderboard', r.leaderboard ? `The first ${RESULT_LIMITS.leaderboard}` : 'Off'],
    ['Bands', r.bands.length > 0 ? r.bands.map((band) => `${band.label} ${band.minPct} %+`).join(' · ') : 'None'],
    ['Certificates', r.certificateFromPct === null ? 'None' : `From ${r.certificateFromPct} %`],
  ];
  return (
    <Section
      icon={<PageIcon name="chart" className="size-8" />}
      title="Results"
      description="When they go out and what people see."
      action={
        b.canEdit && (
          <Button asChild variant="outline" size="sm">
            <Link href={here('results')} scroll={false}>
              <PencilSimpleIcon /> Edit
            </Link>
          </Button>
        )
      }
    >
      <dl className="grid gap-2 text-[0.8125rem]">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="border-border/70 flex justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function ResultRulesDialog({ b }: { b: Builder }) {
  const r = b.results;
  const check = (name: string, label: string, on: boolean) => (
    <label className="flex items-center gap-2.5 text-[0.8125rem]">
      <input type="checkbox" name={name} value="true" defaultChecked={on} className="accent-foreground size-4" />
      {label}
    </label>
  );
  return (
    <FormDialog
      openParam="results"
      size="wide"
      icon={<PageIcon name="chart" className="size-8" />}
      title="Results"
      description="None of this changes a mark. Ranks and the leaderboard appear once the results are published."
      action={saveResultRules}
      submitLabel="Save"
      successMessage="Results settings saved."
    >
      <input type="hidden" name="assessmentId" value={b.assessment.id} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Released</legend>
        {RELEASE_RULES.map((rule) => (
          <label key={rule} className="flex items-start gap-2.5 text-[0.8125rem]">
            <input
              type="radio"
              name="release"
              value={rule}
              defaultChecked={r.release === rule}
              className="accent-foreground mt-0.5 size-4 shrink-0"
            />
            <span className="grid gap-0.5">
              <b className="font-medium">{RELEASE[rule].label}</b>
              <span className="text-muted-foreground text-xs">{RELEASE[rule].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="grid gap-2 border-t pt-4">
        <legend className="mb-1 text-sm font-medium">With the marks, show</legend>
        {check('showAnswers', 'The right answers', r.showAnswers)}
        {check('showExplanations', 'The explanations', r.showExplanations)}
        {check('leaderboard', `A leaderboard of the first ${RESULT_LIMITS.leaderboard}, by name`, r.leaderboard)}
      </fieldset>
      <fieldset className="grid gap-2 border-t pt-4">
        <legend className="mb-1 text-sm font-medium">Bands (optional)</legend>
        <p className="text-muted-foreground text-xs">
          A name for each score from a percentage up, such as Recommended from 75 % and Waitlist from 60 %. Each person
          sees the highest band they reach.
        </p>
        {Array.from({ length: RESULT_LIMITS.bands }, (_, row) => (
          <div key={row} className="grid grid-cols-[1fr_7rem] gap-3">
            <Input
              name="bandLabel[]"
              defaultValue={r.bands[row]?.label ?? ''}
              maxLength={RESULT_LIMITS.bandLabel}
              placeholder={row === 0 ? 'Recommended' : `Band ${row + 1}`}
              aria-label={`Band ${row + 1} name`}
            />
            <Input
              name="bandMin[]"
              type="number"
              min={0}
              max={100}
              step="any"
              defaultValue={r.bands[row]?.minPct ?? ''}
              placeholder="From %"
              aria-label={`Band ${row + 1} from percent`}
            />
          </div>
        ))}
        <FieldErrors name="bandLabel[]" />
      </fieldset>
      <fieldset className="grid gap-2 border-t pt-4">
        <legend className="mb-1 text-sm font-medium">Certificates (optional)</legend>
        <p className="text-muted-foreground text-xs">
          Everyone whose result reaches this percentage can download a certificate, with a code anyone can check on the
          LMS. Leave it empty for no certificates.
        </p>
        <Input
          name="certificateFrom"
          type="number"
          min={0}
          max={100}
          step="any"
          defaultValue={r.certificateFromPct ?? ''}
          placeholder="From %"
          aria-label="Certificates from percent"
          className="w-28"
        />
        <FieldErrors name="certificateFrom" />
      </fieldset>
    </FormDialog>
  );
}

// TP-08: how the test is proctored. Like the other settings it is fixed once anyone has started.
function Proctoring({ b, here }: { b: Builder; here: (name: string) => string }) {
  const p = b.proctoring;
  const rows: [string, string][] = p
    ? [
        ['Full screen', p.fullscreen ? 'Required' : 'Not required'],
        ['Camera snapshots', p.camera ? `Every ${p.snapshotEverySec} s` : 'Off'],
        ['Copy, paste, right-click', p.blockCopy ? 'Blocked' : 'Allowed, and recorded'],
        ['Serious warnings', p.hardLimit > 0 ? `Handed in at the ${ordinal(p.hardLimit)}` : 'Recorded only'],
        ['Penalty', p.penaltyEach > 0 ? `${p.penaltyEach} mark${p.penaltyEach === 1 ? '' : 's'} each` : 'None'],
      ]
    : [];
  return (
    <Section
      icon={<PageIcon name="signin" className="size-8" />}
      title="Proctoring"
      description={
        p
          ? 'Leaving the page, a second tab or device and lost connections are recorded.'
          : 'Off: nothing is watched while people write.'
      }
      action={
        b.canEdit &&
        !b.locked && (
          <Button asChild variant="outline" size="sm">
            <Link href={here('proctoring')} scroll={false}>
              <PencilSimpleIcon /> {p ? 'Edit' : 'Turn on'}
            </Link>
          </Button>
        )
      }
    >
      {p && (
        <dl className="grid gap-2 text-[0.8125rem]">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="border-border/70 flex justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
}

function ProctoringDialog({ b }: { b: Builder }) {
  const p = b.proctoring;
  const check = (name: string, label: string, hint: string, on: boolean) => (
    <label className="flex items-start gap-2.5 text-[0.8125rem]">
      <input type="checkbox" name={name} defaultChecked={on} className="accent-foreground mt-0.5 size-4 shrink-0" />
      <span className="grid gap-0.5">
        <b className="font-medium">{label}</b>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
    </label>
  );
  return (
    <FormDialog
      openParam="proctoring"
      size="wide"
      icon={<PageIcon name="signin" className="size-8" />}
      title="Proctoring"
      description="Everyone sees exactly what is watched before they start. Nothing here can change once someone has started."
      action={saveProctoring}
      submitLabel="Save"
      successMessage="Proctoring saved."
    >
      <input type="hidden" name="assessmentId" value={b.assessment.id} />
      {check(
        'enabled',
        'Proctor this test',
        'Records leaving the page, opening it in a second tab or on another device, and lost connections.',
        p !== null,
      )}
      <div className="grid gap-4 border-t pt-4">
        {check(
          'fullscreen',
          'Require full screen',
          'The test waits in full screen; leaving it is a serious warning. Phones that cannot go full screen cannot take it.',
          p?.fullscreen ?? true,
        )}
        {check(
          'blockCopy',
          'Block copy, paste and right-click',
          'Tries are recorded as minor warnings, as are printing and opening developer tools.',
          p?.blockCopy ?? true,
        )}
        {check(
          'camera',
          'Take camera snapshots',
          'A still picture now and then, no video or sound. Only the test’s staff see them; they are deleted some time after results.',
          p?.camera ?? false,
        )}
        <div className="grid gap-5 sm:grid-cols-3">
          <Field name="snapshotEverySec" label="One snapshot every (seconds)">
            <Input
              name="snapshotEverySec"
              type="number"
              min={30}
              max={600}
              required
              defaultValue={p?.snapshotEverySec ?? 60}
            />
          </Field>
          <Field
            name="hardLimit"
            label="Hand in at serious warning"
            hint="0 only records them. Serious: leaving full screen or the page, a second tab or device."
          >
            <Input
              name="hardLimit"
              type="number"
              min={0}
              max={PROCTOR_LIMITS.hardLimit}
              required
              defaultValue={p?.hardLimit ?? 3}
            />
          </Field>
          <Field name="penaltyEach" label="Marks off per serious warning" hint="0 for none. A grader can waive it.">
            <Input
              name="penaltyEach"
              type="number"
              min={0}
              max={1000}
              step={0.01}
              required
              defaultValue={p?.penaltyEach ?? 0}
            />
          </Field>
        </div>
      </div>
    </FormDialog>
  );
}

// TP-05, TP-06 (mock-up "Sections and papers"): each section's rules as chips with its ⋮, and how many different
// papers the bank can make — or what it is short of.
function Sections({ b, editable, here }: { b: Builder; editable: boolean; here: (name: string) => string }) {
  if (b.sections.length === 0 && !editable) return null;
  const codeOf = new Map(b.cos.map((co) => [co.id, co.code]));
  const chip = 'bg-muted rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-medium';
  return (
    <Section
      icon={<PageIcon name="lessons" className="size-8" />}
      title="Sections and papers"
      description={
        b.sections.length === 0
          ? 'Split the test into parts with their own time and order, or draw questions from the bank for each person.'
          : 'Each person gets their own paper by these rules.'
      }
      action={
        editable &&
        b.sections.length < ASSESSMENT_LIMITS.sections && (
          <Button asChild variant="outline" size="sm">
            <Link href={here('section')} scroll={false}>
              <PlusIcon /> Add section
            </Link>
          </Button>
        )
      }
    >
      {b.sections.length > 0 && (
        <ol className="grid gap-3">
          {b.sections.map((section, i) => {
            const draw = section.draw;
            const mix = draw && draw.easy + draw.medium + draw.hard > 0;
            return (
              <li key={section.id} className="ring-border/70 grid gap-2 rounded-md p-3 ring-1">
                <div className="flex items-center gap-2">
                  <b className="text-[0.875rem] font-semibold">
                    {i + 1} · {section.title}
                  </b>
                  {section.locked && (
                    <span className="bg-warning/10 text-warning inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[0.6875rem] font-medium">
                      <LockSimpleIcon className="size-3" /> No going back
                    </span>
                  )}
                  {editable && (
                    <span className="ml-auto">
                      <RowMenu
                        label={section.title}
                        move={{
                          id: section.id,
                          ids: b.sections.map((s) => s.id),
                          action: reorderSections,
                          fields: { assessmentId: b.assessment.id },
                        }}
                        items={[
                          {
                            kind: 'link',
                            label: 'Edit',
                            href: here(`section-${section.id}`),
                            icon: <PencilSimpleIcon />,
                          },
                          { kind: 'moves' },
                          { kind: 'separator' },
                          {
                            kind: 'action',
                            label: 'Delete',
                            icon: <TrashIcon />,
                            destructive: true,
                            action: deleteSection,
                            fields: { assessmentId: b.assessment.id, sectionId: section.id },
                            confirm: {
                              title: `Delete “${section.title}”?`,
                              message: 'Only an empty section can go: move or delete its questions first.',
                              confirmLabel: 'Delete',
                              destructive: true,
                            },
                          },
                        ]}
                      />
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={chip}>
                    {section.questions - (draw?.count ?? 0)} own question
                    {section.questions - (draw?.count ?? 0) === 1 ? '' : 's'}
                  </span>
                  {draw && (
                    <>
                      <span className={chip}>{draw.count} drawn from the bank</span>
                      <span className={chip}>
                        {mix ? `Easy ${draw.easy}% · medium ${draw.medium}% · hard ${draw.hard}%` : 'Any level'}
                      </span>
                      <span className={chip}>
                        {draw.marksEach} mark{draw.marksEach === 1 ? '' : 's'} each
                        {draw.negativeEach > 0 ? ` · −${draw.negativeEach} if wrong` : ''}
                      </span>
                      {draw.coIds.length > 0 && (
                        <span className={chip}>{draw.coIds.map((id) => codeOf.get(id) ?? '').join(', ')}</span>
                      )}
                      {draw.topics.length > 0 && <span className={chip}>Topics: {draw.topics.join(', ')}</span>}
                    </>
                  )}
                  <span className={chip}>
                    {section.durationMin
                      ? `${formatDuration(section.durationMin * 60)} of its own`
                      : 'Shares the test time'}
                  </span>
                  {section.passage && <span className={chip}>With a passage</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {b.bank.papers !== null &&
        (b.bank.shortfalls.length === 0 ? (
          <p className="text-success flex items-center gap-2 text-[0.8125rem] font-medium">
            <CheckCircleIcon weight="fill" className="size-4" />
            The bank can make {b.bank.papers >= PAPERS_CAP
              ? 'over a million'
              : b.bank.papers.toLocaleString('en-IN')}{' '}
            different paper
            {b.bank.papers === 1 ? '' : 's'} with these rules.
          </p>
        ) : (
          <ul className="text-warning grid gap-1 text-[0.8125rem] font-medium">
            {b.bank.shortfalls.map((text) => (
              <li key={text} className="flex items-center gap-2">
                <WarningIcon weight="fill" className="size-4" /> {text}.
              </li>
            ))}
          </ul>
        ))}
    </Section>
  );
}

function SectionDialog({
  b,
  section,
  openParam,
}: {
  b: Builder;
  section: BuilderSection | undefined;
  openParam: string;
}) {
  const draw = section?.draw;
  return (
    <FormDialog
      openParam={openParam}
      size="wide"
      icon={<PageIcon name="lessons" className="size-8" />}
      title={section ? `Section · ${section.title}` : 'New section'}
      description="Its own clock and order rule, a passage, and questions drawn from the bank for each person."
      action={saveSection}
      submitLabel="Save section"
      successMessage="Section saved."
    >
      <input type="hidden" name="assessmentId" value={b.assessment.id} />
      {section && <input type="hidden" name="sectionId" value={section.id} />}
      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
        <Field name="title" label="Name">
          <Input
            name="title"
            required
            maxLength={ASSESSMENT_LIMITS.sectionTitle}
            defaultValue={section?.title ?? ''}
            placeholder="Aptitude"
          />
        </Field>
        <Field name="durationMin" label="Its own time (minutes)" hint="Empty: it shares the test's time.">
          <Input name="durationMin" type="number" min={1} max={600} defaultValue={section?.durationMin ?? ''} />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-[0.8125rem]">
        <input
          type="checkbox"
          name="locked"
          value="true"
          defaultChecked={section?.locked ?? false}
          className="accent-foreground mt-0.5 size-4 shrink-0"
        />
        <span>
          <b className="font-medium">No going back.</b> Once someone leaves this section its answers cannot change, and
          the sections after it open only after they leave it.
        </span>
      </label>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Passage (optional)</span>
        <RichTextEditor
          name="passage"
          initial={section?.passage}
          placeholder="A text shown beside each question of this section…"
        />
        <FieldErrors name="passage" />
      </div>
      <fieldset className="ring-border grid gap-4 rounded-md p-4 ring-1">
        <legend className="px-1 text-sm font-medium">Questions drawn from the bank (optional)</legend>
        <p className="text-muted-foreground -mt-2 text-xs leading-relaxed">
          Each person gets their own questions from {b.offeringId ? 'the course’s' : 'your'} bank, besides the section’s
          own. Only questions marked automatically are drawn.
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field name="drawCount" label="How many" hint="Empty: none.">
            <Input
              name="drawCount"
              type="number"
              min={1}
              max={ASSESSMENT_LIMITS.items}
              defaultValue={draw?.count ?? ''}
            />
          </Field>
          <Field name="marksEach" label="Marks each">
            <Input name="marksEach" type="number" min={0.01} step={0.01} defaultValue={draw?.marksEach ?? ''} />
          </Field>
          <Field name="negativeEach" label="Taken off if wrong">
            <Input name="negativeEach" type="number" min={0} step={0.01} defaultValue={draw?.negativeEach ?? 0} />
          </Field>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Mix of levels (%)</span>
          <div className="grid grid-cols-3 gap-3">
            {(['easy', 'medium', 'hard'] as const).map((level) => (
              <label key={level} className="grid gap-1 text-xs">
                <span className="text-muted-foreground capitalize">{level}</span>
                <Input name={level} type="number" min={0} max={100} defaultValue={draw?.[level] ?? 0} />
              </label>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">Add up to 100, or leave all at 0 for any level.</p>
          <FieldErrors name="easy" />
        </div>
        {b.offeringId && b.cos.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Only questions on these outcomes</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {b.cos.map((co) => (
                <label key={co.id} className="flex items-center gap-2 text-[0.8125rem]" title={co.statement}>
                  <input
                    type="checkbox"
                    name="drawCos[]"
                    value={co.id}
                    defaultChecked={draw?.coIds.includes(co.id) ?? false}
                    className="accent-foreground size-4"
                  />
                  {co.code}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Field name="drawTopics" label="Only these topics" hint="Separated by commas. Empty: any topic.">
          <Input name="drawTopics" defaultValue={draw?.topics.join(', ') ?? ''} placeholder="arrays, loops" />
        </Field>
      </fieldset>
    </FormDialog>
  );
}

// TP-05: questions copied from the bank into this test (its course's bank, or the owner's own for a standalone test).
function BankPicker({ b, rows, base, bq }: { b: Builder; rows: BankRow[]; base: string; bq: string | undefined }) {
  return (
    <FormDialog
      openParam="bank"
      size="wide"
      icon={<PageIcon name="bank" className="size-8" />}
      title="Add from the bank"
      description={`Copies questions from ${b.offeringId ? 'the course’s' : 'your'} bank into this test. Changing them here leaves the bank as it is.`}
      preface={
        <Form action={base} scroll={false} className="flex gap-2">
          <input type="hidden" name="new" value="bank" />
          <Input name="bq" defaultValue={bq} placeholder="Search the bank" aria-label="Search the bank" />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </Form>
      }
      action={addFromBank}
      submitLabel="Add the ticked questions"
      successMessage="Questions added."
    >
      <input type="hidden" name="assessmentId" value={b.assessment.id} />
      {b.sections.length > 0 && (
        <Field name="sectionId" label="Into section">
          <NativeSelect name="sectionId" defaultValue={b.sections[0].id}>
            {b.sections.map((section) => (
              <NativeSelectOption key={section.id} value={section.id}>
                {section.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-[0.8125rem]">
          Nothing in the bank fits this test{bq ? ' and that search' : ''}. Add questions on the{' '}
          <Link
            href={b.offeringId ? `/courses/${b.offeringId}/bank` : '/tests/bank'}
            className="text-primary underline"
          >
            question bank
          </Link>{' '}
          page.
        </p>
      ) : (
        <ul className="ring-border/70 grid max-h-[50dvh] gap-px overflow-y-auto rounded-md ring-1">
          {rows.map((row) => (
            <li key={row.id}>
              <label className="hover:bg-muted/50 has-checked:bg-muted/60 flex cursor-pointer items-start gap-3 p-2.5">
                <input
                  type="checkbox"
                  name="bankItemIds[]"
                  value={row.id}
                  className="accent-foreground mt-0.5 size-4 shrink-0"
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-[0.8125rem] font-medium">{row.question}</span>
                  <span className="text-muted-foreground text-xs">
                    {[ITEM_LABEL[row.type], row.difficulty, row.topic, row.coCodes.join(', '), row.detail]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <FieldErrors name="bankItemIds[]" />
      <p className="text-muted-foreground text-xs">
        The {rows.length} newest that fit are shown; search to find others.
      </p>
    </FormDialog>
  );
}

// TP-07: extra minutes for one person (an accommodation, or a lost connection): added to their time limit and to the
// closing time; a running attempt gets them at once.
function ExtraTime({ b }: { b: Builder }) {
  return (
    <Section
      icon={<PageIcon name="session" className="size-8" />}
      title="Extra time"
      description="For one person, added to their time and the closing time."
    >
      {b.extraTime.length > 0 && (
        <ul className="grid gap-2">
          {b.extraTime.map((entry) => (
            <li key={entry.userId} className="flex items-center gap-2 text-[0.8125rem]">
              <span className="grid min-w-0 flex-1">
                <b className="truncate font-medium">{entry.name}</b>
                <span className="text-muted-foreground truncate text-xs">{entry.email}</span>
              </span>
              <span className="tabular-nums">+{entry.minutes} min</span>
              <ActionForm
                action={setExtraTime}
                submitLabel={`Take away ${entry.name}’s extra time`}
                submitVariant="outline"
                submitIcon={<XIcon />}
                iconOnly
              >
                <input type="hidden" name="assessmentId" value={b.assessment.id} />
                <input type="hidden" name="who" value={entry.email} />
                <input type="hidden" name="minutes" value="0" />
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      <ActionForm
        action={setExtraTime}
        submitLabel="Give extra time"
        submitSize="sm"
        successMessage="Extra time given."
      >
        <input type="hidden" name="assessmentId" value={b.assessment.id} />
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
          <Field name="who" label="Email or roll number">
            <Input name="who" required maxLength={120} />
          </Field>
          <Field name="minutes" label="Minutes">
            <Input name="minutes" type="number" min={1} max={600} required />
          </Field>
        </div>
      </ActionForm>
    </Section>
  );
}

const LINK_STATE: Record<ShareLink['state'], { label: string; tone: 'success' | 'warning' | 'secondary' }> = {
  open: { label: 'Open', tone: 'success' },
  off: { label: 'Turned off', tone: 'secondary' },
  expired: { label: 'Expired', tone: 'warning' },
  full: { label: 'Full', tone: 'warning' },
};

// TP-01: the test's share links, each with its address to copy, its QR code and its rules. "This class" lets LMS
// users in after they sign in; "Guests" lets outside people register with an email code.
function ShareLinks({
  links,
  qr,
  here,
  aid,
  draft,
  course,
}: {
  links: ShareLink[];
  qr: string[];
  here: (name: string) => string;
  aid: string;
  draft: boolean;
  course: boolean;
}) {
  return (
    <Section
      icon={<PageIcon name="globe" className="size-8" />}
      title="Share"
      description={draft ? 'Links work once you publish.' : 'Links that take people straight to this test.'}
      action={
        links.length < TEST_LIMITS.linksPerTest && (
          <Button asChild variant="outline" size="sm">
            <Link href={here('link')} scroll={false}>
              <PlusIcon /> New link
            </Link>
          </Button>
        )
      }
    >
      {links.length === 0 ? (
        <p className="text-muted-foreground text-[0.8125rem]">
          No links yet. Make one for your class, or one that outside people register through.
        </p>
      ) : (
        <ul className="grid gap-3">
          {links.map((link, i) => {
            const fields = { assessmentId: aid, linkId: link.id };
            const qrSrc = `data:image/svg+xml;utf8,${encodeURIComponent(qr[i] ?? '')}`;
            const audience: PageIconName = link.audience === 'guests' ? 'globe' : 'users';
            const rules = [
              link.audience === 'guests' ? 'Guests' : course ? 'This class' : 'LMS users',
              link.accessCode && `code ${link.accessCode}`,
              `${link.uses}${link.maxUses ? ` of ${link.maxUses}` : ''} joined`,
              link.expiresAt && `until ${formatDateTime(link.expiresAt)}`,
              link.allowedDomains.length > 0 && link.allowedDomains.join(', '),
            ].filter(Boolean);
            return (
              <li key={link.id} className="ring-border/70 grid gap-2.5 rounded-md p-3 ring-1">
                <div className="flex items-start gap-2.5">
                  <span className="icon-chip size-8 shrink-0">
                    <PageIcon name={audience} className="size-7" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <b className="truncate text-[0.8125rem] font-semibold">{link.label}</b>
                    <span className="text-muted-foreground text-xs">{rules.join(' · ')}</span>
                  </span>
                  <Badge variant={LINK_STATE[link.state].tone}>{LINK_STATE[link.state].label}</Badge>
                  <RowMenu
                    label={link.label}
                    items={[
                      {
                        kind: 'link',
                        label: 'Invite by email',
                        href: here(`invite-${link.id}`),
                        icon: <EnvelopeSimpleIcon />,
                      },
                      {
                        kind: 'action',
                        label: link.state === 'off' ? 'Turn on' : 'Turn off',
                        icon: <PowerIcon />,
                        action: setLinkActive,
                        fields: { ...fields, active: String(link.state === 'off') },
                      },
                      { kind: 'separator' },
                      link.uses === 0
                        ? {
                            kind: 'action',
                            label: 'Delete',
                            icon: <TrashIcon />,
                            destructive: true,
                            action: deleteLink,
                            fields,
                            confirm: {
                              title: `Delete “${link.label}”?`,
                              message: 'Its address stops working. Nobody has joined through it.',
                              confirmLabel: 'Delete',
                              destructive: true,
                            },
                          }
                        : {
                            kind: 'disabled',
                            label: 'Delete',
                            icon: <TrashIcon />,
                            reason: 'People joined through it. Turn it off instead.',
                          },
                    ]}
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={link.url}
                    aria-label={`Address of ${link.label}`}
                    className="h-8 min-w-0 text-xs"
                  />
                  <CopyButton value={link.url} label="Copy" />
                </div>
                <details className="text-xs">
                  <summary className="text-muted-foreground w-fit cursor-pointer font-medium">QR code</summary>
                  <div className="mt-2 flex items-end gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG made on the server */}
                    <img src={qrSrc} alt={`QR code for ${link.label}`} className="size-36 rounded-sm bg-white p-1" />
                    <a href={qrSrc} download={`${link.label}.svg`} className="font-medium underline underline-offset-4">
                      Download
                    </a>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function NewLinkDialog({ aid, course }: { aid: string; course: boolean }) {
  return (
    <FormDialog
      openParam="link"
      icon={<PageIcon name="globe" className="size-8" />}
      title="New share link"
      description="Who it is for, and anything that narrows who may use it. Leave a field empty to skip it."
      action={createLink}
      submitLabel="Make the link"
      successMessage="Link made."
    >
      <input type="hidden" name="assessmentId" value={aid} />
      <Field name="label" label="Name" hint="For you, to tell links apart: “Round 1 · CSE applicants”.">
        <Input name="label" required maxLength={TEST_LIMITS.label} />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Who opens it</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              value: 'class',
              icon: 'users' as const,
              title: course ? 'This class' : 'LMS users',
              hint: course
                ? 'Its students sign in with their password.'
                : 'Students and staff sign in with their password.',
            },
            ...(course
              ? []
              : [
                  {
                    value: 'guests',
                    icon: 'globe' as const,
                    title: 'Guests',
                    hint: 'Outside people register with an email code.',
                  },
                ]),
          ].map(({ value, icon, title, hint }) => (
            <label
              key={value}
              className="ring-border has-checked:ring-foreground has-checked:bg-muted/40 has-focus-visible:ring-ring flex cursor-pointer items-start gap-3 rounded-md p-3 ring-1 transition-colors has-checked:ring-2"
            >
              <input
                type="radio"
                name="audience"
                value={value}
                defaultChecked={value === 'class'}
                className="sr-only"
              />
              <span className="icon-chip size-8">
                <PageIcon name={icon} className="size-7" />
              </span>
              <span className="grid gap-0.5">
                <span className="text-[0.8125rem] font-semibold">{title}</span>
                <span className="text-muted-foreground text-xs leading-relaxed">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldErrors name="audience" />
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="accessCode" label="Access code" hint="Given with the link; asked before anyone joins.">
          <Input name="accessCode" autoComplete="off" maxLength={TEST_LIMITS.code} />
        </Field>
        <Field name="maxUses" label="Most people" hint="Stops letting people in after this many.">
          <Input name="maxUses" type="number" min={1} max={100000} inputMode="numeric" />
        </Field>
        <Field name="expiresAt" label="Works until" hint="Indian Standard Time.">
          <Input name="expiresAt" type="datetime-local" />
        </Field>
        <Field name="allowedDomains" label="Only these email domains" hint="Separated by commas: cutm.ac.in, gmail.com">
          <Input name="allowedDomains" placeholder="cutm.ac.in" />
        </Field>
      </div>
    </FormDialog>
  );
}

function InviteDialog({ aid, link, openParam }: { aid: string; link: ShareLink; openParam: string }) {
  return (
    <FormDialog
      openParam={openParam}
      icon={<PageIcon name="envelope" className="size-8" />}
      title="Invite by email"
      description={`Each address gets the test’s dates and the “${link.label}” link.${link.accessCode ? ' Send the access code separately.' : ''}`}
      action={inviteToTest}
      submitLabel="Send invitations"
      successMessage="Invitations are on their way."
    >
      <input type="hidden" name="assessmentId" value={aid} />
      <input type="hidden" name="linkId" value={link.id} />
      <Field
        name="emails"
        label="Email addresses"
        hint={`One per line or separated by commas; up to ${TEST_LIMITS.invitesPerSend} at a time.`}
      >
        <Textarea name="emails" required rows={8} placeholder={'riya.p@gmail.com\narjun.das@cutm.ac.in'} />
      </Field>
    </FormDialog>
  );
}
