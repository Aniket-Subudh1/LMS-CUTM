'use server';

import { action } from '@/lib/action';
import { requireTeach } from '@/lib/auth/access';
import { queueEngagementSnapshot } from '@/lib/queue';
import { limit } from '@/lib/rate-limit';
import { OfferingRef } from '@/lib/schemas/marks';

// M10 T3: "Work it out again" on the People tab, for whoever teaches the class and admins, once a minute per class at
// most; it queues the nightly snapshot's job now.
export const requestEngagement = action(
  { input: OfferingRef, roles: ['admin', 'faculty'] },
  async ({ offeringId }, viewer) => {
    await requireTeach(viewer, offeringId);
    await limit('engagement', offeringId, 1, 60_000);
    await queueEngagementSnapshot(offeringId, new Date(), true);
  },
);
