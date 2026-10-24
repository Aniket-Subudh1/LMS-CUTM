'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { FieldErrors } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type Kind = { value: string; label: string; prefix: string };
type Row = { key: number; text: string; kind: string };

// The fields round (mock-up F5): a list typed one item a line becomes a row each — moved up or down, removed, and
// with its kind chosen from a list where items have one (a session's theory, practice or project). Enter adds the
// next row, Backspace in an empty one removes it, and pasting several lines adds a row each, so a list copied from a
// document still goes in at once. The form receives the lines in one hidden field, each kind written as the prefix
// ("Practice: …") the server already reads.
export function ListEditor({
  name,
  label,
  hint,
  noun,
  initial,
  kinds = [],
  max,
  maxLength,
}: {
  name: string;
  label: string;
  hint?: string;
  // One item, for the buttons and the count: "session", "objective".
  noun: string;
  initial: readonly { text: string; kind?: string }[];
  // The first kind is the plain one, written without a prefix.
  kinds?: readonly Kind[];
  max: number;
  maxLength: number;
}) {
  const plain = kinds[0]?.value ?? '';
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((item, key) => ({ key, text: item.text, kind: item.kind ?? plain }))
      : [{ key: 0, text: '', kind: plain }],
  );
  // Keys for rows added later, after the first rows' 0, 1, 2…
  const next = useRef(Math.max(initial.length, 1));
  const row = (text: string, kind = plain): Row => ({ key: next.current++, text, kind });
  const [focus, setFocus] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    if (focus === null) return;
    const el = inputs.current.get(focus);
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [focus, rows]);

  // A pasted line's kind, from a prefix such as "Project:" in front of it.
  const parse = (line: string) => {
    const kind = kinds.find((k) => k.prefix && new RegExp(`^${k.prefix}\\s*:\\s*`, 'i').test(line));
    return kind ? row(line.replace(/^[^:]*:\s*/, ''), kind.value) : row(line);
  };
  const set = (key: number, change: Partial<Row>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const insertAfter = (index: number, added: Row[]) => {
    const room = max - rows.length;
    setMessage(added.length > room ? `At most ${max}: ${added.length - room} not added.` : null);
    const kept = added.slice(0, Math.max(0, room));
    if (kept.length === 0) return;
    setRows([...rows.slice(0, index + 1), ...kept, ...rows.slice(index + 1)]);
    setFocus(kept[kept.length - 1].key);
  };
  const remove = (index: number) => {
    const left = rows.filter((_, i) => i !== index);
    setRows(left.length > 0 ? left : [row('')]);
    setMessage(null);
    setFocus(left[Math.max(0, index - 1)]?.key ?? null);
  };
  const move = (index: number, by: -1 | 1) => {
    const moved = [...rows];
    [moved[index], moved[index + by]] = [moved[index + by], moved[index]];
    setRows(moved);
  };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      insertAfter(index, [row('', rows[index].kind)]);
    } else if (event.key === 'Backspace' && rows[index].text === '' && rows.length > 1) {
      event.preventDefault();
      remove(index);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    const lines = event.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    event.preventDefault();
    const [first, ...rest] = lines.map(parse);
    const current = rows[index];
    const merged = current.text
      ? { ...current, text: `${current.text} ${first.text}` }
      : { ...first, key: current.key };
    const replaced = rows.map((r, i) => (i === index ? merged : r));
    const room = max - rows.length;
    const kept = rest.slice(0, Math.max(0, room));
    setMessage(rest.length > room ? `At most ${max}: ${rest.length - room} not added.` : null);
    setRows([...replaced.slice(0, index + 1), ...kept, ...replaced.slice(index + 1)]);
    setFocus((kept.at(-1) ?? merged).key);
  }

  const filled = rows.filter((r) => r.text.trim());
  const prefixOf = (kind: string) => kinds.find((k) => k.value === kind)?.prefix ?? '';
  const lines = filled.map((r) => (prefixOf(r.kind) ? `${prefixOf(r.kind)}: ${r.text.trim()}` : r.text.trim()));
  const small =
    'text-muted-foreground hover:bg-muted hover:text-foreground grid size-7 shrink-0 place-items-center rounded-md disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5';
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  return (
    <fieldset className="grid content-start gap-3">
      <legend className="flex w-full items-baseline justify-between gap-3 pb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {filled.length} {filled.length === 1 ? noun : `${noun}s`}
        </span>
      </legend>
      <ol className="divide-border/70 grid divide-y">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-1 py-1.5">
            <span className="text-muted-foreground pt-1.5 text-right text-[0.8125rem] tabular-nums">{i + 1}</span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Input
                ref={(el) => {
                  if (el) inputs.current.set(r.key, el);
                  else inputs.current.delete(r.key);
                }}
                value={r.text}
                maxLength={maxLength}
                onChange={(event) => set(r.key, { text: event.target.value })}
                onKeyDown={(event) => onKeyDown(event, i)}
                onPaste={(event) => onPaste(event, i)}
                aria-label={`${Noun} ${i + 1}`}
                className="order-1 min-w-0 basis-full sm:order-2 sm:flex-1"
              />
              {kinds.length > 0 && (
                // A dialog stretches every select to its width (form-dialog.tsx), so the box keeps it to its own.
                <div className="order-2 w-28 shrink-0 sm:order-1">
                  <NativeSelect
                    value={r.kind}
                    onChange={(event) => set(r.key, { kind: event.target.value })}
                    aria-label={`Type of ${noun} ${i + 1}`}
                    className="w-full"
                  >
                    {kinds.map((k) => (
                      <NativeSelectOption key={k.value} value={k.value}>
                        {k.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
              <span className="order-3 ml-auto flex shrink-0">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${noun} ${i + 1} up`}
                  className={small}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${noun} ${i + 1} down`}
                  className={small}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${noun} ${i + 1}`}
                  className={small}
                >
                  <XIcon />
                </button>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={rows.length >= max}
        onClick={() => insertAfter(rows.length - 1, [row('', rows.at(-1)?.kind)])}
        className="border-input hover:bg-muted inline-flex h-8 items-center gap-1.5 justify-self-start rounded-md border border-dashed px-3 text-[0.8125rem] font-medium disabled:opacity-50 [&_svg]:size-3.5"
      >
        <PlusIcon /> Add {/^[aeiou]/i.test(noun) ? 'an' : 'a'} {noun}
      </button>
      {message && (
        <p aria-live="polite" className="text-destructive text-sm">
          {message}
        </p>
      )}
      <p className="text-muted-foreground text-xs leading-relaxed">
        {hint ? `${hint} ` : ''}Enter adds the next {noun}; Backspace in an empty one removes it. Pasting several lines
        adds {/^[aeiou]/i.test(noun) ? 'an' : 'a'} {noun} for each.
      </p>
      <FieldErrors name={name} />
      <input type="hidden" name={name} value={lines.join('\n')} />
    </fieldset>
  );
}
