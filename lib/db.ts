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

// A unique index rejected a write; actions turn this into a CONFLICT with a message about the specific value.
export function isDuplicateKey(error: unknown): boolean {
  return error instanceof mongoose.mongo.MongoServerError && error.code === 11000;
}
