import mongoose from 'mongoose';
import { db } from '@/lib/db';
import { log } from '@/lib/log';
import { AuditLog } from '@/lib/models/audit-log';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { EvaluationScheme } from '@/lib/models/evaluation-scheme';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';

// Creates collections and declared indexes; never drops anything (no syncIndexes()).
const models = [User, AuditLog, Department, Program, Batch, Term, Course, EvaluationScheme, Offering, Enrollment];

await db();
for (const m of models) {
  await m.createCollection();
  await m.createIndexes();
  log.info('indexes ensured', { collection: m.collection.collectionName });
}
await mongoose.disconnect();
