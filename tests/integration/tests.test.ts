import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { Types } from 'mongoose';
import { openLink, registerGuest, returnAsGuest, signInToTest, verifyGuestCode } from '@/app/(auth)/t/[token]/actions';
import { gradeSubmission, publishResults } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { createLink, createTest, deleteLink, inviteToTest, setLinkActive } from '@/app/(app)/tests/actions';
import {
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { hashPassword } from '@/lib/auth/password';
import { getViewer } from '@/lib/auth/session';
import { getAssessmentPage, getBuilder, listSubmissions, listTests } from '@/lib/data/assessments';
import { getLinkLanding, listLinks } from '@/lib/data/test-links';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Assessment } from '@/lib/models/assessment';
import { AuditLog } from '@/lib/models/audit-log';
import { Enrollment } from '@/lib/models/enrollment';
import { Notification } from '@/lib/models/notification';
import { Otp } from '@/lib/models/otp';
import { Submission } from '@/lib/models/submission';
import { TestGrant } from '@/lib/models/test-grant';
import { TestLink } from '@/lib/models/test-link';
import { User } from '@/lib/models/user';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import { startComputeWorker } from '@/worker/jobs/compute';
import { switchBrowser } from '../next-request';
import { enroll, makeAssessment, makeOffering, makeUser, newId, signInAs } from '../factories';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const MIN = 60_000;
const redirectsTo = (path: string) => ({
  digest: expect.stringMatching(new RegExp(`;${path.replace(/\?/g, '\\?')};`)),
});
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const istLocal = (minutes: number) => new Date(Date.now() + minutes * MIN + 330 * MIN).toISOString().slice(0, 16);
// Each test runs from its own address, so the per-address limits of one never reach another.
let ip = 0;
const freshBrowser = () => switchBrowser(new Map(), `198.51.100.${++ip}`);

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Assessment, AuditLog, Enrollment, Notification, Otp, Submission, TestGrant, TestLink, User].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
  worker = startComputeWorker(env().REDIS_URL);
  queueEvents = new QueueEvents('compute', { connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }) });
  await queueEvents.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), queueEvents.close(), computeQueue().close(), mailQueue().close()]);
  await redis().quit();
});

// A published standalone test with one answer worth 2 marks, open for the hour around now.
async function standalone(over: Record<string, unknown> = {}) {
  const owner = await makeUser({ roles: ['faculty'] });
  const right = newId();
  const item = {
    _id: newId(),
    type: 'mcq',
    prompt: doc('Pick B.'),
    maxMarks: 2,
    coIds: [],
    options: [
      { _id: newId(), text: 'A' },
      { _id: right, text: 'B' },
    ],
    answer: { optionId: right },
  };
  const test = await makeAssessment({
    offeringId: null,
    ownerIds: [owner._id],
    items: [item],
    maxMarks: 2,
    createdBy: owner._id,
    ...over,
  });
  return { owner, test, aid: String(test._id), itemId: String(item._id), right: String(right) };
}

async function link(aid: string | Types.ObjectId, over: Record<string, unknown> = {}) {
  return TestLink.create({
    assessmentId: aid,
    token: `tok${new Types.ObjectId().toHexString()}`,
    label: 'Round 1',
    audience: 'class',
    createdBy: newId(),
    ...over,
  });
}

async function queuedMail(to: string) {
  const jobs = await mailQueue().getJobs(['waiting', 'delayed', 'prioritized', 'active', 'completed']);
  return jobs.map((j) => j.data).filter((d) => 'to' in d && d.to === to);
}

describe('standalone tests (TP-02)', () => {
  it('are made by faculty and admins, open in the builder and belong to their maker', async () => {
    const [faculty, other, admin, student] = await Promise.all([
      makeUser({ roles: ['faculty'] }),
      makeUser({ roles: ['faculty'] }),
      makeUser({ roles: ['admin'] }),
      makeUser(),
    ]);
    const input = { mode: 'quiz', title: 'Placement round 1', opensAt: istLocal(60), closesAt: istLocal(120) } as const;
    await signInAs(student);
    expect(await createTest(input)).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(faculty);
    expect(await createTest({ ...input, closesAt: istLocal(30) })).toMatchObject({ code: 'VALIDATION' });
    const made = await createTest(input);
    expect(made).toMatchObject({ ok: true, data: { next: expect.stringMatching(/^\/tests\/[a-f\d]{24}\/edit$/) } });
    const test = await Assessment.findOne({ title: 'Placement round 1', ownerIds: faculty._id }).lean();
    expect(test).toMatchObject({ offeringId: null, status: 'draft', durationMin: 30 });
    const aid = String(test?._id);
    expect(await getBuilder(aid)).toMatchObject({ offeringId: null, path: `/tests/${aid}`, canEdit: true, cos: [] });
    await signInAs(other);
    await expect(getBuilder(aid)).rejects.toThrow(NOT_FOUND);
    await signInAs(admin);
    expect((await getBuilder(aid)).canEdit).toBe(true);
  });

  it('lists the tests a member of staff runs, and the tests a link let anyone into', async () => {
    const { owner, aid } = await standalone({ title: 'Mine' });
    const { aid: joinedId } = await standalone({ title: 'Joined' });
    const student = await makeUser();
    await TestGrant.create({ assessmentId: joinedId, userId: student._id, linkId: newId(), grantedAt: new Date() });
    await signInAs(owner);
    const own = await listTests('own', {}, 1);
    expect(own).toMatchObject({ view: 'own', canCreate: true, total: 1, rows: [{ id: aid, joined: 0, handedIn: 0 }] });
    await signInAs(student);
    // A student cannot run tests, so they always see the ones they may take.
    const take = await listTests('own', {}, 1);
    expect(take).toMatchObject({ view: 'take', canCreate: false, total: 1 });
    expect(take.rows.map((r) => r.id)).toEqual([joinedId]);
  });
});

describe('share links (TP-01)', () => {
  it('are made by whoever manages the test, never for guests on a course, and at most 20', async () => {
    const { owner, aid } = await standalone();
    const faculty = await makeUser({ roles: ['faculty'] });
    const offering = await makeOffering({ facultyIds: [faculty._id] });
    const course = await makeAssessment({ offeringId: offering._id, createdBy: faculty._id });
    await signInAs(faculty);
    expect(await createLink({ assessmentId: String(course._id), audience: 'guests', label: 'Outside' })).toMatchObject({
      code: 'VALIDATION',
    });
    expect(await createLink({ assessmentId: String(course._id), audience: 'class', label: 'Class' })).toEqual({
      ok: true,
      data: undefined,
    });
    await expect(createLink({ assessmentId: aid, audience: 'class', label: 'Not mine' })).rejects.toThrow(NOT_FOUND);
    await signInAs(owner);
    expect(
      await createLink({
        assessmentId: aid,
        audience: 'guests',
        label: 'Applicants',
        accessCode: 'CSE-26',
        maxUses: '200',
        expiresAt: istLocal(90),
        allowedDomains: 'gmail.com, @CUTM.ac.in',
      }),
    ).toEqual({ ok: true, data: undefined });
    const [made] = await listLinks(aid);
    expect(made).toMatchObject({
      label: 'Applicants',
      audience: 'guests',
      accessCode: 'CSE-26',
      maxUses: 200,
      allowedDomains: ['gmail.com', 'cutm.ac.in'],
      state: 'open',
      url: expect.stringMatching(/\/t\/[\w-]{24}$/),
    });
    await TestLink.insertMany(
      Array.from({ length: 19 }, (_, i) => ({
        assessmentId: aid,
        token: `fill${i}${newId().toHexString()}`,
        label: `L${i}`,
        audience: 'class',
        createdBy: owner._id,
      })),
    );
    expect(await createLink({ assessmentId: aid, audience: 'class', label: 'One more' })).toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('lets a signed-in person in once, counting one use, and sends them to the test', async () => {
    const { aid } = await standalone();
    const shared = await link(aid);
    const [student, outsider] = await Promise.all([makeUser(), makeUser()]);
    await signInAs(student);
    await expect(getAssessmentPage(aid)).rejects.toThrow(NOT_FOUND);
    for (let run = 0; run < 2; run++) {
      await expect(openLink({ token: shared.token })).rejects.toMatchObject(redirectsTo(`/tests/${aid}`));
    }
    expect((await TestLink.findById(shared._id).lean())?.uses).toBe(1);
    expect(await TestGrant.countDocuments({ assessmentId: aid, userId: student._id })).toBe(1);
    expect(await getAssessmentPage(aid)).toMatchObject({ view: 'student', path: `/tests/${aid}`, check: 'start' });
    await signInAs(outsider);
    await expect(getAssessmentPage(aid)).rejects.toThrow(NOT_FOUND);
  });

  it('checks the access code, the email domains, the use limit, the switch and the test window', async () => {
    const { aid } = await standalone();
    const strict = await link(aid, { accessCode: 'AB12', allowedDomains: ['cutm.ac.in'], maxUses: 1 });
    const [gmail, first, second] = await Promise.all([
      makeUser({ email: `riya${newId().toHexString()}@gmail.com` }),
      makeUser({ email: `a${newId().toHexString()}@cutm.ac.in` }),
      makeUser({ email: `b${newId().toHexString()}@cutm.ac.in` }),
    ]);
    await signInAs(first);
    expect(await openLink({ token: strict.token, accessCode: 'ab12' })).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { accessCode: [expect.any(String)] },
    });
    await signInAs(gmail);
    expect(await openLink({ token: strict.token, accessCode: 'AB12' })).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(first);
    await expect(openLink({ token: strict.token, accessCode: 'AB12' })).rejects.toMatchObject(
      redirectsTo(`/tests/${aid}`),
    );
    await signInAs(second);
    expect(await openLink({ token: strict.token, accessCode: 'AB12' })).toMatchObject({ code: 'CLOSED' });
    // A person already let in is not counted again, even once the link is full.
    await signInAs(first);
    await expect(openLink({ token: strict.token, accessCode: 'AB12' })).rejects.toMatchObject(
      redirectsTo(`/tests/${aid}`),
    );

    const owner = await User.findById((await Assessment.findById(aid).lean())?.ownerIds[0]).lean();
    const open = await link(aid);
    if (!owner) throw new Error('no owner');
    await signInAs(owner);
    expect(await setLinkActive({ assessmentId: aid, linkId: String(open._id), active: 'false' })).toEqual({
      ok: true,
      data: undefined,
    });
    await signInAs(second);
    expect(await openLink({ token: open.token })).toMatchObject({ code: 'CLOSED', message: /turned off/ });
    expect(await getLinkLanding(open.token, undefined)).toMatchObject({ state: 'off' });

    await signInAs(owner);
    expect(await deleteLink({ assessmentId: aid, linkId: String(strict._id) })).toMatchObject({ code: 'CONFLICT' });
    expect(await deleteLink({ assessmentId: aid, linkId: String(open._id) })).toEqual({ ok: true, data: undefined });

    const { aid: draftId } = await standalone({ status: 'draft' });
    const early = await link(draftId);
    const { aid: overId } = await standalone({ closesAt: new Date(Date.now() - MIN) });
    const late = await link(overId);
    await signInAs(second);
    expect(await openLink({ token: early.token })).toMatchObject({ code: 'CLOSED' });
    expect(await openLink({ token: late.token })).toMatchObject({ code: 'CLOSED', message: 'This test has closed.' });
    expect(await getLinkLanding(late.token, undefined)).toMatchObject({ state: 'closed' });
  });

  it('takes an enrolled student to their course assessment without a grant', async () => {
    const faculty = await makeUser({ roles: ['faculty'] });
    const offering = await makeOffering({ facultyIds: [faculty._id] });
    const course = await makeAssessment({ offeringId: offering._id, createdBy: faculty._id });
    const student = await makeUser();
    await enroll(offering._id, student._id);
    const shared = await link(course._id);
    await signInAs(student);
    await expect(openLink({ token: shared.token })).rejects.toMatchObject(
      redirectsTo(`/courses/${String(offering._id)}/assessments/${String(course._id)}`),
    );
    expect(await TestGrant.countDocuments({ assessmentId: course._id })).toBe(0);
  });

  it('signs an LMS user in on the link page and lets them in', async () => {
    const { aid } = await standalone();
    const shared = await link(aid);
    const email = `asha${newId().toHexString()}@cutm.ac.in`;
    const user = await makeUser({ email, passwordHash: await hashPassword('correct horse battery') });
    freshBrowser();
    expect(await signInToTest({ token: shared.token, email, password: 'wrong password!' })).toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(signInToTest({ token: shared.token, email, password: 'correct horse battery' })).rejects.toMatchObject(
      redirectsTo(`/tests/${aid}`),
    );
    expect((await getViewer())?.id).toBe(String(user._id));
    expect(await TestGrant.exists({ assessmentId: aid, userId: user._id })).toBeTruthy();
  });

  it('emails invitations, one per address, only to allowed domains', async () => {
    const { owner, aid } = await standalone();
    const shared = await link(aid, { allowedDomains: ['cutm.ac.in'] });
    const to = [`x${newId().toHexString()}@cutm.ac.in`, `y${newId().toHexString()}@cutm.ac.in`];
    await signInAs(owner);
    expect(
      await inviteToTest({ assessmentId: aid, linkId: String(shared._id), emails: `${to[0]}, riya@gmail.com` }),
    ).toMatchObject({ code: 'VALIDATION', message: /riya@gmail.com/ });
    expect(await inviteToTest({ assessmentId: aid, linkId: String(shared._id), emails: to.join('\n') })).toEqual({
      ok: true,
      data: { sent: 2 },
    });
    for (const address of to) {
      expect(await queuedMail(address)).toEqual([
        expect.objectContaining({
          subject: expect.stringContaining('You are invited'),
          text: expect.stringContaining(`/t/${shared.token}`),
        }),
      ]);
    }
  });
});

describe('guests (TP-03)', () => {
  it('register with an emailed code and come in as candidates', async () => {
    const { aid } = await standalone();
    const shared = await link(aid, { audience: 'guests', accessCode: 'GO-2026' });
    const email = `guest${newId().toHexString()}@gmail.com`;
    freshBrowser();
    const fields = { token: shared.token, name: 'Riya Patnaik', email, consent: 'true' };
    expect(await registerGuest({ ...fields, accessCode: 'nope' })).toMatchObject({ code: 'VALIDATION' });
    await expect(registerGuest({ ...fields, accessCode: 'GO-2026' })).rejects.toMatchObject({
      digest: expect.stringMatching(new RegExp(`;/t/${shared.token}\\?otp=[a-f\\d]{24};`)),
    });
    const otp = await Otp.findOne({ email }).lean();
    const [mail] = await queuedMail(email);
    const code = mail && 'subject' in mail ? mail.subject.slice(0, 6) : '';
    expect(code).toMatch(/^\d{6}$/);
    expect(otp?.codeHash).toMatch(/^[a-f\d]{64}$/);
    expect(otp?.codeHash).not.toContain(code);
    expect(await getLinkLanding(shared.token, String(otp?._id))).toMatchObject({
      pending: { email: expect.stringMatching(/^gu••••@gmail\.com$/) },
    });

    const verify = { token: shared.token, otpId: String(otp?._id) };
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await verifyGuestCode({ ...verify, code: wrong })).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { code: ['4 tries left.'] },
    });
    await expect(verifyGuestCode({ ...verify, code })).rejects.toMatchObject(redirectsTo(`/tests/${aid}`));
    const guest = await User.findOne({ email }).lean();
    expect(guest).toMatchObject({ name: 'Riya Patnaik', roles: ['candidate'], status: 'active' });
    expect(guest?.passwordHash).toBeUndefined();
    expect((await getViewer())?.id).toBe(String(guest?._id));
    expect(await TestGrant.exists({ assessmentId: aid, userId: guest?._id })).toBeTruthy();
    expect(await Otp.exists({ _id: otp?._id })).toBeNull();
    expect((await TestLink.findById(shared._id).lean())?.uses).toBe(1);
  });

  it('never sign in an LMS account, and stop after five wrong codes', async () => {
    const { aid } = await standalone();
    const shared = await link(aid, { audience: 'guests' });
    const staff = await makeUser({ roles: ['faculty'], email: `staff${newId().toHexString()}@cutm.ac.in` });
    freshBrowser();
    const fields = { token: shared.token, name: 'Someone', consent: 'true' };
    expect(await registerGuest({ ...fields, email: staff.email })).toMatchObject({
      code: 'CONFLICT',
      fieldErrors: { email: [expect.any(String)] },
    });
    expect(await registerGuest({ ...fields, email: 'x@y.co', consent: 'false' })).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { consent: ['Agree to continue.'] },
    });
    const email = `guest${newId().toHexString()}@gmail.com`;
    await expect(registerGuest({ ...fields, email })).rejects.toMatchObject({ digest: expect.any(String) });
    const otp = await Otp.findOne({ email }).lean();
    const verify = { token: shared.token, otpId: String(otp?._id) };
    const [mail] = await queuedMail(email);
    const code = mail && 'subject' in mail ? mail.subject.slice(0, 6) : '';
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await verifyGuestCode({ ...verify, code: wrong });
    expect(await verifyGuestCode({ ...verify, code })).toMatchObject({ code: 'CLOSED' });
    expect(await User.exists({ email })).toBeNull();

    const classLink = await link(aid);
    expect(await registerGuest({ ...fields, token: classLink.token, email })).toMatchObject({ code: 'FORBIDDEN' });
  });
  it('come back through their link after it closes, to read their results', async () => {
    const { aid } = await standalone();
    const shared = await link(aid, { audience: 'guests', accessCode: 'GO', maxUses: 1, uses: 1, active: false });
    const email = `back${newId().toHexString()}@gmail.com`;
    const guest = await makeUser({ roles: ['candidate'], email, name: 'Riya Patnaik' });
    await TestGrant.create({ assessmentId: aid, userId: guest._id, linkId: shared._id, grantedAt: new Date() });
    freshBrowser();
    expect(
      await returnAsGuest({ token: shared.token, email: `nobody${newId().toHexString()}@gmail.com` }),
    ).toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(returnAsGuest({ token: shared.token, email })).rejects.toMatchObject({ digest: expect.any(String) });
    const otp = await Otp.findOne({ email }).lean();
    const [mail] = await queuedMail(email);
    const code = mail && 'subject' in mail ? mail.subject.slice(0, 6) : '';
    await expect(verifyGuestCode({ token: shared.token, otpId: String(otp?._id), code })).rejects.toMatchObject(
      redirectsTo(`/tests/${aid}`),
    );
    expect((await getViewer())?.id).toBe(String(guest._id));
    expect(await getLinkLanding(shared.token, undefined)).toMatchObject({ state: 'off', entered: `/tests/${aid}` });
    // Signed in, the closed link still takes them back, with no code asked and no use counted.
    await expect(openLink({ token: shared.token })).rejects.toMatchObject(redirectsTo(`/tests/${aid}`));
    expect((await TestLink.findById(shared._id).lean())?.uses).toBe(1);
  });
});

describe('a standalone test, start to finish', () => {
  it('is taken by a candidate, graded by its owner and its results published to them', async () => {
    const { owner, test, aid } = await standalone({
      items: [
        {
          _id: newId(),
          type: 'text',
          prompt: doc('Explain a loop.'),
          maxMarks: 4,
          coIds: [],
        },
      ],
      maxMarks: 4,
    });
    const textId = String(test.items[0]?._id);
    const candidate = await makeUser({ roles: ['candidate'], email: `c${newId().toHexString()}@gmail.com` });
    await TestGrant.create({ assessmentId: aid, userId: candidate._id, linkId: newId(), grantedAt: new Date() });
    await signInAs(candidate);
    await expect(startAttempt({ assessmentId: aid, agree: 'true' })).rejects.toMatchObject(redirectsTo(`/tests/${aid}/attempt`));
    const attempt = await Submission.findOne({ assessmentId: aid, studentId: candidate._id }).lean();
    expect(attempt).toMatchObject({ offeringId: null, status: 'in_progress' });
    const submissionId = String(attempt?._id);
    expect(
      await saveAnswer({ submissionId, itemId: textId, answer: { type: 'text', text: '{"type":"doc","content":[]}' } }),
    ).toMatchObject({ ok: true });
    await expect(submitAttempt({ submissionId })).rejects.toMatchObject(redirectsTo(`/tests/${aid}`));

    await signInAs(owner);
    const handIns = await listSubmissions(aid, {}, 1);
    expect(handIns).toMatchObject({ path: `/tests/${aid}`, canTeach: true, counts: { enrolled: 1, handedIn: 1 } });
    expect(
      await gradeSubmission({
        submissionId,
        'item[]': [textId],
        'marks[]': ['3'],
        'comment[]': ['Clear.'],
        'criterion[]': [],
        'criterionMarks[]': [],
      }),
    ).toMatchObject({ ok: true });
    await Assessment.updateOne({ _id: aid }, { $set: { closesAt: new Date(Date.now() - MIN) } });
    expect(await publishResults({ assessmentId: aid })).toEqual({ ok: true, data: undefined });
    expect(await Notification.findOne({ userId: candidate._id, kind: 'results.published' }).lean()).toMatchObject({
      href: `/tests/${aid}`,
    });
    await signInAs(candidate);
    expect(await getAssessmentPage(aid)).toMatchObject({ view: 'student', result: { total: 3 } });
  });

  it('reminds the people its links let in who have not handed in', async () => {
    const { aid } = await standalone({ closesAt: new Date(Date.now() + 2 * 60 * MIN) });
    const [done, waiting] = await Promise.all([makeUser(), makeUser()]);
    await TestGrant.insertMany(
      [done, waiting].map((user) => ({ assessmentId: aid, userId: user._id, linkId: newId(), grantedAt: new Date() })),
    );
    await Submission.create({
      assessmentId: aid,
      offeringId: null,
      studentId: done._id,
      attemptNo: 1,
      status: 'submitted',
      startedAt: new Date(),
      deadlineAt: new Date(),
      submittedAt: new Date(),
    });
    const job = await computeQueue().add('assessmentSweep', {}, { jobId: `test-sweep-${crypto.randomUUID()}` });
    await job.waitUntilFinished(queueEvents);
    const reminded = await Notification.find({ kind: 'assessment.dueSoon', href: `/tests/${aid}` }).lean();
    expect(reminded.map((n) => String(n.userId))).toEqual([String(waiting._id)]);
  });
});
