# M07 · Projects: GitHub analytics, task tracker, reviews

| | |
|---|---|
| Depends on | M03, M04 |
| Requirements | PRJ-01 … PRJ-09, PRJ-10 (blocked on Q-03 — reviews use in-house live sessions), CE-03 (project reviews), ADM-04 (GitHub), DSH-03, DSH-04, COM-03 (`task.assigned`) |
| Release | part of R3 |
| Packages added | `octokit` |
| Env vars added | `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` |
| Collections | `projects`, `projectTasks`, `commits`, `syncRuns` |

## Goal

Courses with a project component run projects in teams. CSE projects (`projectMode: github`) must live on GitHub: the LMS links each project to a repository, syncs commits, attributes them to students via their linked GitHub identity, and shows commit count and quality metrics with a transparent suggested score (PRJ-02/03/04). Other projects (`projectMode: tracker`) use a Jira-style board where the faculty member, as project manager, assigns tasks and the system tracks deadlines (PRJ-05…08). Project reviews are scheduled in-house and graded with rubrics, counting toward CE (PRJ-09).

## Before you start

- A **GitHub App** must exist (created by the university or the team; Q-22): permissions *Contents: read*, *Metadata: read*; events *Push*; "Request user authorization (OAuth) during installation" off; callback URL `<APP_URL>/api/auth/github/callback`; webhook URL `<APP_URL>/api/webhooks/github` with a secret. It is installed on the CUTM organization (or on each student repository).
- Read 06 §4.5, 07 §12–13, 05 §6.

## Tasks

### T1 · GitHub adapter (type-checked calls)
Files: `lib/env.ts` (+ GitHub vars), `.env.example`, `tests/setup.ts`, `lib/integrations/github.ts`.
- One lazily created `new App({ appId, privateKey, oauth: { clientId, clientSecret }, webhooks: { secret } })`.
- `installUrl()` → `https://github.com/apps/<GITHUB_APP_SLUG>/installations/new`.
- `oauthAuthorizeUrl(state)` → `https://github.com/login/oauth/authorize?client_id=…&state=…&redirect_uri=<APP_URL>/api/auth/github/callback`.
- `exchangeOAuthCode(code)` → `app.oauth.createToken({ code })`, then `GET /user` with that token → `{ id, login }`.
- `resolveRepo(owner, name)` → `app.octokit.request('GET /repos/{owner}/{repo}/installation')` (404 → `AppError('NOT_FOUND', 'Install the CUTM LMS GitHub App on this repository first.')`), then with `app.getInstallationOctokit(id)` `GET /repos/{owner}/{repo}` → `default_branch`.
- `listCommits` → `octokit.paginate('GET /repos/{owner}/{repo}/commits', { per_page: 100, since })`; map `sha`, `author.login`, `author.id`, `commit.committer.date`, `commit.message`, `parents.length`.
- `commitStats` → `GET /repos/{owner}/{repo}/commits/{ref}` → `stats.additions`, `stats.deletions`.
- `verifyWebhook(rawBody, signature)` → `await app.webhooks.verify(rawBody, signature)` (boolean); false → `AppError('FORBIDDEN', …)`.
All of these call shapes were type-checked against `octokit` 5.0.5.

### T2 · Models and pure functions
Files: `lib/models/{project,project-task,commit,sync-run}.ts` (05 §6, §7.4), `lib/domain/commits.ts` (+ test), `lib/domain/tracker.ts` (+ test); add the `projects` settings key (06 §7); add models to `scripts/sync-indexes.ts`.
- `computeCommitMetrics(input)` — 07 §12 with both member vectors and the message vectors.
- `computeTrackerMetrics(tasks, now)` — 07 §13. Vectors: 4 tasks (2 done on time, 1 done late, 1 overdue) → assigned 4, done 3, doneOnTime 2, overdue 1, onTimeRate 0.5.
- `canMoveTask(actor: 'faculty' | 'assignee', from, to)`: assignee may go `backlog → in_progress → review` and `review → in_progress`; faculty may make any move including `→ done` and `done → in_progress`. Vector table for all 16 (from, to) pairs per actor.

### T3 · Projects and teams
Route: `/courses/[offeringId]/projects` (tab shown when the course has `project`).
- `createProject` / `updateProject` (teach): title, description, members (enrolled students; a student may be in only one project per offering — CONFLICT), guide (one of the offering's faculty), `startsOn`, `dueOn`; `mode` copied from `offering.projectMode`.
- List: `teach`/`oversee` see all projects with member names and status; `learn` sees their own project.

### T4 · Linking GitHub identity (profile)
- `/profile`: "Link GitHub account" → `startGithubLink` action creates a 10-minute sealed `state` (`createToken({ uid, sv, purpose: 'github' })`, extend the token purposes) and redirects to `oauthAuthorizeUrl(state)`.
- `/api/auth/github/callback`: session must exist and match the `state`'s uid; `exchangeOAuthCode`; `users.github = { id, login, linkedAt }`; an id already linked to another user → redirect to `/profile?github=taken`. "Unlink" clears it.

### T5 · Linking a repository and syncing (PRJ-02, PRJ-03)
- `linkRepository` (a project member or teach): input `owner/name` (validated pattern); `resolveRepo`; one repository per project and per LMS (unique index); enqueue `sync/githubProject`.
- Worker `githubProject` (job id `gh-<projectId>-<minuteBucket>`): records a `syncRuns` row; `listCommits` since `repo.lastSyncedAt` (or `startsOn`); for each new sha (max 500 per run; the rest next run) `commitStats`; upsert `commits` by `{ projectId, sha }` with `isMerge = parents > 1`, `studentId` matched by members' `github.id`, else by `github.login`; sets `lastSyncedAt`, clears `syncError`; on failure sets `syncError` and rethrows.
- `/api/webhooks/github`: `verifyWebhook` on the raw body and `X-Hub-Signature-256`; for `push` events whose repository is linked, enqueue the project sync; everything else `200` ignored.
- Scheduler `github-nightly` (02 §8).

### T6 · GitHub project dashboard (PRJ-04, DSH-03)
Project page (`mode: github`): repository link and last sync (`teach`: "Sync now", rate-limited 1/min); per member: commits, active weeks / total, last-minute share, message quality, lines and share, huge commits, **suggested score** (07 §12) with a one-line explanation of each component, and a weekly-commits `Sparkline`; unattributed commits count (authors without a linked identity) with a hint to link GitHub; the 20 most recent commits (short sha, author, first line, IST time, +/−).

### T7 · Task tracker (PRJ-05 … PRJ-08, DSH-04)
Project page (`mode: tracker`): a server-rendered board with four columns (Backlog, In progress, Review, Done). Each card: title, assignee, due date with an overdue badge, and one small form per allowed move (`canMoveTask`) — no drag-and-drop.

| Action | Who | Rules |
|---|---|---|
| `saveTask` | teach | title, description (`richText`), assignee ∈ members, due date; new tasks start in `backlog`; `notify` assignee `task.assigned` |
| `moveTask` | teach or the assignee | `canMoveTask`; append `history`; `done` sets `doneAt`, leaving `done` clears it |
| `deleteTask` | teach | only `backlog` tasks |

Below the board: per-member tracker metrics (07 §13) and the tasks due in the next 7 days.

### T8 · Project reviews (PRJ-09; PRJ-10 blocked)
- Enable mode `project_review` (item type `observation` only) in the builder; its rubric captures the review criteria.
- From a `project_review` assessment, `teach` can schedule review sessions (`scheduleSession` with `kind: 'review'` and `assessmentId`; M03 flow, in-house live rooms — not Google Meet, Q-03).
- The grading page for `project_review` shows, beside the rubric, the student's project metrics (GitHub suggested score or tracker on-time rate) so the teacher can use them transparently; the teacher enters the marks.
- Reviews count toward CE through the scheme component that lists `project_review` (CE-07); no extra code.

### T9 · Integrations page (GitHub part)
Route: `/admin/integrations`: GitHub App configured (env present), link to install, projects with `syncError`, the last 50 `syncRuns`, and per queue the failed BullMQ jobs (name, id, failedReason, attempts) with a "Retry" button (`job.retry()`), admin only.

### T10 · Tests
- Unit: T2 vectors.
- Integration (mock `@/lib/integrations/github`): linking a repo without the App → NOT_FOUND message with install hint; sync upserts commits idempotently and attributes by id then login; merge commits excluded from metrics; a student cannot move another student's task; assignee cannot move to `done`; webhook with a bad signature → 401; OAuth callback with a mismatched state → no link.
- E2E (`tests/e2e/projects.spec.ts`, tracker mode only — no GitHub in CI): faculty creates a project and two tasks; the student moves one to Review; faculty marks it Done; metrics update.
- Manual (staging, real GitHub App): link an account, link a test repository, push three commits, see them attributed within a minute.

## Acceptance criteria

- **AC-M07-01** A CSE project cannot be created without GitHub mode when the offering is `github`; a repository can be linked only if the App is installed on it.
- **AC-M07-02** Commits pushed to a linked repository appear on the dashboard within ~1 minute (webhook) and at least nightly (scheduler), attributed to the student who linked that GitHub account.
- **AC-M07-03** The suggested score shows its components and equals 07 §12 for the documented vectors; teachers enter the final mark themselves.
- **AC-M07-04** In tracker mode only faculty can mark tasks done; overdue tasks are flagged; the on-time rate matches 07 §13.
- **AC-M07-05** Project review marks flow into internal marks through the scheme.

## Validation checklist (human)

- [ ] Create the GitHub App with the client's GitHub organization (Q-22) and install it.
- [ ] Run one real CSE team project for a week; review the metrics with the faculty member for fairness.
- [ ] Run one non-CSE project on the board with real tasks and deadlines.
- [ ] Conduct one project review session in the in-house live room and grade it.
