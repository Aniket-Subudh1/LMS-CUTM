'use client';

import { useEffect, useId, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { findPeople } from '@/app/(app)/meetings/actions';
import type { Person } from '@/lib/data/meetings';
import type { PEOPLE_SCOPES } from '@/lib/schemas/live';

// M03c T4: people picked from the LMS by name, roll number or email, shown as chips and posted as hidden `name`
// inputs. The server searches only people the viewer may invite (09 §3), and checks them again on save. The fields round
// (mock-up F6): an offering's faculty from other departments, found by name instead of typed as emails.
export function PeoplePicker({
  name,
  initial,
  max,
  scope = 'all',
  placeholder,
}: {
  name: string;
  initial: Person[];
  max: number;
  scope?: (typeof PEOPLE_SCOPES)[number];
  placeholder: string;
}) {
  const [chosen, setChosen] = useState<Person[]>(initial);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; people: Person[]; message: string | null }>({
    q: '',
    people: [],
    message: null,
  });
  const listId = useId();
  const text = q.trim();
  const full = chosen.length >= max;

  // A search waits for a pause in typing; only the answer to the latest text is shown.
  useEffect(() => {
    if (text.length < 2) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void findPeople({ q: text, scope }).then((result) => {
        if (!current) return;
        setFound(
          result.ok
            ? {
                q: text,
                people: result.data,
                message: result.data.length > 0 ? null : 'Nobody found. Try a whole name, a roll number or an email.',
              }
            : { q: text, people: [], message: result.message },
        );
      });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [text, scope]);

  const options = found.q === text ? found.people.filter((p) => !chosen.some((c) => c.id === p.id)) : [];
  const pick = (person: Person) => {
    setChosen([...chosen, person]);
    setQ('');
  };

  return (
    <div className="relative grid gap-1.5">
      <div className="border-input bg-card focus-within:ring-ring/50 flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border p-1.5 focus-within:ring-[3px]">
        {chosen.map((p) => (
          <span key={p.id} className="bg-muted inline-flex h-6 max-w-full items-center gap-1.5 rounded pl-2 text-xs">
            <span className="truncate">
              {p.name} <span className="text-muted-foreground">· {p.detail}</span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              onClick={() => setChosen(chosen.filter((c) => c.id !== p.id))}
              className="text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded"
            >
              <XIcon className="size-3" />
            </button>
            <input type="hidden" name={name} value={p.id} />
          </span>
        ))}
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (options[0]) pick(options[0]);
            }
          }}
          disabled={full}
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-label={placeholder}
          placeholder={full ? `At most ${max}` : placeholder}
          className="placeholder:text-muted-foreground h-6 min-w-40 flex-1 bg-transparent px-1 text-sm outline-none"
        />
      </div>
      {text.length >= 2 && found.q === text && (options.length > 0 || found.message) && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground ring-foreground/10 absolute top-full z-10 mt-1 grid w-full rounded-md p-1 shadow-md ring-1"
        >
          {options.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button
                type="button"
                onClick={() => pick(p)}
                className="hover:bg-accent grid w-full rounded-sm px-2 py-1.5 text-left text-sm"
              >
                <span>{p.name}</span>
                <span className="text-muted-foreground text-xs">{p.detail}</span>
              </button>
            </li>
          ))}
          {options.length === 0 && found.message && (
            <li className="text-muted-foreground px-2 py-1.5 text-xs">{found.message}</li>
          )}
        </ul>
      )}
    </div>
  );
}
