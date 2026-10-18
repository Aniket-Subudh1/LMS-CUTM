'use server';

import { randomBytes } from 'node:crypto';
import { refresh } from 'next/cache';
import { action } from '@/lib/action';
import { requireManage } from '@/lib/auth/access';
import { linkUrl } from '@/lib/data/test-links';
import { db } from '@/lib/db';
import { testInvitationEmail } from '@/lib/domain/email-templates';
import { assessmentPath, emailAllowed, linkState } from '@/lib/domain/test-links';
import { parseIstLocal } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { Assessment } from '@/lib/models/assessment';
import { TestLink } from '@/lib/models/test-link';
import { mailQueue } from '@/lib/queue';
import { limit } from '@/lib/rate-limit';
import { MODE_DEFAULTS } from '@/lib/schemas/assessment';
import { CreateTest, InviteToTest, LinkRef, SaveLink, SetLinkActive, TEST_LIMITS } from '@/lib/schemas/tests';

const STAFF = ['admin', 'faculty'] as const;
const DAY = 86_400_000;

// TP-02: a test outside any course, owned by whoever made it. It opens in the builder, like a course's assessment.
export const createTest = action({ input: CreateTest, roles: STAFF }, async (input, viewer) => {
  await db();
  const [created] = await Assessment.create([
    {
      offeringId: null,
      ownerIds: [viewer.id],
      mode: input.mode,
      title: input.title,
      opensAt: parseIstLocal(input.opensAt),
      closesAt: parseIstLocal(input.closesAt),
      ...MODE_DEFAULTS[input.mode],
      createdBy: viewer.id,
    },
  ]);
  return { next: `${assessmentPath(null, String(created._id))}/edit` };
});

// TP-01: a new share link. Guests (outside people) may take only a standalone test; a course's assessment is for its
// enrolled students, so its links are "this class" links that take them straight to it.
export const createLink = action({ input: SaveLink, roles: STAFF }, async (input, viewer) => {
  const { offeringId } = await requireManage(viewer, input.assessmentId);
  if (offeringId && input.audience === 'guests') {
    throw new AppError('VALIDATION', 'Guests can take only tests outside a course. Choose “This class”.');
  }
  await db();
  if ((await TestLink.countDocuments({ assessmentId: input.assessmentId })) >= TEST_LIMITS.linksPerTest) {
    throw new AppError('CONFLICT', `A test has at most ${TEST_LIMITS.linksPerTest} links. Delete an unused one first.`);
  }
  await TestLink.create({
    assessmentId: input.assessmentId,
    token: randomBytes(18).toString('base64url'),
    label: input.label,
    audience: input.audience,
    accessCode: input.accessCode ?? null,
    expiresAt: input.expiresAt ? parseIstLocal(input.expiresAt) : null,
    maxUses: input.maxUses ?? null,
    allowedDomains: input.allowedDomains,
    createdBy: viewer.id,
  });
  refresh();
});

export const setLinkActive = action({ input: SetLinkActive, roles: STAFF }, async (input, viewer) => {
  await requireManage(viewer, input.assessmentId);
  await db();
  const written = await TestLink.updateOne(
    { _id: input.linkId, assessmentId: input.assessmentId },
    { $set: { active: input.active } },
  );
  if (written.matchedCount === 0) throw new AppError('NOT_FOUND', 'Link not found.');
  refresh();
});

// A link someone came in through stays, as the record of how they got in; it can be turned off instead.
export const deleteLink = action({ input: LinkRef, roles: STAFF }, async (input, viewer) => {
  await requireManage(viewer, input.assessmentId);
  await db();
  const removed = await TestLink.deleteOne({ _id: input.linkId, assessmentId: input.assessmentId, uses: 0 });
  if (removed.deletedCount === 0) {
    throw new AppError('CONFLICT', 'People have joined through this link. Turn it off instead.');
  }
  refresh();
});

// TP-01: the link emailed to a list of addresses, one mail each, through the mail queue. A day's repeat to the same
// address is dropped by its job id.
export const inviteToTest = action({ input: InviteToTest, roles: STAFF }, async (input, viewer) => {
  await requireManage(viewer, input.assessmentId);
  await limit('test-invite', viewer.id, 20, DAY);
  await db();
  const [link, test] = await Promise.all([
    TestLink.findOne({ _id: input.linkId, assessmentId: input.assessmentId }).lean(),
    Assessment.findById(input.assessmentId, { title: 1, status: 1, opensAt: 1, closesAt: 1 }).lean(),
  ]);
  if (!link || !test) throw new AppError('NOT_FOUND', 'Link not found.');
  if (test.status === 'draft') throw new AppError('CONFLICT', 'Publish the test before inviting people.');
  const state = linkState({ ...link, expiresAt: link.expiresAt ?? null, maxUses: link.maxUses ?? null }, new Date());
  if (state !== 'open') throw new AppError('CONFLICT', 'This link is not open. Turn it on or make a new one.');
  const outside = input.emails.filter((email) => !emailAllowed(email, link.allowedDomains));
  if (outside.length > 0) {
    throw new AppError(
      'VALIDATION',
      `${outside.slice(0, 3).join(', ')}${outside.length > 3 ? ` and ${outside.length - 3} more` : ''} cannot use this link (allowed: ${link.allowedDomains.join(', ')}).`,
    );
  }
  const day = Math.floor(Date.now() / DAY);
  await mailQueue().addBulk(
    input.emails.map((to) => ({
      name: 'send' as const,
      data: testInvitationEmail({
        to,
        test: test.title,
        from: viewer.name,
        opensAt: test.opensAt,
        closesAt: test.closesAt,
        link: linkUrl(link.token),
      }),
      opts: { jobId: `mail-test-invite-${String(link._id)}-${Buffer.from(to).toString('base64url')}-${day}` },
    })),
  );
  return { sent: input.emails.length };
});
