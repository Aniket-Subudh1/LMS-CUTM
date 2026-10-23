# M04 · Assessment engine

> **Changed by M01b.** "ugc" means a credit offering and "skill" a non-credit (0-0-0) one (`offering.category` is derived from credits). Course outcomes carry one to three Bloom levels (`bloomLevels`); an item still has its own single Bloom level. Which assessments count as Mid-term I/II, assignment or practice/project rubric marks is decided with M06 (Q-41) — keep `mode` as specified here.

| | |
|---|---|
| Depends on | M02 (M03 not required) |
| Requirements | CE-01, CE-02, CE-03 (quiz, written test, assignment, learning/lab records), CE-04 (configurable quizzes; proctoring in M05), CE-05, CE-08, ASG-01, ASG-02, ASG-03, ASG-04 (deadline, late flag, attempts), REC-01, REC-02, REC-03, REC-04 (evaluation), CPP-05, CPP-06, SKL-02 (quizzes attempted), SKL-03 (quiz materials), COM-03 (`assessment.*`, `results.published`) |
| Release | **R1 pilot** (with M00–M03) |
| Packages added | — |
| Collections | `assessments`, `submissions` |
| Components introduced | `AssessmentRunner` |

## Goal

One assessment engine for every gradable activity (ADR-14). Faculty build an assessment in any M04 mode, tag every item with COs, set the window, timing, attempts and rubric, and publish. Students attempt it with autosave and a server-enforced deadline, upload scanned pages or write in the editor. Objective items grade automatically; faculty grade the rest with rubrics and comments; results are published as a complete, audited record that later feeds CE (M06) and attainment (M09).

## Decisions (Aniket, 17 Oct 2026)

Asked while planning; each one changes a project rule or fills a gap in this file, recorded in the same commit as the first code that needs it.

1. **Home gets "Due soon" and "To grade"** (08 §6 assigns them to M04; the task list below did not). Students: open assessments closing within seven days that they have not handed in. Faculty: published assessments of their offerings with hand-ins waiting for marks. Each is shown only when it has rows.
2. **"New assessment" is a dialog, not a page** (04 §1, A-40: only the builder and the runner are routes). It opens on the Assessments and Records tabs (`?new=<mode>`), asks for the type, title and window, and goes to the builder (`{ next }`). Everything else starts from the type's typical settings in the table below.
3. **Each question is edited in its own dialog** ("Builder A"): questions are rows that drag to reorder, with ⋮ Edit / move / delete, as lessons, COs and plan sessions are since M03b. The milestone's `moveItem` is `reorderItems`, which `SortableList` and the `RowMenu` moves both send.
4. **The attempt runner is a focused page of its own** ("Runner B"), outside the sidebar and course header like the live room: a top bar with the timer, the save status and Submit, and a question map. It lives in the `(attempt)` route group at the same URL (`/courses/[offeringId]/assessments/[aid]/attempt`).
5. **Grading one hand-in has "Next to grade"** and "Save and open the next", so a teacher works down the ungraded hand-ins without returning to the list.
6. **Results are published only after the assessment closes** (`lateUntil ?? closesAt`), when every attempt still running has expired; `publishResults` then hands those in first (A-103).

Standing preference: every screen is shown first as static mock-ups and Aniket picks before it is built.

### Mock-up rounds

| Round | Screens | Pick |
|---|---|---|
| 1 | Assessments tab (teacher, student), New assessment dialog, builder, a question's dialog (one answer; written answer with a rubric) | **Builder A** (each question in a dialog). The rest as shown |
| 2 | Before starting, runner (desktop, phone), runner states (saving, five minutes left, time up, confirm), results | **Runner B** (a focused page, no sidebar; question map on the left, one column on phones). The rest as shown |
| 3 | Hand-ins list, grading one hand-in, Records tab (teacher, student), Home's Due soon and To grade | **With "Next to grade"**. The rest as shown |

## Modes and item types in this milestone

| Mode | Allowed item types | Typical settings |
|---|---|---|
| `quiz` | mcq, msq, numeric, text | timed, 1–3 attempts, shuffle |
| `written_test` | mcq, msq, numeric, text, file | timed, 1 attempt |
| `assignment` | text, file | untimed, optional late window |
| `learning_record` | text, file | untimed; one per period or one annual record (REC-03) |
| `lab_record` | text, file | untimed; one per experiment |

`coding_test`, `lab_test`, `coding_competition` (code items) arrive in M05; `project_review` (observation items) in M07. The schemas must reject a mode/type combination not in this table.

## Data-model changes in this milestone (update 05 in the same commit)
- `assessments.status` is `draft · published · results_published`; whether an assessment is open is **derived** from `opensAt`, `closesAt`, `lateUntil` and `now`. Add `dueNotifiedAt: Date?`. Add index `{ 'items.coIds': 1 }`.
- `submissions.answers` and `submissions.scores` are **Maps keyed by item id** so each save is one atomic `$set: { 'answers.<itemId>': … }`.

## Tasks

### T1 · Models and schemas
Files: `lib/models/assessment.ts`, `lib/models/submission.ts`, `lib/schemas/assessment.ts`; add to `scripts/sync-indexes.ts`.
- 05 §5.1–5.2 with the changes above.
- `lib/schemas/assessment.ts`: `AssessmentSettings`; `Item` as a discriminated union on `type` with per-type rules (options 2–8 and a valid key for mcq/msq; numeric value + tolerance ≥ 0; rubric rows ≤ 10 summing to `maxMarks`); `Answer` union by item type (mcq `optionId`; msq `optionIds`; numeric `value`; text `richText`; file `fileKeys` ≤ 10); `MODE_ITEM_TYPES` map from the table above.

### T2 · Pure functions
Files: `lib/domain/round.ts`, `lib/domain/grading.ts`, `lib/domain/attempts.ts`, `lib/domain/shuffle.ts` (+ tests).
- `round.ts`: 04 §6.10 plus `ceilTo` (07 §1) with every 07 §1 vector — first caller is `attemptTotal`.
- `grading.ts`: `autoGrade(item, answer)` (07 §14 rows for mcq/msq/numeric; returns `null` for manual types), `rubricTotal(rubric, criteriaMarks)`, `attemptTotal(items, scores)` → number or null if any item unscored (`roundHalfUp` 2 dp). Vectors: 07 §14 mcq/msq/numeric rows; msq {a,b} vs key {a,b,c} → 0; numeric 3.14 vs 3.1416 ± 0.01 → full.
- `attempts.ts`: `deadlineAt({ startedAt, durationMin, closesAt, lateUntil })` = min(start + duration, lateUntil ?? closesAt); `canStart({ now, opensAt, closesAt, lateUntil, attemptsUsed, attemptsAllowed, inProgress })` → `start | resume | not_open | closed | no_attempts_left`; `isLate(submittedAt, closesAt)`; `countedScore(attempts, policy)` (07 §14: best/last over graded attempts, else 0). Vectors: start 10:00, 60 min, closes 10:30, no late → 10:30; lateUntil 11:30 → 11:00; untimed with lateUntil 11:30 → 11:30; the counted-score rows of 07 §14 (M01b rewrote 07 §2, where they first stood).
- `shuffle.ts`: `seededShuffle(ids, seed)` — Mulberry32 seeded from a 32-bit FNV-1a hash of `seed`; deterministic (same seed → same order) and pure. Vector: the same input and seed give the same output twice; different seeds give different orders for a 10-element list.

### T3 · DAL and secrecy
File: `lib/data/assessments.ts`.
- `listOfferingAssessments(offeringId, filters, page)`: `learn` → `status ≠ draft`, plus the student's attempt summary (status; score only after results are published); `teach`/`oversee` → all, with submitted/graded counts (one aggregation on `submissions` grouped by `assessmentId` for the page's ids).
- `toStudentAssessment(doc)` — the **only** way a student DTO is built: removes `items[].answer` and rubric data the student does not need; never exposes scores before `results_published`.
- `getAttemptForStudent(submissionId)`: owner only; items in the attempt's stored `order`, options in stored order; uses `toStudentAssessment`.
- `listSubmissions(assessmentId, filters, page)`, `getSubmissionForGrading(submissionId)`: teach/oversee.

### T4 · Builder (faculty)
Routes: `/courses/[offeringId]/assessments` (list; add the tab; "New assessment" is a dialog, `?new=<mode>`, decision 2), `/assessments/[aid]/edit`.

| Action | Rules |
|---|---|
| `createAssessment` | teach; mode allowed for M04; title; dates via `istDateTime`; `opensAt < closesAt`; `lateUntil ≥ closesAt`; duration 1–600 or empty; attempts 1–10; policy; `status: draft`; redirect to edit |
| `updateAssessmentSettings` | any time while draft; once submissions exist only title, instructions and dates |
| `saveItem` | type allowed for the mode; for ugc offerings `coIds` ≥ 1 and ⊂ course COs (CPP-05/06); recompute `maxMarks`; rejected once any submission exists (CONFLICT "Items cannot change after students have started.") |
| `deleteItem`, `reorderItems` | same lock (`reorderItems` takes the whole order as `ids[]`, decision 3) |
| `publishAssessment` | ≥ 1 item; every ugc item has a CO (VALIDATION listing item numbers); rubric sums valid; `status: published`, `publishedAt`; `notify` enrolled students `assessment.published`; audit `assessment.published` |
| `deleteAssessment` | draft only |

Item editor forms (no client JS needed): prompt (`RichTextEditor`), max marks, CO checkboxes + Bloom level select, and per type: 8 option rows with a "correct" radio/checkbox (blank rows ignored), numeric value + tolerance, 10 rubric rows.

Also modify M01's `deleteCo`: CONFLICT when `Assessment.exists({ 'items.coIds': coId })`, naming the assessments.

### T5 · Attempting (students)
Routes: `/assessments/[aid]` (summary), `/assessments/[aid]/attempt` (runner, in the `(attempt)` route group, decision 4).

| Action | Rules |
|---|---|
| `startAttempt` | learn; `canStart` → `start` creates a submission (`attemptNo = used + 1`, `in_progress`, `startedAt = now`, `deadlineAt`, `order` from `seededShuffle(ids, submissionId)` when shuffling); `resume` returns the existing one; others → CLOSED/CONFLICT with a clear message; for `quiz` mode `$inc engagementDaily.quizAttempts`; redirect to the runner |
| `saveAnswer` | owner; `in_progress`; `now ≤ deadlineAt + 5 s` else auto-submit and CLOSED "Time is up — your answers were submitted."; `Answer` valid for the item type; file keys must `parseKey` to `submission/<assessmentId>/<viewer>`; `$set answers.<itemId>`; rate-limited (09 §4) |
| `submitAttempt` | owner; `in_progress`; `submittedAt = now` (an expired attempt is submitted with `autoSubmitted: true`); `late = isLate`; auto-grade objective items into `scores`; if every item is scored → `graded` + `total`; else `submitted`; `$inc engagementDaily.submissions` and `onTimeSubmissions` when not late |

- Enable the `submission` upload purpose in `createUpload`: the viewer has an `in_progress` attempt on that assessment.
- `AssessmentRunner` (client): renders items by type (mcq radios, msq checkboxes, numeric input, text `RichTextEditor`, file `FileUpload`); autosaves an item 2 s after its last change and shows "Saved"/"Saving…"/"Not saved — retrying" (`aria-live`); countdown from `deadlineAt` corrected by the server-time offset passed as a prop; at zero calls `submitAttempt`; Submit asks for confirmation.
- Summary page for `learn`: instructions, window, attempts used/allowed, Start/Resume; after `results_published`: own marks per item, rubric breakdown and comments (answer keys are not shown).

### T6 · Grading and results (faculty)
Routes: `/assessments/[aid]/grade`, `/assessments/[aid]/grade/[submissionId]`.

| Action | Rules |
|---|---|
| `gradeSubmission` | teach; per item marks 0…max (rubric criteria 0…criterion max; item marks = sum), optional comment ≤ 1000; may override auto scores; offering locked → LOCKED; when every item is scored → `graded`, `total`, `gradedAt`, `gradedBy`; audit `submission.graded` with per-item before/after |
| `publishResults` | teach; first auto-submit every expired `in_progress` attempt; then if any submitted attempt is not fully scored → VALIDATION "12 submissions still need grading."; `status: results_published`, `resultsPublishedAt`; `notify` students with a submission `results.published`; audit |

Regrading after publication is allowed (audited) unless the offering is locked. The grade list shows: student, attempt, submitted at, late badge, auto-submitted badge, status, total; filters: status, late.

### T7 · Records (REC-01 … REC-04)
Route: `/courses/[offeringId]/records` (tab shown per 08 §3).
- Records are `learning_record` / `lab_record` assessments created in the same builder (the Records tab opens the New assessment dialog with `?new=learning_record` or `?new=lab_record`). The annual learning record (REC-03) is a `learning_record` assessment whose window spans the year — no special code.
- `learn`: each record assessment with own submission status, marks after publication, and a link to write/upload.
- `teach`/`oversee`: a students × record-assessments grid (submitted / graded / missing), each cell linking to the grading page.

### T8 · Sweeps and notifications
Worker scheduler `assessment-sweep` (hourly, 02 §8) runs `compute/assessmentSweep`:
1. For published assessments with `closesAt` within 24 h and `dueNotifiedAt` null: notify enrolled students without a submission (`assessment.dueSoon`), set `dueNotifiedAt`.
2. Auto-submit `in_progress` attempts whose `deadlineAt + 5 min < now` (same logic as `submitAttempt`, shared via `lib/data/attempts.ts` because the action and the job both use it).

### T9 · Skill-course traceability (SKL-02)
People tab for skill offerings adds "Quizzes attempted" (distinct quiz assessments with ≥ 1 attempt) and "Quiz average %" (counted scores of published quizzes).

### T10 · Tests
- Unit: all vectors in T2.
- Integration: secrecy — serialize `toStudentAssessment` of an assessment with keys and assert no key values appear; a student cannot read another student's attempt (404); `saveAnswer` after deadline auto-submits; file key of another student rejected; items locked after the first start; publish blocked without COs on a ugc item; `publishResults` blocked with ungraded submissions and auto-submits expired attempts; regrade writes an audit entry with before/after; `quizAttempts` and on-time counters increment once.
- E2E (`tests/e2e/assessments.spec.ts`): faculty builds a 3-item quiz (mcq, numeric, text) with COs and publishes → student attempts, autosave survives a reload, submits → faculty grades the text item with a rubric → publishes results → student sees marks and comments.

## Acceptance criteria

- **AC-M04-01** A ugc assessment cannot be published while any item lacks a CO tag.
- **AC-M04-02** A student's browser never receives answer keys (verified by test and by inspecting the network payload of the attempt page).
- **AC-M04-03** A timed attempt ends at `deadlineAt` even if the student's clock is wrong or the tab is closed; answers saved before the deadline are kept.
- **AC-M04-04** A scanned multi-page PDF (≤ 25 MB) and phone photos upload as an assignment answer from a phone.
- **AC-M04-05** Objective items are graded on submit; manual items with a rubric total exactly the sum of their criteria.
- **AC-M04-06** Results cannot be published while any submission is ungraded; publishing notifies only students who submitted.
- **AC-M04-07** Every grade change after publication is in the audit log with before/after marks.
- **AC-M04-08** Learning and lab records work through the same builder; the Records tab shows the completion grid.

## Validation checklist (human)

- [ ] Faculty builds one real quiz and one real assignment from a current course, with the course's COs.
- [ ] A student completes the quiz on a phone over a throttled connection; autosave messages are understandable.
- [ ] Upload a photographed assignment from a phone camera.
- [ ] Grade with a rubric; publish; the student reads feedback.
- [ ] Confirm with the client that the five modes cover their CE practice for theory courses (Q-06).
