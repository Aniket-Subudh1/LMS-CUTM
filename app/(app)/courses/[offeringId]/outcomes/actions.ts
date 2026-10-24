'use server';

import { refresh } from 'next/cache';
import { action } from '@/lib/action';
import { requireTeach } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { Offering } from '@/lib/models/offering';
import { queueAttainment } from '@/lib/queue';
import { limit } from '@/lib/rate-limit';
import { OfferingRef } from '@/lib/schemas/marks';

// M09 T2: "Work it out again" on the Outcomes tab, for whoever teaches the class and admins, once a minute per class at
// most; the record names who asked.
export const requestAttainment = action(
  { input: OfferingRef, roles: ['admin', 'faculty'] },
  async ({ offeringId }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const offering = await Offering.findById(offeringId, { category: 1 }).lean();
    if (offering?.category !== 'ugc') throw new AppError('CONFLICT', 'Only credit courses have attainment.');
    await limit('attainment', offeringId, 1, 60_000);
    await queueAttainment(offeringId, viewer.id);
    refresh();
  },
);
