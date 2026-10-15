'use server';

import { isDeepStrictEqual } from 'node:util';
import { refresh, updateTag } from 'next/cache';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { Setting } from '@/lib/models/setting';
import { SETTINGS, settingsKey } from '@/lib/schemas/settings';

// The key picks the schema; the other fields are that key's form fields, checked by it below.
const SaveSettings = z.looseObject({ key: settingsKey });

export const saveSettings = action({ input: SaveSettings, roles: ['admin'] }, async ({ key, ...fields }, viewer) => {
  const schema = SETTINGS[key].schema;
  const parsed = schema.safeParse(fields);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION',
      'Please correct the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }
  await db();
  const before: Record<string, unknown> = schema.parse((await Setting.findById(key, { value: 1 }).lean())?.value ?? {});
  const after: Record<string, unknown> = parsed.data;
  const changed = Object.keys(after).filter((field) => !isDeepStrictEqual(before[field], after[field]));
  if (changed.length === 0) return;

  await mongoose.connection.transaction(async (session) => {
    await Setting.updateOne({ _id: key }, { $set: { value: after, updatedBy: viewer.id } }, { upsert: true, session });
    // A settings key is not an ObjectId; like an import, the entry gets its own id and names the key in `entity`.
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'settings.updated',
        entity: `${key}_settings`,
        entityId: String(new Types.ObjectId()),
        before: Object.fromEntries(changed.map((field) => [field, before[field]])),
        after: Object.fromEntries(changed.map((field) => [field, after[field]])),
      },
      session,
    );
  });
  updateTag(`settings:${key}`);
  refresh();
});
