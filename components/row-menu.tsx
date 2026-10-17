'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowDownIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowUpIcon,
  CircleNotchIcon,
  DotsThreeVerticalIcon,
} from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ActionResult } from '@/lib/errors';

type Action = (input: FormData) => Promise<ActionResult<unknown>>;
type Confirm = { title: string; message: string; confirmLabel: string; destructive?: boolean };

export type RowMenuItem =
  | { kind: 'link'; label: string; href: string; icon?: ReactNode }
  | {
      kind: 'action';
      label: string;
      icon?: ReactNode;
      action: Action;
      fields: Record<string, string | string[]>;
      confirm?: Confirm;
      destructive?: boolean;
    }
  | { kind: 'disabled'; label: string; reason: string; icon?: ReactNode }
  | { kind: 'separator' }
  // Where the "Move up / down" items of `move` go.
  | { kind: 'moves' };

// The row's place in an ordered list: each move sends the whole new order as `ids[]` (as SortableList does).
type Move = { id: string; ids: string[]; action: Action; fields: Record<string, string> };

type Running = Extract<RowMenuItem, { kind: 'action' }>;

function moves({ id, ids, action, fields }: Move): Running[] {
  const at = ids.indexOf(id);
  const to = (target: number) => {
    const next = ids.filter((other) => other !== id);
    next.splice(target, 0, id);
    return { ...fields, 'ids[]': next };
  };
  const last = ids.length - 1;
  const all: [string, number, ReactNode, boolean][] = [
    ['Move to top', 0, <ArrowLineUpIcon key="top" />, at > 1],
    ['Move up', at - 1, <ArrowUpIcon key="up" />, at > 0],
    ['Move down', at + 1, <ArrowDownIcon key="down" />, at < last],
    ['Move to bottom', last, <ArrowLineDownIcon key="bottom" />, at < last - 1],
  ];
  return all.flatMap(([label, target, icon, shown]) =>
    shown ? [{ kind: 'action', label, icon, action, fields: to(target) }] : [],
  );
}

// The ⋮ menu at the end of a row (M03b). Links open a page or a dialog through the URL; an action item sends its
// `fields` as form data, asking first when it has `confirm`. The confirmation, and the message of an action that failed,
// show in one AlertDialog held outside the menu, which closes as soon as an item is chosen (08 §1).
export function RowMenu({ label, items, move }: { label: string; items: RowMenuItem[]; move?: Move }) {
  const [asking, setAsking] = useState<Running | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(item: Running) {
    const body = new FormData();
    for (const [name, value] of Object.entries(item.fields)) {
      for (const one of Array.isArray(value) ? value : [value]) body.append(name, one);
    }
    setBusy(true);
    const result = await item.action(body);
    setBusy(false);
    setAsking(null);
    if (!result.ok) setError(result.message);
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${label}`}
            disabled={busy}
            className="text-muted-foreground shrink-0"
          >
            {busy ? <CircleNotchIcon className="animate-spin" /> : <DotsThreeVerticalIcon weight="bold" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-md">
          {items
            .flatMap((item): RowMenuItem[] => (item.kind === 'moves' ? (move ? moves(move) : []) : [item]))
            .map((item, i) => {
              if (item.kind === 'separator' || item.kind === 'moves') return <DropdownMenuSeparator key={i} />;
              if (item.kind === 'link') {
                return (
                  <DropdownMenuItem key={i} asChild>
                    <Link href={item.href} scroll={false}>
                      {item.icon}
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              }
              if (item.kind === 'disabled') {
                return (
                  <DropdownMenuItem key={i} disabled className="flex-wrap">
                    {item.icon}
                    {item.label}
                    <span className="text-muted-foreground w-full pl-6 text-xs">{item.reason}</span>
                  </DropdownMenuItem>
                );
              }
              return (
                <DropdownMenuItem
                  key={i}
                  variant={item.destructive ? 'destructive' : 'default'}
                  onSelect={() => (item.confirm ? setAsking(item) : void run(item))}
                >
                  {item.icon}
                  {item.label}
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={asking !== null || error !== null}
        onOpenChange={(open) => {
          if (open || busy) return;
          setAsking(null);
          setError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{error ? 'That did not work' : asking?.confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{error ?? asking?.confirm?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {error ? (
              <AlertDialogAction>OK</AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <Button
                  variant={asking?.confirm?.destructive ? 'destructive' : 'default'}
                  disabled={busy}
                  onClick={() => asking && void run(asking)}
                >
                  {busy && <CircleNotchIcon className="animate-spin" />}
                  {asking?.confirm?.confirmLabel}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
