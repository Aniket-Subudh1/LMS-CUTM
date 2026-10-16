# Progress

The living record of the build. Agents append; humans sign validations. Newest log entries go at the bottom of §5.

## 1. How to write an entry

```
### <date> · <milestone>/<task> · <agent or person>

**Created** — one line per file created or changed
**Not done** — what the task asked for that is not finished, and why
**Assumptions** — anything the docs did not specify that you decided (also add to §4)
**Open questions** — new questions (also add to §3)
**Verification** — exact commands and the summary line each printed; manual steps performed / not performed
```

## 2. Milestone status

| Milestone | Status | Validated by | Notes |
|---|---|---|---|
| M00 Foundation | Done — awaiting human validation | | shadcn/ui adopted at the client's request (entry below) |
| M01 Academic structure & admin | Done — awaiting human validation | | Entry 2026-10-13 · M01. CI e2e job not yet run on GitHub |
| M02 Content, plan, announcements, skill progress | Done — awaiting human validation | | Entry 2026-10-15 · M02. Cursor built most of it; reviewed, corrected and completed by Claude Code. CI e2e job (with RustFS) not yet run on GitHub |
| M01b Catalogue v2 | Done — awaiting human validation | | Entry 2026-10-16 · M01b. Replaces M01's catalogue, schemes and offering creation. M06/M08 wait on Q-41 |
| M03 Live classes & attendance | Done — awaiting human validation | | Entry 2026-10-16 · M03. Self-hosted LiveKit (ADR-18). CI e2e job (with LiveKit) not yet run on GitHub |
| M04 Assessment engine | Not started | | |
| M05 Virtual lab & proctoring | Not started | | Runner identity: Q-25 (b); feature set: Q-09 |
| M06 Continuous evaluation | Not started | | CE-10 specifics: Q-06 |
| M07 Projects | Not started | | Q-22, PRJ-10: Q-03 |
| M08 Exam integration & grade sheet | Not started | | API: Q-04 |
| M09 Attainment & AI tagging | Not started | | Formula sign-off: Q-07 |
| M10 Engagement & dashboards | Not started | | Q-26 |
| M11 Hardening & launch | Not started | | Hosting: Q-12 |

## 3. Open questions

Owner `@client` = Saneev Sir / CUTM; `@dev` = delivery team. "Blocks" names what cannot be finished without the answer; everything else proceeds on the stated default.

| ID | Question | Owner | Default until answered | Blocks | Status |
|---|---|---|---|---|---|
| Q-01 | The call mentioned three course types; only UGC-aligned and skill were described. What is the third? | @client | Not built | — | Answered 15 Oct 2026 (Aniket, M01b): CUTM's courseware has six type labels (Core, Domain, Skill, Certificate, Advanced certificate, Diploma); the LMS has two modes decided by credits (01 §6) |
| Q-02 | Skill courses "just like UDP": which program or platform is meant? | @client | Existing LMS feature set (SKL-03) | — | Answered 15 Oct 2026 (Aniket, M01b): the skill mode is for non-credit (0-0-0) courses |
| Q-03 | Project reviews through Google Meet (07:19) or the in-house live class, given "no Meet API"? | @client | In-house live class | PRJ-10 | Open |
| Q-04 | Exam-system API: provider, documentation, authentication, data format, pull/push frequency | @client | CSV import/export | M08 API adapter | Open |
| Q-05 | Is the internal maximum always 50? Default component weights per subject type? | @client | Admin enters schemes | — | Answered 15 Oct 2026 (Aniket, M01b): CUTM's Examination Policy marks each component out of 100 — theory internal 40 + end-semester 60, practice and project 50 + 50 by rubric (evaluation policy in Settings) |
| Q-06 | Exact workflow for "continuous evaluation in mark entry" (CE-10) | @client | M06 marks view | CE-10 specifics | Open |
| Q-07 | Attainment formula: target %, level thresholds, CIE:SEE weights, direct/indirect, NBA format? | @client | 07 §4 defaults (60 %; 70/60/50; 0.5/0.5; direct only) | M09 sign-off | Open |
| Q-08 | Are PSOs the same for all programs or program-specific? | @client | Since M01b: the codes PO1–PO12 and PSO1–PSO3 are fixed and each programme gives them titles (defaults for PSO1–3: Higher education, Entrepreneurship, Placement) | — | Open (changed 15 Oct 2026) |
| Q-09 | Which proctoring features (webcam, screen, tab switch, AI flags)? | @client | Full-screen, tab-switch, paste block, optional webcam snapshots; no AI flags | — | Open |
| Q-10 | Languages and lab types beyond C, C++, Java? | @client | C, C++, Java only | LAB-06 | Open |
| Q-11 | Expected scale: students, faculty, programs, concurrent live-class users | @client | 02 §11 targets (A-03) | M11 sizing | Open |
| Q-12 | Hosting (university servers or vendor cloud) and data-residency requirements | @client | Docker on Linux; any S3 | M11 deploy | Open |
| Q-13 | SSO with university systems (ERP, email)? Mobile app? | @client | Email + password; responsive web | — | Open |
| Q-14 | Support person: hours, channels (phone, chat, email), SLA | @client | 11 §8 proposal | — | Open |
| Q-15 | Target go-live date; which semester/batch first | @client | R1 pilot after M04 | Release plan | Open |
| Q-16 | Format and deadline of the D2L review report | @client | — (not code) | — | Open |
| Q-17 | Lesson completion threshold (90 %) and live-attendance threshold (75 %) | @client | 90 % / 75 % | — | Open |
| Q-18 | Internal-marks rounding: integer or decimals; half-up or ceiling? | @client | The course percentage rounds up once (Examination Policy); component rounding is Q-39 | — | Answered in part 15 Oct 2026 |
| Q-19 | Grading scale, grade points and pass rules (e.g. minimum end-sem %) | @client | UGC CBCS letters (06 §7); no separate pass rule | Grade-sheet sign-off | Answered in part 15 Oct 2026: O from 90 % (policy example DECT0901); the rest is Q-40 |
| Q-20 | A course shared by several programs: acceptable to create it once per program (A-12)? | @client | One course per program | — | Answered 15 Oct 2026 (Aniket, M01b): one course per code, listed by many programmes (A-54) |
| Q-21 | Should the LMS grade sheet show SGPA, or grades only? | @client | Show SGPA | — | Open |
| Q-22 | Does CUTM have a GitHub organization for student repos; private repos allowed? | @client | GitHub App installed on a CUTM org; private repos supported | M07 setup | Open |
| Q-23 | Are excused absences (medical leave) from assessments needed? | @client | No; missed = 0 (A-14) | — | Open |
| Q-24 | Retention period for proctoring snapshots | @client | 90 days after results (A-13) | — | Open |
| Q-25 | (a) Live engine — **decided by dev 12 Oct 2026: self-hosted LiveKit** (ADR-18); confirm with the client that this satisfies LIV-02 "reuse the previous solution". (b) The recruitment platform's compiler service: technology and repository access | @dev (Aniket) | (a) LiveKit; (b) Judge0 CE reference adapter | M05 adapter choice | (a) Decided · (b) Open |
| Q-26 | What must "AI" in engagement tracking mean? Is a deterministic score plus an AI-written explanation acceptable? | @client | Yes (ADR-16) | — | Open |
| Q-27 | Who edits CO-PO-PSO matrices: admin only, or faculty with HoD approval? | @client | Admin only | — | Answered 15 Oct 2026 (Aniket, M01b): the course coordinator and admins (CRS-07) |
| Q-28 | Login identifier: email or roll number? University email domain? | @client | Email | — | Open |
| Q-29 | Should students see their own engagement score? | @client | No (DSH-01 audience is faculty/admin) | — | Open |
| Q-30 | Should late submissions carry an automatic penalty? | @client | No; flagged only (A-11) | — | Open |
| Q-31 | Email sender address/domain and SMTP provider (SPF/DKIM) | @client | `MAIL_FROM` from env | M11 | Open |
| Q-32 | CUTM brand colours and logo | @client | Official lockup `public/brand/logo.svg` (emblem plus the wordmark and tagline). Palette sampled from it: seal crimson primary, paper background and light sidebar, flame gold hairline (08 §4). **Superseded 13 Oct 2026:** Aniket chose a blue palette (decision in §5); the lockup stays in the sidebar, on the sign-in pages and on the 404 page. Worth confirming with the client | — | Answered 13 Oct 2026 |
| Q-33 | Do lab machines reach the LMS through one public IP (campus NAT)? The login limit is 30 failed attempts per IP per 15 min (successes do not count) | @client / @dev | Per-IP limit as specified; revisit with the campus network map | M11 load test | Open |
| Q-34 | Login and forgot-password take measurably longer for a registered email (argon2 runs only then), which allows email enumeration by timing. Add a dummy-hash verify for unknown emails? | @dev | Not built. Forgot-password now states whether the email is registered (requested 13 Oct 2026). Login messages stay identical. | M11 hardening | Open |
| Q-35 | AC-M01-03 says creating an offering enrols “the active students” of the batch and section, but a freshly imported cohort is `invited` until each student accepts. Enrol only `active` students (a new cohort would be missed), or every student who is not `disabled`? | @dev | Every student of the batch and section who is not `disabled` (A-26) | — | Open |
| Q-37 | Can CUTM IT provide an official courseware export? A page took about 30 s on 14–15 Oct and under a second on 16 Oct, when the site then stopped answering for minutes after ~270 pages in 90 s; importing all ~1,284 pages takes from about 25 minutes to 5–6 hours | @client | The page importer, two pages at a time and at most one a second | — | Open |
| Q-38 | Is the Examination Policy university-wide? CUTM AP's ASAG 1101 course file shows Theory 80 / Practice 20 with other parts | @client | One policy, copied onto each offering | M06 | Open |
| Q-39 | Does "round up" mean ceiling (89.2 → 90) or nearest? Are component marks rounded too? | @client | Ceiling, once, at the course percentage | M08 | Open |
| Q-40 | The full grade table and pass rules (the rest of Q-19) | @client | 06 §7 scale | M08 | Open |
| Q-41 | How do assessments map to the policy's parts — Mid-term I (online), Mid-term II (presentation), assignment, attendance points from M03, the practice and project rubrics — and who enters the external practice and project marks? | @client / @dev | — | **M06** | Open |
| Q-42 | What must the LMS do with the 75 % attendance minimum: show it, or produce an eligibility list? | @client | Stored only | M06, M08 | Open |
| Q-43 | Programmes with fewer than 12 POs (MBA, BBA, M.Sc): may codes stay unused? Who supplies non-engineering PO titles? (Agriculture pages carry their own) | @client | An untitled code shows the code itself | M09 | Open |
| Q-44 | Who maintains the course-list CSV after the first load, and how do the repository's "programme + stream" values map to LMS programmes? The 2021 repository spells one programme several ways (BTech / B.Tech / B Tech; M.Sc / MSc; B.Sc / B.Sc. / B.SC) and lists courses open to all under "All", "CUTM" and "MOOC"; converted as written it gives 39 programmes | @client | Converted once by the developer; admins keep that CSV | — | Open |
| Q-45 | Are Certificate, Advanced certificate and Diploma courses credit-bearing? Which courses are 0-0-0? | @client | The credits in the course list decide | — | Open |
| Q-46 | Should courseware session links (YouTube, slides) become lesson links? | @client | Not imported (backlog) | — | Open |
| Q-47 | An offering's department comes from the batch's programme, so a Mathematics HoD does not see maths taught to B.Tech CSE. Acceptable? | @dev | As described (A-56) | — | Open |
| Q-48 | Is the courseware "Faculty" the course coordinator? | @client | Prefilled only when exactly one faculty member has that name | — | Open |
| Q-49 | A courseware page with no course code is matched only by a title that exactly one catalogue course has; 49 of the first 264 live pages had neither, so no import can reach them. Should an admin be able to attach a page to a course by hand, or will CUTM add codes to those pages? | @client / @dev | Not built; the run lists each such page | — | Open |
| Q-50 | LiveKit closes a room about 20 s after its last participant leaves and then sends `room_finished`. Should that end a class before its scheduled end? | @dev | No: before `scheduledEnd` the class stays live and the room is created again when someone rejoins; at or after it, the class ends then. The teacher's End button and the hourly sweep end the rest | — | Open |
| Q-51 | May a teacher change live-class attendance after the offering's marks are locked (05 §3.8 lists what the lock freezes; attendance is not on it, but it feeds the theory attendance part, 07 §2)? | @client / @dev | Allowed; every change is audited | M06, M08 | Open |
| Q-52 | A presence list keeps the last 50 connections (`$slice: -50`); a student whose connection drops more than 50 times in one class loses the earliest intervals. Acceptable? | @dev | Yes | — | Open |
| Q-36 | After the first publish, a teacher's saved edits to the plan and calendar show on the Overview at once; publishing again only notifies and emails students (05 §3.8 keeps one plan per offering, no draft copy). Should students see only the last published version instead? That needs a draft copy of the plan and calendar | @client | As built: saved edits are visible; the Course plan page says so before publishing again (A-49) | — | Open |

## 4. Assumptions register

| ID | Assumption | Where it matters | Confirm via |
|---|---|---|---|
| A-01 | UI is English only | all | — |
| A-02 | Times are shown in IST; stored in UTC | all | — |
| A-03 | Capacity targets in 02 §11 | sizing, load tests | Q-11 |
| A-04 | One university (single tenant) | data model | — |
| A-05 | Integration secrets live in env, not in admin settings (deviation from ADM-04's "credentials") | settings, ops | — |
| A-06 | A user may hold several roles (faculty + hod) | auth | — |
| A-07 | An item tagged with several COs counts in full toward each | attainment | Q-07 |
| A-08 | End-sem attainment applies equally to every CO of the course | attainment | Q-07 |
| A-09 | Live classes use self-hosted LiveKit (now a decision: ADR-18) | M03 | Q-25 (a) |
| A-10 | Judge0 CE is the reference code runner until Q-25 is answered | M05 | Q-25 |
| A-11 | Late submissions are flagged, not penalized automatically | M04, M06 | Q-30 |
| A-12 | A course belongs to exactly one program — **replaced by A-54 (15 Oct 2026)** | data model | Q-20 |
| A-13 | Proctoring snapshots are deleted 90 days after results | M05 | Q-24 |
| A-14 | A missed assessment counts as 0 in CE | M06 | Q-23 |
| A-15 | HoD access is read-only oversight of their department | auth | — |
| A-16 | Non-credit (0-0-0) courses have no evaluation policy, CO/PO or grade sheet; attendance = lesson completion (updated 15 Oct 2026) | M02, M06, M08 | Q-02, Q-45 |
| A-17 | Multiple-select questions score all-or-nothing | M04 | — |
| A-18 | Imported users receive an invitation email to set their own password | M00, M01 | Q-28 |
| A-19 | Students do not see engagement scores | M10 | Q-29 |
| A-20 | Only assessments with published results count toward CE and attainment | M06, M09 | — |
| A-21 | Production object storage is Cloudflare R2; lecture videos are MP4 with a 480p data-saver copy (ADR-19) | M02, M11 | Q-12 |
| A-22 | Login rate limits count failed attempts only (a success refunds its slot); forgot-password counts every request | M00 | Q-33 |
| A-23 | The UI is shadcn/ui on Tailwind v4 (client request, 12 Oct 2026); light theme only | all UI | — |
| A-24 | Inter is self-hosted through `next/font` (downloaded from Google Fonts at build time); one family for the whole UI, no serif | build | Q-12 |
| A-25 | `admin:create` only creates or re-invites; it refuses an email whose account is active or disabled | M00 | — |
| A-26 | Creating an offering enrols every student of the batch (and section) who is `invited` or `active`, never `disabled` | M01 | Q-35 |
| A-27 | An offering for a whole batch (`section: null`) and offerings for its sections can coexist; 05 §3.8's unique index allows it | M01 | — |
| A-28 | Faculty on an offering may be `invited` or `active`, not `disabled`; at most five | M01 | — |
| A-29 | `createOffering` writes the offering, its enrolments and the audit entry in one transaction (04 §6.14) | M01 | — |
| A-30 | The admin offerings list filters by term, department and status only when asked; it does not default to the current term (it sorts on `_id`, which is indexed) | M01 | — |
| A-31 | A student's section must be one of the batch's `sections` (single create and import); a section is added to the batch first | M01 | — |
| A-32 | Re-enabling a disabled account returns it to `invited` if the person never set a password, otherwise `active` | M01 | — |
| A-33 | CSV import replaces an existing user's roles with the role in the row; administrator accounts are never changed by import | M01 | — |
| A-34 | Home lists the newest six offerings the viewer teaches, oversees or is enrolled in, not “this term’s”; `/courses` has the full list | M01 | — |
| A-35 | A head of department sees the People roster of their department's offerings but cannot change enrolment; only admin and the offering's faculty can | M01 | — |
| A-36 | The worker may import `lib/queue` and `lib/auth/tokens` (to enqueue per-recipient mail and build invitation links); AGENTS.md's layer table says so | M01 | — |
| A-37 | The seed runs only against a local MongoDB (`localhost` or `127.0.0.1`) and never in production; without `--e2e` it leaves users `invited` and needs an existing administrator | M01 | — |
| A-38 | There is no public sign-up: accounts are created by an administrator and the person sets a password from the invitation link (01 §4–§5). The "sign up" screen of the redesign is that page, titled "Set up your account" | auth UI | — |
| A-39 | Home shows only data that exists today: counts of structure, catalogue, offerings and users for admins; offerings and enrolled students for faculty and HoD; enrolled courses for students; the six latest audit entries for admins. “Enrolled students” is counted as active enrolments across the viewer’s offerings (a student in two of them counts twice), so the count stays one indexed query. Later milestones add their sections | `/home` | — |
| A-40 | The large editors of later milestones (assessment builder, attempt runner) stay routes; every other create/edit form is a `FormDialog` (04 §1) | M02+ UI | — |
| A-41 | The Structure cards count every department, programme and term, archived ones included, so each matches the total on its list page; Home's Programmes tile counts only active programmes | `/admin`, `/home` | — |
| A-42 | Home's “top 3” panel (the reference's student leaderboard) ranks the three people with the most audit entries in the last seven days. The planned “largest offerings” would group every active enrolment on each Home view (04 §3 S11), and offerings carry no enrolment counter | `/home` | — |
| A-43 | The sidebar header is a light tinted card with the university lockup on a white chip beside “Centurion LMS” and “Learning Management System” (Aniket chose it from mock-ups, 13 Oct 2026), in place of the reference's logo and product name | app shell | Q-32 |
| A-44 | The reference's typeface was not identified; the UI stays on Inter (A-24) | all UI | — |
| A-45 | A settings audit entry names the key in `entity` (`lessons_settings`) and gets a fresh ObjectId as `entityId`, because a settings key is a string (the `user_import` pattern) | M02 settings | — |
| A-46 | An offering holds at most 300 lessons, so the content index and the lesson outline are single bounded reads | M02 | — |
| A-47 | Rich text with no text is not stored: an untouched editor leaves the field unset, so an empty course plan counts as not written | M02 | — |
| A-48 | Skill-course attendance counts completions of lessons that are published now; unpublishing a lesson removes it from both sides of the fraction | M02 | Q-02 |
| A-49 | The plan and calendar a teacher saves are what students see once any version is published; publishing again re-notifies and re-emails (see Q-36) | M02 | Q-36 |
| A-50 | Only students' viewing is recorded: teachers and heads of department preview a lecture in a plain player that sends no beacons | M02 | — |
| A-51 | A lesson cannot be deleted once any student has a progress row for it (opened, watched or completed); it can still be unpublished | M02 | — |
| A-52 | Opening a notification marks it read (the row is a form that goes to its page); "Mark all as read" covers the rest | M02 | — |
| A-53 | Teachers and admins get a "Course plan" tab in the course workspace, after Overview; students get "Lessons" where teachers see "Content" | M02 UI | — |
| A-54 | A course is university-wide (one per code); programmes list it in their curriculum, optionally in a basket | M01b | Q-20 |
| A-55 | `offering.category` keeps `ugc`/`skill`, now derived from the credits (`skill` = 0-0-0), so M02–M04 code keeps working | M01b | Q-45 |
| A-56 | An offering's programme and department come from the batch, and the course must be in that programme's curriculum | M01b | Q-47 |
| A-57 | The courseware import never overwrites content edited in the LMS; an admin's forced re-import does, and keeps CO ids by code | M01b | — |
| A-58 | A plain list of learning outcomes becomes COs numbered in order; a Bloom level guessed from the first verb is only a suggestion until someone saves it | M01b | — |
| A-59 | Two-part credits ("3 (2+1)") are read as theory + practice and flagged for review | M01b | — |
| A-60 | Contact details on courseware pages (emails, phone numbers) are never stored | M01b | — |
| A-61 | Programmes created by the course-list upload have no department until an admin sets it; offerings need one | M01b | — |
| A-62 | A course code is fixed once the course has an offering | M01b | — |
| A-63 | A change to the evaluation policy applies to offerings created afterwards | M01b | Q-38 |
| A-64 | The course-list upload never deletes anything; links are removed by hand on the programme page | M01b | Q-44 |
| A-65 | One credit part may hold all of a course's credits, up to 30: the 2021 repository has 0+0+24 internships, 2+0+21 domain tracks and 0+0+30 workshops | M01b | Q-45 |
| A-66 | The course list matches a programme by name before code, so "MSc" keeps its own programme beside "M.Sc" (code MSC) | M01b | Q-44 |
| A-67 | The courseware import reads at most one page a second, however fast the site answers | M01b | Q-37 |
| A-68 | Scheduling a live class asks for a date, a start time and a length (30 min – 6 h) instead of two date-time boxes; the title and date default to the next course-calendar session on or after today | M03 | — |
| A-69 | A student's waiting screen re-renders every 20 s while the tab is visible, until the class starts | M03 | — |
| A-70 | Home shows today's live classes (live now first, then the rest of today's) to students and faculty | M03 | — |
| A-71 | A scheduled class whose end has passed without a start is shown as "Not held" and counts toward nobody's attendance | M03 | — |
| A-72 | A student's live attendance % counts only finalized classes and only their own rows, so a student enrolled later is not marked absent for earlier classes | M03, M06 | Q-42 |
| A-73 | An offering holds at most 500 live sessions, so its session reads are bounded | M03 | — |
| A-74 | Only the offering's faculty join a class as host; admins start and end classes without joining (09 §2) | M03 | — |
| A-75 | The four CSE courses read from courseware are development seed data only; the e2e fixtures stay as 10 §3 lists them | dev seed | — |
| A-76 | In the development seed a courseware page's credits stand in for the Course Repository's until the course list is uploaded | dev seed | — |
| A-77 | The test server at lms.devsomeware.com runs Ubuntu's Redis 8.0.6 instead of the pinned 8.6 | test deployment | — |
| A-78 | Generated imagery (a photo of students, three 3D icons) is acceptable on the sign-in screens until CUTM supplies campus photography | sign-in redesign | — |

## 5. Log

### 2026-10-12 · Docs baseline · Claude (AI agent)

**Created**
- `AGENTS.md` — rewritten as the cross-agent rule set (Next.js managed block kept at the top)
- `CLAUDE.md` — imports `AGENTS.md`
- `README.md` — project overview and doc index
- `docs/00-START-HERE.md` … `docs/11-OPERATIONS.md` — specification
- `docs/milestones/M00-…` … `M11-…` — milestone build plans
- `docs/prompts/build-milestone.md` — prompt template for any agent
- `docs/PROGRESS.md` — this file

**Not done**
- No application code was written; the repository is still the `create-next-app` scaffold. M00 starts the build.
- The Judge0 code runner was not run (it needs a cgroup-v1 Linux host); its API mapping comes from the v1.13.1 source (routes, status enum, config defaults, language ids).
- No live call to the Anthropic API or the GitHub API was made (no credentials in this environment); the SDK call shapes were type-checked only.
- `mongodb-memory-server` could not download `mongod` here (fastdl.mongodb.org blocked by this sandbox's network policy); integration tests ran against a real MongoDB 8.0 replica set via `TEST_MONGODB_URI` instead.
- The shadcn/ui CLI could not reach its registry; the docs specify Tailwind + native HTML instead (ADR-10), which needs no registry.

**Assumptions** — A-01 … A-20 above.

**Open questions** — Q-01 … Q-32 above.

**Verification** (performed in a scratch copy of this repository on Node 22.22.0; none of that prototype code is committed)
- Package versions: `npm view <pkg> version` for every package in 03 §3; Docker Hub tag lookups for every image in 03 §1 (`minio/minio:latest` → 404, hence RustFS).
- `tsc --noEmit` → 0 errors for the canonical patterns in 04 §6 (models, env, db, session, access, DAL, action wrapper, actions, pages, ActionForm, queue, worker, storage adapter, audit, beacon route, rounding). Found and fixed during verification: the `(models.X as Model<T>) ?? model()` union type is not callable under Mongoose 9.
- `next build` (16.4.0, Cache Components + Partial Prefetching) → compiled; `/courses` and `/courses/[offeringId]` partially prerendered; proxy registered. Found: module-level env parsing fails the build without secrets → `env()` made lazy.
- Standalone server (`node .next/standalone/server.js`) with MongoDB 8.0 (rs0), Redis 8.6, RustFS 1.0.1: no cookie → 307 to `/login`; admin session → page renders with `oversee` access and the edit form; stale `sessionVersion` → redirect to `/login`; non-enrolled student → 404; beacon without session → 401. Found: session read during runtime prerender logs "unstable value `Date.now()`" → fixed with `await connection()` in `getViewer` (0 occurrences after).
- Vitest 5.0.4: `unit` 10 tests passed (rounding vectors, action wrapper auth/role/validation/success); `integration` 2 tests passed against the replica set (action writes + 404 on foreign id; transaction commit and rollback). Found: Vitest 5 requires `@types/node` ^22 or ≥ 24.
- BullMQ 6.3.13 + ioredis 6.0.0 on Redis 8.6: enqueue → worker → result; duplicate `jobId` deduped; `upsertJobScheduler` with `tz: 'Asia/Kolkata'` → next run 01:30 IST; invalid payload → failed with the Zod error. Found: a Worker sharing the Queue's connection hangs; custom job ids containing `:` are rejected.
- Worker under `tsx --conditions=react-server` imports `server-only` modules and processes jobs; without the condition it throws (both verified).
- RustFS: bucket create, `PutBucketCors`, presigned PUT 200, presigned GET 200, CORS preflight 200 with the allowed origin.
- LiveKit server v1.13.9 with the config in 11 §3.1: Node participant (`@livekit/rtc-node`) joined with our token grants; webhooks `room_started`, `participant_joined`, `participant_left`, `room_finished` received and verified by `WebhookReceiver`.
- Tiptap 3.31.4 `@tiptap/html/server`: text is HTML-escaped, `javascript:` hrefs are emptied, unknown node types throw.
- Tailwind v4 `@layer components` + `@apply` compile through `@tailwindcss/turbopack`.
- `@anthropic-ai/sdk` 0.133.0: `client.beta.messages.parse` with `betaZodOutputFormat`, `fallbacks: 'default'`, `output_config.effort` → type-checks.
- All worked examples in 07 were computed by script (`roundHalfUp`/`ceilTo` vectors, internal marks, trend slopes, attainment, grades/SGPA, engagement, commit scores, IST conversions).

**Manual steps not performed:** no human has walked any validation checklist yet.

### 2026-10-12 · Decision: live classes and video delivery · Claude (AI agent), at Aniket's request

Request: "look at live streaming — maybe Mux"; then "do whatever is cheap, very highly scalable and easy to use".

**Decision** — ADR-18 (self-hosted LiveKit for live classes) and ADR-19 (Cloudflare R2 MP4 + 480p data-saver copy for recorded lectures). Mux evaluated and not chosen.

**Evidence**
- Mux SDK `@mux/mux-node` 15.5.0 installed and read: live ingest protocols are `rtmp | srt` (`active_ingest_protocol`); Mux's live-streaming FAQ states direct WebRTC/browser ingest is not supported (https://www.mux.com/docs/guides/live-streaming-faqs) → teachers would need OBS. Latency modes `low | reduced | standard`; `max_continuous_duration` default 12 h; live streams auto-record to assets; webhooks `video.live_stream.active/idle/disconnected`, `video.asset.ready`. A Mux adapter and `@mux/mux-player-react` 3.14.0 component were type-checked (tsc 0 errors) so a switch later is low-risk.
- Mux pricing (third-party summaries of mux.com/docs/pricing, conflicting between pages — verify): live encoding ~$0.025–0.032/min (≤720p, first tier); delivery ~$0.00096/min after 100K free minutes. Per-viewer-minute billing scales with every student.
- Cloudflare R2: zero egress; ~$0.015/GB-month; Class A $4.50/M, Class B $0.36/M (third-party summaries — verify on Cloudflare's page).
- LiveKit: verified end to end earlier today (v1.13.9). Official benchmark guide: a room must fit on one node; nodes add rooms; measure with `lk load-test` (https://docs.livekit.io/transport/self-hosting/benchmark/).
- ffmpeg 7.0.2 via `ffmpeg-static` 5.3.0: the data-saver command transcoded a 20 s 1080p test clip to 854×480 H.264 Main/yuv420p in ~2.2 s with `moov` first; without `-pix_fmt yuv420p` the output was High 4:4:4 (unplayable on many phones) — now mandatory in the command.

**Changed docs** — 01 (LIV-02), 02 (services, integrations, ADR-18/19), 03 (infra, `ffmpeg-static`, not-used list), 05 (`lessons.lowKey`, `transcode`), 06 (storage functions, R2 config, `media/transcodeLesson` on its own queue), 08 (`VideoPlayer` toggle), 11 (R2 env, LiveKit production + TURN, cost model, worker image), M02 (T8b), M03 (engine decision), this file (Q-25, A-09, A-21).

**Open** — confirm with the client that self-hosted LiveKit meets LIV-02 (Q-25a); hosting with included bandwidth (Q-12).

### 2026-10-12 · M00 Foundation (T1–T9) · Claude (AI agent), at Aniket's request

Requests: "completely plan m0 and start making it properly"; mid-way, "pull the best UI library and components … everything top notch" and "make sure m0 is completely done".

**Created** (one commit per task: 78daf99 tooling · d849fd1 core · e7be9a7 models · aba60ea auth primitives · bc43bcb mail · 43e5434 auth pages · 097731b shell · 615717e UI system · 8092df6 ops · this commit tests)
- Tooling: `package.json` (exact versions, scripts incl. `worker:e2e`), `next.config.ts` (security headers), `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `playwright.config.ts`, `compose.yaml`, `.env.example`, `.gitignore`, `components.json`, `.github/workflows/ci.yml`
- Core: `lib/env.ts`, `lib/db.ts`, `lib/log.ts`, `lib/errors.ts`, `lib/action.ts` (`action`, `publicAction`), `lib/audit.ts`, `lib/queue.ts`, `lib/rate-limit.ts`, `lib/cn.ts`, `lib/format.ts`
- Auth: `lib/auth/{password,session,tokens}.ts`, `lib/schemas/{common,auth,jobs}.ts`
- Data: `lib/models/{user,audit-log}.ts`, `scripts/sync-indexes.ts`
- Mail: `lib/integrations/mail.ts`, `lib/domain/email-templates.ts`, `worker/index.ts`, `worker/jobs/mail.ts`
- UI: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/not-found.tsx`, `app/(auth)/{actions.ts,layout.tsx,loading.tsx}`, `app/(auth)/{login,forgot-password,reset-password}/page.tsx`, `app/(app)/{layout,loading,error}.tsx`, `app/(app)/home/page.tsx`, `app/(app)/profile/{page.tsx,actions.ts}`, `proxy.ts`, `components/{action-form,app-nav,page-header}.tsx`, `components/ui/{alert,avatar,badge,button,card,dropdown-menu,input,label,separator,sheet,sidebar,skeleton,tooltip}.tsx` (shadcn 4.21.4), `hooks/use-mobile.ts`
- Ops: `app/api/health/route.ts`, `scripts/create-admin.ts`, `scripts/check-bundle.ts`
- Tests: `lib/log.test.ts`, `lib/action.test.ts`, `lib/auth/tokens.test.ts`, `lib/schemas/auth.test.ts`, `lib/domain/email-templates.test.ts`, `tests/setup.ts`, `tests/server-only.ts`, `tests/next-request.ts`, `tests/integration/{auth,profile,mail-worker}.test.ts`, `tests/e2e/auth.spec.ts`
- Removed: the five scaffold SVGs in `public/`
- Docs changed in the same commits as the code: AGENTS (laws 4 and 8), README, 02, 03, 04 (§2, §6.2, §6.4, §6.6, §6.8, §6.9), 05 §1, 06 §6, 07 §16, 08 (§1, §3, §4, §5 rewritten for shadcn), 09 §4, 10 (§2, §3, §4, §5), M00, M01, M06, M07, M09, M10

**Decisions and deviations** (each recorded in the doc it changes)
- Files whose first caller is a later milestone moved there (deletion test): `round.ts` → M04; `time.ts`, `page`/`pageSize` → M01; settings model → M02. Password reset enqueues `mail/send` directly; the `fanout` job arrives with invitations in M01.
- UI system: shadcn/ui replaces the hand-written CSS classes (client request). The registry host is blocked here, so the files were copied from the pinned GitHub tag with the CLI's import rewrites; the method is in 08 §5.1. Charts for later dashboards: shadcn `chart` (Recharts) instead of hand-drawn SVG.
- `publicAction()` added so the three pre-sign-in actions share the wrapper's validation and error mapping.

**Defects found and fixed during M00** (each has a test now)
- `lib/db.ts` cached a failed first connection: a server started while Mongo was down stayed down after Mongo recovered.
- Login counted successful sign-ins toward the limit: a 6th sign-in in 15 min (a student moving between lab machines) would have been blocked.
- React 19 cleared every field after a failed form submit (`<form action>`): the email had to be retyped after a wrong password.
- Before hydration, a submitted form did a native GET: the email and **password** went into the URL. Now `method="post"` and the button is disabled until hydrated.
- A used invite/reset link still showed the password form (the action rejected it, but only after typing). The page now checks `isTokenCurrent`.
- `/reset-password` read the clock during the runtime prerender (`Date.now()` error) → `await connection()`.

**Not done**
- E2E is not in CI until M01 provides `scripts/seed.ts` (10 §5).
- Timing-based email enumeration is not mitigated (Q-34).
- No dark theme (not in scope).

**Assumptions** — A-22 … A-25 (§4).

**Open questions** — Q-33, Q-34 (§3); Q-32 default updated.

**Verification** (compose stack: mongo:8.0 rs0, redis:8.6, mailpit; Node 22.22.0; Chromium 1194 via `PW_CHROMIUM_PATH`)
```
npm run check              → eslint: 0 problems · tsc: 0 errors · Test Files 5 passed · Tests 11 passed (11)
npm run test:integration   → Test Files 3 passed · Tests 15 passed (15)   (TEST_MONGODB_URI = local replica set)
env -i … npm run build     → ✓ Compiled successfully (no environment variables); /home, /profile, /reset-password partially prerendered; /api/health dynamic; Proxy registered
npm run check:bundle       → check-bundle: 25 files scanned for 4 names and 3 secret values; clean   (planted "SESSION_PASSWORD" file → exit 1)
npm run test:e2e           → 5 passed (≈20 s); 8 consecutive runs and 2 runs after fresh builds all green
npm run db:indexes         → users (email unique, partial uniques, text index, …) and auditlogs indexes created
```
- GitHub Actions run #1 on `ae654e9` (https://github.com/Aniket-Subudh1/LMS-CUTM/actions/runs/38295067817): **verify** ✓ (lint, typecheck, unit, build without env, bundle scan) and **integration** ✓ (`Test Files 3 passed · Tests 15 passed`, mongodb-memory-server downloaded `mongod` 8.2.6 during `npm ci`; binary cache saved). Warning only: `actions/cache@v4` runs on the deprecated Node 20 action runtime.
- Mutation check: removing the login refund or the reset token's `sessionVersion` condition makes the matching integration tests fail (2 failures), then restored.
- E2E flakiness investigated, not retried away: 4 failures in 22 runs before the fix. The saved trace showed a fill binding to the previous page's input while Next hid it after a client navigation; fixed by waiting for the new page (10 §3). Separately, all runs shared one client IP and so one rate-limit window; each run now sends its own `X-Forwarded-For`.

| AC | Result | How |
|---|---|---|
| AC-M00-01 | Pass | `curl /api/health` → `200 {"ok":true,"mongo":"up","redis":"up"}`; `/login` renders; e2e asserts both |
| AC-M00-02 | Pass | `curl /home`, `/profile` without cookie → `307` to `/login`; e2e |
| AC-M00-03 | Pass | e2e: `admin:create` link → set password → `/home` → same link shows "Link not valid"; integration: second use → expired message |
| AC-M00-04 | Pass | integration: identical message for wrong password, disabled, invited and unknown emails; 6th failure → `RATE_LIMITED` even with the right password |
| AC-M00-05 | Pass | e2e with two browser contexts; integration: other browser's viewer is null, `user.sessions_revoked` audit entry |
| AC-M00-06 | Pass | build with `env -i`; bundle scan clean; negative test fails as expected |
| AC-M00-07 | Pass | `curl -I /login` and e2e: CSP, nosniff, Referrer-Policy, Permissions-Policy, HSTS |
| AC-M00-08 | Pass | e2e at 360 × 740: `scrollWidth` ≤ 360 on `/login`, `/home`, `/profile`; sidebar hidden, opens as a sheet, closes on navigation |

Health under failure: `docker stop` mongo → `503 {"ok":false,"mongo":"down","redis":"up"}` in 2.01 s; redis → 503 in 2.01 s; both recover on restart; Mongo down at server start then up → recovers on the next request.

Screenshots reviewed at 1280 px (login, home, profile, user menu) and 360 px (login with error, home, sidebar sheet).

**Manual steps not performed:** no human has walked the M00 validation checklist; email was checked in Mailpit only (no real inbox); the 360 px checks ran in headless Chromium, not on a phone.

### 2026-10-13 · tooling · Cursor (AI agent)

**Created**
- `package.json` — `allowScripts` pins for `esbuild@0.28.2`, `fsevents@2.3.3`, `mongodb-memory-server@11.3.0`, `msgpackr-extract@3.0.4`, `unrs-resolver@1.12.2` (npm 11 install-script review)
- `.nvmrc` — `24`, matching the Node 24 LTS pin in `docs/03-TECH-STACK.md`

**Not done**
- The five high audit findings are one advisory, `braces` ≤ 3.0.3 (`GHSA-vfj7-8cjw-p6xm`), pulled in only by `eslint-config-next@16.4.0` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`. npm's latest `braces` is 3.0.3; no patched release exists. `npm audit fix --force` would install `eslint-config-next@14.2.35` and break the Next 16 toolchain, so it was not run.

**Assumptions**
- Local default Node was switched from 25.9.0 to 24.21.0 (`nvm alias default 24`). Vitest 5.0.4 does not list Node 25.

**Open questions** — none.

**Verification**
```
nvm install 24                         → Now using node v24.21.0 (npm v11.19.0)
npm i                                  → up to date, audited 547 packages; no EBADENGINE; no allow-scripts warning
npm audit fix                          → still 5 high; only offered fix is eslint-config-next@14.2.35 (breaking)
```

### 2026-10-13 · auth · Cursor (AI agent)

**Created**
- `app/(auth)/actions.ts` — `requestPasswordReset` returns not-found when the email has no active or invited user
- `app/(auth)/forgot-password/page.tsx` — success copy says the email is registered and the link was sent
- `tests/integration/auth.test.ts`, `tests/e2e/auth.spec.ts` — expect the two different answers
- `docs/09-SECURITY.md`, `docs/milestones/M00-foundation.md` — same contract

**Not done**
- Integration and e2e suites were not re-run here (they need local Redis on port 6379 and the compose stack).

**Assumptions**
- A disabled account is treated as not in the database for this form, same as before: only `active` and `invited` receive a reset link.
- The admin `aniketsubudhi00@gmail.com` was created directly as `active` with a password so the login form works. `admin:create` only invites and does not set a password.

**Open questions** — none.

**Verification**
- `GET http://localhost:3001/api/health` → `{"ok":true,"mongo":"up","redis":"up"}`
- Browser on `http://localhost:3001`: unknown email shows "This email does not exist in the database."; `aniketsubudhi00@gmail.com` shows "This email is registered. A reset link has been sent."; sign-in reaches `/home` with "Welcome, Aniket" and "Administrator".
- The mail worker picked up the reset job and Gmail rejected SMTP auth (`535 5.7.8 Username and Password not accepted`). The message was not delivered.
- Integration and e2e suites were not run (local Redis on port 6379 is not running).

### 2026-10-13 · shell · Cursor (AI agent)

**Created**
- `app/(app)/home/page.tsx`, `app/(app)/profile/page.tsx`, `app/(auth)/reset-password/page.tsx` — session and token reads sit in a child under `<Suspense>`
- `docs/02-ARCHITECTURE.md`, `docs/04-CODING-LAWS.md` — the shell `loading.tsx` does not cover a navigation between pages in the same layout

**Not done** — none.

**Assumptions** — none.

**Open questions** — none.

**Verification**
- Browser: `/home` shows "Welcome, Aniket"; client navigation to `/profile` shows the account. Dev log after the change has no `uncached data during prerendering or a navigation` error.

### 2026-10-13 · brand · Cursor (AI agent)

The sign-in screen and the signed-in shell now use the official Centurion lockup, including the words under the seal, and a palette sampled from that file.

**Created**
- `public/brand/logo.svg` — the university file, unchanged (a 2 MB PNG embedded in SVG)
- `public/brand/logo.png` — transparent 960 px render of the same lockup, including “Centurion”, “UNIVERSITY”, and “Shaping Lives… Empowering Communities…”, for the pages
- `public/brand/lotus.svg`, `public/brand/stage-print.jpg`
- `app/icon.png` — the full lockup, not a cropped seal
- `components/university-logo.tsx`, `components/auth-stage.tsx`
- `gsap@3.15.0`

**Changed**
- `app/globals.css`, `app/layout.tsx`, `app/not-found.tsx`
- `app/(auth)/layout.tsx`, `app/(auth)/loading.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`
- `app/(app)/layout.tsx`, `app/(app)/home/page.tsx`, `app/(app)/profile/page.tsx`
- `components/page-header.tsx`, `components/app-nav.tsx`
- `proxy.ts` — static images and `icon.png` are not redirected to `/login`, or the mark cannot load before sign-in
- `tests/e2e/auth.spec.ts` — home heading is the first name (`Asha`), with “Welcome” as the label above it
- `docs/02-ARCHITECTURE.md`, `docs/03-TECH-STACK.md`, `docs/08-UI-SYSTEM.md`, `docs/milestones/M00-foundation.md`

**Not done**
- `npm run test:e2e` was not run (it needs the compose stack and a production build).

**Assumptions**
- The brightest gold in the seal (`#F0D040`) disappears as a hairline on the paper, so `--gold` is a darker flame tone from the same mark (`#A67C2D`). The focus ring stays seal crimson, which passes WCAG on the paper; gold does not.
- The sidebar is light (paper), so the dark wordmark in the lockup stays readable.
- There is still no public registration page. The invitation screen is `/reset-password`.

**Open questions** — Q-32 answered (logo and sampled colours).

**Verification**
```
npm run check → eslint: 0 problems · tsc: 0 errors · Test Files 5 passed · Tests 11 passed
```
- `GET /brand/logo.png` without a session → `200` `image/png`. `GET /home` without a session → `307` to `/login`.
- Browser at 1280×800: `/login` shows the full lockup (seal, Centurion, UNIVERSITY, tagline), the gold rule, and the sign-in form. Email field is labelled. With `prefers-reduced-motion: reduce`, the logo stays at opacity 1 and the lotus has no transform.
- Browser at 360×740: `/login` scroll width is 360, the stage is hidden, the full lockup is 160 px wide above the form, and the Sign in button sits inside the viewport. `/forgot-password` and `/reset-password?token=not-a-real-token` (“Link not valid”) use the same lockup.
- Signed-in `/home`: sidebar shows the full lockup; heading “Aniket” with label “Welcome”; both cards fit (no horizontal scroll). Collapsed rail is the same image at 32×51, not a cropped seal. `/profile` shows the account and password fields.


### 2026-10-13 · ui-polish · Cursor (AI agent)

Typography, logo size, width and responsiveness fixes after review of the brand pass.

**Created** — none (`public/brand/logo.png` replaces `logo.jpg`; `emblem.png` removed).

**Changed**
- `app/layout.tsx`, `app/globals.css` — Inter only (A-24), light sidebar tokens
- `components/university-logo.tsx` — transparent PNG, `sizes` prop
- `components/auth-stage.tsx`, `app/(auth)/*` — smaller logo, left-aligned headings, tablet card and desktop split
- `app/(app)/layout.tsx` — sidebar 15 rem, 72 px logo, no max-width on the shell
- `app/(app)/home/page.tsx`, `app/(app)/profile/page.tsx`, `app/(app)/loading.tsx` — `auto-fit` card grids, hairline-top cards, welcome band
- `components/page-header.tsx` (no `eyebrow`), `components/app-nav.tsx` (active marker)
- `docs/02-ARCHITECTURE.md`, `docs/08-UI-SYSTEM.md`, `docs/PROGRESS.md`

**Not done**
- `npm run test:e2e` was not run (needs the compose stack and a production build).
- The mobile sidebar sheet and the collapsed rail were not re-measured after the change.

**Assumptions** — A-24 now reads Inter.

**Open questions** — none.

**Verification**
```
npm run check → eslint: 0 problems · tsc: 0 errors · Test Files 5 passed · Tests 11 passed
```
- Browser metrics (no emulated touch): no horizontal scroll at 360, 768, 1024, 1440 and 1920 px.
- `/login`: 1440 split with a 192 px lockup, form 448 px; 768 centred 448 px card with a 128 px lockup; 360 card 328 px wide (16 px gutters).
- `/home` at 1920: content spans x 280–1880 (40 px gutters), two cards 788 px each. At 360 cards are 328 px.
- `/profile`: 1024 single column, cards 705 px; 1440 two columns (365 and 731 px); 360 cards 313 px with inputs inside.
- Sidebar logo is 72×114 px on the light sidebar. Computed body font is Inter.
- Note: the dev server first checked was stale (served an old charcoal sidebar); it was restarted on port 3100 and the checks above ran against it.

### 2026-10-13 · profile-dialogs · Cursor (AI agent)

The profile page no longer shows the password form and sign-out action as cards. Both open in a dialog.

**Created**
- `app/(app)/profile/account-actions.tsx` — native `<dialog>` for change password and sign out everywhere

**Changed**
- `app/(app)/profile/page.tsx` — one account panel (name, email, roles) with those two actions
- `tests/e2e/auth.spec.ts` — opens each dialog before submitting
- `docs/08-UI-SYSTEM.md` — profile is the exception to “no modals for data entry”

**Not done**
- `npm run test:e2e` was not run (needs the compose stack and a production build).

**Assumptions**
- These two account actions stay on `/profile` inside a native dialog, rather than moving to their own routes.

**Open questions** — none.

**Verification**
- Browser: `/profile` shows one account panel. “Change password” opens a centred dialog; the first field is focused; Escape closes it. “Sign out everywhere” opens a centred confirmation dialog. At 360 px, `scrollWidth` is 360, the rows stack, and the dialog fits the screen.

### 2026-10-13 · M01 Academic structure & administration (T0–T12) · Cursor (AI agent), at Aniket's request

Admins can model the university end to end: departments, programmes with PO/PSO lists, batches, terms, the course catalogue with COs and the CO–PO–PSO matrix, versioned evaluation schemes, offerings with faculty and batch enrolment, users (single, CSV import, roles, status, sessions), and an audit log. Every role has “My courses” and a course workspace (Overview, People). Thirteen commits, `30a9918` to the one that adds this entry (`M01(deps)` … `M01(tests)`).

**Created** (new unless marked *changed*)
- Models: `lib/models/{department,program,batch,term,course,evaluation-scheme,offering,enrollment}.ts`; `audit-log.ts` *changed* (two indexes); `scripts/sync-indexes.ts` *changed*.
- Schemas and pure code: `lib/schemas/structure.ts`, `lib/schemas/common.ts` *changed* (`page`, `pageSize`, `istDate`), `lib/schemas/jobs.ts` *changed* (`MailJob`); `lib/domain/{structure,csv,time}.ts`; `lib/format.ts` *changed*; each with a co-located test.
- Access and plumbing: `lib/auth/access.ts` (`offeringAccess`, `requireTeach`); `lib/auth/tokens.ts` *changed* (`passwordLink`, `queueResetLink`); `lib/errors.ts` and `lib/action.ts` *changed* (`AppError` carries `fieldErrors`; `csvRejected`); `lib/db.ts` *changed* (`isDuplicateKey`); `lib/queue.ts` *changed* (`fanout`); `worker/jobs/mail.ts` *changed* (dispatch on job name, invitation fan-out); `next.config.ts` *changed* (`experimental.serverActions.bodySizeLimit: '2mb'`).
- DAL: `lib/data/{structure,courses,schemes,offerings,users,audit,workspace}.ts`.
- Actions: `app/(app)/admin/actions.ts`, `admin/courses/actions.ts`, `admin/schemes/actions.ts`, `admin/offerings/actions.ts`, `admin/users/actions.ts`, `courses/actions.ts`.
- Routes: `/admin` (+ layout), `/admin/{departments,programs,programs/[id],terms,courses,courses/new,courses/[id],schemes,schemes/[componentKey],offerings,offerings/new,users,users/new,users/import,users/[id],audit}`, `/courses`, `/courses/[offeringId]` (+ layout), `/courses/[offeringId]/people`; `/home` *changed* (offerings and shortcuts cards); `(app)/layout.tsx` *changed* (Suspense, `Nav`); `(auth)/actions.ts` *changed* (uses `queueResetLink`).
- Components: `data-table.tsx`, `tab-nav.tsx`, `co-po-matrix.tsx`, `confirm-submit.tsx`; `app-nav.tsx` and `action-form.tsx` *changed*; shadcn `ui/{table,tabs,empty,pagination,native-select,textarea,alert-dialog}.tsx` (`shadcn@4.21.4`, each added with its first user).
- Scripts and CI: `scripts/seed.ts`, `scripts/create-admin.ts` *changed*, `package.json` (`db:seed`, `db:seed:e2e`, `db:indexes:e2e`, `papaparse` and its types; `start:e2e` now copies `public/`), `playwright.config.ts` *changed* (loads `.env.e2e`), `.github/workflows/ci.yml` (`e2e` job).
- Tests: `tests/factories.ts`, `tests/next-request.ts` *changed*; integration `{access,structure,catalog,schemes,offerings,users,audit,workspace}.test.ts`; `auth.test.ts` and `mail-worker.test.ts` *changed*; e2e `tests/e2e/admin-structure.spec.ts`.
- Docs changed with the code: 03 §4, 04 §6.4 and §6.6, 05 §3.8 and §7.5, 06 §2, §6 and §8.2, 08 §2, §3, §5.1 and §5.2, 10 §3–§4, and `AGENTS.md` (Worker layer row).

**Not done**
- Nothing in the milestone's task list was left out. These are unverified or deferred:
  - The CI `e2e` job is written but has not run on GitHub. Locally only `admin-structure.spec.ts` was run; `auth.spec.ts` needs Mailpit, which is not installed here (no Docker).
  - The human validation checklist is not walked; that is the reviewer's step.
  - Screens were checked at 1280 px width only (screenshots of home, users, user detail, courses and the workspace). No mobile width, keyboard or screen-reader pass.
  - 3,000-row import timing (AC-M01-05) was not measured; the logic is tested with small files. The action runs in the request and the body limit is 2 MB, so a very large file is rejected rather than slowed.
  - The scheme editor and CO matrix grids were not exercised in a browser; only through the actions' integration tests.

**Assumptions** — A-26 to A-37 (§4).

**Open questions** — Q-35 (§3).

**Doc fixes made together with code**
| Where | Fix |
|---|---|
| 03 §4 | `serverActions.bodySizeLimit` sits under `experimental` in the installed Next 16.4 types |
| 06 §2 | `istDate` is a validated `YYYY-MM-DD` string; the action converts it with `istDateToDate` (schemas import only `zod`) |
| 04 §6.4 | students open only `active` or `completed` offerings, though they are enrolled while the offering is `draft` |
| 05 §3.8, §7.5 | extra indexes: `offerings {status, _id}`, `auditLogs {at}` and `{entity, at}` |
| 04 §6.6, 06 §2 | `AppError` carries optional `fieldErrors` (used for CSV row errors) |
| 06 §8.2 | the enrolment form is on `/courses/<id>/people`, not a separate import route |
| 08 §2 | `/admin/settings` belongs to M02; `/admin/users/new` added |
| 08 §3, §5.1, §5.2 | `AppNav({ roles })`; `ConfirmSubmit`, `TabNav`, `DataTable`, `CoPoMatrix` inventory with their call sites |
| AGENTS.md | Worker may import `lib/queue` and `lib/auth/tokens` (A-36) |
| 10 §3–§4 | `db:indexes:e2e`, `db:seed:e2e`, `E2E_PASSWORD`, fixture emails, `start:e2e` copies `public/` (without it the logo returned 404 on the standalone server) |

**Acceptance criteria** (what was run is in Verification)
| ID | Result | Evidence |
|---|---|---|
| AC-M01-01 | Pass | `schemes.test.ts`: weights 45 against 50 are rejected with both numbers in the message |
| AC-M01-02 | Pass | `schemes.test.ts`: version n+1 is active, the previous is retired; `offerings.test.ts`: an offering stores the id of the scheme version active when it was created. Versions are separate documents and nothing rewrites `schemeId`, so a new version cannot reach an existing offering; there is no test that creates a version after an offering and re-reads it |
| AC-M01-03 | Pass, with Q-35 | `offerings.test.ts`: section A gets exactly its students (invited and active, not disabled, other sections or batches); a repeat is `CONFLICT` and writes nothing |
| AC-M01-04 | Pass | `catalog.test.ts`: levels 1–3 and the programme's codes only; e2e: Overview shows the saved levels |
| AC-M01-05 | Pass for logic | `users.test.ts`: a file with six bad rows writes nothing and lists each as `Row N: …`; the corrected file creates users, queues invitations and writes one audit entry. Size not measured |
| AC-M01-06 | Pass | `workspace.test.ts` and `access.test.ts`: student, faculty, HoD and another department's offering answer 404; e2e: the student sees only CS101 |
| AC-M01-07 | Pass | `users.test.ts`: support lists, opens a user and queues a reset link; `revokeUserSessions` is `FORBIDDEN`; the audit page redirects to `/home` |
| AC-M01-08 | Pass | `users.test.ts` checks `user.created`, `user.imported`, `user.roles_changed`, `user.disabled`, `user.enabled`, `user.sessions_revoked`; `audit.test.ts` filters them |

**Verification**
- `npm run check` → eslint no warnings; `next typegen && tsc --noEmit` clean; unit `Test Files 10 passed, Tests 57 passed`.
- `npx vitest run --project integration` (local Mongo replica set via mongodb-memory-server, Redis db 1) → `Test Files 11 passed, Tests 116 passed`.
- `npm run build` → compiled with no errors; `npm run check:bundle` → `37 files scanned for 4 names and 3 secret values; clean`.
- `npm run db:indexes:e2e`, then `npm run db:seed:e2e` run twice → both print `Seeded e2e fixtures: 1 department, 2 programmes, 2 courses, 2 offerings, 20 students enrolled in CS101.`; counts after the second run: users 24, departments 1, programs 2, batches 2, terms 1, courses 2, schemes 1, offerings 2, enrollments 20 (repeat is a no-op). Against `mongodb://example.com/x` the seed prints `Refusing to seed "example.com"` and exits.
- `npx playwright test admin-structure` (against `npm run build` output, `.env.e2e` with generated values) → `3 passed`: admin adds a department, finds a user and opens CS101's Overview and People; faculty drops and re-adds a student by CSV and sees a row error for an unknown roll number; a student sees only CS101 and `/admin/users` sends them to `/home`.
- Not run: `npx playwright test auth` (needs Mailpit), the CI `e2e` job, any remote or Atlas database.

### 2026-10-13 · Decision: UI and UX redesign · Cursor (AI agent), at Aniket's request

Aniket asked (13 Oct 2026) for a complete redesign of the dashboard, the sign-in pages and the sidebar, to an industry-grade standard. He made these decisions:
- Every create/edit form is a modal (`FormDialog`). While saving, its fields and buttons lock. On success its fields give way to the success message, and it closes itself. This replaces the "forms are routes" rule (04 §1, 08 §1 and §6), and `/admin/courses/new`, `/admin/offerings/new`, `/admin/users/new` and `/admin/users/import` are removed.
- Icons are Phosphor (duotone) instead of lucide (03 §3).
- The sidebar stays light, with grouped sections and a tinted active pill. One-sided accent borders (the gold card tops, the inset bar on the active nav item) are removed everywhere.
- Large record lists (users, audit, offerings, the course catalogue) stay as redesigned tables. Navigation and small lists become icon card grids.
- Every submit shows a loader and cannot be pressed twice. Links and filters show a pending spinner.

Contract change: create actions return `{ next }` instead of calling `redirect()` (06 §1). The build entry follows below.

### 2026-10-13 · UI and UX redesign (build) · Cursor (AI agent), at Aniket's request

The shell, sidebar, sign-in pages, Home and every M01 page are redesigned. Every create/edit form is a dialog that locks while saving, swaps its fields for the success message and closes itself. Fifteen commits, from `a25f3a6 UI(docs)` to the one that adds this entry. Two of them fix M01 defects found during the walkthrough (`M01(offerings)`, and the `(auth)` loading boundary in `UI(auth): sign-in renders without JavaScript again`).

**Created** (new unless marked *changed* or *deleted*)
- Components: `form-dialog.tsx`, `filter-form.tsx`, `link-spinner.tsx`, `password-input.tsx`, `section.tsx` (`Section`, `Fact`), `offering-card.tsx`; *changed* `action-form.tsx` (fieldset lock, `replaceOnSuccess`, `onSuccess`, `onPendingChange`, `secondary` footer slot), `confirm-submit.tsx` (pending lock), `app-nav.tsx`, `auth-stage.tsx`, `data-table.tsx` (`PageNav`, `EmptyState`), `page-header.tsx` (icon, actions), `tab-nav.tsx` (icons, pill, spinner), `co-po-matrix.tsx`. shadcn `ui/dialog.tsx` (`shadcn@4.21.4`); *changed* `ui/{badge,dropdown-menu,native-select,pagination,sheet,sidebar}.tsx` (Phosphor icons, marked as local changes).
- Routes: *changed* `(app)/layout.tsx` (grouped sidebar, user card, breadcrumb, IST date), `(app)/{loading,error}.tsx`, `app/not-found.tsx`, `home/page.tsx`, new `home/loading.tsx`; every `admin/**/page.tsx`, `courses/page.tsx`, `courses/[offeringId]/{layout,page}.tsx`, `courses/[offeringId]/people/page.tsx`, `profile/page.tsx`; `(auth)/{layout.tsx,login,forgot-password,reset-password}`. *Deleted*: `admin/layout.tsx` (the sidebar replaces its tabs), `admin/courses/new`, `admin/offerings/new`, `admin/users/new`, `admin/users/import`, `profile/account-actions.tsx`, `(auth)/loading.tsx`, `public/brand/stage-print.jpg`.
- Actions: `admin/actions.ts`, `admin/courses/actions.ts`, `admin/offerings/actions.ts`, `admin/users/actions.ts` *changed*: creates return `{ next }`, edits call `refresh()`.
- DAL: `lib/data/workspace.ts` *changed* (`getHomeSummary`, shared `offeringScope`); `lib/data/structure.ts` *changed* (`getStructureCounts`; `getDepartment`, `getBatch`, `getTerm` removed, as edit dialogs take their values from the list row); `lib/data/offerings.ts` *changed* (unset filters are left out of the query). `lib/format.ts` *changed* (`dayGreeting`, `formatLongDate`).
- Styling and config: `app/globals.css` (cooler neutrals, `--shadow-card`/`--shadow-elevated`, `surface`, `surface-interactive`, `icon-chip`, `auth-aurora`, success and aurora keyframes, gold hairlines removed); `package.json` (`@phosphor-icons/react` 2.1.10 in, `lucide-react` out); `next.config.ts` (`optimizePackageImports` for Phosphor).
- Tests: integration `{catalog,offerings,structure,users,workspace}.test.ts` and `lib/format.test.ts` *changed*; e2e `auth.spec.ts` and `admin-structure.spec.ts` *changed* for the dialog flows.
- Docs changed with the code: 03 §3, 04 §1, 06 §1, 08 (§1–§6), M00 (reset page Suspense), M01 (no admin layout, `getHomeSummary`), this file (A-38 to A-41).

**Not done**
- `auth.spec.ts` › "invited admin sets a password…" fails locally at its first mail read (`fetch failed`): it needs Mailpit, which is not installed here (no Docker). The other seven e2e tests pass.
- The browser walkthrough was done as an administrator only. The seeded faculty and student passwords live in `.env.e2e`, which this agent does not read; their views are covered by the e2e tests (roster changes as faculty, "only their own course" as a student), not by screenshots.
- No keyboard-only or screen-reader pass.
- Deviations from the plan:
  - Row actions are icon buttons with an accessible label (for example "Edit CSE"), not a three-dot menu, and they have no tooltip. Each row has at most two actions, so a menu would only add a click.
  - `LinkSpinner` sits inside an ordinary `<Link>` rather than a `NavLink` wrapper, because a wrapper that only forwards is not allowed (04 §1).
  - Table headers are not sticky. `DataTable` scrolls sideways inside its own box, which becomes the sticky container, so a sticky header would never stick to the page.
  - Course cards show the offering title, which already carries the course code, plus the term and faculty. They have no student count, which is not in `MyOfferingRow`.
  - Home's greeting band does not repeat the date, since the top bar shows it on every page.
  - The sign-in stage's three feature rows describe courses, marks and account protection, not live classes and assessments, which do not exist yet.
- Aniket's own `npm run dev` on port 3001 was still serving CSS from an old Turbopack cache during this work (the old `#f6f3ee` background). The production build is correct. Restarting `npm run dev` (after deleting `.next/dev` if needed) picks up the new styles.

**Assumptions** — A-38 to A-41 (§4).

**Open questions** — none new.

**Fixes found during the walkthrough**
| Where | Fix |
|---|---|
| `/admin/offerings` | With no filter the page listed nothing: `{ termId: undefined }` reaches MongoDB as `null`. Integration test added (it fails without the fix) |
| `/login`, `/forgot-password` | A route-level `(auth)/loading.tsx` streamed the form behind a fallback, so without JavaScript it never appeared (`auth.spec.ts` › before hydration) |
| `ActionForm` | A form of hidden inputs only (row status actions, resend invite) kept an empty fieldset and its gap above the button |
| `Field`, CO cards | A grid cell stretched to its row spread its own rows apart (an input pushed below its neighbours, a stretched Bloom badge) |
| `TabNav` | The list kept the primitive's fixed `h-9` (a variant-scoped class `cn` does not merge), so the pills overflowed and showed a scrollbar |
| `FormDialog` | A `?new=` link back to a page Next kept mounted reopened nothing; the dialog now resets when `router.bfcacheId` changes |

**Verification**
- `npm run check` → eslint clean; `next typegen && tsc --noEmit` clean; unit `Test Files 10 passed, Tests 59 passed`.
- `npm run test:integration` → `Test Files 11 passed, Tests 119 passed`.
- `npx next build` → compiled with no errors; `npm run check:bundle` → `40 files scanned for 4 names and 0 secret values; clean` (no `.env.local` here, so no secret values to look for).
- `npm run db:seed:e2e`, then `npx playwright test` → `7 passed, 1 failed` (the Mailpit test above). `admin-structure.spec.ts` covers the department dialog (pending, success, auto-close, new card), the user search, the course workspace, the faculty roster dialog and the student's view.
- Browser, production build on port 3100, as an administrator, at 1440 px: sign-in stage and the "Set up your account" page (fields and button disabled and busy while saving); Home; the quick-action deep link opened and closed three times in a row and stayed closed on Back; department create from Home (fields locked, "Department added." in place of the fields, dialog closed, `?new=` removed from the URL, new card shown); Structure, Departments, Users (table and New user dialog), Offerings, Schemes, My courses, course Overview and People. At 360 px: Home (no horizontal scroll, `scrollWidth` 360) and the sign-in layout. Screenshots were reviewed in the session, not committed.

### 2026-10-13 · Decision: dashboard after a reference design · Claude Code, at Aniket's request

Aniket supplied a screenshot of a learning dashboard (13 Oct 2026) and asked for Home, the sidebar (header included) and the top bar to look exactly like it. He decided:
- The palette changes from the seal crimson to the reference's blue, across the whole app, sign-in included. This supersedes the Q-32 palette.
- Panels with no data behind them yet are left out rather than shown empty or with sample data. The reference's attendance, learning hours, assignments, schedule and leaderboard map to what M01 has, and each milestone adds its own panel.
- The shell is restyled too: icon-and-wordmark header, a “Menu” list of grey pills with a solid current pill, Profile and Sign out at the foot, and a user chip in the top bar.

Left out of the reference on purpose: the search box (no search feature), the theme toggle (light only, A-23), the notification bell (M02), certificates (out of scope, 01 §4), leave management (not in scope), and the AI button (no AI feature in M01).

### 2026-10-13 · Dashboard after a reference design (build) · Claude Code, at Aniket's request

Home, the sidebar and the top bar follow the reference. Four commits, `44cc331 UI(home)` to the one that adds this entry.

**Created** (all *changed* unless marked new)
- DAL: `lib/data/workspace.ts`. `getHomeSummary().admin` gains `activity` (audit entries per IST day, last seven days) and `mostActive` (top three people by audit entries that week); `departments` is removed, since Home no longer shows it. Both aggregations `$match` on the `{ at }` index and return at most seven and three documents.
- Styling: `app/globals.css` (blue tokens, `--violet`, blue sign-in aurora).
- Shell: `app/(app)/layout.tsx` (product-mark header, rounded grey content area, top-bar date pill and user chip); `components/app-nav.tsx` (“Menu” pills, Account group and Sign out at the foot, breadcrumb without the group; Home is labelled Dashboard).
- Home: `app/(app)/home/page.tsx` (hero, tiles, activity bars, most active, recent activity, offerings row), `home/loading.tsx`; `components/offering-card.tsx` (schedule-style card, `featured`); `lib/format.ts` (`dayGreeting` removed, now unused).
- Tests: `tests/integration/workspace.test.ts` (new test for `activity` and `mostActive`; the admin test no longer checks departments); `lib/format.test.ts` (greeting test removed).
- Docs: 08 §1, §3, §4, §5.2, §6; M01 T11; this file (Q-32 note, A-41 to A-44).

**Not done**
- Student and faculty Home is sparse: the reference's attendance, learning hours, assignments and schedule have no data until M02 to M04, so those panels are not there.
- The hero has no progress bar. Lesson progress arrives in M02.
- Not run: `auth.spec.ts` › “invited admin sets a password…”, which fails at its first mail read as before, because Mailpit is not installed here. No keyboard-only or screen-reader pass.
- Your `npm run dev` on port 3000 was not restarted. If it still shows crimson, restart it (delete `.next/dev` first if needed).

**Assumptions** — A-42 to A-44 (§4).

**Open questions** — none new. Q-32's palette is superseded; confirming the change with the client is worth doing.

**Verification**
- `npm run check` → eslint clean; `next typegen && tsc --noEmit` clean; unit `Test Files 10 passed, Tests 58 passed`.
- `npm run test:integration` (local Redis started for the run) → `Test Files 11 passed, Tests 120 passed`.
- `npx next build` → compiled with no errors.
- `npm run db:indexes:e2e`, `npm run db:seed:e2e`, then `npx playwright test` against the build on port 3100 → `7 passed, 1 failed` (the Mailpit test above).
- Screenshots of the production build, reviewed in the session and not committed: admin, faculty and student at 1440 px; admin and student at 390 px (`scrollWidth` 390, no horizontal scroll). The first phone shot overflowed by 17 px (the chart's “n changes” label); it is fixed and was shot again.

### 2026-10-13 · Dashboard follow-up: lockup in the sidebar, blue on the dev server · Claude Code, at Aniket's request

Aniket reported that the palette had not changed and asked for the original Centurion logo, named “LMS”. His `npm run dev` on port 3000 was serving the old CSS from its cache (`--primary: #d5282c`). It was stopped, `.next/dev` deleted and `npm run dev` started again; its CSS now has `--primary: #1c59e4`. That server now runs from the agent's session, so restart it from your own terminal if it stops.

**Created** (*changed*) — `app/(app)/layout.tsx` (sidebar header: `UniversityLogo` and “LMS”); `app/(app)/home/page.tsx` (hero fallback “Welcome to the LMS”; the chart leaves about a fifth of headroom above the tallest bar, because a full-height bar's label overlapped the “Last 7 days” pill); 08 §3, §4, §5.2; A-43 and the Q-32 note.

**Verification** — `npx eslint` and `npx tsc --noEmit` clean on the changed files; `npx next build` compiled; a screenshot of the admin Home at 1440 px on the build shows the lockup and “LMS” in the sidebar header.

### 2026-10-13 · Reference card design across the site · Claude Code, at Aniket's request

Aniket shared four more screens of the reference design (courses, an instructor dashboard, a student list) and asked for three things: no white shadows on buttons, no purple or violet anywhere, and the reference's card design on every page.

**Created** (*changed*)
- `app/globals.css`: `surface` is flat (`rounded-2xl`, hairline ring, no shadow); `surface-interactive` tints its ring on hover instead of lifting; `icon-chip` is an outlined square; `--violet`, `--elevation-card` and `shadow-card` are removed; the sign-in aurora's violet light is now sky blue.
- Primitives (marked as local changes): `ui/button.tsx` (outline: white, no shadow), `ui/input.tsx`, `ui/textarea.tsx`, `ui/native-select.tsx` (no shadow), `ui/badge.tsx` (status tones: ring, dot, capitalised).
- Components: `section.tsx` (a section is one card), `data-table.tsx` (rows as separate outlined strips, sentence-case header), `filter-form.tsx` (rounded white fields on the page, outline submit), `tab-nav.tsx` (solid primary current tab), `offering-card.tsx` (black “Open” pill).
- Pages: `home/page.tsx` (no white ring around the hero tile, no button shadows, solid primary hero button, course entries in black instead of violet); `profile/page.tsx` (avatar without the white ring and shadow).
- Docs: 08 §1, §4, §5.1, §5.2, §6.

**Not done** — Page headers keep their icon chip (the reference's have none). Dialogs keep their shadow so they stand off the overlay. `auth.spec.ts` › “invited admin sets a password…” still needs Mailpit.

**Verification**
- `npm run check` → eslint clean; typecheck clean; unit `Test Files 10 passed, Tests 58 passed`. `npm run test:integration` (local Redis started for the run) → `Test Files 11 passed, Tests 120 passed`. `npx next build` compiled.
- `npx playwright test` against the build on port 3100. The first run had 6 passed and 2 failed: the Mailpit test, and “phone width: no horizontal scroll…”. That test then passed alone and in a second full run (`7 passed, 1 failed`, the Mailpit test). The cause of its one failure was not captured.
- Screenshots at 1440 px as an administrator, reviewed in the session: Home, Users, My courses, a course Overview, Profile.

### 2026-10-13 · Sidebar header: centred lockup with an “LMS” pill · Claude Code, at Aniket's request

Aniket found the side-by-side lockup and “LMS” plain and out of keeping with the theme. Four treatments were mocked up as static HTML in the agent's scratchpad (logo │ LMS; a grey brand panel; a centred lockup with an LMS pill; logo │ blue LMS), and he chose the centred lockup.

**Created** (*changed*) — `app/(app)/layout.tsx` (header: lockup 68 px wide, centred, above a primary pill “LMS” in spaced capitals; collapsed, the lockup shrinks to 32 px and the pill is screen-reader only); 08 §3; A-43.

**Verification** — `npx eslint` and `npx tsc --noEmit` clean; `npx next build` compiled; a screenshot of the admin Home at 1440 px on the build shows the new header.

### 2026-10-13 · Collapsed sidebar centred · Claude Code, at Aniket's request

Collapsed, the rail was 48 px but the groups kept 12 px side padding, so the 32 px icon buttons spilled 8 px to the right. The rail is now 56 px (`--sidebar-width-icon: 3.5rem`), the groups pad 8 px in icon mode, and each item is a 40 px square; the lockup shrinks to 36 px.

**Created** (*changed*) — `components/app-nav.tsx`, `app/(app)/layout.tsx`, 08 §3.

**Verification** — eslint and `tsc --noEmit` clean; `npx next build` compiled. On the build at 1440 px, with the sidebar collapsed, every menu button measured 8 px from each edge of the 56 px rail and the lockup 10 px (bounding boxes read in the browser); screenshot reviewed. `npx playwright test` → `7 passed, 1 failed` (the Mailpit test, as before).

### 2026-10-13 · Sidebar header card; collapsed rail back to 48 px · Claude Code, at Aniket's request

Aniket asked to keep the collapsed rail at its original size and only centre it. He rejected two header treatments: the centred lockup with a spaced “L M S” pill, and a frosted-glass card over blurred blue glows. Three more were mocked up as static HTML in the agent's scratchpad (a blue brand card, a letterhead, a light tinted card), and he chose the light tinted card.

**Created** (*changed*)
- `components/app-nav.tsx`: collapsed items are the primitive's 32 px squares again, centred by 8 px of group padding in icon mode (the 56 px rail and 40 px items of `e75f364` are undone).
- `app/(app)/layout.tsx`: the `--sidebar-width-icon` override is removed. The header is a `rounded-2xl` card, `bg-linear-to-b from-primary/[0.03] to-primary/[0.08]` with `ring-primary/10`, holding the lockup on a white 46 × 58 px chip beside “Centurion LMS” (LMS in the primary colour) and “Learning Management System”. Collapsed, the card and chip drop their fill and ring, and the 32 px lockup alone shows.
- 08 §3; A-43.

**Verification** — eslint and `tsc --noEmit` clean; `npx next build` compiled. On the build at 1440 px, collapsed, the rail measured 48 px and every menu button and the lockup sat 8 px from each edge; screenshots of both states reviewed. `npx playwright test` → `7 passed, 1 failed` (the Mailpit test, as before).

### 2026-10-13 · Sidebar header spacing · Claude Code, at Aniket's request

The lockup filled its chip edge to edge and looked cropped, and the card sat tight against the top of the sidebar. The chip is now 48 × 64 px with the lockup 32 px wide (51 px tall): 7 px above and below it, 8 px either side. The header has 20 px above the card, the card has a little more padding and a slightly deeper diagonal tint, and the menu starts 16 px below it.

**Created** (*changed*) — `app/(app)/layout.tsx`.

**Verification** — eslint clean; `npx next build` compiled. On the build at 1440 px the lockup's margins in the chip measured 7 / 7 / 8 / 8 px and the card's top 20 px; collapsed, every rail item sat 8 px from each edge of the 48 px rail. Screenshots reviewed. `npx playwright test` → `7 passed, 1 failed` (the Mailpit test, as before).

### 2026-10-13 · No duotone smudge on buttons, tabs and tiles · Claude Code, at Aniket's request

Aniket pointed to a “white shadow” on several pages (the plus on “New offering”) and a grey one on the “Apply” filter button. Neither is a CSS shadow. A Phosphor duotone icon draws a second copy of its shape at `opacity="0.2"` (for `Plus`, a full rounded square). On a solid fill that copy is white, and on a white button it is grey; either way it reads as a smudge.

**Created** (*changed*)
- `components/ui/button.tsx` (local change): `[&_path[opacity]]:hidden` in the base class, so no button of any variant shows the layer.
- `components/tab-nav.tsx`: the current (solid primary) tab hides it.
- `app/globals.css`: a hovered `surface-interactive` hides it inside the filled icon chip.
- `app/(app)/home/page.tsx` (coloured activity tiles), `components/auth-stage.tsx` (sign-in feature chips), `components/password-input.tsx` (show/hide toggle) and the user menu in `app/(app)/layout.tsx` use the regular weight.
- 08 §1 and §5.1.

**Verification**
- `npm run check` → eslint and typecheck clean; unit `Test Files 10 passed, Tests 58 passed`. `npx next build` compiled.
- On the build at 1440 px, a browser audit visited `/login`, `/home`, `/admin`, `/admin/{departments,programs,terms,courses,schemes,offerings,users,audit}`, `/courses`, `/profile` and a course's Overview and People. It hovered a Home stat tile. It listed every visible `path[opacity]` inside a button, and every one whose nearest filled background has a luminance below 0.7. It found none. (A first run flagged the Overview tab on People while its background was still fading out; it was clean once the transition settled.) Element screenshots of “New offering”, “Apply” and the hovered tile were reviewed.
- `npx playwright test` → `7 passed, 1 failed` (the Mailpit test, as before).

### 2026-10-15 · Decision: M02 review, plain language and dialog design · Claude Code, at Aniket's request

Aniket asked for M02 (built by Cursor, uncommitted, no report) to be checked and corrected, for every screen to speak to the person using it rather than show technical detail, for the flow to read as connected steps, for the dialogs to stop cropping fields and to look professional, and for Cursor's unfinished parts to be completed. Decided in this session:
- **Dialogs:** three static mock-ups of the "Add a lesson" dialog were shown (clean, guided with a side panel, tinted header) and Aniket chose **A · Clean**: a header with a hairline, a body that scrolls, a grey button bar that stays put, full-width fields, and a bottom sheet on phones (08 §5.2 `FormDialog`). The cropping came from native selects sizing themselves to their longest option inside the dialog's grid.
- **Settings:** the JSON text box of T3 is replaced by a plain form per key (06 §7, M02 T3, AC-M02-08 reworded).
- **Steps:** the course Overview starts with a "Get this course ready" checklist for teachers (syllabus, plan, sessions, publish, lessons; each step links to where it is done) and "Your progress" with Start/Continue for students; the Course plan tab is three numbered steps; the lesson page has the course outline and Previous/Next.
- **Notifications** get a bell with the unread count in the top bar.

### 2026-10-15 · M02 Content, plan, notifications, settings, video progress (T1–T11) · Claude Code, at Aniket's request

Cursor (AI agent) wrote most of T1–T9 on 13 Oct 2026 and stopped before tests, docs and a report; the code had 3 lint errors and 6 type errors. This entry covers the review, the corrections and the completion. Defects found and fixed:
- Saving any setting failed: the audit entry put the key `lessons` into an ObjectId field (A-45).
- Pressing Ctrl+U in the editor made the document unsaveable (StarterKit 3 includes Underline; the hand-written type list lacked it). StarterKit also already includes Link, so `@tiptap/extension-link` was an unneeded dependency (removed). The toolbar's active states never updated (Tiptap 3 does not re-render per transaction).
- The node whitelist existed three times (schema, renderer, editor); it is now one Zod schema (06 §2).
- `media/transcodeLesson` had the wrong job name and payload (06 §6); a failed-status write was a floating promise.
- The beacon's rate limit was 600/hour per lesson instead of 120 per 10 minutes per user (09 §4); merged ranges were not bounded to 200 (05 §4.2).
- Skill attendance counted completions of lessons since unpublished, so it could pass 100 %; the aggregation also counted rows without `completedAt` as complete.
- `completeLesson` read, then wrote: a double click could count a lesson twice. It is now one conditional upsert.
- Downloads were named by the storage uuid instead of the file's name, and `/api/files` repeated the access rules in three helpers; it now has one, mirroring `offeringAccess`, with a test for each case.
- A 2 GB lecture would have been read into memory twice by the transcode (download and upload); both now stream through the disk.
- `lib/domain/ranges.ts` had its own rounding; `roundHalfUp` now lives in `lib/domain/round.ts` with the 07 §1 vectors.
- Forbidden casts (`as UploadPurpose`, the purpose tuple, `as never` and `as Buffer` in tests), `findOneAndUpdate({ new: true })` (Mongoose 9 uses `returnDocument`), `ffmpeg-static` pinned with `^`, and setState in an effect in the player.
- A requirement ID and storage-status words had reached user-facing text; copy was rewritten for the person on screen throughout.
- Two pre-existing M01 layout bugs found on the way: the People roster widened the page at 390 px (fixed in `Section`), and the Home "Programmes" tile overflowed at 360 px (labels stack under the icon on phones). The M01 auth journey still asserted the pre-redesign Home; it never reached that line before because Mailpit was missing (assertion updated).

**Created** (*changed* unless marked new)
- Dependencies: `package.json`, `package-lock.json` (Tiptap 3.31.4, `@tiptap/html`, `happy-dom`, `ffmpeg-static` 5.3.0 exact with its install script approved in `allowScripts`, AWS SDK; `@tiptap/extension-link` removed; `s3:setup`, `s3:setup:e2e`).
- Storage and uploads (T1, T2): `lib/env.ts`, `.env.example`, `tests/setup.ts`, `lib/integrations/storage.ts` (new), `scripts/s3-setup.ts` (new), `lib/schemas/uploads.ts` (new), `lib/domain/uploads.ts` + test (new), `app/(app)/actions.ts` (new, `createUpload`), `app/api/files/[...key]/route.ts` (new), `components/file-upload.tsx` (new), `components/ui/progress.tsx` (new, shadcn 4.21.4).
- Settings (T3): `lib/schemas/settings.ts`, `lib/models/setting.ts`, `lib/data/settings.ts`, `app/(app)/admin/settings/page.tsx`, `[key]/page.tsx`, `actions.ts` (all new); `scripts/sync-indexes.ts`; `components/app-nav.tsx` (Settings and Notifications items).
- Rich text (T4): `lib/schemas/common.ts` (`RichTextDoc`, `richText`), `lib/domain/rich-text.ts` + test, `components/rich-text-editor.tsx`, `components/rich-text-view.tsx` (new), `app/globals.css` (`.prose-lms`; Cursor's `btn-sm` and editor rules removed).
- Syllabus (T5): `lib/schemas/structure.ts`, `app/(app)/admin/courses/actions.ts`, `app/(app)/admin/courses/[id]/page.tsx` (read-only section with an Edit syllabus dialog), `lib/data/courses.ts`.
- Notifications (T6): `lib/models/notification.ts`, `lib/data/notifications.ts`, `app/(app)/notifications/page.tsx`, `actions.ts` (new); `app/(app)/layout.tsx` (bell).
- Plan and calendar (T7): `app/(app)/courses/[offeringId]/plan/page.tsx`, `actions.ts` (new); `lib/data/workspace.ts` (plan, setup checklist, roster; `canChangeEnrollments` renamed `canTeach`); `app/(app)/admin/offerings/actions.ts` (`plan.requested`); `lib/schemas/jobs.ts`, `lib/queue.ts`, `worker/jobs/mail.ts`, `lib/domain/email-templates.ts` + test.
- Content and video (T8, T8b): `lib/schemas/content.ts`, `lib/models/lesson.ts`, `lesson-progress.ts`, `engagement-daily.ts`, `lib/domain/ranges.ts` + test, `lib/domain/round.ts` + test, `lib/data/content.ts`, `app/(app)/courses/[offeringId]/content/page.tsx`, `[lessonId]/page.tsx`, `actions.ts`, `app/api/beacon/route.ts`, `components/video-player.tsx`, `worker/jobs/media.ts`, `worker/index.ts` (all new except the worker index).
- Skill progress and Home (T9, T10): `app/(app)/courses/[offeringId]/page.tsx`, `people/page.tsx`, `layout.tsx`, `app/(app)/home/page.tsx`, `lib/format.ts` + test (`formatPct`, `formatBytes`, `formatDuration`, `formatDay`).
- Dialogs: `components/form-dialog.tsx` (design A), `components/action-form.tsx` (`submitIcon`, `iconOnly`, `outline`), `components/confirm-submit.tsx`, `components/section.tsx`.
- Tests (T11): `tests/integration/content.test.ts`, `media-worker.test.ts` (new), `mail-worker.test.ts`, `users.test.ts`, `workspace.test.ts`; `tests/e2e/content.spec.ts`, `tests/e2e/fixtures/lecture.mp4` (new, a generated 6 s test pattern), `tests/e2e/auth.spec.ts`; `.github/workflows/ci.yml` (RustFS service, S3 env, `s3:setup:e2e`).
- Docs: 03 §3, 05 §1 §4.1 §4.2 §7.2, 06 §2 §7, 08 §2 §3 §5.1 §5.2 §6, 10 §3 §4, M02 T2 T3 T4 T7 T8 T11 and AC-M02-08, this file (Q-36, A-45 to A-53).

**Not done**
- Human validation checklist: not performed (slow-4G upload with a forced failure, a real phone's pagehide beacon, reading the email in a mail client, the faculty prompt by eye). Partly covered by machine checks below.
- The CI e2e job with the RustFS service has not run on GitHub.
- No keyboard-only or screen-reader pass. The upload and beacon rate limits are implemented but not exercised by a test.
- `/courses/[offeringId]/content/new` (08 §2) is not a route: adding a lesson is a dialog (A-40); the route map row is removed.
- Production storage (Cloudflare R2) was not tried; RustFS 1.0.1 was.

**Assumptions** — A-45 to A-53 (§4).

**Open questions** — Q-36 (§3).

**Verification** (13–15 Oct 2026, this machine: no Docker, so RustFS 1.0.1 and Mailpit 1.31.0 ran from their official macOS release binaries in the agent's scratchpad; Redis from Homebrew; MongoDB local)
- `npm run check` → eslint clean; `next typegen && tsc --noEmit` clean; unit `Test Files 14 passed, Tests 110 passed`. `npx prettier --check .` clean.
- `npm run test:integration` (local Redis) → `Test Files 13 passed, Tests 140 passed`. Includes: per-purpose upload authorization; `/api/files` for teacher, enrolled student, outsider, draft and data-saver key; one fan-out and one notification per enrolled student per version, second click deduped; beacon 401/400/404, replayed minute counted once, faster-than-real-time claim ignored, two simultaneous beacons merged through the retry (three writes asserted), completion counted once; settings field error with nothing saved; lesson deletion guards; skill attendance over published lessons; the worker emailing all five sections once per student; a real ffmpeg transcode producing H.264 Main at 480p, and a corrupt file ending `failed`.
- `npm run build` → compiled. `npm run db:indexes:e2e`, `npm run s3:setup:e2e` (bucket created, CORS set on RustFS), `npm run db:seed:e2e`.
- `npx playwright test` → `10 passed` (the M01 "invited admin" journey passes for the first time); `tests/e2e/content.spec.ts --repeat-each=3` → `6 passed`.
- In the browser: a 204.8 MB, 60 s lecture uploaded through the Add a lesson dialog; the largest request body that reached the app was 1,091 bytes (AC-M02-01), and its 480p copy was `ready` when checked a few minutes later. A student who played 5 s of the 6 s fixture had `[0, 5]`, 83.33 % after a reload. At 390 px a phone starts in Data saver (AC-M02-09).
- Screenshots at 1440 px and 390 px (faculty, student, admin; Overview, Course plan, Content, lesson, dialogs, settings, notifications, Home, the plan email), reviewed in the session and not committed. 21 role-and-page combinations measured `scrollWidth` 390 at 390 px; Home tiles fit at 360 px.
- One false alarm worth knowing: `pkill -f standalone/server.js` does not stop the e2e server (Next renames the process `next-server`); a rebuilt app served by the old process links CSS and scripts that no longer exist. Stop it by port (`lsof -tiTCP:3100 -sTCP:LISTEN | xargs kill`).

### 2026-10-15 · Decision: M01b catalogue v2 from CUTM's real data · Claude Code, at Aniket's request

Aniket pointed at courseware.cutm.ac.in and CUTM1535 (3-0-1) and asked for the CO–PO design to follow CUTM's real catalogue: the M01 version was "too complex, hard to understand, so many boxes to fill", every course should be in the LMS, and the architecture should be simple to use. The session read the courseware site (12 pages sampled), the Course Repository PDFs (programme, stream, basket, type, code, title, credits, T+P+Pj), the Programme Structure PDF (baskets I–VI, core or choice, minimum credits) and the 2020 Examination Policy. Decided, with Aniket's answers to the questions put to him:
- **Course data:** an importer now (courseware pages, by an admin), export later.
- **Catalogue:** university-wide, one course per code; programmes list courses in baskets; fixed outcome codes PO1–PO12 and PSO1–PSO3 with titles per programme.
- **Course types:** the credits decide the features (a credit course gets everything; 0-0-0 is non-credit and uses M02's skill mode); the six courseware types are labels.
- **Marking:** built in from the Examination Policy as one Settings form; each offering keeps a copy. Evaluation schemes and `/admin/schemes` go.
- **Course owner:** a course coordinator (faculty) edits the course's content with the admins (new CRS-07).
- **Course list:** a CSV upload (new ADM-06); the repository PDFs are converted to it once, offline. Courseware import is ADM-07.

The build plan is `docs/milestones/M01b-catalog-v2.md`. Questions answered or changed: Q-01, Q-02, Q-05, Q-08, Q-18, Q-19, Q-20, Q-27; new questions Q-37 – Q-48; assumptions A-12 and A-16 updated, A-54 – A-64 added.

### 2026-10-16 · M01b Catalogue v2 (T1–T14) · Claude Code, at Aniket's request

Built to `docs/milestones/M01b-catalog-v2.md` in six commits: docs → domain → courseware → core → courseware fixes → real-data fixes, plus this report. At the end, loading CUTM's own data exposed three defects, all fixed in `M01b(import)`:
- A credit part could not exceed 20, but CUTM lists 0+0+24 internships, 2+0+21 domain tracks and 0+0+30 workshops (A-65).
- A second upload of the real list linked 7 "MSc" courses to "M.Sc", because programmes were looked up by code before name (A-66, new test).
- The courseware import read 2.6 pages a second until the site stopped answering. It now reads at most one page a second (A-67, Q-37).

Where the build differs from the plan:
- Import notes on a course (`issues`) are plain sentences, not codes.
- A run's failed pages are stored as `failures` (Mongoose reserves `errors`).
- There is no separate `saveModules` or `saveSyllabusFile`: `saveSyllabus` saves the modules, the projects and the PDF from one dialog.
- The readiness "Books" step counts textbooks and references together.
- Courseware pages that give a weekly plan instead of numbered sessions (like page 1084) produce no session plan.

**Created** (new unless marked *changed* or *deleted*)
- Docs: `docs/milestones/M01b-catalog-v2.md`. *Changed:* 00–11 and this file. Each later milestone (M01, M02, M03, M04, M06, M07, M08, M09, M10, M11) now opens with a note on what M01b changed for it.
- Schemas: *changed* `lib/schemas/structure.ts` (+ test), `settings.ts` (+ `settings.test.ts`, new) and `jobs.ts`.
- Domain:
  - New: `lib/domain/catalog.ts`, `evaluation.ts` and `courseware.ts`, each with tests.
  - *Changed:* `csv.ts`, `round.ts`, `time.ts` and `email-templates.ts` (with their tests).
  - *Deleted:* `lib/domain/structure.ts` (+ test).
- Courseware adapter:
  - New: `lib/integrations/courseware.ts` (+ test) and `tests/fixtures/courseware/{500,836,1084,1114,1115,1160,1173,1250}.html` (trimmed real pages, contact details replaced).
  - *Changed:* `lib/env.ts`, `.env.example`, `tests/setup.ts` (`COURSEWARE_URL`) and `.prettierignore`.
- Models: new `lib/models/curriculum-entry.ts` and `sync-run.ts`. *Changed:* `course.ts`, `program.ts`, `offering.ts`, `user.ts` and `scripts/sync-indexes.ts`. *Deleted:* `evaluation-scheme.ts`.
- Scripts: new `scripts/migrate-catalog-v2.ts` (`npm run db:migrate:catalog-v2`). *Changed:* `scripts/seed.ts` and `package.json`.
- Access and data:
  - *Changed* `lib/auth/access.ts` (`canEditCourse`, `requireCourseEditor`).
  - New `lib/data/imports.ts`.
  - *Changed* `courses.ts`, `structure.ts`, `offerings.ts`, `workspace.ts` and `settings.ts`.
  - *Deleted:* `lib/data/schemes.ts`.
- Actions:
  - New: `app/(app)/catalog/actions.ts` and `app/(app)/admin/imports/actions.ts`.
  - *Changed:* `app/(app)/admin/actions.ts`, `admin/offerings/actions.ts`, `admin/settings/actions.ts`, `courses/[offeringId]/plan/actions.ts` and `app/(app)/actions.ts`.
  - *Deleted:* the `admin/courses` and `admin/schemes` actions.
- Worker: new `worker/jobs/sync.ts`. *Changed:* `worker/index.ts`, `worker/jobs/mail.ts` and `lib/queue.ts`.
- Screens:
  - New: `app/(app)/catalog/page.tsx`, `[id]/page.tsx` and `course-fields.tsx`; `app/(app)/admin/imports/page.tsx` and `[runId]/page.tsx`; `components/checklist.tsx` and `components/co-po-editor.tsx`.
  - *Changed:* the programme pages, the offerings page, the settings pages, the workspace Overview and plan page, the home page, `components/app-nav.tsx`, `components/co-po-matrix.tsx` and `lib/format.ts`.
  - *Deleted:* `/admin/courses` and `/admin/schemes`.
- Tests:
  - Integration: new `course-list.test.ts` and `courseware-import.test.ts`; *changed* `catalog`, `content`, `mail-worker`, `offerings`, `structure`, `users` and `workspace`; *deleted* `schemes.test.ts`.
  - E2E: new `catalog.spec.ts` and `fixtures/course-list.csv`; *changed* `admin-structure.spec.ts` and `content.spec.ts`.
  - *Changed:* `tests/factories.ts`.

**Not done**
- No human has worked through the M01b validation checklist yet, and the CI e2e job has not run on GitHub.
- The 2021 Course Repository was converted only to test the import. The CSV is not in the repository and has not been loaded into any real database.
  - Its programme names need Q-44 answered before a real first load.
  - The 2020 repository was not converted.
- A full courseware import has not been run. The first run handled 235 pages before the site stopped answering; the second, rate-limited run handled 78. Both were stopped by hand.
- M06 and M08 must be reworked for the evaluation policy before they start, and that rework waits on Q-41; notes are at the top of both files.
- Two kinds of page are not handled: pages that cannot be matched to a course (Q-49) and courseware session links (Q-46).
- No keyboard-only or screen-reader pass was done.

**Assumptions** — A-54 to A-67 (§4). A-65, A-66 and A-67 come from the real data.

**Open questions** — Q-37 to Q-49 (§3). Q-37 and Q-44 now include what the real data showed; Q-49 is new.

**Verification** (14–16 Oct 2026, on this machine: MongoDB and Redis local; RustFS 1.0.1 and Mailpit 1.31.6 from their macOS release binaries)
- `npm run check` → eslint clean, typecheck clean, unit `Test Files 18 passed, Tests 233 passed`. `npx prettier --check` on every changed file → clean.
- `npm run test:integration` → `Test Files 14 passed, Tests 140 passed`.
  - The new `course-list` test fails with the old code-first lookup and passes with the fix.
- `npm run build` → compiled. The e2e database was dropped, given its indexes and reseeded.
- `npx playwright test` → `11 passed, 1 failed` on the first run: the student's click on the new lesson in `content.spec.ts`. The error details were lost before they were read. The next three runs (one of that file, two of the full suite) gave `12 passed` each.
- Migration (earlier in this session): on a scratch database shaped like M01/M02 data, including two courses with one code, the first run printed `{"coursesMerged":1,"coursesChanged":2,"linksCreated":3,"programmesChanged":2,"offeringsChanged":3}` and the second `nothing to change`. The scratch database was then dropped.
- Live courseware, one page: `/course/836` gave exactly the AC-M01b-02 values. A sample of 35 live pages: 31 had outcomes and modules, 30 had sessions, 24 had codes.
- Real course list: CUTM's `CUTM_Course-Repository-2021_26.02-1.pdf` (54 pages), converted offline by a throwaway script.
  - Merged cells take their value from the row above. Rows the script could not settle went to a review file instead of being guessed.
  - Result: 1,756 PDF rows → 1,705 CSV rows (sha256 `1641c684…`), with 1,629 codes and 39 programme names.
  - 127 rows were held back: 79 with no T+P+Pj in the PDF, 37 unreadable programme cells, 6 whose credits differ from T+P+Pj, 4 with no credits, and 1 code listed twice with different titles.
- Uploading it on `/admin/imports` (scratch database with the e2e fixtures):
  - First try: refused, with every bad row named and nothing written. Causes: a credit part above 20, and type cells the converter had run together.
  - After the fixes: 1,705 rows in 0.8 s, giving 1,625 new courses (4 seeded codes matched), 1,705 links and 39 new programmes.
  - Same file again: 0 new courses, 0 updated, 0 new links. Before the name-first fix it added 7 links.
  - Catalogue with 1,630 courses: 66 pages of 25, each in about 0.3 s. At 390 px only the table scrolls sideways (`scrollWidth` 390).
- Live courseware with that catalogue, "Pages not imported yet":
  - First 90 s: 264 pages listed, 164 imported and 71 failed with a plain reason (49 with no code and no unique title, 22 with codes outside the catalogue and no credits). Then the site timed out (90 s) and jobs retried as designed.
  - With the one-a-second limit: 78 jobs in 88 s.
  - Of the 175 pages imported: 168 have outcomes, 156 modules and 163 a session plan, but only 8 a CO–PO mapping. 30 became drafts (codes not in the 2021 list).
- Screenshots at 1440 and 390 px (catalogue, a 0-0-24 course, imports): reviewed in the session, not committed.

### 2026-10-16 · Decision: M03 live classes, built for the people using them · Claude Code, at Aniket's request

Aniket asked for the next milestone to be done "properly, very user friendly and in a really good manner". Planning the build of M03 he decided:
- **Three more notifications** (in-app only): "class started", "class changed" (a scheduled class can now be edited until it starts) and "class cancelled". His answer also ticked "Spec only"; it is read as "everything in the spec, plus these", to be confirmed.
- **Roll call:** when the teacher takes attendance, students who joined the room start ticked Present; nothing is stored until the teacher saves.
- **In class** the room fills the page and "Take attendance" opens a dialog.

A design review before any code changed three rules of the spec, each recorded in the milestone file: presence is matched by the engine's connection id; LiveKit's `room_finished` before the scheduled end leaves the class live (Q-50); attendance has no status until the class is finalized or marked. New assumptions A-68 – A-74, questions Q-50 – Q-52. The build plan is the rewritten `docs/milestones/M03-live-classes-attendance.md`.

### 2026-10-16 · M03 Live classes & attendance (T1–T10) · Claude Code, at Aniket's request

Teachers schedule, start, run and end live classes on self-hosted LiveKit; students join from the course, Home or a notification; attendance is taken by the teacher in a dialog over the room (students who joined start ticked) or worked out from time in the room; focused time feeds engagement. Seven commits, `2800ded M03(docs)` to `cc1e413 M03(ui)`, plus this report. Before the screens were built Aniket picked, from static mock-ups, **A · Dark stage** for the class page and **A · List rows** for the Live tab.

Where the build differs from the plan or the spec:
- No `loading.tsx` per live page: like the other workspace tabs, they use the shared `(app)/loading.tsx` inside their `<Suspense>`.
- The hourly scheduler is named `liveSweep`, after the job it adds: BullMQ 6 types a scheduler id as one of the queue's job names (04 §6.9, 02 §8).
- `skillAttendancePct` became `attendancePct` in `lib/domain/attendance.ts` (the same formula, now shared by skill courses and live classes).
- `lib/data/engagement.ts` is a new file: the finalize job adds `liveSec`, and the worker may not import `lib/data/content.ts` (it loads `next/navigation` and the session).
- `scripts/check-bundle.ts` now also scans for `S3_SECRET_ACCESS_KEY`, which M02 left out.

**Created** (new unless marked *changed*)
- Docs: *changed* `docs/milestones/M03-live-classes-attendance.md` (decisions, rewritten tasks), 02 §8, 04 §6.9 and §7, 05 §4.3–4.4, 06 §2, §4.3, §6, §7, §9, 07 §8–§10, 08 §2 and §5.2–§6, 10 §3, 11 §3.1, this file.
- Engine and config: `lib/integrations/live.ts` (+ test), `livekit.yaml`; *changed* `compose.yaml`, `lib/env.ts`, `.env.example`, `tests/setup.ts`, `scripts/check-bundle.ts`, `package.json`/`package-lock.json` (`livekit-server-sdk` 2.19.1, `livekit-client` 2.22.4, `@livekit/components-react` 2.9.24, `@livekit/components-styles` 1.2.0, all exact).
- Schemas, models, settings: `lib/schemas/live.ts` (+ test), `lib/models/live-session.ts`, `lib/models/attendance.ts`; *changed* `lib/schemas/common.ts` (`istTime`), `lib/schemas/jobs.ts`, `lib/schemas/settings.ts` (+ test, key `attendance`), `lib/models/notification.ts` (four `live.*` kinds), `scripts/sync-indexes.ts`, `lib/data/settings.ts`.
- Pure functions: `lib/domain/attendance.ts` (+ test); *changed* `lib/domain/ranges.ts` (+ test, `acceptFocusBeacon`), `lib/domain/time.ts` (+ test, `istTimeOfDay`), `lib/format.ts` (+ test, `formatTime`, live tones).
- Data and jobs: `lib/data/live.ts`, `lib/data/engagement.ts`, `worker/jobs/compute.ts`; *changed* `lib/data/content.ts`, `lib/data/workspace.ts` (roster attendance), `lib/queue.ts` (`computeQueue`, `queueLiveFinalize`), `worker/index.ts`.
- Routes and actions: `app/(app)/courses/[offeringId]/live/{page.tsx,actions.ts,session-dialog.tsx}`, `live/[sessionId]/page.tsx`, `app/api/webhooks/live/route.ts`; *changed* `app/api/beacon/route.ts`, `courses/[offeringId]/{layout.tsx,people/page.tsx,content/actions.ts}`, `home/page.tsx`, `notifications/page.tsx`, `admin/settings/{page.tsx,[key]/page.tsx}`.
- Components: `components/live-room.tsx`, `components/auto-refresh.tsx` (both client boundaries, in the 08 §5.2 inventory).
- Tests: `tests/integration/live.test.ts` (24 tests), `tests/e2e/live.spec.ts`; *changed* `playwright.config.ts` (fake camera and microphone), `.github/workflows/ci.yml` (LiveKit on the host network, `LIVEKIT_*` in `.env.e2e`).
- Local, not committed: the four development `LIVEKIT_*` values appended to `.env` and `.env.e2e`.

**Not done**
- The human validation checklist: two real devices with real audio and video, switching tabs for 5 minutes on a real device, 3 rooms at once for the M11 sizing.
- The CI `e2e` job with LiveKit has not run on GitHub; `docker compose --profile live` was not run (no Docker here).
- A real periodic focus beacon was not seen in the browser: the walked classes lasted under a minute, so only the final flush was sent, after the class had ended, and it was ignored by design. The accepted path is covered by the integration tests. When a student leaves, up to 60 s of focused time since their last beacon is lost (the flush arrives when no connection is open).
- No keyboard-only or screen-reader pass.
- Production LiveKit (TURN on 443, multi-node Redis) is M11.
- Locally, `npm run worker:dev` reads `.env.local`, while this machine's development settings are in `.env`; without the worker, ended classes are never finalized (attendance stays "Working out").

**Assumptions** — A-68 to A-74 (§4).

**Open questions** — Q-50 to Q-52 (§3).

**Acceptance criteria**
| ID | Result | Evidence |
|---|---|---|
| AC-M03-01 | Pass | `grep -rln livekit-server-sdk app lib worker components scripts tests` → `lib/integrations/live.ts` and its own unit test only; `livekit-client`/`@livekit/components` → `components/live-room.tsx` only; no Zoom, Meet, Webex or Teams URL anywhere |
| AC-M03-02 | Pass | `lib/domain/attendance.test.ts`: 50 of 60 min present; two overlapping tabs (union 40 min) absent; every 07 §10 vector plus a zero-length class |
| AC-M03-03 | Pass | `live.test.ts`: a manual mark survives finalize in derived and manual mode; only changed marks are written, with before/after in one `attendance.marked` entry; a mutation that drops the `source ≠ manual` filter fails the test |
| AC-M03-04 | Pass | `live.test.ts`: a forged signature → 401, no row; `live.test.ts` (unit): a changed body, another key and no header are refused |
| AC-M03-05 | Pass | `live.test.ts`: the `liveSweep` job closes the room, ends an abandoned class at its scheduled end and finalizes it |
| AC-M03-06 | Pass | `live.test.ts`: `markAttendance` on a skill offering → VALIDATION; the class page renders the attendance dialog only for credit courses |

**Verification** (16 Oct 2026, on this machine: MongoDB and Redis local; RustFS 1.0.1 and Mailpit from the earlier sessions' release binaries; LiveKit 1.13.10 from Homebrew's bottle, unpacked in the agent's scratchpad, because the v1.13 GitHub releases no longer ship macOS builds)
- `npm run check` → eslint clean, typecheck clean, unit `Test Files 21 passed, Tests 258 passed`.
- `npm run test:integration` → `Test Files 15 passed, Tests 164 passed` (`live.test.ts` 24).
- `npm run build` → compiled; `tsx --env-file=.env.e2e scripts/check-bundle.ts` → `51 files scanned for 4 names and 5 secret values; clean`.
- `npx playwright test` → `13 passed (2.0m)`; `npx playwright test live --repeat-each=3` → `3 passed`.
- Against the real engine: `deleteRoom` of a missing room → `ServerError` 404 `not_found` (treated as closed); webhooks from LiveKit reached the e2e build on port 3100.
- Browser walks of the production build (Playwright, fake camera and microphone; screenshots reviewed in the session, not committed):
  - Faculty schedules a class (title and date prefilled from the course calendar), a student's waiting page turns into the room by itself, the teacher's "Take attendance" shows the joined student ticked, saving keeps the teacher in the room, ending turns the student's page into their result, and the Live tab, People and the student's attendance % follow.
  - An admin starts a class and sees it without joining (no room); an HoD sees it with no buttons.
  - A student who leaves and rejoins keeps one attendance row with two connections; finalized as 14 s of an 18 s class → present at 75 %, and a second student with 7 s → absent (checked in `mongosh`).
  - Edit and cancel of a scheduled class, with the change and cancellation notifications.
  - At 390 px: Live tab, waiting page and the room all measured `scrollWidth` 390.
- Fixes found by the walk and made: the student's result waited for the teacher's mark but not for the time in class (now waits for finalization); a refresh minted a new token and would have reconnected the teacher (the room keeps its token); notification titles started with the date and were cut before the class name.

### 2026-10-16 · Local scripts read `.env` as well as `.env.local` · Cursor (AI agent), at Aniket's request

`npm run worker:dev` failed on every variable because it loaded only `.env.local`, while this machine's settings are in `.env` (the last item under M03 "Not done"). Every local script in `package.json` now passes `--env-file-if-exists=.env --env-file-if-exists=.env.local`, so `.env.local` overrides `.env`, as with `next dev`. The `:e2e` scripts still read only `.env.e2e`.

**Created** (*changed*) — `package.json` (`start:local`, `worker`, `worker:dev`, `db:seed`, `db:indexes`, `db:migrate:catalog-v2`, `s3:setup`, `admin:create`, `check:bundle`); 10 §3 (the scripts table and the note below it).

**Assumptions** — none. **Open questions** — none.

**Verification** — `node --env-file-if-exists=a --env-file-if-exists=b` and the same through `npx tsx` with `A` in both files → the value from `b`, `B` only in `a` → kept. `npm run worker` with only `.env` present → `worker started` with queues `mail, media, sync, compute`, then stopped.

### 2026-10-16 · Development seed: four CSE courses from courseware, sign-in with a seed password · Cursor (AI agent), at Aniket's request

Aniket asked for a few CSE courses from courseware.cutm.ac.in with everything around them, ready to test. `npm run db:seed` (not `--e2e`) now adds four courses whose code, title, credits, objectives, outcomes, mapping, modules, books and session plan come from their courseware pages through `parseCoursePage` and `normalizeCourseware`, with no edits: CUCS1002 Data Structures with Competitive Coding 2-4-0 (page 1137; 5 COs and a 46-cell CO–PO mapping, 30 sessions), CUTM1884 Operating System Concepts 2-2-2 (750; 50 sessions), CUTM1900 Computer Networks 3-2-1 (334; 47 sessions) and CUTM1019 Machine Learning using Python 1-2-1 (461; no session plan). Each is listed by BTECH-CSE and offered in 2026-ODD to section A with the twenty students: CUCS1002 by faculty1, CUTM1884 by faculty2 (GitHub projects), CUTM1900 by both (tracker projects), CUTM1019 by the HoD (GitHub projects). Courses whose pages give no credits (CUCS1003, CUCS1004, CUCS1005, CUCS1011, CUAI1001) were left out rather than given invented credits. With `SEED_PASSWORD` set, every seeded account is active with that password and `admin@seed.cutm.test` is created, as `--e2e` does with `E2E_PASSWORD`.

**Created** (*changed*) — `tests/fixtures/courseware/{1137,750,334,461}.html` (fetched 16 Oct 2026; only `<main>`, icons removed; none had contact details); *changed* `scripts/seed.ts`, `.env.example` (commented `SEED_PASSWORD`), 10 §3 (`db:seed` row).

**Not done** — No calendar, lessons or live classes are seeded: the faculty builds them in the Plan, Content and Live tabs, which is what is being tested. The courses carry no `source` binding, so a later courseware import matches them by code and binds them then.

**Assumptions** — A-75: the CSE courses are development data only; the e2e fixtures stay as 10 §3 lists them, so no e2e spec changes. A-76: the courseware page's credits stand in for the Course Repository's until the course list is uploaded (the import then reports any difference).

**Open questions** — none.

**Verification** — Each fixture parses exactly like its live page (same code, credits and counts). `npm run db:indexes` then `npm run db:seed` twice against local `lms_dev` → both print `Seeded development data: 2 departments, 2 programmes, 9 courses, 6 offerings, 20 students enrolled in CUTM1602 and the 4 CSE courses from courseware; every account signs in with the seed password.`; counts after the second run: users 24 (all active), courses 9, curriculum entries 9, offerings 6, enrollments 100. `verifyPassword` accepts `SEED_PASSWORD` for admin, HoD, faculty1 and student01. `npm run db:seed:e2e` → `… 5 courses, 2 offerings …` (unchanged). `npm run check` → lint and typecheck clean, `Tests 258 passed`. Not walked in the browser.

### 2026-10-16 · `db:seed -- --allow-remote` for a hosted development database · Cursor (AI agent), at Aniket's request

Aniket's development database is the `test` database on a shared Atlas cluster (other apps keep their own databases there; `test` holds only LMS collections). The seed still refuses any non-local MongoDB, and always under `NODE_ENV=production`, but `--allow-remote` now lets a developer name a hosted development database.

**Created** (*changed*) — `scripts/seed.ts` (the `--allow-remote` flag), 10 §3 (`db:seed` row).

**Verification** — `npm run db:seed` against the Atlas URI → `Refusing to seed "prapp.nypjwvu.mongodb.net": … unless --allow-remote is given.` `npm run db:indexes`, then `npm run db:seed -- --allow-remote` twice → both print the same `Seeded development data: … 9 courses, 6 offerings …` line; in `test`: users 25 (the existing admin plus the 24 seeded, all active), courses 9, offerings 6, enrollments 100. `verifyPassword` accepts `SEED_PASSWORD` for admin, faculty1 and student01. `tsc` and `eslint` clean.

### 2026-10-16 · Fixture names changed · Cursor (AI agent), at Aniket's request

At Aniket's request the invented fixture names Farhan Khan, Fatima Das and Zoya were replaced: faculty1 is now Pradeep Sahoo and faculty2 Lipika Das (seed and e2e specs), and the user-search integration test uses Ipsita. Real faculty names read from courseware pages are untouched. Already-seeded accounts were renamed by email in Atlas `test`, local `lms_dev` and `lms_e2e`, since the seed only inserts missing records.

**Created** (*changed*) — `scripts/seed.ts`, `tests/e2e/catalog.spec.ts`, `tests/e2e/admin-structure.spec.ts`, `tests/integration/users.test.ts`.

**Verification** — `npx vitest run --project integration tests/integration/users.test.ts` (with a temporary local Redis) → `22 passed`; `tsc` and Prettier clean. The two e2e specs were not run (they need the full e2e stack).

### 2026-10-16 · Test deployment at https://lms.devsomeware.com · Cursor (AI agent), at Aniket's request

Aniket asked for the LMS on the server that already runs the live engine (65.20.89.9: Ubuntu 26.10, 2 vCPU, 3.3 GB RAM, 8 GB swap). It is a test environment for Aniket and a few faculty, not production or staging: it uses the same Atlas development database (`test`) as local development, so both show the same seeded data. Production hosting is still Q-12, and 11 §4 sizes production well beyond one machine.

On the server, all as systemd services: `cutm-lms-web` (the standalone build on 127.0.0.1:3100; 3000 is left free for the developer's webhook tunnel), `cutm-lms-worker`, `redis-server` (local only, `appendonly yes`, `noeviction`), `livekit` and `caddy`. Caddy's layer-4 listener on 443 splits by SNI: `live` and `turn` as before, `lms` passed with PROXY protocol to its HTTPS server on 127.0.0.1:8443, which proxies to the app, so the app sees the client's address in `X-Forwarded-For`. Files are in the AWS S3 bucket `gttech-assests` (ap-south-1), the same bucket and key as the developer's `.env.local`, so local and deployed apps, which share the database, also share the files. The bucket belongs to Aniket's other projects too: the LMS keys (`lesson-video/`, `lesson-doc/`, `syllabus/`, `submission/`, `proctor-snapshot/`) do not overlap their prefixes, and its CORS rule (any origin; GET, PUT, POST, DELETE, HEAD) already allows the LMS, so `npm run s3:setup` must not be run against it — it would replace that rule with the LMS origin alone. Port 80 redirects to HTTPS. Releases sit in `/opt/cutm-lms/releases/<commit>` with `/opt/cutm-lms/current` pointing at the running one; settings are in `/etc/cutm-lms/app.env` (secrets generated on the server, the rest copied from the developer's `.env.local`). LiveKit's webhook list now holds the deployed app and the tunnel; the handler records each connection once, so both receiving an event is harmless.

**Created** (*changed*) — this entry. Nothing in the repository changed for the deployment; it runs commit `67c5310`.

**Not done** — The S3 key is the shared gttech key, which can also read and write the other projects' prefixes; an IAM user limited to the LMS prefixes should replace it before real student files arrive. No backups (11 §6) or monitoring (11 §7). No Dockerfile: the build was made on the server with `npm ci` and `npm run build`, which 11 §5 replaces in M11.

**Assumptions** — A-77: Redis 8.0.6 (Ubuntu's package) instead of the pinned 8.6 is acceptable for a test server; BullMQ and the rate limiter use nothing newer.

**Open questions** — none new; Q-12 still decides production.

**Verification** — `GET https://lms.devsomeware.com/api/health` → `{"ok":true,"mongo":"up","redis":"up"}`; `/login` 200; `/home` signed out → 307 to `/login`; `http://` → 308 to `https://`; response headers include HSTS, `frame-ancestors 'none'` and `nosniff`. Playwright from the developer Mac: `hod@seed.cutm.test` with the seed password lands on `/home`, cookie `lms_session` is `Secure`, `HttpOnly`, `SameSite=Lax`; `/courses` lists 6 courses and CUTM1019's page returns 200. The rate-limit key in Redis carries the Mac's public address, not 127.0.0.1. Worker log: `worker started` with queues `mail, media, sync, compute`. `scripts/sync-indexes.ts` against Atlas → `indexes ensured` for every collection; Uploads are served from the bucket's own origin, `gttech-assests.s3.ap-south-1.amazonaws.com`, never the app's (09 §5): links from `presignUpload` and `presignDownload`, run with the server's `app.env` and with the developer's `.env.local` → PUT 200, GET 200 with the uploaded text and `content-disposition: inline; filename="check.txt"`, `deleteObjects` → GET 404. (A first setup on a local RustFS behind `files.devsomeware.com` passed the same checks plus a cross-origin `fetch` from an `https://lms.devsomeware.com` page and a 403 for a PUT link reused with another `Content-Type`; it was then stopped and removed from Caddy.) A live class and a lesson upload through the UI were not walked on the deployed app.

### 2026-10-16 · Sign-in screens redesigned after a reference · Cursor (AI agent), at Aniket's request

Aniket supplied a reference sign-in design (a form beside a large rounded photo with floating cards) and asked for the sign-in page in that style, in the product palette, full screen, with generated assets and smoother, more premium motion. The `(auth)` layout now fills the screen: the left column is a new `.auth-wash` (page grey warmed by flame gold) with the lockup and “Centurion LMS” on it, a centred form with white pill fields and a primary pill button, and the university's name at the foot; from 1024 px the right column is `AuthStage`, a generated photo of students pinned to the viewport with three floating feature cards, each with a generated 3D icon. Forgot password and set password share the layout and got the same heading and field style. The reference's Apple/Google buttons and sign-up link are left out: SSO is out of scope (01 §4) and the university creates accounts.

Motion: the cards used to render visible, vanish when GSAP took over, then animate in, and the full-screen gradient animated `background-position` (a repaint every frame). The cards are now hidden by CSS (`motion-safe:invisible`) until GSAP fades them in once, the drift starts only after the entrance, and the background is static; the `aurora` keyframes are removed.

**Created** (*changed*) — `public/auth/students.jpg`, `public/auth/icon-courses.jpg`, `public/auth/icon-shield.jpg`, `public/auth/icon-marks.jpg` (generated images, no real people); *changed* `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, `components/auth-stage.tsx`, `components/action-form.tsx` (`fullWidth` is a 48 px pill; used only by the auth forms), `app/globals.css` (`.auth-wash`; the profile banner's blue gradient renamed `.brand-aurora`; `aurora` keyframes removed), `app/(app)/profile/page.tsx` (class rename); *deleted* `public/brand/lotus.svg` (no longer used); 08 §1, §4, §5.2 (`AuthStage`), 04 §6.8 snippet, 03 (`gsap` row).

**Not done** — The photo is 864 × 1152, so it is slightly soft on a 2× display at panel widths above ~430 px; a larger render or a licensed campus photo can replace `public/auth/students.jpg` with no code change.

**Assumptions** — A-78: generated imagery (students, icons) is acceptable on the sign-in screens until CUTM supplies campus photography.

**Open questions** — none.

**Verification** — `npm run check` → lint and typecheck clean, `Tests 258 passed`. `npm run build` → compiled; the standalone build served on port 3101 and captured with Playwright at 1920, 1440, 1280, 1024 and 390 px: `/login`, `/forgot-password` and `/reset-password?token=x` render, `scrollWidth` equals the viewport at every width. Card opacity sampled every 100 ms after load: each card stays at 0 until hydration, rises once to 1 by 1.4 s, never dips; with `reducedMotion: reduce` all three are visible with no animation. Signing in through the new form was not walked (the form, field names and action are unchanged). The running `next dev` kept serving the old `globals.css` rule after the edit; restarting it picks up the change.
