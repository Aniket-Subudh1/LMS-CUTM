import 'server-only';
import mongoose from 'mongoose';
import { env } from '@/lib/env';

const globalForDb = globalThis as typeof globalThis & { mongoose?: Promise<typeof mongoose> };

export function db(): Promise<typeof mongoose> {
  globalForDb.mongoose ??= mongoose.connect(env().MONGODB_URI, {
    autoIndex: env().NODE_ENV !== 'production',
    maxPoolSize: 20,
  });
  return globalForDb.mongoose;
}
