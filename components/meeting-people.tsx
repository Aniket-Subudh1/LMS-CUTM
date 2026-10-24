'use client';

import { useEffect, useId, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { findPeople, matchPeople } from '@/app/(app)/meetings/actions';
import { FieldErrors } from '@/components/action-form';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/cn';
import type { Person } from '@/lib/data/meetings';
import { MEETING_LIMITS } from '@/lib/schemas/live';

type Invited = { person: Person; cohost: boolean };
type Option = { kind: 'person'; person: Person } | { kind: 'guest'; email: string };

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// The fields round, mock-up F1 A (like Google Calendar's guests): one box for everyone. A name, roll number or email
// finds people from the LMS; an email that is nobody's invites a guest; a pasted list is matched at once and what
// happened is said. Below, everyone invited with their role: staff may be made co-hosts there (at most four), students
// take part, guests wait in the lobby. The form receives `coHost[]`, `member[]` and `guests` as before.
export function MeetingPeople({
  owner,
  initial,
}: {
  // The meeting's host when it exists; null for a new one (the viewer).
  owner: Person | null;
  initial: { coHosts: Person[]; members: Person[]; guests: string[] };
}) {
  const id = useId();
  const [invited, setInvited] = useState<Invited[]>([
    ...initial.coHosts.map((person) => ({ person, cohost: true })),
    ...initial.members.map((person) => ({ person, cohost: false })),
  ]);
  const [guests, setGuests] = useState<string[]>(initial.guests);
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ q: string; people: Person[] }>({ q: '', people: [] });
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const q = text.trim();
  // A search waits for a pause in typing; only the answer to the latest text is used.
  useEffect(() => {
    if (q.length < 2) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void findPeople({ q }).then((result) => {
        if (current) setFound({ q, people: result.ok ? result.data : [] });
      });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  const has = (personId: string) => invited.some((i) => i.person.id === personId);
  const options: Option[] =
    q.length < 2 || found.q !== q
      ? []
      : [
          ...found.people.filter((p) => !has(p.id)).map((person) => ({ kind: 'person' as const, person })),
          ...(isEmail(q.toLowerCase()) && found.people.length === 0 && !guests.includes(q.toLowerCase())
            ? [{ kind: 'guest' as const, email: q.toLowerCase() }]
            : []),
        ];
  const members = invited.filter((i) => !i.cohost).length;
  const cohosts = invited.length - members;

  // Adds people and guests; says what was not added and why.
  function add(people: Person[], emails: string[], pasted: boolean, notFound: string[] = []) {
    const nextInvited = [...invited];
    const nextGuests = [...guests];
    let repeats = 0;
    let full = 0;
    for (const person of people) {
      if (nextInvited.some((i) => i.person.id === person.id)) repeats++;
      else if (nextInvited.filter((i) => !i.cohost).length >= MEETING_LIMITS.members) full++;
      else nextInvited.push({ person, cohost: false });
    }
    for (const email of emails) {
      if (nextGuests.includes(email)) repeats++;
      else if (nextGuests.length >= MEETING_LIMITS.guests) full++;
      else nextGuests.push(email);
    }
    const added = nextInvited.length + nextGuests.length - invited.length - guests.length;
    setInvited(nextInvited);
    setGuests(nextGuests);
    setText(notFound.join(', '));
    setActive(0);
    const notes = [
      pasted && added > 0 ? `Added ${added} from what you pasted.` : '',
      repeats > 0 ? `${repeats} ${repeats === 1 ? 'was' : 'were'} already invited.` : '',
      full > 0
        ? `A meeting has at most ${MEETING_LIMITS.members} people from the LMS and ${MEETING_LIMITS.guests} guests: ${full} not added.`
        : '',
      notFound.length > 0
        ? `${notFound.map((k) => `“${k}”`).join(', ')} ${notFound.length === 1 ? 'is' : 'are'} nobody you can invite from the LMS, and not an email address.`
        : '',
    ].filter(Boolean);
    setMessage(notes.length > 0 ? { text: notes.join(' '), error: full + notFound.length > 0 } : null);
  }

  // Emails and roll numbers, typed or pasted: people from the LMS where they match, otherwise guests by email.
  async function resolve(raw: string, pasted: boolean) {
    const keys = [...new Set(raw.split(/[\s,;]+/).filter(Boolean))].slice(0, 100);
    if (keys.length === 0) return;
    setBusy(true);
    const result = await matchPeople({ keys });
    setBusy(false);
    if (!result.ok) {
      setMessage({ text: result.message, error: true });
      return;
    }
    const matched = new Map(result.data.map((m) => [m.key, m.person]));
    const rest = keys.filter((k) => !matched.has(k));
    add(
      [...matched.values()],
      rest.filter((k) => isEmail(k.toLowerCase())).map((k) => k.toLowerCase()),
      pasted,
      rest.filter((k) => !isEmail(k.toLowerCase())),
    );
  }

  function pick(option: Option) {
    if (option.kind === 'person') add([option.person], [], false);
    else add([], [option.email], false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      setActive((active + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      setActive((active - 1 + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      // Enter never sends the form from here.
      event.preventDefault();
      if (options[active]) pick(options[active]);
      else if (q) void resolve(q, false);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (pasted.split(/[\s,;]+/).filter(Boolean).length < 2 && !pasted.includes('@')) return;
    event.preventDefault();
    void resolve(`${text} ${pasted}`, true);
  }

  const row = 'flex items-center gap-3 py-2';
  const avatar = (content: string, guest = false) => (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold',
        guest ? 'bg-card ring-border ring-1' : 'bg-muted',
      )}
    >
      {content}
    </span>
  );
  const remove = (label: string, onClick: () => void) => (
    <button
      type="button"
      aria-label={`Remove ${label}`}
      onClick={onClick}
      className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-7 shrink-0 place-items-center rounded-md"
    >
      <XIcon className="size-3.5" />
    </button>
  );
  const described = [`${id}-hint`, message && `${id}-message`].filter(Boolean).join(' ');
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          People
        </label>
        <div className="relative">
          <input
            id={id}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
              if (message?.error) setMessage(null);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={busy}
            placeholder="Add people or email addresses"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={options.length > 0}
            aria-controls={`${id}-options`}
            aria-activedescendant={options[active] ? `${id}-option-${active}` : undefined}
            aria-invalid={message?.error || undefined}
            aria-describedby={described}
            className="border-input bg-card placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-8 w-full min-w-0 rounded-md border px-2.5 text-base outline-none focus-visible:ring-[3px] disabled:opacity-60 md:text-sm"
          />
          {options.length > 0 && (
            <ul
              id={`${id}-options`}
              role="listbox"
              aria-label="People"
              className="bg-popover text-popover-foreground ring-foreground/10 absolute top-full z-10 mt-1 grid w-full rounded-md p-1 shadow-md ring-1"
            >
              {options.map((option, i) => (
                <li
                  key={option.kind === 'person' ? option.person.id : option.email}
                  id={`${id}-option-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(option);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5',
                    i === active && 'bg-accent',
                  )}
                >
                  {option.kind === 'person' ? avatar(initials(option.person.name)) : avatar('@', true)}
                  <span className="grid min-w-0">
                    <span className="truncate text-sm">
                      {option.kind === 'person' ? option.person.name : `Invite ${option.email} as a guest`}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {option.kind === 'person'
                        ? `${option.person.staff ? 'Staff' : 'Student'} · ${option.person.detail}`
                        : 'They get their own link and wait in the lobby until a host lets them in.'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p id={`${id}-hint`} className="text-muted-foreground text-xs leading-relaxed">
          Type a name, roll number or email, or paste a list from a sheet or an email. People from the LMS sign in to
          join; anyone else is a guest with their own link.
        </p>
        {message && (
          <p
            id={`${id}-message`}
            aria-live="polite"
            className={cn('text-sm', message.error ? 'text-destructive' : 'text-muted-foreground')}
          >
            {message.text}
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Invited · {invited.length + guests.length + 1}
        </h3>
        <ul className="divide-border/70 grid divide-y">
          <li className={row}>
            {avatar(owner ? initials(owner.name) : 'You')}
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-[0.8125rem] font-medium">{owner ? owner.name : 'You'}</span>
              <span className="text-muted-foreground truncate text-xs">{owner ? owner.detail : 'You schedule it'}</span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">Host</span>
            <span className="size-7 shrink-0" />
          </li>
          {invited.map(({ person, cohost }) => (
            <li key={person.id} className={row}>
              {avatar(initials(person.name))}
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[0.8125rem] font-medium">{person.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {person.staff ? 'Staff' : 'Student'} · {person.detail}
                </span>
              </span>
              {person.staff ? (
                // A dialog stretches every select to its width (form-dialog.tsx), so the box keeps it to its own.
                <div className="w-28 shrink-0">
                  <NativeSelect
                    size="sm"
                    value={cohost ? 'cohost' : 'member'}
                    aria-label={`Role of ${person.name}`}
                    onChange={(event) =>
                      setInvited(
                        invited.map((i) =>
                          i.person.id === person.id ? { ...i, cohost: event.target.value === 'cohost' } : i,
                        ),
                      )
                    }
                    className="w-full"
                  >
                    <NativeSelectOption value="cohost" disabled={!cohost && cohosts >= MEETING_LIMITS.coHosts}>
                      Co-host
                    </NativeSelectOption>
                    <NativeSelectOption value="member">Participant</NativeSelectOption>
                  </NativeSelect>
                </div>
              ) : (
                <span className="text-muted-foreground shrink-0 text-xs">Participant</span>
              )}
              {remove(person.name, () => setInvited(invited.filter((i) => i.person.id !== person.id)))}
              <input type="hidden" name={cohost ? 'coHost[]' : 'member[]'} value={person.id} />
            </li>
          ))}
          {guests.map((email) => (
            <li key={email} className={row}>
              {avatar('@', true)}
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[0.8125rem] font-medium">{email}</span>
                <span className="text-muted-foreground truncate text-xs">
                  Gets their own link and waits in the lobby
                </span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">Guest</span>
              {remove(email, () => setGuests(guests.filter((g) => g !== email)))}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Co-hosts are staff, at most {MEETING_LIMITS.coHosts}; they let guests in, mute, remove and record.
        </p>
      </div>
      <FieldErrors name="coHost[]" />
      <FieldErrors name="member[]" />
      <FieldErrors name="guests" />
      <input type="hidden" name="guests" value={guests.join('\n')} />
    </div>
  );
}
