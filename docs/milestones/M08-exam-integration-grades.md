# M08 · Exam-system integration, marks lock, grade sheet

| | |
|---|---|
| Depends on | M06 (and M07, whose reviews make the project internal) |
| Requirements | EXM-01, EXM-02 (constraints), EXM-03, EXM-04, EXM-05, EXM-07, CE-11, CE-12, NFR-03 (audit), NFR-05, ADM-04 (exam integration: CSV now; the setting arrives with T7), DSH-07, COM-03 (`gradeSheet.published`) |
| Release | **R3** |
| Packages added | — |
| Collections | `endSemMarks`, `gradeSheets`; `syncRuns` gains `marks_lock` and `grade_sheets` runs (`exam_*` kinds exist since M07) |

## Goal

At the end of a term the admin locks each course's internal marks, so they cannot change silently. The admin gives the exam section a file of them and takes the same file back with the external marks filled in. Mismatches are reviewed, and the admin publishes grade sheets that combine both into grades and an SGPA for students. Until the exam-system API is documented (Q-04), the exchange is a strict, validated CSV whose rows are the ones the API will carry (SRS §21 mitigation).

## Decisions (Aniket, 23 Oct 2026)

Earlier: M01b set the components (theory internal 40 + end-semester 60; practice and project 50 + 50, each component out of 100) and the course percentage (credit-weighted, rounded up once, 07 §2, §6). Q-41 sent every external mark through the exam section's CSV; teachers never type one.

1. **The exam section fills in the export.** The LMS's internal-marks file carries three empty columns, `theoryexternal`, `practiceexternal` and `projectexternal`. The exam section fills them in and uploads the same file back: a number, `AB` for absent, blank where the course has no such component. One row per student and course; the name and internal columns are ignored on the way back (06 §8.3–8.4).
2. **No mark is guessed.** Locking a course whose students' internal marks are incomplete needs a reason. Those students get no grade sheet: they are listed as incomplete, with what is missing, until an admin unlocks the course, the teacher fills the gap, and the course is locked again. A missing part never counts as 0. This matters for in-person courses: with no classes recorded in the LMS, the theory attendance part is empty for everyone (Q-58).
3. **`AB` in any external part makes the course Ab.** Grade point 0; the course's credits still count in the SGPA; the absent part counts 0 in the total shown (07 §6).

## Consequences (dev)

- **A batch and a term are the unit of work.** A batch is a programme's intake year, for example "B.Tech CSE 2024–28", and the exam section publishes results per batch and semester. The export, the grade sheets and their publication are per term and batch. Because of decision 1, an exported file must import whole: a department's term is about 18,000 rows, while a batch's is about 600 students × 7 courses. The end-sem import takes up to **10,000 rows** a file (06 §8.3; a row is about 100 bytes, inside the 2 MB action limit). The export refuses a larger batch with a message.
- **Work over many students runs in the worker** (law 5): locking several courses at once (`compute/lockOffering`, one job per course under one `marks_lock` run), and working out a batch's grade sheets (`compute/gradeSheets`). Locking a single course stays in the request, as before: one recompute of at most 1,000 students, then the lock. Publishing a batch's sheets also stays in the request: one `updateMany` and notifications for at most about 1,000 students, as `releaseResults` does.
- **Imports go to locked or unlocked courses alike.** The lock freezes internal marks. End-sem marks freeze when the student's grade sheet is published. 06 §8.3's "non-locked offering" was wrong and is removed.
- **A stale draft cannot be published.** Unlocking a course, or importing end-sem marks for a student, turns their draft sheets back to `incomplete`, saying why, in the same transaction. They are worked out again before publishing.
- **The `examIntegration` setting waits for T7.** Until the API exists, CSV is the only mode, and a setting with one choice would be filler (law 3).
- **T2 is mostly built.** `assertUnlocked` (`lib/data/offerings.ts`) has refused, since M04, M06 and M07: grading, publishing results, waiving a penalty, running code again, moving `countsToward`, saving rubric and review marks, changing enrolments, and refreshing the evaluation copy. The recompute skips locked courses. Two gaps remain: the hourly sweep still publishes results by rule, and an assessment with published results can still be deleted.

## Lock semantics (05 §3.8)

- **Course lock** (`offerings.lockedAt`) freezes **internal marks**: no grading, result publication, change to what counts toward which part, rubric or review marks, enrolment change, evaluation refresh or recompute. Attendance may still be corrected, audited (Q-51); it reaches the internal marks only after an unlock.
- **End-sem marks** are imported for locked or unlocked courses and freeze when the student's **grade sheet is published**. Changing them afterwards requires an admin to unpublish that batch's sheets with a reason (audited).

## Mock-ups (T0)

Drawn inside the real app at 1440 px and 390 px; two variants where there is a real choice. Picks are recorded here before T3.

| # | Screen | Variants |
|---|---|---|
| E1 | The Exams page for one term and batch | A · four tabs (Locks · Send to the exam section · Bring back marks · Grade sheets) · B · one page with four numbered steps, each saying what is done and what is next |
| E2 | Locking: the dialog for a course with incomplete students (the list and a reason), and a bulk lock's results | one |
| E3 | Bringing back the marks: the upload, the last import's figures and its mismatch report | one |
| E4 | Grade sheets before publishing: Ready, Incomplete (with what is missing) and Published, and one student's sheet | one |
| E5 | The student's Results | A · a mark sheet, one table row per course · B · a card per course with its components · both with a print view |
| E6 | Grading settings, and the exam runs on Integrations | one |

## Tasks

### T1 · Models, settings, pure functions
Files: `lib/models/end-sem-mark.ts`, `lib/models/grade-sheet.ts` (05 §5.4–5.5), `lib/models/sync-run.ts` (+ `marks_lock`, `grade_sheets`), `lib/schemas/settings.ts` (+ `grading`), `lib/schemas/exams.ts`, `lib/schemas/jobs.ts`, `lib/domain/grades.ts` (+ test), `lib/domain/csv.ts` (+ `parseEndSemCsv`, `buildInternalMarksCsv`, tests), the `gradeSheet.published` notification, `scripts/sync-indexes.ts`.
- `gradeFor(pct, scale)`, `buildGradeSheetRow(input)`, `sgpa(rows)` — 07 §6, the worked table and every boundary vector, including an `AB` in practice only.
- `externalMaxima(policy)` — theory `theoryEndSem` (60); practice 100 − the practice rubric (50); project the external project rubric (50).
- `parseEndSemCsv(text)` — 06 §8.3: the six needed columns; values a number with ≤ 2 decimals, `AB` or blank; a duplicate (roll no, course, term) → row error; ≤ 10,000 rows. `checkEndSemRow(row, course)` — blank exactly where the course has no such component, and 0 to its maximum.
- `buildInternalMarksCsv(rows)` — 06 §8.4 columns with `papaparse.unparse`; test the header and a row of each credit pattern.

### T2 · Close the lock's two gaps
- The hourly sweep (`compute/assessmentSweep`) leaves alone the results of a locked course's tests; they go out by their rule after an unlock.
- `deleteAssessment` refuses an assessment with published results while the course is locked.
- Integration: every guarded action returns LOCKED on a locked course (grading, publishing results, waiving, running code again, `countsToward`, rubric marks, review marks, enrolments, evaluation refresh, deleting a published assessment); the sweep publishes nothing for a locked course.

### T3 · The Exams page and locking (CE-12; mock-ups E1, E2)
Route `/admin/exams` (admin; "Exams" in the admin menu): a term's batches, each with its progress (courses locked of total, students with end-sem marks, sheets ready, incomplete and published), ten a page. `/admin/exams/[batchId]?term=` is one batch's page (E1's pick).
- The batch's credit courses of the term: internal-marks completeness and lock state.
- `lockOffering` (admin): `recomputeInternalMarks`, then any active student not `complete` requires `overrideReason` (≥ 10 characters; VALIDATION listing the students and what each lacks). In one transaction set `lockedAt` and `lockedBy`, and write audit `marks.locked` (with the reason, if any).
- `lockOfferings` (admin): up to 50 of the batch's courses. A `marks_lock` run and one `compute/lockOffering` job per course; a course with incomplete students is not locked, and its failure says to lock it on its own with a reason. The page shows the run's results.
- `unlockOffering` (admin): reason ≥ 10 characters. Refused while a published sheet includes the course (unpublish first). Clears the lock, turns draft sheets that include the course to `incomplete`, and writes audit `marks.unlocked`, in one transaction.

### T4 · Send to the exam section (EXM-04 / CE-11 via CSV)
`GET /api/exports/internal-marks?termId=&batchId=` (admin session; 06 §3):
- **locked** courses of the batch and term only; one row per active enrolment (06 §8.4), sorted by course code and roll number, streamed from a cursor; more than 10,000 rows → 400 with a message.
- `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="internal-marks-<term>-<batch>.csv"`.
- An `exam_push_csv` run (stats), `offerings.lastPushedAt`, audit `ce.exported`.

### T5 · Bring back the marks (EXM-03, EXM-07 via CSV; mock-up E3)
`importEndSem` (admin, term, batch, `FormData` file ≤ 2 MB), on the batch's page, since the file is that batch's export:
1. `parseEndSemCsv`. Resolve each row to one active enrolment in a credit offering of that course and term; `checkEndSemRow` against that offering's credits and evaluation copy. An unknown roll number or course, another term, a student of another batch, or a student not enrolled or enrolled twice, is a row error: the mismatch report.
2. A student whose grade sheet for the term is published → row error.
3. All or nothing: in one transaction, upsert `endSemMarks` (`source: 'csv'`, `syncRunId`, `importedAt`), turn the students' draft sheets to `incomplete`, and finish the `exam_pull_csv` run (`succeeded`; or `failed` with its failures and nothing written). Write audit `endsem.imported`.
4. The batch page shows the last import's figures and its failures (row, key, message); the same lines return as `fieldErrors.file`. Then the batch's courses whose enrolled students lack end-sem marks (completeness).

### T6 · Grade sheets (EXM-05, DSH-07; mock-ups E4, E5)
- `computeGradeSheets` (admin, term, batch) → a `grade_sheets` run and the `compute/gradeSheets` job (`gs-<termId>-<batchId>`). For every student of the batch with active credit enrolments in the term: each course must be locked, the student's internal components all non-null, and the end-sem row present (decision 2). The sheet is then `draft` with its rows (`buildGradeSheetRow`) and SGPA (`sgpa`, if `showSgpa`); otherwise `incomplete` with what is missing. Published sheets are not touched.
- The preview: Ready · Incomplete · Published, ten a page (roll no, name, credits, SGPA, any F or Ab; for incomplete students, what is missing). A student's detail is identical to the student's own view.
- `publishGradeSheets` (admin, term, batch): drafts → `published`, `publishedAt` and `publishedBy`, with audit `gradesheet.published` (counts) in one transaction; then `notify` those students (`gradeSheet.published`, in-app).
- `unpublishGradeSheets` (admin, term, batch, reason ≥ 10 characters): published → draft; audit `gradesheet.unpublished`.
- `/admin/settings/grading`: the scale (lines of `grade | from % | points`, falling, the last from 0), the absent grade and its points, and whether the SGPA shows (06 §7).
- Student `/results` ("Results" in the student menu): published sheets by term, newest first. For each course: code, title, credits, each component's internal, external and total, the %, the grade and grade point; then the credits and SGPA. A print stylesheet (`@media print`) instead of PDF generation.

### T7 · Exam-system API (blocked on Q-04)
Do **not** build until the API documentation is in the repository. When it arrives: create `lib/integrations/exam-api.ts` implementing 06 §4.6; add `sync/examPull` and `sync/examPush` jobs that call the same row functions as T4/T5 (`EndSemRow`, `InternalMarksRow`), record `syncRuns` (`exam_pull_api`/`exam_push_api`), retry with backoff, and an admin "Re-sync" button (EXM-07); add the `examIntegration` setting (`mode`). Record the design in `PROGRESS.md` first.

### T8 · Integrations page (exam part; mock-up E6)
Add to `/admin/integrations`: the last 50 runs of kinds `exam_*`, `marks_lock` and `grade_sheets`, with status, figures and a link to the batch page that shows their failures.

### T9 · Tests
- Unit: T1 vectors.
- Integration: locking with incomplete students requires a reason, and they then get `incomplete` sheets; a bulk lock leaves an incomplete course unlocked and says why; T2's guards; the export holds only locked courses, the six mark columns and one row per active enrolment; the end-sem import is all or nothing and names an unknown roll number; a value where the course has no such component is a row error; the 07 §6 example gives O, A, B+ and SGPA 8.58; `AB` in practice gives Ab and GP 0, counted in the SGPA; unlocking or importing turns drafts `incomplete`; publishing notifies only the students published; a student sees only their own published sheets; import rejected for students with published sheets; unlock refused while a published sheet includes the course.
- E2E (`tests/e2e/exams.spec.ts`): lock a course → download the export → fill in its external columns → import it → work out and publish the batch's sheets → the student sees the sheet.

## Acceptance criteria

- **AC-M08-01** After locking, no path can change that course's internal marks; unlocking requires a reason and is audited.
- **AC-M08-02** The export opens in a spreadsheet with one row per student and course, the internal marks of every component and three empty external columns, and includes only locked courses.
- **AC-M08-03** The export, filled in and uploaded back, imports fully. The same file with one unknown roll number imports nothing and names that row.
- **AC-M08-04** Grade sheets reproduce 07 §6 exactly (grades, points, SGPA) and are visible to students only after publication. A student with a missing mark gets no sheet and is listed with what is missing.
- **AC-M08-05** Every lock, unlock, export, import and publication appears in the audit log and `syncRuns`.

## Validation checklist (human)

- [ ] Show the export to the exam section and agree that they fill in the three columns (or receive the API documentation — Q-04).
- [ ] Confirm the grading scale, grade points and pass rules with the client (Q-19, Q-40), ceiling or nearest (Q-39), and whether the SGPA appears (Q-21).
- [ ] Dry-run one real batch's end-sem file in staging; review the mismatch report with the exam section.
