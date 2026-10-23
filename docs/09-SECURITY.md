# 09 · Security and privacy

## 1. What we protect, from whom

| Asset | Threat | Primary control |
|---|---|---|
| Marks, attendance, grade sheets | A student changing their own or others' records; a faculty member editing outside their offering; silent edits after export | Role + record checks in every action; locks; audit log |
| Answer keys, hidden test cases | Students reading them from the page, network or client bundle | Student DTOs strip them; integration test proves it |
| Student personal data and submissions | Other students; the public; third parties (AI, vendors) | Scoped DAL queries; private object storage; presigned URLs; AI receives no PII |
| Accounts | Credential stuffing, session theft | argon2id; rate limits; httpOnly sealed cookie; session versioning |
| Secrets | Leaking into the browser bundle or logs | Env only; no `NEXT_PUBLIC_`; bundle scan in CI; log redaction |
| Assessments integrity | Cheating in online tests | Proctoring (M04b phase C, TP-08), time limits, server-side timing, server-side grading |

## 2. Permission matrix

✔ allowed · ◐ own records only · ○ read-only · — not allowed. "F" means faculty **assigned to that offering** (`teach`); "H" means HoD **of that offering's department** (`oversee`, read-only).

| Capability | Student | Faculty | HoD | Admin | Support |
|---|---|---|---|---|---|
| Departments, programs, outcome titles, baskets, curriculum, batches, terms | — | — | ○ | ✔ | — |
| Catalogue course: read (`/catalog`) | ○ (via offering Overview) | ○ | ○ | ✔ | — |
| Catalogue course content: objectives, COs, CO-PO-PSO mapping, syllabus and PDF, books, session plan, mark reviewed | — | ◐ (as its coordinator, CRS-07) | — | ✔ | — |
| Catalogue course details (code, title, credits, type, status), coordinator, replace with courseware content | — | — | — | ✔ | — |
| Course-list upload, courseware import | — | — | — | ✔ | — |
| Evaluation policy and other settings | — | — | ○ | ✔ | — |
| Offerings: create, assign faculty | — | — | — | ✔ | — |
| Users: create, import, roles, disable | — | — | — | ✔ | — |
| Users: view, send password-reset link | — | — | — | ✔ | ✔ |
| Enrollment changes | — | ✔ | — | ✔ | — |
| Course plan & calendar: edit, publish | ○ (published) | ✔ | ○ | ✔ | — |
| Lessons: add, publish, delete | ○ (published) | ✔ | ○ | ✔ | — |
| Live sessions: schedule, start, end | — | ✔ | ○ | ✔ | — |
| Live sessions: join | ✔ (enrolled) | ✔ (host) | — | ✔ any class, as host (Aniket, 17 Oct 2026) | — |
| Live sessions: raise a hand (M03b) | ✔ (in the class) | — | — | — | — |
| Live sessions: lower hands (M03b) | ◐ own | ✔ (host) | — | ✔ (host) | — |
| Live sessions: in-class chat (M03b; not stored) | ✔ (in the room) | ✔ | — | ✔ | — |
| Live sessions: emoji reactions (M03c; not stored) | ✔ (in the room) | ✔ | — | ✔ | — |
| Live sessions: mute someone, mute everyone (M03c; off only, never on) | — | ✔ (host) | — | ✔ (host) | — |
| Live sessions: remove a student, let them back (M03c; audited) | — | ✔ (host) | — | ✔ (host) | — |
| Live sessions: turn off students' screen sharing, microphones, chat and reactions (M03c) | — | ✔ (host) | — | ✔ (host) | — |
| Attendance: manual mark / override | ◐ view | ✔ | ○ | ✔ | — |
| Assessments: create, edit, publish | ○ (published) | ✔ | ○ | ✔ | — |
| Attempt / submit | ✔ (enrolled, in window) | — | — | — | — |
| Grade, publish results | ◐ view after publish | ✔ | ○ | ✔ | — |
| Submissions: view answers and files | ◐ | ✔ | ○ | ✔ | status only |
| Internal marks & trend | ◐ | ✔ | ○ | ✔ | — |
| An assessment's "Counts toward" (M06) | — | ✔ | ○ | ✔ | — |
| Practice and project rubric marks (M06) | ◐ own | ✔ | ○ | ✔ | — |
| Refresh an offering's evaluation policy (M06) | — | — | — | ✔ | — |
| CE report (M06) | — | — | ○ own department | ✔ | — |
| Lock marks | — | — | — | ✔ | — |
| Unlock marks (reason required) | — | — | — | ✔ | — |
| End-sem import, CE export, grade-sheet publish | — | — | — | ✔ | — |
| Grade sheet | ◐ (published) | — | — | ✔ | — |
| Projects: create, assign members/tasks, mark done | — | ✔ | ○ | ✔ | — |
| Projects: move own tasks, link repo | ◐ (member) | ✔ | — | — | — |
| Project reviews: schedule, mark (M07) | ◐ own marks | ✔ | ○ | ✔ | — |
| Link a GitHub account (M07) | ✔ own | ✔ own | — | — | — |
| Integrations page (M07) | — | — | — | ✔ | — |
| Attainment: compute, view | — | ✔ | ○ | ✔ | — |
| AI suggestions | — | ✔ | — | ✔ | — |
| Engagement scores & drill-down | — | ✔ | ○ | ✔ | — |
| Audit log | — | — | — | ✔ | — |
| Imports page (sync runs), integrations page (failed jobs) | — | — | — | ✔ | — |

## 3. Data scoping rules (exact)

Every exported DAL function and every action applies these filters; integration tests prove that a second user's data is not returned.

| Data | Student (`learn`) | Faculty (`teach`) | HoD (`oversee`) | Admin |
|---|---|---|---|---|
| Offerings list | `_id ∈ enrollments(studentId = me, status active)` and offering `status ∈ {active, completed}` | `facultyIds ∋ me` | `departmentId = my departmentId` | all |
| Lessons | `published = true` | all of the offering | all | all |
| Assessments | `status ≠ draft` | all | all | all |
| Submissions | `studentId = me` | offering's | offering's | all |
| Standalone tests (M04b) | anyone with a `testGrants` row (made by a share link), `status ≠ draft`; their own submissions | their own (`ownerIds ∋ me`): manage | — | all: manage |
| Question banks (M04b) | — | a course's bank through an offering they teach (edit); their own bank | a course's bank of an offering in their department (read) | all |
| Share links (M04b) | — (a link's page shows only the test's title, owner, window and counts) | of tests they manage | — | all |
| Results analytics and similarity flags (M04b) | their own result; the right answers and explanations only when the test's rules show them; a leaderboard (others' names and totals) only when the test shows one | of tests they manage | of their department's offerings: read | all |
| Files made from the results (M04b, TP-12) | their own scorecard, and their certificate when the result earns one | of tests they manage: the Excel export and reports PDF | of their department's offerings: the same two | all |
| Certificate check `/v/<code>` (M04b) | anyone, signed out: the name, the test, the date, the percentage and, when printed, the rank and rating — what the certificate itself states — and whether it is still earned | | | |
| Live monitor and proctoring records (M04b) | their own warnings count and the monitor's messages to them; never their snapshots | of tests they manage: act (time, messages, end, waive) | of their department's offerings: watch and read | all |
| Attendance, internal marks, lesson progress, engagement | `studentId = me` (engagement: not shown to students) | offering's | offering's | all |
| End-sem marks, grade sheets | `studentId = me`, grade sheet `published` | — | — | all |
| Projects & tasks | `memberIds ∋ me` | offering's | offering's | all |
| Users | self | students enrolled in my offerings (name, roll no, email) | users of my department | all |
| Catalogue courses (M01b) | only through an offering's Overview | all (read); content edits only where `coordinatorId = me` | all (read) | all |

Rules:
- Access is decided by `offeringAccess()` (04 §6.4), then the filter above is applied **inside the query**, not by filtering results in JavaScript. A catalogue course's editors are decided by `canEditCourse()` / `requireCourseEditor()` in `lib/auth/access.ts` (admin, or faculty whose id is the course's `coordinatorId`); an action refuses anyone else with FORBIDDEN and the page shows no edit buttons.
- Never accept a `studentId` from a student's request; use `viewer.id`.
- Never trust a hidden form field for ownership (`offeringId` in a form is re-checked).
- Ids that do not resolve or are not accessible → `notFound()`.
- M04b: an assessment's access is decided from the assessment (`assessmentAccess()` → `manage` · `oversee` · `take`): a course's follows `offeringAccess()`; a standalone test's comes from `ownerIds` and admin (manage) or a grant (take). A page under a course 404s when the assessment is not that course's. A candidate (05 §3.1) reaches nothing but their granted tests and their own results.

## 4. Rate limits (`lib/rate-limit.ts`, 07 §16)

| Action | Subject | Limit |
|---|---|---|
| Login (failed attempts; a success refunds its slot, 07 §16) | email | 5 / 15 min |
| Login (failed attempts) | IP | 30 / 15 min |
| Forgot password | email | 3 / hour |
| Forgot password | IP | 20 / hour |
| Guest registration and sign-in codes (M04b, TP-03) | IP | 20 / 15 min |
| Guest registration and sign-in codes | email | 5 / 15 min |
| Guest code check | IP | 30 / 15 min; and 5 tries per code, counted before the check |
| Test invitations (M04b) | owner | 20 sends / day, ≤ 500 addresses each |
| Code run (`runCode`, M04b) | user | 1 per `runCooldownSec` (3 s), 200 / hour; and each question's `runLimit` (1–30) an attempt |
| `createUpload` | user | 60 / hour |
| Answer autosave | user | 60 / min |
| Proctoring beat (M04b) | user | 30 / min (one every 15 s, plus one per event) |
| Camera snapshot upload (`createUpload`, `proctor-snapshot`; not counted in the 60 / hour) | user | 4 / min |
| Monitor messages (M04b) | staff | 30 / min |
| Files from the results (`requestTestFile`, M04b) | user | 10 / hour |
| Beacon | user | 120 / 10 min |
| AI suggestion (`ai`; M04b: `draftWithAi`, whatever it asks for) | user | 30 / hour |

The client IP is the first entry of `X-Forwarded-For`, which the production load balancer must overwrite (11 §4). On limit: `AppError('RATE_LIMITED')` / HTTP 429.

## 5. Uploads and downloads

- Purposes, types, sizes and key formats: 06 §5. The server, not the browser, decides the key.
- The bucket is **private**. No public ACLs, no public bucket policy. Browser CORS on the bucket allows `PUT, GET, HEAD` from `APP_URL` only (`scripts/s3-setup.ts`; verified on RustFS).
- Presigned PUT expires in 300 s and is bound to the content type and size; presigned GET expires in 600 s.
- A key is accepted by a consuming action only if its prefix matches `<purpose>/<contextId>/<viewer.id>/`.
- `/api/files/<key>` re-runs the download rule from 06 §5 on every request. Its redirect may be reused by the browser for 300 s (`Cache-Control: private`), never longer than the 600 s presigned GET it points at (M03b).
- **Pictures (M03b):** thumbnails and covers are JPEG, PNG or WebP only, never SVG, which can carry script. The browser re-encodes them as JPEG before the upload; the server still accepts only the picture content types.
- Downloads set `Content-Disposition: inline; filename="<sanitized>"`; never serve user uploads from the app's own origin.
- **Files made from results (M04b, TP-12):** only the worker writes `test-file/…` objects; `/api/files` serves one only while it is its `testFiles` record's current key, and a made-again file's old object is deleted. A certificate's code is 10 characters from 32 (50 bits), so codes cannot be guessed; `/v/<code>` shows only what the certificate prints.
- **Imported courseware pages (M01b):** their HTML is never rendered or stored; the adapter turns it into plain lines and tables with scripts off, and the catalogue stores only plain text. Email addresses and phone numbers on those pages are removed before anything else sees them, so contact details are never stored (A-60). The importer only fetches pages on the `COURSEWARE_URL` host.

## 6. Audit log

Write `auditLogs` (05 §7.5) for these actions, in the same transaction as the change when the change spans documents:

| Action | Before/after captured |
|---|---|
| `user.created`, `user.imported` (one entry per import with counts), `user.roles_changed`, `user.disabled`, `user.sessions_revoked`, `user.password_changed` | roles, status (never the password) |
| `settings.updated` | changed fields |
| `course.created`, `course.updated` | code, title, type, credits, status |
| `course.coordinator_changed` | coordinator id |
| `course.content_changed` | the section (objectives, syllabus module, syllabus order, syllabus PDF, projects, books, session plan) before and after; a module or PDF added has `before` null, one deleted `after` null (M03b) |
| `course.cos_changed`, `course.map_changed` | one CO before/after `{ code, statement, bloomLevels }` (added: `before` null; deleted: `after` `{ deleted, mappingLinksRemoved, offeringsUntagged }`, M03b); changed cells |
| `course.reviewed` | the review notes cleared |
| `course.imported` | courseware page, forced or not, counts, review notes, whether the coordinator was prefilled (actor: who started the run) |
| `course.list_imported` (one entry per upload, entity `course_list`) | rows and counts created/updated |
| `courseware.import_started` | mode, page |
| `programme.outcomes_changed`, `programme.curriculum_changed` | titles; baskets, added/removed courses |
| `catalog.migrated` (once, by the M01b migration) | counts |
| `enrollment.changed` | added/dropped counts and `source`: `csv`, `single` ("Add student") or `roster` (drop / add again), with the student's roll number for the last two (M03b) |
| `plan.published` | version, recipient count |
| `attendance.marked` | status before/after, source |
| `live.deleted` (M03b) | the class's title, status and scheduled start; only a class that never ran and has no attendance can be deleted |
| `live.removed`, `live.allowed_back` (M03c) | the student removed from a running class or let back; a removed student gets no join token, a join with a token they kept is removed again by the webhook and not counted, and tokens live 10 minutes |
| `assessment.published`, `assessment.results_published` | status; when a test's release rule publishes them (M04b), the actor is whoever chose the rule and the reason says so |
| `submission.graded` | per-item marks before/after |
| `submission.code_rerun` (M04b) | who asked the code to be tested again (the marks follow from the `gradeCode` job) |
| `assessment.time_added` (M04b, the live monitor) | minutes and the number of attempts given them; entity the attempt, or the test for everyone |
| `submission.ended` (M04b) | status before, `endedBy: teacher` after |
| `submission.penalty_waived`, `submission.penalty_restored` (M04b) | `waived` and `total` before/after |
| `assessment.counts_toward` (M06) | the part before and after |
| `marks.rubric_saved` (M06) | per student, the component and the criteria before and after |
| `offering.evaluation_refreshed` (M06) | the evaluation copy before and after |
| `project.review_marked` (M07) | per member, the criteria before and after |
| `project.repo_linked` (M07) | the repository before and after |
| `user.github_linked`, `user.github_unlinked` (M07) | the GitHub login linked or removed |
| `job.retried` (M07) | the queue and job an admin tried again |
| `marks.locked`, `marks.unlocked` (reason required) | lock state |
| `endsem.imported` | rows applied, syncRunId |
| `ce.exported` | offerings, syncRunId |
| `gradesheet.published` | term, count |
| `lesson.deleted` | title |

Never put answer text, file contents, passwords, tokens or secrets in an audit entry.

## 7. Secrets and environment

- All secrets are server environment variables (11 §2). There are **no `NEXT_PUBLIC_` variables** in this project.
- `lib/env.ts` is `server-only`. Client components receive only what a server component passes as props.
- `lib/log.ts` must never be given a secret, a password, a session cookie, a token, or an answer. Log ids, not content.
- CI runs `scripts/check-bundle.ts` after `next build`: it fails if any value of a secret env var, or the string `SESSION_PASSWORD`, `S3_SECRET`, `PRIVATE_KEY`, `OPENAI_API_KEY`, appears anywhere under `.next/static`.

## 8. HTTP security headers (`next.config.ts` → `headers()`)

```ts
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];
```

The CSP deliberately does not restrict scripts (a nonce-based script policy forces every page to render dynamically). Revisit in M11 only if the client's security review requires it.

## 9. Authentication details

- Password policy: 10–128 characters; must not equal the email; no composition rules.
- Login failure message is always "Email or password is incorrect." (also for invited users without a password and disabled users).
- `forgot-password` says "This email does not exist in the database." when no active or invited user has that email, and "This email is registered. A reset link has been sent." when one does. Login still uses one message for every failure.
- Session: 12 h TTL; `sessionVersion` check on every request (02 §6). "Sign out everywhere" and password change increment it.
- **Guests (M04b, TP-03).** A guest registers on a guests link with name and email; a 6-digit code (`crypto.randomInt`) goes to that email and lives 10 minutes with 5 tries. Only its HMAC-SHA256 (keyed with `SESSION_PASSWORD`, bound to the email and the link) is stored (05 §5.2c). Confirming it makes or finds a `candidate` account — no password, role exactly `['candidate']` — and signs it in. An email that belongs to any other account never signs in by code (CONFLICT at registration, FORBIDDEN at confirmation): it signs in with its password on the same page, so a guest link is never a way into a staff or student account. A link's access code is compared in constant time; the link's token (18 random bytes) is its only secret. The link page masks the pending email (`ri••••@gmail.com`).
- `proxy.ts` lets `/t/<token>` through without a session (it is public by design); every other check is in its actions.
- Server Actions are POST-only and Next.js checks `Origin` against `Host`; route handlers that mutate (`/api/beacon`) rely on the `sameSite=lax` cookie, which browsers do not send on cross-site POSTs; webhooks rely on signatures.

## 10. Assessment secrecy

- A question reaches whoever takes it only through one function, `toStudentItem()` (M04b; `toStudentAssessment()` before), which omits `answer`, a fill-in-the-blank's accepted answers, CO tags and Bloom levels, the rubric until results are published, and every `testCases` entry with `hidden: true` (visible cases are shown with input and expected output). A matching question's sides carry different ids (`_id` left, `rightId` right) and the right sides are shuffled, so nothing pairs them; an ordering question's steps never start in the right order. The lobby's DTO (`toStudentAssessment()`) carries counts and section rules, never questions. The attempt DTO calls the student's own saved answers `saved`, so a search for `answer` in what a student receives finds nothing (M04).
- Since M04b an attempt's questions are its own paper (05 §5.2): grading, the grader's view and the results read only the paper, so a bank or assessment edited afterwards changes no attempt. Section rules are enforced on the server: a closed section (left when "no going back", or out of time) refuses saves (CLOSED).
- Auto-grading runs on the server against the stored keys; the browser never receives a score before results are published.
- Attempt timing is server-side: `deadlineAt` is computed when the attempt starts; a save more than 5 s after `deadlineAt` (the grace for one sent just before 0:00, `SAVE_GRACE_MS`) is rejected and the attempt is auto-submitted with the answers saved until then. The runner's countdown runs on the server's clock (M04), and a closed tab is handed in by the hourly sweep.
- Code questions (M04b, TP-09): a hidden test reaches nobody but the test's staff — `toStudentItem()` sends only the visible tests and a count, and `runCode` runs and answers with the visible tests only; the hidden ones run in the worker after hand-in. Code is run by the code runner at `CODE_RUNNER_URL`, a third party while that is Judge0's free public server (Q-55).
- Integration test (M04/M05): serialize the student DTO of an assessment with answers and hidden cases and assert neither appears.

## 11. Proctoring privacy (M04b phase C, from M05)

- Before a proctored attempt starts, the lobby lists exactly what is watched — full screen, leaving the page, a second tab or device, copy, paste, right-click, printing and developer tools, lost connections, and only if enabled camera stills every N seconds — with the limit and the penalty, and the taker ticks that they read the rules. `startAttempt` refuses a new attempt without the tick (`agree`, since 23 Oct 2026); continuing one asks nothing.
- No audio, no screen recording, no continuous video, no face recognition or automated "cheating" verdicts (Q-09). Warnings are facts with their times for a teacher to judge; a grader can waive the penalty, audited. The taker sees their own count and a banner for each serious one, and their own camera in the corner while snapshots are taken.
- Snapshots are private objects (`proctor-snapshot/<submissionId>/…`) readable only by the test's staff (teach, oversee; a standalone test's owners and admins) — never by the person in them; deleted `snapshotRetentionDays` after results (05 §8). Uploads are refused unless the attempt is the viewer's own, running, on a test that takes snapshots, with room left.
- The watermark (the taker's email and the time) and hiding the page when printed deter photos and copies; blocking copy, paste, right-click and the developer-tools keys is a deterrent the server cannot enforce, so every try is recorded.

## 12. AI data policy (M09, M10)

- Sent to the model: question text, a topic a teacher types for drafts (M04b, TP-10), CO statements and Bloom levels, PO/PSO titles, and numeric engagement metrics with labels.
- Never sent: student names, roll numbers, emails, answers, submissions, marks of identifiable students, faculty names.
- AI output is a suggestion rendered for a human; nothing is written to records until a human submits the normal form. M04b: drafts are saved to the bank as AI drafts, which no test uses until a teacher saves each in its dialog.
- The API key is server-only (`OPENAI_API_KEY`). The AI is OpenAI's (since 18 Oct 2026).
