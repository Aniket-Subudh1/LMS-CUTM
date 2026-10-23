import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Types } from 'mongoose';
import { saveRubricMarks } from '@/app/(app)/courses/[offeringId]/marks/actions';
import {
  deleteReview,
  deleteTask,
  linkRepository,
  moveTask,
  saveProject,
  saveReview,
  saveReviewMarks,
  saveTask,
} from '@/app/(app)/courses/[offeringId]/projects/actions';
import { GET as githubCallback } from '@/app/api/auth/github/callback/route';
import { POST as githubWebhook } from '@/app/api/webhooks/github/route';
import { createToken } from '@/lib/auth/tokens';
import { recomputeInternalMarks } from '@/lib/data/internal-marks';
import { getProject, listProjects } from '@/lib/data/projects';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { AuditLog } from '@/lib/models/audit-log';
import { Commit } from '@/lib/models/commit';
import { Enrollment } from '@/lib/models/enrollment';
import { InternalMark } from '@/lib/models/internal-mark';
import { LiveSession } from '@/lib/models/live-session';
import { Notification } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { Project } from '@/lib/models/project';
import { ProjectReview } from '@/lib/models/project-review';
import { ProjectTask } from '@/lib/models/project-task';
import { SyncRun } from '@/lib/models/sync-run';
import { User } from '@/lib/models/user';
import { computeQueue, mailQueue, redis, syncQueue } from '@/lib/queue';
import { SETTINGS } from '@/lib/schemas/settings';
import { githubProject } from '@/worker/jobs/github';
import { enroll, form, makeOffering, makeUser, signInAs } from '../factories';

const github = vi.hoisted(() => ({
  githubConfigured: () => true,
  installUrl: () => 'https://github.com/apps/cutm-lms-test/installations/new',
  oauthAuthorizeUrl: (state: string) => `https://github.test/authorize?state=${state}`,
  exchangeOAuthCode: vi.fn(),
  resolveRepo: vi.fn(),
  listCommits: vi.fn(),
  commitStats: vi.fn(async () => ({ additions: 40, deletions: 10 })),
  verifyWebhook: vi.fn(),
}));
vi.mock('@/lib/integrations/github', () => github);

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const POLICY = SETTINGS.evaluation.schema.parse({});

beforeAll(async () => {
  await db();
  await Promise.all(
    [
      AuditLog,
      Commit,
      Enrollment,
      InternalMark,
      LiveSession,
      Notification,
      Offering,
      Project,
      ProjectReview,
      ProjectTask,
      SyncRun,
      User,
    ].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
});

afterAll(async () => {
  await Promise.all([computeQueue().close(), syncQueue().close(), mailQueue().close()]);
  await redis().quit();
});

// A class with project credits in `mode`, taught by `faculty`, with three students and a HoD.
async function world(mode: 'github' | 'tracker') {
  const faculty = await makeUser({ roles: ['faculty'] });
  const offering = await makeOffering({
    facultyIds: [faculty._id],
    credits: { theory: 0, practice: 0, project: 2 },
    projectMode: mode,
    evaluation: POLICY,
  });
  const [a, b, c] = await Promise.all([makeUser(), makeUser(), makeUser()]);
  await Promise.all([a, b, c].map((s) => enroll(offering._id, s._id)));
  const hod = await makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId });
  return { faculty, offering, a, b, c, hod };
}
type World = Awaited<ReturnType<typeof world>>;
const project = (w: World, members: { _id: Types.ObjectId }[], title = 'Smart attendance app') => ({
  offeringId: String(w.offering._id),
  title,
  'member[]': members.map((m) => String(m._id)),
  guideId: String(w.faculty._id),
  startsOn: '2026-08-01',
  dueOn: '2026-11-30',
});
async function made(w: World, members: { _id: Types.ObjectId }[]) {
  await signInAs(w.faculty);
  expect(await saveProject(form(project(w, members)))).toMatchObject({ ok: true });
  return String((await Project.findOne({ offeringId: w.offering._id }, { _id: 1 }).sort({ _id: -1 }).lean())?._id);
}

describe('projects and teams (T3)', () => {
  it('are made by the class’s teacher; a student is in one project only, and a guide teaches the class', async () => {
    const w = await world('tracker');
    await made(w, [w.a, w.b]);
    expect(await saveProject(form(project(w, [w.b, w.c], 'Second')))).toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Smart attendance app'),
    });
    expect(await saveProject(form({ ...project(w, [w.c]), guideId: String(w.hod._id) }))).toMatchObject({
      code: 'VALIDATION',
    });
    await signInAs(w.a);
    expect(await saveProject(form(project(w, [w.c], 'Mine')))).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('are read by their team and the department, not by another student', async () => {
    const w = await world('tracker');
    const id = await made(w, [w.a, w.b]);
    await signInAs(w.a);
    expect((await getProject(String(w.offering._id), id)).isMember).toBe(true);
    await signInAs(w.c);
    await expect(getProject(String(w.offering._id), id)).rejects.toMatchObject({ digest: NOT_FOUND });
    await signInAs(w.hod);
    expect((await getProject(String(w.offering._id), id)).canTeach).toBe(false);
  });
  it('list ten a page by title, with counts over every team, and a student sees only their own', async () => {
    const w = await world('tracker');
    const students = await Promise.all(Array.from({ length: 11 }, () => makeUser()));
    await Promise.all(students.map((s) => enroll(w.offering._id, s._id)));
    const projects = await Project.insertMany(
      students.map((s, i) => ({
        offeringId: w.offering._id,
        title: `Team ${String(i + 1).padStart(2, '0')}`,
        mode: 'tracker',
        memberIds: [s._id],
        guideId: w.faculty._id,
        startsOn: new Date('2026-08-01'),
        dueOn: new Date('2026-11-30'),
      })),
    );
    await ProjectReview.create({
      offeringId: w.offering._id,
      projectId: projects[10]._id,
      title: 'First review',
      heldOn: new Date('2026-09-15T04:30:00Z'),
      createdBy: w.faculty._id,
      updatedBy: w.faculty._id,
    });
    const offeringId = String(w.offering._id);
    await signInAs(w.faculty);
    const first = await listProjects(offeringId, 1);
    expect(first.rows.map((r) => r.title)).toEqual(
      students.slice(0, 10).map((_, i) => `Team ${String(i + 1).padStart(2, '0')}`),
    );
    expect(first.counts).toEqual({ projects: 11, inTeams: 11, students: 14, reviews: 1 });
    const second = await listProjects(offeringId, 2);
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0]).toMatchObject({ title: 'Team 11', review: { title: 'First review', upcoming: false } });
    expect(
      second.students
        .filter((s) => s.projectId === null)
        .map((s) => s.id)
        .sort(),
    ).toEqual([w.a, w.b, w.c].map((s) => String(s._id)).sort());
    await signInAs(students[4]);
    const mine = await listProjects(offeringId);
    expect(mine.learn).toBe(true);
    expect(mine.rows.map((r) => r.title)).toEqual(['Team 05']);
  });
});

describe('the board (T7, 07 §13)', () => {
  it('lets the assignee move their task to Review, and only the teacher mark it done', async () => {
    const w = await world('tracker');
    const id = await made(w, [w.a, w.b]);
    expect(
      await saveTask(
        form({ projectId: id, title: 'Write the survey', assigneeId: String(w.a._id), dueOn: '2026-10-30' }),
      ),
    ).toMatchObject({ ok: true });
    expect(await Notification.findOne({ userId: w.a._id, kind: 'task.assigned' }).lean()).not.toBeNull();
    const task = String((await ProjectTask.findOne({ projectId: id }, { _id: 1 }).lean())?._id);
    await signInAs(w.b);
    expect(await moveTask(form({ taskId: task, to: 'in_progress' }))).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(w.a);
    expect(await moveTask(form({ taskId: task, to: 'in_progress' }))).toMatchObject({ ok: true });
    expect(await moveTask(form({ taskId: task, to: 'review' }))).toMatchObject({ ok: true });
    expect(await moveTask(form({ taskId: task, to: 'done' }))).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Only the teacher marks a task done.',
    });
    await signInAs(w.faculty);
    expect(await moveTask(form({ taskId: task, to: 'done' }))).toMatchObject({ ok: true });
    const done = await ProjectTask.findById(task).lean();
    expect(done).toMatchObject({ status: 'done' });
    expect(done?.doneAt).toBeInstanceOf(Date);
    expect(done?.history.map((h) => h.status)).toEqual(['backlog', 'in_progress', 'review', 'done']);
    expect(await deleteTask(form({ taskId: task }))).toMatchObject({ code: 'CONFLICT' });
    const view = await getProject(String(w.offering._id), id);
    expect(view.tracker?.members.find((m) => m.id === String(w.a._id))).toMatchObject({ assigned: 1, done: 1 });
  });
});

describe('GitHub (T4, T5)', () => {
  it('links a repository only once the App is installed on it, in GitHub’s spelling, once in the LMS', async () => {
    const w = await world('github');
    const id = await made(w, [w.a, w.b]);
    github.resolveRepo.mockRejectedValueOnce(
      new AppError('NOT_FOUND', 'Install the CUTM LMS GitHub App on this repository first.'),
    );
    await signInAs(w.a);
    expect(await linkRepository(form({ projectId: id, repo: 'cutm-cse/attendance' }))).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Install the CUTM LMS GitHub App on this repository first.',
    });
    github.resolveRepo.mockResolvedValue({
      installationId: 7,
      owner: 'CUTM-CSE',
      name: 'attendance',
      defaultBranch: 'main',
    });
    expect(await linkRepository(form({ projectId: id, repo: 'https://github.com/cutm-cse/attendance' }))).toMatchObject(
      {
        ok: true,
      },
    );
    expect((await Project.findById(id).lean())?.repo).toMatchObject({
      owner: 'CUTM-CSE',
      name: 'attendance',
      installationId: 7,
    });
    expect(await AuditLog.findOne({ action: 'project.repo_linked', entityId: id }).lean()).not.toBeNull();
    expect(await syncQueue().getJob(`gh-${id}`)).toBeTruthy();
    await signInAs(w.faculty);
    const other = await saveProject(form(project(w, [w.c], 'Other')));
    expect(other).toMatchObject({ ok: true });
    const otherId = String((await Project.findOne({ title: 'Other' }, { _id: 1 }).lean())?._id);
    expect(await linkRepository(form({ projectId: otherId, repo: 'cutm-cse/attendance' }))).toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('syncs commits once, attributed by GitHub id then login, and leaves merges out of the metrics', async () => {
    const w = await world('github');
    const id = await made(w, [w.a, w.b]);
    await User.updateOne({ _id: w.a._id }, { $set: { github: { id: 101, login: 'asha-m', linkedAt: new Date() } } });
    await User.updateOne({ _id: w.b._id }, { $set: { github: { id: 202, login: 'Rohan-D', linkedAt: new Date() } } });
    await Project.updateOne(
      { _id: id },
      {
        $set: {
          repo: { owner: 'cutm-cse', name: 'app', installationId: 7, defaultBranch: 'main', linkedAt: new Date() },
        },
      },
    );
    const at = new Date('2026-08-10T10:00:00Z');
    github.listCommits.mockResolvedValue([
      {
        sha: 'a1',
        authorLogin: 'someone-else',
        authorId: 101,
        committedAt: at,
        message: 'Add the login form',
        parents: 1,
      },
      {
        sha: 'b1',
        authorLogin: 'rohan-d',
        authorId: null,
        committedAt: at,
        message: 'Write the parser tests',
        parents: 1,
      },
      { sha: 'm1', authorLogin: 'asha-m', authorId: 101, committedAt: at, message: 'Merge branch main', parents: 2 },
      { sha: 'x1', authorLogin: 'stranger', authorId: 999, committedAt: at, message: 'update', parents: 1 },
    ]);
    await githubProject({ projectId: id });
    await githubProject({ projectId: id });
    const commits = await Commit.find({ projectId: id }).lean();
    expect(commits).toHaveLength(4);
    expect(Object.fromEntries(commits.map((c) => [c.sha, c.studentId ? String(c.studentId) : null]))).toEqual({
      a1: String(w.a._id),
      b1: String(w.b._id),
      m1: String(w.a._id),
      x1: null,
    });
    expect(github.commitStats).toHaveBeenCalledTimes(4);
    expect((await Project.findById(id).lean())?.repo).toMatchObject({
      syncError: null,
      lastSyncedAt: expect.any(Date),
    });
    expect(await SyncRun.countDocuments({ kind: 'github', projectId: id, status: 'succeeded' })).toBe(2);
    await signInAs(w.faculty);
    const view = await getProject(String(w.offering._id), id);
    expect(view.github?.members.map((m) => [m.name, m.commits])).toEqual([
      [w.a.name, 1],
      [w.b.name, 1],
    ]);
    expect(view.github).toMatchObject({ unattributed: 1, unlinkedLogins: ['stranger'] });
  });

  it('keeps a failed sync’s reason on the project and records the run as failed', async () => {
    const w = await world('github');
    const id = await made(w, [w.a]);
    await Project.updateOne(
      { _id: id },
      {
        $set: {
          repo: { owner: 'cutm-cse', name: 'gone', installationId: 7, defaultBranch: 'main', linkedAt: new Date() },
        },
      },
    );
    github.listCommits.mockRejectedValueOnce(new Error('Not Found'));
    await expect(githubProject({ projectId: id })).rejects.toThrow('Not Found');
    expect((await Project.findById(id).lean())?.repo?.syncError).toBe('Not Found');
    expect(await SyncRun.countDocuments({ projectId: id, status: 'failed' })).toBe(1);
  });

  it('refuses a webhook with a bad signature and queues a push to a linked repository', async () => {
    const w = await world('github');
    const id = await made(w, [w.a]);
    await Project.updateOne(
      { _id: id },
      {
        $set: {
          repo: { owner: 'cutm-cse', name: 'hooked', installationId: 7, defaultBranch: 'main', linkedAt: new Date() },
        },
      },
    );
    const push = (signature: string, event = 'push') =>
      githubWebhook(
        new Request('http://localhost/api/webhooks/github', {
          method: 'POST',
          headers: { 'x-hub-signature-256': signature, 'x-github-event': event },
          body: JSON.stringify({ repository: { name: 'hooked', owner: { login: 'cutm-cse' } } }),
        }),
      );
    github.verifyWebhook.mockRejectedValueOnce(new AppError('FORBIDDEN', 'The webhook signature does not match.'));
    expect((await push('sha256=bad')).status).toBe(401);
    await syncQueue().remove(`gh-${id}`);
    expect((await push('sha256=good', 'issues')).status).toBe(200);
    expect(await syncQueue().getJob(`gh-${id}`)).toBeFalsy();
    expect((await push('sha256=good')).status).toBe(200);
    expect(await syncQueue().getJob(`gh-${id}`)).toBeTruthy();
  });

  it('links a GitHub account only for the user whose state it is, and never one someone else linked', async () => {
    const w = await world('github');
    const callback = async (state: string) =>
      (
        await githubCallback(
          new Request(`http://localhost/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`),
        )
      ).headers.get('location');
    const stateOf = (user: { _id: Types.ObjectId; sessionVersion: number }) =>
      createToken({ uid: String(user._id), sv: user.sessionVersion, purpose: 'github' });
    github.exchangeOAuthCode.mockResolvedValue({ id: 555, login: 'asha-m' });
    await signInAs(w.a);
    expect(await callback(await stateOf(w.b))).toContain('/profile?github=failed');
    expect(await callback(await stateOf(w.a))).toContain('/profile?github=linked');
    expect((await User.findById(w.a._id).lean())?.github).toMatchObject({ id: 555, login: 'asha-m' });
    await signInAs(w.b);
    expect(await callback(await stateOf(w.b))).toContain('/profile?github=taken');
  });
});

describe('project reviews (T8, decision 2)', () => {
  const marks = (reviewId: string, w: World, a: (string | number)[], b: (string | number)[]) =>
    form({ reviewId, 'student[]': [String(w.a._id), String(w.b._id)], 'mark[]': [...a, ...b].map(String) });

  it('hold a live class for the team only, and their marks become the project internal (AC-M07-05)', async () => {
    const w = await world('tracker');
    const id = await made(w, [w.a, w.b]);
    const soon = new Date(Date.now() + 2 * 86_400_000);
    const day = soon.toISOString().slice(0, 10);
    expect(
      await saveReview(form({ projectId: id, title: 'Mid-semester', date: day, time: '10:00', live: 'true' })),
    ).toMatchObject({ ok: true });
    expect(await saveReview(form({ projectId: id, title: 'Final', date: day, time: '15:00' }))).toMatchObject({
      ok: true,
    });
    const [first, second] = await ProjectReview.find({ projectId: id }).sort({ heldOn: 1 }).lean();
    expect(await LiveSession.findById(first.sessionId).lean()).toMatchObject({ kind: 'review', reviewId: first._id });
    expect(
      (await Notification.find({ kind: 'live.scheduled' }, { userId: 1 }).lean()).map((n) => String(n.userId)).sort(),
    ).toEqual([String(w.a._id), String(w.b._id)].sort());
    expect(await saveReviewMarks(marks(String(first._id), w, [4, 4, 8, 8, 7, 8], [3, 3, 6, 6, 6, 6]))).toMatchObject({
      ok: true,
    });
    expect(
      await saveReviewMarks(marks(String(second._id), w, [5, 4, 9, 7, 8, 9], ['', '', '', '', '', ''])),
    ).toMatchObject({
      ok: true,
    });
    expect(await AuditLog.countDocuments({ action: 'project.review_marked', entityId: String(first._id) })).toBe(2);
    await recomputeInternalMarks(String(w.offering._id), new Date());
    // 07 §2: (4+5)/2 + 4 + 8.5 + 7.5 + 7.5 + 8.5 = 40.5; the second student's only review gives 30.
    expect(await InternalMark.findOne({ studentId: w.a._id }).lean()).toMatchObject({ components: { project: 40.5 } });
    expect(await InternalMark.findOne({ studentId: w.b._id }).lean()).toMatchObject({ components: { project: 30 } });
    expect(await saveReviewMarks(marks(String(first._id), w, [6, 4, 8, 8, 7, 8], [3, 3, 6, 6, 6, 6]))).toMatchObject({
      code: 'VALIDATION',
      message: 'Relevance is out of 5.',
    });
    expect(await deleteReview(form({ reviewId: String(first._id) }))).toMatchObject({ code: 'CONFLICT' });
    expect(
      await saveRubricMarks(
        form({ offeringId: String(w.offering._id), component: 'project', 'student[]': [], 'mark[]': [] }),
      ),
    ).toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('project reviews') });
    await Offering.updateOne({ _id: w.offering._id }, { $set: { lockedAt: new Date() } });
    expect(await saveReviewMarks(marks(String(first._id), w, [5, 4, 8, 8, 7, 8], [3, 3, 6, 6, 6, 6]))).toMatchObject({
      code: 'LOCKED',
    });
  });
});
