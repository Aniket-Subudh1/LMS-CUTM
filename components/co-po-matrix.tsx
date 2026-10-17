import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { mappingCoverage, type OutcomeCoverage } from '@/lib/domain/catalog';

export type OutcomeColumn = { code: string; title: string };

export const levelTone = (level: number | undefined) =>
  cn(
    'inline-grid size-7 place-items-center rounded-md text-xs font-semibold tabular-nums',
    level === 3 && 'bg-primary text-primary-foreground',
    level === 2 && 'bg-primary/25 text-primary',
    level === 1 && 'bg-primary/10 text-primary',
    !level && 'text-muted-foreground',
  );

// The grid's frame, shared with CoPoEditor (M03b): COs are rows, PO1–PO12 and then the PSOs (in teal) are columns, a
// programme's title shows on hover, and the last row is each column's average level over its links ("—" where no CO
// supports it).
export function MatrixFrame({
  outcomes,
  coverage,
  tools,
  children,
}: {
  outcomes: OutcomeColumn[];
  coverage: OutcomeCoverage[];
  // A header for a last column of row tools (the editor's "Same as CO1", "Clear row").
  tools?: string;
  children: ReactNode;
}) {
  const head = 'text-muted-foreground h-9 px-1 text-center text-[0.6875rem] font-medium tracking-wide uppercase';
  // `relative` keeps the visually hidden column header inside the scrolling box; otherwise it is placed against the
  // page and widens it on a phone.
  return (
    <div className="ring-border/70 relative overflow-x-auto rounded-md ring-1">
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b">
            <th className={cn(head, 'bg-card sticky left-0 z-10 px-3 text-left')}>CO</th>
            {outcomes.map((o) => (
              <th key={o.code} className={cn(head, o.code.startsWith('PSO') && 'text-teal')}>
                <abbr title={o.title || o.code} className="no-underline">
                  {o.code}
                </abbr>
              </th>
            ))}
            {tools && (
              <th className={head}>
                <span className="sr-only">{tools}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-border/70 [&>tr:not(:last-child)]:border-b">{children}</tbody>
        <tfoot>
          <tr className="bg-muted/50 border-t">
            <th scope="row" className="bg-muted sticky left-0 z-10 px-3 py-2 text-left text-xs font-semibold">
              Average
            </th>
            {coverage.map((o) => (
              <td key={o.code} className="px-1 py-2 text-center text-xs font-medium tabular-nums">
                {o.average ?? (
                  <span className="text-muted-foreground" aria-label="no link">
                    —
                  </span>
                )}
              </td>
            ))}
            {tools && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Read only; CoPoEditor edits it. A cell key is `<coId>:<code>`; the level is 1–3, or "–" for no link.
export function CoPoMatrix({
  cos,
  outcomes,
  cells,
}: {
  cos: { id: string; code: string; statement: string }[];
  outcomes: OutcomeColumn[];
  cells: Record<string, number>;
}) {
  const coverage = mappingCoverage(
    cos.map((co) => co.id),
    outcomes.map((o) => o.code),
    cells,
  );
  return (
    <MatrixFrame outcomes={outcomes} coverage={coverage.outcomes}>
      {cos.map((co) => (
        <tr key={co.id}>
          <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-1.5 text-left font-semibold">
            <abbr title={co.statement} className="no-underline">
              {co.code}
            </abbr>
          </th>
          {outcomes.map((o) => {
            const level = cells[`${co.id}:${o.code}`];
            return (
              <td key={o.code} className="px-1 py-1.5 text-center">
                <span className={levelTone(level)} aria-label={`${co.code} to ${o.code}: ${level ?? 'no link'}`}>
                  {level ?? '–'}
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </MatrixFrame>
  );
}
