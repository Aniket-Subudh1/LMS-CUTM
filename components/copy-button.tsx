'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon, WarningIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

// Copies a value (a test's share link, TP-01) and says so for two seconds. The clipboard needs the browser.
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const settle = (next: 'copied' | 'failed') => {
    setState(next);
    window.setTimeout(() => setState('idle'), 2000);
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(
          () => settle('copied'),
          () => settle('failed'),
        )
      }
    >
      {state === 'copied' ? <CheckIcon /> : state === 'failed' ? <WarningIcon /> : <CopyIcon />}
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : label}</span>
    </Button>
  );
}
