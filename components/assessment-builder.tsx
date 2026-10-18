import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  ClockIcon,
  EnvelopeSimpleIcon,
  FileArrowUpIcon,
  GlobeIcon,
  HashIcon,
  InfoIcon,
  LinkIcon,
  ListChecksIcon,
  LockIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  PowerIcon,
  RadioButtonIcon,
  TextAaIcon,
  TrashIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  deleteItem,
  publishAssessment,
  reorderItems,
  saveInstructions,
  saveItem,
  updateAssessmentSettings,
} from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { createLink, deleteLink, inviteToTest, setLinkActive } from '@/app/(app)/tests/actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { BloomChip } from '@/components/bloom-chip';
import { CopyButton } from '@/components/copy-button';
import { FormDialog } from '@/components/form-dialog';
import { istLocal } from '@/components/new-assessment-dialog';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RichTextView } from '@/components/rich-text-view';
import { RowMenu } from '@/components/row-menu';
import { Section } from '@/components/section';
import { SortableList } from '@/components/sortable-list';
import { ModeChip, STATE_LABEL } from '@/components/assessment-lists';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getBuilder, type Builder, type TeacherItem } from '@/lib/data/assessments';
import { listLinks, type ShareLink } from '@/lib/data/test-links';
import { formatDateTime, formatDuration, ITEM_LABEL, statusTone } from '@/lib/format';
import { ASSESSMENT_LIMITS, MODE_ITEM_TYPES, type ItemType } from '@/lib/schemas/assessment';
import type { RichTextDoc } from '@/lib/schemas/common';
import { BLOOM_LEVELS } from '@/lib/schemas/structure';
import { TEST_LIMITS } from '@/lib/schemas/tests';

const TYPE_ICON: Record<ItemType, Icon> = {
  mcq: RadioButtonIcon,
  msq: CheckSquareIcon,
  numeric: HashIcon,
  text: TextAaIcon,
  file: FileArrowUpIcon,
};
const TYPE_HINT: Record<ItemType, string> = {
  mcq: 'Students pick one option. It is marked as soon as they hand in.',
  msq: 'Students tick every correct option; all of them, and only those, score.',
  numeric: 'Students type a number. It scores when it is within the margin you allow.',
  text: 'Students type their answer. You mark it, criterion by criterion if you add a rubric.',
  file: 'Students upload photos or a PDF of written work. You mark it.',
};

// The question's first words, for its row.
function plain(doc: RichTextDoc | null): string {
  const out: string[] = [];
  const walk = (nodes: RichTextDoc['content']) => {
    for (const node of nodes ?? []) {
      if (node.text) out.push(node.text);
      walk(node.content);
    }
  };
  walk(doc?.content);
  return out.join(' ').trim() || 'Untitled question';
}

const Search = z.object({ new: z.string().max(40).optional().catch(undefined) });

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
  const { new: open } = Search.parse(await searchParams);
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

  const rows = a.items.map((item, i) => ({
    id: item.id,
    label: `Question ${i + 1}`,
    node: <QuestionRow key={item.id} item={item} n={i + 1} b={b} editable={editQuestions} here={here} />,
  }));
  const checks = [
    {
      ok: a.items.length > 0,
      text:
        a.items.length > 0
          ? `${a.questions} question${a.questions === 1 ? '' : 's'} · ${a.maxMarks} marks`
          : 'No questions yet',
    },
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
        <Section
          icon={<ListChecksIcon />}
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
                {MODE_ITEM_TYPES[a.mode].map((type) => {
                  const TypeIcon = TYPE_ICON[type];
                  return (
                    <Button key={type} asChild variant="outline" size="sm">
                      <Link href={here(`item-${type}`)} scroll={false}>
                        <TypeIcon /> {ITEM_LABEL[type]}
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        <div className="grid gap-4">
          <Section
            icon={<ClockIcon />}
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
          {b.canEdit && (
            <ShareLinks links={links} qr={qr} here={here} aid={aid} draft={a.status === 'draft'} course={course} />
          )}
          <Section
            icon={<InfoIcon />}
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
      {b.canEdit && open === 'instructions' && (
        <FormDialog
          key={open}
          openParam="instructions"
          icon={<InfoIcon weight="duotone" />}
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
        <ItemDialog
          key={open}
          openParam={open}
          b={b}
          item={editItem}
          type={editItem?.type ?? newType ?? 'text'}
          n={editItem ? a.items.indexOf(editItem) + 1 : a.items.length + 1}
        />
      )}
    </>
  );
}

function QuestionRow({
  item,
  n,
  b,
  editable,
  here,
}: {
  item: TeacherItem;
  n: number;
  b: Builder;
  editable: boolean;
  here: (name: string) => string;
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
          <span className="text-muted-foreground text-xs">{how}</span>
        </div>
      </div>
      <span className="text-[0.8125rem] font-medium whitespace-nowrap tabular-nums">
        {item.maxMarks} mark{item.maxMarks === 1 ? '' : 's'}
      </span>
      {editable && (
        <RowMenu
          label={`Question ${n}`}
          move={{
            id: item.id,
            ids: b.assessment.items.map((i) => i.id),
            action: reorderItems,
            fields: { assessmentId: b.assessment.id },
          }}
          items={[
            { kind: 'link', label: 'Edit', href: here(`item-${item.id}`), icon: <PencilSimpleIcon /> },
            { kind: 'moves' },
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
      icon={<ClockIcon weight="duotone" />}
      title="Settings"
      description={
        fixed
          ? 'Students have started, so only the title and the dates can change.'
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

function ItemDialog({
  openParam,
  b,
  item,
  type,
  n,
}: {
  openParam: string;
  b: Builder;
  item: TeacherItem | undefined;
  type: ItemType;
  n: number;
}) {
  const TypeIcon = TYPE_ICON[type];
  const options = item?.options ?? [];
  const correct = new Set(item?.key && 'optionIds' in item.key ? item.key.optionIds : []);
  const rubric = item?.rubric ?? [];
  const optionRow = (row: number) => {
    const option = options[row];
    return (
      <div key={row} className="flex items-center gap-3">
        <input
          type={type === 'mcq' ? 'radio' : 'checkbox'}
          name={type === 'mcq' ? 'correct' : 'correct[]'}
          value={row}
          defaultChecked={option ? correct.has(option.id) : false}
          aria-label={`Option ${row + 1} is correct`}
          className="accent-foreground size-4 shrink-0"
        />
        <Input
          name="option[]"
          defaultValue={option?.text ?? ''}
          maxLength={ASSESSMENT_LIMITS.optionText}
          placeholder={`Option ${row + 1}`}
        />
      </div>
    );
  };
  const criterionRow = (row: number) => (
    <div key={row} className="grid grid-cols-[1fr_6rem] gap-3">
      <Input
        name="criterion[]"
        defaultValue={rubric[row]?.criterion ?? ''}
        maxLength={ASSESSMENT_LIMITS.criterion}
        placeholder="Criterion"
        aria-label={`Criterion ${row + 1}`}
      />
      <Input
        name="criterionMarks[]"
        type="number"
        min={0.01}
        step={0.01}
        defaultValue={rubric[row]?.maxMarks ?? ''}
        aria-label={`Marks for criterion ${row + 1}`}
      />
    </div>
  );
  const shownOptions = Math.max(4, options.length);
  const shownCriteria = Math.max(3, rubric.length);
  return (
    <FormDialog
      openParam={openParam}
      size="wide"
      icon={<TypeIcon weight="duotone" />}
      title={`Question ${n} · ${ITEM_LABEL[type]}`}
      description={TYPE_HINT[type]}
      action={saveItem}
      submitLabel="Save question"
      successMessage="Question saved."
    >
      <input type="hidden" name="assessmentId" value={b.assessment.id} />
      <input type="hidden" name="type" value={type} />
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <div className="grid gap-2">
        <span className="text-sm font-medium">Question</span>
        <RichTextEditor name="prompt" initial={item?.prompt} placeholder="Write the question…" />
        <FieldErrors name="prompt" />
      </div>
      <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
        <Field name="maxMarks" label="Marks">
          <Input
            name="maxMarks"
            type="number"
            required
            min={0.01}
            max={1000}
            step={0.01}
            defaultValue={item?.maxMarks ?? ''}
          />
        </Field>
        <Field name="bloomLevel" label="Thinking level (Bloom)">
          <NativeSelect name="bloomLevel" defaultValue={item?.bloomLevel ?? ''}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {BLOOM_LEVELS.map((level) => (
              <NativeSelectOption key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {b.offeringId && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Course outcomes</legend>
          {b.cos.length === 0 ? (
            <p className="text-muted-foreground text-[0.8125rem]">
              This course has no outcomes yet. The course coordinator adds them on the Outcomes tab.
            </p>
          ) : (
            <div className="ring-border grid gap-2.5 rounded-md p-3 ring-1">
              {b.cos.map((co) => (
                <label key={co.id} className="flex items-start gap-2.5 text-[0.8125rem]">
                  <input
                    type="checkbox"
                    name="cos[]"
                    value={co.id}
                    defaultChecked={item?.coIds.includes(co.id) ?? false}
                    className="accent-foreground mt-0.5 size-4 shrink-0"
                  />
                  <span>
                    <b className="font-semibold">{co.code}</b> {co.statement}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-xs leading-relaxed">
            {b.credit
              ? 'Every question of a credit course is tagged with at least one outcome; it feeds attainment.'
              : 'Optional on a non-credit course.'}
          </p>
          <FieldErrors name="cos[]" />
        </fieldset>
      )}

      {(type === 'mcq' || type === 'msq') && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            {type === 'mcq' ? 'Options · pick the correct one' : 'Options · tick every correct one'}
          </legend>
          {Array.from({ length: shownOptions }, (_, row) => optionRow(row))}
          {shownOptions < ASSESSMENT_LIMITS.options && (
            <details className="grid gap-2">
              <summary className="text-primary cursor-pointer text-xs font-medium">
                Up to {ASSESSMENT_LIMITS.options - shownOptions} more options
              </summary>
              <div className="mt-2 grid gap-2">
                {Array.from({ length: ASSESSMENT_LIMITS.options - shownOptions }, (_, i) =>
                  optionRow(shownOptions + i),
                )}
              </div>
            </details>
          )}
          <p className="text-muted-foreground text-xs">Leave a row empty to skip it.</p>
          <FieldErrors name="option[]" />
          <FieldErrors name="correct" />
        </fieldset>
      )}

      {type === 'numeric' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="value" label="Correct answer">
            <Input
              name="value"
              type="number"
              step="any"
              required
              defaultValue={item?.key && 'value' in item.key ? item.key.value : ''}
            />
          </Field>
          <Field name="tolerance" label="Allowed margin (±)" hint="0 means the exact value only.">
            <Input
              name="tolerance"
              type="number"
              step="any"
              min={0}
              defaultValue={item?.key && 'tolerance' in item.key ? item.key.tolerance : 0}
            />
          </Field>
        </div>
      )}

      {(type === 'text' || type === 'file') && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Rubric (optional)</legend>
          <div className="text-muted-foreground grid grid-cols-[1fr_6rem] gap-3 text-[0.6875rem] font-medium tracking-wide uppercase">
            <span>Criterion</span>
            <span>Marks</span>
          </div>
          {Array.from({ length: shownCriteria }, (_, row) => criterionRow(row))}
          {shownCriteria < ASSESSMENT_LIMITS.criteria && (
            <details>
              <summary className="text-primary cursor-pointer text-xs font-medium">
                Up to {ASSESSMENT_LIMITS.criteria - shownCriteria} more criteria
              </summary>
              <div className="mt-2 grid gap-2">
                {Array.from({ length: ASSESSMENT_LIMITS.criteria - shownCriteria }, (_, i) =>
                  criterionRow(shownCriteria + i),
                )}
              </div>
            </details>
          )}
          <p className="text-muted-foreground text-xs leading-relaxed">
            With a rubric you mark each criterion, and the question’s marks are their total, so they must add up to its
            marks.
          </p>
          <FieldErrors name="criterion[]" />
        </fieldset>
      )}
    </FormDialog>
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
      icon={<LinkIcon />}
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
            const AudienceIcon = link.audience === 'guests' ? GlobeIcon : UsersThreeIcon;
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
                    <AudienceIcon className="size-4" />
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
      icon={<LinkIcon weight="duotone" />}
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
              icon: UsersThreeIcon,
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
                    icon: GlobeIcon,
                    title: 'Guests',
                    hint: 'Outside people register with an email code.',
                  },
                ]),
          ].map(({ value, icon: OptionIcon, title, hint }) => (
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
                <OptionIcon className="size-4" />
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
      icon={<EnvelopeSimpleIcon weight="duotone" />}
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
