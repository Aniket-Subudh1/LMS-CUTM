import mongoose from 'mongoose';
import { db } from '@/lib/db';
import { log } from '@/lib/log';
import { AuditLog } from '@/lib/models/audit-log';
import { User } from '@/lib/models/user';

// Creates collections and declared indexes; never drops anything (no syncIndexes()).
const models = [User, AuditLog];

await db();
for (const m of models) {
  await m.createCollection();
  await m.createIndexes();
  log.info('indexes ensured', { collection: m.collection.collectionName });
}
await mongoose.disconnect();
