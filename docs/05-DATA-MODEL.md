# 05 · Data model

MongoDB 8.0 replica set, Mongoose 9. This document is the source of truth for every collection: fields, bounds, indexes, invariants and retention. A model file must match its section exactly; a change to one is a change to both, in the same commit.

## 1. Conventions

- **Collections** are created by Mongoose models (`lib/models/<singular>.ts`) and named by Mongoose's pluralisation, which also lower-cases (`Offering` → `offerings`, `AuditLog` → `auditlogs`). Headings below use the camelCase name for readability; in `mongosh` use the lower-cased one.
- **Timestamps:** every collection has `createdAt` / `updatedAt` (`{ timestamps: true }`) unless marked *append-only*.
- **References** are `ObjectId` fields named `<entity>Id` / `<entity>Ids`. No Mongoose `populate`; load related records with one `$in` query (04 §3 S4).
- **Bounded arrays only.** Every embedded array lists its maximum; the Zod input schema enforces it.
- **No hard deletes of academic records** (submissions, attendance, marks, grade sheets, audit). Records change `status`. Hard delete is allowed only where a section says so.
- **Rich text** (`RichText` below) is Tiptap JSON (`{ type: 'doc', content: [...] }`), at most 100 KB serialized. On write the `richText` schema (06 §2) accepts only StarterKit's node and mark types, so every stored document renders with `@tiptap/html/server` (which throws on an unknown type); a document with no text is not stored (the field is unset). Never store HTML.
- **Enums** are listed inline; the same literals live in `lib/schemas/` as `as const` arrays.
- **Denormalized fields** (marked *denorm*) are copied at creation and never edited independently; they exist so a hot query uses one index.
- Types: `S` String · `N` Number · `B` Boolean · `D` Date · `Id` ObjectId · `[T]` array · `?` optional/nullable.

## 2. Collection map

```
departments ─┬─ programs ─┬─ batches
             │            └─ curriculumEntries ── courses (university-wide: T-P-Pj, COs, CO→PO/PSO map,
users ───────┘                                    │          modules, books, session plan, coordinator)
terms ────────────────────────────────────────────┴─ offerings (credits + evaluation policy copies, modules,
                                                                plan, calendar, faculty, lock)
                                             ├─ enrollments ── users(students)
                                             ├─ lessons ── lessonProgress
                                             ├─ liveSessions ── attendance
                                             ├─ assessments (items, rubrics, CO tags) ── submissions
                                             ├─ internalMarks · rubricMarks (M06) · endSemMarks
                                             ├─ projects ── projectTasks · commits
                                             ├─ attainments
                                             └─ engagementDaily
gradeSheets (term × student) · notifications · settings · syncRuns · auditLogs
assessments with no offering (standalone tests, M04b) ── submissions · testLinks ── testGrants ── users(candidates) · otps
questionBank (M04b): courses' banks and staff's own banks ── drawn into submissions.paper
```

---

## 3. Identity and structure

### 3.1 `users`
| Field | Type | Rules |
|---|---|---|
| name | S | required, trimmed, ≤ 120 |
| email | S | required, lowercase, unique |
| roles | [S] | required, 1–3 of `admin hod faculty student support`; or exactly `['candidate']` (M04b, TP-03: an outside person a guests link let in — no password, signs in with an email code, sees only their tests; never assigned by an admin, `ASSIGNABLE_ROLES`) |
| status | S | `invited` (default) · `active` · `disabled` |
| passwordHash | S? | `select: false`; absent until the invitation is accepted, and always for a candidate |
| sessionVersion | N | default 1; incremented on password change, reset, "sign out everywhere", disable |
| rollNo | S? | students; unique when present |
| employeeId | S? | staff; unique when present |
| departmentId | Id? | faculty, hod |
| programId, batchId | Id? | students |
| section | S? | students, ≤ 10 |
| github | `{ login: S, id: N, linkedAt: D }?` | set by the OAuth link (M07) |
| lastLoginAt | D? | |

Indexes: `{ email: 1 }` unique · `{ rollNo: 1 }` unique partial (`rollNo` is string) · `{ employeeId: 1 }` unique partial · `{ 'github.id': 1 }` unique partial · `{ batchId: 1, section: 1 }` · `{ roles: 1, status: 1 }` · `{ departmentId: 1, roles: 1, name: 1 }` (the offering dialogs' faculty picker, M01b) · text `{ name: 'text', email: 'text', rollNo: 'text' }`.
Invariants: a student has `programId` and `batchId`; an `hod` has `departmentId`. Users are never deleted (`disabled`).

### 3.2 `departments`
`code` S (uppercase, ≤ 10, unique) · `name` S (≤ 120) · `status` `active|archived`. Index: `{ code: 1 }` unique.

### 3.3 `programs`
| Field | Type | Rules |
|---|---|---|
| code | S | uppercase, ≤ 20, unique (a programme created by the course list gets one from its name: `MSC-MATHEMATICS`) |
| name | S | ≤ 160 |
| departmentId | Id? | null for a programme created by the course list until an admin sets it (A-61); offerings need it |
| durationSemesters | N? | 1–12 |
| outcomeTitles | `[{ code: S, title: S }]` | ≤ 15; `code` ∈ PO1–PO12, PSO1–PSO3 (fixed codes, CPP-02); `title` ≤ 200; a code without a title is shown as the code. New programmes start with PSO1 Higher education, PSO2 Entrepreneurship, PSO3 Placement (Q-08) |
| baskets | `[{ _id: Id, name: S, title: S?, scope: S?, minCredits: N? }]` | ≤ 12; `name` ≤ 60, unique within the programme ("Basket I"); `title` ≤ 120; `scope` `core` · `choice`; `minCredits` 0–300 in 0.5 steps |
| status | S | `active` · `archived` |

Indexes: `{ code: 1 }` unique · `{ departmentId: 1, status: 1 }` · text `{ code: 'text', name: 'text' }` (the programme list's search, 17 Oct 2026).
Invariants: a programme with offerings keeps its department (offerings copy it). Renaming a basket renames it in the programme's curriculum entries in the same transaction; a basket that lists courses cannot be removed.

### 3.4 `batches`
`programId` Id · `name` S (≤ 80, e.g. "B.Tech CSE 2025–29") · `startYear` N · `sections` [S] (max 20, each ≤ 10) · `status` `active|graduated`.
Indexes: `{ programId: 1, startYear: 1 }` unique.

### 3.5 `terms`
`code` S (unique, e.g. `2026-ODD`) · `name` S · `academicYear` S (`2026-27`) · `startsOn` D · `endsOn` D · `status` `upcoming|current|closed`.
Indexes: `{ code: 1 }` unique · `{ status: 1 }`. Invariant: `startsOn < endsOn`.

### 3.6 `courses` (catalogue, university-wide — M01b)
One course per code, listed by any number of programmes (§3.6a, A-54). Sizes are `CATALOG_LIMITS` in `lib/schemas/structure.ts`.

| Field | Type | Rules |
|---|---|---|
| code | S | uppercase letters and digits, ≤ 20, **unique**; stored as `normalizeCode` (`cutm 1535` → `CUTM1535`); fixed once the course has an offering (A-62) |
| title | S | ≤ 160 |
| type | S? | `core` · `domain` · `skill` · `certificate` · `advanced_certificate` · `diploma` (a label, 01 §6) |
| credits | `{ theory: N, practice: N, project: N }` | each ≥ 0 in 0.5 steps, total ≤ 30 (written `3-0-1`; one part may take it all, as an internship's 0-0-24 does). Total 0 = non-credit course |
| status | S | `draft` · `active` · `archived` |
| coordinatorId | Id? | a faculty user (CRS-07) |
| objectives | [S] | ≤ 20, each ≤ 500 |
| cos | `[{ _id: Id, code: S, statement: S, bloomLevels: [S], suggestedBloom: S? }]` | credit courses only; ≤ 15; `code` `CO1…` unique, never reused for a new CO; `statement` ≤ 500; `bloomLevels` 0–3 of `remember understand apply analyse evaluate create`; `suggestedBloom` is the import's guess from the first verb, shown pre-ticked, cleared when a person saves (A-58). Every CO's attainment target is the `attainment` setting's (M09 decision 3; the never-settable `targetLevel` is gone) |
| coSeq | N | the highest CO number the course has given (M03b); `nextCoCode(cos, coSeq)` gives the next, so a deleted CO6 is followed by CO7. Set by `addCo`, raised by `deleteCo` (`$max`); absent on courses saved before M03b (read as 0) |
| coMap | `[{ coId: Id, outcome: S, level: 1\|2\|3 }]` | sparse; `outcome` ∈ PO1–PO12, PSO1–PSO3; unique per (coId, outcome); ≤ 225 |
| modules | `[{ _id: Id, title: S, hours: S?, topics: S, practicals: [S] }]` | ≤ 20; `title` ≤ 200; `hours` ≤ 30, as written (`6` or `4+0+2`); `topics` ≤ 3000; `practicals` ≤ 30, each ≤ 300 |
| projects | [S] | ≤ 30, each ≤ 300 |
| textbooks, references | [S] | ≤ 20 and ≤ 30, each ≤ 500 |
| sessionPlan | `[{ topic: S, kind: S }]` | ≤ 200; `topic` ≤ 200; `kind` `theory` · `practice` · `project` |
| syllabusFileKey | S? | object key of the official PDF |
| source | `{ coursewareId: N, url: S, importedAt: D, contentHash: S, facultyName: S?, lastRunId: Id? }?` | set by the courseware import (ADM-07); `lastRunId` lets a run count each page once |
| contentEditedAt | D? | set by every content edit in the LMS; the import then leaves the content alone unless forced (A-57) |
| issues | [S] | ≤ 20 review notes in plain words, each ≤ 300 |
| reviewNeeded | B | shown as "Needs review"; cleared with the notes by "Mark reviewed" |

Indexes: `{ code: 1 }` unique · `{ status: 1, code: 1 }` · `{ type: 1, code: 1 }` · `{ reviewNeeded: 1, code: 1 }` · `{ coordinatorId: 1, code: 1 }` · `{ 'source.coursewareId': 1 }` unique partial (a number) · text `{ code: 'text', title: 'text' }`.
Invariants: removing a CO removes its mapping cells and its id from the `calendar[].coIds` of every offering of the course, in one transaction (M03b); a re-import keeps each CO's `_id` by its code (`mergeCos`). COs are edited one at a time and are not reordered: the code gives the order. A CO referenced by an assessment item cannot be removed (M04). Contact details from courseware are never stored (A-60).

### 3.6a `curriculumEntries` (M01b)
`programId` Id · `courseId` Id · `courseCode` S (*denorm*, for sorting) · `basket` S? (the name of one of the programme's baskets; null = no basket) · `stream` S? (≤ 60) · `courseType` S? (≤ 80, the Course Repository's label for this programme, e.g. "Humanities and Management(A)").
Indexes: `{ programId: 1, courseId: 1 }` unique · `{ programId: 1, basket: 1, courseCode: 1 }` · `{ courseId: 1 }`.
Invariants: at most 1,000 per programme (the actions and the course-list import check it). The course-list upload never deletes an entry (A-64).

### 3.7 Evaluation policy copy (replaces `evaluationSchemes`, M01b)
There is no collection: the evaluation policy is the settings key `evaluation` (06 §7, 07 §2), and each credit offering stores a copy of it in `offerings.evaluation` when it is created (A-63). The M01 `evaluationSchemes` collection is dropped by the migration.

### 3.8 `offerings`
| Field | Type | Rules |
|---|---|---|
| courseId, termId, batchId | Id | required |
| section | S? | null = the whole batch |
| programId, departmentId | Id, Id | *denorm* from the batch's programme (A-56) |
| category | S | `ugc` (credit course) · `skill` (non-credit, 0-0-0), from `credits` (A-55) |
| credits | `{ theory, practice, project }` | copy of the course's credits at creation |
| evaluation | Mixed? | copy of the `evaluation` settings at creation; null for a non-credit offering |
| title | S | generated: `<code> · <course title> · <term code>[ · <section>]` |
| facultyIds | [Id] | 1–5 |
| projectMode | S? | `github` · `tracker`; required exactly when `credits.project` > 0, else null |
| modules | `[{ _id: Id, title: S, order: N, summary: S? }]` | max 40; prefilled from the course's module titles; `summary` ≤ 300, one line under the title (M03b) |
| plan | `{ doc: RichText?, version: N, publishedAt: D?, publishedBy: Id?, changedAt: D? }` | `version` increments on each publish; `changedAt` is set by every save of the plan text or a session, so "changes since version n" shows when it is after `publishedAt` (M03b) |
| calendar | `[{ _id: Id, date: D, topic: S, coIds: [Id], kind: S? }]` | max 200; `topic` ≤ 200; `kind` `theory` · `practice` · `project` or null (M03b, in place of a "Practice: " prefix). Kept sorted by `(date, _id)` with `$push { $each, $sort }`, so a row keeps its `_id` through edits (M03b) |
| coverKey | S? | the class's cover picture (`offering-cover`, A-81, M03b); without one, a tone from the code |
| status | S | `draft` · `active` · `completed` |
| lockedAt, lockedBy | D?, Id? | internal-marks lock (M08) |
| lastPushedAt | D? | last CE export/push |

Indexes: `{ courseId: 1, termId: 1, batchId: 1, section: 1 }` unique · `{ facultyIds: 1, status: 1 }` · `{ departmentId: 1, termId: 1 }` · `{ batchId: 1, termId: 1 }` · `{ termId: 1, status: 1 }` · `{ status: 1, _id: -1 }` (the admin list filtered by status alone) · text `{ title: 'text' }` (the admin list's search, 17 Oct 2026).
Invariants: students see only `active`/`completed` offerings. While `lockedAt` is set, no action may change a submission score, assessment result state, enrollment, evaluation copy or internal mark for this offering. The course must be in the batch programme's curriculum when the offering is created. Attendance may still be corrected (audited, Q-51); it reaches the internal marks only after an unlock. End-sem marks are imported for locked or unlocked offerings and freeze when the student's grade sheet is published; unlocking is refused while a published grade sheet includes the offering (M08). Hard delete only while `draft` and holding no lessons, live sessions, assessments, projects or rubric marks (24 Oct 2026): its enrolments and internal-marks rows go with it in one transaction, its cover object is deleted, audit `offering.deleted`. A draft was never shown to students and cannot be locked, so no attendance, submission or locked mark can belong to it.

### 3.9 `enrollments`
`offeringId` Id · `studentId` Id · `status` `active|dropped` · `engagement` `{ score: N?, band: S?, trend: S, signals: { attendance, video, timeliness, practice, activity: N? }, computedAt: D }?` (nightly snapshot, M10).
Indexes: `{ offeringId: 1, studentId: 1 }` unique · `{ studentId: 1, status: 1 }` · `{ offeringId: 1, status: 1 }`.
Invariant (A-83, M03b): at most `MAX_ENROLLMENTS` (1,000) rows per offering, active and dropped together — checked by `createOfferings` (a larger batch is offered by section), `changeEnrollments` and `addStudent`. The roster reads an offering's rows whole and searches its students by `_id`. Changes are refused while the offering's marks are locked.

## 4. Content, live classes, attendance

### 4.1 `lessons`
| Field | Type | Rules |
|---|---|---|
| offeringId, moduleId | Id | moduleId ∈ offering.modules |
| order | N | position within module |
| kind | S | `video` · `document` · `link` |
| title | S | ≤ 160 |
| description | RichText? | |
| fileKey, fileName, contentType, size | S?, S?, S?, N? | video/document |
| durationSec | N? | video; read in the browser from video metadata before upload; > 0 |
| lowKey | S? | video; object key of the 480p data-saver copy made by the worker (`…/<uuid>-480p.mp4`) |
| transcode | S? | video: `pending` · `ready` · `failed` (the original always plays; `failed` only means no data-saver copy) |
| url | S? | link; `https://` only |
| frameKey | S? | video; the worker's JPEG frame from a tenth of the way in (`…/<uuid>-frame.jpg`, 07 §18, M03b) |
| thumbKey | S? | a picture the teacher uploaded (`lesson-thumb`, M03b). The thumbnail shown is `thumbKey ?? frameKey ??` the lesson type's mark |
| attachments | `[{ _id: Id, key: S, fileName: S, size: N }]` | PDF notes (`lesson-doc`), at most 5 (`MAX_NOTES`); `fileName` ≤ 120 (M03b). Absent on lessons saved before M03b: read as `[]` |
| published | B | default false |
| publishedAt | D? | |

Indexes: `{ offeringId: 1, moduleId: 1, order: 1 }` · `{ offeringId: 1, published: 1 }`.
Invariants: an offering holds at most 300 lessons (`createLesson` refuses the 301st), so its content index is one bounded read. `fileName` is the sanitized display name (≤ 120, 06 §5). A lesson's video is replaced only while no student has progress on it (A-82); a document always. A module is deleted only when empty.
Hard delete allowed while unpublished and without progress rows; every key it holds (file, data-saver copy, frame, thumbnail, notes) is then deleted from storage.

### 4.2 `lessonProgress`
| Field | Type | Rules |
|---|---|---|
| lessonId, offeringId, studentId | Id | |
| ranges | `[[N, N]]` | merged watched intervals in seconds (07 §8); max 200 |
| watchedSec | N | Σ range lengths, ≤ `durationSec` |
| progressPct | N | 0–100, 2 decimals |
| completedAt | D? | set once, when progress ≥ completion threshold |
| openedAt | D? | first open (documents/links) |
| lastBeaconAt | D? | anti-inflation (07 §9) |

Indexes: `{ lessonId: 1, studentId: 1 }` unique · `{ offeringId: 1, studentId: 1 }` · `{ studentId: 1, lastBeaconAt: -1 }` (Home's “Continue learning”, M02).

### 4.3 `liveSessions`
| Field | Type | Rules |
|---|---|---|
| offeringId | Id? | required, except on a meeting (M03c T4), which has no course |
| kind | S | `class` · `review` · `meeting` (M03c T4: a meeting outside classes, in the same room) |
| reviewId | Id? | `review` sessions (M07): the project review they hold (§6.3a). Finalizing one writes no attendance: it is one team's, and the attendance part must not count it against the rest of the class |
| title | S | ≤ 160 |
| scheduledStart, scheduledEnd | D | start < end; duration ≤ 6 h |
| startedAt, endedAt | D? | set by the faculty start/end actions or room webhooks |
| status | S | `scheduled` · `live` · `ended` · `cancelled` |
| roomName | S | `ls-<sessionId>`; unique |
| attendanceMode | S | `manual` · `derived` (skill offerings: always `derived`) |
| finalizedAt | D? | derived attendance computed (07 §10); stored as `null` until then |
| studentsMay | `{ share: B, unmute: B, chat: B }` | M03c: what students (in a meeting, everyone but the hosts) may do in the room — share their screen, turn on their microphone, send chat messages and reactions; each `true` until a host turns it off while it runs. Classes from before M03c have no field and read as all `true` |
| removed | `[{ userId: Id, at: D, by: Id }]` | M03c: students a host removed (in a meeting, members and guests: `userId` is then a guest's id); they get no join token until a host lets them back. At most 100 (`MAX_REMOVED`) |
| meeting | `{ hostIds: [Id], memberIds: [Id], guests: [{ _id: Id, email: S, name: S?, admittedAt: D?, deniedAt: D? }], sequence: N }?` | M03c T4, meetings only. `hostIds` 1–5, the scheduler first (they stay a host), then co-hosts (staff); `memberIds` ≤ 50, people from the LMS; `guests` ≤ 20, by email (lower case), `name` as they type it in the lobby, `admittedAt`/`deniedAt` a host's answer in this meeting. A guest's link is their `_id` signed with the session secret (`lib/auth/guest-link.ts`): nothing secret is stored. `sequence` numbers the invitation's version for calendars (06 §8.7) |
| waiting | `[{ guestId: Id, name: S, at: D }]` | M03c T4: guests asking to join, in the order they asked (≤ 20) |
| recordings | `[{ egressId: S, key: S, by: Id, startedAt: D, endedAt: D?, durationSec: N?, status: S }]` | M03c T5: ≤ 20 (`MAX_RECORDINGS`), the latest last; `status` `recording` (at most one) · `saved` · `failed`, set by the egress webhook; `egressId` empty for the moment a host's start is claimed; `key` a `live-recording` object (06 §5) |
| createdBy | Id | |

Indexes: `{ offeringId: 1, scheduledStart: -1 }` · `{ status: 1, scheduledEnd: 1 }` · `{ status: 1, finalizedAt: 1 }` (the hourly sweep's "ended, not finalized", M03) · `{ roomName: 1 }` unique · M03c T4: `{ 'meeting.hostIds': 1, scheduledStart: -1 }` and `{ 'meeting.memberIds': 1, scheduledStart: -1 }` (the Meetings page) · `{ 'meeting.guests._id': 1 }` (a guest's link).
Invariants: an offering holds at most 500 sessions (`scheduleSession` refuses the 501st, A-73), so its session reads are bounded. A `scheduled` session whose `scheduledEnd` has passed was never held; it keeps its status and produces no attendance. A meeting (M03c T4) has no course and takes no attendance: its webhooks write none and finalizing it only sets `finalizedAt`; only its hosts and members reach it (A-185).

### 4.4 `attendance`
| Field | Type | Rules |
|---|---|---|
| sessionId, offeringId, studentId | Id | |
| status | S? | `present` · `absent`; unset while the class runs, set when it is finalized or the teacher marks the student (M03) |
| source | S | `manual` · `derived` |
| presence | `[{ sid: S, joinedAt: D, leftAt: D? }]` | from live-engine webhooks, one entry per connection (`sid` is the engine's connection id, so a repeated or reordered event changes nothing); max 50, the oldest dropped (Q-52) |
| presenceSec | N | computed at finalize |
| focusedSec | N | Σ from focus beacons |
| lastFocusAt | D? | last accepted focus beacon (anti-inflation, 07 §9) |
| markedBy, markedAt | Id?, D? | manual marks and overrides |

Indexes: `{ sessionId: 1, studentId: 1 }` unique · `{ offeringId: 1, studentId: 1 }`.
Invariants: a manual mark overrides a derived one and is audited (`attendance.marked`). A student's attendance % counts only rows with a status (A-72).

## 5. Assessment and marks

### 5.1 `assessments`
Assessment **modes**: `quiz` · `written_test` · `assignment` · `learning_record` · `lab_record` · `coding_test` · `lab_test` · `coding_competition` · `project_review`. M04 builds the first five (`ASSESSMENT_MODES`, with the question types each may hold in `MODE_ITEM_TYPES`, `lib/schemas/assessment.ts`); M04b adds `proctoring` (TP-08), the coding modes and the `code` items (TP-09), M07 `project_review` and `observation` items. Sizes are `ASSESSMENT_LIMITS` there.

| Field | Type | Rules |
|---|---|---|
| offeringId | Id? | null for a **standalone test** (M04b, TP-02): it belongs to its owners, has no CO tags and never feeds CE or attainment |
| ownerIds | [Id] | standalone tests: who made it (they and admins manage it); empty on a course's assessment |
| mode | S | one of the modes above |
| countsToward | S? | M06 (Q-41): the theory part the assessment's marks count toward — `midTerm1` · `midTerm2` · `assignment` — or null (not counted; it still shows in the trend). Only on an assessment of a credit offering with theory credits, never on a standalone test. Changed while the offering is unlocked; audited (`assessment.counts_toward`) |
| title | S | ≤ 160 |
| instructions | RichText? | |
| items | [Item] | 0–100 while a draft, 1–100 to publish (see below) |
| sections | [Section] | M04b (TP-05, TP-06), ≤ 10; empty = one part holding every question (below) |
| maxMarks | N | Σ `items.maxMarks` + Σ sections' `draw.count × draw.marksEach`, stored |
| opensAt, closesAt | D | opensAt < closesAt |
| lateUntil | D? | ≥ closesAt; null = no late submissions |
| durationMin | N? | 1–600; null = untimed |
| attemptsAllowed | N | 1–10 |
| attemptPolicy | S | `best` · `last` |
| shuffleItems, shuffleOptions | B | items shuffle within their section |
| extraTime | `[{ userId: Id, minutes: N }]` | M04b (TP-07), ≤ 200 people, 1–600 minutes; lengthens that person's time limit and the end of hand-ins (07 §14); audited (`assessment.extra_time`) |
| proctoring | `{ fullscreen: B, camera: B, snapshotEverySec: N, blockCopy: B, hardLimit: N, penaltyEach: N }?` | M04b (TP-08, from M05); null = not proctored. Snapshots every 30–600 s; `hardLimit` 0–20 (0 records only; the N-th serious warning hands the attempt in, 07 §15); `penaltyEach` 0–1000 marks off per serious warning, two decimals. Fixed once anyone has started, like the other settings |
| snapshotsDeletedAt | D? | M04b: when `proctorRetention` deleted the test's camera snapshots (§8) |
| results | `{ release: S, showAnswers: B, showExplanations: B, leaderboard: B, certificateFromPct: N?, bands: [{ label: S, minPct: N }], setBy: Id? }` | M04b (TP-11, 07 §19): `release` `manual` (by hand once closed and marked, M04) · `on_close` (the hourly sweep publishes once closed, nobody writing and everything marked; the audit names `setBy`) · `instant` (each person sees their counted attempt once marked; ranks wait for the published results). Bands ≤ 5, labels ≤ 40, highest first. `certificateFromPct` (0–100; null: no certificates, TP-12): a counted result at or above it earns a certificate (07 §20). Changes no mark, so it may change at any time |
| status | S | `draft` · `published` · `results_published`. Open/closed is **derived** from `opensAt`, `closesAt`, `lateUntil` and now |
| publishedAt, resultsPublishedAt | D? | |
| dueNotifiedAt | D? | set when the 24-hour reminder was sent (M04 sweep) |
| createdBy | Id | |

**Item** (embedded, `_id` per item):
| Field | Type | Rules |
|---|---|---|
| type | S | `mcq` · `msq` · `true_false` · `numeric` · `fill_blank` · `matching` · `ordering` · `text` · `file` · `code` · `observation` (the M04b types in **TP-06**) |
| prompt | RichText | |
| maxMarks | N | > 0 |
| coIds | [Id] | **≥ 1 for ugc offerings** (CPP-05/06); each ∈ course.cos; none on a standalone test |
| bloomLevel | S? | |
| difficulty, topic | S?, S? | M04b: `easy` · `medium` · `hard`; topic lowercase ≤ 60. What bank draws filter by |
| negativeMarks | N | M04b, ≥ 0, ≤ maxMarks; objective types only (07 §14) |
| partialCredit | B | M04b; msq, fill_blank, matching, ordering only |
| explanation | RichText? | M04b; shown to graders now, to takers with results when the release rules say so (phase E) |
| sectionId | Id? | M04b; the section it belongs to (all of them once any section exists) |
| options | `[{ _id: Id, text: S }]?` | mcq/msq/ordering: 2–8, text ≤ 500; new ids on every save, which is allowed only before any attempt (A-108) |
| answer | `{ optionId? , optionIds?, value?, tolerance?, truth? }?` | mcq: optionId; msq: optionIds; ordering: optionIds in the right order; numeric: value + tolerance ≥ 0; true_false: truth. **Never sent to students** |
| template, blanks | S?, `[{ _id, accepted: [S] }]?` | fill_blank: the sentence with `___` per blank (≤ 10 blanks); what each blank accepts (≤ 10 answers). **`accepted` never sent to students** |
| pairs | `[{ _id, rightId: Id, left: S, right: S }]?` | matching, 2–10: `_id` names the left side and `rightId` the right one, so a page can list both without saying which go together |
| rubric | `[{ _id: Id, criterion: S, maxMarks: N }]?` | text/file/observation; max 10; Σ maxMarks = item.maxMarks |
| code | `{ languages: [S], starter: [{ language: S, source: S }], timeLimitSec: N, memoryKb: N, runLimit: N, testCases: [{ _id: Id, input: S, expected: S, hidden: B, weight: N }] }?` | code only (M04b, TP-09); ≤ 5 code items per assessment (`saveItem`, `addFromBank`); languages are keys of the `codeRunner` setting (06 §7); starters ≤ 16 KB; time 1–10 s; memory 64,000–512,000 KB; `runLimit` 1–30 runs of the visible tests an attempt; 1–15 test cases with their own ids (results name them), at least one visible, weights 1–10; input/expected ≤ 8 KB, `\n` line ends; hidden cases **never sent to students** |

`observation` items have no student answer — faculty score them (project reviews, viva). `text`/`file` items are what records and written assignments are made of.

**Section** (embedded, M04b): `title` S ≤ 80 · `durationMin` N? (1–600; its own clock from when an attempt first opens it) · `locked` B ("no going back": closes when left; later sections open only after it) · `passage` RichText? (shown beside each of its questions) · `draw` `{ count: 1–100, easy, medium, hard: % (0 or adding to 100), coIds: [Id], topics: [S], marksEach: N, negativeEach: N }?` — questions drawn from the bank for each attempt (only automatically marked types, A-118), each worth `marksEach`.

Indexes: `{ offeringId: 1, status: 1, closesAt: 1 }` (also an admin's list of every standalone test, `offeringId: null`) · `{ offeringId: 1, mode: 1 }` · `{ status: 1, closesAt: 1 }` · `{ 'items.coIds': 1 }` · `{ ownerIds: 1, closesAt: -1, _id: -1 }` (the Tests page, M04b) · `{ 'proctoring.camera': 1, snapshotsDeletedAt: 1, resultsPublishedAt: 1 }` (the daily snapshot clean-up, M04b) · `{ 'results.release': 1, status: 1, closesAt: 1 }` (the sweep's automatic releases, M04b).
Invariants: once any submission exists, `items` cannot change (only `title`, `instructions`, dates may). Hard delete only while `draft` (its share links go with it; nobody can have joined a draft). An offering holds at most 200 assessments (`createAssessment` refuses the 201st, A-102), so its lists are bounded reads. Results are published only after the window closes (`lateUntil ?? closesAt`, A-103).

### 5.2 `submissions` (one document per attempt)
| Field | Type | Rules |
|---|---|---|
| assessmentId, studentId | Id | `studentId` is whoever takes it: a student, or for a standalone test anyone a link let in (a candidate, staff) |
| offeringId | Id? | the assessment's; null for a standalone test (no engagement counters then) |
| attemptNo | N | 1…attemptsAllowed |
| status | S | `in_progress` · `submitted` · `graded` |
| startedAt | D | |
| deadlineAt | D | min(startedAt + duration, lateUntil ?? closesAt), both lengthened by the person's extra time; the live monitor adds minutes to it (M04b) |
| submittedAt | D? | |
| late | B | submittedAt > closesAt + the person's extra time + `proctor.addedMin` (M04b) |
| autoSubmitted | B | time ran out; such an attempt's `submittedAt` is its `deadlineAt`, so a sweep that hands it in later does not make it late (A-104) |
| endedBy | S? | M04b (TP-08): `warnings` (the serious-warning limit) · `teacher` (the live monitor's End attempt); null otherwise |
| paper | [Item + `sectionId`, `bankItemId`?] | M04b (TP-05): the questions this attempt was given, frozen at its start — the assessment's own and those its sections drew from the bank (`bankItemId`, worth the section's marks) — in this attempt's order, options in this attempt's order (an ordering question's steps never start in the right order). Grading and results read only this; ≤ 100 items. Keys included: **never sent to students** as stored |
| flags | [Id] | M04b (TP-07): questions flagged for review |
| spent | Map `<itemId>` → N | M04b (TP-07): seconds on each question, added by saves (≤ 600 a save) |
| visits | `[{ sectionId, startedAt: D, closedAt: D? }]` | M04b (TP-06): when each section was first opened and closed for good; written whole (≤ 10) |
| currentSectionId | Id? | M04b: the section the runner shows |
| answers | Map `<itemId>` → `{ optionId?, optionIds?, value?, truth?, texts?: [S], matches?: [{ left: Id, right: Id }], text?: RichText, files?: [{ key: S, fileName: S, contentType: S, size: N }], code?: { language: S, source: S } }` | Map keyed by item id so each save is one atomic `$set: { 'answers.<itemId>': … }`; files max 10, each a `submission` upload of this student for this assessment with its sanitized name (M04: the name is shown to the grader, so the answer keeps more than the key); source ≤ 64 KB (M05) |
| runs | `[{ itemId, at: D, passed: N, total: N }]` | each run of a code question's visible tests (LAB-03, `runCode`); counted against its `runLimit`; max 200 (`$slice: -200`; 5 × 30 runs fit) |
| results | `[{ itemId, testCaseId, status: S, timeMs: N?, memoryKb: N? }]` | every test of every answered code question as the `gradeCode` job ran it, hidden ones too; `status` one of `RUN_STATUSES` (`wrong_answer` is our comparison, 07 §14) |
| codeGradedAt | D? | when the `gradeCode` job last marked the code questions (M04b) |
| rank, percentile | N? | M04b (TP-11, 07 §19): set by the `testStats` job on each taker's counted attempt only (null elsewhere) |
| certificateCode | S? | M04b (TP-12, 07 §20): the certificate's verification code (`/v/<code>`), given the first time a certificate is made for this attempt; never changes |
| similar | `[{ submissionId: Id, itemId: Id, score: N }]` | M04b: other hand-ins whose written or code answer is alike (07 §19), ≤ 10, most alike first; a flag for a teacher, never a verdict |
| scores | Map `<itemId>` → `{ marks: N, criteria: [{ criterionId, marks }]?, by: S, comment: S? }` | `by` is `auto` or the grader's id as a string; comment ≤ 1000; marks may be negative (negative marking, 07 §14) |
| total | N? | null until every item is scored |
| gradedAt, gradedBy | D?, Id? | |
| proctor | `{ hard: N, soft: N, lastHardAt: D?, events: [{ type: S, at: D, counted: B, detail: S? }], snapshots: [{ key: S, at: D }], sessionId: S?, lastBeatAt: D?, addedMin: N, messages: [{ _id, text: S, at: D }], waived: B }` | M04b (TP-08), on every attempt — the monitor's last seen, added time and messages work unproctored too. `events` the newest 300 (`$slice`); `snapshots` at most 240 (no more are taken); `messages` the newest 20, each ≤ 300 characters; `waived` is a grader's waiver of the penalty (audited). The beat writes under a guard on the tally it read (07 §15) |

Indexes: `{ assessmentId: 1, studentId: 1, attemptNo: 1 }` unique (two tabs starting at once compute the same `attemptNo`; the second insert fails and resumes the first) · `{ offeringId: 1, studentId: 1 }` · `{ assessmentId: 1, status: 1, submittedAt: 1 }` (counts per status and the hand-ins list in order, M04) · `{ status: 1, deadlineAt: 1 }` (the hourly sweep's expired attempts, M04) · `{ certificateCode: 1 }` unique, partial on a string (the public certificate check, M04b).
Invariants: only one `in_progress` attempt per (assessment, student). Every score change is audited (`submission.graded`, with before/after marks). Learning and lab **records** are submissions of `learning_record`/`lab_record` assessments. The `testStats` job's writes (`rank`, `percentile`, `similar`) and the certificate code leave `updatedAt` alone, so it moves only when the attempt itself does (TP-12 uses it to tell a made scorecard is out of date).

### 5.2d `questionBank` (M04b, TP-05)
`courseId` Id? · `ownerId` Id? (exactly one: a catalogue course's bank, shared by every offering of the course in any term; or one member of staff's own, for their standalone tests) · the Item fields above (no `sectionId`) · `usedCount` N (papers that drew it) · `aiDraft` B (M04b, TP-10: written by the AI and not reviewed; no paper draws it and "From the bank" does not offer it until a teacher saves it in its dialog) · `createdBy` Id · timestamps. Collection name `questionBank`.
Indexes: `{ courseId: 1, createdAt: -1 }` and `{ ownerId: 1, createdAt: -1 }` (partial, the bank page) · `{ courseId: 1, type: 1, difficulty: 1 }` · `{ ownerId: 1, type: 1, difficulty: 1 }` (a draw's candidates).
Invariants: at most 5,000 per bank (`BANK_LIMITS.perBank`), so a draw's candidates are one bounded read. A course bank's COs are its course's. Deleting a bank question changes no paper (each keeps its own copy).

### 5.2e `testStats` (M04b, TP-11)

One per assessment (`_id` = the assessment's), rebuilt whole by the `testStats` job (06 §6) over each taker's counted attempt; nothing else writes it. `computedAt` D · `takers` N · `averagePct`, `highestPct` N? · `histogram` [N] (10 bins of 10 points) · `items` `[{ key: Id (the assessment's question, or a drawn question's bank id), type: S, title: S (≤ 120, plain text), sectionTitle: S?, coIds: [Id], n: N, correctPct: N, discrimination: N?, wrongPick: { text: S, pct: N }? }]` (≤ 300) · `flagged` N (hand-ins with an alike answer) · `leaderboard` `[{ studentId, name, total, rank }]` (≤ 10). No index beyond `_id`.

### 5.2f `testFiles` (M04b, TP-12)

A PDF or Excel file the worker made from a test's results: the staff's Excel export and reports PDF (one of each per test, `submissionId` null), or a taker's scorecard and certificate (one of each per counted attempt). `assessmentId` Id · `kind` S (`results_xlsx` · `reports_pdf` · `scorecard` · `certificate`) · `submissionId` Id? · `requestedBy` Id · `requestedAt` D (the job reads the results after it) · `status` S (`making` · `ready` · `failed`) · `key` S? (`test-file/<assessmentId>/<owner>/<uuid>.<pdf|xlsx>`; the owner is the taker for theirs, the requester for the staff's) · `fileName` S? · `madeAt` D?.
Indexes: `{ assessmentId: 1, kind: 1, submissionId: 1 }` unique · `{ key: 1 }` partial on a string (`/api/files`).
Invariants: asking again sets `making` and a new `requestedAt`; only the job for that request may set `ready`, and the object the record pointed at before is deleted then. A taker's file is current while `requestedAt` is after the attempt's, the test's and the ranks' last change; the staff's stay downloadable until they make them again.

### 5.2a `testLinks` (M04b, TP-01)
| Field | Type | Rules |
|---|---|---|
| assessmentId | Id | |
| token | S | 24 random URL-safe characters (18 bytes); the link's only secret; unique |
| label | S | ≤ 80, for the owner |
| audience | S | `class` (LMS users who sign in) · `guests` (outside people who register; standalone tests only) |
| accessCode | S? | 4–40; kept readable so the owner can pass it on; compared in constant time |
| expiresAt | D? | |
| maxUses | N? | ≥ 1; null = no limit |
| uses | N | people let in through it; `$inc` only while under `maxUses`, in the grant's transaction |
| allowedDomains | [S] | ≤ 10, lowercase (`cutm.ac.in`); empty = any email |
| active | B | turned off and on by the owner |
| createdBy | Id | |

Indexes: `{ token: 1 }` unique · `{ assessmentId: 1, createdAt: -1 }`.
Invariants: at most 20 per test (`TEST_LIMITS.linksPerTest`). A link is deleted only while nobody joined through it (`uses: 0`); otherwise it is turned off. A course's assessment has only `class` links, which let no one in that enrolment does not (they create no grant).

### 5.2b `testGrants` (M04b)
`assessmentId` Id · `userId` Id · `linkId` Id (the link they came through) · `grantedAt` D.
Who may take a standalone test: one row per person, made by the first open of a usable link. It is their access from then on, whatever happens to the link (they come back for results through it or Tests).
Indexes: `{ assessmentId: 1, userId: 1 }` unique · `{ userId: 1, grantedAt: -1 }` (My tests).

### 5.2c `otps` (M04b, TP-03)
`email` S (lowercase) · `linkId` Id · `codeHash` S (HMAC-SHA256 of email, link and code under `SESSION_PASSWORD`; the code itself is never stored) · `name` S (≤ 120, for the account made on confirmation) · `attempts` N (≤ 5) · `expiresAt` D (10 minutes).
Indexes: `{ email: 1, linkId: 1 }` unique (a new request replaces the code) · `{ expiresAt: 1 }` TTL 0.

### 5.3 `internalMarks`
One row per active student of a credit offering (M06, 07 §2).

| Field | Type | Rules |
|---|---|---|
| offeringId, studentId | Id | |
| parts | `[{ key: S, marks: N?, max: N, count: N }]` | theory only (empty without theory credits): `midTerm1`, `midTerm2`, `assignment`, `attendance`, in that order. `max` from the offering's evaluation copy; `count` is how many assessments count toward the part (for `attendance`, the classes held for this student); `marks` null while `count` is 0. Unrounded |
| attendancePct | N? | the student's live attendance % behind the attendance part (07 §10); null while no class is held |
| components | `{ theory: N?, practice: N?, project: N? }` | each component's internal marks (out of 40, 50 and 50 by default), unrounded; a component the course lacks is absent; null while one of its parts or criteria has none |
| internalPct | N? | `100 × Σ internals / Σ maxima` at 2 dp, once `complete` (the CE report's average) |
| complete | B | every component the course has has its internal marks |
| trend, slope, points | S, N?, [N] | 07 §3: `rising` · `dropping` · `steady` · `insufficient`; `points` the last six published assessments' percentages, oldest first |
| computedAt | D | |

Indexes: `{ offeringId: 1, studentId: 1 }` unique.
Invariants: written only by `recomputeInternalMarks` (07 §2), whole, for every active student at once; a row of a student no longer active is deleted. Never edited by hand. Not recomputed while the offering is locked.

### 5.3a `rubricMarks` (M06, Q-41)
The practice and project internal rubrics a teacher fills on the Marks tab, per student. `offeringId` Id · `studentId` Id · `component` S (`practice` · `project`) · `criteria` `{ <policy key>: N }` — the criteria filled so far, keyed as in the evaluation policy (`practiceConcept` … `practiceViva`, `projectRelevance` … `projectReport`), each 0 to its maximum in the offering's copy, two decimals · `updatedBy` Id · timestamps.
Indexes: `{ offeringId: 1, studentId: 1, component: 1 }` unique (the Marks tab and the recompute read an offering's rows by its prefix).
Invariants: only for a component the offering has (credits above 0). Since M07 only `practice` is saved here: the project internal comes from the project reviews (§6.3a, M07 decision 2). Every save is audited (`marks.rubric_saved`, the criteria before and after). Refused while the offering is locked. External practice and project marks are never stored here: they come from the exam section with the end-semester marks (M08).

### 5.4 `endSemMarks`
The external marks of one student in one credit offering, from the exam section (M08 decision 1, 06 §8.3). `offeringId` Id · `studentId` Id · `externals` `[{ component: S, marks: N?, max: N, absent: B }]` — one entry per component the offering has (`theory` · `practice` · `project`); `marks` 0…`max`, two decimals, null exactly when `absent`; `max` from the offering's evaluation copy (07 §6) · `source` `csv|api` · `syncRunId` Id · `importedAt` D.
Indexes: `{ offeringId: 1, studentId: 1 }` unique.
Invariants: a re-import replaces the row (upsert) and is audited. Refused for a student whose grade sheet for the term is published. Writing a student's row turns their draft grade sheet to `incomplete` in the same transaction.

### 5.5 `gradeSheets`
`termId` Id · `studentId` Id · `programId` Id · `batchId` Id (the student's, M08) · `rows` `[{ offeringId, courseCode, courseTitle, credits: { theory, practice, project }, components: [{ component, internal, internalMax, external: N?, externalMax, absent: B, marks }], pct, grade, gradePoint }]` (max 20; 07 §6; empty while `incomplete`) · `credits` N · `sgpa` N? · `status` `incomplete|draft|published` · `missing` [S] (max 20, ≤ 200 each: what keeps an `incomplete` sheet from being worked out, e.g. "CUTM1014: theory internal missing (attendance)"; empty otherwise) · `computedAt` D · `publishedAt` D? · `publishedBy` Id?
Indexes: `{ termId: 1, studentId: 1 }` unique · `{ termId: 1, batchId: 1, status: 1 }` (a batch's sheets and their counts) · `{ 'rows.offeringId': 1, status: 1 }` (unlocking checks for a published sheet and turns drafts `incomplete`).
Invariants: written by the `compute/gradeSheets` job (06 §6), which never touches a `published` sheet. A student gets a `draft` only when every credit offering of theirs in the term is locked, their internal components are all non-null and their end-sem row is present (M08 decision 2); otherwise `incomplete`. Unlocking an offering or importing a student's end-sem marks turns affected drafts `incomplete`. Students see only their own `published` sheets.

### 5.6 `attainments` (one per credit offering, M09)
The latest attainment of one credit offering (07 §4), written whole by the `compute/attainment` job (06 §6). The programme report reads these and stores nothing (M09 decision 4).

| Field | Type | Rules |
|---|---|---|
| offeringId, courseId, programId, batchId, termId | Id | *denorm* from the offering, for the programme report |
| config | `{ targetPct, level3Pct, level2Pct, level1Pct, cieWeight, seeWeight, defaultTargetLevel }` | the `attainment` settings used (06 §7) |
| cos | `[{ coId: Id, code: S, statement: S, cie: { assessed: N, attained: N, pct: N, level: N }?, value: N?, met: B? }]` | ≤ 15, the course's COs when worked out; `cie` null when no question assessed the CO; `pct` and `value` at 2 dp; the target is `config.defaultTargetLevel` |
| see | `{ considered: N, attained: N, pct: N, level: N, withoutMarks: N }?` | the course's one SEE (07 §4); null without any end-sem row; `withoutMarks` = active students without a row |
| cells | `[{ coId: Id, outcome: S, level: 1\|2\|3 }]` | ≤ 225, the course's `coMap` when worked out, so the values always read against the grid they came from (A-181) |
| outcomes | `[{ code: S, value: N? }]` | PO1–PO12 then PSO1–PSO3; null where no assessed CO maps to it |
| warnings | [S] | ≤ 50, plain sentences |
| computedAt | D | |
| computedBy | Id? | who pressed "Work it out again"; null when a trigger queued it |

Indexes: `{ offeringId: 1 }` unique.
Invariants: written only by `recomputeAttainment` (07 §4), whole; never edited by hand. Skill offerings have none. Locked offerings are worked out too. A completed offering's record changes only when its own marks change or someone works it out again, never because the catalogue map changed (A-181).

## 6. Projects

### 6.1 `projects`
`offeringId` Id · `title` S (≤ 160) · `description` RichText? · `mode` `github|tracker` (*denorm* from offering) · `memberIds` [Id] (1–10, enrolled students) · `guideId` Id (faculty) · `repo` `{ owner: S, name: S, installationId: N, defaultBranch: S, linkedAt: D, lastSyncedAt: D?, syncError: S? }?` · `startsOn` D · `dueOn` D · `status` `active|completed`.
Indexes: `{ offeringId: 1 }` · `{ memberIds: 1 }` · `{ 'repo.owner': 1, 'repo.name': 1 }` unique partial · `{ mode: 1, status: 1 }`.

### 6.2 `projectTasks`
`projectId` Id · `offeringId` Id (*denorm*) · `title` S (≤ 160) · `description` RichText? · `assigneeId` Id (a project member) · `status` `backlog|in_progress|review|done` · `dueAt` D · `doneAt` D? · `createdBy` Id · `history` `[{ status, at, by }]` (max 50).
Indexes: `{ projectId: 1, status: 1 }` · `{ assigneeId: 1, status: 1 }` · `{ offeringId: 1, dueAt: 1 }`.
Invariants: only faculty move a task to `done` or back from `review`; students move their own tasks `backlog → in_progress → review` (PRJ-06, PRJ-08).

### 6.3a `projectReviews` (M07 decision 2)
A review of one project, marked on the evaluation policy's six internal project criteria for each member. `offeringId` Id (*denorm*) · `projectId` Id · `title` S (≤ 120) · `heldOn` D · `sessionId` Id? (its live class, `kind: 'review'`) · `marks` `[{ studentId: Id, criteria: { <policy key>: N } }]` (members only; each criterion 0 to its maximum in the offering's copy, two decimals; blank criteria absent) · `createdBy`, `updatedBy` Id · timestamps.
Indexes: `{ projectId: 1, heldOn: 1 }` · `{ offeringId: 1 }` (the recompute reads an offering's reviews).
Invariants: at most 20 reviews per project. Marks change only while the offering is unlocked, each change audited (`project.review_marked`). A review is deleted only while it has no marks. A student's project internal is the reviews' average per criterion (07 §2).

### 6.3 `commits`
`projectId` Id · `sha` S · `authorLogin` S? · `studentId` Id? (matched by `users.github.id`/login) · `committedAt` D · `message` S (≤ 500) · `additions` N · `deletions` N · `isMerge` B.
Indexes: `{ projectId: 1, sha: 1 }` unique · `{ projectId: 1, committedAt: 1 }` · `{ projectId: 1, studentId: 1 }`.

## 7. Engagement, notifications, configuration, operations

### 7.1 `engagementDaily`
`offeringId` Id · `studentId` Id · `day` S (`YYYY-MM-DD`, IST; 07 §11) · counters (all N, default 0): `videoSec`, `liveSec`, `focusedSec`, `quizAttempts`, `codeRuns`, `submissions`, `onTimeSubmissions`, `lessonsCompleted` · `expiresAt` D (day + 400 days).
Indexes: `{ offeringId: 1, studentId: 1, day: 1 }` unique · `{ offeringId: 1, day: 1 }` · TTL `{ expiresAt: 1 }` (`expireAfterSeconds: 0`).
Invariants: written only with `$inc` upserts (04 §3 S9).

### 7.2 `notifications`
`userId` Id · `kind` S (one of the kinds in 06 §9 that exist so far; each milestone adds its own to the enum) · `title` S (≤ 160) · `href` S (app-relative path) · `readAt` D? · `expiresAt` D (createdAt + 90 days).
Indexes: `{ userId: 1, readAt: 1, createdAt: -1 }` · TTL `{ expiresAt: 1 }`.

### 7.3 `settings`
`_id` S (the key, e.g. `attainment`) · `value` Mixed · `updatedBy` Id.
The shape and defaults of every key are Zod schemas in `lib/schemas/settings.ts` (06 §7). A missing document means "defaults".

### 7.4 `syncRuns`
`kind` `courseware|exam_pull_csv|exam_push_csv|exam_pull_api|exam_push_api|github|marks_lock|grade_sheets` (the last two M08: locking several offerings, working out a batch's grade sheets) · `mode` `new|all|one`? (courseware) · `offeringId` Id? · `termId` Id? · `batchId` Id? (M08) · `projectId` Id? · `status` `running|succeeded|partial|failed` · `actorId` Id? · `startedAt` D · `listedAt` D? (a listing is complete; until then `stats.rows` grows) · `finishedAt` D? · `stats` `{ rows: N?, applied: N, skipped: N, failed: N }` · `failures` `[{ row: N?, key: S?, message: S }]` (max 500; not `errors`, which Mongoose keeps for validation).
A courseware or `marks_lock` run is finished once `listedAt` is set (courseware) and applied + skipped + failed = rows; a run left `running` with no update for 2 hours counts as stopped, and one courseware run runs at a time.
Indexes: `{ kind: 1, startedAt: -1 }` · `{ offeringId: 1, startedAt: -1 }` · `{ batchId: 1, termId: 1, startedAt: -1 }` (a batch's last export, import, lock and grade-sheet runs, M08).

### 7.5 `auditLogs` (append-only, no `updatedAt`)
`at` D · `actorId` Id · `action` S (`entity.verb`) · `entity` S · `entityId` Id · `offeringId` Id? · `reason` S? · `before` Mixed? · `after` Mixed?
Indexes: `{ entity: 1, entityId: 1, at: -1 }` · `{ offeringId: 1, at: -1 }` · `{ actorId: 1, at: -1 }` · `{ entity: 1, at: -1 }` and `{ at: -1 }` (added in M01 so the audit page's "entity only" and "date range only" filters are index-backed).
Invariants: never updated or deleted by application code. `before`/`after` hold only the changed fields (marks, status), never answer text or files.

## 8. Retention

| Data | Kept for | Mechanism |
|---|---|---|
| Users, academic structure, offerings, assessments, submissions, attendance, marks, grade sheets, attainment | Permanent (university record) | — |
| Audit log | Permanent | — |
| Engagement counters | 400 days | TTL index |
| Guest (candidate) accounts, their grants and attempts | Permanent, like any submission (M04b open question "Guests") | — |
| Email codes (`otps`) | 10 minutes | TTL index |
| Notifications | 90 days | TTL index |
| Proctoring webcam snapshots | `snapshotRetentionDays` (90) after `resultsPublishedAt` (A-13; confirm Q-24) | The daily `proctorRetention` job deletes the objects, empties `proctor.snapshots` and sets the test's `snapshotsDeletedAt` (M04b) |
| Lesson videos/documents | Until the lesson is deleted | Deleted with the lesson |
| Class and meeting recordings (M03c T5) | Permanent with the session (no deletion yet) | — |
| Submission files | Permanent with the submission | — |
| syncRuns | 2 years | Monthly worker job |
| BullMQ completed/failed jobs | Last 1,000 / 5,000 per queue | `removeOnComplete` / `removeOnFail` |
