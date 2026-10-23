# M07 · Projects: GitHub analytics, task tracker, reviews

| | |
|---|---|
| Depends on | M03 (live classes), M04 (assessments), M06 (internal marks) |
| Requirements | PRJ-01 … PRJ-09, PRJ-10 (blocked on Q-03 — reviews use in-house live classes), CE-03 (project reviews), ADM-04 (GitHub), DSH-03, DSH-04, COM-03 (`task.assigned`) |
| Release | part of R3 |
| Packages added | `octokit` 5.0.5 (pinned in 03) |
| Env vars added | `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` (all optional: without them GitHub projects say so) |
| Collections | `projects`, `projectTasks`, `commits`, `projectReviews`; `syncRuns` gains `github` runs |

## Goal

Courses with project credits run projects in teams. CSE projects (`projectMode: github`) live on GitHub: the LMS links each project to a repository, syncs its commits, attributes them to students through their linked GitHub account, and shows commit count and quality with a transparent suggested score (PRJ-02/03/04). Other projects (`projectMode: tracker`) use a board where the faculty member, as project manager, assigns tasks and the LMS tracks deadlines (PRJ-05…08). Project reviews are held in the LMS and marked on the Examination Policy's project rubric; they are the project internal (PRJ-09).

## Decisions (Aniket, 23 Oct 2026)

1. **M07 before M08**, as the milestone map has it.
2. **Reviews fill the project rubric.** A project review is the teacher marking the policy's six internal project criteria (relevance 5, literature 5, methodology 10, analysis 10, interpretation 10, report 10) for each team member. A student's project internal is the average of their reviews, criterion by criterion, added up (07 §2). The Marks tab's project grid shows it read only; nothing is typed twice. This replaces M06 decision 3's typed project rubric (the practice rubric stays typed).
3. **GitHub is built now against mocks**; Aniket creates a test GitHub App for the test server so it can be tried for real, and CUTM's organisation (Q-22) replaces it later. Every GitHub variable is optional: without them a GitHub project says GitHub is not set up.

Consequence of decision 2 (dev): students hand nothing in for a review, so a review is not an assessment (the engine expects students to start attempts). It is its own record, `projectReviews`, on the Projects tab. The `project_review` assessment mode and `observation` items of the earlier plan are not built. A review may run as an in-house live class (`liveSessions.kind: 'review'`, Q-03's default).

## Mock-ups (T0)

Drawn inside the real app at 1440 px and 390 px; two variants where there is a real choice. Picks are recorded here before T3.

| # | Screen | Variants |
|---|---|---|
| P1 | The Projects tab (teacher; a student sees their own) | one |
| P2 | A GitHub project | A · a member table with the metrics · B · a card per member |
| P3 | A tracker project's board | A · four columns · B · one list grouped by status |
| P4 | Marking a review | one (the M2 A grid, six criteria per member, with each member's GitHub or tracker figures beside) |
| P5 | Linking GitHub on the profile, and the admin's Integrations page | one |

**Picks (Aniket, 23 Oct 2026):**
- P2 **A** · a member table with the metrics and the suggested score as a bar, then one team chart of commits per week and the latest commits.
- P3 **A** · four columns, a card per task with its move buttons (one column on a phone).
- P1, P4 and P5 as drawn.
- Found while drawing: when the course's tab row is scrolled, its underline stops short of the last tabs. `TabNav`'s list grows with its tabs so the rule runs under all of them (fixed with T3).

## Tasks

### T1 · GitHub adapter (06 §4.5)
Files: `lib/env.ts` (+ the six optional GitHub variables), `.env.example`, `lib/integrations/github.ts`, `package.json` (`octokit` 5.0.5).
- `githubConfigured()`; one lazily created `new App({ appId, privateKey, oauth: { clientId, clientSecret }, webhooks: { secret } })`.
- `installUrl()`, `oauthAuthorizeUrl(state)`, `exchangeOAuthCode(code)` → `{ id, login }`.
- `resolveRepo(owner, name)` → `{ installationId, defaultBranch }`; 404 → `AppError('NOT_FOUND', 'Install the CUTM LMS GitHub App on this repository first.')`.
- `listCommits`, `commitStats`, `verifyWebhook` as 06 §4.5.

### T2 · Models and pure functions
Files: `lib/models/{project,project-task,commit,project-review}.ts` (05 §6), `lib/schemas/projects.ts`, `lib/domain/commits.ts` (+ test), `lib/domain/tracker.ts` (+ test), the `projects` settings key (06 §7), `scripts/sync-indexes.ts`.
- `computeCommitMetrics(input)` — 07 §12 with both member vectors and the message vectors.
- `computeTrackerMetrics(tasks, now)` — 07 §13 (4 tasks: 2 done on time, 1 done late, 1 overdue → assigned 4, done 3, doneOnTime 2, overdue 1, onTimeRate 0.5).
- `canMoveTask(actor, from, to)`: an assignee may go `backlog → in_progress → review` and `review → in_progress`; faculty any move, including `→ done` and `done → in_progress`. All 16 pairs per actor.
- `reviewAverages(reviews)` — 07 §2: per criterion, the mean of the reviews that marked it.

### T3 · Projects and teams
Route: `/courses/[offeringId]/projects` (a tab when the course has project credits).
- `saveProject` (teach): title, description, members (active students; one project per student per offering — CONFLICT), guide (one of the offering's faculty), starts and due dates; `mode` from `offering.projectMode`.
- Teach and oversee see every project with its members, guide, dates and status; a student sees their own.

### T4 · Linking a GitHub account (profile)
- `/profile`: "Link GitHub account" → `startGithubLink` seals a 10-minute `state` (`purpose: 'github'`) and redirects to `oauthAuthorizeUrl(state)`.
- `/api/auth/github/callback`: the session must match the `state`'s user; `exchangeOAuthCode`; `users.github = { id, login, linkedAt }`; an id already linked to someone else → `/profile?github=taken`. "Unlink" clears it.

### T5 · Linking a repository and syncing (PRJ-02, PRJ-03)
- `linkRepository` (a member or teach): `owner/name`; `resolveRepo`; one repository per project and in the LMS; queue the sync.
- `sync/githubProject` (job id `gh-<projectId>`, debounced like `queueTestStats`): a `syncRuns` row; `listCommits` since the last sync (or the start date); up to 500 new commits a run with `commitStats`; upsert by `{ projectId, sha }`, `isMerge` when more than one parent, `studentId` by the members' `github.id`, then `github.login`; `lastSyncedAt`, `syncError`.
- `/api/webhooks/github`: `verifyWebhook` on the raw body; a `push` to a linked repository queues its sync; anything else is acknowledged.
- Scheduler `githubNightly` (02 §8).

### T6 · A GitHub project (PRJ-04, DSH-03; mock-up P2)
Repository and last sync ("Sync now" for teach, once a minute); per member: commits, active weeks of total, last-minute share, message quality, lines and share, huge commits, the **suggested score** (07 §12) with each part explained, weekly commits; commits not attributed (authors without a linked account) with a hint; the latest ten commits (20 made the page long on a phone; the picked mock-up shows a short list).

### T7 · A tracker project (PRJ-05 … PRJ-08, DSH-04; mock-up P3)
Tasks in Backlog, In progress, Review and Done, each with its assignee, due date and an overdue flag, and a button per allowed move (`canMoveTask`), no drag and drop.

| Action | Who | Rules |
|---|---|---|
| `saveTask` | teach | title, description, assignee (a member), due date; a new task starts in Backlog; `notify` the assignee (`task.assigned`) |
| `moveTask` | teach or the assignee | `canMoveTask`; appends `history`; Done sets `doneAt`, leaving Done clears it |
| `deleteTask` | teach | only Backlog tasks |

Then each member's tracker figures (07 §13) and the tasks due in the next seven days.

### T8 · Project reviews (PRJ-09; decision 2; mock-up P4)
- `saveReview` (teach): a title and date for a project, optionally run as a live class (`scheduleSession`, `kind: 'review'`); `deleteReview` while it has no marks.
- `saveReviewMarks` (teach, unlocked): the six criteria for each member (0 to the offering's maximum, two decimals, blank allowed), audited (`project.review_marked`); queues the internal-marks recompute.
- The marking grid shows each member's GitHub suggested score or tracker on-time rate beside the criteria, for the teacher to weigh; the teacher enters the marks.
- `recomputeInternalMarks` takes the project internal from `reviewAverages` (07 §2); the Marks tab's project grid becomes read only and links to the reviews; `saveRubricMarks` refuses `project`.

### T9 · Integrations page (GitHub part)
Route `/admin/integrations` (admin): whether GitHub is set up, the install link, projects with a sync error, the last 50 GitHub `syncRuns`, and the failed jobs of each queue (name, id, reason, attempts) with Retry.

### T10 · Tests
- Unit: T2 vectors.
- Integration (`@/lib/integrations/github` mocked): a repository without the App → NOT_FOUND with the install hint; a sync upserts commits once and attributes by id, then login; merge commits left out of the metrics; a student cannot move another's task; an assignee cannot move to Done; a bad webhook signature → 401; a callback with someone else's state links nothing; review marks become the project internal, audited, refused while locked.
- E2E (`tests/e2e/projects.spec.ts`, tracker only — no GitHub in CI): faculty makes a project and two tasks; the student moves one to Review; faculty marks it Done; the figures follow; a review is marked and the student's Marks tab shows the project internal.
- Manual (test server, Aniket's test App): link an account and a repository, push three commits, see them attributed within a minute.

## Acceptance criteria

- **AC-M07-01** A project in a GitHub course is a GitHub project; a repository links only once the App is installed on it.
- **AC-M07-02** Commits pushed to a linked repository appear within about a minute (webhook) and at least nightly, attributed to the student who linked that account.
- **AC-M07-03** The suggested score shows its parts and equals 07 §12 for its vectors; teachers enter the marks themselves.
- **AC-M07-04** On the board only faculty mark tasks done; overdue tasks are flagged; the on-time rate matches 07 §13.
- **AC-M07-05** Review marks become each member's project internal (the reviews' average per criterion) within a minute, audited, and not while marks are locked.

## Validation checklist (human)

- [ ] Create the GitHub App for CUTM's organisation (Q-22) and install it.
- [ ] Run one real CSE team project for a week; review the metrics with the faculty member for fairness.
- [ ] Run one non-CSE project on the board with real tasks and deadlines.
- [ ] Hold one project review in the in-house live room and mark it.
