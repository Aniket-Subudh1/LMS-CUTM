import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CloudArrowDownIcon, FileArrowUpIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { importCourseList, startCoursewareImport } from './actions';
import { Field } from '@/components/action-form';
import { DataTable, EmptyState } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listCourseListUploads, listCoursewareRuns, type SyncRunRow } from '@/lib/data/imports';
import { formatDateTime, statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Imports' };

const Search = z.object({ page: pageParam.catch(1) });

const COLUMNS = [
  ['programme', 'The programme, by its code or name', 'M.Sc Mathematics'],
  ['stream', 'Optional', ''],
  ['basket', 'Optional: the basket it sits in', 'Basket I'],
  ['type', 'Optional: Core, Domain, Skill…', 'Core'],
  ['code', 'The course code', 'CUTM1535'],
  ['title', 'The course title', 'Advanced complex analysis'],
  ['credits', 'Total credits', '4'],
  ['tpp', 'Theory + practice + project', '3+0+1'],
] as const;

const MODES = [
  ['new', 'Pages not imported yet', 'The usual choice: courses already read are left alone.'],
  ['all', 'All pages again', 'Reads every page; courses edited here keep their edits.'],
  ['one', 'One page', 'A single course, by its page number or link.'],
] as const;

export default function ImportsPage({ searchParams }: PageProps<'/admin/imports'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Imports searchParams={searchParams} />
    </Suspense>
  );
}

async function Imports({ searchParams }: { searchParams: PageProps<'/admin/imports'>['searchParams'] }) {
  const { page } = Search.parse(await searchParams);
  const [uploads, runs] = await Promise.all([listCourseListUploads(), listCoursewareRuns(page)]);
  return (
    <>
      <PageHeader
        icon={<PageIcon name="imports" />}
        title="Imports"
        description="Load CUTM's courses into the catalogue: first the course list, then each course's content from courseware."
      />
      <div className="grid gap-6">
        <Section
          icon={<PageIcon name="catalog" className="size-8" />}
          title="1 · Course list"
          description="CUTM's Course Repository as a CSV: which programme lists which course, with its credits. Upload it again whenever it changes; nothing is ever deleted."
          action={<UploadDialog />}
        >
          <div className="ring-border overflow-x-auto rounded-xl ring-1">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  {COLUMNS.map(([column]) => (
                    <th key={column} className="px-3 py-2 font-mono text-xs font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  {COLUMNS.map(([column, , example]) => (
                    <td key={column} className="px-3 py-2 whitespace-nowrap">
                      {example || <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
                <tr className="text-muted-foreground border-t text-xs">
                  {COLUMNS.map(([column, help]) => (
                    <td key={column} className="px-3 py-2 align-top">
                      {help}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {uploads.length === 0 ? (
            <p className="text-muted-foreground text-sm">No course list has been uploaded yet.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {uploads.map((u) => (
                <li
                  key={u.id}
                  className="ring-border/80 flex flex-wrap justify-between gap-2 rounded-xl px-4 py-2.5 ring-1"
                >
                  <span>
                    {formatDateTime(u.at)} · {u.actor}
                  </span>
                  {u.counts && (
                    <span className="text-muted-foreground tabular-nums">
                      {u.counts.rows} rows · {u.counts.coursesCreated} new courses, {u.counts.coursesUpdated} updated ·{' '}
                      {u.counts.linksCreated} new links
                      {u.counts.programmesCreated > 0 && ` · ${u.counts.programmesCreated} new programmes`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          icon={<PageIcon name="globe" />}
          title="2 · Course content from courseware"
          description="Reads the objectives, outcomes, mapping, syllabus, books and session plan of each course from courseware.cutm.ac.in. A full import takes from a few minutes to a few hours, depending on how fast courseware answers. It runs in the background, so you can leave this page."
          action={<StartDialog />}
        >
          {runs.rows.length === 0 ? (
            <EmptyState icon={<PageIcon name="globe" />} text="No courseware import has run yet." />
          ) : (
            <DataTable
              columns={[
                {
                  header: 'Started',
                  cell: (r: SyncRunRow) => (
                    <Link href={`/admin/imports/${r.id}`} className="font-medium hover:underline">
                      {formatDateTime(r.startedAt)}
                    </Link>
                  ),
                },
                { header: 'Pages', cell: (r) => MODES.find(([mode]) => mode === r.mode)?.[1] ?? '—' },
                {
                  header: 'Progress',
                  cell: (r) => (
                    <span className="tabular-nums">
                      {r.stats.applied + r.stats.skipped + r.stats.failed} of {r.stats.rows ?? '…'}
                    </span>
                  ),
                },
                { header: 'Failed', cell: (r) => r.stats.failed, className: 'text-right tabular-nums' },
                { header: 'By', cell: (r) => r.actor },
                { header: 'Status', cell: (r) => <Badge variant={statusTone(r.status)}>{r.status}</Badge> },
              ]}
              rows={runs.rows}
              rowKey={(r) => r.id}
              total={runs.total}
              page={page}
              pageSize={pageSize}
              query={{}}
              path="/admin/imports"
              empty="No courseware import has run yet."
            />
          )}
        </Section>
      </div>
    </>
  );
}

function UploadDialog() {
  return (
    <FormDialog
      trigger={
        <Button>
          <FileArrowUpIcon weight="duotone" /> Upload course list
        </Button>
      }
      icon={<FileArrowUpIcon weight="duotone" />}
      title="Upload the course list"
      description="If any row is wrong nothing is saved, and the rows to fix are listed. Courses are matched by code: only their title and credits change, never their content."
      openParam="courses"
      action={importCourseList}
      submitLabel="Upload"
      successMessage="Course list imported."
    >
      <Field name="file" label="CSV file" hint="At most 5,000 rows. The columns are listed on this page.">
        <Input name="file" type="file" accept=".csv,text/csv" required />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="createProgrammes" value="true" className="accent-primary mt-0.5 size-4" />
        <span>
          Create programmes that do not exist yet
          <span className="text-muted-foreground block text-xs">
            They get a code from their name and no department; set the department on each programme page before creating
            offerings.
          </span>
        </span>
      </label>
    </FormDialog>
  );
}

function StartDialog() {
  return (
    <FormDialog
      trigger={
        <Button>
          <CloudArrowDownIcon weight="duotone" /> Start an import
        </Button>
      }
      icon={<PageIcon name="imports" className="size-8" />}
      title="Import from courseware"
      description="Content edited here is never overwritten. Anything an import cannot settle is noted on the course as “Needs review”."
      openParam="courseware"
      action={startCoursewareImport}
      submitLabel="Start"
      successMessage="Started. Opening its progress…"
    >
      <fieldset className="group/mode grid gap-2">
        <legend className="mb-2 text-sm font-medium">Which pages</legend>
        {MODES.map(([mode, label, help]) => (
          <label
            key={mode}
            className="ring-border/80 has-checked:ring-primary/40 has-checked:bg-primary/4 flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 ring-1"
          >
            <input
              type="radio"
              name="mode"
              value={mode}
              defaultChecked={mode === 'new'}
              className="accent-primary mt-0.5 size-4"
            />
            <span className="grid">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-muted-foreground text-xs">{help}</span>
            </span>
          </label>
        ))}
        {/* The page box appears for "One page" only (CSS only); the server checks it either way. */}
        <div className="hidden group-has-[input[value=one]:checked]/mode:block">
          <Field
            name="page"
            label="Page number or link"
            hint="Such as 836 or https://courseware.cutm.ac.in/course/836."
          >
            <Input name="page" maxLength={300} />
          </Field>
        </div>
      </fieldset>
    </FormDialog>
  );
}
