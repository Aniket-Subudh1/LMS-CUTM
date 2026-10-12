import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const viewer = vi.fn();
vi.mock('@/lib/auth/session', () => ({ getViewer: () => viewer() }));
const logError = vi.fn();
vi.mock('@/lib/log', () => ({ log: { error: logError } }));

describe('action()', () => {
  it('rejects anonymous, wrong role and invalid input before running', async () => {
    const { action } = await import('@/lib/action');
    const run = vi.fn(async () => 'ran');
    const act = action({ input: z.object({ title: z.string().min(3) }), roles: ['faculty'] }, run);

    viewer.mockResolvedValueOnce(null);
    expect(await act({ title: 'abc' })).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    viewer.mockResolvedValueOnce({ id: '1', name: 'S', email: 'u@x.in', roles: ['student'] });
    expect(await act({ title: 'abc' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    viewer.mockResolvedValueOnce({ id: '1', name: 'F', email: 'u@x.in', roles: ['faculty'] });
    const fd = new FormData();
    fd.set('title', 'x');
    expect(await act(fd)).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { title: [expect.any(String)] },
    });
    expect(run).not.toHaveBeenCalled();
    viewer.mockResolvedValueOnce({ id: '1', name: 'F', email: 'u@x.in', roles: ['faculty'] });
    expect(await act({ title: 'abcd' })).toEqual({ ok: true, data: 'ran' });
  });

  it('maps thrown errors to results without leaking the exception', async () => {
    const { publicAction } = await import('@/lib/action');
    const { AppError } = await import('@/lib/errors');
    const act = publicAction(z.object({ n: z.coerce.number() }), async ({ n }) => {
      if (n === 1) throw new AppError('RATE_LIMITED', 'Slow down.');
      if (n === 2) throw new Error('database password in message');
      return n;
    });

    expect(await act({ n: 1 })).toEqual({ ok: false, code: 'RATE_LIMITED', message: 'Slow down.' });
    const failed = await act({ n: 2 });
    expect(failed).toMatchObject({ ok: false, code: 'INTERNAL' });
    expect(JSON.stringify(failed)).not.toContain('database password');
    expect(logError).toHaveBeenCalledOnce();
    expect(await act({ n: 3 })).toEqual({ ok: true, data: 3 });
  });
});
