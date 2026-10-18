import mongoose from 'mongoose';
import { db } from '@/lib/db';
import { log } from '@/lib/log';
import { Assessment } from '@/lib/models/assessment';
import { Attendance } from '@/lib/models/attendance';
import { AuditLog } from '@/lib/models/audit-log';
import { BankItem } from '@/lib/models/bank-item';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { LiveSession } from '@/lib/models/live-session';
import { Notification } from '@/lib/models/notification';
import { Otp } from '@/lib/models/otp';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Setting } from '@/lib/models/setting';
import { Submission } from '@/lib/models/submission';
import { SyncRun } from '@/lib/models/sync-run';
import { Term } from '@/lib/models/term';
import { TestFile } from '@/lib/models/test-file';
import { TestGrant } from '@/lib/models/test-grant';
import { TestLink } from '@/lib/models/test-link';
import { TestStats } from '@/lib/models/test-stats';
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
  LiveSession,
  Attendance,
  Assessment,
  Submission,
  BankItem,
  TestLink,
  TestGrant,
  TestStats,
  TestFile,
  Otp,
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
