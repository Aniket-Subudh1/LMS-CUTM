import 'server-only';
import mongoose, { type Types } from 'mongoose';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/data/notify';
import { assessmentPath } from '@/lib/domain/test-links';
import { Assessment } from '@/lib/models/assessment';
import { Offering } from '@/lib/models/offering';
import { Submission } from '@/lib/models/submission';
import { queueTestStats } from '@/lib/queue';

// T6 and TP-11: publishing a test's results — by hand (publishResults) or by its release rule (the hourly sweep,
// whose actor is whoever chose the rule). The status change and its audit entry commit together; then everyone who
// handed in is told and the testStats job works out ranks. False when they were already out. The worker calls this
// too, so it imports nothing from next/* or the session.
export async function releaseResults(
  test: { _id: Types.ObjectId; title: string; offeringId?: Types.ObjectId | null },
  actorId: string,
  now: Date,
  reason?: string,
): Promise<boolean> {
  const released = await mongoose.connection.transaction(async (session) => {
    const written = await Assessment.updateOne(
      { _id: test._id, status: 'published' },
      { $set: { status: 'results_published', resultsPublishedAt: now } },
      { session },
    );
    if (written.modifiedCount === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'assessment.results_published',
        entity: 'assessment',
        entityId: String(test._id),
        offeringId: test.offeringId ? String(test.offeringId) : undefined,
        ...(reason ? { reason } : {}),
        before: { status: 'published' },
        after: { status: 'results_published' },
      },
      session,
    );
    return true;
  });
  if (!released) return false;
  const offering = test.offeringId ? await Offering.findById(test.offeringId, { title: 1 }).lean() : null;
  const students = await Submission.distinct('studentId', { assessmentId: test._id });
  const title = `Results: ${test.title}${offering ? ` (${offering.title})` : ''}`;
  await notify(students.map(String), {
    kind: 'results.published',
    title: title.length > 160 ? `${title.slice(0, 159)}…` : title,
    href: assessmentPath(test.offeringId ? String(test.offeringId) : null, String(test._id)),
  });
  await queueTestStats(String(test._id));
  return true;
}
