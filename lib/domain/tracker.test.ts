import { describe, expect, it } from 'vitest';
import { canMoveTask, computeTrackerMetrics } from './tracker';
import { TASK_STATUSES } from '@/lib/schemas/projects';

const at = (day: number) => new Date(Date.UTC(2026, 9, day));

describe('computeTrackerMetrics (07 §13)', () => {
  it('counts 2 done on time, 1 done late and 1 overdue as an on-time rate of 0.5', () => {
    const tasks = [
      { assigneeId: 's', status: 'done' as const, dueAt: at(10), doneAt: at(9) },
      { assigneeId: 's', status: 'done' as const, dueAt: at(12), doneAt: at(12) },
      { assigneeId: 's', status: 'done' as const, dueAt: at(14), doneAt: at(16) },
      { assigneeId: 's', status: 'in_progress' as const, dueAt: at(18), doneAt: null },
    ];
    expect(computeTrackerMetrics(tasks, at(20)).get('s')).toEqual({
      assigned: 4,
      done: 3,
      doneOnTime: 2,
      overdue: 1,
      onTimeRate: 0.5,
    });
  });
  it('has no on-time rate before anything is done or due', () => {
    const tasks = [{ assigneeId: 's', status: 'backlog' as const, dueAt: at(25), doneAt: null }];
    expect(computeTrackerMetrics(tasks, at(20)).get('s')).toMatchObject({ overdue: 0, onTimeRate: null });
  });
});

describe('canMoveTask (PRJ-06, PRJ-08)', () => {
  const ASSIGNEE = ['backlog→in_progress', 'in_progress→review', 'review→in_progress'];
  const pairs = TASK_STATUSES.flatMap((from) => TASK_STATUSES.map((to) => [from, to] as const));
  it.each(pairs)('%s → %s', (from, to) => {
    expect(canMoveTask('assignee', from, to)).toBe(ASSIGNEE.includes(`${from}→${to}`));
    expect(canMoveTask('faculty', from, to)).toBe(from !== to);
  });
});
