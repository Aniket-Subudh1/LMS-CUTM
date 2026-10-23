import type { TaskStatus } from '@/lib/schemas/projects';

// 07 §13 (PRJ-07): each assignee's deadlines. `onTimeRate` is over the tasks done or already due; null when none is.
export function computeTrackerMetrics(
  tasks: readonly { assigneeId: string; status: TaskStatus; dueAt: Date; doneAt: Date | null }[],
  now: Date,
): Map<string, { assigned: number; done: number; doneOnTime: number; overdue: number; onTimeRate: number | null }> {
  const byAssignee = new Map<string, typeof tasks>();
  for (const t of tasks) byAssignee.set(t.assigneeId, [...(byAssignee.get(t.assigneeId) ?? []), t]);
  return new Map(
    [...byAssignee].map(([assigneeId, mine]) => {
      const done = mine.filter((t) => t.status === 'done');
      const doneOnTime = done.filter((t) => t.doneAt !== null && t.doneAt <= t.dueAt).length;
      const due = mine.filter((t) => t.status === 'done' || t.dueAt <= now).length;
      return [
        assigneeId,
        {
          assigned: mine.length,
          done: done.length,
          doneOnTime,
          overdue: mine.filter((t) => t.status !== 'done' && t.dueAt < now).length,
          onTimeRate: due === 0 ? null : doneOnTime / due,
        },
      ];
    }),
  );
}

// PRJ-06, PRJ-08: an assignee moves their own task Backlog → In progress → Review and back from Review to In progress;
// the faculty member, as project manager, makes any move, Done and reopening included.
const ASSIGNEE_MOVES: Partial<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['in_progress'],
  in_progress: ['review'],
  review: ['in_progress'],
};

export function canMoveTask(actor: 'faculty' | 'assignee', from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return actor === 'faculty' || (ASSIGNEE_MOVES[from] ?? []).includes(to);
}
