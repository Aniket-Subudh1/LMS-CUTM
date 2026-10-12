import { connection } from 'next/server';
import { db } from '@/lib/db';
import { log } from '@/lib/log';
import { redis } from '@/lib/queue';

const TIMEOUT_MS = 2000;

async function status(part: string, check: () => Promise<unknown>): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
      }),
    ]);
    return 'up';
  } catch (error) {
    log.warn('health check failed', { part, error });
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  await connection();
  const [mongo, cache] = await Promise.all([
    status('mongo', async () => {
      const database = (await db()).connection.db;
      if (!database) throw new Error('no database handle');
      await database.admin().ping();
    }),
    status('redis', () => redis().ping()),
  ]);
  const ok = mongo === 'up' && cache === 'up';
  return Response.json({ ok, mongo, redis: cache }, { status: ok ? 200 : 503 });
}
