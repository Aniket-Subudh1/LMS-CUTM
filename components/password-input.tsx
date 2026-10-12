'use client';

import { useState, type ComponentProps } from 'react';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <Input {...props} type={shown ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md outline-none focus-visible:ring-[3px] disabled:opacity-50"
      >
        {shown ? <EyeSlashIcon weight="duotone" className="size-4" /> : <EyeIcon weight="duotone" className="size-4" />}
      </button>
    </span>
  );
}
