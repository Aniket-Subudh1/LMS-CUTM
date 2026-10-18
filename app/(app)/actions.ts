'use server';

import { action } from '@/lib/action';
import { requireCourseEditor, requireTeach } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { buildKey } from '@/lib/domain/uploads';
import { AppError } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { presignUpload } from '@/lib/integrations/storage';
import { Assessment } from '@/lib/models/assessment';
import { Course } from '@/lib/models/course';
import { Submission } from '@/lib/models/submission';
import { limit } from '@/lib/rate-limit';
import { PROCTOR_LIMITS } from '@/lib/schemas/assessment';
import { ROLES } from '@/lib/schemas/common';
import { CreateUpload, UPLOAD_PURPOSES } from '@/lib/schemas/uploads';

// 02 §4.3: the server decides the key and returns a 5-minute presigned PUT; the browser sends the bytes to storage.
export const createUpload = action({ input: CreateUpload, roles: ROLES }, async (input, viewer) => {
  const rule = UPLOAD_PURPOSES[input.purpose];
  if (!rule.contentTypes.some((type) => type === input.contentType)) {
    throw new AppError('VALIDATION', `This file type cannot be uploaded here. Choose a ${rule.accepts} file.`);
  }
  if (input.size > rule.maxBytes) {
    throw new AppError('VALIDATION', `This file is larger than ${formatBytes(rule.maxBytes)}.`);
  }
  // 06 §5 "who may upload".
  switch (input.purpose) {
    case 'lesson-video':
    case 'lesson-doc':
    case 'lesson-thumb':
    case 'offering-cover':
      await requireTeach(viewer, input.contextId);
      break;
    case 'syllabus':
      // CRS-07: the course's coordinator or an administrator (who may still name a course that does not exist).
      await requireCourseEditor(viewer, input.contextId);
      await db();
      if (!(await Course.exists({ _id: input.contextId }))) throw new AppError('NOT_FOUND', 'Course not found.');
      break;
    case 'submission':
      // M04 T5: the context is the assessment; the student must have an attempt on it running.
      await db();
      if (!(await Submission.exists({ assessmentId: input.contextId, studentId: viewer.id, status: 'in_progress' }))) {
        throw new AppError('FORBIDDEN', 'Start the assessment before uploading your answer.');
      }
      break;
    case 'proctor-snapshot': {
      // M04b (TP-08): the context is the attempt — this person's, running, on a test that takes snapshots, with room
      // for more. One every 30 s at most, so these have their own limit.
      await db();
      const attempt = await Submission.findOne(
        {
          _id: input.contextId,
          studentId: viewer.id,
          status: 'in_progress',
          [`proctor.snapshots.${PROCTOR_LIMITS.snapshots - 1}`]: { $exists: false },
        },
        { assessmentId: 1 },
      ).lean();
      const test = attempt && (await Assessment.findById(attempt.assessmentId, { proctoring: 1 }).lean());
      if (!test?.proctoring?.camera) throw new AppError('FORBIDDEN', 'This attempt takes no camera snapshots.');
      await limit('snapshot', viewer.id, 4, 60_000);
      break;
    }
    default:
      throw new AppError('FORBIDDEN', 'You do not have access to this action.');
  }
  if (input.purpose !== 'proctor-snapshot') await limit('upload', viewer.id, 60, 60 * 60_000);
  const key = buildKey(input.purpose, input.contextId, viewer.id, crypto.randomUUID(), input.contentType);
  return { key, url: await presignUpload(key, input.contentType, input.size) };
});
