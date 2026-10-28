'use client';

import { useRef, useState, useTransition, type MouseEvent } from 'react';
import { CheckIcon, CircleNotchIcon, SparkleIcon } from '@phosphor-icons/react';
import { suggestMarks } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { PageIcon } from '@/components/page-icon';
import { Button } from '@/components/ui/button';

type Suggestion = {
  itemId: string;
  n: number;
  maxMarks: number;
  marks: number;
  criteria: { id: string; marks: number }[];
  reason: string;
};

export function SuggestMarks() {
  const [shown, setShown] = useState<{ note: string } | { suggestions: Suggestion[] } | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [asking, startAsking] = useTransition();
  const form = useRef<HTMLFormElement | null>(null);

  function ask(event: MouseEvent<HTMLButtonElement>) {
    const owner = event.currentTarget.form;
    if (!owner) return;
    form.current = owner;
    setShown(null);
    setAccepted([]);
    startAsking(async () => {
      const result = await suggestMarks(new FormData(owner));
      if (!result.ok) {
        setShown({ note: result.message });
        return;
      }
      setShown(result.data.length > 0 ? { suggestions: result.data } : { note: 'No suggestion available right now.' });
    });
  }

  function accept(suggestions: Suggestion[]) {
    const owner = form.current;
    if (!owner) return;
    for (const s of suggestions) {
      const fill = (selector: string, value: number) => {
        const box = owner.querySelector(selector);
        if (box instanceof HTMLInputElement) box.value = String(value);
      };
      if (s.criteria.length > 0) s.criteria.forEach((c) => fill(`input[data-criterion="${c.id}"]`, c.marks));
      else fill(`input[data-marks="${s.itemId}"]`, s.marks);
    }
    setAccepted((before) => [...new Set([...before, ...suggestions.map((s) => s.itemId)])]);
  }

  const suggestions = shown && 'suggestions' in shown ? shown.suggestions : [];
  const waiting = suggestions.filter((s) => !accepted.includes(s.itemId));
  return (
    <section className="surface grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
            <PageIcon name="sparkle" className="size-6" /> Evaluate with AI
          </h2>
          <p className="text-muted-foreground text-[0.8125rem]">
            Suggested marks for the written and code answers, each with a reason. The answers are sent without the
            student’s name, roll number or email.
          </p>
        </div>
        <span className="flex gap-2">
          {waiting.length > 1 && (
            <Button type="button" variant="outline" size="sm" onClick={() => accept(waiting)}>
              <CheckIcon /> Accept all
            </Button>
          )}
          <Button type="button" size="sm" disabled={asking} onClick={ask}>
            {asking ? <CircleNotchIcon className="animate-spin" /> : <SparkleIcon />}
            {suggestions.length > 0 ? 'Suggest again' : 'Suggest marks with AI'}
          </Button>
        </span>
      </div>
      {shown && 'note' in shown && (
        <p role="status" className="text-muted-foreground text-[0.8125rem]">
          {shown.note}
        </p>
      )}
      {suggestions.length > 0 && (
        <ul role="status" className="grid gap-2">
          {suggestions.map((s) => (
            <li
              key={s.itemId}
              className="bg-gold/10 ring-gold/30 flex flex-wrap items-center gap-3 rounded-md px-3.5 py-2.5 text-[0.8125rem] ring-1"
            >
              <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold">
                {s.n}
              </span>
              <b className="tabular-nums">
                {s.marks} / {s.maxMarks}
              </b>
              <span className="min-w-0 flex-1">{s.reason}</span>
              {accepted.includes(s.itemId) ? (
                <span className="text-success flex items-center gap-1 text-xs font-medium">
                  <CheckIcon className="size-4" /> In the mark box
                </span>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => accept([s])}>
                  Accept
                </Button>
              )}
            </li>
          ))}
          <li className="text-muted-foreground text-xs">
            Accepting fills in the mark; nothing is saved until you press Save marks. Change any mark you disagree with.
          </li>
        </ul>
      )}
    </section>
  );
}
