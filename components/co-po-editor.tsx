'use client';

import { useState, type KeyboardEvent } from 'react';
import { CopyIcon, EraserIcon } from '@phosphor-icons/react';
import { levelTone, type OutcomeColumn } from '@/components/co-po-matrix';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

// The CO–PO grid in one save (AC-M01b-05): click a cell to go – → 1 → 2 → 3 → –, or type 0–3 (Delete clears).
// "Same as CO1" copies the first row, "Clear row" empties one. Every linked cell is sent as a hidden
// `cell[]` = `<coId>:<code>:<level>` for saveCoMap.
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
  const links = Object.keys(levels).length;

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
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Click a cell to set how strongly the outcome supports it:{' '}
        <span className="text-foreground font-medium">1 slight, 2 moderate, 3 high</span>, then back to none. Keys 0–3
        work too. <span className="text-foreground font-medium tabular-nums">{links}</span>{' '}
        {links === 1 ? 'link' : 'links'}.
      </p>
      <div className="ring-border overflow-x-auto rounded-xl ring-1">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="bg-muted sticky left-0 z-10 px-3 py-2 text-left text-xs font-medium tracking-wide uppercase">
                CO
              </th>
              {outcomes.map((o) => (
                <th key={o.code} className="px-1 py-2 text-center text-xs font-medium">
                  <abbr title={o.title || o.code} className="no-underline">
                    {o.code}
                  </abbr>
                </th>
              ))}
              <th className="px-3 py-2">
                <span className="sr-only">Row tools</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cos.map((co, row) => (
              <tr key={co.id} className="border-t">
                <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-1.5 text-left font-medium">
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
                          'focus-visible:ring-ring hover:ring-primary/40 cursor-pointer outline-none hover:ring-1 focus-visible:ring-2',
                          !level && 'bg-muted/50',
                        )}
                      >
                        {level ?? '–'}
                      </button>
                      {level && <input type="hidden" name="cell[]" value={`${key}:${level}`} />}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5">
                  <span className="flex justify-end gap-1">
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
