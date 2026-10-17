'use client';

import { useState, type KeyboardEvent } from 'react';
import { ArrowCounterClockwiseIcon, CopyIcon, EraserIcon } from '@phosphor-icons/react';
import { levelTone, MatrixFrame, type OutcomeColumn } from '@/components/co-po-matrix';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { mappingCoverage } from '@/lib/domain/catalog';

// The CO–PO grid edited in place and saved together (AC-M01b-05; "Outcomes A", M03b): click a cell to go
// – → 1 → 2 → 3 → –, or type 0–3 (Delete clears). "Same as CO1" copies the first row, "Clear row" empties one. The
// average row follows the edits, and the count of unsaved cells offers Discard. Every linked cell is sent as a
// hidden `cell[]` = `<coId>:<code>:<level>` for saveCoMap, inside the page's form.
export function CoPoEditor({
  cos,
  outcomes,
  cells,
}: {
  cos: { id: string; code: string; statement: string }[];
  outcomes: OutcomeColumn[];
  cells: Record<string, number>;
}) {
  const [levels, setLevels] = useState(cells);
  const unsaved = [...new Set([...Object.keys(levels), ...Object.keys(cells)])].filter(
    (key) => levels[key] !== cells[key],
  ).length;
  const coverage = mappingCoverage(
    cos.map((co) => co.id),
    outcomes.map((o) => o.code),
    levels,
  );

  function update(changes: [key: string, level: number][]) {
    setLevels((current) => {
      const next = { ...current };
      for (const [key, level] of changes) {
        if (level > 0) next[key] = level;
        else delete next[key];
      }
      return next;
    });
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    const digit = Number(event.key);
    if (event.key.length === 1 && digit >= 0 && digit <= 3) update([[key, digit]]);
    else if (event.key === 'Delete' || event.key === 'Backspace') update([[key, 0]]);
    else return;
    event.preventDefault();
  }

  const first = cos[0];
  // A grid item inside the form: min-w-0 lets the table scroll within the card instead of widening the page.
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-muted-foreground text-[0.8125rem]">
          Click a cell to change it: – → 1 → 2 → 3. Keys 0–3 work too. Changes are saved together.
        </p>
        <span className="flex items-center gap-2">
          <span
            role="status"
            className={cn(
              'text-[0.8125rem] tabular-nums',
              unsaved ? 'text-warning font-medium' : 'text-muted-foreground',
            )}
          >
            {unsaved === 0 ? 'No unsaved changes' : `${unsaved} unsaved change${unsaved === 1 ? '' : 's'}`}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={unsaved === 0} onClick={() => setLevels(cells)}>
            <ArrowCounterClockwiseIcon /> Discard
          </Button>
        </span>
      </div>
      <MatrixFrame outcomes={outcomes} coverage={coverage.outcomes} tools="Row tools">
        {cos.map((co, row) => (
          <tr key={co.id}>
            <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-1.5 text-left font-semibold">
              <abbr title={co.statement} className="no-underline">
                {co.code}
              </abbr>
            </th>
            {outcomes.map((o) => {
              const key = `${co.id}:${o.code}`;
              const level = levels[key];
              return (
                <td key={o.code} className="px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => update([[key, ((level ?? 0) + 1) % 4]])}
                    onKeyDown={(event) => onKey(event, key)}
                    aria-label={`${co.code} to ${o.code}: ${level ? `level ${level}` : 'no link'}`}
                    className={cn(
                      levelTone(level),
                      'focus-visible:ring-ring hover:ring-foreground/30 cursor-pointer outline-none hover:ring-1 focus-visible:ring-2',
                      !level && 'ring-border/80 ring-1',
                      level !== cells[key] && 'ring-warning ring-2',
                    )}
                  >
                    {level ?? '–'}
                  </button>
                  {level && <input type="hidden" name="cell[]" value={`${key}:${level}`} />}
                </td>
              );
            })}
            <td className="px-2 py-1.5">
              <span className="flex justify-end gap-0.5">
                {row > 0 && first && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={`Same as ${first.code}`}
                    aria-label={`${co.code}: same as ${first.code}`}
                    onClick={() =>
                      update(outcomes.map((o) => [`${co.id}:${o.code}`, levels[`${first.id}:${o.code}`] ?? 0]))
                    }
                  >
                    <CopyIcon />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Clear row"
                  aria-label={`Clear ${co.code}`}
                  onClick={() => update(outcomes.map((o) => [`${co.id}:${o.code}`, 0]))}
                >
                  <EraserIcon />
                </Button>
              </span>
            </td>
          </tr>
        ))}
      </MatrixFrame>
    </div>
  );
}
