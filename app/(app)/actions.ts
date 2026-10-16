'use server';

import { action } from '@/lib/action';
import { requireCourseEditor, requireTeach } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { buildKey } from '@/lib/domain/uploads';
import { AppError } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { presignUpload } from '@/lib/integrations/storage';
import { Course } from '@/lib/models/course';
import { limit } from '@/lib/rate-limit';
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
  // 06 §5 "who may upload"; submissions and proctoring snapshots are authorized when M04/M05 arrive.
  switch (input.purpose) {
    case 'lesson-video':
    case 'lesson-doc':
      await requireTeach(viewer, input.contextId);
      break;
    case 'syllabus':
      // CRS-07: the course's coordinator or an administrator (who may still name a course that does not exist).
      await requireCourseEditor(viewer, input.contextId);
      await db();
      if (!(await Course.exists({ _id: input.contextId }))) throw new AppError('NOT_FOUND', 'Course not found.');
      break;
    default:
      throw new AppError('FORBIDDEN', 'You do not have access to this action.');
  }
  await limit('upload', viewer.id, 60, 60 * 60_000);
  const key = buildKey(input.purpose, input.contextId, viewer.id, crypto.randomUUID(), input.contentType);
  return { key, url: await presignUpload(key, input.contentType, input.size) };
});
