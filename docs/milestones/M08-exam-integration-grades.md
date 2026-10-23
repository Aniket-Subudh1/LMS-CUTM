# M08 · Exam-system integration, marks lock, grade sheet

> **Changed by M01b.** The export has columns per component the offering has (theory internal /40, practice internal /50, project internal /50) instead of scheme components, and the import takes the matching external marks (theory end-semester /60, practice and project external /50). The grade sheet follows 07 §6: each component out of 100, `coursePercentage` credit-weighted and rounded up once; non-credit offerings get no grade. `assertUnlocked` guards "refresh evaluation copy" instead of `rebindScheme`. The full grade table and pass rules are Q-40.

> **Q-41, answered 23 Oct 2026 (Aniket).** External marks all come from the exam section's CSV with the end-semester marks: theory end-semester /60, practice external /50 (the examiner, on the practice rubric) and project external /50 (relevance 10, report 20, defence 20). Teachers never type them in the LMS. Internal marks are M06's `internalMarks.components`.

| | |
|---|---|
| Depends on | M06 |
| Requirements | EXM-01, EXM-02 (constraints), EXM-03, EXM-04, EXM-05, EXM-07, CE-11, CE-12, NFR-03 (audit), NFR-05, ADM-04 (exam integration settings), DSH-07, COM-03 (`gradeSheet.published`) |
| Release | **R3** |
| Packages added | — |
| Collections | `endSemMarks`, `gradeSheets` (`syncRuns` exists since M07) |

## Goal

At the end of a term the admin locks each offering's internal marks (after which they cannot change silently), exports them for the exam section, imports end-semester marks, reviews mismatches, and publishes grade sheets that combine both into grades and SGPA for students. Until the exam-system API is documented (Q-04), the integration is a strict, validated CSV exchange that produces the same rows the API will (SRS §21 mitigation).

## Lock semantics (update 05 §3.8 invariant in the same commit)

- **Offering lock** (`offerings.lockedAt`) freezes **internal marks**: no grading changes, result publication, scheme rebinding or recomputation for that offering.
- **End-sem marks** are imported after the lock and freeze when the student's **grade sheet is published**; changing them afterwards requires an admin to unpublish that term's grade sheets with a reason (audited).

## Tasks

### T1 · Models, settings, pure functions
Files: `lib/models/end-sem-mark.ts`, `lib/models/grade-sheet.ts` (05 §5.4–5.5), `lib/schemas/settings.ts` (+ `grading`, `examIntegration`), `lib/domain/grades.ts` (+ test), `lib/domain/csv.ts` (+ `parseEndSemCsv`, `buildInternalMarksCsv`, tests).
- `gradeFor(pct, scale)`, `buildGradeSheetRows(inputs)`, `sgpa(rows)` — 07 §6 with the worked table and every boundary vector.
- `parseEndSemCsv` — 06 §8.3 rules (absent `Y` with marks → row error; marks > max → row error; duplicate key in the file → row error).
- `buildInternalMarksCsv(rows, componentKeys)` — 06 §8.4 columns, `papaparse.unparse`; test the header and a row.

### T2 · Enforce the lock everywhere
Add a `assertUnlocked(offeringId)` check (throws `AppError('LOCKED', 'Marks for this course are locked.')`) to: `gradeSubmission`, `publishResults`, `rebindScheme`, `changeEnrollments`, and make `recomputeInternalMarks` skip locked offerings (M06 already does). Integration test for each.

### T3 · Locking and unlocking (CE-12)
Route: `/admin/exams` with `TabNav`: Locks · CE export · End-sem import · Grade sheets.
- Locks tab: offerings of a term (filters: department, status) with internal-marks completeness and lock state.
- `lockOffering` (admin): recompute synchronously (`recomputeInternalMarks`), then if any enrolled student is not `complete` require `overrideReason` (VALIDATION otherwise, listing the students); in one transaction set `lockedAt`, `lockedBy` and write audit `marks.locked` (with the override reason if any).
- `lockOfferings` (bulk, admin): the same for up to 50 selected offerings per request; results listed per offering.
- `unlockOffering` (admin): `reason` required (≥ 10 chars); clears the lock; audit `marks.unlocked`; refused if the term's grade sheets for any of its students are published (unpublish first).

### T4 · CE export (EXM-04 / CE-11 via CSV)
Route handler `GET /api/exports/internal-marks?termId=&departmentId=` (admin session; add to 06 §3 — a generated file download is the one UI-facing route handler allowed):
- includes **locked** offerings only; one row per active enrollment (06 §8.4); `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="internal-marks-<term>-<dept>.csv"`;
- writes a `syncRuns` row (`exam_push_csv`, stats), sets `offerings.lastPushedAt`, audit `ce.exported`.

### T5 · End-sem import (EXM-03, EXM-07 via CSV)
`importEndSem` (admin, `FormData` file ≤ 2 MB):
1. `parseEndSemCsv`; resolve each row to an active enrollment in an offering of that term and course (unknown roll no / course / term / not enrolled → row error — the mismatch report).
2. Reject rows for students whose grade sheet for the term is published (row error).
3. All-or-nothing: in one transaction upsert `endSemMarks` (`source: 'csv'`, `syncRunId`, `importedAt`) and finish the `syncRuns` row (`succeeded` or, with errors, `failed` and nothing written); audit `endsem.imported`.
4. The page shows the last import's stats and its errors (row, key, message); the same errors are returned as `fieldErrors.file` lines.
Also list offerings of the term whose enrolled students lack end-sem rows (completeness view).

### T6 · Grade sheets (EXM-05, DSH-07)
- `computeGradeSheets` (admin, term, optional program): for every student with ugc enrollments in the term — every offering must be locked and have the student's end-sem row (absent allowed); otherwise the student is listed under "Incomplete" with reasons and gets no sheet. Builds rows with `buildGradeSheetRows`, `sgpa` (if `showSgpa`), upserts `gradeSheets` with `status: draft` (published sheets are not touched).
- Preview: `DataTable` of drafts (roll no, name, credits, SGPA, any F/Ab) with a per-student detail view identical to the student view.
- `publishGradeSheets` (admin, term [+ program]): drafts → `published`, `publishedAt/By`; `notify` students `gradeSheet.published`; audit `gradesheet.published` with counts.
- `unpublishGradeSheets` (admin, reason required): published → draft for the term [+ program]; audit.
- Student `/results`: published sheets by term — course code/title, credits, internal/max, external/max, total, %, grade, grade point, and SGPA; a print stylesheet (`@media print`) instead of PDF generation.

### T7 · Exam-system API (blocked on Q-04)
Do **not** build until the API documentation is in the repository. When it arrives: create `lib/integrations/exam-api.ts` implementing 06 §4.6; add `sync/examPull` and `sync/examPush` jobs that call the same row functions as T4/T5 (`EndSemRow`, `InternalMarksRow`), record `syncRuns` (`exam_pull_api`/`exam_push_api`), retry with backoff, and an admin "Re-sync" button (EXM-07); switch `examIntegration.mode` to `api`. Record the design in `PROGRESS.md` first.

### T8 · Integrations page (exam part)
Add to `/admin/integrations`: recent `syncRuns` of kinds `exam_*` with status, stats and a link to the error list.

### T9 · Tests
- Unit: T1 vectors.
- Integration: lock with incomplete students requires a reason; every guarded action returns LOCKED on a locked offering; export contains only locked offerings and the right component columns; end-sem import is all-or-nothing and reports unknown roll numbers; grade sheet for the 07 §6 example gives A, B, A+ and SGPA 7.56; absent → Ab; publishing notifies only included students; a student sees only their own published sheets; import rejected for students with published sheets.
- E2E (`tests/e2e/exams.spec.ts`): lock an offering → export CSV → import an end-sem CSV built from the export's roll numbers → compute and publish grade sheets → a student sees the sheet.

## Acceptance criteria

- **AC-M08-01** After locking, no path can change that offering's internal marks; unlocking requires a reason and is audited.
- **AC-M08-02** The CE export opens in a spreadsheet with one row per student, the internal total and every component column, and includes only locked offerings.
- **AC-M08-03** An end-sem file with one unknown roll number imports nothing and names that row; the corrected file imports fully.
- **AC-M08-04** Grade sheets reproduce 07 §6 exactly (grades, points, SGPA) and are visible to students only after publication.
- **AC-M08-05** Every lock, unlock, export, import and publication appears in the audit log and `syncRuns`.

## Validation checklist (human)

- [ ] Agree the CSV columns with the exam section (or receive the API documentation — Q-04).
- [ ] Confirm the grading scale, grade points and pass rules with the client (Q-19) and whether SGPA appears (Q-21).
- [ ] Dry-run one real term's end-sem file for one program in staging; review the mismatch report with the exam section.
