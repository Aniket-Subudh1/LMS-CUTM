import { PrintButton } from '@/components/print-button';
import { Progress } from '@/components/ui/progress';
import type { SheetView } from '@/lib/data/exams';
import { cn } from '@/lib/cn';
import { formatDate, formatMarks } from '@/lib/format';
import type { Component } from '@/lib/schemas/exams';

const PART: Record<Component, string> = { theory: 'Theory', practice: 'Practice', project: 'Project' };

// M08 (mock-up E5 B, picked 23 Oct 2026; 07 §6): one term's grade sheet, a card per course with the grade large and
// each part as a bar, its internal + external out of 100. A student sees their published sheets; an admin sees any
// state before publishing. Printed, it is the sheet alone with the university's name.
export function GradeSheetCard({ sheet }: { sheet: SheetView }) {
  const said =
    sheet.status === 'published' && sheet.publishedAt
      ? `Published ${formatDate(sheet.publishedAt)}`
      : sheet.status === 'draft'
        ? 'Not published yet'
        : 'Incomplete';
  return (
    <section className="surface grid gap-4 p-4 [print-color-adjust:exact] sm:p-5 print:ring-0 [&>*]:min-w-0">
      <p className="hidden text-sm font-semibold print:block">
        Centurion University of Technology and Management · Grade sheet
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">
            {sheet.term.code} · {sheet.term.name}
          </h2>
          <p className="text-muted-foreground text-[0.8125rem]">
            {[said, sheet.student.name, sheet.student.rollNo, sheet.student.batch].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Figure label="Credits" value={String(sheet.credits)} />
          {sheet.sgpa !== null && <Figure label="SGPA" value={sheet.sgpa.toFixed(2)} />}
          {sheet.status !== 'incomplete' && <PrintButton />}
        </div>
      </div>
      {sheet.status === 'incomplete' ? (
        <ul className="text-warning grid gap-1 text-[0.8125rem]">
          {sheet.missing.map((why) => (
            <li key={why}>{why}</li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 print:grid-cols-2">
          {sheet.rows.map((row) => (
            <article
              key={row.code}
              className="ring-border/70 grid break-inside-avoid content-start gap-3 rounded-md p-3.5 ring-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid min-w-0">
                  <span className="font-semibold">
                    {row.code} · {row.title}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {row.creditTotal} credits ({row.credits})
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
                    {row.pct}% · {row.gradePoint} points
                  </span>
                  <span
                    className={cn(
                      'grid h-9 min-w-9 place-items-center rounded-md px-2 text-base font-semibold',
                      row.gradePoint === 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
                    )}
                  >
                    {row.grade}
                  </span>
                </div>
              </div>
              <dl className="grid gap-1.5 text-[0.8125rem]">
                {row.components.map((c) => (
                  <div key={c.component} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3">
                    <dt className="text-muted-foreground">{PART[c.component]}</dt>
                    <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <Progress value={c.marks} className="w-20 shrink-0" aria-hidden />
                      <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                        {formatMarks(c.internal)}/{c.internalMax} +{' '}
                        {c.absent || c.external === null ? 'AB' : formatMarks(c.external)}/{c.externalMax}
                      </span>
                    </dd>
                    <dd className="font-medium tabular-nums">{formatMarks(c.marks)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Each part is its internal + external marks, out of 100. The course % weighs the parts by their credits and
        rounds up once. AB means absent.
      </p>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid text-right">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-lg leading-tight font-semibold tabular-nums">{value}</span>
    </span>
  );
}
