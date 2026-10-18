import 'server-only';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { requireManage } from '@/lib/auth/access';
import { getViewer, requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { windowState } from '@/lib/domain/attempts';
import { assessmentPath, linkState, maskEmail, type LinkState } from '@/lib/domain/test-links';
import { env } from '@/lib/env';
import { Assessment } from '@/lib/models/assessment';
import { Offering } from '@/lib/models/offering';
import { Otp } from '@/lib/models/otp';
import { TestGrant } from '@/lib/models/test-grant';
import { TestLink } from '@/lib/models/test-link';
import { User } from '@/lib/models/user';
import type { AssessmentMode } from '@/lib/schemas/assessment';
import { TEST_LIMITS, type LinkAudience } from '@/lib/schemas/tests';

// The address people open (TP-01); the token is the link's only secret.
export function linkUrl(token: string): string {
  return new URL(`/t/${token}`, env().APP_URL).href;
}

export type ShareLink = {
  id: string;
  label: string;
  audience: LinkAudience;
  url: string;
  accessCode: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  allowedDomains: string[];
  state: LinkState;
};

// TP-01: a test's share links, for whoever manages it (they hold access codes). At most 20, newest first.
export async function listLinks(assessmentId: string): Promise<ShareLink[]> {
  const viewer = await requireViewer();
  await requireManage(viewer, assessmentId);
  await db();
  const links = await TestLink.find({ assessmentId }).sort({ createdAt: -1 }).limit(TEST_LIMITS.linksPerTest).lean();
  const now = new Date();
  return links.map((link) => ({
    id: String(link._id),
    label: link.label,
    audience: link.audience,
    url: linkUrl(link.token),
    accessCode: link.accessCode ?? null,
    expiresAt: link.expiresAt ?? null,
    maxUses: link.maxUses ?? null,
    uses: link.uses,
    allowedDomains: link.allowedDomains,
    state: linkState({ ...link, expiresAt: link.expiresAt ?? null, maxUses: link.maxUses ?? null }, now),
  }));
}

export type LandingState = LinkState | 'draft' | 'closed';

export type LinkLanding = {
  token: string;
  audience: LinkAudience;
  state: LandingState;
  needsCode: boolean;
  domains: string[];
  test: {
    title: string;
    mode: AssessmentMode;
    opensAt: Date;
    closesAt: Date;
    durationMin: number | null;
    questions: number;
    maxMarks: number;
    // The course it belongs to, or who set it.
    by: string;
  };
  viewer: { name: string; email: string } | null;
  // Where the signed-in viewer goes when a link already let them in (they need no open link to come back).
  entered: string | null;
  // TP-03: a code was sent and is waiting to be confirmed (the page's `?otp=`).
  pending: { otpId: string; email: string } | null;
};

// TP-01, TP-03: what anyone holding the link sees before signing in or registering. No questions, no answers.
export async function getLinkLanding(token: string, otpId: string | undefined): Promise<LinkLanding> {
  await db();
  const link = await TestLink.findOne({ token }).lean();
  if (!link) notFound();
  const [test, viewer, otp] = await Promise.all([
    Assessment.aggregate<{
      _id: Types.ObjectId;
      offeringId: Types.ObjectId | null;
      ownerIds: Types.ObjectId[];
      status: 'draft' | 'published' | 'results_published';
      title: string;
      mode: AssessmentMode;
      opensAt: Date;
      closesAt: Date;
      lateUntil: Date | null;
      durationMin: number | null;
      maxMarks: number;
      questions: number;
    }>([
      { $match: { _id: link.assessmentId } },
      {
        $project: {
          offeringId: 1,
          ownerIds: 1,
          status: 1,
          title: 1,
          mode: 1,
          opensAt: 1,
          closesAt: 1,
          lateUntil: 1,
          durationMin: 1,
          maxMarks: 1,
          questions: { $size: '$items' },
        },
      },
    ]).then(([doc]) => doc),
    getViewer(),
    otpId && Types.ObjectId.isValid(otpId)
      ? Otp.findOne({ _id: otpId, linkId: link._id, expiresAt: { $gt: new Date() } }, { email: 1 }).lean()
      : null,
  ]);
  if (!test) notFound();
  const by = test.offeringId
    ? ((await Offering.findById(test.offeringId, { title: 1 }).lean())?.title ?? '')
    : `Set by ${(await User.findById(test.ownerIds[0], { name: 1 }).lean())?.name ?? 'the university'}`;
  const now = new Date();
  const state: LandingState =
    test.status === 'draft'
      ? 'draft'
      : test.status === 'results_published' ||
          windowState({ now, opensAt: test.opensAt, closesAt: test.closesAt, lateUntil: test.lateUntil ?? null }) ===
            'closed'
        ? 'closed'
        : linkState({ ...link, expiresAt: link.expiresAt ?? null, maxUses: link.maxUses ?? null }, now);
  return {
    token,
    audience: link.audience,
    state,
    needsCode: Boolean(link.accessCode),
    domains: link.allowedDomains,
    test: {
      title: test.title,
      mode: test.mode,
      opensAt: test.opensAt,
      closesAt: test.closesAt,
      durationMin: test.durationMin ?? null,
      questions: test.questions,
      maxMarks: test.maxMarks,
      by,
    },
    viewer: viewer && { name: viewer.name, email: viewer.email },
    entered:
      viewer && (await TestGrant.exists({ assessmentId: test._id, userId: viewer.id }))
        ? assessmentPath(null, String(test._id))
        : null,
    pending: otp && { otpId: String(otp._id), email: maskEmail(otp.email) },
  };
}
