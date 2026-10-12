import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from './log';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe('log', () => {
  it('writes JSON lines and drops levels below LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'warn';
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    log.info('hidden');
    log.warn('shown', { id: 7 });

    expect(out).not.toHaveBeenCalled();
    expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toMatchObject({ level: 'warn', msg: 'shown', id: 7 });
  });

  it('serializes errors and defaults to info for an unknown level', () => {
    process.env.LOG_LEVEL = 'verbose';
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    log.debug('hidden');
    log.info('kept');
    log.error('failed', { error: new Error('boom') });

    expect(out).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(err.mock.calls[0]?.[0])).error).toMatchObject({ name: 'Error', message: 'boom' });
  });
});
