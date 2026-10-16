import mongoose from 'mongoose';
import { db } from '@/lib/db';
import { log } from '@/lib/log';
import { AuditLog } from '@/lib/models/audit-log';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { Notification } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Setting } from '@/lib/models/setting';
import { SyncRun } from '@/lib/models/sync-run';
import { Term } from '@/lib/models/term';
import { User } from '@/lib/models/user';

// Creates collections and declared indexes; never drops anything (no syncIndexes()).
const models = [
  User,
  AuditLog,
  Department,
  Program,
  Batch,
  Term,
  Course,
  CurriculumEntry,
  Lesson,
  LessonProgress,
  Offering,
  Enrollment,
  EngagementDaily,
  Notification,
  Setting,
  SyncRun,
];

await db();
for (const m of models) {
  await m.createCollection();
  await m.createIndexes();
  log.info('indexes ensured', { collection: m.collection.collectionName });
}
await mongoose.disconnect();
