'use server';

import { refresh } from 'next/cache';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { offeringAccess, requireTeach } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { policyOf } from '@/lib/data/internal-marks';
import { notify } from '@/lib/data/notify';
import { assertUnlocked } from '@/lib/data/offerings';
import { db, isDuplicateKey } from '@/lib/db';
import { RUBRICS } from '@/lib/domain/evaluation';
import { istDateToDate, parseIstLocal } from '@/lib/domain/time';
import { canMoveTask } from '@/lib/domain/tracker';
import { AppError } from '@/lib/errors';
import { CRITERION_LABEL, formatDate, formatDateTime } from '@/lib/format';
import { githubConfigured, resolveRepo } from '@/lib/integrations/github';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { Project } from '@/lib/models/project';
import { ProjectReview } from '@/lib/models/project-review';
import { ProjectTask } from '@/lib/models/project-task';
import { queueGithubSync, queueInternalMarks } from '@/lib/queue';
import { limit } from '@/lib/rate-limit';
import { ROLES } from '@/lib/schemas/common';
import { MAX_SESSIONS } from '@/lib/schemas/live';
import {
  LinkRepository,
  MoveTask,
  PROJECT_LIMITS,
  ProjectRef,
  ReviewRef,
  SaveProject,
  SaveReview,
  SaveReviewMarks,
  SaveTask,
  TaskRef,
} from '@/lib/schemas/projects';

const TEACH = ['admin', 'faculty'] as const;
const DAY_MS = 86_400_000;

// A project of a course with project credits; `teach` is required unless `member` lets a team member in.
async function readProject(viewer: Viewer, projectId: string, allow: 'teach' | 'member') {
  await db();
  const project = await Project.findById(projectId).lean();
  if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
  const access = await offeringAccess(viewer, String(project.offeringId));
  const teaches = access === 'teach' || viewer.roles.includes('admin');
  const member = project.memberIds.some((m) => m.equals(viewer.id));
  if (!teaches && !(allow === 'member' && member)) {
    throw new AppError('FORBIDDEN', 'Only the class’s teachers can change this project.');
  }
  return { project, teaches };
}

const pathOf = (offeringId: string | Types.ObjectId, projectId: string | Types.ObjectId) =>
  `/courses/${String(offeringId)}/projects/${String(projectId)}`;

// T3: a team's project. Its members are active students of the class, each in one project only; its guide is one of
// the class's faculty; its mode is the class's.
export const saveProject = action({ input: SaveProject, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  const offering = await Offering.findById(input.offeringId, { credits: 1, projectMode: 1, facultyIds: 1 }).lean();
  if (!offering || offering.credits.project === 0 || !offering.projectMode) {
    throw new AppError('VALIDATION', 'This course has no project credits.');
  }
  if (!offering.facultyIds.some((id) => id.equals(input.guideId))) {
    throw new AppError('VALIDATION', 'Pick a guide who teaches this class.', {
      guideId: ['Pick one of the class’s teachers.'],
    });
  }
  const members = [...new Set(input['member[]'])];
  const enrolled = await Enrollment.countDocuments({
    offeringId: input.offeringId,
    status: 'active',
    studentId: { $in: members },
  });
  if (enrolled !== members.length) throw new AppError('VALIDATION', 'Pick students of this class only.');
  const taken = await Project.findOne(
    {
      offeringId: input.offeringId,
      memberIds: { $in: members },
      ...(input.projectId ? { _id: { $ne: input.projectId } } : {}),
    },
    { title: 1 },
  ).lean();
  if (taken) {
    throw new AppError('CONFLICT', `A student you picked is already in “${taken.title}”. A student is in one project.`);
  }
  const fields = {
    title: input.title,
    description: input.description,
    memberIds: members,
    guideId: input.guideId,
    startsOn: istDateToDate(input.startsOn),
    dueOn: istDateToDate(input.dueOn),
  };
  if (input.projectId) {
    const written = await Project.updateOne({ _id: input.projectId, offeringId: input.offeringId }, { $set: fields });
    if (written.matchedCount === 0) throw new AppError('NOT_FOUND', 'Project not found.');
  } else {
    if ((await Project.countDocuments({ offeringId: input.offeringId })) >= PROJECT_LIMITS.perOffering) {
      throw new AppError('CONFLICT', `A class holds at most ${PROJECT_LIMITS.perOffering} projects.`);
    }
    await Project.create({ ...fields, offeringId: input.offeringId, mode: offering.projectMode });
  }
  refresh();
});

// T5 (PRJ-02): a member or a teacher links the team's repository, once the App is installed on it.
export const linkRepository = action({ input: LinkRepository, roles: ROLES }, async (input, viewer) => {
  const { project } = await readProject(viewer, input.projectId, 'member');
  if (project.mode !== 'github') throw new AppError('VALIDATION', 'Only a GitHub project has a repository.');
  if (!githubConfigured()) throw new AppError('CONFLICT', 'GitHub is not set up yet. Ask an administrator.');
  const [typedOwner, typedName] = input.repo.split('/');
  const { installationId, owner, name, defaultBranch } = await resolveRepo(typedOwner, typedName);
  const repo = {
    owner,
    name,
    installationId,
    defaultBranch,
    linkedAt: new Date(),
    lastSyncedAt: null,
    syncError: null,
  };
  try {
    await mongoose.connection.transaction(async (session) => {
      await Project.updateOne({ _id: project._id }, { $set: { repo } }, { session });
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'project.repo_linked',
          entity: 'project',
          entityId: String(project._id),
          offeringId: String(project.offeringId),
          before: project.repo ? { repo: `${project.repo.owner}/${project.repo.name}` } : null,
          after: { repo: `${owner}/${name}` },
        },
        session,
      );
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'Another project already uses this repository.');
    throw error;
  }
  await queueGithubSync(String(project._id));
  refresh();
});

// T6: "Sync now", once a minute a project.
export const requestGithubSync = action({ input: ProjectRef, roles: TEACH }, async ({ projectId }, viewer) => {
  const { project } = await readProject(viewer, projectId, 'teach');
  if (!project.repo) throw new AppError('VALIDATION', 'Link a repository first.');
  await limit('github-sync', projectId, 1, 60_000);
  await queueGithubSync(projectId);
  refresh();
});

// T7 (PRJ-06): the project manager sets a task for a member; a new one starts in Backlog and its assignee is told.
export const saveTask = action({ input: SaveTask, roles: TEACH }, async (input, viewer) => {
  const { project } = await readProject(viewer, input.projectId, 'teach');
  if (project.mode !== 'tracker') throw new AppError('VALIDATION', 'Only a tracker project has tasks.');
  if (!project.memberIds.some((m) => m.equals(input.assigneeId))) {
    throw new AppError('VALIDATION', 'Pick a member of the team.', { assigneeId: ['Pick a member of the team.'] });
  }
  const fields = {
    title: input.title,
    description: input.description,
    assigneeId: input.assigneeId,
    // Due at the end of its day in IST.
    dueAt: new Date(istDateToDate(input.dueOn).getTime() + DAY_MS - 1),
  };
  let tell = false;
  if (input.taskId) {
    const before = await ProjectTask.findOneAndUpdate(
      { _id: input.taskId, projectId: project._id },
      { $set: fields },
      { projection: { assigneeId: 1 } },
    ).lean();
    if (!before) throw new AppError('NOT_FOUND', 'Task not found.');
    tell = !before.assigneeId.equals(input.assigneeId);
  } else {
    if ((await ProjectTask.countDocuments({ projectId: project._id })) >= PROJECT_LIMITS.tasks) {
      throw new AppError('CONFLICT', `A project holds at most ${PROJECT_LIMITS.tasks} tasks.`);
    }
    await ProjectTask.create({
      ...fields,
      projectId: project._id,
      offeringId: project.offeringId,
      status: 'backlog',
      createdBy: viewer.id,
      history: [{ status: 'backlog', at: new Date(), by: viewer.id }],
    });
    tell = true;
  }
  if (tell) {
    await notify([input.assigneeId], {
      kind: 'task.assigned',
      title: `${input.title} — due ${formatDate(fields.dueAt)} (${project.title})`.slice(0, 160),
      href: pathOf(project.offeringId, project._id),
    });
  }
  refresh();
});

// T7 (PRJ-08): an assignee moves their own task up to Review and back; the faculty member makes any move. Done records
// when it was done; leaving Done clears it. The move holds only if the task is still where the page showed it.
export const moveTask = action({ input: MoveTask, roles: ROLES }, async ({ taskId, to }, viewer) => {
  await db();
  const task = await ProjectTask.findById(taskId, { projectId: 1, assigneeId: 1, status: 1 }).lean();
  if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
  const { teaches } = await readProject(viewer, String(task.projectId), 'member');
  const actor = teaches ? 'faculty' : task.assigneeId.equals(viewer.id) ? 'assignee' : null;
  if (!actor || !canMoveTask(actor, task.status, to)) {
    throw new AppError(
      'FORBIDDEN',
      to === 'done' ? 'Only the teacher marks a task done.' : 'You can move only your own tasks, one step at a time.',
    );
  }
  const now = new Date();
  const written = await ProjectTask.updateOne(
    { _id: taskId, status: task.status },
    {
      $set: { status: to, doneAt: to === 'done' ? now : null },
      $push: { history: { $each: [{ status: to, at: now, by: viewer.id }], $slice: -PROJECT_LIMITS.history } },
    },
  );
  if (written.matchedCount === 0) throw new AppError('CONFLICT', 'The task moved meanwhile. Reload the page.');
  refresh();
});

export const deleteTask = action({ input: TaskRef, roles: TEACH }, async ({ taskId }, viewer) => {
  await db();
  const task = await ProjectTask.findById(taskId, { projectId: 1, status: 1 }).lean();
  if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
  await readProject(viewer, String(task.projectId), 'teach');
  const deleted = await ProjectTask.deleteOne({ _id: taskId, status: 'backlog' });
  if (deleted.deletedCount === 0) throw new AppError('CONFLICT', 'Only a task still in Backlog can be deleted.');
  refresh();
});

// T8 (PRJ-09): a review on a date and time; held as a live class too when asked, which only the team is told about.
export const saveReview = action({ input: SaveReview, roles: TEACH }, async (input, viewer) => {
  const { project } = await readProject(viewer, input.projectId, 'teach');
  const heldOn = parseIstLocal(`${input.date}T${input.time}`);
  if (input.reviewId) {
    const review = await ProjectReview.findOneAndUpdate(
      { _id: input.reviewId, projectId: project._id },
      { $set: { title: input.title, heldOn, updatedBy: viewer.id } },
      { projection: { sessionId: 1 } },
    ).lean();
    if (!review) throw new AppError('NOT_FOUND', 'Review not found.');
    // A class not started yet moves with its review.
    if (review.sessionId) {
      await LiveSession.updateOne(
        { _id: review.sessionId, status: 'scheduled' },
        {
          $set: {
            title: `Review: ${input.title} · ${project.title}`.slice(0, 160),
            scheduledStart: heldOn,
            scheduledEnd: new Date(heldOn.getTime() + input.lengthMin * 60_000),
          },
        },
      );
    }
    return refresh();
  }
  if ((await ProjectReview.countDocuments({ projectId: project._id })) >= PROJECT_LIMITS.reviews) {
    throw new AppError('CONFLICT', `A project holds at most ${PROJECT_LIMITS.reviews} reviews.`);
  }
  const reviewId = new Types.ObjectId();
  let sessionId: Types.ObjectId | null = null;
  if (input.live) {
    if (heldOn.getTime() < Date.now() - 60_000) {
      throw new AppError('VALIDATION', 'A live class needs a time from now on.', {
        time: ['Pick a time from now on.'],
      });
    }
    if ((await LiveSession.countDocuments({ offeringId: project.offeringId })) >= MAX_SESSIONS) {
      throw new AppError('CONFLICT', `A course holds at most ${MAX_SESSIONS} live classes.`);
    }
    sessionId = new Types.ObjectId();
    await LiveSession.create({
      _id: sessionId,
      offeringId: project.offeringId,
      kind: 'review',
      reviewId,
      title: `Review: ${input.title} · ${project.title}`.slice(0, 160),
      scheduledStart: heldOn,
      scheduledEnd: new Date(heldOn.getTime() + input.lengthMin * 60_000),
      roomName: `ls-${sessionId}`,
      attendanceMode: 'manual',
      createdBy: viewer.id,
    });
    await notify(project.memberIds.map(String), {
      kind: 'live.scheduled',
      title: `Project review: ${project.title} — ${formatDateTime(heldOn)}`.slice(0, 160),
      href: `/courses/${String(project.offeringId)}/live/${String(sessionId)}`,
    });
  }
  await ProjectReview.create({
    _id: reviewId,
    offeringId: project.offeringId,
    projectId: project._id,
    title: input.title,
    heldOn,
    sessionId,
    marks: [],
    createdBy: viewer.id,
    updatedBy: viewer.id,
  });
  refresh();
});

// A review is deleted only while nobody has marks in it; its class, if not held, is cancelled.
export const deleteReview = action({ input: ReviewRef, roles: TEACH }, async ({ reviewId }, viewer) => {
  await db();
  const review = await ProjectReview.findById(reviewId, { projectId: 1, sessionId: 1, marks: 1 }).lean();
  if (!review) throw new AppError('NOT_FOUND', 'Review not found.');
  await readProject(viewer, String(review.projectId), 'teach');
  if (review.marks.some((m) => Object.keys(m.criteria ?? {}).length > 0)) {
    throw new AppError('CONFLICT', 'This review has marks, so it is kept.');
  }
  await ProjectReview.deleteOne({ _id: reviewId });
  if (review.sessionId) {
    await LiveSession.updateOne({ _id: review.sessionId, status: 'scheduled' }, { $set: { status: 'cancelled' } });
  }
  refresh();
});

// T8 (decision 2): the six criteria for each member, each 0 to its maximum in the offering's policy, blank allowed.
// Only members whose criteria changed are written and audited; the internal marks follow.
export const saveReviewMarks = action({ input: SaveReviewMarks, roles: TEACH }, async (input, viewer) => {
  await db();
  const review = await ProjectReview.findById(input.reviewId, { projectId: 1, offeringId: 1, marks: 1 }).lean();
  if (!review) throw new AppError('NOT_FOUND', 'Review not found.');
  const { project } = await readProject(viewer, String(review.projectId), 'teach');
  await assertUnlocked(review.offeringId);
  const keys = RUBRICS.project;
  const students = input['student[]'];
  const marks = input['mark[]'];
  if (
    new Set(students).size !== students.length ||
    !students.every((s) => project.memberIds.some((m) => m.equals(s))) ||
    marks.length !== students.length * keys.length
  ) {
    throw new AppError('VALIDATION', 'The team has changed since you opened the page. Reload it and try again.');
  }
  const offering = await Offering.findById(review.offeringId, { evaluation: 1 }).lean();
  const policy = await policyOf(offering?.evaluation);
  const posted = students.map((studentId, row) => {
    const criteria: Partial<Record<string, number>> = {};
    keys.forEach((key, column) => {
      const value = marks[row * keys.length + column];
      if (value === null) return;
      if (value > policy[key]) {
        const message = `${CRITERION_LABEL[key]} is out of ${policy[key]}.`;
        throw new AppError('VALIDATION', message, { 'mark[]': [message] });
      }
      criteria[key] = value;
    });
    return { studentId, criteria };
  });
  const before = new Map(review.marks.map((m) => [String(m.studentId), m.criteria ?? {}]));
  const same = (a: Partial<Record<string, number>>, b: Partial<Record<string, number>>) =>
    Object.keys({ ...a, ...b }).every((key) => a[key] === b[key]);
  const changed = posted.filter((p) => !same(before.get(p.studentId) ?? {}, p.criteria));
  if (changed.length === 0) return refresh();
  const kept = review.marks.filter((m) => !students.includes(String(m.studentId)));
  await mongoose.connection.transaction(async (session) => {
    await ProjectReview.updateOne(
      { _id: review._id },
      { $set: { marks: [...kept, ...posted], updatedBy: viewer.id } },
      { session },
    );
    for (const { studentId, criteria } of changed) {
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'project.review_marked',
          entity: 'project_review',
          entityId: String(review._id),
          offeringId: String(review.offeringId),
          before: { studentId, criteria: before.get(studentId) ?? {} },
          after: { studentId, criteria },
        },
        session,
      );
    }
  });
  await queueInternalMarks(String(review.offeringId));
  refresh();
});
