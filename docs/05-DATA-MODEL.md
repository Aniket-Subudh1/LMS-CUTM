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
                                             ├─ internalMarks · endSemMarks
                                             ├─ projects ── projectTasks · commits
                                             ├─ attainments
                                             └─ engagementDaily
gradeSheets (term × student) · notifications · settings · syncRuns · auditLogs
```

---

## 3. Identity and structure

### 3.1 `users`
| Field | Type | Rules |
|---|---|---|
| name | S | required, trimmed, ≤ 120 |
| email | S | required, lowercase, unique |
| roles | [S] | required, 1–3 of `admin hod faculty student support` |
| status | S | `invited` (default) · `active` · `disabled` |
| passwordHash | S? | `select: false`; absent until the invitation is accepted |
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

Indexes: `{ code: 1 }` unique · `{ departmentId: 1, status: 1 }`.
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
| cos | `[{ _id: Id, code: S, statement: S, bloomLevels: [S], suggestedBloom: S?, targetLevel: N? }]` | credit courses only; ≤ 15; `code` `CO1…` unique, never reused for a new CO; `statement` ≤ 500; `bloomLevels` 0–3 of `remember understand apply analyse evaluate create`; `suggestedBloom` is the import's guess from the first verb, shown pre-ticked, cleared when a person saves (A-58); `targetLevel` 0–3 |
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
Invariants: removing a CO removes its mapping cells; a re-import keeps each CO's `_id` by its code (`mergeCos`). A CO referenced by an assessment item cannot be removed (M04). Contact details from courseware are never stored (A-60).

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
| modules | `[{ _id: Id, title: S, order: N }]` | max 40; prefilled from the course's module titles |
| plan | `{ doc: RichText?, version: N, publishedAt: D?, publishedBy: Id? }` | `version` increments on each publish |
| calendar | `[{ _id: Id, date: D, topic: S, coIds: [Id] }]` | max 200; `topic` ≤ 200 |
| status | S | `draft` · `active` · `completed` |
| lockedAt, lockedBy | D?, Id? | internal-marks lock (M08) |
| lastPushedAt | D? | last CE export/push |

Indexes: `{ courseId: 1, termId: 1, batchId: 1, section: 1 }` unique · `{ facultyIds: 1, status: 1 }` · `{ departmentId: 1, termId: 1 }` · `{ batchId: 1, termId: 1 }` · `{ termId: 1, status: 1 }` · `{ status: 1, _id: -1 }` (the admin list filtered by status alone).
Invariants: students see only `active`/`completed` offerings. While `lockedAt` is set, no action may change a submission score, assessment result state, enrollment, evaluation copy or internal mark for this offering. The course must be in the batch programme's curriculum when the offering is created. End-sem marks are imported after the lock and freeze when the student's grade sheet is published (M08).

### 3.9 `enrollments`
`offeringId` Id · `studentId` Id · `status` `active|dropped` · `engagement` `{ score: N?, band: S?, trend: S, signals: { attendance, video, timeliness, practice, activity: N? }, computedAt: D }?` (nightly snapshot, M10).
Indexes: `{ offeringId: 1, studentId: 1 }` unique · `{ studentId: 1, status: 1 }` · `{ offeringId: 1, status: 1 }`.

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
| published | B | default false |
| publishedAt | D? | |

Indexes: `{ offeringId: 1, moduleId: 1, order: 1 }` · `{ offeringId: 1, published: 1 }`.
Invariants: an offering holds at most 300 lessons (`createLesson` refuses the 301st), so its content index is one bounded read. `fileName` is the sanitized display name (≤ 120, 06 §5).
Hard delete allowed while unpublished and without progress rows (then the object is deleted from storage).

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
| offeringId | Id | |
| kind | S | `class` · `review` |
| assessmentId | Id? | `review` sessions: the `project_review` assessment they serve |
| title | S | ≤ 160 |
| scheduledStart, scheduledEnd | D | start < end; duration ≤ 6 h |
| startedAt, endedAt | D? | set by the faculty start/end actions or room webhooks |
| status | S | `scheduled` · `live` · `ended` · `cancelled` |
| roomName | S | `ls-<sessionId>`; unique |
| attendanceMode | S | `manual` · `derived` (skill offerings: always `derived`) |
| finalizedAt | D? | derived attendance computed (07 §10) |
| createdBy | Id | |

Indexes: `{ offeringId: 1, scheduledStart: -1 }` · `{ status: 1, scheduledEnd: 1 }` · `{ roomName: 1 }` unique.

### 4.4 `attendance`
| Field | Type | Rules |
|---|---|---|
| sessionId, offeringId, studentId | Id | |
| status | S | `present` · `absent` |
| source | S | `manual` · `derived` |
| presence | `[{ joinedAt: D, leftAt: D? }]` | from live-engine webhooks; max 50 (reconnects) |
| presenceSec | N | computed at finalize |
| focusedSec | N | Σ from focus beacons |
| lastFocusAt | D? | last accepted focus beacon (anti-inflation, 07 §9) |
| markedBy, markedAt | Id?, D? | manual marks and overrides |

Indexes: `{ sessionId: 1, studentId: 1 }` unique · `{ offeringId: 1, studentId: 1 }`.
Invariants: a manual mark overrides a derived one and is audited (`attendance.marked`).

## 5. Assessment and marks

### 5.1 `assessments`
Assessment **modes**: `quiz` · `written_test` · `assignment` · `learning_record` · `lab_record` · `coding_test` · `lab_test` · `coding_competition` · `project_review`.

| Field | Type | Rules |
|---|---|---|
| offeringId | Id | |
| mode | S | one of the modes above |
| title | S | ≤ 160 |
| instructions | RichText? | |
| items | [Item] | 1–100 (see below) |
| maxMarks | N | Σ `items.maxMarks`, stored |
| opensAt, closesAt | D | opensAt < closesAt |
| lateUntil | D? | ≥ closesAt; null = no late submissions |
| durationMin | N? | 1–600; null = untimed |
| attemptsAllowed | N | 1–10 |
| attemptPolicy | S | `best` · `last` |
| shuffleItems, shuffleOptions | B | |
| proctoring | `{ enabled: B, fullscreen: B, tabSwitchLimit: N, blockPaste: B, webcamSnapshots: B, snapshotIntervalSec: N }` | M05; `tabSwitchLimit` 0 = log only; interval 30–600 |
| status | S | `draft` · `published` · `results_published`. Open/closed is **derived** from `opensAt`, `closesAt`, `lateUntil` and now |
| publishedAt, resultsPublishedAt | D? | |
| dueNotifiedAt | D? | set when the 24-hour reminder was sent (M04 sweep) |
| createdBy | Id | |

**Item** (embedded, `_id` per item):
| Field | Type | Rules |
|---|---|---|
| type | S | `mcq` · `msq` · `numeric` · `text` · `file` · `code` · `observation` |
| prompt | RichText | |
| maxMarks | N | > 0 |
| coIds | [Id] | **≥ 1 for ugc offerings** (CPP-05/06); each ∈ course.cos |
| bloomLevel | S? | |
| options | `[{ _id: Id, text: S }]?` | mcq/msq: 2–8, text ≤ 500 |
| answer | `{ optionId? , optionIds?, value?, tolerance? }?` | mcq: optionId; msq: optionIds; numeric: value + tolerance ≥ 0. **Never sent to students** |
| rubric | `[{ _id: Id, criterion: S, maxMarks: N }]?` | text/file/observation; max 10; Σ maxMarks = item.maxMarks |
| code | `{ languages: [S], starter: { [lang]: S }, timeLimitSec: N, memoryKb: N, testCases: [{ _id: Id, input: S, expected: S, hidden: B, weight: N }] }?` | code only; ≤ 5 code items per assessment; 1–15 test cases; input/expected ≤ 8 KB; hidden cases **never sent to students** |

`observation` items have no student answer — faculty score them (project reviews, viva). `text`/`file` items are what records and written assignments are made of.

Indexes: `{ offeringId: 1, status: 1, closesAt: 1 }` · `{ offeringId: 1, mode: 1 }` · `{ status: 1, closesAt: 1 }` · `{ 'items.coIds': 1 }`.
Invariants: once any submission exists, `items` cannot change (only `title`, `instructions`, dates may). Hard delete only while `draft`.

### 5.2 `submissions` (one document per attempt)
| Field | Type | Rules |
|---|---|---|
| assessmentId, offeringId, studentId | Id | |
| attemptNo | N | 1…attemptsAllowed |
| status | S | `in_progress` · `submitted` · `graded` |
| startedAt | D | |
| deadlineAt | D | min(startedAt + duration, lateUntil ?? closesAt) |
| submittedAt | D? | |
| late | B | submittedAt > closesAt |
| autoSubmitted | B | time ran out or proctoring limit hit |
| order | `[{ itemId: Id, optionIds: [Id]? }]` | per-attempt shuffle |
| answers | Map `<itemId>` → `{ optionId?, optionIds?, value?, text?: RichText, fileKeys?: [S], code?: { language: S, source: S } }` | Map keyed by item id so each save is one atomic `$set: { 'answers.<itemId>': … }`; fileKeys max 10; source ≤ 64 KB |
| runs | `[{ itemId, at: D, passed: N, total: N }]` | code runs (LAB-03); max 200 (`$slice: -200`) |
| results | `[{ itemId, testCaseId, status: S, timeMs: N?, memoryKb: N? }]` | final graded code results |
| scores | Map `<itemId>` → `{ marks: N, criteria: [{ criterionId, marks }]?, by: 'auto' \| Id, comment: S? }` | comment ≤ 1000 |
| total | N? | null until every item is scored |
| gradedAt, gradedBy | D?, Id? | |
| proctor | `{ violations: N, events: [{ type: S, at: D, detail: S? }], snapshots: [{ key: S, at: D }] }` | events max 300, snapshots max 120 (`$slice`) |

Indexes: `{ assessmentId: 1, studentId: 1, attemptNo: 1 }` unique · `{ offeringId: 1, studentId: 1 }` · `{ assessmentId: 1, status: 1 }`.
Invariants: only one `in_progress` attempt per (assessment, student). Every score change is audited (`submission.graded`, with before/after marks). Learning and lab **records** are submissions of `learning_record`/`lab_record` assessments.

### 5.3 `internalMarks`
`offeringId` Id · `studentId` Id · `components` `[{ key: S, pct: N?, marks: N, counted: N }]` (keyed by the evaluation policy's parts; how assessments feed them is Q-41) · `total` N · `complete` B (every component has ≥ the required assessments) · `trend` `rising|dropping|steady|insufficient` · `slope` N? · `points` [N] (max 6) · `computedAt` D.
Indexes: `{ offeringId: 1, studentId: 1 }` unique.
Invariants: written only by `recomputeInternalMarks` (07 §2). Never edited by hand. Not recomputed while the offering is locked.

### 5.4 `endSemMarks`
`offeringId` Id · `studentId` Id · `marks` N? · `maxMarks` N · `absent` B · `source` `csv|api` · `syncRunId` Id · `importedAt` D.
Indexes: `{ offeringId: 1, studentId: 1 }` unique. Re-import replaces (upsert) and is audited.

### 5.5 `gradeSheets`
`termId` Id · `studentId` Id · `programId` Id · `rows` `[{ offeringId, courseCode, courseTitle, credits: { theory, practice, project }, components: [{ component, internal, internalMax, external, externalMax, marks }], pct, grade, gradePoint }]` (max 20; 07 §6) · `credits` N · `sgpa` N? · `status` `draft|published` · `publishedAt` D? · `publishedBy` Id?
Indexes: `{ termId: 1, studentId: 1 }` unique · `{ termId: 1, status: 1 }`.

### 5.6 `attainments` (latest result per scope)
`scope` `offering|program` · `offeringId` Id? · `programId` Id · `batchId` Id? · `termIds` [Id] · `config` (snapshot of `attainment` settings used) · `cos` `[{ coId, code, cie: { assessed: N, attained: N, pct: N, level: N }?, see: { … }?, value: N?, target: N, met: B? }]` · `outcomes` `[{ code: S, value: N? }]` · `warnings` [S] (max 50) · `computedAt` D · `computedBy` Id?
Indexes: `{ scope: 1, offeringId: 1 }` unique partial (scope offering) · `{ scope: 1, programId: 1, batchId: 1 }` unique partial (scope program).

## 6. Projects

### 6.1 `projects`
`offeringId` Id · `title` S (≤ 160) · `description` RichText? · `mode` `github|tracker` (*denorm* from offering) · `memberIds` [Id] (1–10, enrolled students) · `guideId` Id (faculty) · `repo` `{ owner: S, name: S, installationId: N, defaultBranch: S, linkedAt: D, lastSyncedAt: D?, syncError: S? }?` · `startsOn` D · `dueOn` D · `status` `active|completed`.
Indexes: `{ offeringId: 1 }` · `{ memberIds: 1 }` · `{ 'repo.owner': 1, 'repo.name': 1 }` unique partial · `{ mode: 1, status: 1 }`.

### 6.2 `projectTasks`
`projectId` Id · `offeringId` Id (*denorm*) · `title` S (≤ 160) · `description` RichText? · `assigneeId` Id (a project member) · `status` `backlog|in_progress|review|done` · `dueAt` D · `doneAt` D? · `createdBy` Id · `history` `[{ status, at, by }]` (max 50).
Indexes: `{ projectId: 1, status: 1 }` · `{ assigneeId: 1, status: 1 }` · `{ offeringId: 1, dueAt: 1 }`.
Invariants: only faculty move a task to `done` or back from `review`; students move their own tasks `backlog → in_progress → review` (PRJ-06, PRJ-08).

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
`kind` `courseware|exam_pull_csv|exam_push_csv|exam_pull_api|exam_push_api|github` · `mode` `new|all|one`? (courseware) · `offeringId` Id? · `termId` Id? · `projectId` Id? · `status` `running|succeeded|partial|failed` · `actorId` Id? · `startedAt` D · `listedAt` D? (a listing is complete; until then `stats.rows` grows) · `finishedAt` D? · `stats` `{ rows: N?, applied: N, skipped: N, failed: N }` · `failures` `[{ row: N?, key: S?, message: S }]` (max 500; not `errors`, which Mongoose keeps for validation).
A courseware run is finished once `listedAt` is set and applied + skipped + failed = rows; a run left `running` with no update for 2 hours counts as stopped, and one courseware run runs at a time.
Indexes: `{ kind: 1, startedAt: -1 }` · `{ offeringId: 1, startedAt: -1 }`.

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
| Notifications | 90 days | TTL index |
| Proctoring webcam snapshots | 90 days after `resultsPublishedAt` (A-13; confirm Q-24) | Daily worker job deletes objects and `$unset`s keys |
| Lesson videos/documents | Until the lesson is deleted | Deleted with the lesson |
| Submission files | Permanent with the submission | — |
| syncRuns | 2 years | Monthly worker job |
| BullMQ completed/failed jobs | Last 1,000 / 5,000 per queue | `removeOnComplete` / `removeOnFail` |
