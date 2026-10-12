# M05 · Virtual lab & proctoring

| | |
|---|---|
| Depends on | M04 |
| Requirements | LAB-01, LAB-02, LAB-03, LAB-04, LAB-05, CE-03 (coding test, lab test, coding competition), CE-04 (proctored quizzes), NFR-03 (proctoring) |
| Release | part of R2 |
| Packages added | `@uiw/react-codemirror`, `@codemirror/lang-cpp`, `@codemirror/lang-java` |
| Env vars added | `CODE_RUNNER_URL`, `CODE_RUNNER_TOKEN` |
| Collections | — (extends `assessments`, `submissions`) |
| Components introduced | `CodeEditor` |

## Goal

Practicals run entirely in the browser: students write C, C++ or Java in a code editor, run it against the visible test cases, and submit; the server grades against all test cases (including hidden ones) and the result flows into CE. Faculty see every run, the time taken and the test-case results. Lab tests and quizzes can be proctored: consent, full-screen, tab-switch and paste detection, optional webcam snapshots, an event timeline, and auto-submission after a configurable number of violations.

## Gate — compiler service (Q-25 b)

The client asked for compilers "just like the recruitment platform". Before T1 read Q-25 (b) in `PROGRESS.md`.
- **Open, or the recruitment platform uses Judge0:** build the Judge0 CE 1.13.1 adapter below (A-10).
- **Another runner:** implement `lib/integrations/code-runner.ts` with the same exported signatures (06 §4.4) for it. Statuses must map onto `RunStatus`; if the runner cannot run batches or enforce time/memory limits, **stop and record an `@dev` question**.

## Tasks

### T1 · Code-runner adapter and settings
Files: `lib/env.ts` (+ `CODE_RUNNER_URL`, `CODE_RUNNER_TOKEN`), `.env.example`, `tests/setup.ts`, `lib/integrations/code-runner.ts`, `lib/schemas/settings.ts` (+ `codeRunner` key, 06 §7).
- `runBatch(jobs)`: chunks of ≤ 20; `POST {CODE_RUNNER_URL}/submissions/batch?base64_encoded=true` with header `X-Auth-Token: CODE_RUNNER_TOKEN` and body `{ submissions: [{ source_code, language_id, stdin, cpu_time_limit, memory_limit }] }` (all text base64-encoded; **no `expected_output`** — we compare ourselves, 07 §14); then poll `GET /submissions/batch?tokens=<csv>&base64_encoded=true&fields=token,status,stdout,stderr,compile_output,time,memory` every 500 ms until no `status.id` is 1 or 2, up to 20 s (then `AppError('INTEGRATION', 'The code runner is busy. Try again in a minute.')`). Map status ids per 06 §4.4. Decode base64 outputs; cap each at 64 KB.
- `listLanguages()`: `GET /languages`.
- On `/admin/settings/codeRunner` (the settings page from M02) render, below the JSON editor, the runner's live language list (id and name) so an admin can confirm the configured ids.

### T2 · Pure functions
File: `lib/domain/code.ts` (+ test).
- `normalizeOutput(s)`, `outputsMatch(stdout, expected)` — 07 §14 normalization with its vector table.
- `codeItemMarks(maxMarks, cases, results)` — weighted pass ratio (07 §14). Vectors: weights [1,1,2], passing first and third → 3/4 × 10 = 7.5; none passing → 0; all → 10.
- `applyProctorEvent(state, event, limit)` — 07 §15 with its vector table.

### T3 · Code items in the builder
- Modes `coding_test`, `lab_test`, `coding_competition` become available; allowed item types `code`, `mcq`, `text` (update `MODE_ITEM_TYPES`).
- Code item form: prompt, max marks, COs/Bloom, languages (checkboxes from `codeRunner.languages`), per-language starter code (`CodeEditor` with `name`), time limit 1–10 s, memory 64,000–512,000 KB, and 15 test-case rows (input, expected output, hidden checkbox, weight 1–10; blank rows ignored; ≥ 1 visible and ≥ 1 case total).
- Limits from 05 §5.1 (≤ 5 code items, ≤ 8 KB per input/expected).
- `CodeEditor` (client): `@uiw/react-codemirror` with `cpp()` for `c`/`cpp` and `java()`; when `name` is set, mirrors the value into a hidden input for forms.

### T4 · Running code (LAB-02, LAB-03)
`runCode` action (learn, in `assessments/[aid]/attempt/actions.ts`):
- owner, `in_progress`, before `deadlineAt`; language ∈ the item's languages; source ≤ 64 KB.
- rate limits: one run per `runCooldownSec` and 200/hour per student (09 §4).
- runs **visible** test cases only; returns per case `{ status, passed, stdout (≤ 4 KB), stderr/compileOutput (≤ 4 KB), timeMs }` — never hidden cases, never expected outputs of hidden cases.
- saves the source as the item's answer (same as `saveAnswer`), `$push runs: { itemId, at, passed, total }` with `$slice: -200`, `$inc engagementDaily.codeRuns`.
`AssessmentRunner` renders code items with a language select, `CodeEditor`, a Run button (disabled during cooldown, with a countdown) and the visible results table.

### T5 · Grading code (LAB-05)
- `submitAttempt` (M04): if the assessment has code items, set `submitted` and enqueue `compute/gradeCode { submissionId }` (job id `code-<submissionId>`); objective non-code items are still graded immediately.
- Worker `gradeCode`: loads the assessment **with** hidden cases; for each code item with an answer runs all cases (`runBatch`), compares with `outputsMatch`, stores `results`, scores the item with `codeItemMarks` (`by: 'auto'`); unanswered code items score 0; when every item is scored → `graded` + `total`. Integration failures throw (BullMQ retries with backoff). Idempotent: re-running overwrites the same results.
- Faculty may override any code score with `gradeSubmission` (audited, M04).

### T6 · Lab activity for faculty (LAB-03)
- Grading page, per code item: final source (read-only `CodeEditor`), language, all test-case results (hidden ones included, for faculty), number of runs and their pass counts over time, time spent (`submittedAt − startedAt`).
- Grade list adds columns: runs, best visible pass ratio, final auto score.

### T7 · Proctoring (LAB-04, CE-04, NFR-03)
- Builder: a proctoring section for every mode except records and project reviews — enabled, require full-screen, tab-switch limit (0 = log only), block paste, webcam snapshots, snapshot interval 30–600 s.
- Consent: when proctoring is enabled, the summary page shows exactly what is monitored (09 §11) and `startAttempt` requires `proctorConsent: true`.
- Runner (client) when enabled:
  - requests full-screen on start (`document.documentElement.requestFullscreen()`); if required and refused → "Full-screen is required for this test" and the attempt does not begin;
  - `fullscreenchange` (left full-screen) → `fullscreen_exit`; `visibilitychange` to hidden → `tab_hidden`; `paste` in any answer field when blocking → `preventDefault()` + `paste_blocked`;
  - webcam snapshots (if enabled): `getUserMedia({ video: true })`; every interval draw a frame to a canvas ≤ 320 px wide, JPEG quality 0.6, upload with purpose `proctor-snapshot` (enable it in `createUpload`: the viewer has an `in_progress`, proctored attempt with snapshots on), then record it; camera refused → one `webcam_unavailable` event (the attempt continues, Q-09).
- `recordProctorEvent` action (owner, `in_progress`, 60/min): validates the event type; `$push proctor.events` (`$slice: -300`) and, for snapshots, `proctor.snapshots` (`$slice: -120`, key must `parseKey` to `proctor/<submissionId>/<viewer>`); applies `applyProctorEvent`; on auto-submit performs the same submission as `submitAttempt` with `autoSubmitted: true` and returns `{ autoSubmitted: true }` so the runner shows "Your test was submitted because of repeated tab switches."
- Faculty grading page: violation count badge, event timeline (IST times), snapshot thumbnails via `/api/files` (teach/oversee only).

### T8 · Snapshot retention
`lib/schemas/settings.ts` (+ `proctoring` key). Worker scheduler `proctor-retention` (daily `0 3 * * *` IST) → `compute/proctorRetention`: submissions whose assessment `resultsPublishedAt` is older than `snapshotRetentionDays` and that still have snapshots, in batches of 500: `deleteObjects(keys)` then `$set proctor.snapshots = []`.

### T9 · Tests
- Unit: T2 vectors.
- Integration (mock `@/lib/integrations/code-runner`): `runCode` returns only visible cases and no hidden data (assert the serialized response); cooldown → RATE_LIMITED; `gradeCode` computes weighted marks and is idempotent; hidden cases never appear in `getAttemptForStudent`; proctor limit 3 → the 4th tab switch auto-submits; a snapshot key for another submission is rejected; retention deletes keys older than the window only.
- E2E (`tests/e2e/lab.spec.ts`): `CODE_RUNNER_URL` points at `tests/e2e/fake-runner.ts`, a tiny HTTP server implementing the two batch endpoints that echoes `stdin` as `stdout` with status 3 (GitHub-hosted CI runners use cgroup v2, where Judge0 1.13.1 cannot run). Faculty creates a lab test with one echo problem; student runs (visible case passes), submits; the grade appears after the job; a proctored quiz auto-submits after the configured tab switches.
- Manual, on the real runner: C, C++ and Java "sum of two numbers" programs pass; an infinite loop returns `time_limit`; a compile error shows the compiler message.

## Acceptance criteria

- **AC-M05-01** C, C++ and Java programs compile and run in the browser lab with per-case results within ~5 s under normal load.
- **AC-M05-02** Hidden test cases and expected outputs never reach a student's browser.
- **AC-M05-03** Submitting grades every code item against all cases with the weighted formula; faculty can override with an audited reason.
- **AC-M05-04** Faculty see runs, time taken and per-case results for each student (LAB-03).
- **AC-M05-05** With a tab-switch limit of 3, the 4th switch auto-submits and the timeline records all four.
- **AC-M05-06** Proctoring never starts without the student's explicit consent; snapshots are deleted after the retention window.
- **AC-M05-07** A student cannot run code more often than the cooldown allows.

## Validation checklist (human)

- [ ] Run one real lab experiment from the current syllabus end to end with three students on the real runner.
- [ ] Try to cheat: switch tabs, exit full-screen, paste code; confirm what faculty see.
- [ ] Ask the client which proctoring features they actually require (Q-09) and whether webcam snapshots are acceptable to students.
- [ ] 50 students press Run at once (staging): note runner latency for M11 sizing.
