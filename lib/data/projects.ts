import 'server-only';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { offeringAccess } from '@/lib/auth/access';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { policyOf } from '@/lib/data/internal-marks';
import { getSettings } from '@/lib/data/settings';
import { db } from '@/lib/db';
import { computeCommitMetrics, type MemberMetrics } from '@/lib/domain/commits';
import { RUBRICS } from '@/lib/domain/evaluation';
import { canMoveTask, computeTrackerMetrics } from '@/lib/domain/tracker';
import { CRITERION_LABEL } from '@/lib/format';
import { githubConfigured, installUrl } from '@/lib/integrations/github';
import { Commit } from '@/lib/models/commit';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { Project, type ProjectDoc } from '@/lib/models/project';
import { ProjectReview } from '@/lib/models/project-review';
import { ProjectTask } from '@/lib/models/project-task';
import { User } from '@/lib/models/user';
import type { RichTextDoc } from '@/lib/schemas/common';
import { PROJECT_LIMITS, type TaskStatus } from '@/lib/schemas/projects';
import { MAX_ENROLLMENTS } from '@/lib/schemas/structure';

const DAY_MS = 86_400_000;
// A project's commits read for its metrics; a term's team rarely makes this many.
const MAX_COMMITS = 10_000;

type Person = { id: string; name: string; rollNo: string };

async function people(ids: readonly Types.ObjectId[]): Promise<Map<string, Person & { github: string | null }>> {
  const users = await User.find({ _id: { $in: ids } }, { name: 1, rollNo: 1, github: 1 }).lean();
  return new Map(
    users.map((u) => [
      String(u._id),
      { id: String(u._id), name: u.name, rollNo: u.rollNo ?? '—', github: u.github?.login ?? null },
    ]),
  );
}

// The offering of a project course, for whoever teaches, oversees or studies it.
async function projectOffering(viewer: Viewer, offeringId: string) {
  const access = await offeringAccess(viewer, offeringId);
  await db();
  const offering = await Offering.findById(offeringId, {
    category: 1,
    credits: 1,
    projectMode: 1,
    facultyIds: 1,
    evaluation: 1,
    lockedAt: 1,
  }).lean();
  if (!offering || offering.credits.project === 0 || !offering.projectMode) notFound();
  const canTeach = access === 'teach' || viewer.roles.includes('admin');
  return { access, offering, canTeach, mode: offering.projectMode };
}

export type ProjectRow = {
  id: string;
  title: string;
  members: Person[];
  guide: string;
  startsOn: Date;
  dueOn: Date;
  status: ProjectDoc['status'];
  repo: { fullName: string; lastSyncedAt: Date | null; syncError: string | null } | null;
  // The next review on or after today, else the latest.
  review: { title: string; heldOn: Date; upcoming: boolean } | null;
};

export type ProjectsView = {
  canTeach: boolean;
  mode: 'github' | 'tracker';
  githubReady: boolean;
  counts: { projects: number; inTeams: number; students: number; reviews: number };
  rows: ProjectRow[];
  // For the project dialog: the class's active students (with their team, if any) and its faculty.
  students: (Person & { projectId: string | null })[];
  faculty: { id: string; name: string }[];
};

// M07 T3 (P1): a class's projects for whoever teaches or oversees it; a student sees their own.
export async function listProjects(offeringId: string): Promise<ProjectsView> {
  const viewer = await requireViewer();
  const { access, offering, canTeach, mode } = await projectOffering(viewer, offeringId);
  const learn = access === 'learn';
  const projects = await Project.find(learn ? { offeringId, memberIds: viewer.id } : { offeringId })
    .sort({ title: 1, _id: 1 })
    .limit(PROJECT_LIMITS.perOffering)
    .lean();
  const projectIds = projects.map((p) => p._id);
  const [reviews, enrolled] = await Promise.all([
    ProjectReview.find({ projectId: { $in: projectIds } }, { projectId: 1, title: 1, heldOn: 1 })
      .sort({ heldOn: 1 })
      .limit(PROJECT_LIMITS.perOffering * PROJECT_LIMITS.reviews)
      .lean(),
    learn
      ? []
      : Enrollment.find({ offeringId, status: 'active' }, { studentId: 1 })
          .limit(MAX_ENROLLMENTS)
          .lean()
          .then((rows) => rows.map((r) => r.studentId)),
  ]);
  const names = await people([
    ...projects.flatMap((p) => [...p.memberIds, p.guideId]),
    ...enrolled,
    ...offering.facultyIds,
  ]);
  const teamOf = new Map(projects.flatMap((p) => p.memberIds.map((m) => [String(m), String(p._id)])));
  const now = Date.now();
  return {
    canTeach,
    mode,
    githubReady: githubConfigured(),
    counts: {
      projects: projects.length,
      inTeams: enrolled.filter((id) => teamOf.has(String(id))).length,
      students: enrolled.length,
      reviews: reviews.filter((r) => r.heldOn.getTime() <= now).length,
    },
    rows: projects.map((p) => {
      const mine = reviews.filter((r) => r.projectId.equals(p._id));
      const next = mine.find((r) => r.heldOn.getTime() + DAY_MS > now);
      const last = mine.at(-1);
      const shown = next ?? last;
      return {
        id: String(p._id),
        title: p.title,
        members: p.memberIds.flatMap((m) => names.get(String(m)) ?? []),
        guide: names.get(String(p.guideId))?.name ?? '—',
        startsOn: p.startsOn,
        dueOn: p.dueOn,
        status: p.status,
        repo: p.repo
          ? {
              fullName: `${p.repo.owner}/${p.repo.name}`,
              lastSyncedAt: p.repo.lastSyncedAt ?? null,
              syncError: p.repo.syncError ?? null,
            }
          : null,
        review: shown ? { title: shown.title, heldOn: shown.heldOn, upcoming: shown === next } : null,
      };
    }),
    students: enrolled
      .flatMap((id) => names.get(String(id)) ?? [])
      .map((s) => ({ ...s, projectId: teamOf.get(s.id) ?? null }))
      .sort((a, b) => a.rollNo.localeCompare(b.rollNo)),
    faculty: offering.facultyIds.flatMap((id) => {
      const person = names.get(String(id));
      return person ? [{ id: person.id, name: person.name }] : [];
    }),
  };
}

export type GithubView = {
  ready: boolean;
  installUrl: string | null;
  totalWeeks: number;
  members: (MemberMetrics & { name: string; github: string | null })[];
  unattributed: number;
  // The GitHub logins behind the unattributed commits, for the hint.
  unlinkedLogins: string[];
  teamWeekly: number[];
  recent: {
    sha: string;
    author: string;
    linked: boolean;
    message: string;
    at: Date;
    additions: number;
    deletions: number;
  }[];
};

export type TaskView = {
  id: string;
  title: string;
  description: RichTextDoc | null;
  assignee: Person;
  status: TaskStatus;
  dueAt: Date;
  doneAt: Date | null;
  overdue: boolean;
  // The moves the viewer may make (07 §13, `canMoveTask`).
  moves: TaskStatus[];
};

export type TrackerView = {
  tasks: TaskView[];
  members: (Person & {
    assigned: number;
    done: number;
    doneOnTime: number;
    overdue: number;
    onTimeRate: number | null;
  })[];
  dueSoon: TaskView[];
};

export type ProjectView = {
  canTeach: boolean;
  isMember: boolean;
  locked: boolean;
  project: {
    id: string;
    offeringId: string;
    title: string;
    description: RichTextDoc | null;
    mode: 'github' | 'tracker';
    members: (Person & { github: string | null })[];
    guide: { id: string; name: string };
    startsOn: Date;
    dueOn: Date;
    status: ProjectDoc['status'];
    repo: { fullName: string; branch: string; lastSyncedAt: Date | null; syncError: string | null } | null;
  };
  github: GithubView | null;
  tracker: TrackerView | null;
  reviews: { id: string; title: string; heldOn: Date; sessionId: string | null; marked: number }[];
};

async function readProject(viewer: Viewer, offeringId: string, projectId: string) {
  if (!Types.ObjectId.isValid(projectId)) notFound();
  const context = await projectOffering(viewer, offeringId);
  const project = await Project.findOne({ _id: projectId, offeringId }).lean();
  if (!project) notFound();
  const isMember = project.memberIds.some((m) => m.equals(viewer.id));
  // 09 §3: a student reads only their own team's project.
  if (context.access === 'learn' && !isMember) notFound();
  return { ...context, project, isMember };
}

// M07 T6, T7 (P2 A, P3 A): one project — a GitHub project's metrics or a tracker project's board — and its reviews.
export async function getProject(offeringId: string, projectId: string): Promise<ProjectView> {
  const viewer = await requireViewer();
  const { project, isMember, canTeach, offering } = await readProject(viewer, offeringId, projectId);
  const names = await people([...project.memberIds, project.guideId]);
  const members = project.memberIds.flatMap((m) => names.get(String(m)) ?? []);
  const reviews = await ProjectReview.find({ projectId }, { title: 1, heldOn: 1, sessionId: 1, marks: 1 })
    .sort({ heldOn: 1 })
    .limit(PROJECT_LIMITS.reviews)
    .lean();
  const now = new Date();
  let github: GithubView | null = null;
  let tracker: TrackerView | null = null;
  if (project.mode === 'github') {
    const [commits, recent, settings] = await Promise.all([
      Commit.find(
        { projectId },
        { studentId: 1, authorLogin: 1, committedAt: 1, message: 1, additions: 1, deletions: 1, isMerge: 1 },
      )
        .limit(MAX_COMMITS)
        .lean(),
      Commit.find({ projectId }).sort({ committedAt: -1 }).limit(20).lean(),
      getSettings('projects'),
    ]);
    const metrics = computeCommitMetrics({
      commits: commits.map((c) => ({ ...c, studentId: c.studentId ? String(c.studentId) : null })),
      memberIds: members.map((m) => m.id),
      startsOn: project.startsOn,
      dueOn: project.dueOn,
      now,
      settings,
    });
    const ready = githubConfigured();
    github = {
      ready,
      installUrl: ready ? installUrl() : null,
      totalWeeks: metrics.totalWeeks,
      members: metrics.members.map((m) => ({
        ...m,
        name: names.get(m.studentId)?.name ?? '—',
        github: names.get(m.studentId)?.github ?? null,
      })),
      unattributed: metrics.unattributed,
      unlinkedLogins: [
        ...new Set(commits.flatMap((c) => (!c.studentId && !c.isMerge && c.authorLogin ? [c.authorLogin] : []))),
      ].slice(0, 5),
      teamWeekly: metrics.teamWeekly,
      recent: recent.map((c) => ({
        sha: c.sha.slice(0, 7),
        author: c.studentId ? (names.get(String(c.studentId))?.name ?? '—') : (c.authorLogin ?? 'unknown'),
        linked: c.studentId !== null,
        message: c.message.split('\n')[0] ?? '',
        at: c.committedAt,
        additions: c.additions,
        deletions: c.deletions,
      })),
    };
  } else {
    const tasks = await ProjectTask.find({ projectId }).sort({ dueAt: 1, _id: 1 }).limit(PROJECT_LIMITS.tasks).lean();
    const shaped: TaskView[] = tasks.map((t) => {
      const assignee = names.get(String(t.assigneeId)) ?? { id: String(t.assigneeId), name: '—', rollNo: '—' };
      const actor = canTeach ? 'faculty' : t.assigneeId.equals(viewer.id) ? 'assignee' : null;
      return {
        id: String(t._id),
        title: t.title,
        description: t.description ?? null,
        assignee,
        status: t.status,
        dueAt: t.dueAt,
        doneAt: t.doneAt ?? null,
        overdue: t.status !== 'done' && t.dueAt < now,
        moves: actor
          ? (['backlog', 'in_progress', 'review', 'done'] as const).filter((to) => canMoveTask(actor, t.status, to))
          : [],
      };
    });
    const figures = computeTrackerMetrics(
      tasks.map((t) => ({
        assigneeId: String(t.assigneeId),
        status: t.status,
        dueAt: t.dueAt,
        doneAt: t.doneAt ?? null,
      })),
      now,
    );
    tracker = {
      tasks: shaped,
      members: members.map((m) => ({
        ...m,
        ...(figures.get(m.id) ?? { assigned: 0, done: 0, doneOnTime: 0, overdue: 0, onTimeRate: null }),
      })),
      dueSoon: shaped.filter(
        (t) => t.status !== 'done' && t.dueAt >= now && t.dueAt.getTime() <= now.getTime() + 7 * DAY_MS,
      ),
    };
  }
  const guide = names.get(String(project.guideId));
  return {
    canTeach,
    isMember,
    locked: Boolean(offering.lockedAt),
    project: {
      id: String(project._id),
      offeringId,
      title: project.title,
      description: project.description ?? null,
      mode: project.mode,
      members: members.map((m) => ({ ...m, github: names.get(m.id)?.github ?? null })),
      guide: { id: String(project.guideId), name: guide?.name ?? '—' },
      startsOn: project.startsOn,
      dueOn: project.dueOn,
      status: project.status,
      repo: project.repo
        ? {
            fullName: `${project.repo.owner}/${project.repo.name}`,
            branch: project.repo.defaultBranch,
            lastSyncedAt: project.repo.lastSyncedAt ?? null,
            syncError: project.repo.syncError ?? null,
          }
        : null,
    },
    github,
    tracker,
    reviews: reviews.map((r) => ({
      id: String(r._id),
      title: r.title,
      heldOn: r.heldOn,
      sessionId: r.sessionId ? String(r.sessionId) : null,
      marked: r.marks.filter((m) => Object.keys(m.criteria ?? {}).length > 0).length,
    })),
  };
}

export type ReviewSheet = {
  canEdit: boolean;
  locked: boolean;
  review: { id: string; title: string; heldOn: Date; session: { id: string; status: string } | null };
  project: { id: string; title: string; mode: 'github' | 'tracker' };
  criteria: { key: (typeof RUBRICS)['project'][number]; label: string; max: number }[];
  max: number;
  rows: (Person & { marks: Partial<Record<string, number>>; figure: string | null })[];
};

// M07 T8 (P4): one review's marking grid — the policy's six project criteria per member, with each member's GitHub
// suggested score or tracker on-time rate beside them for the teacher to weigh. Students read their own marks on Marks.
export async function getReviewSheet(offeringId: string, projectId: string, reviewId: string): Promise<ReviewSheet> {
  const viewer = await requireViewer();
  const { project, canTeach, offering, access } = await readProject(viewer, offeringId, projectId);
  if (access === 'learn' || !Types.ObjectId.isValid(reviewId)) notFound();
  const review = await ProjectReview.findOne({ _id: reviewId, projectId }).lean();
  if (!review) notFound();
  const [policy, view, session] = await Promise.all([
    policyOf(offering.evaluation),
    getProject(offeringId, projectId),
    review.sessionId ? LiveSession.findById(review.sessionId, { status: 1 }).lean() : null,
  ]);
  const marksOf = new Map(review.marks.map((m) => [String(m.studentId), m.criteria ?? {}]));
  const figureOf = (id: string) => {
    if (view.github) {
      const m = view.github.members.find((x) => x.studentId === id);
      return m ? `GitHub ${m.score}` : null;
    }
    const m = view.tracker?.members.find((x) => x.id === id);
    return m && m.onTimeRate !== null ? `On time ${Math.round(100 * m.onTimeRate)}%` : null;
  };
  const criteria = RUBRICS.project.map((key) => ({ key, label: CRITERION_LABEL[key], max: policy[key] }));
  return {
    canEdit: canTeach && !offering.lockedAt,
    locked: Boolean(offering.lockedAt),
    review: {
      id: String(review._id),
      title: review.title,
      heldOn: review.heldOn,
      session: session ? { id: String(session._id), status: session.status } : null,
    },
    project: { id: String(project._id), title: project.title, mode: project.mode },
    criteria,
    max: criteria.reduce((sum, c) => sum + c.max, 0),
    rows: view.project.members.map((m) => ({ ...m, marks: marksOf.get(m.id) ?? {}, figure: figureOf(m.id) })),
  };
}
