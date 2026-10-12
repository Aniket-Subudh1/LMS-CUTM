# M01 · Academic structure & administration

| | |
|---|---|
| Depends on | M00 |
| Requirements | CRS-01, CRS-02, CRS-05 (objectives, COs, linked POs), CPP-01, CPP-02, CPP-03, CPP-04, CE-07 (configuration), ADM-01, ADM-02, ADM-03, ADM-05, SKL-01 (category), NFR-04, SUP-01 (support user tools) |
| Release | part of R1 |
| Packages added | `papaparse`, `@types/papaparse` |
| Env vars added | — |
| Collections | `departments`, `programs`, `batches`, `terms`, `courses`, `evaluationSchemes`, `offerings`, `enrollments` |
| Components introduced | `DataTable`, `TabNav`, `ConfirmSubmit`, `CoPoMatrix` (08 §5) |

## Goal

Admins can model the university: departments, programs (with POs/PSOs), batches, terms, the course catalog (components, credits, objectives, COs with Bloom levels, CO-PO-PSO matrix), versioned evaluation schemes, offerings with faculty and auto-enrollment, and users (single and bulk import, roles, disable, reset links). Faculty and students see their offerings in a course workspace with Overview and People tabs.

## In scope / out of scope

- **In:** tasks below.
- **Out:** syllabus text/PDF and the settings page (M02, first consumer), deleting a CO that items reference (rule enforced in M04 when items exist), scheme rebinding (M06), the HoD reports (M06+).

## Before you start

Read 05 §3 (all), 06 §8.1–8.2, 07 (none of the formulas yet), 08 §2–§6, 09 §2–§3, §6.

## Tasks

### T1 · Models
Files: `lib/models/{department,program,batch,term,course,evaluation-scheme,offering,enrollment}.ts`; add each to `scripts/sync-indexes.ts`.
Exactly 05 §3.2–§3.9 (fields, enums, bounds, indexes). Embedded arrays get `_id` where 05 lists one (`cos`, `modules`, `calendar`).

### T2 · Schemas and pure functions
Files: `lib/schemas/structure.ts`, `lib/domain/structure.ts` (+ test), `lib/domain/csv.ts` (+ test), `lib/domain/time.ts` (+ test), `lib/format.ts`, `lib/schemas/common.ts` (+ `page`, `pageSize`, `istDate`).

- First callers arrive here, so create: `lib/domain/time.ts` — `parseIstLocal`, `istDayKey`, `istDateToDate` with the 07 §11 vectors (terms use IST dates); `lib/format.ts` (exists since M00 with `ROLE_LABEL`; add) — `formatDateTime(d)` (`12 Oct 2026, 10:30 AM`, IST via `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', … })`), `formatDate(d)`, `statusTone(status)` → badge tone; `page`/`pageSize` (04 §6.3) for the first lists.

- `structure.ts` (schemas): inputs for every action below; `ASSESSMENT_MODES` (05 §5.1) and `BLOOM_LEVELS` as `as const` arrays (they are used from M01 by schemes and COs).
- `lib/domain/structure.ts`:
  - `componentKey(components)` → canonical order `theory`, `practice`, `project` joined by `+`. Vectors: `['practice','theory']` → `theory+practice`; `['project']` → `project`; `['project','theory','practice']` → `theory+practice+project`.
  - `validateScheme(input)` → list of messages: Σ weights ≠ internalMax ("Weights add up to 45; they must add up to 50."), duplicate component keys, a mode in two components, `best_n` without `bestN`, empty modes. Vectors: the 07 §2 example scheme is valid; the same with quiz weight 10 → one error naming 45 and 50.
  - `defaultOutcomes()` → `PO1…PO12` (title = code, to be edited) and `PSO1 Higher education`, `PSO2 Entrepreneurship`, `PSO3 Placement`.
  - `nextCoCode(existingCodes)` → `CO<n+1>` using the highest existing number.
- `lib/domain/csv.ts`: `parseUsersCsv(text)` and `parseEnrollmentCsv(text)` per 06 §8.1–8.2 returning `{ ok: true, rows } | { ok: false, errors: { row, message }[] }`. Pure: no database lookups (codes are resolved by the action). Tests: header aliases are case-insensitive; missing required column → one error naming it; 5,001 rows → error; student row without roll number → row error; duplicate email inside the file → row error.

### T3 · Record access
File: `lib/auth/access.ts` — exactly 04 §6.4 (`offeringAccess`, `requireTeach`). Integration tests: admin → oversee; listed faculty → teach; HoD of the department → oversee; HoD of another department → 404; enrolled student → learn; dropped student → 404.

### T4 · Departments, programs, batches, terms
Routes: `/admin`, `/admin/departments`, `/admin/programs`, `/admin/programs/[id]`, `/admin/terms`; no admin layout: since the UI redesign the sidebar's Administration group is the admin navigation (08 §3) and every admin page is guarded by its DAL call (`requireViewer(['admin'])`, Users also `support`); support sees only Users. Create and edit forms are `FormDialog`s on these pages (08 §6). Actions in `app/(app)/admin/actions.ts` (all `roles: ['admin']`, audit not required for structure except where 09 §6 says):

| Action | Rules |
|---|---|
| `saveDepartment` | code unique (CONFLICT), uppercase |
| `saveProgram` | code unique; on create for `ugc`, `pos`/`psos` = `defaultOutcomes()`; `skill` programs have none |
| `saveProgramOutcomes` | edit titles/descriptions; add/remove codes; removing a code used in any course `coMap` → CONFLICT naming the courses; `updateTag('catalog')` |
| `saveBatch` | `{ programId, startYear }` unique; sections list |
| `saveTerm` | code unique; `startsOn < endsOn`; only one `current` term at a time (setting one `current` sets the previous `current` to `closed` in a transaction) |

Lists use `DataTable` (first call sites: departments, programs, terms). `listProgramsForSelect()` uses `use cache` per 02 §5.

### T5 · Course catalog, COs and the CO-PO-PSO matrix
Routes: `/admin/courses` ("New course" dialog; `saveCourse` returns `{ next: '/admin/courses/<id>' }` for a new course), `/admin/courses/[id]`.

| Action | Rules |
|---|---|
| `saveCourse` | `programId`; `departmentId`, `category` copied from the program; `componentKey` computed; code unique within the program |
| `saveObjectives` | ≤ 20, each ≤ 500 |
| `addCo` / `updateCo` / `deleteCo` | ugc only; code from `nextCoCode`; Bloom level required; ≤ 15 COs; audit `course.cos_changed` |
| `saveCoMap` | input `cell[]` entries `"<coId>:<outcome>:<level>"` from `CoPoMatrix` (`mode: 'edit'`, empty = no link); validates outcome codes against the program and levels 1–3; replaces `coMap`; audit `course.map_changed` with changed cells |

`CoPoMatrix` (server component, 08 §5) renders COs as rows and the program's PO and PSO codes as columns. In `edit` mode each cell is a `<select name="cell[]">` with options "–", 1, 2, 3 whose values encode `coId:outcome:level`.

### T6 · Evaluation schemes (ADM-01, CE-07)
Routes: `/admin/schemes` (one row per `componentKey` with the active version), `/admin/schemes/[componentKey]` (version history + "New version" form).

| Action | Rules |
|---|---|
| `createSchemeVersion` | input: `componentKey`, `name`, `internalMax`, `externalMax`, `components[]` (rows: key, label, weight, `modes[]`, aggregation, bestN), rounding; `validateScheme` must return no messages (VALIDATION with all messages); in one transaction: insert version n+1 `active`, set the previous active to `retired`; audit `scheme.versioned` |

The form renders a fixed 10-row component grid (empty rows ignored) — no client-side row adding. Modes are checkboxes from `ASSESSMENT_MODES`.

### T7 · Offerings and enrollment
Routes: `/admin/offerings` (filters: term, department, status; "New offering" dialog — choose the programme first, then the course, batch and term lists for it load into the dialog), and the People tab (T10).

| Action | Rules |
|---|---|
| `createOffering` | course + term + batch (+ optional section); unique per 05 §3.8 (CONFLICT); faculty 1–5 users with role `faculty`; denormalized fields copied; ugc → bind the **active** scheme for `course.componentKey` (VALIDATION "No active evaluation scheme for theory+practice." if none); skill → `schemeId: null`; `projectMode` required iff the course has `project`; status `draft`; then enroll every `student` with that `batchId` (and `section` when given) with one `insertMany(…, { ordered: false })`; audit `enrollment.changed` |
| `updateOfferingFaculty` | 1–5 faculty |
| `setOfferingStatus` | `draft → active → completed` only |
| `changeEnrollments` | teach or admin; CSV per 06 §8.2 (`rollno,action`); unknown roll number → row error; all-or-nothing; audit `enrollment.changed` with counts |

### T8 · Users (ADM-05, SUP-01)
Files (besides the routes): `lib/schemas/jobs.ts` + `MailJob` (`invitation { userIds }`, 06 §6); `lib/queue.ts` mail queue typed `Queue<MailSend | MailJob, void, 'send' | 'fanout'>`; `worker/jobs/mail.ts` + `fanout` (for each chunk of 500 invited users: a 7-day invite token, `invitationEmail`, `send` with job id `mail-invite-<userId>-<minuteBucket>`). `sendResetLink` is the second caller of the reset email: move the token + `resetEmail` + enqueue lines from `app/(auth)/actions.ts` into one exported function in `lib/auth/tokens.ts` and call it from both.

Routes: `/admin/users` (search box → text index; filters role/status; "New user" and "Import CSV" dialogs — `createUser` returns `{ next: '/admin/users/<id>' }`), `/admin/users/[id]`.

| Action | Roles | Rules |
|---|---|---|
| `createUser` | admin | 05 §3.1 invariants; status `invited`; enqueue `mail/fanout invitation`; audit `user.created` |
| `importUsers` | admin | `parseUsersCsv`; resolve department/program/batch codes (unknown code → row error); all-or-nothing in a transaction (upsert by email; existing users keep status and password); enqueue one invitation fanout for new users; audit one `user.imported` entry with counts. Row errors are returned as `fieldErrors.file` strings "Row 12: …" (max 200) so the standard `Field` shows them |
| `updateUserRoles` | admin | at least one role; cannot remove the last active admin (CONFLICT); audit `user.roles_changed` |
| `setUserStatus` | admin | `active` ↔ `disabled`; disabling increments `sessionVersion`; audit `user.disabled` |
| `revokeUserSessions` | admin | `sessionVersion + 1`; audit `user.sessions_revoked` |
| `sendResetLink` | admin, support | same as `requestPasswordReset` for that user (no rate limit for staff) |

Support sees list and detail (name, email, roll no, roles, status, enrollments) and only the "Send reset link" button.

### T9 · Audit log page
Route: `/admin/audit` — filters: entity, entity id, actor email, offering, date range (IST); `DataTable` of `at`, actor, action, entity, reason, compact before/after.

### T10 · Course workspace (Overview, People) and "My courses"
Routes: `/courses`, `app/(app)/courses/[offeringId]/layout.tsx`, `/courses/[offeringId]` (Overview), `/courses/[offeringId]/people`.

- `/courses`: `listMyOfferings(page, filters)` — admin sees all with term/department filters; HoD sees their department's; faculty theirs; students their enrolled `active`/`completed` ones (09 §3).
- Workspace layout: offering title, term, faculty names, and `TabNav` (Overview, People for teach/oversee); later milestones add tabs per 08 §3. Header + tabs inside `<Suspense>`.
- Overview: course code/title, credits, components, objectives, COs (code, statement, Bloom level) and, for each CO, its linked PO/PSO codes with levels (read-only `CoPoMatrix` with `mode: 'levels'`).
- People: roster `DataTable` (roll no, name, email, status); for teach/admin, the enrollment-change form (T7).

### T11 · Home sections and seed data
- `/home`: faculty — "My offerings this term"; student — "My courses"; admin — links to Structure, Offerings, Users; support — link to Users. Since the UI redesign: `getHomeSummary()` in `lib/data/workspace.ts` (stat tiles: the viewer's offerings, active enrolments across the offerings they teach or oversee, and for admins the structure, catalogue, offering and user counts plus the six latest audit entries; 08 §6 Home).
- `scripts/seed.ts` (dev) creates the structure below; `--e2e` creates the deterministic fixture set in 10 §3 with passwords from `.env.e2e`:
  department CSE; program `BTECH-CSE` (ugc) with default outcomes; batch 2025 (sections A, B); program `SKILL` (skill); term `2026-ODD` current; course `CS101 C Programming` (theory+practice, 4 credits, CO1–CO3, a CO map); course `SK01 Excel Basics` (skill); scheme `theory+practice` v1 as in 07 §2; two offerings with one faculty each; 20 students in batch 2025 section A.
- Add CI step 5 (e2e) now that the seed exists.

### T12 · Tests
- Unit: T2 vectors.
- Integration: every action's VALIDATION / FORBIDDEN / success path; `createOffering` enrolls exactly the batch+section students; scheme versioning keeps one active version; removing a PO used in a map → CONFLICT; last-admin protection; `importUsers` all-or-nothing (one bad row → zero users written); support cannot call `updateUserRoles` (FORBIDDEN); `listMyOfferings` scoping for each role (09 §3).
- E2E (`tests/e2e/admin-structure.spec.ts`): admin creates a program, course with two COs and a map, a scheme version, an offering for the seeded batch → a seeded student signs in and sees the course in My courses → Overview shows the COs.

## Acceptance criteria

- **AC-M01-01** A scheme whose weights do not sum to the internal maximum cannot be saved; the error states both numbers.
- **AC-M01-02** Saving a new scheme version retires the previous one; existing offerings keep their bound version.
- **AC-M01-03** Creating an offering for batch 2025 section A enrolls exactly the active students of that section; creating it twice → CONFLICT.
- **AC-M01-04** A ugc course's CO-PO-PSO matrix accepts only levels 1–3 and only the program's outcome codes; the Overview shows the saved links.
- **AC-M01-05** Importing a 3,000-row users CSV with one invalid row writes nothing and lists that row's error; the corrected file creates the users and sends invitations.
- **AC-M01-06** A student sees only their enrolled active/completed offerings; a faculty member only their own; an HoD only their department's; another department's offering URL returns 404 for each.
- **AC-M01-07** A support user can find a student and send a reset link, and cannot open any other admin page (redirect to `/home`).
- **AC-M01-08** Every role/status/session change appears in `/admin/audit`.

## Validation checklist (human)

- [ ] Build the CUTM structure for one real program with the client's data (department, program POs/PSOs, a batch, a term).
- [ ] Enter one real course with its real COs and CO-PO matrix; compare with the university's document.
- [ ] Configure the theory+practice scheme with the client's real weights (Q-05).
- [ ] Import a real (or realistic) student list; check invitation emails in Mailpit.
- [ ] Sign in as a student from the import; see the course; check the Overview.
