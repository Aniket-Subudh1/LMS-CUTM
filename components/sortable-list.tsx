'use client';

import { startTransition, useId, useOptimistic, useState, type ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { DotsSixVerticalIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/cn';
import type { ActionResult } from '@/lib/errors';

type Item = { id: string; label: string; node: ReactNode };

// Drag to reorder (M03b, 08 §1): a handle in front of each server-rendered row. A pointer starts a drag after 5 px; a
// keyboard user tabs to the handle, presses Space, moves with the arrows and drops with Space. The dropped order shows
// at once and is sent whole to `action` as `ids[]`; if the save fails the list returns to the saved order. The rows'
// own ⋮ menus carry "Move up / down", so nothing depends on dragging.
export function SortableList({
  items,
  action,
  fields,
  noun,
  disabled = false,
  className,
}: {
  items: Item[];
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  fields: Record<string, string>;
  noun: string;
  disabled?: boolean;
  className?: string;
}) {
  const saved = items.map((item) => item.id);
  const [order, setOrder] = useOptimistic(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(items.map((item) => [item.id, item]));
  const label = (id: string | number) => byId.get(String(id))?.label ?? noun;
  const position = (id: string | number | undefined) => order.indexOf(String(id)) + 1;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function drop({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    for (const id of next) body.append('ids[]', id);
    setError(null);
    setSaving(true);
    startTransition(async () => {
      setOrder(next);
      const result = await action(body);
      setSaving(false);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className={cn('grid gap-2', className)}>
      {error && (
        <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
          <WarningCircleIcon weight="duotone" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <DndContext
        id={useId()}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={drop}
        accessibility={{
          screenReaderInstructions: {
            draggable: `To move this ${noun}, press Space, use the up and down arrows, then press Space again to drop it or Escape to cancel.`,
          },
          announcements: {
            onDragStart: ({ active }) =>
              `Picked up ${label(active.id)}, position ${position(active.id)} of ${order.length}.`,
            onDragOver: ({ active, over }) =>
              over ? `${label(active.id)} is over position ${position(over.id)} of ${order.length}.` : undefined,
            onDragEnd: ({ active, over }) =>
              over ? `${label(active.id)} dropped at position ${position(over.id)} of ${order.length}.` : undefined,
            onDragCancel: ({ active }) => `Moving ${label(active.id)} was cancelled.`,
          },
        }}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={disabled || saving}>
          <ol className={cn('grid gap-2', saving && 'opacity-70 transition-opacity')} aria-busy={saving}>
            {order.flatMap((id) => {
              const item = byId.get(id);
              return item ? [<Row key={id} item={item} noun={noun} disabled={disabled || saving} />] : [];
            })}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function Row({ item, noun, disabled }: { item: Item; noun: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition }}
      className={cn(
        'relative flex min-w-0 items-center gap-1 rounded-md',
        isDragging && 'bg-card ring-foreground/30 z-10 ring-1',
      )}
    >
      {!disabled && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Move ${noun}: ${item.label}`}
          className="text-muted-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-ring grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md outline-none focus-visible:ring-2 active:cursor-grabbing"
        >
          <DotsSixVerticalIcon weight="bold" className="size-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">{item.node}</div>
    </li>
  );
}
