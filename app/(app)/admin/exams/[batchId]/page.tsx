import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  DownloadSimpleIcon,
  ExamIcon,
  LockSimpleIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import Loading from '../../../loading';
import {
  computeGradeSheets,
  importEndSem,
  lockCompleteCourses,
  lockOffering,
  publishGradeSheets,
  unlockOffering,
  unpublishGradeSheets,
} from '../actions';
import { ActionForm, Field } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { getExamBatch, type BatchCourse, type ExamBatch } from '@/lib/data/exams';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { GRADE_SHEET_STATUSES, type GradeSheetStatus } from '@/lib/schemas/exams';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Exams' };

const Search = z.object({
  term: objectId.optional().catch(undefined),
  sheets: z.enum(GRADE_SHEET_STATUSES).optional().catch(undefined),
  page: pageParam.catch(1),
});

export default function BatchExamsPage({ params, searchParams }: PageProps<'/admin/exams/[batchId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <BatchExams params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const label = (c: BatchCourse) => `${c.code}${c.section ? ` · ${c.section}` : ''}`;

// M08 (mock-up E1 B, picked 23 Oct 2026): one batch in a term as four numbered steps — lock, send to the exam
// section, bring back the marks, publish grade sheets — each saying what is done and what it waits for.
async function BatchExams({
  params,
  searchParams,
}: {
  params: PageProps<'/admin/exams/[batchId]'>['params'];
  searchParams: PageProps<'/admin/exams/[batchId]'>['searchParams'];
}) {
  const { batchId } = await params;
  const { term, sheets, page } = Search.parse(await searchParams);
  const view = await getExamBatch(batchId, { termId: term, status: sheets, page });
  const { courses } = view;
  const locked = courses.filter((c) => c.locked);
  const allLocked = courses.length > 0 && locked.length === courses.length;
  const marksBack = allLocked && locked.every((c) => c.endSem >= c.students);
  const { counts } = view.sheets;
  return (
    <>
      <PageHeader
        icon={<PageIcon name="diploma" />}
        title={view.batch.name}
        description={`${view.term.code} · ${view.term.name} · ${plural(view.students, 'student')} · ${plural(courses.length, 'credit course')}`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/admin/exams?term=${view.term.id}`}>
              <ArrowLeftIcon />
              All batches
            </Link>
          </Button>
        }
      >
        <FilterForm action={`/admin/exams/${view.batch.id}`}>
          <NativeSelect name="term" aria-label="Term" defaultValue={view.term.id}>
            {view.terms.map((t) => (
              <NativeSelectOption key={t.id} value={t.id}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FilterForm>
      </PageHeader>
      <div className="grid gap-5">
        <Step
          n={1}
          state={allLocked ? 'done' : 'now'}
          title="Lock the internal marks"
          description={
            courses.length === 0
              ? 'This batch has no credit course this term.'
              : allLocked
                ? `${courses.length === 1 ? 'The course is' : `All ${courses.length} courses are`} locked. To correct a mark, unlock its course with a reason.`
                : `${locked.length} of ${plural(courses.length, 'course')} locked. Locked marks cannot change until an admin unlocks the course with a reason.`
          }
          action={
            !allLocked &&
            courses.length > 0 && (
              <ActionForm
                action={lockCompleteCourses}
                submitLabel="Lock the complete courses"
                successMessage="Locking…"
                confirm={{
                  title: 'Lock the complete courses?',
                  message:
                    'Each unlocked course is worked out again and locked if every student’s internal marks are complete. A course with incomplete marks is left for you to lock on its own, with a reason.',
                }}
              >
                <input type="hidden" name="termId" value={view.term.id} />
                <input type="hidden" name="batchId" value={view.batch.id} />
              </ActionForm>
            )
          }
        >
          <LockRun view={view} />
          {courses.length > 0 && <Courses view={view} />}
        </Step>
        <Step
          n={2}
          state={locked.length === 0 ? 'wait' : allLocked && view.exportRun ? 'done' : 'now'}
          title="Send them to the exam section"
          description={
            locked.length === 0
              ? 'Lock a course first.'
              : view.exportRun
                ? `Sent ${formatDateTime(view.exportRun.at)} by ${view.exportRun.by}: ${plural(view.exportRun.stats.applied, 'row')}.${allLocked ? '' : ' Send again once every course is locked.'}`
                : `Not sent yet. The file has the ${plural(locked.length, 'locked course')}.`
          }
          action={
            locked.length > 0 && (
              <Button variant="outline" asChild>
                <a href={`/api/exports/internal-marks?termId=${view.term.id}&batchId=${view.batch.id}`}>
                  <DownloadSimpleIcon />
                  Download the file (CSV)
                </a>
              </Button>
            )
          }
        >
          {locked.length > 0 && (
            <p className="text-muted-foreground text-[0.8125rem]">
              One row per student and course, with their internal marks. The exam section fills in the three empty
              columns — theory end-semester, practice and project external marks, or{' '}
              <b className="text-foreground">AB</b> for absent — and sends the same file back.
            </p>
          )}
        </Step>
        <Step
          n={3}
          state={marksBack ? 'done' : locked.length > 0 ? 'now' : 'wait'}
          title="Bring back the marks"
          description={
            locked.length === 0
              ? 'Waiting for the exam section’s file.'
              : 'Upload the file you sent, with the external marks filled in.'
          }
        >
          {locked.length > 0 && <Upload view={view} />}
        </Step>
        <Step
          n={4}
          state={
            counts.published > 0 && counts.draft + counts.incomplete === 0
              ? 'done'
              : marksBack || counts.draft + counts.incomplete + counts.published > 0
                ? 'now'
                : 'wait'
          }
          title="Publish grade sheets"
          description={
            view.sheetRun?.status === 'running'
              ? 'Working them out…'
              : view.sheetRun
                ? `Worked out ${formatDateTime(view.sheetRun.at)}. Students see nothing until you publish.`
                : 'After every course is locked and the marks are back.'
          }
          action={<SheetActions view={view} />}
        >
          {view.sheetRun?.status === 'running' && <AutoRefresh seconds={5} />}
          {view.sheetRun?.status === 'failed' && (
            <p className="text-destructive text-[0.8125rem]">{view.sheetRun.failures[0]?.message}</p>
          )}
          {counts.draft + counts.incomplete + counts.published > 0 && <Sheets view={view} page={page} />}
        </Step>
      </div>
    </>
  );
}

function Step({
  n,
  state,
  title,
  description,
  action,
  children,
}: {
  n: number;
  state: 'done' | 'now' | 'wait';
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Section
      icon={
        <span
          className={cn(
            'grid size-8 place-items-center rounded-full text-sm font-semibold ring-1',
            state === 'done' && 'bg-success/10 text-success ring-success/30',
            state === 'now' && 'bg-primary text-primary-foreground ring-primary',
            state === 'wait' && 'bg-muted text-muted-foreground ring-border',
          )}
          aria-label={state === 'done' ? `Step ${n}, done` : `Step ${n}`}
        >
          {state === 'done' ? <CheckIcon weight="bold" /> : n}
        </span>
      }
      title={title}
      description={description}
      action={action}
    >
      {children}
    </Section>
  );
}

function LockRun({ view }: { view: ExamBatch }) {
  const run = view.lockRun;
  const open = view.courses.some((c) => !c.locked);
  if (!run || (run.status !== 'running' && (run.failureCount === 0 || !open))) return null;
  if (run.status === 'running') {
    return (
      <p className="text-muted-foreground text-[0.8125rem]">
        <AutoRefresh seconds={5} />
        Locking {plural(run.stats.rows ?? 0, 'course')}: {run.stats.applied + run.stats.failed} done.
      </p>
    );
  }
  return (
    <div className="bg-warning/10 ring-warning/30 grid gap-1 rounded-md px-3.5 py-3 text-[0.8125rem] ring-1">
      <p className="font-semibold">
        Locked {run.stats.applied} of {plural(run.stats.rows ?? 0, 'course')} · {formatDateTime(run.at)}
      </p>
      {run.failures.map((f) => (
        <p key={`${f.key}`}>
          Not locked: <b>{f.key}</b> — {f.message}
        </p>
      ))}
    </div>
  );
}

function Courses({ view }: { view: ExamBatch }) {
  return (
    <DataTable
      bare
      columns={[
        {
          header: 'Course',
          cell: (c) => (
            <span className="grid min-w-56">
              <span className="font-semibold">
                {c.code} · {c.title}
                {c.section ? ` · ${c.section}` : ''}
              </span>
              <span className="text-muted-foreground text-xs">
                {c.credits} credits{c.faculty.length > 0 ? ` · ${c.faculty.join(', ')}` : ''}
              </span>
            </span>
          ),
        },
        { header: 'Students', cell: (c) => <span className="tabular-nums">{c.students}</span> },
        {
          header: 'Internal marks complete',
          className: 'whitespace-normal',
          cell: (c) => (
            <span className="grid gap-1">
              <span className="flex items-center gap-2">
                <Progress
                  value={c.students > 0 ? (100 * c.complete) / c.students : 0}
                  className="w-24"
                  aria-label={`${c.complete} of ${c.students} complete`}
                />
                <span className="tabular-nums">
                  {c.complete} of {c.students}
                </span>
              </span>
              {c.noClasses ? (
                <span className="text-warning max-w-72 text-xs">
                  The attendance part is empty: no classes recorded in the LMS.
                </span>
              ) : (
                !c.locked &&
                c.complete < c.students && (
                  <span className="text-warning text-xs">{plural(c.students - c.complete, 'student')} incomplete</span>
                )
              )}
            </span>
          ),
        },
        {
          header: 'Lock',
          cell: (c) =>
            c.locked ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                <LockSimpleIcon className="size-3.5" />
                Locked {formatDateTime(c.locked.at)} · {c.locked.by}
              </span>
            ) : (
              <Badge
                variant={c.complete === c.students && c.students > 0 ? 'success' : 'warning'}
                className="normal-case"
              >
                {c.complete === c.students && c.students > 0 ? 'Ready to lock' : 'Not locked'}
              </Badge>
            ),
        },
        { header: '', className: 'w-28 text-right', cell: (c) => <LockButton course={c} /> },
      ]}
      rows={view.courses}
      rowKey={(c) => c.id}
      empty="This batch has no credit course this term."
    />
  );
}

function LockButton({ course }: { course: BatchCourse }) {
  const name = label(course);
  if (course.locked) {
    return (
      <FormDialog
        trigger={
          <Button variant="outline" size="sm">
            Unlock…
          </Button>
        }
        icon={<LockSimpleIcon />}
        title={`Unlock ${name}?`}
        description="Its teachers can change its marks again. Draft grade sheets that include it go back to incomplete until they are worked out again."
        action={unlockOffering}
        submitLabel="Unlock"
        successMessage="Unlocked."
      >
        <input type="hidden" name="offeringId" value={course.id} />
        <Field name="reason" label="Why unlock it?" hint="At least 10 characters. Kept in the audit log.">
          <Textarea name="reason" required minLength={10} maxLength={500} rows={3} />
        </Field>
      </FormDialog>
    );
  }
  if (course.complete === course.students && course.students > 0) {
    return (
      <ActionForm
        action={lockOffering}
        submitLabel="Lock"
        submitVariant="outline"
        submitSize="sm"
        successMessage="Locked."
        confirm={{
          title: `Lock ${name}?`,
          message: 'Its internal marks cannot change until an admin unlocks it with a reason.',
        }}
      >
        <input type="hidden" name="offeringId" value={course.id} />
        <input type="hidden" name="overrideReason" value="" />
      </ActionForm>
    );
  }
  const missing = course.students - course.complete;
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          Lock…
        </Button>
      }
      icon={<LockSimpleIcon />}
      title={`Lock ${name}?`}
      description={`${missing} of ${plural(course.students, 'student’s', 'students’')} internal marks are incomplete. Locked as they are, these students get no grade sheet until the course is unlocked and their marks are filled in. Nothing is counted as 0.`}
      action={lockOffering}
      submitLabel="Lock anyway"
      successMessage="Locked."
    >
      <input type="hidden" name="offeringId" value={course.id} />
      {course.incomplete.length > 0 && (
        <ul className="divide-border/70 ring-border/70 divide-y rounded-md px-3 text-[0.8125rem] ring-1">
          {course.incomplete.map((s) => (
            <li key={s.studentId} className="flex items-start justify-between gap-3 py-2.5">
              <span className="grid">
                <span className="font-semibold">{s.name}</span>
                <span className="text-muted-foreground text-xs">{s.rollNo}</span>
              </span>
              <span className="text-warning max-w-64 text-right text-xs">{s.why}</span>
            </li>
          ))}
          {missing > course.incomplete.length && (
            <li className="text-muted-foreground py-2.5 text-xs">and {missing - course.incomplete.length} more</li>
          )}
        </ul>
      )}
      <Field name="overrideReason" label="Why lock now?" hint="At least 10 characters. Kept in the audit log.">
        <Textarea
          name="overrideReason"
          required
          minLength={10}
          maxLength={500}
          rows={3}
          placeholder="For example: the exam section needs the file today; two students are on medical leave."
        />
      </Field>
    </FormDialog>
  );
}

function Upload({ view }: { view: ExamBatch }) {
  const run = view.importRun;
  const waiting = view.courses.filter((c) => c.locked && c.endSem < c.students);
  return (
    <>
      <ActionForm action={importEndSem} submitLabel="Upload" successMessage="Marks saved.">
        <input type="hidden" name="termId" value={view.term.id} />
        <input type="hidden" name="batchId" value={view.batch.id} />
        <Field
          name="file"
          label="The exam section’s file"
          hint="Each external column holds a mark, AB for absent, or nothing where the course has no such part. The other columns are not read. Nothing is saved unless every row is right."
        >
          <Input name="file" type="file" accept=".csv,text/csv" required />
        </Field>
      </ActionForm>
      {run?.status === 'failed' && (
        <div className="bg-destructive/5 ring-destructive/20 grid gap-2 rounded-md p-3.5 ring-1">
          <div className="grid gap-0.5">
            <p className="text-[0.8125rem] font-semibold">
              Last upload · {formatDateTime(run.at)} · {run.by} — nothing saved
            </p>
            <p className="text-muted-foreground text-[0.8125rem]">
              {run.stats.rows === null
                ? 'The file could not be read.'
                : `${plural(run.stats.rows, 'row')} read; ${run.failureCount} need fixing.`}{' '}
              Correct them in the file and upload it again.
            </p>
          </div>
          <ul className="divide-destructive/15 border-destructive/15 divide-y border-t text-[0.8125rem]">
            {run.failures.map((f, i) => (
              <li key={i} className="grid gap-0.5 py-2">
                {(f.row || f.key) && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {[f.row && `Row ${f.row}`, f.key].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span className="text-destructive">{f.message}</span>
              </li>
            ))}
            {run.failureCount > run.failures.length && (
              <li className="text-muted-foreground py-2 text-xs">and {run.failureCount - run.failures.length} more</li>
            )}
          </ul>
        </div>
      )}
      {run?.status === 'succeeded' && (
        <p className="text-muted-foreground text-[0.8125rem]">
          Last upload {formatDateTime(run.at)} by {run.by}: {plural(run.stats.applied, 'row')} saved.
        </p>
      )}
      {waiting.length > 0 && (
        <div className="grid gap-1">
          <p className="text-[0.8125rem] font-semibold">Still without external marks</p>
          <ul className="divide-border/70 divide-y text-[0.8125rem]">
            {waiting.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {c.code} · {c.title}
                  {c.section ? ` · ${c.section}` : ''}
                </span>
                <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                  {plural(c.students - c.endSem, 'student')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function SheetActions({ view }: { view: ExamBatch }) {
  const { counts } = view.sheets;
  const ids = (
    <>
      <input type="hidden" name="termId" value={view.term.id} />
      <input type="hidden" name="batchId" value={view.batch.id} />
    </>
  );
  if (view.sheetRun?.status === 'running') return null;
  return (
    <>
      {counts.published > 0 && (
        <FormDialog
          trigger={<Button variant="outline">Unpublish…</Button>}
          icon={<ExamIcon />}
          title="Unpublish this batch’s grade sheets?"
          description={`Students stop seeing ${plural(counts.published, 'grade sheet')}, and their end-semester marks can be changed again. Publish again when they are right.`}
          action={unpublishGradeSheets}
          submitLabel="Unpublish"
          successMessage="Unpublished."
        >
          {ids}
          <Field name="reason" label="Why unpublish them?" hint="At least 10 characters. Kept in the audit log.">
            <Textarea name="reason" required minLength={10} maxLength={500} rows={3} />
          </Field>
        </FormDialog>
      )}
      {view.courses.length > 0 && (
        <ActionForm
          action={computeGradeSheets}
          submitLabel={view.sheetRun ? 'Work them out again' : 'Work them out'}
          submitVariant="outline"
        >
          {ids}
        </ActionForm>
      )}
      {counts.draft > 0 && (
        <ActionForm
          action={publishGradeSheets}
          submitLabel={`Publish ${plural(counts.draft, 'grade sheet')}`}
          successMessage="Published."
          confirm={{
            title: `Publish ${plural(counts.draft, 'grade sheet')}?`,
            message: `Those students see their grades and are told so.${counts.incomplete > 0 ? ` The ${counts.incomplete} incomplete ones wait.` : ''} Their end-semester marks cannot change until the sheets are unpublished.`,
          }}
        >
          {ids}
        </ActionForm>
      )}
    </>
  );
}

const STATUS_LABEL: Record<GradeSheetStatus, string> = {
  draft: 'Ready',
  incomplete: 'Incomplete',
  published: 'Published',
};

function Sheets({ view, page }: { view: ExamBatch; page: number }) {
  const { counts, status, rows, total } = view.sheets;
  const tiles: { icon: Icon; value: number; label: string; tone?: string }[] = [
    { icon: UsersThreeIcon, value: view.students, label: 'Students' },
    { icon: CheckCircleIcon, value: counts.draft, label: 'Ready', tone: counts.draft > 0 ? 'text-success' : undefined },
    {
      icon: WarningIcon,
      value: counts.incomplete,
      label: 'Incomplete',
      tone: counts.incomplete > 0 ? 'text-warning' : undefined,
    },
    { icon: ExamIcon, value: counts.published, label: 'Published' },
  ];
  const base = `/admin/exams/${view.batch.id}`;
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
            <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
              <tile.icon className="size-[1.125rem]" />
            </span>
            <div className="grid min-w-0">
              <dd className={cn('text-lg leading-tight font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
              <dt className="text-muted-foreground order-first truncate text-xs">{tile.label}</dt>
            </div>
          </div>
        ))}
      </dl>
      <nav aria-label="Grade sheets" className="min-w-0 border-b">
        <div className="-mb-px flex gap-5 overflow-x-auto">
          {(['draft', 'incomplete', 'published'] as const).map((s) => (
            <Link
              key={s}
              href={`${base}?term=${view.term.id}&sheets=${s}`}
              aria-current={s === status ? 'page' : undefined}
              className={cn(
                'border-b-2 pb-2.5 text-[0.8125rem] whitespace-nowrap',
                s === status
                  ? 'border-primary text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground border-transparent font-medium',
              )}
            >
              {STATUS_LABEL[s]} · {counts[s]}
            </Link>
          ))}
        </div>
      </nav>
      <DataTable
        bare
        columns={[
          {
            header: 'Student',
            cell: (r) => (
              <span className="grid min-w-40">
                <span className="font-semibold">{r.name}</span>
                <span className="text-muted-foreground text-xs">{r.rollNo}</span>
              </span>
            ),
          },
          ...(status === 'incomplete'
            ? [
                {
                  header: 'What is missing',
                  className: 'whitespace-normal',
                  cell: (r: (typeof rows)[number]) => (
                    <span className="text-warning text-xs">{r.missing.join(' · ')}</span>
                  ),
                },
              ]
            : [
                {
                  header: 'Credits',
                  cell: (r: (typeof rows)[number]) => <span className="tabular-nums">{r.credits}</span>,
                },
                {
                  header: 'SGPA',
                  cell: (r: (typeof rows)[number]) => (
                    <span className="font-semibold tabular-nums">{r.sgpa === null ? '—' : r.sgpa.toFixed(2)}</span>
                  ),
                },
                {
                  header: 'Look at',
                  cell: (r: (typeof rows)[number]) =>
                    r.flags.length > 0 ? (
                      <span className="text-destructive text-xs font-medium">{r.flags.join(' · ')}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    ),
                },
                {
                  header: '',
                  className: 'w-20 text-right',
                  cell: (r: (typeof rows)[number]) => (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${base}/${r.studentId}?term=${view.term.id}`}>View</Link>
                    </Button>
                  ),
                },
              ]),
        ]}
        rows={rows}
        rowKey={(r) => r.studentId}
        total={total}
        page={page}
        pageSize={pageSize}
        query={{ term: view.term.id, sheets: status }}
        path={base}
        empty={`No ${STATUS_LABEL[status].toLowerCase()} grade sheet.`}
      />
    </>
  );
}
