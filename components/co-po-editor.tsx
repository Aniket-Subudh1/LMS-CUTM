'use client';

import { useState, useTransition, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { ArrowCounterClockwiseIcon, CircleNotchIcon, CopyIcon, EraserIcon, SparkleIcon } from '@phosphor-icons/react';
import { suggestCoMap } from '@/app/(app)/catalog/actions';
import { levelTone, MatrixFrame, type OutcomeColumn } from '@/components/co-po-matrix';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { mappingCoverage } from '@/lib/domain/catalog';

type Suggestion = {
  cells: { coId: string; outcome: string; level: number; rationale: string }[];
  untitled: string[];
  titlesAt: { id: string; code: string }[];
};

const list = new Intl.ListFormat('en-IN', { type: 'conjunction' });

// The CO–PO grid edited in place and saved together (AC-M01b-05; "Outcomes A", M03b): click a cell to go
// – → 1 → 2 → 3 → –, or type 0–3 (Delete clears). "Same as CO1" copies the first row, "Clear row" empties one. The
// average row follows the edits, and the count of unsaved cells offers Discard. Every linked cell is sent as a
// hidden `cell[]` = `<coId>:<code>:<level>` for saveCoMap, inside the page's form.
// M09 (CPP-07, mock-up A4): with `suggest`, "Suggest levels (AI)" puts the AI's cells into the grid as unsaved changes,
// each marked until it is changed, with the reasons below; nothing is stored until Save mapping.
export function CoPoEditor({
  cos,
  outcomes,
  cells,
  suggest,
}: {
  cos: { id: string; code: string; statement: string }[];
  outcomes: OutcomeColumn[];
  cells: Record<string, number>;
  suggest: { courseId: string; offeringId?: string } | null;
}) {
  const [levels, setLevels] = useState(cells);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, startAsking] = useTransition();
  const suggested = new Map(suggestion?.cells.map((c) => [`${c.coId}:${c.outcome}`, c.level]));
  const codeOf = new Map(cos.map((co) => [co.id, co.code]));
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

  function ask(params: { courseId: string; offeringId?: string }) {
    setNotice(null);
    startAsking(async () => {
      const result = await suggestCoMap(params);
      if (!result.ok) setNotice(result.message);
      else if (!result.data) setNotice('No suggestion available right now.');
      else {
        setSuggestion(result.data);
        update(result.data.cells.map((c) => [`${c.coId}:${c.outcome}`, c.level]));
      }
    });
  }

  function discard() {
    setLevels(cells);
    setSuggestion(null);
    setNotice(null);
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
          {suggest && (
            <Button type="button" variant="outline" size="sm" disabled={asking} onClick={() => ask(suggest)}>
              {asking ? <CircleNotchIcon className="animate-spin" /> : <SparkleIcon />}
              {suggestion ? 'Suggest again' : 'Suggest levels (AI)'}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={unsaved === 0} onClick={discard}>
            <ArrowCounterClockwiseIcon /> Discard
          </Button>
        </span>
      </div>
      {notice && (
        <p role="status" className="text-muted-foreground text-[0.8125rem]">
          {notice}
        </p>
      )}
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
              const fromAi = level !== cells[key] && suggested.get(key) === level;
              return (
                <td key={o.code} className="px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => update([[key, ((level ?? 0) + 1) % 4]])}
                    onKeyDown={(event) => onKey(event, key)}
                    aria-label={`${co.code} to ${o.code}: ${level ? `level ${level}` : 'no link'}${fromAi ? ', suggested by AI' : ''}`}
                    className={cn(
                      levelTone(level),
                      'focus-visible:ring-ring hover:ring-foreground/30 relative cursor-pointer outline-none hover:ring-1 focus-visible:ring-2',
                      !level && 'ring-border/80 ring-1',
                      level !== cells[key] && 'ring-warning ring-2',
                    )}
                  >
                    {level ?? '–'}
                    {fromAi && (
                      <span
                        aria-hidden="true"
                        className="bg-warning text-background absolute -top-1.5 -right-1.5 grid size-3.5 place-items-center rounded-full text-[0.4375rem] leading-none font-bold"
                      >
                        AI
                      </span>
                    )}
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
      {suggestion && (
        <div className="bg-gold/10 ring-gold/30 grid gap-1.5 rounded-md px-3.5 py-3 text-[0.8125rem] ring-1">
          <p className="flex items-center gap-2 font-semibold">
            <SparkleIcon className="size-4" /> Suggested by AI — review, then Save mapping
          </p>
          <p className="text-muted-foreground text-xs">
            The marked cells are the AI’s; nothing is saved until you press Save mapping, and Discard puts the saved
            grid back.
          </p>
          {suggestion.cells.length === 0 ? (
            <p>The AI found no outcome that these course outcomes clearly support.</p>
          ) : (
            <ul className="grid gap-1">
              {suggestion.cells.map((c) => (
                <li key={`${c.coId}:${c.outcome}`}>
                  <b className="font-semibold">
                    {codeOf.get(c.coId)} → {c.outcome} · {c.level}
                  </b>{' '}
                  — {c.rationale}
                </li>
              ))}
            </ul>
          )}
          {suggestion.untitled.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Not asked about {list.format(suggestion.untitled)}: the programme has not given them titles yet.{' '}
              {suggestion.titlesAt.length > 0 ? (
                <>
                  Add titles on{' '}
                  {suggestion.titlesAt.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ', '}
                      <Link href={`/admin/programs/${p.id}`} className="text-foreground underline underline-offset-2">
                        {p.code}
                      </Link>
                    </span>
                  ))}{' '}
                  and suggest again.
                </>
              ) : (
                'An administrator adds them on the programme’s page; then suggest again.'
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
