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
| M03b Course workspace redesign | Done — awaiting human validation. Committed on main in the 17 Oct "fix" commits and pushed | | Owner request, 17 Oct 2026; plan in `docs/milestones/M03b-course-workspace.md` |
| M03c Live room with Google Meet's features | Done — awaiting human validation. T1–T3 pushed on 17 Oct; T4–T11 committed on main on 24 Oct, not pushed | | Owner request, 17 Oct 2026; plan in `docs/milestones/M03c-live-like-meet.md` |
| M04 Assessment engine | Done — awaiting human validation. Merged into main and pushed; the branch is gone (23 Oct 2026) | | Entry 2026-10-17 · M04. Plan and decisions in `docs/milestones/M04-assessment-engine.md`. Its assumptions are A-102–A-108 and M04b's A-109–A-161 (renumbered from `A-M04-n` and `A-M04b-n` on 23 Oct 2026) |
| M04b Test platform | Done — awaiting human validation. Phases A–E merged into main and pushed; the AI runs on the test server since 18 Oct | | Plan and decisions in `docs/milestones/M04b-test-platform.md`. Open: Q-54–Q-57 |
| M05 Virtual lab & proctoring | Done — awaiting human validation. Built in M04b phases C and D; T6 and the server's consent check on 23 Oct 2026 | | Entry 2026-10-23 · M05. The milestone file maps each task to where it was built. Feature set: Q-09; runner: Q-55 |
| M06 Continuous evaluation | Done — awaiting human validation | | Entry 2026-10-23 · M06. Q-41 answered 23 Oct 2026; mock-up picks in the milestone file. CE-10 specifics: Q-06; attendance source: Q-58 |
| M07 Projects | Done — awaiting human validation. GitHub not yet tried with a real App | | Entry 2026-10-23 · M07. Decisions and mock-up picks in the milestone file; GitHub on Aniket's test App until Q-22; PRJ-10: Q-03 |
| M08 Exam integration & grade sheet | Done — awaiting human validation. T7 (exam-system API) not built: Q-04 | | Decisions in `docs/milestones/M08-exam-integration-grades.md`. API: Q-04; grade table: Q-39, Q-40 |
| M09 Attainment & AI tagging | In progress — decisions and plan (24 Oct 2026); mock-ups picked (A1 A by default); T1–T7 being built | | Decisions in `docs/milestones/M09-attainment-ai.md`. Formula sign-off: Q-07 |
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
| Q-07 | Attainment formula: target %, level thresholds, CIE:SEE weights, direct/indirect, NBA format? | @client | 07 §4 defaults (60 %; 70/60/50; 0.5/0.5; direct only); SEE is the externals weighted by credits, and one target level for every CO (M09 decisions 1 and 3) | M09 sign-off | Open |
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
| Q-22 | Does CUTM have a GitHub organization for student repos; private repos allowed? | @client | GitHub App installed on a CUTM org; private repos supported. Meanwhile Aniket's test App on the test server (M07 decision 3, 23 Oct 2026) | M07 setup | Open |
| Q-23 | Are excused absences (medical leave) from assessments needed? | @client | No; missed = 0 (A-14) | — | Open |
| Q-24 | Retention period for proctoring snapshots | @client | 90 days after results (A-13) | — | Open |
| Q-25 | (a) Live engine — **decided by dev 12 Oct 2026: self-hosted LiveKit** (ADR-18); confirm with the client that this satisfies LIV-02 "reuse the previous solution". (b) The recruitment platform's compiler service: technology and repository access | @dev (Aniket) | (a) LiveKit; (b) Judge0 CE reference adapter | M05 adapter choice | (a) Decided · (b) Answered for now 18 Oct 2026 (Aniket): Judge0, on its free public server until the university's own (Q-55) |
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
| Q-41 | How do assessments map to the policy's parts — Mid-term I (online), Mid-term II (presentation), assignment, attendance points from M03, the practice and project rubrics — and who enters the external practice and project marks? | @client / @dev | — | — | Answered 23 Oct 2026 (Aniket, M06): each assessment picks the theory part it counts toward; several in one part count by the mean of their percentages; the teacher fills the practice and project rubrics on the Marks tab; external marks come from the exam section's CSV (M08). 07 §2 |
| Q-42 | What must the LMS do with the 75 % attendance minimum: show it, or produce an eligibility list? | @client | Stored only | M06, M08 | Open |
| Q-43 | Programmes with fewer than 12 POs (MBA, BBA, M.Sc): may codes stay unused? Who supplies non-engineering PO titles? (Agriculture pages carry their own) | @client | An untitled code shows the code itself; since M09 the AI is not asked about it (M09 decision 2), so a programme's PO titles matter for "Suggest levels" | M09 | Open |
| Q-44 | Who maintains the course-list CSV after the first load, and how do the repository's "programme + stream" values map to LMS programmes? The 2021 repository spells one programme several ways (BTech / B.Tech / B Tech; M.Sc / MSc; B.Sc / B.Sc. / B.SC) and lists courses open to all under "All", "CUTM" and "MOOC"; converted as written it gives 39 programmes | @client | Converted once by the developer; admins keep that CSV | — | Open |
| Q-45 | Are Certificate, Advanced certificate and Diploma courses credit-bearing? Which courses are 0-0-0? | @client | The credits in the course list decide | — | Open |
| Q-46 | Should courseware session links (YouTube, slides) become lesson links? | @client | Not imported (backlog) | — | Open |
| Q-47 | An offering's department comes from the batch's programme, so a Mathematics HoD does not see maths taught to B.Tech CSE. Acceptable? | @dev | As described (A-56) | — | Open |
| Q-48 | Is the courseware "Faculty" the course coordinator? | @client | Prefilled only when exactly one faculty member has that name | — | Open |
| Q-49 | A courseware page with no course code is matched only by a title that exactly one catalogue course has; 49 of the first 264 live pages had neither, so no import can reach them. Should an admin be able to attach a page to a course by hand, or will CUTM add codes to those pages? | @client / @dev | Not built; the run lists each such page | — | Open |
| Q-50 | LiveKit closes a room about 20 s after its last participant leaves and then sends `room_finished`. Should that end a class before its scheduled end? | @dev | No: before `scheduledEnd` the class stays live and the room is created again when someone rejoins; at or after it, the class ends then. The teacher's End button and the hourly sweep end the rest | — | Open |
| Q-51 | May a teacher change live-class attendance after the offering's marks are locked (05 §3.8 lists what the lock freezes; attendance is not on it, but it feeds the theory attendance part, 07 §2)? | @client / @dev | Allowed; every change is audited | M06, M08 | Open |
| Q-52 | A presence list keeps the last 50 connections (`$slice: -50`); a student whose connection drops more than 50 times in one class loses the earliest intervals. Acceptable? | @dev | Yes | — | Open |
| Q-53 | The syllabus PDF opens for admins and for whoever teaches, oversees or studies an offering of the course (`reach` in `/api/files`), so a coordinator who teaches none of its offerings cannot open the PDF they uploaded. Should every staff member who can open the catalogue course open its PDF? | @dev | As built in M01b (offerings only) | — | Answered 17 Oct 2026 (@dev, at Aniket's request): yes — admins, HoDs and faculty open it; a student only for a course they study (`/api/files`) |
| Q-57 | Mock-up C7, as picked, prints two signature lines on a test's certificate: the test's owner (with their department) and "Controller of Examinations, Centurion University". Should the Controller of Examinations appear on certificates for every test (including course quizzes and recruitment tests), or only the owner? There are no signature images either way | @client | Both, as in the mock-up | TP-12's certificate wording | Open |
| Q-56 | TP-10 asks the AI to "suggest a mark band for written and code answers", which means sending students' answers (without names, roll numbers or emails) to the AI; 09 §12 says answers are never sent. Should anonymous answer text be sent for these suggestions? | @client | Not built: the AI only drafts questions (no student data) | TP-10's mark-band suggestion | Open |
| Q-55 | Code questions run on Judge0's free public server (ce.judge0.com) until the university has its own: students' code goes to a third party, and its rate limits are not ours. Before going public, which Judge0 server and token (or a paid key) should be used? | @client | The free public server (Aniket, 18 Oct 2026) | Going public | Open |
| Q-54 | Camera snapshots are deleted `snapshotRetentionDays` after a test's results are published (05 §8). A test whose results are never published keeps them. Should they also go a set time after the test closes? | @client | Kept until results are published, then the retention period | — | Open |
| Q-58 | Most CUTM classes are in person. Should the theory attendance part (5 marks) come only from attendance recorded in the LMS — live classes, and in-person classes a teacher records as manual-attendance classes — or will attendance come from another system? | @client | LMS attendance only (A-162) | — | Open |
| Q-59 | The file for the exam section shows internal marks at 2 dp (28.53), but a grade sheet adds the unrounded internal (28.5333…) to the external mark, since 07 §1 rounds only once, at the course percentage. A component total can then differ from the exam section's own sum in the second decimal. Should grade sheets use the 2 dp internal the exam section saw? | @client / @dev | Unrounded (07 §1) | — | Open |
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
| A-79 | Every list shows ten rows a page | list redesign | — |
| A-80 | The number tiles above a list count the whole collection, not the filtered rows | list redesign | — |
| A-81 | An offering's cover belongs to the offering, not the catalogue course: the teacher keeps the workspace and many courses have no coordinator | M03b | — |
| A-82 | A lesson's video can be replaced only while no student has progress on it; otherwise the teacher adds a new lesson | M03b | — |
| A-83 | An offering holds at most 1,000 enrolments, active and dropped together, so the roster search is bounded | M03b | — |
| A-84 | The coverage chart shows each PO's average level over the COs linked to it, not over all COs; it describes the mapping and is not an attainment value | M03b | — |
| A-85 | Deleting a CO is allowed while offering calendars tag it: the tags go with it. Until M04 nothing else referred to a CO; since M04 a CO that a question is tagged with cannot be deleted (05 §3.6) | M03b | — |
| A-86 | Students see the Syllabus and Outcomes tabs in full, the mapping and coverage chart included, read only | M03b | — |
| A-87 | A replaced or removed syllabus PDF is deleted from storage (M01b kept it) | M03b | — |
| A-88 | An admin joins a class as host (the same room rights as its teacher, under their own name), not as a hidden observer | M03b | Aniket |
| A-89 | Only a class that never ran (cancelled, or not held by its end) and has no attendance row can be deleted; a class still ahead is cancelled first, so its students are told | M03b | — |
| A-90 | Restoring a cancelled class tells students as a change (`live.changed`) and is not audited, as cancelling is not | M03b | — |
| A-91 | "Below the minimum" counts active students of a credit course by their finished live classes against the offering's own policy `attendanceMinPct` (75 % by default); a student with no finished class is not counted | M03b | — |
| A-92 | Dropping a student and adding them again keeps their progress and attendance rows; both are refused once marks are locked | M03b | — |
| A-93 | A raised hand is set and cleared by the server (LiveKit participant attribute), never by the browser, so a student cannot rename themselves or change another's hand; teachers do not raise hands | M03b | — |
| A-94 | The order of raised hands is the server's time of raising; it is not stored after the class | M03b | — |
| A-95 | Chat and reactions are turned off for students together: LiveKit has one permission for a participant's data messages. The switch says "chat messages and reactions" | M03c | — |
| A-96 | Hosts remove students only; a host may mute another host. "Mute everyone" mutes everyone in the room but the host who asked, other hosts too, as in Google Meet | M03c | — |
| A-97 | What students may do is not audited (it changes no record); removing a student and letting them back are (`live.removed`, `live.allowed_back`). Students see only their own controls disabled, never who was removed | M03c | — |
| A-98 | Join tokens live 10 minutes (M03: until 2 h after the scheduled end); LiveKit renews them while connected and Rejoin reloads the page | M03c | — |
| A-99 | Layout, pins and the view options are the viewer's own and last as long as the tab; nothing is remembered | M03c | — |
| A-100 | At most 100 people can be removed from one class (`MAX_REMOVED`), so the removed list stays a bounded read | M03c | — |
| A-101 | The join sound rings for hosts by default and for students only if they turn it on (a late student joining should not ring through a lecture); at most once in 2 s; the choice lasts as long as the tab | M03c | — |
| A-102 | An offering holds at most 200 assessments (`createAssessment` refuses the 201st), so its lists and the Records grid are bounded reads | M04 | — |
| A-103 | Results are published only after the assessment closes (`lateUntil ?? closesAt`), when every running attempt has expired; `publishResults` hands those in first | M04 | — |
| A-104 | An attempt the system hands in (time up, the sweep) gets `submittedAt = deadlineAt`, so a sweep that runs later does not flag it late | M04 | — |
| A-105 | Home's "Due soon" lists assessments open now, closing within seven days, that the student has not handed in (at most five) | M04 | — |
| A-106 | A skill course's "Quiz average %" is the mean of each published quiz's counted percentage, a quiz not attempted counting as 0 | M04 | Q-02 |
| A-107 | The New assessment dialog asks only for the type, title and window; time limit, attempts and shuffling start from the type's typical settings and are changed in the builder | M04 | — |
| A-108 | A question's options get new ids each time it is saved, which is allowed only before any student starts | M04 | — |
| A-109 | Guests take only standalone tests. A course's assessment has only "this class" links, which take enrolled students to it and let no one else in | M04b | — |
| A-110 | Someone a link let in keeps their way back through it after it is turned off, expires or fills up, and after the test closes (to finish or read results); a returning guest asks for a new code on the link's page | M04b | — |
| A-111 | An email that belongs to an LMS account cannot register as a guest or sign in by code; it signs in with its password on the link's page | M04b | — |
| A-112 | A link someone joined through is never deleted, only turned off (it records how they got in); a draft's links go with the draft | M04b | — |
| A-113 | Until proctoring (phase C) the lobby checks the browser (cookies) and the connection (under 600 ms good; slower warns but does not stop Start) | M04b | — |
| A-114 | Accepting the rules is a required checkbox in the Start form, checked by the browser and not stored; phase C records it with the proctoring consent | M04b | — |
| A-115 | Faculty and admins make standalone tests; a head of department has no view of a colleague's standalone tests | M04b | — |
| A-116 | A link's access code is kept readable so its owner can pass it on again; it is compared in constant time | M04b | — |
| A-117 | Negative marks never take an attempt's total below 0 (a question's own score can be negative) | M04b | — |
| A-118 | A section draws only automatically marked questions from the bank, each worth the section's marks (a rubric could not follow a changed mark) | M04b | — |
| A-119 | A course's bank belongs to the catalogue course: every offering and term shares it; whoever teaches any offering of it edits it, a head of department reads it. A standalone test draws from its owners' own banks | M04b | — |
| A-120 | A bank holds at most 5,000 questions; a CSV adds at most 500 and carries one answer, several answers, true or false, number and written answer (the other types are added in the dialog) | M04b | — |
| A-121 | "Time per question" (TP-07) is the time spent on each question, recorded in whole seconds and shown to graders; there is no time limit per question | M04b | — |
| A-122 | Extra time is per test and per person (by email or roll number, at most 200 people), lengthens both the time limit and the end of hand-ins, and reaches a running attempt at once | M04b | — |
| A-123 | A matching question pairs each left side with one right side; an ordering question never moved is unanswered (0 marks); a fill-in-the-blank ignores case and extra spaces | M04b | — |
| A-124 | Explanations are kept with questions and shown to graders now; takers see them with results once phase E's release rules allow | M04b | — |
| A-125 | The N-th serious warning hands the attempt in (mock-up B4: "warning 2 of 3 … at the third"), not violation N + 1 as 07 §15 said for M05; 0 only records | M04b | — |
| A-126 | Serious: leaving full screen, leaving the page (hidden, or the window losing focus — not to a file chooser), a second tab or device. Minor: copy, paste, right-click, print, developer-tools keys, a lost connection, the camera off. Two serious ones within 3 s are one act and count once | M04b | Q-09 |
| A-127 | A second tab or device is refused while the first was heard from in the last 45 s, recorded once per refused tab, and takes over after 45 s of silence. A reload keeps its tab's id; a browser's "Duplicate tab" copies it, so a duplicated tab is not caught | M04b | — |
| A-128 | A lost connection is more than 60 s between beats; it is minor and recorded with its length | M04b | — |
| A-129 | The penalty is per counted serious warning and comes off the total (never below 0) when it is handed in, graded or waived; proctoring is fixed once anyone has started, so it never changes under a hand-in | M04b | — |
| A-130 | Every attempt beats every 15 s, proctored or not, so the monitor's last seen, added time and messages work for every test. The monitor lists running attempts in the order they started, a page at a time, and refreshes every 15 s | M04b | — |
| A-131 | Snapshots are 320 × 240 JPEG stills at the test's interval, at most 240 an attempt; the taker sees their camera in a corner; one that fails to upload is skipped, not retried | M04b | Q-24 |
| A-132 | "Late" means after the closing time plus the person's extra time and the minutes the monitor added (phase B counted only the closing time, so a hand-in inside extra time showed as late) | M04b | — |
| A-133 | Monitor messages reach running attempts only; each keeps the newest 20, and the runner shows the newest unread one until the taker presses OK (remembered on that device) | M04b | — |
| A-134 | With full screen required, a browser that cannot go full screen (Safari on iPhone) cannot take the test; the lobby's device check and the runner say so | M04b | — |
| A-135 | The snapshot retention setting accepts 7–365 days | M04b | Q-24 |
| A-136 | Code questions belong to the coding modes: a coding test (objective, written and code), a lab test (also uploads) and a coding competition (code only). Quizzes and written tests keep their types, as code is marked after hand-in | M04b | — |
| A-137 | Until the university runs its own Judge0, code runs on Judge0's free public server (Aniket's choice, 18 Oct 2026); the e2e run uses a stand-in so CI never depends on it | M04b | Q-55 |
| A-138 | The default languages are C, C++ and Java (LAB-02); Python and others are added in the codeRunner setting (LAB-06 is a "Could") | M04b | — |
| A-139 | A question's run limit counts runs of its visible tests in one attempt (1–30, 10 by default), on top of the 3 s wait and 200 runs an hour; untouched starter code is not an answer | M04b | — |
| A-140 | A hand-in with code questions shows "To grade" until the gradeCode job marks them, in seconds. A grader's own mark on a code question stays when the tests run again, and an empty mark box keeps the tests' mark | M04b | — |
| A-141 | "Run sample tests" waits for the runner in the request (a few seconds), as M05 planned; the full marking runs in the worker | M04b | — |
| A-142 | Tests are stored with \n line ends; memory is asked in MB and stored as MB × 1000 KB, as Judge0 takes it | M04b | — |
| A-143 | Results are worked out over each taker's counted attempt; ranks are competition ranks (1, 2, 2, 4); the percentile is those below plus half of those level | M04b | — |
| A-144 | Results go out by hand (the default, as M04), by themselves within the hour after the test closes once nobody is writing and all is marked, or each person's at once when marked (ranks wait for the published results). The rule changes no mark, so it can change at any time; an automatic release is audited in the name of whoever saved the rule | M04b | — |
| A-145 | Item analysis: "correct" is the share who earned full marks; discrimination is the upper-minus-lower 27 % index, shown only with 10 or more takers; a question is "to look at" when under 20 % or over 90 % correct, or its discrimination is under 0.2 | M04b | — |
| A-146 | Alike answers: the test's own written and code questions only, at most 600 answers each, 20 tokens or more, three-token shingles with Jaccard ≥ 0.85; a flag for a teacher, never a mark (Q-09) | M04b | Q-09 |
| A-147 | The leaderboard is off by default; on, it names the first 10 to everyone who took the test | M04b | — |
| A-148 | Ranks and analysis are worked out when results go out, again after a regrade, waived penalty or code re-run, and on request — not live while people write | M04b | — |
| A-149 | Certificates are opt-in per test, from a percentage the teacher sets in the Results dialog; one is earned by a counted attempt at or above it and states that attempt's percentage, the rating band and, once results are published, the rank | M04b | Q-57 |
| A-150 | The PDFs use the built-in Helvetica and Times, so text outside Windows-1252 prints as "?" (a name in Odia or Devanagari script would); student records hold names in Latin script. Printing other scripts needs an embedded Unicode font | M04b | — |
| A-151 | A taker's scorecard or certificate is current while it was asked for after the attempt, the test and (once published) the ranks last changed; otherwise the page offers to make it again. The staff's files stay downloadable with the time they were made, and the staff make them again by hand | M04b | — |
| A-152 | TP-12 says "emailed or downloaded": the files are downloaded from the page; nothing is emailed (the mail adapter sends no attachments) | M04b | — |
| A-153 | The Excel export has one row per taker — their counted attempt, or their latest unmarked one when none is marked — ranked as 07 §19, with section totals and a column per question of the test's own (drawn bank questions count only in section totals); times are IST text. Its Questions sheet appears once the analysis has been worked out | M04b | — |
| A-154 | The reports PDF has a report for every hand-in (every attempt), by name, with no size cap (the worker streams it); heads of department may make both staff files, as they read the results | M04b | — |
| A-155 | A person may ask for 10 files an hour; a file still being made after 10 minutes may be asked for again | M04b | — |
| A-156 | The certificate check `/v/<code>` shows the record as it is now, and says "No longer valid" when a later regrade took the result below the threshold | M04b | — |
| A-157 | The AI drafts bank questions from a topic, how many (1–20), one of the five types a CSV row can carry, a level and the course's outcomes the teacher picks, with keys and explanations; each draft is worth 1 mark with no negative marks until the teacher changes it | M04b | — |
| A-158 | A draft is checked as an imported CSV row is; one that fails is dropped, outcome codes the teacher did not pick are dropped, and the notice says how many were kept | M04b | — |
| A-159 | Saving an AI draft in its dialog is its review and accepts it; a draft is discarded with ⋮ Delete. Drafts count toward the bank's 5,000 but not toward its other counts | M04b | — |
| A-160 | A draft request is tried once, never retried by itself, so drafts are never saved twice; the teacher is told how it went, a failure included | M04b | — |
| A-161 | "Mixed" asks for about 30 % easy, 45 % medium and 25 % hard (mock-up C2), and each draft keeps the level the AI gave it. The AI is OpenAI's (Aniket, 18 Oct 2026, for cost); the model is the `OPENAI_MODEL` setting, by default `gpt-5.4-mini` | M04b | — |
| A-162 | The theory attendance part comes from the student's finalized LMS live classes only (A-72); an in-person class counts when its teacher records it as a manual-attendance class | M06 | Q-58 |
| A-163 | A theory part with nothing counting toward it, or attendance with no class held, leaves the theory internal open (null), never 0; only a missed assessment counts 0 (A-14) | M06 | Q-41 |
| A-164 | The trend runs over every published result of the offering, whether it counts toward a part or not, so practice quizzes show in it | M06 | — |
| A-165 | A new assessment counts toward nothing until the teacher picks a part; the choice stays open after students start, until marks are locked | M06 | — |
| A-166 | Rubric criteria take up to two decimals; a blank box leaves that criterion, and so the component, open | M06 | — |
| A-167 | The lab-record average beside Record is the mean of the student's published lab records (a missed one 0), shown for the teacher's reference and never entered for them | M06 | — |
| A-168 | The CE report opens on the current term (else the newest by code) and lists credit offerings that are not drafts; its average internal is over students whose marks are complete | M06 | — |
| A-169 | A head of department whose account has no department sees an empty CE report | M06 | — |
| A-170 | Only students see the GitHub card on their profile: commits count for team members, and teachers neither commit to team repositories nor need an account linked | M07 | — |
| A-171 | The Integrations page lists each queue's latest 20 jobs that ran out of tries; older ones stay in Redis until BullMQ removes them | M07 | — |
| A-172 | A student of another batch enrolled in a batch's course travels in that batch's file (rows are matched through the course's batch); their grade sheet is worked out with their own batch and holds every credit course they take that term | M08 | — |
| A-173 | "Lock the complete courses" sends every unlocked credit course of the batch (at most 50) to the worker, which locks those whose marks prove complete and lists the rest; nothing is picked by hand | M08 | — |
| A-174 | Unpublishing tells students nothing; their Results simply stop showing the sheet | M08 | — |
| A-175 | A student with no credit course in the term gets no grade sheet; working the sheets out again removes an earlier unpublished one | M08 | — |
| A-176 | The batch page counts complete students from the internal marks last worked out; a course whose marks were never worked out shows everyone incomplete until locking works them out | M08 | — |
| A-177 | The internal-marks export rounds each internal to 2 dp; grade sheets use the unrounded value | M08 | Q-59 |
| A-178 | CIE reads each counted attempt's own paper, as the student's "By outcome" does: a negative question mark counts 0, and the proctoring penalty, which belongs to no question, is left out | M09 | Q-07 |
| A-179 | A missed assessment counts 0 toward its fixed questions' COs and each draw's CO filter (count × marks each); a draw without a CO filter adds nothing for the student who missed it | M09 | Q-07 |
| A-180 | A CO's CIE % is over the students assessed on it (some question on their paper, or in the assessment they missed, carries it), not every enrolled student | M09 | Q-07 |
| A-181 | Attainment is worked out for locked offerings too. A record keeps the map and settings it used; editing the catalogue map recomputes only active offerings, so a completed course's record stands until its marks change or someone works it out again | M09 | — |
| A-182 | In the programme report a course taught in several sections counts once, as the mean of its sections' values | M09 | Q-07 |
| A-183 | Practice rubric marks and project reviews carry no CO tags and do not feed CO attainment; only assessment questions do | M09 | Q-07 |
| A-184 | A test released "each person's at once" counts toward attainment once a teacher publishes its results (A-20) | M09 | — |
| A-185 | A meeting is its people's: admins do not reach a meeting they are not invited to (they do reach every class) | M03c | — |
| A-186 | Co-hosts are staff; people from the LMS are staff or students the scheduler can already see (09 §3); a guest is any email address, even one that belongs to an LMS account (they then come in as a guest) | M03c | — |
| A-187 | Letting a guest in or turning them away is not audited (it changes no record), like what students may do (A-97); removing and letting back are | M03c | — |
| A-188 | A guest let in comes straight back while the meeting runs; one turned away may ask again; the lobby holds at most the meeting's 20 guests | M03c | — |
| A-189 | An invitation's calendar file names only its recipient and asks for no reply (`RSVP=FALSE`): Gmail and Outlook still show Yes · Maybe · No, but the LMS collects no answers | M03c | — |
| A-190 | Someone without the role a room action needs meets 404, as with the course's host-only actions (T1–T3's actions answered a student FORBIDDEN before they moved to the session) | M03c | — |
| A-191 | The guest lobby's camera check is M04b's device check (browser, connection, camera) in its white card, not the bare video tile drawn in R2-C | M03c | — |
| A-192 | A meeting lasts at most 6 hours and ends on the day it starts (IST), as the dialog asks for one date | M03c | — |
| A-193 | Recordings are kept with their class or meeting; nobody can delete one yet | M03c | — |
| A-194 | A recording is the room as Egress's speaker layout shows it: whoever speaks large, the others small, a shared screen filling the frame | M03c | — |
| A-195 | A class's recording plays for everyone who opens the class page (its students, teachers, the department's head, admins); a meeting's for its hosts and members, not its guests, who have no page | M03c | — |
| A-196 | One poll is open at a time in a class or meeting | M03c | — |
| A-197 | Guests do not take part in polls: an answer is kept per LMS account | M03c | — |
| A-198 | Who answered what is never shown, in the room or after (01 §4 keeps poll analytics out); the counts stay with the session. The mock-up's "who answered what is on the class page" is not built | M03c | — |
| A-199 | Hosts see the counts by their page reading the polls again every 3 s while one is open, not by a message per answer | M03c | — |
| A-200 | Breakout rooms take the people in the room when a host opens them; people who join later stay in the main room | M03c | — |
| A-201 | Guests stay in the main room while breakout rooms are open: moving needs a token, which their link alone does not give | M03c | — |
| A-202 | Hands, host controls, polls and recording belong to the main room: in a breakout room there are chat, reactions and the people | M03c | — |
| A-203 | The setup deals people into rooms in turn in the order they appear; Shuffle mixes them at random; each can then be moved by hand | M03c | — |
| A-204 | The whiteboard is not stored and has no export; it lives in the browsers in the room. A host who reloads with no other host there starts from a blank board, while the others keep theirs | M03c | — |
| A-205 | Drawing needs the data permission: when a host turns off chat and reactions, the others cannot draw either | M03c | — |
| A-206 | Pictures cannot be put on the whiteboard (their files would have to reach everyone) | M03c | — |
| A-207 | Excalidraw's Chinese font (Xiaolai, 12 MB) is not served; Chinese text on the board uses a system font | M03c | — |
| A-208 | Captions are in English (India), the recogniser's `en-IN` | M03c | — |
| A-209 | Each person turns captions on for themselves (CC); a host's captions also show in their own strip, as "You" | M03c | — |
| A-210 | Blur is offered on every browser; one that cannot run it says so when it is chosen, rather than the option being hidden | M03c | — |
| A-211 | The blur choice lasts as long as the tab, like the layout (A-99) | M03c | — |
| A-212 | Moving between a class or meeting and its breakout rooms keeps one's camera, microphone and blur as they were; the layout, pins, captions and panel start afresh in each room | M03c | — |
| A-213 | "Deploy it", after the fields round, is taken as the recommended picks: F1 A (one field, like Google Calendar) and F2–F6 as drawn | fields round | — |
| A-214 | A value that is not added (not an email or a domain, matching nobody, too long, over the most) stays in the box with a message saying why, rather than becoming a red chip as F2 drew it: nothing invalid is ever a chip | fields round | — |
| A-215 | The meeting's people field matches a pasted email or roll number exactly; an email that is nobody the viewer may invite becomes a guest (A-186), and anything else that matches nobody is reported | fields round | — |
| A-216 | A drawn section names at most 10 topics, since the stored list holds 400 characters; the bank's 100 most used topics are suggested | fields round | — |
| A-217 | An offering's faculty are found among faculty accounts of every department, the viewer included | fields round | — |
| A-218 | M09's A1 is variant A, attainment first on the Outcomes tab, since Aniket asked for the build without picking (as with M03c's R3-B) | M09 | — |

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

Every push to `main` on GitHub deploys itself: `cutm-lms-deploy.timer` runs `/usr/local/bin/cutm-lms-deploy` (server only, not in the repository) about once a minute. It fetches `main` into a bare clone at `/opt/cutm-lms/repo` over HTTPS (the repository is public, so no key is involved) and, when the commit differs from the running release, runs `npm ci`, `npm run build` and `scripts/sync-indexes.ts` in `releases/<commit>` while the old release keeps serving, then points `current` at it and restarts the worker, then the web. If `/api/health` does not answer within 60 s it points `current` back and restarts again. A commit that fails is written to `/opt/cutm-lms/failed` and not retried until a newer commit arrives (or the file is deleted). The three newest releases are kept. Log: `journalctl -u cutm-lms-deploy`. It does not wait for CI, and a deploy restarts the web for a few seconds.

**Created** (*changed*) — this entry. Nothing in the repository changed for the deployment.

**Not done** — The S3 key is the shared gttech key, which can also read and write the other projects' prefixes; an IAM user limited to the LMS prefixes should replace it before real student files arrive. No backups (11 §6) or monitoring (11 §7). No Dockerfile: the build was made on the server with `npm ci` and `npm run build`, which 11 §5 replaces in M11.

**Assumptions** — A-77: Redis 8.0.6 (Ubuntu's package) instead of the pinned 8.6 is acceptable for a test server; BullMQ and the rate limiter use nothing newer.

**Open questions** — none new; Q-12 still decides production.

**Verification** — `GET https://lms.devsomeware.com/api/health` → `{"ok":true,"mongo":"up","redis":"up"}`; `/login` 200; `/home` signed out → 307 to `/login`; `http://` → 308 to `https://`; response headers include HSTS, `frame-ancestors 'none'` and `nosniff`. Playwright from the developer Mac: `hod@seed.cutm.test` with the seed password lands on `/home`, cookie `lms_session` is `Secure`, `HttpOnly`, `SameSite=Lax`; `/courses` lists 6 courses and CUTM1019's page returns 200. The rate-limit key in Redis carries the Mac's public address, not 127.0.0.1. Worker log: `worker started` with queues `mail, media, sync, compute`. `scripts/sync-indexes.ts` against Atlas → `indexes ensured` for every collection; Uploads are served from the bucket's own origin, `gttech-assests.s3.ap-south-1.amazonaws.com`, never the app's (09 §5): links from `presignUpload` and `presignDownload`, run with the server's `app.env` and with the developer's `.env.local` → PUT 200, GET 200 with the uploaded text and `content-disposition: inline; filename="check.txt"`, `deleteObjects` → GET 404. (A first setup on a local RustFS behind `files.devsomeware.com` passed the same checks plus a cross-origin `fetch` from an `https://lms.devsomeware.com` page and a 403 for a PUT link reused with another `Content-Type`; it was then stopped and removed from Caddy.) Auto-deploy: `systemctl start cutm-lms-deploy` with `main` at `9eb5bd9` and `67c5310` running → built, indexes synced, health passed, `current` → `releases/9eb5bd9`, in 73 s (peak 2.4 GB memory with 406 MB swap); the live `/login` then served the new sign-in photo. Run again with nothing new → exit 0 without building. The timer's runs in the journal are about 70 s apart. A live class and a lesson upload through the UI were not walked on the deployed app.

### 2026-10-16 · Sign-in screens redesigned after a reference · Cursor (AI agent), at Aniket's request

Aniket supplied a reference sign-in design (a form beside a large rounded photo with floating cards) and asked for the sign-in page in that style, in the product palette, full screen, with generated assets and smoother, more premium motion. The `(auth)` layout now fills the screen: the left column is a new `.auth-wash` (page grey warmed by flame gold) with the lockup and “Centurion LMS” on it, a centred form with white pill fields and a primary pill button, and the university's name at the foot; from 1024 px the right column is `AuthStage`, a generated photo of students pinned to the viewport with three floating feature cards, each with a generated 3D icon. Forgot password and set password share the layout and got the same heading and field style. The reference's Apple/Google buttons and sign-up link are left out: SSO is out of scope (01 §4) and the university creates accounts.

Motion: the cards used to render visible, vanish when GSAP took over, then animate in, and the full-screen gradient animated `background-position` (a repaint every frame). The cards are now hidden by CSS (`motion-safe:invisible`) until GSAP fades them in once, the drift starts only after the entrance, and the background is static; the `aurora` keyframes are removed.

**Created** (*changed*) — `public/auth/students.jpg`, `public/auth/icon-courses.jpg`, `public/auth/icon-shield.jpg`, `public/auth/icon-marks.jpg` (generated images, no real people); *changed* `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, `components/auth-stage.tsx`, `components/action-form.tsx` (`fullWidth` is a 48 px pill; used only by the auth forms), `app/globals.css` (`.auth-wash`; the profile banner's blue gradient renamed `.brand-aurora`; `aurora` keyframes removed), `app/(app)/profile/page.tsx` (class rename); *deleted* `public/brand/lotus.svg` (no longer used); 08 §1, §4, §5.2 (`AuthStage`), 04 §6.8 snippet, 03 (`gsap` row).

**Not done** — The photo is 864 × 1152, so it is slightly soft on a 2× display at panel widths above ~430 px; a larger render or a licensed campus photo can replace `public/auth/students.jpg` with no code change.

**Assumptions** — A-78: generated imagery (students, icons) is acceptable on the sign-in screens until CUTM supplies campus photography.

**Open questions** — none.

**Verification** — `npm run check` → lint and typecheck clean, `Tests 258 passed`. `npm run build` → compiled; the standalone build served on port 3101 and captured with Playwright at 1920, 1440, 1280, 1024 and 390 px: `/login`, `/forgot-password` and `/reset-password?token=x` render, `scrollWidth` equals the viewport at every width. Card opacity sampled every 100 ms after load: each card stays at 0 until hydration, rises once to 1 by 1.4 s, never dips; with `reducedMotion: reduce` all three are visible with no animation. Signing in through the new form was not walked (the form, field names and action are unchanged). The running `next dev` kept serving the old `globals.css` rule after the edit; restarting it picks up the change.

### 2026-10-17 · Sidebar items on icon chips · Claude Code, at Aniket's request

Aniket said the sidebar looked bad: every item was a grey pill 8 px from the next, the open Structure item was a solid blue block, and its pages hung off a faint line that started mid-air, so nothing marked the page actually open. Four flat versions were mocked up as static HTML in the agent's scratchpad (quiet rows, a grey block around the open section, tidied grey pills, icon chips) and he chose “D · Icon chips”.

**Created** (*changed*)
- `components/app-nav.tsx`: rows have no fill (grey on hover) and sit 2 px apart; each icon is on a 32 px `bg-sidebar-accent` chip that darkens on hover and is solid primary, with a semibold label, for the current item. Structure has a caret, pointing right when closed and down while one of its pages is current; its pages are plain text rows aligned with its label, with no guide line, the current one primary and semibold. The foot group (Profile, Sign out) uses the same rows, so the `PILL`/`PLAIN` split is gone. On the collapsed rail the chip fills the primitive's 32 px square.
- 08 §3 (sidebar item look; TabNav no longer says “as in the sidebar”).

**Verification** — `tsc --noEmit` and eslint on `components/app-nav.tsx` clean; Prettier applied. On the running `next dev`, signed in with Playwright as `admin@seed.cutm.test` at 1280 px: `/admin/departments` (Structure open, Departments current), hovering Offerings, `/home` (Dashboard current, Structure closed) and the collapsed rail were screenshotted and reviewed. The test suite and the e2e specs were not run; the e2e locator `getByRole('link', { name: 'Structure', exact: true })` still matches, since the chip and caret carry no text.

### 2026-10-17 · Course cards with a cover and progress · Claude Code, at Aniket's request

Aniket supplied a reference (an e-learning dashboard whose course cards have a thumbnail, tag chips, a progress bar with a percentage, duration and lesson counts, and a Continue button) and asked for course cards like it, "aesthetic and premium". Three versions were mocked up as static HTML from the seed's real courses (cover on top, side thumbnail, full-bleed cover); he chose "A · Cover on top". Courses have no images, so the cover is a flat tone with the course code. The reference's violet is replaced by the product's blue, a new teal and the existing gold. The near-black third tone tried first looked heavy beside the black buttons and became gold.

**Created** (*changed*)
- `lib/data/workspace.ts`: `MyOfferingRow` gains the course's code, title and type, the offering's credits, section and unit count, and `view`. For an offering the viewer is enrolled in (the `offeringAccess` rule), `view` is the lessons they have completed among the published ones, the published count and the video seconds. For one they teach or oversee, it is the active enrolments and whether the course plan is published. Four bounded queries serve a page: courses by id, an enrolment count per offering (`{ offeringId, status }`), a published-lesson count and duration per offering (`{ offeringId, published }`), and the viewer's completed lessons per offering (`{ offeringId, studentId }`, joined to `lessons` by `_id` so a lesson unpublished after completion stops counting, as in `getContent`). A `distinct` on the page's taught ids gives the published plans.
- `components/offering-card.tsx`: rewritten to the design in 08 §5.2; the `featured` prop and the dark card are gone.
- `app/(app)/home/page.tsx`: the offerings row no longer marks its first card.
- `app/globals.css`: `--teal` / `bg-teal`, and the `cover-dots` utility.
- `tests/integration/workspace.test.ts`: a student's row carries the course's parts and counts one of two published lessons (a completed lesson that was later unpublished is left out); the teacher's rows carry the class size and plan state.
- 08 §4 (`--teal`, `cover-dots`), §5.2 (`OfferingCard`), Home.

**Not done** — The seed has no published lessons, so the progress bar with a percentage was checked only through the integration test, not on screen.

**Assumptions** — A cover's tone comes from the sum of the course code's character codes, modulo three: decorative, stable for a course, and not tied to department or type.

**Open questions** — none.

**Verification** — `npm run check` → lint and typecheck clean, `Tests 258 passed`. `npx vitest run --project integration` (with a temporary local Redis) → `15 passed` files, `165 passed` tests, including the new one. `npm run build` compiled; the standalone build on port 3101 was captured with Playwright at 1440 px for `student01`, `faculty1` and `admin` on `/home` and `/courses`, and at 390 px on `/courses` (`scrollWidth` 390 for each). The running `next dev` did not pick up the new `--teal` token until a build; restarting it will.

### 2026-10-17 · List pages in one card, search and filters everywhere, ten rows a page · Claude Code, at Aniket's request

Aniket supplied a reference (a students list: a stats strip, filter pills, a search box and a compact table with avatars and status pills) and asked for the catalogue, programmes, offerings, audit log and users pages to look like it. He said every page's header looked big and blunt, that no list ever showed a next page (each showed 25 and the data fit), and that every list should have a search box and filters. Three versions of the users page were mocked up from the seed's real users; he chose "B · Header inside the card". He also asked why some course cards were completely white: his running `next dev` had not reloaded `app/globals.css` since `--teal` was added (new component classes reached it, theme changes did not, even after a touch), so the teal covers had no colour. Restarting it fixes that; the production build was right.

**Created** (*changed*)
- `components/page-header.tsx`: the header is a white card (icon chip, 18 px title, description, actions) with optional `stats` tiles and `children`, per 08 §5.2. Aniket then enlarged the icon chip to 48 px himself.
- `components/data-table.tsx`: grey header band, striped rows with hairlines, wrapping cells (the vendored cell's `whitespace-nowrap` pushed the offerings' action buttons off the card), `bare` for use inside the header card, and a numbered pager in `PageNav`.
- `components/filter-form.tsx`: the toolbar: search box plus filter pills that apply on change; `plain` unchanged.
- `lib/schemas/common.ts`: `pageSize` 10 (was 25); 04 §2 snippet and 06 §1 updated.
- Search: `listPrograms(page, { q, departmentId, status })` (new text index on programmes' code and name), `listOfferings` and `listMyOfferings` take `q` (new text index on offerings' title); 05 lists both indexes. A word search on users, the catalogue, programmes, offerings and My courses now sorts by text score before the usual order. Without that, "Student 05" matched every "student" and the newest came first, which at ten a page pushed the person searched for to page 2.
- Counts for the tiles: `getUserStats` (users, students, faculty and HoDs counted once, yet to sign in), `getCatalogStats` (courses, active, needing review, without a coordinator), `getOfferingStats` (all, active, draft, completed), `getAuditStats` (entries, today, last seven IST days, people in those days) and `listAuditEntities` (the audit filter's choices, a distinct scan of `{ entity, at }`); `getStructureCounts` also returns batches and programmes without a department. Each count is an estimated count or uses an existing index.
- Pages: `/admin/users`, `/catalog`, `/admin/programs`, `/admin/offerings`, `/admin/audit` rebuilt as one card. The users table shows name over email. The audit log's search is the person's email, its kind-of-record filter lists the entities in the log, its dates are pills, and the record-id and offering-id filters that M01 specifies sit under "More filters". `/courses` has a search box for everyone, with the term and department pills for admins.
- `components/offering-card.tsx`: the card link is named by the offering's full title, so a screen reader announces the course rather than the whole card.
- Tests: integration for the programme search and filters, the offering search and counts, the scoped My courses search, every count function, ranking ("Rankcheck 07" first among twelve), and ten-a-page audit paging; e2e specs search for the seeded offering (earlier runs leave offerings behind) and open page 2 of the roster.
- 08 §1 rule 6, §5.2 (`PageHeader`, `FilterForm`, `DataTable`), §6 List page.

**Not done** — The reference's checkboxes and row "⋮" menus are left out: there are no bulk actions, and rows that have actions (offerings) keep their buttons. Its "last active" column is left out because the LMS does not record activity. No sort control: each list keeps its one order.

**Assumptions** — A-79: ten rows a page for every list. A-80: the tiles count the whole collection, not the filtered list.

**Open questions** — none.

**Verification** — `npm run check` → lint and typecheck clean, `Tests 258 passed`. `npx vitest run --project integration` (temporary local Redis) → `15 passed` files, `172 passed` tests. `npm run db:indexes` against the development database created the two text indexes (additive). `npm run build` compiled; on the standalone build at port 3101, signed in as `admin@seed.cutm.test`, `/admin/users`, `/catalog`, `/admin/programs`, `/admin/offerings`, `/admin/audit`, `/courses`, `/admin/departments` and `/profile` rendered with no error and no horizontal scroll at 1440 px and on `/admin/users` at 390 px; choosing a role reloaded the list with `role=faculty`, and typing "Pradeep" with Enter left one row. `npx playwright test` on the e2e database: `admin-structure.spec.ts` 4/4 and `catalog.spec.ts` 1/1 passed. Three failures need services that were not running locally: the invited-admin test in `auth.spec.ts` (Mailpit), both tests in `content.spec.ts` (file storage for the upload, and Mailpit), and `live.spec.ts` (LiveKit). The live test got through the course search and scheduling before stopping at the video room.

### 2026-10-17 · A generated mark for every page · Cursor

Aniket asked for a unique, professional icon on every page. They follow the sign-in panel's clay marks: royal blue, one gold accent, no text.

**Created**
- `public/icons/*.png` (37): dashboard, courses, catalog, notifications, profile, structure, departments, programmes, diploma, terms, offerings, imports, globe, settings, video, evaluation, attendance, audit, users, badge, overview, plan, lessons, lesson, live, session, people, course, signin, envelope, key, missing, outcomes, mapping, books, baskets, devices
- `components/page-icon.tsx`: `PageIcon`
- `app/(app)/courses/[offeringId]/workspace-mark.tsx`: the offering header's mark follows the open tab

**Changed** — the mark is the page's identity in the sidebar (Structure's children included), `PageHeader` and its count tiles, home, admin cards, section cards (outcomes, syllabus, books, batches, attendance and the rest), lesson types, notification rows, the course workspace header and tabs, and the sign-in, forgot-password, reset-password, error and 404 headings. A generated mark stays on a light chip: the current nav item and course tab use a primary tint, and a hovered card does not fill the chip or put a white square behind the picture. Phosphor stays on buttons and on status actions (disable, sign out).
- 08 §1.5, §3, §5.2

**Not done** — the test suite and a production build were not re-run.

**Assumptions** — A page, its sections and its create dialog share one mark when they name the same thing. A button keeps a Phosphor icon.

**Open questions** — none.

**Verification** — `tsc --noEmit` clean; eslint on the changed TSX clean; Prettier applied. On `next dev`, signed in as `admin@seed.cutm.test`: `/home` shows the dashboard mark beside the greeting and in the sidebar; Structure opens with Departments, Programmes and Terms marks; a programme page shows the basket mark on Baskets; a catalogue course shows readiness, objectives, outcomes, mapping, syllabus, books, session plan and programmes marks, every image loaded (`naturalWidth` 256, none broken); a course overview header and its Overview tab use the overview mark, and the active tab is a light tint. Hovering a home count tile leaves the mark on its light chip (the picture's background stays transparent; the chip does not fill).

### 2026-10-17 · Decision: M03b course workspace redesign · Claude Code, at Aniket's request

Aniket called the course workspace "too ugly, no UI/UX sense". He asked for:
- **Structure:** a structured course builder instead of everything on one page.
- **Actions in view:** edit, delete and add for modules, COs and the CO-PO mapping.
- **Lessons:** video upload, a thumbnail and PDF notes, switched per module.
- **Course plan:** a list with add and edit in dialogs.
- **Live and People:** manual add, edit and delete.
- **Feel:** charts, "character and personality", for every role.

He asked for the design to follow how professional LMSs work. Research covered Udemy's curriculum builder, Canvas modules, Moodle's course page, Teachable, Thinkific, Coursera's player, OBE tools used for NBA, Zoom and Meet attendance, and Canvas People.

He decided four points:
1. Lift the drag-and-drop ban and use dnd-kit, with a keyboard and a Move menu always available.
2. Video thumbnails come from the worker automatically, or he uploads a picture; any lesson takes up to five PDF notes; each offering gets a cover.
3. COs, mapping and syllabus stay with the coordinator and admins (Q-27), now edited inside the workspace.
4. Add Recharts now.

This entry is the written scope approval for milestone M03b (AGENTS law 1). Tasks, rule changes and acceptance criteria are in `docs/milestones/M03b-course-workspace.md`. Mock-ups are shown in four rounds before each part is built. Not built without further approval:
- attendance export;
- announcements (COM-02);
- recurring classes;
- "preview as student";
- creating lessons by dropping several files;
- a month calendar.

A design review found three defects in today's code. Their fixes are part of M03b:
- **Repeated CO code:** `nextCoCode` gives a deleted highest CO's code to the next one (05 §3.6 says codes are never reused).
- **Replaced videos:** the media job id repeats, so a replaced video would never be processed.
- **Deleted COs in calendars:** deleting a CO leaves its id in every offering's calendar.

New assumptions A-81 – A-83. A-79 and A-80 record the list-page entry above, which named them but did not add them to §4.

### 2026-10-17 · M03b/T1–T5 and the design language · Claude Code, at Aniket's request

Built in order (database → backend → frontend), each phase after Aniket picked its mock-ups (picks in the milestone file). Nothing is committed yet: a push to main deploys the test server, so the commits wait for Aniket.

Mid-build Aniket asked for everything to be "slim, sleek and classy" and chose **B · Crisp editorial** from three mock-ups: 6 px corners, hairline cards, a near-black main button, 32 px controls, underlined tabs, status badges as a dot and coloured text, small uppercase table headings. The first build of it also changed the sidebar and header; he asked why, and why the sidebar's pictures were gone. They are back exactly as committed ("D · Icon chips" with the generated marks, the rounded lockup, the round header controls, the rounded page panel at a 12 px base corner). The page panel's round corner no longer turns square while scrolling: the sticky header paints the same quarter-round below it.

**Created**
- T1 lesson media: `lib/models/lesson.ts` (frameKey, thumbKey, attachments), `lib/schemas/{uploads,jobs,content}.ts`, `lib/domain/uploads.ts` (+ test), `worker/jobs/media.ts`, `app/api/files/[...key]/route.ts`, `app/(app)/actions.ts`, `app/(app)/courses/[offeringId]/content/{actions.ts,[lessonId]/page.tsx}`, `lib/data/content.ts`, `components/{file-upload,video-player,lesson-thumb}.tsx`, tests `content`, `media-worker`
- T2 builder: `lib/domain/order.ts` (+ test), `components/{sortable-list,row-menu,form-dialog}.tsx`, `content/page.tsx`, `lib/models/offering.ts` (modules.summary), package `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0
- T3 frame and Overview: `app/(app)/courses/{actions.ts,[offeringId]/layout.tsx,[offeringId]/page.tsx}`, `lib/data/workspace.ts`, `lib/schemas/structure.ts`, `components/{course-cover,date-tile,progress-ring,offering-card}.tsx`; `workspace-mark.tsx` deleted
- T4 plan: `plan/{actions.ts,page.tsx}`, `lib/domain/time.ts` (`istWeekStart`, + test), offering `calendar[].kind`, `plan.changedAt`
- T5 syllabus and outcomes: `lib/models/course.ts` (`coSeq`), `lib/domain/catalog.ts` (`nextCoCode(existing, seq)`, `coNumber`, `mappingCoverage`, `syllabusHours`, + tests), `lib/schemas/structure.ts` (AddCo, UpdateCo, CoRef, SaveCourseModule, CourseModuleRef, ReorderCourseModules, SetSyllabusFile, SaveProjects; SaveCos and SaveSyllabus removed, + tests), `app/(app)/catalog/actions.ts` (addCo, updateCo, deleteCo, saveCourseModule, deleteCourseModule, reorderCourseModules, setSyllabusFile, clearSyllabusFile, saveProjects; saveCos and saveSyllabus removed), `lib/data/courses.ts` (`nextCo`), `components/{course-outcomes,course-syllabus,bar-chart,co-po-matrix,co-po-editor,section}.tsx`, `components/ui/chart.tsx` (shadcn 4.21.4), new routes `courses/[offeringId]/{syllabus,outcomes}/page.tsx`, `catalog/[id]/page.tsx`, packages `recharts` 3.10.1 and `react-is` 19.3.0
- Design language: `app/globals.css`, `components/ui/{button,input,native-select,badge}.tsx`, `components/{tab-nav,page-header,checklist,data-table}.tsx`, a radius sweep over `app/` and `components/`; the shell restored (`components/app-nav.tsx` as committed, `app/(app)/layout.tsx` as committed plus the scoped 12 px corner and the scroll corner)
- Docs: 02 §3.1, 03 §3, 04 §1, 05 §3.6, 07 §17, 08 §1, §5.1, §5.2, 09 §6, the milestone file, this entry
- Tests: `tests/integration/{catalog,courseware-import,content,workspace,media-worker}.test.ts`, `tests/e2e/catalog.spec.ts` (repeatable: a fresh statement, deleted at the end)

**Not done**
- T6 Live, T7 People and T8 (report, acceptance walk) are next.
- 08 §1 and §4 do not yet describe the B design language in words, and 05/06/09 do not yet describe the T1–T4 fields, purposes, cache header and media job; that is the T8 sweep.
- `tests/e2e/content.spec.ts` still drives the old plan form (T4) and has no builder or keyboard-reorder steps; not run.
- `npm run check:bundle` (Recharts only on chart pages) not run.

**Assumptions** — A-84 to A-87 (§4).

**Open questions** — Q-53 (§3).

**Verification**
- `npm run check` → lint clean, typecheck clean, `Tests 278 passed (278)`.
- `npx vitest run --project integration` (temporary local Redis) → `Tests 182 passed (182)`.
- `npx playwright test tests/e2e/catalog.spec.ts` → `1 passed` (the first run failed on a success message that named the next code, which moves on after the refresh; fixed to "Outcome added.").
- `npm run build`; standalone server on the e2e database; screenshots at 1440 px and 390 px as admin, faculty1 and student01 of the Overview, course plan, Syllabus, Outcomes and catalogue course: no page wider than the screen (the editable grid's hidden "Row tools" label widened the page to 687 px until its scroll box was made `relative`).
- Shell: the sidebar, header and page panel compared against the committed version; the panel corner checked at the top and after scrolling 215 px.

### 2026-10-17 · M03b: admins join any live class · Claude Code, at Aniket's request

Aniket asked that an admin can join a live class whenever they want. Until now admins scheduled, started and ended any class but only followed it from outside the room (09 §2).

**Created**
- `lib/data/live.ts`: an admin gets a host token for any class while it is live; `listTodaysLiveSessions` gives an admin the ten classes running now in any course, earliest to end first (index `{ status, scheduledEnd }`).
- `app/(app)/home/page.tsx`: admins get "Today's live classes" too.
- `app/(app)/courses/[offeringId]/live/page.tsx`: the live-now button reads "Go to class" for whoever manages the class; `live/[sessionId]/page.tsx`: the note for those who follow without joining names administrators among those who join.
- `tests/integration/live.test.ts`: an admin's token is a host's and none once the class ends; the HoD still gets none; an admin's Home lists another course's running class.
- Docs: 09 §2, 08 §6 (Home), the milestone (decision 5, Live row).

**Not done** — a university-wide "live now" page: Home shows ten; an admin finds any other class from its course's Live tab.

**Assumptions** — A-88 (§4).

**Open questions** — none.

**Verification** — `npx vitest run --project integration tests/integration/live.test.ts` → `Tests 24 passed (24)`; typecheck and eslint clean on the changed files. Not tried in a browser with a running LiveKit server.

### 2026-10-17 · M03b: a live class in a tab of its own · Claude Code, at Aniket's request

Aniket: the live class "opens inside a box; it should open like Google Meet in a tab". The room was a fixed-height frame inside the class page, under the sidebar, header and course header.

**Created**
- `app/(room)/courses/[offeringId]/live/[sessionId]/room/page.tsx` (new route group without the app shell): the class fills the tab on LiveKit's dark stage, a slim top bar (Live, class and course titles, "End class" for teachers and admins) over the room; before the class a waiting message that refreshes itself, or "Start class"; after it, or for a head of department, a message linking to the class page.
- `components/live-room.tsx`: fills its parent; exports `RoomNotice`; its left, dropped and ended messages sit on the dark stage; takes `classPage`.
- `app/(app)/courses/[offeringId]/live/[sessionId]/page.tsx`: "The class is live" with Join class (new tab) in place of the embedded room; the waiting card says Join class appears when the class starts.
- `app/(app)/courses/[offeringId]/live/page.tsx`: the live-now card's Join class opens the room in a new tab; staff also get "Attendance" (the class page). `app/(app)/home/page.tsx`: a running class opens its room in a new tab.
- `lib/data/live.ts`: `SessionDetail.offeringTitle` for the top bar.
- `tests/e2e/live.spec.ts`: joins through the new tab for both the teacher and the student; the student's tab says the class has ended and leads to their result.
- Docs: 02 §2 (the `(room)` group), 08 §2 (routes) and §5.2 (`LiveRoom`, `RoomNotice`), the milestone (decision 6).

**Not done** — `tests/e2e/live.spec.ts` not run: it needs a LiveKit server whose webhooks reach this machine.

**Assumptions** — none new.

**Open questions** — none.

**Verification**
- `npm run check` → lint and typecheck clean, `Tests 278 passed (278)`; `npx vitest run --project integration` → `Tests 182 passed (182)`.
- A real class on the dev LiveKit server (`wss://live.devsomeware.com`, from `.env`), with the build on port 3101 and the local e2e database: a test class added to the database; faculty1 opened its class page (Join panel), joined in a new tab (the room filled 1440 × 860 with no scroll), turned the camera on; student01 and, at 390 px, admin joined from their own tabs and all three appeared; the student left and saw "You left the class" with Rejoin; faculty1 ended the class from the room's top bar and the tab showed "This class has ended". The test class was then deleted from the e2e database. Webhooks from that server go to its own deployment, so attendance was not recorded in this run.

### 2026-10-17 · M03b follow-ups: room page in dev, syllabus PDF for staff, e2e specs, chart loading · Claude Code, at Aniket's request

**Created**
- `components/room-notice.tsx` (new): `RoomNotice` moved out of `live-room.tsx`. Aniket's long-running `next dev` rendered the room page with `RoomNotice` undefined (its log: "Element type is invalid … Check the render method of `RoomPage`"), though the production build was right. A server page importing a plain component from a client module gets a client reference; its own server-safe file avoids that.
- `app/api/files/[...key]/route.ts`: every staff member (admin, HoD, faculty) opens a course's syllabus PDF, as they open the catalogue course; a student only for a course they study. Answers Q-53. `tests/integration/content.test.ts` adds a coordinator who teaches no offering.
- `components/bloom-chip.tsx` (new) and `keptBy` in `lib/format.ts`, `EditableCourse` in `lib/data/courses.ts`: moved out of `course-outcomes.tsx`, whose `BarChart` import put Recharts (396 KB) on the course Overview and the Syllabus tab.
- `tests/e2e/content.spec.ts`: rewritten for the builder (add a module, move it up from the keyboard, waiting for each screen-reader announcement, then check after a reload; switch modules; add a video from "Add lesson"; Publish all; the worker's thumbnail) and the plan list (plan text in its dialog; fill from the session plan; add, edit and delete sessions from their menus; publish). `tests/e2e/{content,live}.spec.ts`: the sign-in helper expects the M03b header, whose heading is the course title.
- e2e database: the outcome a failed catalogue run left on CUTM2101 removed.
- Docs: 03 §3 (where Recharts loads), 06 §5 (syllabus downloads), 08 §5.2 (`RoomNotice`, `BloomChip`, `CourseOutcomes`), PROGRESS Q-53.

**Not done** — the two `content.spec.ts` tests stop where this machine has no services: the builder test at the video upload (object storage, port 9000), the plan test at the email check (Mailpit, port 8025). Everything before those steps passes.

**Assumptions** — none new.

**Open questions** — none.

**Verification**
- `npx vitest run --project integration tests/integration/content.test.ts` → `Tests 22 passed (22)`.
- `npx playwright test tests/e2e/content.spec.ts` → the builder test passes the keyboard reorder (and its persistence after a reload) and fails at "· Uploaded" (no storage); the plan test passes every step up to `fetch(Mailpit)` (`TypeError: fetch failed`).
- `npm run build`, then the chunk holding `recharts-wrapper` is listed only by `/(app)/catalog/[id]` and `/(app)/courses/[offeringId]/outcomes`; dnd-kit's only by the catalogue course, Content and Syllabus; LiveKit's only by the room page.

### 2026-10-17 · M03b/T6 Live and T7 People · Claude Code, at Aniket's request

Built to Aniket's round 4 picks ("Live as shown", "People as shown").

**Created**
- T6 actions (`app/(app)/courses/[offeringId]/live/actions.ts`): `restoreSession` (a cancelled class whose start is ahead goes back on; students get `live.changed`), `deleteSession` (only a class that never ran and has no attendance; audited `live.deleted` in one transaction).
- T6 read (`lib/data/live.ts`): upcoming classes include cancelled ones still ahead and page ten at a time (`upcomingTotal`, `?up=`); past classes exclude them; `held` counts the classes that ran.
- T6 page (`live/page.tsx`): no page header; "Upcoming classes" (date tiles, a cancelled class struck through, Start class, Edit, ⋮ cancel / restore / delete) beside "Attendance per class" (a `BarChart` of the share present in each held class of the past page shown, the average and the number held), then past classes with ⋮ (delete a class that never ran). `session-dialog.tsx`: also opens from `?new=schedule`. `components/data-table.tsx`: `PageNav` takes the URL parameter's name. `components/bar-chart.tsx`: hidden-table keys allow two classes on one date.
- T7 invariant: `MAX_ENROLLMENTS` = 1,000 per offering (`lib/schemas/structure.ts`), checked by `createOfferings` (was 5,000), `changeEnrollments` and `addStudent`.
- T7 domain: `shortOfAttendance` in `lib/domain/attendance.ts` (+ test vectors, 07 §10).
- T7 read: `listRoster(offeringId, page, { q, status })` — the offering's enrolments read whole (bounded by the invariant), its students searched by roll number or email from the start or name anywhere, ordered by roll number, with counts (enrolled, active, dropped, below the minimum) and the minimum (`lib/data/workspace.ts`; `escapeRegex` now exported from `lib/data/courses.ts`). `getWorkspace().faculty` carries id, email and whether each teacher coordinates the course.
- T7 actions (`app/(app)/courses/actions.ts`): `addStudent` (roll number as typed or in capitals, or email), `setEnrollmentStatus` (drop / add again); both audited `enrollment.changed` and refused while marks are locked.
- T7 page (`people/page.tsx`): number tiles, search and status filter, the roster with ⋮, "Add student" and "Upload CSV" dialogs that keep the list's search, filter and page, and "Teaching staff".
- Tests: `tests/integration/live.test.ts` (restore, delete, upcoming pager), `tests/integration/offerings.test.ts` (the limit on every path, add, drop and add again, locked, the roster's order, search, filter and counts), `tests/e2e/people.spec.ts` (new), `tests/e2e/live.spec.ts` (heading).
- Docs: 05 §3.9, 06 §8.2, 07 §10, 08 §2 (Live and People rows), 09 §6 (`live.deleted`, `enrollment.changed` sources), §4 A-89 to A-92.

**Not done**
- The Live mock-up's third tile ("below 75 %") is on People, where the per-student figures are; the Live tab shows the average present and the classes held.
- `tests/e2e/live.spec.ts` not run (needs a LiveKit server whose webhooks reach this machine).
- T8: the doc sweep (the B design language in 08 §1 and §4; the T1–T4 fields, upload purposes, cache header and media job in 05, 06 and 09) and the acceptance walk.

**Assumptions** — A-89 to A-92 (§4).

**Open questions** — none.

**Verification**
- `npm run check` → lint and typecheck clean, `Tests 279 passed (279)`; `npx vitest run --project integration` → `Tests 189 passed (189)`.
- `npx playwright test tests/e2e/people.spec.ts` → `1 passed` (the first run caught "Add student" dropping the list's search; fixed).
- Build on port 3101 with the e2e database: Live and People screenshotted as faculty1 at 1440 px and 390 px (no page wider than the screen).

### 2026-10-17 · M03b/T8 Report: doc sweep and acceptance walk · Claude Code, at Aniket's request

**Created**
- Docs: 05 §3.8 (offering `modules[].summary`, `plan.changedAt`, `calendar[].kind` and its order, `coverKey`) and §4.1 (lesson `frameKey`, `thumbKey`, `attachments`, what a delete removes); 06 §3 (`/api/files` cache header), §5 (`lesson-thumb`, `offering-cover`, notes) and §6 (`MediaJob`, its id and conditional writes); 07 §11 (`istWeekStart`) and new §18 (`fileUuid`, `derivedKey`, `frameAtSec`, `isPermutation`, with their vectors); 08 §3 (the workspace frame and its tabs), §4 (the "B · Crisp editorial" language and the shell that keeps its look) and §5.2 (`TabNav`); 09 §5 (picture uploads, the redirect cache).
- `app/(app)/courses/[offeringId]/content/page.tsx`: the student's Resume thumbnail is smaller on a phone (the Lessons tab was 376 px wide at 360 px).

**Acceptance walk** (the criteria in the milestone file; the human walk is still to come)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Keyboard reorder | Pass for modules; lessons by the same component | `tests/e2e/content.spec.ts`: a module moved up from the keyboard, each step announced, still moved after a reload. Lessons: `reorderLessons` integration tests; not walked in a browser |
| 2 | Thumbnails | Partly | Worker integration test takes the frame; `setLessonThumb` / `clearLessonThumb` tests. The e2e "frame within minutes" step needs object storage, absent here |
| 3 | Notes | Pass | Integration: five notes at most; a student gets 404 for an unpublished lesson's frame, thumbnail and notes |
| 4 | CO codes | Pass | Integration: after the highest CO is deleted the next is one higher; its links and calendar tags go in one audited change. `tests/e2e/catalog.spec.ts` deletes from the row menu and sees the next code |
| 5 | Plan sessions | Pass | Integration: ids kept and date order kept through edits; `content.spec.ts` adds, edits and deletes sessions (passes up to the Mailpit step) |
| 6 | Non-coordinators | Pass | Integration: FORBIDDEN for another faculty member; `catalog.spec.ts`: read only with "Kept by Pradeep Sahoo". The workspace tabs render the same components |
| 7 | HoD | Pass for controls; writes partly | A scripted walk of the eight workspace pages as `hod@seed.cutm.test` found no edit control. 404 for writes is tested for live classes and content |
| 8 | Live delete | Pass | Integration: a cancelled class is deleted and audited `live.deleted`; one with attendance, one that ran and one still ahead are refused |
| 9 | Roster | Pass | Integration: add by roll number or email, drop, add again, each audited; refused while locked. `tests/e2e/people.spec.ts` passes |
| 10 | Phone width | Pass | A scripted walk at 360 px of Overview, Content, a lesson, Course plan, Live, Syllabus, Outcomes and People as faculty, HoD, student and admin: none wider than the screen (after the Resume fix) |

**Not done** — `tests/e2e/live.spec.ts` and the storage and email steps of `content.spec.ts` need LiveKit webhooks, object storage and Mailpit on this machine. Nothing is committed.

**Assumptions** — none new.

**Open questions** — none.

**Verification** — `npm run check` → lint and typecheck clean, `Tests 279 passed (279)`; `npx vitest run --project integration` → `Tests 189 passed (189)`; the 360 px and HoD walk as described above, on a build served from port 3101 with the e2e database.

### 2026-10-17 · Decision and build: the live room's layout, raised hands, in-class chat · Claude Code, at Aniket's request

Aniket shared a reference meeting screen ("try to make this kind of meeting interface … raise your hand feature … classy as the ss") and picked from three static mock-ups (scratchpad `m03b/live-ui/`): **A · Stage and side panel** — kept the reference's layout with solid dark panels and the product blue (his standing preference: no glass, no violet). He decided that **the in-class chat stays for everyone** (his change to 01 §4: not stored, reaches only the people in the room) and that **a raised hand is lowered by the student or any host**. Raising a hand in class is not excluded by 01 §4 (only hand-raise analytics are); his request is the approval.

**Created**
- `lib/integrations/live.ts`: the token carries `attributes: { role }`; `setHand(roomName, identity, raisedAt | null)` through `RoomServiceClient.updateParticipant` (no browser may update its own metadata, A-93).
- `lib/schemas/live.ts` (`LowerHands`), `app/(app)/courses/[offeringId]/live/actions.ts`: `raiseHand` (a student in the class, while it is live) and `lowerHands` (one's own, or anyone's for the class's teachers and admins).
- `components/live-room.tsx`: rewritten on LiveKit's hooks — stage (shared screen, else a host's camera), floating title and Live time, own camera in a corner, round controls (microphone, camera, screen, raise hand, People, Chat, Leave), a host's notice of the newest hand, side panel with People (numbers, raised hands in order with Lower / Lower all, everyone in the room) and Chat; hosts end the class from the panel.
- `app/(room)/…/room/page.tsx`: while the class runs, only the room (it draws its own title and controls); passes the class's title, course, start, end, enrolment and attendance note.
- Tests: `tests/integration/live.test.ts` (who may raise and lower, closed class), `tests/e2e/live.spec.ts` (a student raises a hand, the teacher is told and lowers it; the room's own controls in place of `.lk-video-conference`).
- Docs: 01 §4, 06 §4.3, 08 §5.2 (`LiveRoom`), 09 §2, the milestone (decision 7), §4 A-93, A-94.

**Not done** — `tests/e2e/live.spec.ts` not run (needs a LiveKit server whose webhooks reach this machine). No sound plays on a new hand.

**Assumptions** — A-93, A-94.

**Open questions** — none.

**Verification**
- `npx vitest run --project integration tests/integration/live.test.ts` → `Tests 29 passed (29)`; `npx vitest run --project unit lib/integrations/live.test.ts` → `Tests 5 passed (5)`.
- A real class on the dev LiveKit server (from `.env`) with the build on port 3101 and the e2e database: faculty1 joined, turned the camera on and shared a screen; student01 (1440 px) and student02 (390 px) joined and raised hands; the teacher saw "Student 02 raised a hand" and both in order in the panel, student01 saw "1 in line"; student01's chat message reached the teacher (unread 1); "Lower all" cleared both; "End class for everyone" from the panel ended it and the students' tabs said so. The test class was deleted afterwards.

### 2026-10-17 · Decision: M03c, the live room with Google Meet's major features · Claude Code, at Aniket's request

Aniket asked for host mute and remove, class recording, a floating mini window when the tab is left, layouts that keep faces in view during screen sharing and let anyone be pinned, meetings scheduled with members and invited by email, and "the major features of Google Meet". Research covered Meet's host controls (mute, mute all, remove, host management locks for chat, presenting, audio and video), LiveKit's server APIs (mute, remove, permissions, Egress recording) and Chrome's automatic picture-in-picture (Chrome 120+). He decided:
1. Recording is built now (LIV-05 leaves the backlog); he asked me to deploy LiveKit Egress on the LiveKit host.
2. Meetings may include outside guests, admitted from a lobby.
3. A removed person stays out until a host lets them back.
4. All extras: emoji reactions, host locks, background blur, polls, breakout rooms, live captions, a whiteboard.

This entry is the written scope approval for milestone M03c (AGENTS law 1); each item changes 01 §4 in the commit that builds it. Tasks and the mechanisms are in `docs/milestones/M03c-live-like-meet.md`. Mock-ups come first, in three rounds.

### 2026-10-17 · M03c T0 (round 1) and T1–T3: layouts, pinning, the mini window, host controls, reactions · Claude Code, at Aniket's request

Aniket picked from the round-1 mock-ups (scratchpad `m03b/live-ui/r1-A…E.png`): **Auto puts the faces beside a shared screen (R1-A)**, **host controls at the top of People (R1-C)**, and the tiled view with pinning and reactions (R1-B), the mini window (R1-D) and the removed screen (R1-E) **as shown**.

**Created**
- `lib/models/live-session.ts`, `lib/schemas/live.ts`: `studentsMay { share, unmute, chat }`, `removed [{ userId, at, by }]` (at most `MAX_REMOVED` = 100); `STUDENT_RIGHTS`, `ALL_RIGHTS`, `PersonRef`, `SetStudentRight`.
- `lib/integrations/live.ts`: one error mapping for every engine call; `joinToken` takes the student's rights (`canPublishSources`, `canPublishData`), lives 10 minutes and grants no `roomAdmin`; new `roomPeople`, `muteMicrophone`, `setRights`, `removeFromRoom`, `tell`; the join event says whether a host joined.
- `lib/schemas/jobs.ts`, `lib/queue.ts`, `worker/jobs/compute.ts`: `compute/liveControl` applies what students may do to everyone in the room, or mutes everyone but the host who asked (04 §3: it reaches every student, so it runs in the worker).
- `app/(app)/courses/[offeringId]/live/actions.ts`: `muteParticipant`, `muteEveryone`, `setStudentRight`, `removeParticipant` (audited `live.removed`, one transaction), `allowBack` (audited `live.allowed_back`).
- `app/api/webhooks/live/route.ts`: a removed student's join is removed again and not counted; a student's join while a right is off gets it applied.
- `lib/data/live.ts`: `getSession` gives no token to a removed student (`removed: true`) and gives hosts `controls` (rights and the removed students with names).
- `components/live-room.tsx`: layouts (Auto, Tiled, Spotlight, Sidebar), hide people without video, show my own tile, pin for me, "+ N more"; the More menu (layouts, mini window, full screen; reactions on a phone); the mini window (Document Picture-in-Picture with a portal, opened by Chrome on leaving the tab while the camera or microphone is on; other browsers float the video); reactions; host controls, per-person menus, the remove confirmation and the removed list in People; server notices; controls disabled with the reason; the removed screen; Rejoin reloads the page; adaptive stream and dynacast.
- `components/ui/switch.tsx` (vendored, 08 §5.1), `document-pip.d.ts` (the browser types TypeScript lacks), `app/globals.css` (the reaction animation).
- `app/(room)/…/room/page.tsx`, `app/(app)/courses/[offeringId]/live/[sessionId]/page.tsx`: the removed student's message on both.
- Tests: `lib/integrations/live.test.ts` (token rights and lifetime, no room admin, a host's join), `tests/integration/live.test.ts` (mute one, mute everyone through the worker, rights saved and applied in the room and on join, remove and let back with audit and the webhook, the 100 limit).
- Docs: 01 §4, 05 §4.3, 06 §3, §4.3, §6, 08 §5.1, §5.2, 09 §2, §6, §4 A-95 to A-100.

**Not done** — not committed. No e2e spec: the real-server walk below covered T1–T3, and `tests/e2e/live.spec.ts` still needs a LiveKit server whose webhooks reach this machine. The webhook's re-removal was tested with signed events in the integration suite, not on the real server (its webhooks go to the deployed app). The mini window's automatic opening on tab switch needs a real Chrome with the camera or microphone on; it was not tried. T4–T11 not started; round-2 mock-ups (meetings, invitations, guest lobby) come next.

**Assumptions** — A-95 to A-100.

**Open questions** — none.

**Verification**
- `npm run check` → lint and typecheck clean, `Tests 281 passed (281)`; `npx vitest run --project integration` → `Tests 196 passed (196)` (live: 34, the adapter's unit tests: 7).
- A scripted class on the dev LiveKit server (from `.env`), the build on port 3101 and the worker, both on the e2e database; faculty1 hosting, student01 and student02 joined in Chromium with fake devices. All 12 steps passed: turning off students' microphones took student01's open microphone off and disabled the button with the reason; turning it on again let them unmute; the teacher's Mute reached student01 with "Pradeep Sahoo muted your microphone"; student02's 👏 floated on the teacher's stage with the name; Tiled, Sidebar, Spotlight, Auto with a pin; the teacher's shared screen with the faces beside it on student02's screen; chat and reactions off disabled both for student02; Mute everyone turned off student02's microphone with "… muted everyone"; removing student01 showed them "You were removed from this class" (also after a reload) and the teacher "Removed · 1"; Let back let them join again after a reload; the mini window opened with the stage, faces and controls, a hand raised from it reached the teacher, and "Back to the class tab" closed it; at 360 px the bar fits (page width 360) and the More menu offers reactions. The test class was deleted afterwards.

### 2026-10-17 · M03c: a sound when someone joins the live class · Claude Code, at Aniket's request

Aniket: "add a tung sound when someone joins". His request is the approval.

**Created**
- `components/live-room.tsx`: on LiveKit's `ParticipantConnected`, a short bell (two sine tones, 784 and 1568 Hz, fading over 0.9 s) made with Web Audio — no sound file; at most one in 2 s; "Sound when someone joins" in the More menu, on for hosts and off for students at first. The browser plays it only after the viewer's first click or key press in the tab.
- Docs: 08 §5.2 (`LiveRoom`), §4 A-101.

**Not done** — not committed. No sound when someone leaves (not asked).

**Assumptions** — A-101.

**Open questions** — none.

**Verification**
- `npx eslint components/live-room.tsx`, `npx tsc --noEmit`: clean.
- On the dev LiveKit server with the build on port 3101 and the e2e database, counting the tones each page made: faculty1 heard student01 join (one bell) and then student02 and student03 (two more); student01 heard nothing until they turned the sound on in More, then one bell when student04 joined; two students joining at once rang the teacher's bell once. The test classes were deleted afterwards.


### 2026-10-17 · M04/T0 Decisions and mock-ups · Claude Code, at Aniket's request

Request: "do the next milestone". M04 is built on branch `m04-assessments` in a worktree (`.claude/worktrees/m04-assessments`, excluded locally through `.git/info/exclude`), because M03c is being built on main in the same folder at the same time; commits stay local and nothing is pushed (a push to main deploys the test server). Assumptions on this branch carry provisional ids `A-M04-n` (M03c is adding A-95 onwards); they are renumbered when the branch is merged.

**Created**
- `docs/milestones/M04-assessment-engine.md`: Decisions 1–6 and the mock-up rounds; the task text follows them (the New assessment dialog, `reorderItems`, the `(attempt)` route group, the counted-score rows now in 07 §14).
- `docs/07-ALGORITHMS.md` §14: the counted-score rows (they stood in §2 until M01b rewrote it) and the quiz average for SKL-02; §4 refers to §14 for the counted attempt.
- `docs/02-ARCHITECTURE.md` §8: the scheduler is `assessmentSweep` (BullMQ names a scheduler after its job). `docs/08-UI-SYSTEM.md` §2: no `/assessments/new` route; the runner row names its route group.

**Not done** — everything after T0.

**Assumptions** — none yet in §4 (they arrive with the code that needs them).

**Open questions** — none.

**Verification** — Mock-ups were drawn inside the real app: a build of this branch on port 3101 with the e2e database, signed in as faculty1 and student01 on CUTM1602's Live tab, with the mock content put in place of the tab's own and Tailwind's browser compiler given our theme. 18 screens at 1440 px and 4 at 390 px, none wider than the screen. Aniket picked Builder A, Runner B and "Next to grade"; the other screens as shown.

### 2026-10-17 · M04 Assessment engine (T1–T10) · Claude Code, at Aniket's request

Built on branch `m04-assessments` in a worktree while M03c was being built on main in the same folder (decision with Aniket). Local commits only, nothing pushed: `04622fc` docs, `016f8c4` foundation, `ff0221c` server, `319b0c8` UI, `a0607f9` tests, and the report with this entry. A trial merge against main (`893787c`) shows no conflict. Whatever M03c commits meanwhile to the shared files (PROGRESS, `lib/queue.ts`, `worker/jobs/compute.ts`, the notification kinds, Home, the workspace tabs) is merged by hand, and the `A-M04-n` assumptions take the next free numbers then.

**Created**
- Models and schemas:
  - `lib/models/{assessment,submission}.ts` (05 §5.1–5.2). Answers and scores are maps keyed by item id. Indexes: `{ 'items.coIds': 1 }`, `{ assessmentId, status, submittedAt }`, `{ status, deadlineAt }`.
  - `lib/schemas/assessment.ts`: modes, question types per mode, each mode's typical settings, and the question, answer and grading inputs.
  - `istDateTime` and `marks` in `lib/schemas/common.ts`; `AssessmentSweepJob`.
  - The notification kinds `assessment.published`, `assessment.dueSoon` and `results.published`.
  - `scripts/sync-indexes.ts`.
- Rules (07 §14, each with its test vectors):
  - `lib/domain/grading.ts`: `autoGrade`, `rubricTotal`, `attemptTotal`, `quizAveragePct`.
  - `lib/domain/attempts.ts`: `windowState`, `deadlineAt`, `canStart`, `isLate`, `countedScore`.
  - `lib/domain/shuffle.ts`: `seededShuffle`.
  - `roundHalfUp` and `ceilTo` were already there with every 07 §1 vector.
- Server:
  - `lib/data/attempts.ts`: `handInAttempts`, the one hand-in path for Submit, a late save, a resume, `publishResults` and the sweep. It is safe to load in the worker.
  - `lib/data/assessments.ts`: the lists, `toStudentAssessment`, the builder, the student's page and attempt, hand-ins, grading, the records grid, and Home's lists.
  - `lib/data/notify.ts`: `notify` moved out of `notifications.ts` so the worker can load it; its three callers are updated.
  - The new counters in `lib/data/engagement.ts`, and the skill roster's quiz columns in `lib/data/workspace.ts`.
  - Teacher actions in `app/(app)/courses/[offeringId]/assessments/actions.ts`: create, settings, instructions, save, delete and reorder a question, publish, delete a draft, grade, publish results.
  - Student actions in `app/(attempt)/…/attempt/actions.ts`: start, save an answer, submit.
  - The `submission` upload purpose in `createUpload` and `/api/files`.
  - `deleteCo` refuses a CO that a question uses.
  - `assessmentSweep` in `worker/jobs/compute.ts`, scheduled hourly in `worker/index.ts`.
- UI:
  - The Assessments and Records tabs.
  - Pages: `assessments/{page,new-assessment-dialog,student-list}.tsx` and `[aid]/{page,edit/page,grade/page,grade/[submissionId]/page}.tsx`.
  - The runner page in the new `(attempt)` route group, and `components/assessment-runner.tsx`.
  - Home's Due soon and To grade sections; People's quiz columns on a skill course.
  - Changed components: `RichTextEditor` (`onChange`), `FileUpload` (`initial`, `onChange`), `ActionForm` (posts the button that submitted the form).
  - `lib/format.ts`: `MODE_LABEL`, `ITEM_LABEL`, `formatDue` and the new status tones; the labels on the notifications page.
- Tests:
  - Unit: `lib/domain/{grading,attempts,shuffle}.test.ts`, `lib/schemas/assessment.test.ts`.
  - Integration: `tests/integration/assessments.test.ts` (23 tests), and `makeAssessment` in `tests/factories.ts`.
  - E2E: `tests/e2e/assessments.spec.ts`.
- Docs:
  - The milestone file: decisions 1–6, the mock-up rounds, and the task text.
  - 02 §8; 05 §5.1–5.2; 06 §2 and §6; 07 §4 and §14; 09 §10.
  - 08 §2, §6 and §5.2 (`ActionForm`, `RichTextEditor`, `FileUpload`, `AssessmentRunner`, `PageIcon`).
  - §4: A-102 to A-108, and A-85.

**Acceptance criteria**

| AC | Result | Evidence |
|---|---|---|
| AC-M04-01 | Pass | Integration: publishing is refused with "Tag question 2 with a course outcome before publishing."; `saveItem` refuses a credit-course question without a CO or with another course's. E2E: the readiness strip shows "Every question has a course outcome" before Publish |
| AC-M04-02 | Pass | Integration: the serialized student view, attempt, page and list hold no `"answer"`, `coIds`, rubric or numeric key. By hand: every response student02's browser received on the assessment and attempt pages (114 responses, 4.46 MB), searched for `"answer"`, `tolerance`, `coIds`, `bloomLevel` and `"key"`. None appears in a page or data response; `"key"` appears only inside Next's static JavaScript |
| AC-M04-03 | Pass | Integration: a save 10 s after the deadline is refused ("Time is up — your answers were submitted."), and the attempt is handed in at its deadline with the answer saved before it. The sweep hands in an attempt whose tab was closed. The countdown follows the server's clock (`serverNow`); a device clock set wrong was not tried in a browser |
| AC-M04-04 | Partly | Integration: `createUpload` takes a 24 MB PDF and a HEIC photo, but only for a running attempt. The key is the student's own, and another student's key is refused. The owner and the teacher download the file; another student gets 404. Not done: uploading from a phone's camera (no phone here, and RustFS was not running for a browser upload) |
| AC-M04-05 | Pass | Unit vectors (07 §14). Integration: objective questions are marked on submit and a written one waits; a rubric question's marks are its criteria's total; a rubric that does not add up is refused. E2E: 3 + 1 on a 3 + 2 rubric gives 4, and a total of 9 / 10 |
| AC-M04-06 | Pass | Integration: refused before the window closes (CLOSED) and with "2 submissions still need grading."; the publish hands in an expired attempt; only the two students who handed in are told. E2E: the teacher closes the window and publishes, and the student reads the marks |
| AC-M04-07 | Pass | Integration: `submission.graded` records each changed question's marks before and after; saving the same marks again writes nothing; a regrade after publication writes a second entry; nothing changes while marks are locked |
| AC-M04-08 | Pass | Integration: the Records grid shows a graded record and a missing one; a student gets 404 for the grid and sees their records as a list. Records are lab and learning record assessments built in the same builder |

**Not done**
- Page marks for Assessments, Records and grading. They are generated images, which this session cannot make; the pages use `evaluation`, `books` and `badge` instead (08 §5.2 says so).
- A phone walk: camera uploads, a throttled connection, a HEIC photo in a browser. The 360 px layout was checked in headless Chromium instead (below).
- `tests/e2e/admin-structure.spec.ts`: two of its tests also fail on main, and are not changed here.
  - One looks for a "Change enrolment" button that M03b's People redesign removed.
  - The other does not find a new department's code on the ten-a-page list.
- CI has not run (nothing is pushed).

**Assumptions** — A-102 to A-108 (§4).

**Open questions** — none new. Q-41 (how assessments map to the policy's parts) still waits for M06.

**Verification**
- `npm run check` → exit 0; `Test Files 26 passed (26)`, `Tests 342 passed (342)`.
- `TEST_MONGODB_URI=… npx vitest run --project integration` (local replica set and Redis) → exit 0; `Test Files 16 passed (16)`, `Tests 219 passed (219)`.
- `npm run build` → exit 0 (the seven M04 routes partially prerendered).
- `npm run check:bundle` → "105 files scanned for 4 names and 0 secret values; clean".
- `npx playwright test tests/e2e/assessments.spec.ts` → `1 passed` (27 s), twice in a row. Together with `people`, `catalog` and `admin-structure`: 4 passed, plus the two admin-structure failures above.
- A scripted walk of every M04 page as faculty1, student01 and the HoD, at 1440 px and 360 px, on a build with the e2e database:
  - No error page, and no page wider than the screen.
  - The builder, runner, grading and result pages match the picked mock-ups.

### 2026-10-18 · M04b/T0 Test platform: decisions and mock-ups · Claude Code, at Aniket's request

Request: bring every feature of Aniket's two earlier test products into the LMS's tests and assessments (the features, not their questions or formats), add the best features of the leading testing platforms, and share a test by link so people sign in and take it directly. The two products are `dsw_test_v2` and `CSE_Recruitment_Portal_CUTM`, both read for this.

**What the two products do**
- DSW test v2:
  - A waiting room with a countdown and a camera and microphone check.
  - A forced full screen, with right-click, copy, paste and devtools keys blocked.
  - Shuffled questions, a question map with flags, and a summary before submitting.
  - AI-generated multiple-choice questions.
  - A leaderboard with an Excel export, result emails, and scorecard and certificate PDFs.
- The CSE recruitment portal:
  - A question bank by category and difficulty, with a paper drawn per candidate (30/45/25) in sections.
  - Proctoring:
    - Events are soft or hard, and an attempt ends after a limit of hard ones.
    - A heartbeat with a session nonce catches a second tab or device, and connection gaps.
    - It also catches devtools, window blur, printing and changes to the page.
    - Each hard violation takes a penalty off the score.
  - Coding questions on Judge0 with public and hidden cases and a run limit.
  - AI-suggested code grades in four bands, with an admin override.
  - Recommendation bands and section breakdowns, and a per-attempt PDF report.
  - This answers Q-25 (b): the recruitment platform's compiler service is Judge0.

**Decisions** — `docs/milestones/M04b-test-platform.md` decisions 1–5:
- Links for the class or for guests.
- Proctoring and coding pulled forward from M05; a question bank with random papers; AI helpers with a person confirming.
- Rich results, a leaderboard, certificates and scorecards, Excel and PDF exports.
- A phased build.
- The mock-up picks: the guest landing in the LMS's own sign-in layout, lobby B, runner A, the rest as shown.
- The owner requests are TP-01 to TP-12 (01 §7.14). The new `candidate` role is in 01 §5.
- 01 §4 records what moves into scope; AI "cheating" verdicts stay out.

**Not done** — phases A–E.

**Assumptions** — none yet.

**Open questions** — Judge0 server and token for coding questions; an Anthropic API key for the AI helpers; the certificate's design and signatory; how long guest records are kept (defaults in the milestone file).

**Verification** — 20 mock-ups drawn inside the real app (a build of this branch on port 3101 with the e2e database) at 1440 px, plus 4 at 390 px. Aniket's picks are recorded in decision 5. The phone mock-ups of the runner and the coding screen were wider than the screen; the build is checked at 360 px.

### 2026-10-18 · M04b/A Test platform: access — standalone tests, share links, guests, the lobby · Claude Code, at Aniket's request

Phase A of `docs/milestones/M04b-test-platform.md` (TP-01–TP-04), on branch `m04-assessments`, committed locally and not pushed.

**Created**
- **Standalone tests (TP-02).**
  - An assessment's `offeringId` may be null, with `ownerIds`. Its submissions have no `offeringId` and no engagement counters.
  - `assessmentAccess()` (`lib/auth/access.ts`) decides `manage` · `oversee` · `take` from the assessment. Every M04 action and DAL read now takes the assessment (or submission) id alone.
  - The M04 pages became shared components (`AssessmentBuilder`, `AssessmentOverview`, `HandInsView`, `GradingPage`, `AssessmentAttempt`, `assessment-lists.tsx`, `NewAssessmentDialog`, 08 §5.2) behind thin course routes and new `/tests` routes. A course route 404s for another course's assessment.
  - `/tests` lists "Tests you run" and "My tests" (`listTests`).
  - The sidebar has Tests. A candidate's Home sends them to it.
- **Share links (TP-01).**
  - `testLinks` and `testGrants` (05 §5.2a–b).
  - Actions `createLink`, `setLinkActive`, `deleteLink`, `inviteToTest` (`app/(app)/tests/actions.ts`).
  - The builder's Share card lists each link with its rules, address, Copy (`CopyButton`), QR code (`qrcode` 1.5.4, server-side SVG, 03 §3) and ⋮, plus the New link and Invite by email dialogs.
  - Invitations are `mail/send` jobs (`testInvitationEmail`).
- **Guests (TP-03).**
  - The `candidate` role (`ROLES`; admins assign only `ASSIGNABLE_ROLES`).
  - `otps` (05 §5.2c, HMAC only, `lib/auth/otp.ts`).
  - `/t/[token]` in the `(auth)` layout, exempt from `proxy.ts`, with the actions `openLink`, `signInToTest`, `registerGuest`, `returnAsGuest`, `verifyGuestCode` and `leaveLink`.
  - The password check moved from `login` into `lib/auth/sign-in.ts`, so the link page signs LMS users in too.
- **The lobby (TP-04, "Lobby B").**
  - `DeviceCheck` and `Countdown` (`components/test-lobby.tsx`). The runner's clock (`useServerSeconds`, `clock`) moved there.
  - The rules and the agreement sit beside Start, for course assessments too.
- **Other changes.**
  - `/api/files` lets a standalone test's owners and admins open its hand-in files.
  - The hourly sweep reminds a standalone test's joined people.
  - `sync-indexes` adds the three collections.
  - `lib/domain/test-links.ts` (`assessmentPath`, `linkState`, `emailAllowed`, `maskEmail`) has unit tests.
- **Tests.**
  - `tests/integration/tests.test.ts` (13 cases): creation and ownership, link rules (code, domains, limit, switch, window, draft), one use per person, course links without grants, sign-in on the link page, invitations, guest registration and codes (hash, tries, LMS emails refused), returning after the link closed, a candidate's attempt graded and published, the reminder.
  - `tests/e2e/tests.spec.ts`: faculty1 makes and shares a test; a guest registers with the code from Mailpit, passes the lobby and hands in.
  - The M04 integration test and e2e spec follow the new signatures and the lobby's agreement.
- **Docs.** 03 §3, 05 (users, assessments, submissions, §5.2a–c, §8), 06 §5, §6 and §6.1, 08 (route map, sidebar, §5.2 rows), 09 (§3, §4, §9).

**Not done**
- Phases B–E.
- The lobby's camera and microphone checks come with proctoring in phase C.
- New page marks: Tests borrows `evaluation`.
- `/login` has no `next` parameter. A deep link opened while signed out lands on Home after sign-in; a share link avoids this because it signs in on its own page.
- Nothing was checked on a real phone.

**Assumptions** — A-109 to A-116 (§4).

**Open questions** — none new; the milestone's four still stand (Judge0, AI key, certificates, guest retention).

**Bugs found and fixed while verifying**
- Someone already let in was refused by a full link; found by the integration test. A grant now always lets its holder back.
- The builder read a variable before declaring it inside a `find` callback (a production `ReferenceError`; `tsc` cannot see it); found by the e2e test.
- `proxy.ts` sent signed-out visitors of `/t/<token>` to `/login`; found by the e2e test.

**Verification**
- `npm run check` → exit 0; `Test Files 27 passed (27)`, `Tests 358 passed (358)`.
- `npm run test:integration` (mongodb-memory-server, local Redis) → exit 0; `Test Files 17 passed (17)`, `Tests 232 passed (232)`.
- `npm run build` → exit 0; `npm run check:bundle` → "110 files scanned … clean". `qrcode` is in no client chunk.
- `npm run db:indexes:e2e`, then e2e with Mailpit v1.31.0 (run from a download, as Docker is not installed here):
  - On the final build: `npx playwright test tests/e2e/tests.spec.ts tests/e2e/assessments.spec.ts tests/e2e/auth.spec.ts` → exit 0, `7 passed`.
  - The five auth tests cover the sign-in refactor.
  - The other specs were not run in this phase.
- A scripted walk of 15 phase A screens at 1440 px and 390 px as faculty1 and a new guest:
  - The screens: Tests, New test, the builder with Share and a QR code, New link, Invite, hand-ins, the guests, class and closed link pages, the code step, the lobby, My tests, and returning on the link.
  - No error page, and no page wider than the screen.
  - After the walk: badge text in sentence case, the timer rule reworded, and "All tests" / "LMS users" for standalone tests.

### 2026-10-18 · M04b/B Test platform: build — question bank, sections, new types, papers, Runner A · Claude Code, at Aniket's request

Phase B of `docs/milestones/M04b-test-platform.md` (TP-05, TP-06, TP-07), on branch `m04-assessments`, committed locally and not pushed.

**Created**
- **Question types (TP-06).**
  - True or false, fill in the blanks, matching (sides with their own ids) and ordering.
  - Negative marks and partial credit, with the grading rules and vectors in 07 §14, and explanations.
  - Difficulty and topic on every question (05 §5.1).
  - One dialog for every type, `components/question-dialog.tsx`, shared by the builder and the bank.
- **Sections (TP-06).**
  - Each section has its own clock and an optional "no going back" (a gate), a passage, and draws from the bank (count, level mix, outcomes, topics, marks each, negative each).
  - Actions `saveSection`, `deleteSection`, `reorderSections`; the rules in 07 §14 (`planSectionMove`, `sectionDeadline`).
  - The builder's "Sections and papers" card follows mock-up C3.
- **Question bank (TP-05).**
  - The `questionBank` collection (05 §5.2d): a course's bank or a member of staff's own.
  - Actions `saveBankItem`, `deleteBankItem`, `importBankCsv` (06 §8.6), `copyToBank`, `addFromBank`.
  - Pages `/courses/<id>/bank` (a new workspace tab) and `/tests/bank`, following mock-up C1 (`components/question-bank.tsx`).
  - The builder adds "From the bank" and each question's "Save to the bank".
- **Papers (TP-05).**
  - An attempt keeps its own paper (`submissions.paper`), drawn by `buildPaper` (`lib/data/papers.ts`) and seeded by the attempt.
  - `lib/domain/papers.ts` (allocate, draw, shortfall, distinct papers) has unit tests.
  - Grading, the grader's view and results read the paper; publishing refuses a draw the bank cannot meet.
- **Runner A (TP-07, M04b decision 5).**
  - One question at a time, with section tabs, the question map, "Flag for review" and a review page.
  - Text size and high contrast.
  - Answers are kept on the device while offline and sent again.
  - Time on each question is recorded, the section clock runs, and leaving a "no going back" section asks first (`components/assessment-runner.tsx`).
  - New server actions `flagItem` and `enterSection`.
- **Extra time (TP-07).** `setExtraTime` and the builder's Extra time card; audited, and it reaches a running attempt.
- **Lobby, results and grading.**
  - The lobby shows sections and their rules.
  - Results list the counted attempt's own questions.
  - Grading shows each new type beside its key, plus section titles, time spent, "From the bank" and "Flagged by them".
- **Tests.**
  - Unit: grading vectors for every type, negative and partial marks; papers; sections and extra time; the new item schemas; the bank CSV parser; `plainText`.
  - `tests/integration/build.test.ts` (12 cases): the new types stored with their keys; sections and drawn marks; the bank's access, sharing and CSV; copying both ways; publishing against the bank; frozen and graded papers; section rules on the server; secrecy; extra time; negative marks a grader keeps.
  - The M04 integration and e2e tests now use papers and Runner A.
- **Docs.** 05 §5.1, §5.2, §5.2d and §2; 06 §6.2 and §8.6; 07 §14; 08 (route map, workspace tabs, §5.2 rows for the runner, builder, `QuestionDialog` and `QuestionBank`); 09 §3 and §10.

**Not done**
- Pictures in questions and options (part of TP-06). They need an image upload purpose readable by whoever takes the test, and an editor that can place images.
- Dragging steps in an ordering question; they move with Move up and Move down only.
- Explanations and answers shown to takers, and "Draft with AI" (phase E).
- The offline backup was not tested with a real lost connection, only through reloads in the e2e walk.
- Nothing was checked on a real phone.

**Assumptions** — A-117 to A-124 (§4).

**Open questions** — none new.

**Bugs found and fixed while verifying**
- Leaving a section wrote one field of `visits` and pushed to the same list in one update, which MongoDB refuses; found by the integration test. The list is now written whole, guarded by its length.
- The runner's Submit button had no accessible name below 640 px; found by the 390 px walk.
- The type lists were checked with `as` casts, which the coding laws forbid; replaced.

**Verification**
- `npm run check` → exit 0; `Test Files 28 passed (28)`, `Tests 416 passed (416)`.
- `npm run test:integration` (mongodb-memory-server, local Redis) → exit 0; `Test Files 18 passed (18)`, `Tests 244 passed (244)`.
- `npm run build` → exit 0; `npm run check:bundle` → "114 files scanned … clean".
- `npm run db:indexes:e2e` (now with `questionBank`), then on the final build: `npx playwright test tests/e2e/tests.spec.ts tests/e2e/assessments.spec.ts tests/e2e/auth.spec.ts` → exit 0, `7 passed`. The other specs were not run in this phase.
- A scripted walk at 1440 px and 390 px, on a sectioned quiz seeded into the e2e database with the bank and every new type:
  - faculty1: the builder, a section's dialog, the blank and matching question dialogs, "From the bank", the course bank and its import dialog.
  - student01: the lobby, then each section through to the review page, handing in; then faculty1's hand-ins and grading.
  - No error page, and no page wider than the screen.
  - The builder, bank and runner match mock-ups C3, C1 and B1.

### 2026-10-18 · M04b/C Test platform: integrity — proctoring and the live monitor · Claude Code, at Aniket's request

Phase C of `docs/milestones/M04b-test-platform.md` (TP-08), on branch `m04-assessments`, committed locally and not pushed.

**Created**
- **The rules (07 §15, rewritten).**
  - `lib/domain/proctoring.ts`: `recordEvent` (serious and minor, the 3 s merge, the limit), `proctorPenalty`, `withPenalty`, `sessionCheck`, `connectionGap`, with unit vectors.
  - `totalOf` in `lib/data/attempts.ts` takes the penalty off every total written.
- **Data (05 §5.1, §5.2).**
  - `assessments.proctoring` (null = off) and `snapshotsDeletedAt`, with the clean-up index.
  - `submissions.proctor` (counts, events, snapshots, the tab holding the attempt, last beat, added minutes, messages, waived) and `endedBy`.
- **Settings (TP-08).** `saveProctoring` and the builder's Proctoring card and dialog: full screen, copy/paste/right-click blocked, camera snapshots and their interval, the limit, marks off per serious warning. Fixed once anyone has started.
- **The runner (mock-up B4).**
  - `proctorBeat` every 15 s and at once with what the page noticed. It keeps a proctored attempt to one tab or device, records lost connections, hands in at the limit, and brings the monitor's time and messages.
  - The page watches full screen, leaving it, copy, paste, right-click, printing and the developer-tools keys.
  - The full-screen gate ("This test runs in full screen", "You left full screen · warning n of N"), the second-device block, a banner per serious warning, "Proctored · n of N warnings", the watermark, nothing when printed.
  - Camera stills: `createUpload('proctor-snapshot')`, then `addSnapshot`; "Your camera" in the corner.
- **The lobby.** It lists exactly what is watched (09 §11). The device check adds Full screen and Camera ("Allow camera", a preview).
- **The live monitor (mock-up C4).**
  - `/courses/<id>/assessments/<aid>/monitor` and `/tests/<aid>/monitor` (`components/live-monitor.tsx`), refreshed every 15 s: tiles, progress, time left with added minutes, warnings by kind, last seen.
  - `extendAttempts`, `messageTakers`, `endAttempt`, for one person or all; the builder links to it.
- **Grading and results.**
  - The grading page's Proctoring section: counts, the penalty with "Waive the penalty" / "Put the penalty back" (`waivePenalty`, audited), everything recorded, and the snapshots.
  - Hand-ins show "Ended at the warning limit", "Ended by staff" and the warnings.
  - The taker's results show what the warnings took off.
- **Snapshots, kept privately.**
  - `/api/files` serves `proctor-snapshot` keys to the test's staff only.
  - The daily `proctorRetention` job (03:30 IST) deletes them `snapshotRetentionDays` after results.
  - The admin setting is "Proctoring" on `/admin/settings`.
- **Fixed from phase B.** "Late" now allows for the person's extra time (A-132).
- **Helpers.** `PROCTOR_EVENT_LABEL`, `ordinal` (`Intl.PluralRules`), `formatTimeSeconds` and `formatClock` (moved from `test-lobby.tsx`) in `lib/format.ts`.
- **Tests.**
  - Unit: 24 vectors in `lib/domain/proctoring.test.ts`.
  - Integration: `tests/integration/proctoring.test.ts`, 13 cases. They cover the settings and who may set them; counting, merging and the limit; one tab or device; lost connections; unproctored beats; the penalty, waiving, regrading and results; the monitor's actions and access; snapshots — upload, record, who reads them, retention through the real queue; late with extra time.
  - E2E: `tests/e2e/proctoring.spec.ts`.
- **Docs.** 02 §8; 05 §5.1, §5.2, §8; 06 §5, §6, §6.2, §7; 07 §15; 08 (routes, §5.2 `AssessmentRunner`, `HandInsView`/`GradingPage`, `LiveMonitor`, `DeviceCheck`, `AutoRefresh`); 09 §1, §3, §4, §6, §11.

**Not done**
- Snapshots were not checked against real storage.
  - RustFS was not running: the integration tests mock storage.
  - The visual walk used Chromium's fake camera, and its uploads could not land.
  - So the PUT to the bucket and the thumbnails on the grading page are unverified.
- Nothing was checked on a real phone or in Safari or Firefox; full screen on iPhone is expected to be unavailable (A-134).
- Developer tools opened from the browser's menu are not noticed; only the keys are stopped. A browser's "Duplicate tab" is not caught as a second tab (A-127).
- "Proctored · n warnings" is hidden below 1024 px; phones see the banner for each serious warning instead.
- AI "cheating" verdicts stay out (Q-09).

**Assumptions** — A-125 to A-135 (§4).

**Open questions** — Q-54 (snapshots of a test whose results are never published).

**Bugs found and fixed while verifying**
- The window's `blur` listener ran in the capture phase. Every field or button losing focus counted as "left the test's page", including the moment the full-screen gate closed. Found by the e2e run, whose first warning was "left the page" instead of "left full screen". It now reacts only to the window itself.
- A hand-in inside a person's extra time was marked late (phase B). Found while writing the penalty's total; covered by a test now.
- The camera's video ref was returned from the runner's hook, so React's compiler treated every value the hook returned as a ref; the runner now owns the ref.
- On a phone the monitor's "7 / 10" wrapped onto two lines and two tile labels were cut off; fixed after the 390 px walk.

**Verification**
- `npm run check` → exit 0; `Test Files 29 passed (29)`, `Tests 440 passed (440)`.
- `npm run test:integration` (mongodb-memory-server, local Redis) → exit 0; `Test Files 19 passed (19)`, `Tests 257 passed (257)`.
- `npm run build` → exit 0; `npm run check:bundle` → "116 files scanned … clean".
- `npm run db:indexes:e2e`, then on the final build: `npx playwright test tests/e2e/tests.spec.ts tests/e2e/assessments.spec.ts tests/e2e/auth.spec.ts tests/e2e/proctoring.spec.ts` → exit 0, `8 passed`. The other specs were not run in this phase.
- A scripted walk at 1440 px and 390 px on a proctored quiz seeded into the e2e database, with Chromium's fake camera:
  - faculty1: the builder, the Proctoring dialog, the monitor and its "Add time to all", hand-ins, a graded hand-in's Proctoring section.
  - admin: the Proctoring setting.
  - student01: the lobby with the camera allowed, the full-screen gate, the runner, "You left full screen", the teacher's message.
  - No error page, and no page wider than the screen.
  - The monitor and the gate match mock-ups C4 and B4.

### 2026-10-18 · M04b/D Test platform: code — code questions on Judge0 · Claude Code, at Aniket's request

Phase D of `docs/milestones/M04b-test-platform.md` (TP-09; CE-03's coding modes and LAB-02, LAB-03 and LAB-05 from M05), on branch `m04-assessments`, committed locally and not pushed. Aniket chose Judge0's free public server for now and a key of the university's own when it goes public.

**Created**
- **The runner adapter (06 §4.4).**
  - `lib/integrations/code-runner.ts`: `runBatch` (batches of 20, base64, polling every 500 ms up to 20 s, the status mapping, outputs cut at 64 KB, no expected output sent) and `listLanguages`.
  - `CODE_RUNNER_URL` defaults to `https://ce.judge0.com`; `CODE_RUNNER_TOKEN` is optional (`lib/env.ts`, `.env.example`).
- **The rules (07 §14).** `lib/domain/code.ts`: `normalizeOutput`, `outputsMatch`, `testStatus`, `codeItemMarks`, with vectors.
- **Modes and questions (05 §5.1).**
  - The modes Coding test, Lab test and Coding competition.
  - The `code` question type: languages, starters, time, memory, a run limit and up to 15 tests with weights and Hidden; at most 5 in a test.
  - In the question dialog and the bank, checked against the setting (`requireOfferedLanguages`).
- **The setting (06 §7).** `codeRunner` (languages as `key | label | runner id` lines and the wait between runs), with its admin form beside the runner's own language list (`getRunnerLanguages`).
- **Running code (LAB-02).**
  - `runCode` saves the code and runs it on the visible tests only (`runSamples`, `lib/data/code.ts`), within the question's run limit, one run every 3 s and 200 an hour.
  - Each run is kept for the grader and counted in the course's engagement (`codeRuns`).
  - `saveAnswer` takes code.
- **The runner (mock-up B3).** A split view: the question; then the language, runs left, Reset and "Run sample tests" over the editor; then the visible tests with what each run printed or the compiler's message. `components/code-editor.tsx` (CodeMirror) is loaded only when a code question shows.
- **Marking (LAB-05).**
  - Handing in queues `compute/gradeCode` (`code-<id>`), which runs every test, hidden ones too, and marks by weight.
  - A grader's own mark stays, and an empty mark box keeps the tests' mark.
  - "Run the tests again" (`rerunCode`, audited) for a grader.
- **Grading (LAB-03).** The code, its runs (count and best), and every test with its weight, Hidden and result.
- **Packages.** `@uiw/react-codemirror` 4.25.12, `@codemirror/lang-cpp` 6.0.3 and `@codemirror/lang-java` 6.0.2, pinned in 03 since M05; installed now.
- **Tests.**
  - Unit: 17 code vectors; the code question's form rules; the codeRunner setting.
  - Integration, with the runner mocked: `tests/integration/code.test.ts`, 9 cases. It covers the builder's limits and languages, copying from the bank, hidden tests never sent, runs within the limit and the wait, only the taker running, marking by weight once through the real queue, a grader's mark kept on a re-run, failures scoring 0, and access.
  - `tests/integration/code-runner.test.ts`, 4 cases: the adapter against a stand-in `fetch`.
  - E2E: `tests/e2e/code.spec.ts` on `tests/e2e/fake-runner.ts`, which Playwright now starts and points the app and the worker at.
- **Docs.** 01 (CE-03, LAB-02–05), 02 (integrations), 03, 05 §5.1–5.2, 06 §4.4, §6, §6.2, §7, 07 §14, 08 (routes; `AssessmentRunner`, `CodeEditor`, `QuestionDialog`, `NewAssessmentDialog`, `HandInsView`/`GradingPage`; settings), 09 §4, §6, §10, 11 §2, the milestone's open question.

**Not done**
- The hand-ins list's runs and best-pass columns (M05 T6). The grading page shows them for one hand-in.
- A coding competition's ranking (phase E's leaderboard).
- Python highlighting: Python runs once an admin adds it to the setting, in a plain editor.
- No real class used the free server; how it behaves with 50 students pressing Run at once is unknown (M05's validation checklist).
- Nothing was checked on a real phone; typing code there was not tried.

**Assumptions** — A-136 to A-142 (§4).

**Open questions** — Q-55 (the code runner before going public); Q-25 (b) answered for now.

**Bugs found and fixed while verifying**
- A code question's tests lost their ids. Mongoose gives an inline array subschema its parent's `_id: false`, so grading could not name a test. Found by the integration tests; the tests now have their own schema.

**Verification**
- On the free server, through the adapter: C, C++, Java and Python programs adding two numbers printed 3345; an endless loop stopped at the 2 s limit (`time_limit`); a syntax error returned the compiler's message (`compile_error`). All six took 3.6 s.
- `npm run check` → exit 0; `Test Files 30 passed (30)`, `Tests 470 passed (470)`.
- `npm run test:integration` (mongodb-memory-server, local Redis) → exit 0; `Test Files 21 passed (21)`, `Tests 270 passed (270)`.
- `npm run build` → exit 0; `npm run check:bundle` → "118 files scanned … clean".
- `npx playwright test tests/e2e/tests.spec.ts tests/e2e/assessments.spec.ts tests/e2e/auth.spec.ts tests/e2e/proctoring.spec.ts tests/e2e/code.spec.ts` → exit 0, `9 passed`. The other specs were not run in this phase.
- A scripted walk on a coding test seeded into the e2e database, with the app and the worker on the free server:
  - faculty1, at 1440 px: the builder, the code question dialog, the New assessment dialog, the graded hand-in (10 of 10, every test passed).
  - admin, at 1440 px: the Code questions setting with the runner's 71 languages.
  - student05 at 1440 px and student06 at 390 px: the runner, a compile error, "2 of 2 passed", handing in.
  - No error page, and no page wider than the screen. The runner matches mock-up B3.

### 2026-10-18 · M04b/E1 Test platform: results — release rules, results page, analytics, leaderboard, similarity · Claude Code, at Aniket's request

Phase E's first part (TP-11) of `docs/milestones/M04b-test-platform.md`, on branch `m04-assessments`, committed locally and not pushed. E2 (scorecards, certificates and reports in PDF; Excel exports) and E3 (the AI helpers) follow.

**Created**
- **The rules (07 §19).**
  - `lib/domain/results.ts`: `rankAll`, `bandOf`, `histogram`, `itemStats`, the labels and `breakdown`.
  - `lib/domain/similarity.ts`: `tokens`, `shingles`, `jaccard`, `similarPairs`.
  - `countedAttempt` (`lib/domain/attempts.ts`) names the counted attempt; `countedScore` uses it.
  - All with vectors.
- **Release rules.**
  - `assessments.results`, set by `saveResultRules` from the builder's Results card and dialog: by hand, by themselves once it closes, or each person's at once; right answers, explanations, a leaderboard, up to 5 bands.
  - `releaseResults` (`lib/data/results.ts`) is the one publish, by hand or by the hourly sweep.
- **The testStats job.**
  - `compute/testStats` (`queueTestStats`) works out over each taker's counted attempt: rank and percentile (on submissions), the histogram, item analysis (drawn questions by their bank id), alike answers (`submissions.similar`) and the leaderboard.
  - Results go into the new `testStats` collection (05 §5.2e).
  - Queued on publishing, regrading, waiving or re-running code after publication, and by "Work them out again".
- **The student's result (mock-up C5).** A ring with the percentage, the marks, the band, rank and percentile, by section, each answer with what was given and — as the rules allow — the right answer and the explanation, the leaderboard with "You", and by outcome.
- **Results and analytics (mock-up C6).** `…/results` for a course's assessment and a standalone test (`components/test-results.tsx`): tiles, the score histogram, and the questions to look at with correct %, discrimination and the most picked wrong option.
- **Similarity flags.** "Similar to another" on hand-ins, and "Alike answers — worth a look, not a verdict" on the grading page with links.
- **Tests.**
  - Unit: 27 results and similarity vectors.
  - Integration: `tests/integration/results.test.ts`, 5 cases. They cover the rules and who may set them; the "at once" release with answers and explanations shown only when allowed; ranks, percentiles, bands, item analysis, alike answers and the leaderboard through the real queue; a regrade re-ranking; the automatic release and its audit.
  - E2E: `tests/e2e/results.spec.ts`. `tests/e2e/assessments.spec.ts` follows the new result page and checks that no right answer shows by default.
- **Docs.** 02 §8; 05 §5.1, §5.2, §5.2e; 06 §6, §6.2; 07 §19 (new); 08 (routes, the lobby and results row, builder, hand-ins, `TestResultsView`); 09 §3, §6.

**Not done**
- E2 and E3 (above). The AI's suggested mark bands for written and code answers wait on Q-56.
- The results page has no filter for "your answers" (mock-up C5's "All questions" picker); every question shows.
- The Assessments list still shows "Handed in" until results are published, even when the "at once" rule shows the marks on the test's page.

**Assumptions** — A-143 to A-148 (§4).

**Open questions** — Q-56.

**Bugs found and fixed while verifying**
- With one stats job a minute, a regrade within a minute of publishing left ranks stale; found by the integration test. A finished job is now removed and queued again, and a running one gets a follow-up.
- On a phone the result page was 9 px wider than the screen; found by the 390 px walk. A grid column without a template grew to fit a truncated label.

**Verification**
- `npm run check` → exit 0; `Test Files 32 passed (32)`, `Tests 497 passed (497)`.
- `npm run test:integration` → exit 0; `Test Files 22 passed (22)`, `Tests 275 passed (275)`.
- `npm run build` → exit 0; `npm run check:bundle` → "119 files scanned … clean".
- `npx playwright test` of the results, assessments, tests, auth, proctoring and code specs → exit 0, `10 passed` (before the phone fix).
- A scripted walk on a sectioned quiz seeded with 20 graded attempts and published results, the stats worked out by the worker:
  - student01's result at 1440 px and 390 px.
  - faculty1's results page, builder, Results dialog and hand-ins.
  - No error page, and no page wider than the screen after the fix. They match mock-ups C5 and C6; the two copied essays were flagged.

### 2026-10-18 · M04b/E2 Test platform: scorecards, certificates, attempt reports and Excel exports · Claude Code, at Aniket's request

Phase E's second part (TP-12) of `docs/milestones/M04b-test-platform.md`, on branch `m04-assessments`, committed locally and not pushed. E3 (the AI helpers, TP-10) follows.

**Created**
- **The rules (07 §20).** `lib/domain/test-files.ts`: `earnsCertificate`, `codeFromBytes` (the verification code) and `pdfSafe` (text the PDF fonts can print), with vectors in `lib/domain/test-files.test.ts`.
- **One set of figures.** `figuresOf`, `rulesOf`, `givenText` and `correctText` moved to the worker-safe `lib/data/results.ts`, so the result page, the scorecard and the certificate show the same numbers. `docOf` moved to `lib/domain/rich-text.ts`.
- **Data.**
  - New `testFiles` collection (`lib/models/test-file.ts`, 05 §5.2f).
  - `submissions.certificateCode`, with a unique partial index.
  - `assessments.results.certificateFromPct`, saved by `saveResultRules` (`certificateFrom`).
  - Upload purpose `test-file`, which only the worker writes; `createUpload` refuses it.
- **The worker job** `compute/makeTestFile` (`worker/jobs/test-files.ts`, `queueTestFile`):
  - the certificate (mock-up C7: A4 landscape, the lockup, a QR code and link to `/v/<code>`, the owner and the Controller of Examinations);
  - the scorecard (A4: the person, the figures, by section and outcome, each question with the answer and, if the rules allow, the right answer);
  - the reports PDF (a cover, then a report per hand-in by name);
  - the Excel export (Results and Questions sheets).
  - Built on disk, uploaded under a new key; only the newest request finishes a file, and the object it replaces is deleted.
  - The logo prints from `public/brand/logo-print.png` (420 px tall), so a PDF is about 150 KB rather than 1.4 MB.
- **Asking and downloading.**
  - `requestTestFile` (limit 10 an hour): the staff's files for manage or oversee once anyone has handed in; a taker's scorecard once their result shows, and a certificate when it is earned.
  - `/api/files` serves a `test-file` by its record's current key only: the staff's files to the test's staff; a scorecard or certificate to its person and the staff.
- **Screens.**
  - `TestFileButton` (`components/test-file-button.tsx`, 08 §5.2): ask, then "being made" (the page refreshes itself), then a download link.
  - It sits on the student's result as Certificate and Scorecard (mock-up C5), and on the results page as Export to Excel and PDF reports with "Make it again" (mock-up C6).
  - A Certificates field in the builder's Results dialog and card.
  - The public check page `/v/<code>` in the sign-in layout, exempt from `proxy.ts`.
- **Tests.**
  - Unit: 18 vectors.
  - Integration (`tests/integration/results.test.ts`, 2 new cases, through the real queue and worker with storage captured):
    - who may ask for what;
    - the certificate's text and code read back out of the PDF;
    - the check page's answer;
    - downloads by the person and the staff but not another taker;
    - a regrade making the scorecard out of date and the certificate no longer earned;
    - the Excel cells and the reports' pages;
    - a made-again file replacing and deleting the old one.
  - E2E (`tests/e2e/results.spec.ts`): student07 downloads a certificate from the e2e bucket and a signed-out visitor checks it; it stays current after "Work them out again"; faculty1 downloads the Excel export.
- **Docs.** 02 §8; 03 (`pdfkit`, `write-excel-file`, `@types/pdfkit`, and `qrcode`'s new use); 05 §5.1, §5.2, §5.2f; 06 §5, §6, §6.2; 07 §20 (new); 08 (routes, `TestFileButton`, `Section`); 09 §3, §4, §5.

**Changed beyond TP-12 (found while verifying)**
- `components/section.tsx`: below 640 px a section's actions now wrap onto more lines. Before, the results page's four buttons made it 83 px wider than a 390 px screen.
- `worker/jobs/compute.ts`: the `testStats` job's writes to attempts (ranks, alike answers) no longer touch `updatedAt`. Before, they made a just-made certificate look out of date.
- `app/(auth)/t/[token]/page.tsx` (phase A) and the new `/v/[code]` page call `connection()`. Both logged Next's "`new Date()` while prerendering" error on each visit; the share-link page had done so since phase A.

**Not done**
- E3 (the AI helpers, TP-10). The mark-band suggestion waits on Q-56.
- Nothing is emailed (A-152).
- Names in a non-Latin script print as "?" (A-150).
- A long table carries on to the next page without repeating its header, and pages are not numbered.
- **Four e2e tests outside M04b fail on this branch.** None touches code this phase changed:
  - `admin-structure.spec.ts` (2): it waits for a workspace heading in the old "CUTM1602 · … · A" form and a "Change enrolment" button, which no longer exist.
  - `content.spec.ts`, the course plan: publishing works ("Version 7 was published"), but the publish bar now replaces the form with that line, so the success text it waits for never appears.
  - The heading, the button and the publish bar all changed in the 17 Oct "fix" commits, so these specs need updating.
  - `live.spec.ts`: no LiveKit server runs on this machine ("fetch failed" on `closeRoom`), so the student never gets into the room.

**Assumptions** — A-149 to A-156 (§4).

**Open questions** — Q-57.

**Bugs found and fixed while verifying**
- The certificate's sentence printed its regular and bold parts on top of each other (pdfkit cannot centre a line whose font changes); it is now laid out word by word. Found by rendering the PDF.
- "Recommended" broke mid-word in the scorecard's figures; each figure is now at least as wide as its value.
- The PDFs were 1.4 MB from the full-size logo (now about 150 KB).
- The stats job, the 390 px results page and the two prerender errors (above).

**Verification**
- `npm run check` → exit 0; `Test Files 33 passed (33)`, `Tests 515 passed (515)`.
- `npm run test:integration` → exit 0; `Test Files 22 passed (22)`, `Tests 277 passed (277)`.
- `npm run build` → exit 0; `npm run check:bundle` → "119 files scanned … clean".
- `npx playwright test` (all 19) → `15 passed`, `4 failed` (the four above), before the `/t/[token]` change. After it, `npx playwright test tests/e2e/tests.spec.ts tests/e2e/results.spec.ts` → `2 passed`, with no prerender error in the server log.
- The certificate and scorecard rendered to images (macOS `sips`) and checked against mock-up C7: one made by the integration test, one made by the e2e worker into RustFS and downloaded through `/api/files`.
- A scripted walk at 1440 px and 390 px, on the e2e data after the spec ran:
  - student07's result with Certificate and Scorecard;
  - `/v/<code>` signed out, and an unknown code;
  - faculty1's results page and the builder's Results dialog;
  - no error page, and no page wider than the screen after the `Section` fix.

### 2026-10-18 · M04b/E3 Test platform: AI drafts in the question bank · Claude Code, at Aniket's request

Phase E's last part (TP-10) of `docs/milestones/M04b-test-platform.md`, on branch `m04-assessments`, committed locally and not pushed. With it every M04b phase is built; the milestone waits for Aniket's walk-through of its validation checklist and the merge.

**Created**
- **The adapter** `lib/integrations/ai.ts` (06 §4.7), with `@anthropic-ai/sdk` 0.133.0 installed (pinned in 03 for M09):
  - `aiConfigured()`, and `draftQuestions({ topic, count, type, level, cos })` through `beta.messages.parse` and `betaZodOutputFormat(AiDrafts)`.
  - The call shape type-checks against the installed SDK.
  - Only the topic, the chosen outcomes' codes and statements, and the level are sent (09 §12).
  - The optional `ANTHROPIC_API_KEY` is in `lib/env.ts` and `.env.example`.
- **The worker job** `compute/draftQuestions` (`queueDraftQuestions`, one try):
  - Each draft is checked as an imported CSV row is (`BankCsvRow`, then `csvItem` and `storedItem`), with its explanation.
  - Only the outcomes the teacher picked are kept.
  - Drafts that pass are saved with `aiDraft: true` (05 §5.2d), within the bank's 5,000.
  - The teacher gets a `bank.drafted` notice whichever way it goes.
- **The action** `draftWithAi` (the bank's editors; 1–20 at a time; the course's outcomes only; limit `ai` 30 an hour). Without the key it answers "AI suggestions are not set up."
- **Review before use.**
  - Saving a draft in its dialog accepts it.
  - Paper draws (`sectionPools`), "From the bank" (`pickFromBank`) and `addFromBank` skip drafts.
- **The screen (mock-up C2), on the bank page:**
  - Draft with AI (`?new=draft`): topic, how many, type, level, the course's outcomes, and a note on what is sent.
  - The "AI drafts to review" tile; each draft's "AI draft · review it" chip and Review button; the "Review the AI draft" dialog.
- **Tests.**
  - Integration: `tests/integration/ai-drafts.test.ts`, 3 cases through the real queue and worker, with the AI's answers stubbed. They check:
    - what is sent;
    - the row checks, kept outcomes and options containing "|";
    - drafts kept out of tests and draws until reviewed, then offered;
    - the refusals (no key, a reader, another course's outcomes, more than 20, a student);
    - a person's own bank;
    - the notices for a failure and for nothing usable.
  - E2E: `tests/e2e/bank.spec.ts`. On the e2e server, which has no key, Draft with AI says it is not set up and asking is refused with that message.
- **Docs.** 02 §8 and the adapter table; 03; 05 §5.2d; 06 §4.7, §6, §6.2, §9; 08 (bank route, `QuestionBank`); 09 §4, §12; 11 §2.

**Changed beyond TP-10 (found while building or verifying)**
- `requireOfferedLanguages` moved from `lib/data/questions.ts` to `lib/data/code.ts`, because it reads settings (`next/cache`). `questions.ts` is now worker-safe and `paragraph` is exported.
- The bank's tile labels wrap instead of being cut off. The new "AI drafts to review" tile was cut off at 390 px ("AI drafts to r…"), as were three existing ones.

**Not done**
- **The AI has not been called for real.** There is no key on this machine, so no request has gone to the Anthropic API. The SDK call is checked only by the types and the stubbed tests. Setting `ANTHROPIC_API_KEY` and drafting once is the first thing to try.
- TP-10's suggested mark bands for written and code answers wait on Q-56.
- The submit button says "Draft the questions", not "Draft 10 questions" as in mock-up C2: the label does not follow the number typed.
- The same four e2e tests outside M04b still fail (E2 entry). The walk left three AI drafts in CUTM1602's bank on the e2e database, to review in the walk-through.

**Assumptions** — A-157 to A-161 (§4).

**Open questions** — none new; Q-56 stands.

**Verification**
- `npm run check` → exit 0; `Test Files 33 passed (33)`, `Tests 515 passed (515)`.
- `npm run test:integration` → exit 0; `Test Files 23 passed (23)`, `Tests 280 passed (280)`.
- `npm run build` → exit 0; `npm run check:bundle` → "119 files scanned … clean".
- `npx playwright test` (all 20) → `16 passed`, `4 failed`: `admin-structure` (2), `content` (the course plan), `live` (no LiveKit here), as in E2.
- A scripted walk at 1440 px and 390 px on the e2e data with three drafts in CUTM1602's bank: the bank, the Draft with AI dialog and a draft's review dialog. No error page, and no page wider than the screen. They match mock-up C2, with outcomes as checkboxes as in the question dialog.

### 2026-10-18 · M04b/E3 follow-up: the AI is OpenAI's, and the test server · Claude Code, at Aniket's request

Aniket asked for ChatGPT rather than Anthropic, because of the cost.

**Changed**
- `lib/integrations/ai.ts` now uses `openai` 7.27.0, the newest release more than two weeks old, through `responses.parse` with `zodTextFormat(AiDrafts)`; `@anthropic-ai/sdk` is removed.
- The settings are `OPENAI_API_KEY` (optional, as before) and `OPENAI_MODEL` (default `gpt-5.4-mini`, a small, inexpensive model).
- Every Anthropic reference is replaced: `lib/env.ts`, `.env.example`, `scripts/check-bundle.ts` (it now scans for `OPENAI_API_KEY`), AGENTS.md's vendor list, 02, 03, 06 §4.7, 09, 11, and the M04b and M09 milestone files.
- Nothing else changes: the job, the checks on drafts, the screens and the tests are as in E3.

**Found while checking "no test or assessment option"**
- The test server (lms.devsomeware.com) runs the pushed release (its `/v/<code>` page answers).
- The local dev server on port 3000 runs from the main folder, still at `9648e6a`, from before M04, so it has no Tests or Assessments until that folder is pulled.
- An admin finds Tests in the sidebar's Menu group (not under Administration), and a course's Assessments tab under My courses.

**Deployed and checked on the test server (18 Oct 2026, at Aniket's request)**
- `OPENAI_API_KEY`, `OPENAI_MODEL` (`gpt-5.4-mini`) and `CODE_RUNNER_URL` copied from Aniket's local `.env` into `/etc/cutm-lms/app.env`, after a backup (`app.env.bak-20261018`).
- `cutm-lms-worker` and `cutm-lms-web` restarted; both processes carry the three settings, and `/api/health` answers ok.
- The running release is `8765058`, and it has `public/brand/logo-print.png`, `pdfkit`, `write-excel-file`, `openai` and `qrcode`.
- The key is a restricted project key: it may not list models (401 on `/v1/models`), but `/v1/responses` answers 200.
- The real adapter was run once on the server (`draftQuestions`, 2 easy one-answer questions, nothing saved): OpenAI returned 2 well-formed drafts with 4 options and a right answer each. This is the first live AI call.

**Verification**
- `npm run check` → exit 0; `npm run test:integration` → exit 0 (the AI drafts tests stub the adapter, which is unchanged in shape); `npm run build` → exit 0; `npm run check:bundle` → clean.

### 2026-10-18 · Generated marks on the remaining pages and dialogs · Cursor

Aniket said pages and modals were still missing the clay marks.

**Created**
- `public/icons/`: assignment, bank, blank, chart, chat, code, cover, fileq, lab, labtest, matching, mcq, msq, numeric, ordering, quiz, sparkle, textq, trophy, truefalse. `blank` was regenerated once: the first mark was a hairline and read as a dash at 16 px.

**Changed**
- `components/page-icon.tsx`: those keys.
- Assessment type picker and its dialog (`MODE_ICON`), question types and their dialog (`TYPE_ICON`), the mode chip, and the “add a question” buttons.
- Course workspace tabs and the header chips; the cover, lesson, module, plan, people, users, imports, syllabus PDF, live-monitor, results, instructions, and question-bank dialogs and sections.
- 08 §5.2 (`PageIcon`, `TabNav`).

**Not done** — `npm run check`, the integration suite, and a production build were not re-run. Count tiles that report a status (handed in, warnings, dropped) still use Phosphor. Buttons and row actions still use Phosphor.

**Assumptions** — A dialog uses the mark of the thing it names. A button that does the action keeps Phosphor. Syllabus and Records both use the books mark.

**Open questions** — none.

**Verification** — `npx tsc --noEmit` clean; eslint on the changed TSX clean; Prettier applied. On `next dev`, signed in as `admin@seed.cutm.test`: the course tabs each show a loaded mark; New assessment shows the eight type marks; the question bank’s ten type buttons and the fill-in-the-blanks dialog show marks; Course cover and Import users dialogs show marks. Hovering a home tile leaves the picture transparent (`rgba(0,0,0,0)`) and does not fill the chip with the primary colour.

### 2026-10-23 · Housekeeping after the M04 merge, and M05 closed · Claude Code, at Aniket's request

Request: "plan the next milestone properly based on the changes in the previous milestone and do it", then "what about m5". The plan: close M05 (M04b built most of it), tidy what the merge left, then M06 on Aniket's answer to Q-41 (next entry).

**Created**
- `893d6c3` M04b(report): the branch's last commit (the first live OpenAI call on the test server), cherry-picked onto main. The `m04-assessments` worktree and branch are removed; nothing else on them was missing from main.
- `175585f` M04(docs): the provisional assumptions take their numbers, A-M04-1…7 → A-102…A-108 and A-M04b-1…53 → A-109…A-161, in §4 and wherever docs or code cite them. The status table says what is committed and pushed (M03b, M03c, M04, M04b).
- `e88d820` M03b(e2e): `tests/e2e/admin-structure.spec.ts` follows the workspace header (the course title), the Outcomes tab, "Upload CSV" and the ten-a-page departments list; `tests/e2e/content.spec.ts` waits for the plan's "Version n was published" line.
- `0dc0a1f` M05(lab):
  - `lib/data/assessments.ts` (`listSubmissions`: `codeActivity`, `codeMarks`; the grading view's `startedAt`), `components/hand-ins.tsx` (Sample runs, Code marks), `components/grading-view.tsx` (time from start to hand-in; "Every run").
  - `lib/schemas/assessment.ts` (`StartAttempt`), `app/(attempt)/…/attempt/actions.ts` (`startAttempt` refuses a new attempt without `agree`).
  - Tests: `tests/integration/proctoring.test.ts` (a start without the tick is refused and makes no attempt; continuing asks nothing), `tests/integration/code.test.ts` (the hand-ins list's runs, best run and code marks), and `agree` in every other test that starts an attempt.
- This commit: `docs/milestones/M05-virtual-lab-proctoring.md` (where each task was built, AC-M05-05 reworded to 07 §15), 06 (`startAttempt`), 08 (`HandInsView`, `GradingPage`), 09 §11.

**Not done**
- M05's human checklist: one real lab with three students on the real runner, a cheating walk, Q-09 with the client, 50 students pressing Run at once.
- `tests/e2e/content.spec.ts`'s two tests were not run green here: the video upload needs RustFS and the plan email needs Mailpit, and neither is installed on this machine (no Docker). `live.spec.ts` needs LiveKit. The changed assertion matches the text at `app/(app)/courses/[offeringId]/plan/page.tsx:132`.

**Assumptions** — none.

**Open questions** — none new.

**Verification**
- `npm run check` → `Test Files 33 passed (33)`, `Tests 515 passed (515)`.
- `npm run test:integration` (local replica set and Redis) → `Test Files 23 passed (23)`, `Tests 281 passed (281)`.
- `npm run build` → exit 0. Next.js 16.4.0 stops every other build after compiling with a `SecurityFatalError` ("affected by a known security vulnerability", asking to run `next upgrade --agent=security`); the next run completes. Not acted on: the version is pinned in 03 and the upgrade is Aniket's call.
- `npx playwright test tests/e2e/admin-structure.spec.ts` → `4 passed`.
- `npx playwright test tests/e2e/assessments.spec.ts tests/e2e/proctoring.spec.ts tests/e2e/code.spec.ts` on the new build → `3 passed` (the lobby's tick posts `agree`).
- A scripted look at a graded coding hand-in on the e2e data as faculty1, at 1440 px and 390 px: the hand-ins list ("1 run · best 1 of 1 passed", "5 / 5") and the grading page ("2 s after starting", Every run). No error page and nothing wider than the screen; the first layout pushed Open past the card at 1440 px, so the runs and the best run share one column.

### 2026-10-23 · M06/T0 Decisions and mock-ups · Claude Code, at Aniket's request

Aniket answered Q-41 by choosing the recommended option on each of its four points (decisions 1–4 in `docs/milestones/M06-continuous-evaluation.md`).

**Created** — `da48ab5` M06(docs): the M06 milestone file (decisions, tasks T1–T5, AC-M06-01 to 06); 07 §2 (the internal-marks rules, vectors and a worked example computed by script); 05 §2, §5.1 (`countsToward`), §5.3 (`internalMarks` rewritten), §5.3a (`rubricMarks`); 06 §6 (`compute/internalMarks` debounced on `ce-<offeringId>`, `compute/internalMarksNightly`); 02 §8; 09 (permissions, audit actions); 01 (CE-06, CE-10, REC-04); the M08 file (externals by CSV); §3 Q-41 answered; §2 M06 in progress.

**Not done** — T1–T5. They wait for the mock-up picks.

**Assumptions** — none yet in §4 (they arrive with the code that needs them).

**Open questions** — none new. Found while drawing the mock-ups: a teacher's course tabs are 1212 px wide in a 1104 px row at 1440 px, so People is already scrolled out of view, and Marks makes the row longer. Asked in the mock-up round.

**Verification** — 18 mock-ups drawn inside the real app (the e2e build on port 3100, faculty1, student05, the HoD and admin on CUTM1602), static content in place of the new screens, compiled by Tailwind's browser build with the app's theme: M1 A/B, M2 A/B, M3, M4 (dialog and builder card), M5 (HoD and admin), each at 1440 px and 390 px, none wider than the screen. Shown to Aniket on one page: https://claude.ai/artifact/L5ejrmQXhWfAriP3QPH2Rb (private).

### 2026-10-23 · M06 Continuous evaluation (T1–T5) · Claude Code, at Aniket's request

Built to decisions 1–4 (Q-41) and the mock-up picks (M1 A, M2 A, M3–M5, the tab row scrolling with a fade), all in `docs/milestones/M06-continuous-evaluation.md`. Commits on main, not pushed: `85efaf3` foundation, `a5e57b4` server, `3096ba4` screens, and this report.

**Created**
- **Data and rules** (05 §5.1, §5.3, §5.3a; 07 §2–3):
  - `lib/models/internal-mark.ts`, `lib/models/rubric-mark.ts`, `assessments.countsToward`; `lib/schemas/marks.ts`; `scripts/sync-indexes.ts`.
  - `lib/domain/evaluation.ts` (`partMarks`, `addedUp`, `computeInternalMarks`) and `lib/domain/trend.ts` (`computeTrend`), with every 07 vector and the worked example.
  - The `ceTrend` setting and its form; `InternalMarksJob`, `InternalMarksNightlyJob`.
- **Server:**
  - `lib/data/internal-marks.ts` (`recomputeInternalMarks`, worker-safe).
  - `lib/data/marks.ts` (`getMarksSheet`, `getRubricSheet`, `getMyMarks`, `getCeReport`).
  - `queueInternalMarks` sharing one debounced helper with `queueTestStats` (`lib/queue.ts`).
  - The worker's `internalMarks` and `internalMarksNightly` jobs, and its scheduler.
  - `assertUnlocked` in `lib/data/offerings.ts`.
  - Recompute triggers on releasing results, regrading and waiving after publication, `gradeCode`, finalizing and marking attendance, enrolment changes, "Counts toward", rubric saves and a policy refresh.
  - Actions: `saveRubricMarks`, `requestRecompute` (`marks/actions.ts`), `refreshEvaluation` (admin offerings), and `countsToward` on `createAssessment` and `updateAssessmentSettings`.
- **Screens:**
  - `marks/page.tsx` (teacher, HoD and admin; and the student's own); `marks/[component]/page.tsx` (the rubric grid); `reports/ce/page.tsx` with Reports in the sidebar.
  - "Counts toward" (`CountsTowardField`) in the New assessment dialog and the builder's settings; the admin offering's ⋮ Refresh the evaluation policy.
  - `TabNav`: scrolls to the current tab, fades where there are more, never widens the page.
  - `PART_LABEL`, `CRITERION_LABEL`, `TREND_LABEL`, `formatMarks` in `lib/format.ts`; the settings page reads its rubric labels from there.
- **Tests:**
  - Unit: 23 new.
  - Integration: `tests/integration/internal-marks.test.ts`, 11 cases.
  - E2E: `tests/e2e/marks.spec.ts`.
- **Docs:** 01, 02 §8, 05, 06 §6–7, 07 §2, 08 (routes, `TabNav`, `NewAssessmentDialog`, `TrendChart`), 09, the M06 and M08 files.

**Acceptance criteria**

| AC | Result | Evidence |
|---|---|---|
| AC-M06-01 | Pass | Integration: the worked example as real records stores theory 28.53 (28.5333…), practice 40.5 and 76.7 % |
| AC-M06-02 | Pass for releasing results and saving a rubric; the other triggers are wired and not each tested | Integration: releasing results queues one `ce-<id>` job that the real worker runs, and a change seconds later joins it. E2E: from an empty `internalMarks`, a rubric save reaches the page through the worker within the 30 s wait |
| AC-M06-03 | Pass | Unit: 07 §3's table (80, 70, 60, 50 → dropping; 90, 40 → insufficient) |
| AC-M06-04 | Pass | Integration: a changed Settings policy moves nothing; an admin's refresh does, audited with before and after; a teacher is refused |
| AC-M06-05 | Pass | Integration: another department's HoD gets 404 and an empty report; a student reads only their own row (no classmate's id in the response). E2E: the HoD's report lists the class; the student's page shows only their breakdown |
| AC-M06-06 | Pass | Integration: "Counts toward" and rubric saves are refused while locked; each change is audited (`assessment.counts_toward`, `marks.rubric_saved`) |

**Changed beyond the tasks (found while building)**
- "What counts" lists drafts as well, marked "draft". Otherwise it said nothing counted toward a part right after a teacher chose one.
- The builder's Settings dialog says "what it counts toward" can still change once students have started.
- Refresh the evaluation policy lives in the row's ⋮ menu: a button on every row of the offerings list was clutter.

**Not done**
- The human validation checklist: five students against a hand-made spreadsheet, Q-06 with the client, the 10-second "dropping" check, and Mid-term II as a presentation with the client.
- External marks: M08, by the exam section's CSV (decision 4).
- CE-10 beyond the rubric entry waits on Q-06.
- On phones, wide tables (the Marks tab's included) still scroll sideways with no cue (P2 of the mock-up round; not picked).
- `TrendChart` is drawn inside the Marks route until M10 gives it a second route (08 §5.2).

**Assumptions** — A-162 to A-169 (§4).

**Open questions** — Q-58 (§3).

**Verification**
- `npm run check` → `Test Files 34 passed (34)`, `Tests 538 passed (538)`.
- `npm run test:integration` (local replica set and Redis) → `Test Files 24 passed (24)`, `Tests 292 passed (292)`.
- `npm run build` → exit 0, after the same Next.js 16.4.0 `SecurityFatalError` notice stops every other build (M05 entry). `npm run check:bundle` → "139 files scanned … clean".
- `npx playwright test` of admin-structure, assessments, bank, catalog, code, marks, people and proctoring → 10 passed, 1 failed:
  - `bank.spec.ts` fails because the local e2e server has an AI key. Next copies `.env`, which holds the real `OPENAI_API_KEY` since 18 Oct, into `.next/standalone`, and the spec expects no key. It is unrelated to M06 and does not happen in CI.
  - `marks.spec.ts` also passed again from an empty `internalMarks` (20 rows written by the worker).
  - Not run here: auth, content, results and tests (Mailpit and RustFS are not installed), and live (LiveKit).
- A scripted walk of the real screens on the e2e data, at 1440 px and 390 px:
  - As faculty1 (Marks tab, "Work them out again", the rubric grid filled and saved, New assessment, the builder and its Settings), student01 (their marks), the HoD and admin (the CE report), and admin (offerings, the trend setting, the Marks tab).
  - No error page, and nothing wider than the screen after two fixes found on the way: the tab row widened the page at 1440 px (fixed by inline-size containment), and the rubric grid hid its Total column (long headings now wrap).

### 2026-10-23 · The sidebar's Profile and Sign out stay in view · Claude Code, at Aniket's request

Request: "the sidebar is getting short in many screens based on the screenshot … profile and settings should be fixed, not scrollable".

**Found**
- In a real window the sidebar is fixed and full height while the page scrolls. Measured at 1440 × 768 and × 900, scrolled to the bottom, as admin and faculty1: it spans the window each time.
- The short white strip in the earlier screenshots comes from full-page captures, which draw fixed elements once, at the top. From now on the screen walks report the window as well.
- What was wrong: Profile and Sign out were the last group inside the scrolling menu. An admin's menu (one item longer with Reports) is taller than its space even at 900 px, so they scrolled with it. At 768 px they sat below the window: their bottoms were at 852 and 898 px.

**Changed**
- `components/app-nav.tsx`: `AppNav({ roles, foot })`, where `foot` renders only the Account group.
- `app/(app)/layout.tsx`: that group and Sign out sit in a `SidebarFooter` (inside `<Suspense>`, as `usePathname` needs), below the scrolling menu. The sidebar keeps its look.
- 08 §3 and §5.2.

**Then (Aniket):** a hairline rule (`SidebarSeparator`, inset like the groups) sets the footer off from the menu. The primitive's own full width had to be overridden, or it ran 15 px past the sidebar.

**Not done** — An admin's menu still scrolls above the footer on a laptop-height window (Settings, Audit log and Users at 768 px). The rule marks where it ends.

**Verification**
- Measured again: Profile's and Sign out's bottoms are at 706 and 752 px in a 768 px window, and 838 and 884 px at 900 px, for admin and faculty, scrolled or not.
- The phone sheet (390 px) shows both pinned under the menu.
- `npm run check` → `Tests 538 passed (538)`. `npm run build` → exit 0.
- `npx playwright test tests/e2e/admin-structure.spec.ts tests/e2e/marks.spec.ts tests/e2e/people.spec.ts` → `6 passed`.

### 2026-10-23 · Decision: M07 projects · Claude Code, at Aniket's request

Request: "continue". With M06 done, Aniket chose (`docs/milestones/M07-projects.md`, decisions 1–3):
1. M07 before M08.
2. Project reviews fill the project rubric: each review marks the policy's six criteria per member, and the project internal is their average criterion by criterion.
3. GitHub is built now against mocks, with Aniket's test App for the test server until CUTM's organisation (Q-22).

**Changed docs**
- The M07 file: decisions, the mock-up list, the tasks rewritten.
- 05 §5.3a, §6.3a; 07 §2 (the review averages, with vectors); 06 §6; 02 §8; 09; an M06 note on decision 3.

**Dev consequence** — A review is its own record (`projectReviews`), not a `project_review` assessment: students hand nothing in, and the engine expects attempts.

### 2026-10-23 · Next.js 16.4.0 → 16.4.3, a security upgrade · Claude Code, at Aniket's request

Request: the terminal output of `npm run dev`, which exited after "Upgrade: Next.js 16.4.0 → 16.4.3 … No supported coding agent found". Aniket chose "Upgrade now".

**Found**
- `next dev` was not crashing. Next's default upgrade policy (`experimental.agentUpgrade: 'security'`) found 16.4.0 affected and offered a menu in the terminal; choosing Update stopped the server to hand the upgrade to a coding agent, found none, and exited.
- `npm audit` on 16.4.0: GHSA-2464-fhr4-w9xw (critical, unauthenticated RCE in the Image Optimization API with SVG), GHSA-673q-mjm6-r5xr (critical, unauthenticated RCE in `use cache` functions returning typed arrays) and GHSA-p3m5-59mp-jv5r (high, DoS in App Router Server Actions), all `>=16.0.0 <=16.4.0`. The app uses `cacheComponents` and Server Actions.

**Changed**
- `package.json`, `package-lock.json`: `next` and `eslint-config-next` 16.4.3, exact. Only the `next`, `@next/*` and `eslint-config-next` entries of the lockfile changed.
- 03 §2 and the `@next/playwright` row: 16.4.3.

**Not done**
- `experimental.agentUpgrade` is not written into `next.config.ts`, although Next's upgrade prompt asks for it: `'security'` is already its default (`node_modules/next/dist/server/config-shared.js`), so the line would change nothing (04 §1).
- No pull request: work goes on `main`, and the `gh` CLI is not installed, so open PRs were not checked for duplicate work. Local branches and history had none.

**Verification**
- `npx next --version` → `Next.js v16.4.3`. `npm audit` → `found 0 vulnerabilities`. Next's own assessment for 16.4.3 → `affected: false`.
- `npm run check` → exit 0, `Tests 538 passed (538)`.
- `npx next build` → exit 0, 64 pages. Run in an APFS clone of the checkout, because another session's e2e server was serving `.next/standalone` from this one.
- `npx next dev -p 3200` in the same clone → `GET /login 200`; `AGENTS.md` unchanged.
- Not run: integration and e2e tests.

### 2026-10-23 · M07 Projects (T1–T10) · Claude Code, at Aniket's request

Built to decisions 1–3 and the mock-up picks (P2 A, P3 A; P1, P4 and P5 as drawn), all in `docs/milestones/M07-projects.md`. Commits on main, not pushed: `d300399` foundation, `d64e1ba` server, `128a384` screens, and this report.

**Created**
- **Data and rules** (05 §6, 07 §2, §12, §13):
  - `lib/integrations/github.ts` (`octokit` 5.0.5) and the six optional `GITHUB_*` variables.
  - `lib/models/{project,project-task,commit,project-review}.ts`, `lib/schemas/projects.ts`, `scripts/sync-indexes.ts`.
  - `lib/domain/commits.ts` (`computeCommitMetrics`, `goodMessage`), `lib/domain/tracker.ts` (`computeTrackerMetrics`, `canMoveTask`) and `reviewAverages` in `lib/domain/evaluation.ts`, with every 07 vector.
  - The `projects` setting, the `task.assigned` notification, the `github` token purpose; `liveSessions.reviewId` and `kind: 'review'`.
- **Server:**
  - `lib/data/projects.ts` (`listProjects`, `getProject`, `getReviewSheet`), `lib/data/integrations.ts`, `getGithubLink` in `lib/data/users.ts`.
  - The worker's `githubProject` and `githubNightly` jobs (`worker/jobs/github.ts`), debounced as `gh-<projectId>` (`queueGithubSync`); a review's live class takes no attendance.
  - The project internal from the reviews' averages in `recomputeInternalMarks`; `saveRubricMarks` refuses the project rubric.
  - Actions: `saveProject`, `linkRepository`, `requestGithubSync`, `saveTask`, `moveTask`, `deleteTask`, `saveReview`, `deleteReview`, `saveReviewMarks` (`projects/actions.ts`); `startGithubLink`, `unlinkGithub` (profile); `retryJob` (admin integrations).
  - Routes: `/api/auth/github/callback`, `/api/webhooks/github`.
- **Screens:**
  - `projects/page.tsx` (P1) and its `ProjectDialog`; `projects/[projectId]/page.tsx` (P2 A, P3 A, the reviews) and its task, review and repository forms; `projects/[projectId]/reviews/[reviewId]/page.tsx` (P4).
  - The Projects tab when the course has project credits; the Marks tab's project rubric says it is the reviews' average and links to Projects.
  - The profile's GitHub card and `/admin/integrations` (P5), with Integrations in the admin sidebar.
- **Tests:**
  - Unit: 36 new.
  - Integration: `tests/integration/projects.test.ts`, 10 cases (GitHub mocked).
  - E2E: `tests/e2e/projects.spec.ts` (task tracker only, decision 3); the e2e seed gains CUTM1014 · 2026-ODD · A on the tracker, taught by faculty2.
- **Docs:** 02 §8, 05, 06 §4.5, §6–7, 07 §2, 08 (routes, `DataTable`), 09, 10 (the e2e fixtures), 11, the M06 and M07 files.

**Acceptance criteria**

| AC | Result | Evidence |
|---|---|---|
| AC-M07-01 | Pass against a mocked GitHub | Integration: a repository without the App is refused with the install hint; a linked one is kept in GitHub's spelling, once in the LMS |
| AC-M07-02 | Pass against a mocked GitHub; not timed with a real App | Integration: a sync upserts commits once and attributes them by GitHub id, then login; a signed `push` to a linked repository queues its sync; a bad signature gets 401. The nightly scheduler is wired |
| AC-M07-03 | Pass | Unit: 07 §12's member and message vectors. Screen: the table shows every part of the score with the formula under it; reviews are marked by the teacher |
| AC-M07-04 | Pass | Unit: 07 §13's table and all 16 moves per actor. Integration: another member cannot move a task; the assignee cannot mark it done. E2E: the student has no Mark done; after the teacher's, Deadlines reads 2 assigned, 1 done, 1 on time, 0 overdue, 100% |
| AC-M07-05 | Pass | Integration: review marks become the project internal, audited (`project.review_marked`), refused while locked. E2E: the student's Marks tab shows "Project · 40.5 of 50" within the 30 s wait |

**Changed beyond the tasks (found while building)**
- The projects list showed every project on one page, against law 5. It now shows ten a page, and reads reviews only for that page's projects.
- `DataTable` (08 §5.2): a short table with a fixed cap (a team's members, a review's rows, the integrations lists) leaves out the five paging props and has no "Showing 1–3 of 3" footer.
- The latest ten commits, not 20: 20 made the page long on a phone, and the picked mock-up shows a short list. T6 now says ten.

**Not done**
- GitHub with a real App: linking an account and a repository, three pushes attributed within a minute (T10's manual check). It waits on Aniket's test App credentials, and on CUTM's organisation (Q-22) after that.
- The human validation checklist: one CSE team for a week, one non-CSE project on the board, and one review held in the live room.
- A review held as a live class is built and tested at the integration level only. The live e2e needs LiveKit, and PRJ-10 waits on Q-03.
- On phones, the member and Deadlines tables scroll sideways inside their cards with no cue, as M06's tables do.

**Assumptions** — A-170, A-171 (§4).

**Open questions** — none new; Q-22 and Q-03 stay open.

**Verification**
- `npm run check` → `Test Files 37 passed (37)`, `Tests 574 passed (574)`.
- `npm run test:integration` (local replica set and Redis) → `Test Files 25 passed (25)`, `Tests 302 passed (302)`.
- `npm run build` → exit 0 on the first try. `npm run check:bundle` → "141 files scanned for 4 names and 6 secret values; clean".
- `npx playwright test` (all 22) → 15 passed, 7 failed:
  - `projects.spec.ts` passed. Its first run failed on a race in the spec, not in the app: the spec read the teacher's address before the project page had opened. It now waits for the page.
  - These also passed: admin-structure (4), assessments, auth (4 of 5), catalog, code, marks, people and proctoring.
  - The seven failures all need a service that is not installed here:
    - Mailpit: auth's invitation, content's plan, tests' guest code (`fetch failed`).
    - RustFS: content's video upload, results' certificate.
    - LiveKit: live.
    - bank: the local `.env` AI key, as in the M06 entry.
- A scripted walk of the real screens at 1440 px and 390 px:
  - On a second server with placeholder GitHub settings and a demo GitHub project of 38 commits, removed afterwards.
  - As faculty1 (the GitHub list, project, review grid, the review and edit dialogs), faculty2 (the tracker list, the board after adding an overdue task, the task dialog, the read-only project rubric), student01 (Your project, the board, their GitHub project, the profile linked), student04 (the profile unlinked, `?github=taken`) and admin (Integrations, the course tabs).
  - No error page, and nothing wider than the screen. The fixes it led to: the pager on capped tables, the commit list's length, and a doubled space on the board's cards.
- `npx prettier --check` also flags three files unchanged since before M07 (`app/(app)/admin/offerings/actions.ts`, `lib/domain/proctoring.test.ts`, `lib/integrations/code-runner.ts`); left as they are.

### 2026-10-23 · Decision: M08 exam integration and grade sheets · Claude Code, at Aniket's request

Request: "continue and plan next milestone". M07's seven commits were pushed to `origin main` first (`3c2105e..b8e93ae`, a fast-forward), at Aniket's choice. Aniket chose the recommended option on each of three points (`docs/milestones/M08-exam-integration-grades.md`, decisions 1–3):
1. The exam section fills in the LMS's internal-marks file (three empty external columns: a number, `AB`, or blank where the course lacks the component) and uploads the same file back.
2. No mark is guessed: a lock over incomplete internal marks needs a reason, and those students get no grade sheet. They are listed with what is missing until the course is unlocked, fixed and locked again.
3. `AB` in any external part makes the course grade Ab, 0 points, its credits counted in the SGPA.

**Dev consequences** (in the milestone file)
- A batch and a term are the unit of work: an exported file must import whole, and a department's term (about 18,000 rows) would not. The end-sem import takes up to 10,000 rows.
- Locking several courses and working out a batch's grade sheets run in the worker (`compute/lockOffering`, `compute/gradeSheets`). Locking one course and publishing a batch stay in the request.
- Unlocking, or importing a student's end-sem marks, turns their draft sheets `incomplete`, so a stale draft cannot be published.
- T2 is mostly built since M04, M06 and M07. Two gaps remain: the sweep's release-by-rule, and deleting an assessment whose results are published.
- `examIntegration` waits for T7 (Q-04).

**Changed docs**
- The M08 file: decisions, consequences, lock semantics, the mock-up list (E1–E6), and tasks T1–T9 rewritten. T9's 07 §6 vector now reads O, A, B+ and SGPA 8.58; the file still had A, B, A+ and 7.56, from before M01b.
- 05 §3.8, §5.4 (per-component `externals`), §5.5 (`batchId`, `incomplete`, `missing`, indexes), §7.4 (`marks_lock`, `grade_sheets`, `batchId`).
- 06 §3, §6 (two jobs), §7 (`grading` rules; `examIntegration` waits), §8.3 and §8.4 rewritten. 06 §8.3 no longer says "non-locked".
- 07 §6 (decisions 2 and 3, `externalMaxima`, the `AB` vector computed by script: 72.2 → 73, Ab; SGPA 53 / 12 = 4.42).
- 02 §8; 08 §2–3; 09 §6.

**Not done** — T0's mock-ups (next), T1–T9.

**Assumptions** — none yet in §4 (they arrive with the code that needs them).

**Open questions** — none new. Q-04, Q-21, Q-39, Q-40 and Q-58 stay open. Q-58 now affects grade sheets: an in-person course with no classes recorded in the LMS leaves every student `incomplete` (decision 2).

**Verification** — Docs only. The two vectors were computed by script (`python3`). A search of `docs/` for the old CSV columns, "non-locked", `departmentId=` and the old 7.56 vector finds them only in this log.

### 2026-10-23 · M08/T0 Mock-ups · Claude Code, at Aniket's request

**Created** — the mock-up list's note and link in `docs/milestones/M08-exam-integration-grades.md`; this entry.

**Drawn** — Inside the real app (the e2e build on port 3101, as admin and student01): the real sidebar and header, with static content where the new screens go, compiled by Tailwind's browser build with the app's theme. Ten screens, each at 1440 px and 390 px:
- the term's batches;
- E1 A (four tabs) and E1 B (four numbered steps);
- E2 (the lock dialog for incomplete students, and a bulk lock's result);
- E3 (the upload, its failures and the courses still without external marks);
- E4 (grade sheets before publishing);
- E5 A (a mark sheet) and E5 B (a card per course);
- E6 (Settings › Grading, and the exam section on Integrations).

The student's sheet was worked out by script with 07 §6: 83, 76, 83 and 71 % give A+, A, A+ and A, and SGPA 119 / 14 = 8.50. Exams and Results use the `diploma` sidebar icon, unused until now.

**Not done** — T1–T9: they wait for the picks.

**Assumptions** — none.

**Open questions** — none new. On phones, the course and student tables scroll sideways inside their card with no cue, as M06's and M07's do. Noted on the page for Aniket to decide.

**Verification** — Every screen measured no wider than its window after three fixes:
- the tab row and the file field were given `min-w-0`;
- `PageHeader`'s own `min-w-0` wrapper was copied into the mock-ups;
- the upload's failures became a list, since a table squeezed the problem column on a phone.

Shown to Aniket on one page: https://claude.ai/artifact/TLMeWHfZFN2VXqcycpz42m (private).

### 2026-10-23 · M08 Exam integration and grade sheets (T1–T9) · Claude Code, at Aniket's request

Built to decisions 1–3 and the mock-up picks (E1 B, E5 B; E2–E4 and E6 as drawn), all in `docs/milestones/M08-exam-integration-grades.md`. Commits on main, not pushed: `ba00e0f` foundation, `12d269c` server, `6312990` screens, and this report.

**Created**
- **Data and rules** (05 §5.4–5.5, §7.4; 06 §7–8; 07 §6):
  - `lib/models/{end-sem-mark,grade-sheet}.ts`; `syncRuns` gains `marks_lock`, `grade_sheets` and `batchId`; the `grading` setting; the `gradeSheet.published` notification; `lib/schemas/exams.ts`; two job payloads.
  - `lib/domain/grades.ts` (`gradeSheetRow`, `gradeSheet`, `sgpa`, `gradeFor`, the maxima) with 07 §6's table, boundaries, the `AB` vector and the incomplete cases.
  - `parseEndSemCsv`, `checkEndSemRow` and `buildInternalMarksCsv` (formulae escaped) in `lib/domain/csv.ts`; `readCsv` takes a row limit.
- **Server:**
  - `lib/data/locks.ts`: the lock with its reason rule, and the bulk job's count that finishes its run in one pipeline update.
  - `lib/data/grade-sheets.ts`: the `gradeSheets` job, 200 students at a time.
  - `lib/data/exams.ts`: the page reads, and a student's own published sheets.
  - `recomputeInternalMarks` takes the lock it closes (`lockedAt`), so locking works the marks out once more straight after the lock.
  - Actions `lockOffering`, `lockCompleteCourses`, `unlockOffering`, `importEndSem`, `computeGradeSheets`, `publishGradeSheets`, `unpublishGradeSheets` (`app/(app)/admin/exams/actions.ts`); the route `/api/exports/internal-marks`.
  - The hourly sweep leaves a locked course's results alone (T2); Integrations reads the exam runs.
- **Screens:**
  - `/admin/exams` (the term's batches) and `/admin/exams/[batchId]` (E1 B: four steps; E2 the lock and unlock dialogs; E3 the upload and its failures; E4 the sheets).
  - `/admin/exams/[batchId]/[studentId]`; `/results` (E5 B) with print rules in `globals.css`.
  - Settings › Grading with a worked example; Integrations › Exam section; Exams and Results in the menus.
  - `GradeSheetCard` and `PrintButton` in the 08 §5.2 inventory.
- **Tests:**
  - Unit: 34 new.
  - Integration: `tests/integration/exams.test.ts`, 9 cases, through the real compute worker.
  - E2E: `tests/e2e/exams.spec.ts`. The e2e seed gains a closed term 2025-EVEN with one practice course, LAB0201, whose lock, marks and sheets each seed starts over.
- **Docs:** 05, 06 (§3, §6, §7, §8.3–8.4), 07 §6, 02 §8, 08, 09, 10, the M08 file.

**Acceptance criteria**

| AC | Result | Evidence |
|---|---|---|
| AC-M08-01 | Pass | Integration: a lock over incomplete marks needs a reason (audited with it); locked, `refreshEvaluation` returns LOCKED (grading, results, `countsToward`, rubric and review marks and enrolments are already tested since M04–M07); the sweep publishes nothing for a locked course until it is unlocked; unlocking needs a reason, is audited, and is refused while a published sheet includes the course |
| AC-M08-02 | Pass; not opened in Excel | Integration: only locked courses, one row per enrolment, the shared header, internals at 2 dp, three empty external columns. E2E: the downloaded file has 20 rows. Nobody has opened it in a spreadsheet program yet |
| AC-M08-03 | Pass | Integration: a file with one unknown roll number saves nothing and names row 4; a value for a component the course lacks is a row error; the filled-in export imports fully. E2E: the downloaded file, filled in, uploads |
| AC-M08-04 | Pass | Unit and integration: 07 §6 gives B+, A, O and SGPA 8.58; `AB` in practice gives Ab, 0 points, SGPA 4.42; a missing attendance part leaves the student incomplete, listed. Integration and e2e: students see only their own published sheets; publishing tells only the students published |
| AC-M08-05 | Pass (reworded) | Integration: audit entries for lock, unlock, export, import, publish and unpublish; `syncRuns` for export, import, bulk lock and grade sheets, listed on Integrations. Publishing is audited, not a run, so the mock-up's "Published grade sheets" row on Integrations was not built; the AC now says so |

**Changed beyond the tasks (found while building)**
- T2 had one gap, not two: `deleteAssessment` only ever deleted drafts.
- The sweep reads closed tests with a cursor, and a locked course's tests do not count toward its 100 a run, so they cannot hold others back.
- Locking runs the recompute twice (before the check, and straight after the lock for the lock it closes). A grade saved between the check and the lock would otherwise never reach the internal marks.
- The import matches rows through the batch's courses, not the student's batch (A-172). The grade-sheet job is named after its run.
- The `Badge` dot variants capitalise; the Exams badges keep sentence case.

**Not done**
- T7, the exam-system API: Q-04.
- The human validation checklist: agreeing the file with the exam section, confirming the grade table (Q-19, Q-39, Q-40) and the SGPA (Q-21), and a dry run of one real batch.
- A batch whose file would pass 10,000 rows is refused; there is no split by section.
- The lock dialog names at most 20 incomplete students ("and N more").
- On phones, the Exams tables scroll sideways inside their card, as chosen.
- EXM-06 (grade sheets triggering attainment) is M09. Grade-sheet notices are in-app only (06 §6).

**Assumptions** — A-172 to A-177 (§4).

**Open questions** — Q-59 (§3): the 2 dp export against unrounded grade sheets. Q-58 now matters here: an in-person course with no LMS attendance leaves every student incomplete.

**Verification**
- `npm run check` → exit 0, `Tests 608 passed (608)`.
- `npm run test:integration` (local replica set and Redis) → `Test Files 26 passed (26)`, `Tests 311 passed (311)`.
- `npm run build` → exit 0. `npm run check:bundle` → "144 files scanned for 4 names and 6 secret values; clean".
- `npx playwright test` (all 23) → 16 passed, 7 failed:
  - `exams.spec.ts` passed. Its first runs failed on the fixture, not the app: the seed filled the rubric without working the marks out, which saving a rubric does. Then on Home's course card, kept mounted by Next and matching the same text. The seed now works the marks out, and the spec matches exactly.
  - The seven failures are M07's seven, each needing a service not installed here: Mailpit (auth, the course plan, a guest's code), RustFS (a video upload, a certificate), LiveKit (live), and the local `.env` AI key (bank).
- A scripted walk of the real screens at 1440 px and 390 px, as admin and student01, after the spec ran:
  - The pages: both terms' batch lists, both batch pages, the lock and unlock dialogs, a student's sheet, Grading, Integrations, Results, Results printed, and Notifications.
  - No error page, and nothing wider than the screen.
  - Fixes it led to: "All 1 course are locked"; the sheet tabs now start with Ready; the badges' case; on phones, a part's marks line ran over its total and now wraps; printing left the page panel grey.
- The print view, emulated after the panel's 0.5 s transition and as a PDF: the sheet alone on white, under the university's name, bars and grade kept.

### 2026-10-24 · Decision: M09 attainment and AI tagging · Claude Code, at Aniket's request

Request: "plan the next milestone". M08 is done, so M09 is next (00 §3). The milestone file predates M01b, M03b, M04b, M06 and M08. It was checked against the code first:
- End-sem marks come per component since M08.
- Each attempt keeps its own paper since M04b.
- The Outcomes tab exists since M03b, for every role.
- A credit-course question cannot be saved without a CO, so a suggestion has to come before the first save.
- `CoPoMatrix` and `CoPoEditor` have no modes.
- `targetLevel` cannot be set.
- The AI's errors already follow 06 §4.7.

Aniket chose the recommended option on each of four points (`docs/milestones/M09-attainment-ai.md`, decisions 1–4):
1. SEE is the externals weighted by credits; `AB` in any part means not attained.
2. The AI is told only outcome titles a programme gave.
3. One target level for every CO, from the setting.
4. The programme report is worked out when it is opened; nothing is stored for a programme.

**Dev consequences** (in the milestone file): A-178–A-184 (§4). CIE reads each counted attempt's paper through `breakdown()`; a missed assessment counts 0; a CO's % is over the students assessed on it; locked courses are worked out; a record keeps its map and settings; sections count once in the programme report. The question's suggestion reads the dialog's unsaved text. Jobs dedupe as M06's do.

**Changed docs**
- The M09 file: decisions, consequences, mock-ups A1–A6, tasks T1–T7.
- 05 §3.6 (no `targetLevel`) and §5.6 (one record per credit offering, with the map and settings it used).
- 06 §4.7 (the M09 actions; the leftover `fallbacks: 'default'` line from the Anthropic SDK removed), §6 (`compute/attainment` and its triggers), §7 (`attainment` rules).
- 07 §4 (papers, missed assessments, the assessed denominator, `externalPct`, one target; new vectors), §5 (on opening, sections; a new vector), §14.
- 08 §2–3 (the Outcomes tab, Reports' tabs, Reports › Attainment, Settings).
- 09 §3, §4, §12. Q-07 and Q-43 here.

**Not done** — T0's mock-ups (next), then T1–T7 after the picks.

**Assumptions** — A-178–A-184 (§4).

**Open questions** — none new. Q-07 and Q-43 stay open; Q-43 now decides how useful "Suggest levels" is, since most programmes title only PSO1–PSO3.

**Verification** — Docs only. The worked example still gives CO 2.5, 2, 2 and PO1 2.21, PO2 2.08, PO3 2, PSO1 2, PSO3 2.25 under the new rules. The new vectors were computed by script (`python3`): `externalPct` 66.67, 70, 57.25 and `absent`; the drawn papers' CO values 1, 0, 0 and null; 0.4 / 0.6 giving CO1 2.4; the programme's 2 and 1.88.

### 2026-10-24 · M09/T0 Mock-ups · Claude Code, at Aniket's request

**Created** — the mock-up list's note and link in `docs/milestones/M09-attainment-ai.md`; this entry.

**Drawn** — Inside the real app, on the e2e build on port 3100:
- the real sidebar, header and course tabs, with static content where the new parts go, compiled by Tailwind's browser build with the app's theme (M08's script, reused);
- as faculty1 on CUTM1602 · Programming in C, whose three COs, mapping and programme outcome titles are the e2e seed's; as the HoD for the report; as admin for Settings.

Eight screens, each at 1440 px and 390 px:
- A1 A (attainment first on the Outcomes tab) and A1 B (a Mapping · Attainment switch);
- A2 (the grid with an Attainment row);
- A3 before and after (the question dialog in the course bank, with a question typed in);
- A4 (the CO–PO editor with five suggested cells);
- A5 (Reports › Attainment);
- A6 (Settings › Attainment).

The attainment figures are examples worked out by 07 §4: CO1 75 % → level 3, SEE 68.42 % → level 2, CO1 2.5; PO3 = 7 / 5 = 1.4. The programme row is the mean of the example courses: PO1 2.17, PO2 1.89, PO4 1.75; 5 of 10 outcomes at the target.

**Not done** — T1–T7: they wait for the picks.

**Assumptions** — none new.

**Open questions** — none new. On phones the outcome table and the grid scroll sideways inside their card, as the Marks and Exams tables do. Noted on the page for Aniket to decide.

**Verification**
- Every screen measured no wider than its window at both widths.
- Two fixes after looking at the shots: the tiles' labels were cut off at 390 px ("SEE marks" and "SEE level" now), and the Bloom chips now capitalise as the app's do.

Shown to Aniket on one page: https://claude.ai/artifact/Ep4y6pUdn56PsD5aNv8jNP (private).

### 2026-10-24 · Decision: M03c T4–T10 · Claude Code, at Aniket's request

Request: "complete this" (M03c). Before T4, four points needed Aniket (`docs/milestones/M03c-live-like-meet.md`, decisions 5–8):
5. **Recording runs on the current server (65.20.89.9).** Aniket chose it knowing the server has 2 vCPUs and 3.3 GB and also runs LiveKit, the LMS, MongoDB and Redis, so a recording can slow the class and the LMS. It is for trying out; real use needs its own machine.
6. **Captions are the host's own speech,** recognised by the host's Chrome or Edge (which may send the audio to Google or Microsoft). The recommended option.
7. **Guests come in by personal link and a lobby;** no account and no code. The recommended option.
8. **One mock-up round for everything left,** then T4–T10 straight through. The recommended option.

**Design** (in the milestone file):
- A meeting is a live session without a course: `meetings` holds the schedule and the invitations, and one `liveSessions` row (`kind: 'meeting'`) holds the room.
- The room's actions take the session and work out access from it, as M04b's assessment actions do.
- Invitations carry an `.ics` file; the mail adapter gains attachments.
- Polls are stored, with `pollAnswers`.
- Breakout rooms are LiveKit rooms named after the class.
- The whiteboard and the captions travel as data messages and are not stored.
- Blur's files are served from our own server.
- Recording is behind `LIVEKIT_EGRESS=on`.

**Packages to come:** `@excalidraw/excalidraw` 0.18.1, and `@livekit/track-processors` 0.8.1 (0.8.2 was published on 12 Oct, under two weeks ago). Both accept React 19 and livekit-client 2.

**Not done** — the mock-ups (next), then T4–T11.

**Assumptions** — none yet in §4.

**Open questions** — none new. Q-12 (hosting) now also decides where recording runs for real use.

**Verification** — Docs only. The server's size is from the 16 Oct test-deployment entry. Versions and peers were checked with `npm view`.

### 2026-10-24 · M03c/T0 Mock-ups, rounds 2 and 3 · Claude Code, at Aniket's request

**Created** — the mock-up list's note and link in `docs/milestones/M03c-live-like-meet.md`; this entry.

**Drawn** — On the e2e build on port 3100:
- The live room, drawn with `LiveRoom`'s own classes on CUTM1602's room page (round 1's layout and controls as built). The camera pictures are placeholders.
- Meetings, in faculty1's app shell.
- The recording card on a class page of CUTM1602.

Twenty screens, each at 1440 px and 390 px:
- R2-A: the list, and New meeting.
- R2-B: the invitation email.
- R2-C: the lobby, before asking and while waiting.
- R2-D: a guest asking to join.
- R3-A: starting a recording, while it records, and the class page.
- R3-B A (an Activities tab) and R3-B B (buttons in the bar).
- R3-C: asking, answering, results.
- R3-D: setting up, the invitation, inside a room.
- R3-E: the whiteboard.
- R3-F: captions.
- R3-G: blur.

**Not done** — T4–T11: they wait for the picks.

**Assumptions** — none new.

**Open questions** — none new.

**Verification**
- Every screen measured no wider than its window at both widths.
- One fix after looking at the shots: a stage-filling tile kept `relative` beside `absolute`, which the real component's `cn` removes, so the main tile collapsed.

Shown to Aniket on one page: https://claude.ai/artifact/3eLKRW42zQFQf1dCNSyNPP (private).

### 2026-10-24 · Deleting an offering, and a sample file for every CSV import · Claude Code, at Aniket's request

Request: "1. Course Deletion Option to be added. (Offerings) 2. In all Import CSV, keep Download Sample CSV option. Import CSV not Courses, there you keep Download Sample CSV."

**Created**
- `deleteOffering` (`app/(app)/admin/offerings/actions.ts`), admins only. It removes a **draft** offering that has no lessons, live classes, assessments, projects or rubric marks. Its enrolments and internal-marks rows go in the same transaction, its cover is deleted from storage, and the audit gets `offering.deleted` (title, enrolments removed). An active or completed offering is refused (`CLOSED`). A draft that holds something is refused with what it holds: "It already has assessments and marks, so it is kept." (`CONFLICT`).
- Offerings page: a draft row's ⋮ has Delete (after a separator when "Refresh the evaluation policy" is there too), with a confirmation that names the offering and how many students are unenrolled.
- `public/samples/`: `users.csv`, `enrolment-changes.csv`, `course-list.csv`, `question-bank.csv`, `my-question-bank.csv` (a personal bank has no outcomes, so no `cos` column) and `exam-marks.csv`.
- "Download sample CSV" (outline button, above the file box) in all five imports: Import users, Upload the course list, Upload a list of changes (People), Import questions (course and personal bank), Bring back the marks (Exams).
- Tests: `lib/domain/csv.test.ts` "sample files" parses each sample with its import's parser; `tests/integration/offerings.test.ts` "deleteOffering" (2 tests).
- Docs: 05 §3.8 (when an offering may be hard-deleted), 06 §8 (the samples), 08 §2 (`/admin/offerings`), 09 (permission row, `offering.deleted`). These four doc edits were committed inside `b7c6672 M03c(docs): the mock-up picks` by the M03c session working in the same folder; the code they describe is in the two commits after it.

**Not done**
- An active or completed offering cannot be deleted: it holds what students did (05 §1, no hard deletes of academic records). One activated by mistake stays (completed offerings are still shown to students), until Aniket says whether an active offering nobody has used yet may be deleted too.
- A draft holding lessons, classes, assessments or projects is refused rather than emptied for the admin: those are the teachers' work, and some of it (a class that ran, a project) has no delete of its own.

**Assumptions**
- "Course deletion (Offerings)" means deleting an offering on `/admin/offerings`, not a catalogue course. Catalogue courses are archived (their status), never deleted.
- The samples are fixed files, not built from each viewer's data. Their people use `example.com` addresses, so uploading a sample as it is invites nobody real. The course-list sample uses the seed's courses (from courseware), so uploading it unchanged leaves those courses as they are.
- The check and the delete are not one atomic step: a lesson added in the same instant could be left without its offering. The same holds for deleting a live class; it was left that way.

**Open questions** — none.

**Verification**
- `npm run check` → exit 0; `Test Files 38 passed (38)`, `Tests 614 passed (614)`.
- `npm run test:integration` (mongodb-memory-server, local Redis) → exit 0; `Test Files 26 passed (26)`, `Tests 313 passed (313)`.
- The sample test fails when a sample is broken: `remove` in place of `drop` in `enrolment-changes.csv` → `× enrolment-changes.csv`; restored.
- `next dev` on the e2e database, signed in as the seed admin (Playwright, 1440 × 900): an active offering's ⋮ lists only "Refresh the evaluation policy"; a draft's lists it and Delete. The confirmation read "It is removed for good, and its student is unenrolled. …". After Delete offering the row went and the counts dropped from 43 to 42 offerings and 20 to 19 drafts. Each of the five dialogs (and the personal bank) downloaded its sample with the right name and header: users 5 rows, course list 4, enrolment changes 2, both banks 5, exam marks 3. For the Exams page, the seeded LAB0201 offering was locked in the e2e database for the check and unlocked after it.
- The only browser console message was the sign-in page's existing warning about its photo (`fill` in a `sticky` parent).

### 2026-10-24 · M03c/T4 Meetings, invitations and the guest lobby · Claude Code, at Aniket's request

Built to decision 7 and the round-2 mock-ups (R2-A to R2-D, as drawn).

**Created**
- **One room for a class and a meeting:**
  - `lib/schemas/live.ts`: `kind: 'meeting'`, `RoomRef`, `RoomPerson`, `RoomPeople`, `RoomRight`, `SaveMeeting`, `MeetingRef`, `FindPeople`, `guestToken`, `AskToJoin`, `GuestRef`, `MEETING_LIMITS`.
  - `lib/models/live-session.ts`: `offeringId` optional for a meeting, `meeting { hostIds, memberIds, guests, sequence }`, `waiting`, three indexes.
  - `lib/auth/access.ts`: `roomAccess` and `requireRoomHost`, access worked out from the session.
  - T1–T3's room actions moved from the course to `app/(room)/actions.ts`, taking the session alone, with `admitGuests`, `denyGuest` and `endRoom` added. The class page keeps its own `endSession`; both end through `endLiveSession` (`lib/data/live.ts`). `roomControls` gives hosts the removed people (users or guests) and the waiting guests.
  - The webhook and the finalize job write no attendance for a meeting. An admin's "Today's live classes" leaves meetings out.
- **Meetings:**
  - `lib/data/meetings.ts`: `listMeetings`, `getMeeting`, `getMeetingRoom`, `getGuestLobby`, `findPeople` and `requireInvitable`, the people a member of staff may invite (09 §3).
  - `app/(app)/meetings/actions.ts`: `saveMeeting` (a new time or title, or people taken off, is a new version; added people alone are invited otherwise; people taken off get a cancellation), `cancelMeeting`, `startMeeting`, `findPeople`.
  - Four notification kinds (`meeting.*`).
- **Invitations:**
  - `lib/domain/ics.ts` (+ test): one event naming only its recipient.
  - `meetingEmail` in `lib/domain/email-templates.ts`.
  - The `meetingInvites` mail job (`worker/jobs/mail.ts`).
  - `sendMail` sends a calendar part (`icalEvent`).
  - `lib/auth/guest-link.ts`: a guest's link is their id signed with the session secret.
- **Screens:**
  - `/meetings` (R2-A), `/meetings/[meetingId]`, `/meetings/[meetingId]/room`.
  - `/m/[token]` (R2-C, exempt from `proxy.ts`).
  - `components/meeting-dialog.tsx`, and `components/people-picker.tsx` (a client boundary).
  - Meetings in the menu.
  - `LiveRoom` takes `noun`, `guest`, `backHref` and `expected`, uses "Others" and "A host" in a meeting, and shows hosts the lobby (R2-D).
  - `DataTable` takes `param`.
- **Tests:**
  - `tests/integration/meetings.test.ts`, 10 cases:
    - scheduling, the people a teacher may invite, each invitation's own calendar file and link;
    - versions, additions and cancellations;
    - cancelling; who reaches a meeting; starting;
    - the whole lobby with removal and the webhook; turning away; an altered link;
    - ending without attendance.
  - `tests/integration/live.test.ts` follows the moved actions.
- **Docs:** 01 §3, 05 §4.3, 06 §4.2, §6, §8.7, §8.8, §9, 08 (routes, menu, inventory), 09 (permissions, scoping, rate limit), the M03c file (the design is on `liveSessions`; guest links signed).

**Not done**
- Not tried on a real LiveKit server yet: that walk comes after T10, with the other room features.
- A guest's reactions and chat follow the rights like anyone's, but a guest cannot raise a hand (raising one needs an LMS account).

**Assumptions** — A-185 to A-192 (§4).

**Open questions** — none new.

**Verification**
- `npx vitest run lib/domain/ics.test.ts` → 6 passed.
- `npm run check` → exit 0, `Tests 620 passed (620)`.
- `npm run test:integration` (local replica set and Redis) → `Test Files 27 passed (27)`, `Tests 323 passed (323)` (meetings 10, live 34).
- `npm run build` → exit 0, with `/meetings`, `/meetings/[meetingId]`, `/meetings/[meetingId]/room` and `/m/[token]`. `npm run check:bundle` → clean.

### 2026-10-24 · M03c/T5 Recording · Claude Code, at Aniket's request

Built to decision 5 (recording on the current server) and mock-up R3-A, as drawn.

**Created**
- **The engine side:**
  - `lib/integrations/live.ts`: `recordingEnabled`, `startRecording` (room composite, speaker layout, MP4 straight to the bucket with the LMS's S3 settings) and `stopRecording`. The webhook's `recording` event (`egressInfo`).
  - `lib/env.ts`, `.env.example`, `tests/setup.ts`: `LIVEKIT_EGRESS`.
- **The record:**
  - `liveSessions.recordings` (≤ 20, `RECORDING_STATUSES`).
  - The `live-recording` object type in `lib/schemas/uploads.ts` (Egress writes it; `createUpload` refuses it).
  - The webhook marks a recording `saved` with its length, or `failed`.
- **Actions** (`app/(room)/actions.ts`): `startRecording`, which claims first so two hosts cannot start two, and lets go when the room is not open; and `stopRecording`. Both are audited and tell the room.
- **Reads:**
  - `savedRecordings` (`lib/data/live.ts`).
  - `canRecord` and `recordings` on the class page and the meeting's page and room.
  - `/api/files` plays a `saved` recording to the class page's audience or the meeting's people.
- **Screens:**
  - `components/recording-list.tsx` (class page, meeting page).
  - `LiveRoom`: Start and Stop recording in More for hosts, and "Recording" beside Live for everyone (`useIsRecording`).
- **Tests:** `tests/integration/meetings.test.ts`, 2 more cases:
  - a meeting: only hosts record, one at a time, the room is told; it is not playable before it is saved; its people may watch it and others may not; audited;
  - a class: a room nobody has joined starts nothing and leaves no record; the class's students may watch it.
- **Docs:**
  - 01 §4 and LIV-05 (out of the backlog); 05 §4.3 and §8.
  - 06 §4.3 (verified mapping), §5 (`live-recording`), §8.8; 08 (rows, `RecordingList`, `LiveRoom`).
  - 09 (permissions, audit actions); 11 §2 and §4.1 (Egress, and how the test server runs it).

**The test server** (65.20.89.9; decision 5; done over SSH by Claude Code):
- **Docker:** `docker.io` 29.7.2 installed.
- **Egress:** the `livekit-egress` container (livekit/egress v1.15.0, host network, 1.5 CPUs and 1800 MB at most, restarts by itself), with `/etc/livekit/egress.yaml` (11 §4.1).
- **`livekit.yaml`:**
  - gained Redis db 5;
  - gained `rtc.interfaces.excludes: [docker0]`: Docker's bridge had appeared among the addresses LiveKit offered browsers, and now does not;
  - the earlier file is `livekit.yaml.bak-20261024`.
- **LiveKit restarts:** twice, with no room open (no room activity in the previous hour).
- **`/etc/cutm-lms/app.env`:** gained `LIVEKIT_EGRESS=on`, used once this code is deployed.

**Not done**
- A recording through the LMS's own screens on the real server: that walk comes with the others after T10.
- Deleting a recording (not asked; A-193).
- Recording breakout rooms.

**Assumptions** — A-193 to A-195 (§4).

**Open questions** — none new. Q-12 decides where recording runs for real use (11 §4.1).

**Verification**
- **A real recording on the test server,** from this Mac: a test room, one participant (headless Chromium with a fake camera and microphone), `startRoomCompositeEgress` → `EGRESS_ACTIVE` after 15 s; `stopEgress` → `EGRESS_COMPLETE`, a 12.7 s MP4 of 2,079 KB, found in the bucket as `video/mp4`, then deleted with the room.
- **An empty room:** the same request is aborted after a while with "Start signal not received". An earlier try without a participant showed it.
- **The server afterwards:** Egress `service ready`, health 200, idle at 49 MB and under 1% CPU. LiveKit `active`, offering only 65.20.89.9. The LMS `/api/health` 200.
- `npm run check` → exit 0, `Tests 620 passed (620)`. `npm run test:integration` → `Test Files 27 passed (27)`, `Tests 325 passed (325)`. `npm run build` → exit 0. `npm run check:bundle` → clean.

### 2026-10-24 · M03c/T6 Polls · Claude Code, at Aniket's request

Built to mock-ups R3-B A (the Activities tab) and R3-C, as drawn. The one exception: the mock-up's footnote "who answered what is on the class page" is not built (A-198, 01 §4).

**Created**
- **The record:**
  - `liveSessions.polls`, and the `pollAnswers` model (`lib/models/poll-answer.ts`, in `scripts/sync-indexes.ts`).
  - `CreatePoll`, `PollRef`, `AnswerPoll`, `POLL_LIMITS` in `lib/schemas/live.ts`.
  - The `poll` topic.
- **Actions** (`app/(room)/actions.ts`): `createPoll`, `answerPoll`, `endPoll`, `showPollResults`.
- **Reads:** `roomPolls` (`lib/data/live.ts`), with `polls` on the class's and the meeting's room.
- **Screens:**
  - `LiveRoom` gains the Activities tab: the hosts' Polls card, the new-poll form, live bars, Show results and End the poll; the others' answer card and the gold dot; earlier polls.
  - Hosts' pages read the polls again every 3 s while one is open.
- **Tests:** `tests/integration/meetings.test.ts`, 2 more cases:
  - asking (options cleaned, one at a time, hosts only); answering (not hosts, not outsiders, a change replaces, closed after the end);
  - who sees counts when; showing early; results kept with the hosts.
- **Docs:** 01 §4, 05 §4.3 and §4.3a, 06 §4.3 and §8.8, 08 (`LiveRoom`), 09 (permissions).

**Not done**
- Polls in breakout rooms.
- Exporting a poll's results (not asked).

**Assumptions** — A-196 to A-199 (§4).

**Open questions** — none new.

**Verification**
- `npx vitest run --project integration tests/integration/meetings.test.ts` → 14 passed.
- `npm run check` → exit 0, `Tests 620 passed (620)`. `npm run test:integration` → `Test Files 27 passed (27)`, `Tests 327 passed (327)`.

### 2026-10-24 · M03c/T7 Breakout rooms · Claude Code, at Aniket's request

Built to mock-up R3-D, as drawn.

**Created**
- **The record:**
  - `liveSessions.breakout`, `OpenBreakouts`, `BreakoutMessage`, `RoomTokenRef`, `breakoutRoomName`, `BREAKOUT_LIMITS`.
  - The `breakout` topic, and the `closeBreakouts` op of `compute/liveControl`; `queueLiveControl` takes a delay.
- **Actions** (`app/(room)/actions.ts`): `openBreakouts`, `closeBreakouts`, `messageBreakouts`, and `roomToken` (main or a breakout room).
- **Reads:** `roomBreakout` (`lib/data/live.ts`), on the class's and the meeting's room.
- **Ending:** `endLiveSession` closes open breakout rooms with the class.
- **The webhook:** maps `<roomName>-b<n>` to its session, so attendance, removal and rights work there too.
- **Screens** (`LiveRoom`):
  - The connection is `{ token, room }`. Moving fetches a token and reconnects, and the disconnect that a move causes is ignored. A room closing under someone, or the time running out, brings them back.
  - The Breakout rooms card and setup (`BreakoutForm`); the hosts' status card (`BreakoutStatus`: Visit, message every room, close).
  - The participant's invitation card and "Join room n" pill; a breakout room's header with the time left, and "Back to the class".
- **Tests:** `tests/integration/meetings.test.ts`, 2 more cases:
  - who may go where; tokens for one's own room or any for a host; what each sees; a message to every room; closing within a minute, then the worker closing each room; closed afterwards;
  - in a class: a join in a breakout room counts toward attendance; a breakout room closing does not end the class; ending the class closes the breakout rooms.
- **Docs:** 05 §4.3, 06 §4.3, §6 and §8.8, 07 §10, 08 (`LiveRoom`), 09 (permissions).

**Not done**
- Moving someone to another room while the rooms are open.
- Guests in breakout rooms (A-201).
- Polls or recording inside a breakout room (A-202).

**Assumptions** — A-200 to A-203 (§4).

**Open questions** — none new.

**Verification**
- `npx vitest run --project integration tests/integration/meetings.test.ts` → 16 passed.
- `npm run check` → exit 0, `Tests 620 passed (620)`. `npm run test:integration` → `Test Files 27 passed (27)`, `Tests 329 passed (329)`.

### 2026-10-24 · M03c/T8 The whiteboard · Claude Code, at Aniket's request

Built to mock-up R3-E, as drawn.

**Created**
- **The package:** `@excalidraw/excalidraw` 0.18.1, with its reason and npm audit's findings in 03.
- **Fonts:** its Latin fonts in `public/excalidraw/fonts` (480 KB, 25 files).
- **The record:** `liveSessions.board`, `OpenBoard`, `BoardDrawing`, the `board` topic.
- **Actions** (`app/(room)/actions.ts`): `openBoard`, `setBoardDrawing`, `closeBoard`.
- **Reads:** `board` on the class's and the meeting's room and the guest's lobby.
- **Screens:**
  - `components/whiteboard.tsx` (loaded on demand): Excalidraw, with text streams for its changes, a sync for late joiners, a check on every incoming element, and changes from someone who may not draw ignored.
  - `LiveRoom`: the board as the main tile with the faces beside it; "Others can draw" and Close for hosts; the Whiteboard card in Activities.
- **Tests:** `tests/integration/meetings.test.ts`, 1 more case: only hosts open, guests see it, who draws, closing.
- **Docs:** 03, 05 §4.3, 06 §4.3 and §8.8, 08 (`LiveRoom`, `Whiteboard`), 09 (permissions).

**Not done**
- Saving or exporting a board; pictures (A-206).
- Drawing between real browsers has not been tried yet: that walk comes after T10.

**Assumptions** — A-204 to A-207 (§4).

**Open questions** — none new. npm audit's high findings in Excalidraw's Mermaid converter are recorded in 03 for Aniket to weigh.

**Verification**
- `npx vitest run --project integration tests/integration/meetings.test.ts` → 17 passed.
- `npm run build` → exit 0 with Excalidraw.
- `npm run check` → exit 0, `Tests 620 passed (620)`. `npm run test:integration` → `Test Files 27 passed (27)`, `Tests 330 passed (330)`. `npm run check:bundle` → clean (313 files).

### 2026-10-24 · M03c/T9 Captions · Claude Code, at Aniket's request

Built to decision 6 and mock-up R3-F, as drawn.

**Created**
- `speech-recognition.d.ts`: the recogniser's types, which TypeScript's DOM library leaves out.
- `components/live-room.tsx`:
  - "Caption my speech" in More for hosts: the browser's recogniser, `en-IN`, continuous, restarted after pauses; stopped with a message when the browser refuses it.
  - Lines go on the `caption` topic (`I:` lossy at most every 300 ms, `F:` reliable).
  - CC for everyone (in More on a phone), with a gold dot while captions arrive unseen.
  - The strip with the speaker's name and the latest two lines, faded after 8 s of quiet; captions accepted from hosts only.
- **Docs:** 06 §8.8, 08 (`LiveRoom`), 09 §12.

**Not done** — Not tried with real speech: the recogniser needs a person talking into Chrome or Edge, which a script cannot do. The walk after T10 checks that the menu, the button and the strip appear.

**Assumptions** — A-208, A-209 (§4).

**Open questions** — none new.

**Verification** — `npx tsc --noEmit` and `npx eslint components/live-room.tsx`: clean. The full checks are in the T10 entry.

### 2026-10-24 · M03c/T10 Background blur · Claude Code, at Aniket's request

Built to mock-up R3-G, as drawn.

**Created**
- **The package:** `@livekit/track-processors` 0.8.1, with its reason in 03.
- **Assets:**
  - `postinstall` copies MediaPipe's wasm into `public/mediapipe/wasm` (git-ignored, in `.gitignore`).
  - `public/mediapipe/selfie_segmenter.tflite`, downloaded once from Google's MediaPipe models and checked as a TFLite file.
- **`components/live-room.tsx`:** "Your background" in More (not, slightly, or fully blurred). The processor is imported only when first chosen and applied to the viewer's own camera with our own asset paths. A camera that cannot be blurred says so.
- **Docs:** 03, 08 (`LiveRoom`), 11 §3.

**Not done** — Not tried with a real camera; the walk below tries it with Chromium's fake camera.

**Assumptions** — A-210, A-211 (§4).

**Open questions** — none new.

**Verification**
- `npm run check` → exit 0, `Tests 620 passed (620)`. ESLint now ignores `public/mediapipe/wasm`, MediaPipe's own loaders.
- `npm run test:integration` → `Test Files 27 passed (27)`, `Tests 330 passed (330)`.
- `npm run build` → exit 0. `npm run check:bundle` → clean.

### 2026-10-24 · M03c/T11 The walk on the dev LiveKit server, its fixes, and the report · Claude Code, at Aniket's request

This walk is the one T4–T10 promised. It ran the build on port 3101 and the worker, both on the e2e database, against the dev LiveKit server and its Egress (from `.env`), with recordings going to the test bucket and email to a local SMTP sink. Chromium ran with fake cameras: faculty1 hosting, student01 and student02 as members, and a guest from their emailed link. It found four defects, fixed below; the last run passed all 62 steps.

**Fixed**
- **Breakout rooms could not be opened while a guest was in the meeting.** The setup dealt the guest into a room and the server refused ("Only the people taking part go to breakout rooms"). A guest's token now carries `role: 'guest'` (`lib/integrations/live.ts`, `lib/data/meetings.ts`), so the setup leaves guests out (A-201) and People marks them "Guest". Guests keep a member's rights.
- **Moving between rooms turned the camera and microphone off.** It also reset the blur, so a camera turned back on in the new room showed the room behind the person. `LiveRoom` now keeps the blur choice and the last camera and microphone state across a move (A-212). A blurred camera starts in the new room already blurred: LiveKit applies a capture-time processor before it publishes.
- **The blur could send an unblurred picture.** Two ways: turning the camera on with blur chosen published the plain camera, then blurred it; changing between "Slightly blurred" and "Blurred" put the plain camera back on the sender while it swapped processors (livekit-client's `setProcessor` stops the old one first). Now the camera starts blurred, and a change of strength calls the running processor's `switchTo`.
- **The invitation to a breakout room came back after the rooms had closed.** It appeared once people were back in the main room, until the page read the session again. The room now treats rooms past `closesAt` as closed.
- Also changed: `lib/integrations/live.test.ts` (a guest's token), `tests/integration/meetings.test.ts` (a guest's role), 06 §4 (the token's role, breakout moves) and 08 (`LiveRoom`).

**The walk** (each line one or more scripted checks, all passing on the final run)
- **T4:**
  - The New meeting dialog (title, IST date and times, a co-host found by name, two students by email, a guest) saved a meeting: `kind: 'meeting'`, no offering, 2 hosts, 2 members, 1 guest.
  - Four invitations arrived, each with a `text/calendar; method=REQUEST` part naming only its recipient. The guest's carried their own `/m/<token>` link and a member's the meeting page.
  - The host started 3 minutes early and both members joined (3 in the LiveKit room). The guest asked to join; the host saw "Visiting Examiner (guest) wants to join" and "Waiting to join · 1", then admitted them. The guest's page became the meeting, with no Activities tab.
- **T5:**
  - Start recording showed "Recording" to the host, a member and the guest, and Stop took it away for all.
  - Egress saved a 20 s, 2.4 MB MP4 to the bucket. The server's `egress_ended` webhook goes to the deployed app, so it was replayed to the local one, signed as LiveKit signs it. The recording then showed as saved on the meeting, and a member's meeting page played it through `/api/files` (metadata loaded, 20 s).
- **T6:** The host started a poll. The member saw the gold dot, answered, and the host saw "1 answered" within the 3 s refresh. Ending it showed the member the results ("1 · 100 %"). The session stores no user ids for a poll.
- **T10:**
  - "Blurred" loaded MediaPipe's js, wasm and model from our own server, all 200, with no error.
  - Turning the blurred camera off and on brought it back without an error.
  - No page requested any host other than this machine and the LiveKit server.
- **T7:**
  - The setup listed the two members and not the guest. With 2 rooms and 5 minutes, each student was asked, joined, and was alone in their own LiveKit room, while the guest stayed in the main room.
  - The host visited room 1 (2 there), came back, and messaged every room; room 2 saw it.
  - Close the rooms brought everyone back in the minute (4 in the main room). Cameras were back on for the host and both students, and student01's blur choice was still "Blurred".
- **T8:**
  - The board opened for all three. The host's rectangle reached a member, who had no toolbar.
  - After "Others can draw", the member's ellipse reached the host and the guest. Close closed it for everyone.
- **T9:**
  - The host's "Caption my speech" started the recogniser. A line it heard reached student01 with CC on, as "Pradeep Sahoo · Today we look at the second unit.", and nothing showed for student02 with CC off.
  - Headless Chromium cannot recognise speech, so the recogniser was replaced by a stub that hands the room the same results.
- **At 390 px:** the guest's page, /meetings, a meeting's page and the room fit the width (scroll width 390), and More offers "Turn on captions".
- **Cleanup:** the walk's 18 meetings, their notifications, poll answers and audit rows were deleted from the e2e database, along with the 6 recordings earlier runs left in the bucket.

**Not done**
- **Needs a person, not a script** (for the human validation):
  - captions from real speech in Chrome and Edge;
  - blur on a real camera with a person in front of it (Chromium's fake camera has no person, so all of it blurs);
  - drawing with a pen or a finger;
  - a recording completed through the deployed app's own webhook, after a push;
  - the invitation's calendar file opened in Gmail and Outlook;
  - Safari and Firefox (no captions; blur may be refused, A-210).
- **Not measured:** recording's load on the 2-vCPU test server with a full class.
- **Not done here:** an e2e spec. It would need a LiveKit server whose webhooks reach the test machine, as T1–T3 found.
- **Rotate the dev LiveKit API secret.** It was printed into a session log during T5's server work; it is in no file or commit.
- **Not pushed:** T4–T11 are committed on main only (a push deploys the test server).

**Assumptions** — A-212 (§4).

**Open questions** — none new.

**Verification**
- The walk: `walk/env.sh node walk/walk.mjs` in the session scratchpad → `62/62 passed`, with the app, the worker and the SMTP sink running as above.
- `npm run check` → exit 0, `Tests 621 passed (621)`.
- `npm run test:integration` → `Test Files 27 passed (27)`, `Tests 330 passed (330)`.
- `npm run build` → exit 0. `npm run check:bundle` → clean (315 files).

### 2026-10-24 · M03c deployed to the test server, and a guest's room loading its files signed out · Claude Code, at Aniket's request

Request: "deploy everything properly". `main` was pushed (`b12d5cd..46857cc`: M09's docs, M03c T4–T11, deleting a draft offering, the sample CSVs), and the server's deploy timer built and switched to `46857cc` in about 3 minutes (2.6 GB peak, 631 MB of swap), with no rollback.

**Found after the deploy, and fixed:** signed out, `/mediapipe/…` and `/excalidraw/…` answered 307 to `/login`. `proxy.ts` sends every path without a session to sign in, and a meeting guest is never signed in. So a guest's blur failed ("could not be blurred") and the board's text fonts did not load. The walk had missed it: its guest chose no blur and drew shapes only. `proxy.ts` now lets both folders through; 09 §4 says so.

**Created** (*changed*) — *`proxy.ts`*, *09 (`proxy.ts`)*, this entry.

**Not done** — A recording finished through the deployed app's own webhook was not tried: it needs signing in on the shared development database, which the walk avoided.

**Assumptions** — none new.

**Open questions** — none new.

**Verification**
- On the server, with `46857cc` running:
  - `cutm-lms-web`, `cutm-lms-worker`, `livekit`, `caddy` and `redis-server` active, Egress up.
  - The worker logged `worker started`; index sync passed (the deploy stops on a failure there).
  - The release's `public` has `mediapipe/wasm` and `excalidraw/fonts`.
  - `GET /api/health` → `{"ok":true,"mongo":"up","redis":"up"}`, `/login` 200.
- Locally, after the fix (`npm run build` → exit 0, standalone on port 3102, signed out):
  - `/mediapipe/selfie_segmenter.tflite` 200, `/mediapipe/wasm/vision_wasm_internal.wasm` 200 `application/wasm`, an Excalifont `.woff2` 200 `font/woff2`;
  - `/meetings`, `/home`, `/courses`, `/mediapipe-x` and `/excalidrawx` still 307.

### 2026-10-24 · Decision and mock-up round: fields that ask people to type a format · Claude Code, at Aniket's request

Request: the meeting dialog's people fields are "very wrong" and should work like Google Meet's; find every field with an unfriendly data-entry structure (the grade scale's `|` lines, for example), research what works best, and use it. This entry is the written scope approval for the change (AGENTS law 1). What is saved does not change, only how it is entered.

**The audit** — 13 fields make people type a format:
- **People and emails:** the meeting's co-hosts, people from the LMS and guests (three boxes, guests one a line); an offering's faculty from other departments and Change faculty (emails with commas); a test's invitation emails.
- **Short lists:** a test's allowed email domains and a drawn section's topics; a batch's sections; the commit messages that say nothing (Settings · Project metrics).
- **Rows typed with `|`:** the grade scale; the code questions' languages.
- **One per line:** the catalogue's session plan (with "Practice:" or "Project:" typed in front), the syllabus's objectives and projects, a unit's practicals.

Fields that hold sentences stay text boxes: unlock, lock and unpublish reasons, a module's summary, an outcome statement, a unit's topics, a message to a candidate.

**Research** — Google Calendar's single "Add guests" field with directory suggestions, co-hosts chosen from the guest list; chip (tags) inputs that add on Enter, comma, Tab and blur, split pasted lists and report what they reject; the WAI-ARIA combobox pattern for suggestions; Canvas's grading-scheme rows covering 100 % to 0 %; design systems' "add another" rows.

**Mock-ups** — drawn inside the real app (e2e build, port 3101) at 1440 and 390 px, on one private artifact (https://claude.ai/artifact/QXVL5XMgkUaTpJsetjwKkq):
- **F1, who a meeting invites:** A, one field like Google Calendar with the invited list and each person's role below (recommended); B, the three fields as chip boxes.
- **F2:** the test invitation emails as chips, with paste and per-address checks.
- **F3:** the grade scale as a table, with a bar showing how 0–100 % is shared out.
- **F4:** the languages as a table.
- **F5:** the session plan as rows with a type each; the same list for objectives, projects and practicals.
- **F6:** the short lists as chips; faculty found by name; topics suggested from the bank.

**Not done** — Nothing is built yet: the build waits for Aniket's picks.

**Open questions** — none; the picks are asked in the artifact.

### 2026-10-24 · The fields round built: chips, rows and one people field · Claude Code, at Aniket's request

Aniket said "deploy it" after the mock-up round, so this builds the recommended picks: F1 A and F2–F6 as drawn (A-213). Everything saved has the same shape as before: each new field posts the text its form posted, which the server already reads.

**Created** (*changed*)
- **Server:**
  - *`lib/schemas/live.ts`:* `FindPeople` takes `scope` (`all`, `staff`, `faculty`) instead of `staffOnly`; new `MatchPeople { keys }`.
  - *`lib/data/meetings.ts`:* `Person.staff`; `findPeople` by scope; new `matchPeople`, a pasted list matched among the people the viewer may invite.
  - *`app/(app)/meetings/actions.ts`:* `findPeople({ q, scope })` and `matchPeople`.
  - *`lib/data/papers.ts`:* new `bankTopics`, the bank's topics by use. *`lib/data/assessments.ts`:* `Builder.bank.topics`.
  - *`lib/data/offerings.ts`:* each offering's faculty carry their `id`.
  - *`lib/domain/catalog.ts`:* `formatSessionLines` is removed; the session plan's editor writes the lines itself.
  - *`lib/schemas/settings.ts`:* help for the grade scale, the languages and the commit messages no longer describes a typed format.
- **Components** (08 §5.2):
  - `components/meeting-people.tsx` (F1 A), `components/chip-input.tsx` (F2, F6), `components/list-editor.tsx` (F5), and `components/settings-tables.tsx` (F3, F4);
  - *`components/people-picker.tsx`* takes a scope.
- **Fields replaced:**
  - *`components/meeting-dialog.tsx`* (the three people fields);
  - *`app/(app)/admin/offerings/page.tsx`* (faculty from other departments, and Change faculty, now found by name);
  - *`components/assessment-builder.tsx`* (invitation emails, a link's domains, a drawn section's topics with suggestions);
  - *`app/(app)/admin/programs/[id]/page.tsx`* (sections);
  - *`app/(app)/admin/settings/[key]/page.tsx`* (grade scale, languages, commit messages);
  - *`app/(app)/catalog/[id]/page.tsx`* (session plan);
  - *`components/course-syllabus.tsx`* (objectives, textbooks, references, projects, a module's practicals).
- **Tests:**
  - *`tests/integration/meetings.test.ts`*: the scope and `staff`; `matchPeople` matching a colleague's email in capitals and leaving out an untaught student and an unknown address.
  - *`tests/integration/build.test.ts`*: the bank's topics by use.
  - *`lib/domain/catalog.test.ts`*: the session lines as the editor posts them.
- **Docs:**
  - 06 (`findPeople`, `matchPeople`, stop words), 07 (session plan text), 08 §5.2 (four new rows, `MeetingDialog`, `PeoplePicker`), 09 (paste matching);
  - this entry and A-213–A-217.

**Not done**
- **No e2e spec:** the scripted walk below drove every field instead.
- **No arrow keys in the offering's faculty search:** `PeoplePicker` still takes the first result on Enter.
- **Found, not fixed:** 16 tests in the e2e database have no `sections` field. Their pages fail with "a.sections is not iterable". They are records left from before sections existed, not something this round changed; whether the shared development database has any was not checked.

**Assumptions** — A-213 to A-217 (§4).

**Open questions** — none new.

**Verification**
- `npm run check` → exit 0, `Tests 621 passed (621)`.
- `npm run test:integration` → `Test Files 27 passed (27)`, `Tests 330 passed (330)`.
- `npm run build` → exit 0. `npm run check:bundle` → clean (318 files).
- **The walk** (`fields-walk.mjs` in the session scratchpad: the build on port 3101 with the worker and a mail sink, e2e database, Chromium) → `33/33 passed`.
  - **F1, the meeting:**
    - Typing "Lipika" suggested Lipika Das; Enter added her as a participant, and she was made co-host.
    - A pasted list of two student emails, a guest email, an unknown roll number and a word added 3, reported the other two and kept them in the box.
    - The meeting saved with 2 hosts, 2 members and 1 guest. Editing showed everyone with their role. The dialog fits 390 px.
  - **F2, test invitations:**
    - A pasted list became chips, dropped the repeat and reported the bad address. Backspace and a comma worked.
    - Three invitation emails reached the sink. On a second run, the same addresses were dropped as a day's repeats, as designed, so each run now uses new ones.
  - **F6, short lists:**
    - "@CUTM.ac.in" became `cutm.ac.in` and "gmail" was refused.
    - The bank's topics were suggested with their counts; the arrow keys and Enter picked one.
    - Sections saved as B, C.
    - Change faculty showed the current faculty as chips, and saved Lipika Das found by name.
    - Commit messages saved without "wip", with the pasted "todo" and "misc" in lower case.
  - **F3, the grade scale:**
    - P worth 4.5 and a new grade D were entered.
    - D at 45 % showed the server's "D must start below P's 40 %." under the table, while the bar waited for numbers that make sense.
    - At 35 % the bar drew it; the save stored O … P 4.5, D 35 → 3, F 0. The table fits 390 px.
  - **F4:** a Python row saved with runner id 71.
  - **F5, the session plan:**
    - Enter added session 7 and moved to it; a pasted "Practice:" and "Project:" pair became two rows of those kinds.
    - Move up and Save stored the new order and kinds; the dialog fits 390 px.
  - **F5, the syllabus lists:** an objective added as a row was saved; a module's practicals are rows too.
  - **Afterwards:** every record the walk changed was put back, and its meeting removed. These were the batch, the offering's faculty, the course's session plan and objectives, the three settings, and the test's closing time, which the walk had moved to reopen it.
- Screenshots of the real fields were looked at.
  - Fixed: a dialog stretches every native select to its width, which pushed out the co-host's name and put each session over three lines on a desktop. Both selects now sit in a box of their own width.

### 2026-10-24 · The e2e database's tests from before sections, repaired · Claude Code, at Aniket's request

Request: fix the 16 tests whose pages failed with "a.sections is not iterable" (found by the fields round).

**What they were**
- 16 tests and 11 attempts made by e2e runs on 17 Oct 2026, before M04b added sections, papers, extra time, proctoring and result rules.
- The tests lacked `sections`, `extraTime`, `instructions`, `proctoring`, `snapshotsDeletedAt` and `results`, some also `ownerIds` and `countsToward`.
- The attempts lacked their `paper` and twelve later fields.
- They exist only in this Mac's e2e database. The shared development database (Atlas `test`) has one test, already in today's shape, and CI builds its e2e database afresh. So the fix is a repair of that data, not a change to the app.

**Repaired** with a one-off script (session scratchpad, not in the repository; dry run first):
- each missing field was set to the schema's own default, read from a blank `Assessment` or `Submission`;
- each attempt got the paper it was given then, which before M04b was the test's own questions, with the same ids. Every recorded answer is on it (dry run: 0 of 0, 3 of 3, 1 of 1 …).
- A second dry run found nothing left to do.

**Created** — this entry. Nothing in the repository changed.

**Verification** — Every page of the 16 tests opened, signed in as their teacher: the test, its builder, results, grading and monitor, and each attempt's grading page. Each attempt's student also opened their own view of the test. 98 pages, none an error page.
