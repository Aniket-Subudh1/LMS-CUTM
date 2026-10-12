import 'server-only';
import mongoose from 'mongoose';
import { env } from '@/lib/env';

const globalForDb = globalThis as typeof globalThis & { mongoose?: Promise<typeof mongoose> };

export function db(): Promise<typeof mongoose> {
  // A failed first connection is not cached, so the next request retries; once connected, the driver reconnects itself.
  globalForDb.mongoose ??= mongoose
    .connect(env().MONGODB_URI, { autoIndex: env().NODE_ENV !== 'production', maxPoolSize: 20 })
    .catch((error: unknown) => {
      globalForDb.mongoose = undefined;
      throw error;
    });
  return globalForDb.mongoose;
}
