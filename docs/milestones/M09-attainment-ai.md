# M09 · CO-PO-PSO attainment & AI tagging assistance

> **Changed by M01b.** Outcome codes are fixed (PO1–PO12, PSO1–PSO3) and the course's CO–PO map is shared by every programme that lists the course; a programme only titles the codes (`outcomeTitles`). Programme attainment reads the curriculum entries (05 §3.6a) for its courses. AI suggestions for the map are applied through the catalogue's `CoPoEditor` by the course coordinator or an admin, never written directly.

| | |
|---|---|
| Depends on | M04, M08 (M04b's papers and AI adapter, M06's counted attempts) |
| Requirements | CPP-07, CPP-08, CPP-09, CPP-10 (configurable thresholds only), EXM-06, DSH-06 |
| Release | part of R4 |
| Packages added | none (`openai` came with M04b) |
| Env vars added | none (`OPENAI_API_KEY`, `OPENAI_MODEL` came with M04b) |
| Collections | `attainments` (one record per credit offering) |

## Goal

Attainment is worked out from marks with no spreadsheet work (CPP-08/09):
- CO attainment from the question-level marks of published assessments (CIE) and the end-semester marks (SEE);
- then PO and PSO attainment through the course's CO–PO–PSO map;
- per course, and per programme and batch, compared with a target.

An AI assistant suggests CO tags and Bloom levels for questions, and CO–PO levels for courses. A person always reviews and saves (CPP-07).

The formula (07 §4–5) is the team's R&D proposal (action A-3). The client must confirm it (Q-07) before attainment reports are used officially. The thresholds and weights are settings, so confirmation changes configuration, not code.

## Decisions (Aniket, 24 Oct 2026)

This file was written before M01b, M03b, M04b, M06 and M08. Before rewriting it, the code was read for each input, and four points needed an answer. Aniket chose the recommended option on each.

1. **SEE is credit-weighted across the externals.** Since M08 a student's end-semester marks come per component: theory out of 60, practice out of 50, project out of 50, each possibly `AB`. A student's SEE % is each component's external % weighted by its credits, the way the course percentage is (07 §4):
   - `AB` in any part counts as not attained, as `AB` makes the course Ab (M08 decision 3);
   - a student with no end-sem row is left out and counted in a warning;
   - every credit course has an SEE.
2. **The AI is told only the outcome titles a programme gave.** Untitled codes are left out of the brief, and the editor says which, with a link to the programme's outcome titles (Q-43).
   - On a course's Outcomes tab, the titles are the offering's programme's.
   - On the catalogue course (`/catalog/[id]`), each code takes the first title given by the programmes that list the course, in programme-code order.
3. **One target for every CO:** the setting's `defaultTargetLevel` (2). The course model's `targetLevel` was never settable and is removed.
4. **The programme report is worked out when it is opened**, from the courses' stored values: no job, no stored programme record and no Compute button. `attainments` holds one record per credit offering.

## Consequences (dev)

- **CIE reads each attempt's own paper.** Since M04b an attempt keeps the questions it was given, and bank draws differ from student to student. Attainment reads the counted attempt's paper through `breakdown()` (`lib/domain/results.ts`), so its per-CO numbers equal the "By outcome" view on the student's own result.
  - A negative mark on a question counts as 0 there.
  - The proctoring penalty belongs to no question, so it is left out (A-178).
- **A missed assessment counts 0** toward the COs of its fixed questions, and toward each draw's CO filter at count × marks each. A draw with no CO filter adds nothing for a student who missed it (A-179, A-14).
- **A CO's CIE % is over the students assessed on it**, not over every enrolled student. A student is assessed on a CO when some question on their paper, or in the assessment they missed, carries it. On fixed papers that is everyone, as in 07 §4's example (A-180).
- **Locked courses are worked out too**, since attainment changes no mark. End-sem marks arrive after the lock.
- **A record stands until its own data changes.** It keeps a copy of the CO–PO map and the settings it used, so a printed copy stays self-consistent. Editing the catalogue map recomputes only the course's **active** offerings. A completed course changes only when its marks change or someone works it out again (A-181).
- **A course taught in several sections counts once** in the programme report, as the mean of its sections' values (A-182).
- **Practice rubric marks and project reviews carry no CO tags,** so they do not feed CO attainment. Lab-record and other assessments do, through their questions (A-183).
- **Only published results count** (A-20). A test released "each person's at once" counts once a teacher publishes its results (A-184).
- **The Outcomes tab exists since M03b, for every role.** M09 adds attainment to it for teachers, heads of department and admins. Students see the tab as before, without attainment (09 §2).
- **The question's suggestion comes from what is being typed.** A credit course's question cannot be saved without a CO. So "Suggest outcomes (AI)" sits inside the question dialog (builder and course bank) and reads the dialog's unsaved text. It ticks the boxes and picks the level; nothing is stored until Save.
- **AI errors follow 06 §4.7 and the M04b code.** No key gives CONFLICT, and a failed request gives INTEGRATION (logged). `null` means no suggestion ("No suggestion available right now").
- **Jobs dedupe as M06's do** (`queueRecompute`, a stable id), not by a minute bucket.

## Mock-ups (T0)

Drawn inside the real app at 1440 px and 390 px, with two variants where there is a real choice. The picks are recorded here before T3.

| # | Screen | Variants |
|---|---|---|
| A1 | The Outcomes tab with attainment (a teacher's view) | A · attainment first, then the outcomes and mapping as today · B · a "Mapping · Attainment" switch at the top of the tab |
| A2 | The CO–PO grid with an "Attainment" row under "Average" | one |
| A3 | The question dialog before and after "Suggest outcomes (AI)": the ticked outcomes, the level, "Suggested by AI — review, then Save" and the reason | one |
| A4 | The CO–PO editor after "Suggest levels (AI)": the suggested cells as unsaved changes with an AI mark, the reasons below, and the codes left out because they have no title | one |
| A5 | Reports › Attainment: programme, batch and term; the course × outcome table; the programme row against the target | one |
| A6 | Settings › Attainment, with 07 §4's example worked out by the saved values | one |

Drawn on 24 Oct 2026 as faculty1, the HoD and admin on the e2e data (CUTM1602), and shown to Aniket on one page: https://claude.ai/artifact/Ep4y6pUdn56PsD5aNv8jNP (private).

## Tasks

### T1 · Model, setting, pure functions
Files:
- `lib/models/attainment.ts` (05 §5.6), added to `scripts/sync-indexes.ts`;
- `lib/models/course.ts`, without `targetLevel` (decision 3);
- `lib/schemas/settings.ts` (+ `attainment`, 06 §7), with its `PARSE` line in `lib/data/settings.ts`;
- `lib/domain/attainment.ts` (+ test).

Functions:
- `level(pct, settings)`.
- `externalPct(credits, externals)`: the credit-weighted SEE % or `'absent'` (decision 1), with 07 §4's vectors.
- `missedItems(assessment)`: what a missed assessment counts toward (A-179).
- `computeOfferingAttainment(input)`, with these tests:
  - 07 §4's whole worked example as one test: 10 students, 4 questions, the end-sem column and the map. It asserts every CO value and every outcome: PO1 2.21, PO2 2.08, PO3 2, PSO1 2, PSO3 2.25, the rest null.
  - The "CIE only" case.
  - The students on the threshold (s3, s6, s7).
  - Weights 0.4 / 0.6 give CO1 2.4.
  - A CO never assessed gives null and a warning.
  - The drawn-papers vector.
- `computeProgramAttainment(courses)`: 07 §5's two vectors.

### T2 · Working it out, and the triggers (EXM-06)
`lib/data/attainment.ts`, `recomputeAttainment(offeringId, now, actorId?)`. It is worker-safe: no `next/*`, and the settings are read as `lib/data/internal-marks.ts` reads them. Steps:
1. Credit offerings only; locked ones too. Load the offering's credits, and the course's COs and `coMap`.
2. Load the `results_published` assessments (at most 200): items `_id`, `maxMarks`, `coIds`; `sections.draw`; `attemptPolicy`.
3. Load the active enrolments (at most 1,000). For each student and assessment, `countedAttempt` (07 §14) picks the attempt. Its `paper` (`_id`, `maxMarks`, `coIds`) and `scores` are read 500 attempts at a time, as the `testStats` job reads them. A student with none gets `missedItems`.
4. Load the offering's `endSemMarks` and apply `externalPct`.
5. Call `computeOfferingAttainment`, then upsert the record with the copies of the map and settings, and the warnings: COs not assessed; CIE only; students without end-sem marks; drawn questions with no outcome.

The job is `compute/attainment { offeringId }`, queued by `queueAttainment` (id `att-<offeringId>`, 06 §6). It is queued:
- after `releaseResults` (by hand or by rule);
- after a grade changes on published results (`gradeSubmission`, the `gradeCode` job);
- after `importEndSem`, for every offering the file touched;
- after `publishGradeSheets`, for the batch's credit offerings in the term (EXM-06);
- after `saveCoMap` and `deleteCo`, for the course's active credit offerings.

"Work it out again" on the Outcomes tab is `requestAttainment` (teach, admin; 1 a minute per offering; `computedBy`).

Reads:
- `getOfferingAttainment(offeringId)`: teach or oversee. A student gets nothing, and someone with no access gets a 404.
- `getProgramAttainment({ programId, batchId, termId? })`: admin, or a HoD for their department's programmes.
  - It reads the batch's credit offerings (in that term, or every term) and refuses more than 200 ("Pick a term").
  - It reads their records, averages each course's sections, and calls `computeProgramAttainment`.

### T3 · The Outcomes tab (CPP-09, DSH-06; mock-ups A1, A2)
`/courses/[offeringId]/outcomes` keeps what it shows today, and for teachers, heads of department and admins adds attainment:
- "Worked out <time> with: target 60 %, levels 70/60/50, CIE 0.5 / SEE 0.5", read from the record's copy of the settings.
- "Work it out again" for teachers and admins, and Print.
- Before the first run, a sentence on when it is worked out.
- The COs: code, statement, Bloom level; CIE students assessed, attained, % and level; SEE level; the value as a `Progress` bar (out of 3) with the number; the target; and Met or Not met.
- The `CoPoMatrix` of the record's map, with an "Attainment" row: each outcome's value, or "—" where nothing maps to it.
- The warnings in plain sentences.
- A print view for accreditation files: the shell's `@media print` rules, and no PDF or Excel export (CPP-10's export is backlog).

### T4 · Reports › Attainment (CPP-09; mock-up A5)
- `/reports` gains a `TabNav`: Continuous evaluation · Attainment.
- `/reports/attainment` (hod, admin): programme, then batch, then term ("All terms" by default), as `/reports/ce`'s filters are.
- A row per course: code, title and term, and each outcome's value, or "Not worked out yet" linking to its Outcomes tab.
- Then the programme row: each outcome's value against `defaultTargetLevel`.
- Print.

### T5 · AI adapter and actions (CPP-07)
Files: `lib/schemas/ai.ts`, `lib/integrations/ai.ts` (made by M04b, with `draftQuestions`).
- `suggestItemTags` and `suggestCoMap` use 06 §4.7's call shape (`responses.parse`, `env().OPENAI_MODEL`, `zodTextFormat`, 2,000 output tokens), and keep the M04b handling of a missing key and a failed request.
- `ItemTagSuggestion = { coCodes: string[] (1–2), bloomLevel: BLOOM_LEVELS, rationale: string ≤ 300 }`. After parsing, codes not among the course's COs are dropped; none left → `null`.
- `CoMapSuggestion = { cells: { co, outcome, level: 1|2|3, rationale ≤ 200 }[] }`. Unknown codes and duplicates are dropped; none left → `null`.
- System prompts (constants in `ai.ts`):
  - Item tags: "You help university teachers tag an assessment question with the course outcomes (COs) it assesses and its Bloom's taxonomy level (remember, understand, apply, analyse, evaluate, create). Choose only from the CO codes provided. Prefer one CO; choose two only when the question clearly assesses both. Base the Bloom level on what the student must do. Give a one-sentence rationale."
  - CO map: "You help define a CO–PO–PSO correlation matrix. For each pair where the course outcome contributes to the program outcome, give a level: 3 strong, 2 moderate, 1 slight. Omit pairs with no meaningful contribution. Use only the codes provided."
- The briefs hold only the question (its prompt and options as plain text), CO codes and statements, and the titled outcome codes (decision 2). No student data reaches them (09 §12).
- Actions: both need the AI to be set up (CONFLICT otherwise), count toward the `ai` limit (30 an hour per user, shared with "Draft with AI"), and write nothing.
  - `suggestItemTags(formData)` (`app/(app)/tests/bank/actions.ts`, beside `draftWithAi`) takes the question dialog's own fields. In the builder, `assessmentId` gives the offering (teach). In a course bank, `offeringId` gives the course (`requireBankEditor`). It returns the CO ids, the level and the reason.
  - `suggestCoMap({ courseId, offeringId? })` (`app/(app)/catalog/actions.ts`, the course's editors) returns the cells, the reasons, and the codes left out for want of a title.

### T6 · Suggestions in the UI, and the settings form (mock-ups A3, A4, A6)
- **The question dialog** (builder and course bank, wherever it shows the course's outcomes and the AI is set up) gets "Suggest outcomes (AI)". It sends the dialog's unsaved question, then ticks the suggested outcomes and selects the level. It shows "Suggested by AI — review, then Save" with the reason. Nothing is stored until the teacher saves.
- **The CO–PO editor** (Outcomes tab and catalogue course, for the coordinator and admins) gets "Suggest levels (AI)". The suggestion fills the grid as unsaved changes, so the amber ring, the count and Discard work as before. Each suggested cell has an AI mark, and the reasons and the untitled codes are listed below. Saving uses the normal `saveCoMap`.
- **`/admin/settings/attainment`:** a plain form, one labelled field per value with its help and recommended value (06 §7). It ends with 07 §4's example worked out by the saved values, as Grading shows its example.

### T7 · Tests
- **Unit:** the T1 vectors.
- **Integration** (`tests/integration/attainment.test.ts`, through the real compute worker as `exams.test.ts` runs it):
  - 07 §4's dataset built as real documents → the stored values equal the worked example;
  - `cieWeight` 0.4 / `seeWeight` 0.6 → CO1 2.4;
  - an offering with no published assessments → every CO value null, with warnings;
  - a drawn section → each student is judged on their own paper;
  - a student who missed an assessment does not attain its COs;
  - `importEndSem` and `publishGradeSheets` recompute the affected offerings;
  - a locked offering is worked out;
  - a HoD of another department → 404, and a student gets no attainment;
  - the programme report averages a course's sections and keeps a HoD to their department;
  - "Work it out again" twice in a minute → RATE_LIMITED;
  - the settings refuse levels that do not fall and weights that do not add up to 1.
- **AI** (mocked per file, as `ai-drafts.test.ts` does):
  - unknown CO codes are dropped;
  - `null` → "No suggestion available right now";
  - no key → CONFLICT;
  - the 31st request in an hour → RATE_LIMITED;
  - the question and the course's map are unchanged after a suggestion;
  - the briefs contain no field of the seeded users (name, email, roll number).
- **E2E** (`tests/e2e/outcomes.spec.ts`): the e2e seed gains one published, outcome-tagged quiz and end-sem marks on one offering. Its teacher works attainment out and sees CO and PO values; its student sees the tab without attainment.

## Acceptance criteria

- **AC-M09-01** For the documented dataset the stored CO values are 2.5, 2 and 2, and PO1 2.21, PO2 2.08, PO3 2, PSO1 2, PSO3 2.25. Unmapped outcomes are blank.
- **AC-M09-02** Importing end-sem marks recomputes attainment for the affected offerings without manual action (EXM-06).
- **AC-M09-03** A CO never assessed in a published assessment is reported as a warning, not as zero.
- **AC-M09-04** AI suggestions never change data until a person saves; no student data is sent to the model.
- **AC-M09-05** Changing thresholds in settings changes the next computation, and the report states the settings used.

## Validation checklist (human)

- [ ] Present the formula and the worked example (07 §4), including SEE by credits (decision 1), to the client; record their answer to Q-07.
- [ ] Recompute one real course and compare with the department's existing attainment sheet; explain every difference.
- [ ] Faculty try "Suggest outcomes" on ten real questions; record how many suggestions they accepted unchanged.
