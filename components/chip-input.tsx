'use client';

import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { FieldErrors } from '@/components/action-form';
import { cn } from '@/lib/cn';

// What a value may be, what separates values in typed or pasted text, and how a value is written. Phrases (topics,
// commit messages) may hold spaces; the others are single words.
const KINDS = {
  email: {
    split: /[\s,;]+/,
    normal: (v: string) => v.toLowerCase(),
    ok: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    not: ['is not an email address', 'are not email addresses'],
  },
  domain: {
    split: /[\s,;]+/,
    normal: (v: string) => v.replace(/^@/, '').toLowerCase(),
    ok: (v: string) => /^[a-z\d-]+(\.[a-z\d-]+)+$/.test(v),
    not: ['is not a domain like cutm.ac.in', 'are not domains like cutm.ac.in'],
  },
  word: { split: /[\s,;]+/, normal: (v: string) => v, ok: () => true, not: ['', ''] },
  phrase: { split: /[\n,;]+/, normal: (v: string) => v.toLowerCase(), ok: () => true, not: ['', ''] },
} as const;

const quoted = (values: string[]) => values.map((v) => `“${v}”`).join(', ');

// The research for the fields round (PROGRESS, 24 Oct 2026): each value is a chip with its own remove button; Enter,
// a comma or a semicolon (and a space, for single words) adds what is typed, as does leaving the box; a pasted list is
// split, repeats are dropped, and anything not added is reported and kept in the box to fix. Suggestions, when given,
// follow the WAI-ARIA combobox pattern. The form receives the values in one hidden field, separated by commas, which
// the server already splits.
export function ChipInput({
  name,
  label,
  hint,
  kind,
  initial = [],
  max,
  maxLength = 120,
  placeholder,
  suggestions = [],
  tall = false,
  count = false,
}: {
  name: string;
  label: string;
  hint?: string;
  kind: keyof typeof KINDS;
  initial?: readonly string[];
  max: number;
  maxLength?: number;
  placeholder: string;
  // Values to offer as the viewer types, each with a word on it ("12 questions in the bank").
  suggestions?: readonly { value: string; detail: string }[];
  // A long list (email addresses): the box starts several lines high.
  tall?: boolean;
  // Shows how many there are of the most, and Clear all.
  count?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const rules = KINDS[kind];
  const [values, setValues] = useState<string[]>([...initial]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const typed = text.trim().toLowerCase();
  const options =
    open && typed.length > 0
      ? suggestions.filter((s) => s.value.includes(typed) && !values.includes(s.value)).slice(0, 8)
      : [];

  // Adds what the viewer typed or pasted; returns nothing, but says what was not added.
  function add(raw: string, pasted: boolean) {
    const next = [...values];
    const bad: string[] = [];
    const long: string[] = [];
    let repeats = 0;
    let over = 0;
    for (const part of raw.split(rules.split)) {
      const value = rules.normal(part.trim());
      if (!value) continue;
      if (next.includes(value)) repeats++;
      else if (!rules.ok(value)) bad.push(value);
      else if (value.length > maxLength) long.push(value);
      else if (next.length >= max) over++;
      else next.push(value);
    }
    const added = next.length - values.length;
    setValues(next);
    setText([...bad, ...long].join(', '));
    setActive(0);
    const notes = [
      pasted && added > 0 ? `Added ${added}.` : '',
      repeats > 0 && pasted ? `${repeats} ${repeats === 1 ? 'was' : 'were'} already in the list.` : '',
      bad.length > 0 ? `${quoted(bad)} ${rules.not[bad.length === 1 ? 0 : 1]}.` : '',
      long.length > 0 ? `Keep each to ${maxLength} characters: ${quoted(long)}.` : '',
      over > 0 ? `At most ${max}: ${over} not added.` : '',
    ].filter(Boolean);
    setMessage(notes.length > 0 ? { text: notes.join(' '), error: bad.length + long.length + over > 0 } : null);
  }

  function remove(value: string) {
    setValues(values.filter((v) => v !== value));
    setMessage(null);
    input.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const separators = rules.split.test(' ') ? [',', ';', ' '] : [',', ';'];
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      setActive((active + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      setActive((active - 1 + options.length) % options.length);
    } else if (event.key === 'Escape' && options.length > 0) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Enter' || separators.includes(event.key)) {
      // Enter never sends the form from here: it adds what is typed.
      event.preventDefault();
      if (event.key === 'Enter' && options[active]) add(options[active].value, false);
      else if (text.trim()) add(text, false);
    } else if (event.key === 'Backspace' && text === '' && values.length > 0) {
      remove(values[values.length - 1]);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (pasted.split(rules.split).filter(Boolean).length < 2) return;
    event.preventDefault();
    add(`${text}\n${pasted}`, true);
  }

  const described = [hint && `${id}-hint`, message && `${id}-message`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {count && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {values.length} of {max}
            {values.length > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => {
                    setValues([]);
                    setMessage(null);
                  }}
                  className="text-foreground underline underline-offset-2"
                >
                  Clear all
                </button>
              </>
            )}
          </span>
        )}
      </div>
      <div className="relative">
        <div
          onClick={() => input.current?.focus()}
          className={cn(
            'border-input bg-card focus-within:border-ring focus-within:ring-ring/50 flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border p-1.5 focus-within:ring-[3px]',
            tall && 'min-h-32 content-start',
            message?.error && 'border-destructive focus-within:border-destructive focus-within:ring-destructive/20',
          )}
        >
          {values.map((value) => (
            <span key={value} className="bg-muted inline-flex h-6 max-w-full items-center gap-1 rounded pl-2 text-xs">
              <span className="truncate">{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(value);
                }}
                className="text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={input}
            id={id}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
              setActive(0);
              if (message?.error) setMessage(null);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              if (text.trim()) add(text, false);
            }}
            placeholder={values.length >= max ? `At most ${max}` : placeholder}
            disabled={values.length >= max && text === ''}
            aria-invalid={message?.error || undefined}
            aria-describedby={described}
            {...(suggestions.length > 0 && {
              role: 'combobox',
              'aria-autocomplete': 'list' as const,
              'aria-expanded': options.length > 0,
              'aria-controls': `${id}-options`,
              'aria-activedescendant': options[active] ? `${id}-option-${active}` : undefined,
            })}
            className="placeholder:text-muted-foreground h-6 min-w-40 flex-1 bg-transparent px-1 text-sm outline-none"
          />
        </div>
        {options.length > 0 && (
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            className="bg-popover text-popover-foreground ring-foreground/10 absolute top-full z-10 mt-1 grid w-full rounded-md p-1 shadow-md ring-1"
          >
            {options.map((option, i) => (
              <li
                key={option.value}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(event) => {
                  // Keeps the focus in the box, so the option is added before the box would lose it.
                  event.preventDefault();
                  add(option.value, false);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('grid cursor-pointer rounded-sm px-2 py-1.5', i === active && 'bg-accent')}
              >
                <span className="text-sm">{option.value}</span>
                <span className="text-muted-foreground text-xs">{option.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {message && (
        <p
          id={`${id}-message`}
          aria-live="polite"
          className={cn('text-sm', message.error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {message.text}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs leading-relaxed">
          {hint}
        </p>
      )}
      <FieldErrors name={name} />
      <input type="hidden" name={name} value={values.join(', ')} />
    </div>
  );
}
