'use client';

import { useRef, useState } from 'react';
import { PlusIcon, XIcon } from '@phosphor-icons/react';
import { FieldErrors } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

// The fields round (mock-ups F3, F4): settings that were typed as lines of values separated by "|" become tables with a
// row each. The form still receives those lines in one hidden field, which the settings schema reads as before.

type Grade = { key: number; grade: string; minPct: string; points: string };
const MAX_GRADES = 12;

const th = 'text-muted-foreground px-2 pb-2 text-left text-xs font-medium';
const remove = 'text-muted-foreground hover:bg-muted hover:text-foreground grid size-7 place-items-center rounded-md';
const add =
  'border-input hover:bg-muted inline-flex h-8 items-center gap-1.5 justify-self-start rounded-md border border-dashed px-3 text-[0.8125rem] font-medium disabled:opacity-50 [&_svg]:size-3.5';
const number = 'h-8 w-16 text-right tabular-nums';
// The bar's shades, the lowest grade apart in red; the darker half carries white text.
const SHADES = [
  'bg-primary/10',
  'bg-primary/15',
  'bg-primary/20',
  'bg-primary/30',
  'bg-primary/40',
  'bg-primary/55',
  'bg-primary/70',
  'bg-primary/85',
];
const shade = (i: number, n: number) => {
  if (i === 0) return 'bg-destructive/15 text-foreground';
  const step = n <= 2 ? SHADES.length - 1 : Math.round(((i - 1) / (n - 2)) * (SHADES.length - 1));
  return cn(SHADES[step], step >= 5 && 'text-primary-foreground');
};

// Mock-up F3: the grades highest first, each from its own % up to the grade above; the last always starts at 0. A bar
// shows how 0–100 % is shared out, so a gap or an overlap shows before saving.
export function GradeScaleEditor({
  name,
  initial,
  recommended,
  hint,
}: {
  name: string;
  initial: readonly { grade: string; minPct: number; points: number }[];
  recommended: readonly { grade: string; minPct: number; points: number }[];
  hint: string;
}) {
  const toRows = (scale: typeof initial) =>
    scale.map((g, key) => ({ key, grade: g.grade, minPct: String(g.minPct), points: String(g.points) }));
  const [rows, setRows] = useState<Grade[]>(() => toRows(initial));
  const next = useRef(initial.length);
  const set = (key: number, change: Partial<Grade>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const last = rows.length - 1;
  const from = (i: number) => (i === last ? 0 : Number(rows[i].minPct));
  // Each grade's share of 0–100 %, lowest first; none when the numbers do not make one yet.
  const bands = rows
    .map((r, i) => ({ grade: r.grade || '?', from: from(i), to: i === 0 ? 100 : Number(rows[i - 1].minPct) }))
    .reverse();
  const drawable = bands.every(
    (b, i) => Number.isFinite(b.from) && b.to > b.from && (i === 0 || b.from === bands[i - 1].to),
  );
  // Where a grade starts, skipping one too close to the last shown to fit its number.
  const ticks = bands.reduce<typeof bands>(
    (shown, b) =>
      shown.length === 0 || (b.from - shown[shown.length - 1].from >= 6 && 100 - b.from >= 6) ? [...shown, b] : shown,
    [],
  );
  const lines = rows.map((r, i) => `${r.grade.trim()} | ${i === last ? 0 : r.minPct.trim()} | ${r.points.trim()}`);
  return (
    <div className="grid min-w-0 content-start gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Grade scale</span>
        <button
          type="button"
          onClick={() => {
            const base = next.current;
            next.current += recommended.length;
            setRows(toRows(recommended).map((r) => ({ ...r, key: base + r.key })));
          }}
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
        >
          Use the recommended scale
        </button>
      </div>
      <div className="ring-border/70 justify-self-start overflow-x-auto rounded-md px-2 pt-3 pb-1 ring-1 max-sm:justify-self-stretch">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className={th}>Grade</th>
              <th className={cn(th, 'text-right')}>From %</th>
              <th className={cn(th, 'max-sm:hidden')}>Up to</th>
              <th className={cn(th, 'text-right')}>Points</th>
              <th className={th}>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const called = r.grade || `row ${i + 1}`;
              return (
                <tr key={r.key} className="border-border/70 border-t">
                  <td className="px-2 py-1.5">
                    <Input
                      value={r.grade}
                      maxLength={4}
                      onChange={(event) => set(r.key, { grade: event.target.value })}
                      aria-label={`Grade, ${called}`}
                      className="h-8 w-16 font-medium"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {i === last ? (
                      <span className="text-muted-foreground flex h-8 w-16 items-center justify-end px-2.5 text-sm tabular-nums">
                        0
                      </span>
                    ) : (
                      <Input
                        value={r.minPct}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="any"
                        onChange={(event) => set(r.key, { minPct: event.target.value })}
                        aria-label={`From %, ${called}`}
                        className={number}
                      />
                    )}
                  </td>
                  <td className="text-muted-foreground w-28 px-3 py-1.5 text-[0.8125rem] whitespace-nowrap tabular-nums max-sm:hidden">
                    {i === 0 ? '100 %' : `below ${rows[i - 1].minPct || '…'} %`}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={r.points}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={10}
                      step={0.5}
                      onChange={(event) => set(r.key, { points: event.target.value })}
                      aria-label={`Points, ${called}`}
                      className={number}
                    />
                  </td>
                  <td className="py-1.5 pr-1 pl-2">
                    {i !== last && rows.length > 2 && (
                      <button
                        type="button"
                        aria-label={`Remove ${called}`}
                        onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                        className={remove}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={rows.length >= MAX_GRADES}
        // A new grade goes above the last, which always starts at 0.
        onClick={() =>
          setRows([...rows.slice(0, last), { key: next.current++, grade: '', minPct: '', points: '' }, rows[last]])
        }
        className={add}
      >
        <PlusIcon /> Add a grade
      </button>
      <div className="grid gap-1.5 pt-1">
        <span className="text-muted-foreground text-xs">How 0–100 % is shared out</span>
        {drawable ? (
          <>
            <div
              role="img"
              aria-label={bands.map((b) => `${b.grade} from ${b.from} to ${b.to} %`).join(', ')}
              className="flex overflow-hidden rounded-md"
            >
              {bands.map((b, i) => (
                <span
                  key={`${b.grade}-${b.from}`}
                  title={`${b.grade}: ${b.from}–${b.to} %`}
                  style={{ width: `${b.to - b.from}%` }}
                  className={cn(
                    'border-card grid h-8 min-w-0 place-items-center overflow-hidden border-r text-[0.6875rem] font-semibold last:border-r-0',
                    shade(i, bands.length),
                  )}
                >
                  {b.grade}
                </span>
              ))}
            </div>
            <div className="relative h-4" aria-hidden="true">
              {ticks.map((b) => (
                <span
                  key={b.from}
                  style={{ left: `${b.from}%` }}
                  className="text-muted-foreground absolute text-[0.6875rem] tabular-nums first:translate-x-0 [&:not(:first-child)]:-translate-x-1/2"
                >
                  {b.from}
                </span>
              ))}
              <span className="text-muted-foreground absolute right-0 text-[0.6875rem] tabular-nums">100</span>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">Shown once each grade starts below the one above it.</p>
        )}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>
      <FieldErrors name={name} />
      <input type="hidden" name={name} value={lines.join('\n')} />
    </div>
  );
}

type Language = { key: number; id: string; label: string; runnerId: string };
const MAX_LANGUAGES = 10;

// Mock-up F4: the languages code questions may use, a row each.
export function LanguagesEditor({
  name,
  initial,
  hint,
}: {
  name: string;
  initial: readonly { key: string; label: string; runnerId: number }[];
  hint: string;
}) {
  const [rows, setRows] = useState<Language[]>(() =>
    initial.map((l, key) => ({ key, id: l.key, label: l.label, runnerId: String(l.runnerId) })),
  );
  const next = useRef(initial.length);
  const set = (key: number, change: Partial<Language>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const lines = rows
    .filter((r) => r.id.trim() || r.label.trim() || r.runnerId.trim())
    .map((r) => `${r.id.trim()} | ${r.label.trim()} | ${r.runnerId.trim()}`);
  return (
    <div className="grid min-w-0 content-start gap-3">
      <span className="text-sm font-medium">Languages</span>
      <div className="ring-border/70 overflow-x-auto rounded-md px-2 pt-3 pb-1 ring-1">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-28 max-sm:w-[5.5rem]" />
            <col />
            <col className="w-20 max-sm:w-16" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>Key</th>
              <th className={th}>Name students see</th>
              <th className={cn(th, 'text-right')}>Runner id</th>
              <th className={th}>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const called = r.label || r.id || `row ${i + 1}`;
              return (
                <tr key={r.key} className="border-border/70 border-t">
                  <td className="px-2 py-1.5">
                    <Input
                      value={r.id}
                      maxLength={20}
                      onChange={(event) => set(r.key, { id: event.target.value })}
                      aria-label={`Key, ${called}`}
                      className="h-8 font-mono text-[0.8125rem]"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={r.label}
                      maxLength={60}
                      onChange={(event) => set(r.key, { label: event.target.value })}
                      aria-label={`Name students see, ${called}`}
                      className="h-8"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={r.runnerId}
                      inputMode="numeric"
                      onChange={(event) => set(r.key, { runnerId: event.target.value })}
                      aria-label={`Runner id, ${called}`}
                      className="h-8 text-right tabular-nums"
                    />
                  </td>
                  <td className="py-1.5 pr-1 pl-2">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${called}`}
                        onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                        className={remove}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={rows.length >= MAX_LANGUAGES}
        onClick={() => setRows([...rows, { key: next.current++, id: '', label: '', runnerId: '' }])}
        className={add}
      >
        <PlusIcon /> Add a language
      </button>
      <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>
      <FieldErrors name={name} />
      <input type="hidden" name={name} value={lines.join('\n')} />
    </div>
  );
}
