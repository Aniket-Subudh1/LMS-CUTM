'use client';

import { useState, useTransition, type MouseEvent } from 'react';
import { CircleNotchIcon, SparkleIcon } from '@phosphor-icons/react';
import { suggestItemTags } from '@/app/(app)/tests/bank/actions';
import { Button } from '@/components/ui/button';

type Shown = { note: string } | { codes: string[]; level: string; rationale: string };

const list = new Intl.ListFormat('en-IN', { type: 'conjunction' });
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// M09 (CPP-07, mock-up A3): "Suggest outcomes (AI)" in the question dialog. It sends the dialog's form as it stands
// (its test or course bank, the unsaved question and its options), then ticks the suggested outcomes and picks the
// Bloom level in that same form. Nothing is stored until the teacher saves the question.
export function SuggestOutcomes({ cos }: { cos: { id: string; code: string }[] }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [asking, startAsking] = useTransition();

  function ask(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    setShown(null);
    startAsking(async () => {
      const result = await suggestItemTags(new FormData(form));
      if (!result.ok) {
        setShown({ note: result.fieldErrors?.prompt?.[0] ?? result.message });
        return;
      }
      if (!result.data) {
        setShown({ note: 'No suggestion available right now.' });
        return;
      }
      const { coIds, bloomLevel, rationale } = result.data;
      for (const box of form.querySelectorAll<HTMLInputElement>('input[name="cos[]"]')) {
        box.checked = coIds.includes(box.value);
      }
      const select = form.elements.namedItem('bloomLevel');
      if (select instanceof HTMLSelectElement) select.value = bloomLevel;
      setShown({ codes: cos.filter((co) => coIds.includes(co.id)).map((co) => co.code), level: bloomLevel, rationale });
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={asking}
        onClick={ask}
        // On the line of the fieldset's legend, which sits above the fieldset's content box (the legend leaves room).
        className="absolute -top-9 right-0"
      >
        {asking ? <CircleNotchIcon className="animate-spin" /> : <SparkleIcon />}
        {shown && 'codes' in shown ? 'Suggest again' : 'Suggest outcomes (AI)'}
      </Button>
      {shown && 'note' in shown && (
        <p role="status" className="text-muted-foreground text-[0.8125rem]">
          {shown.note}
        </p>
      )}
      {shown && 'codes' in shown && (
        <div
          role="status"
          className="bg-gold/10 ring-gold/30 grid gap-1 rounded-md px-3.5 py-3 text-[0.8125rem] ring-1"
        >
          <p className="flex items-center gap-2 font-semibold">
            <SparkleIcon className="size-4" /> Suggested by AI — review, then Save
          </p>
          <p>
            <b className="font-semibold">
              {list.format(shown.codes)} · {cap(shown.level)}.
            </b>{' '}
            {shown.rationale}
          </p>
          <p className="text-muted-foreground text-xs">
            Nothing is saved until you press Save. Change the ticks or the level if you disagree.
          </p>
        </div>
      )}
    </>
  );
}
