# M09 · CO-PO-PSO attainment & AI tagging assistance

| | |
|---|---|
| Depends on | M04, M08 |
| Requirements | CPP-07, CPP-08, CPP-09, CPP-10 (configurable thresholds only), EXM-06, DSH-06 |
| Release | part of R4 |
| Packages added | `@anthropic-ai/sdk` |
| Env vars added | `ANTHROPIC_API_KEY` |
| Collections | `attainments` |

## Goal

Attainment is calculated automatically from marks — no spreadsheet work: CO attainment from item-level CIE scores and end-sem results, then PO and PSO attainment through the CO-PO-PSO matrix, per course and per program/batch, compared with targets (CPP-08/09). An AI assistant suggests CO tags and Bloom levels for questions and CO-PO correlation levels for courses; a human always reviews and saves (CPP-07).

The formula (07 §4–5) is the team's R&D proposal (action A-3). The client must confirm it (Q-07) before attainment reports are used officially; the thresholds and weights are settings, so confirmation changes configuration, not code.

## Tasks

### T1 · Model, settings, pure functions
Files: `lib/models/attainment.ts` (05 §5.6), `lib/schemas/settings.ts` (+ `attainment`), `lib/domain/attainment.ts` (+ test); add the model to `scripts/sync-indexes.ts`.
- `computeOfferingAttainment(input)` — 07 §4 including the full worked example as one test (10 students, 4 items, end-sem column, the CO map) asserting every CO value and every outcome value (PO1 2.21, PO2 2.08, PO3 2, PSO1 2, PSO3 2.25, unmapped null), the "CIE only" case and the threshold-boundary students.
- `computeProgramAttainment(courseResults)` — 07 §5 (mean of non-null course values per outcome). Vector: course A PO1 2.21, course B PO1 1.79, course C PO1 null → 2.

### T2 · Computing and triggers (EXM-06)
File: `lib/data/attainment.ts` — `recomputeOfferingAttainment(offeringId, now)`:
1. ugc only. Load the course (COs with target levels, `coMap`), the program's PO/PSO codes, settings.
2. `results_published` assessments with their items (`_id`, `maxMarks`, `coIds`, `attemptPolicy`).
3. Active enrollments; for each student and assessment the **counted attempt** (`countedScore` policy, M04) and its per-item `scores` (one query on `submissions`, projection `scores`, `total`, `attemptNo`, `studentId`, `assessmentId`, `status`).
4. `endSemMarks` of the offering.
5. `computeOfferingAttainment` → upsert the offering-scope document (05 §5.6) with the settings snapshot and warnings.
Triggers: enqueue `compute/attainment { offeringId }` (job id `att-<offeringId>-<minuteBucket>`) after `publishResults`, after `importEndSem` for every affected offering, and after `publishGradeSheets` (EXM-06); "Recompute" button on the Outcomes tab (teach/admin, 1/min).
Program scope: `recomputeProgramAttainment(programId, batchId, termIds)` uses the latest offering documents; triggered from the report page.

### T3 · Outcomes tab (CPP-09, DSH-06)
Route: `/courses/[offeringId]/outcomes` (ugc; teach/oversee; add the tab).
- CO table: code, statement, Bloom level, CIE (assessed students, attained, %, level), SEE level, value, target, met badge, `Meter` (0–3).
- Outcomes: `CoPoMatrix` in `values` mode (CO rows × PO/PSO columns showing the correlation levels, plus a bottom row with each outcome's attainment value); unmapped outcomes shown as "—".
- Warnings (not-assessed COs, CIE only, students missing end-sem marks) and "Computed <time> with settings: target 60 %, levels 70/60/50, CIE 0.5 / SEE 0.5".
- Print stylesheet for accreditation files (no PDF/Excel export — CPP-10 part is backlog).

### T4 · Program attainment report
Route: `/reports/attainment` (hod, admin; add to the reports `TabNav`): choose program, batch and terms → "Compute" (enqueues the program job) → course × outcome matrix of the latest offering values, the program value per outcome and its comparison with `defaultTargetLevel`.

### T5 · AI adapter (CPP-07)
Files: `lib/env.ts` (+ `ANTHROPIC_API_KEY`), `.env.example`, `tests/setup.ts`, `lib/integrations/ai.ts`, `lib/schemas/ai.ts`.
- Use exactly the type-checked call shape in 06 §4.7 (`client.beta.messages.parse`, model `claude-opus-5-5`, `betaZodOutputFormat`, `output_config.effort: 'low'`, `fallbacks: 'default'` with beta `server-side-fallback-2026-07-01`); `stop_reason === 'refusal'` → `null`; SDK errors → log + `null` (the UI says "No suggestion available right now").
- `ItemTagSuggestion = { coCodes: string[] (1–2), bloomLevel: BLOOM_LEVELS, rationale: string ≤ 300 }`; after parsing, drop codes not in the course's COs; none left → `null`.
- `CoMapSuggestion = { cells: { co, outcome, level: 1|2|3, rationale ≤ 200 }[] }`; drop unknown codes and duplicates.
- System prompts (constants in `ai.ts`):
  - Item tags: "You help university teachers tag an assessment question with the course outcomes (COs) it assesses and its Bloom's taxonomy level (remember, understand, apply, analyse, evaluate, create). Choose only from the CO codes provided. Prefer one CO; choose two only when the question clearly assesses both. Base the Bloom level on what the student must do. Give a one-sentence rationale."
  - CO map: "You help define a CO–PO–PSO correlation matrix. For each pair where the course outcome contributes to the program outcome, give a level: 3 strong, 2 moderate, 1 slight. Omit pairs with no meaningful contribution. Use only the codes provided."
- Inputs contain only question text (rendered to plain text from the rich-text JSON), CO codes/statements, outcome codes/titles — never student data (09 §12). Rate limit 30/hour per user.

### T6 · Suggestions in the UI (human applies)
- Item editor (M04 builder): a "Suggest COs (AI)" link → the same edit page with `?suggestFor=<itemId>`; the page calls `suggestItemTags` server-side and renders the item form with the suggested COs checked and Bloom level selected, highlighted "Suggested by AI — review, then Save" with the rationale. Nothing is stored until the teacher saves.
- Admin course page: "Suggest CO–PO–PSO levels (AI)" → `?suggestMap=1` renders `CoPoMatrix` (`edit` mode) pre-filled with suggestions, highlighted, with rationales listed below; the admin edits and saves with the normal `saveCoMap`.

### T7 · Tests
- Unit: T1 vectors.
- Integration: the 07 §4 dataset built as real documents → stored values equal the worked example; changing `cieWeight` to 0.4/`seeWeight` 0.6 changes CO1 to 2.4; an offering with no published assessments → all CO values null with warnings; HoD of another department → 404; the AI adapter mocked: unknown CO codes are dropped, refusal → "No suggestion available", rate limit enforced; the prompt builder output contains no field from `users`.
- E2E: seeded offering with published assessments and end-sem marks → Outcomes tab shows CO and PO values.

## Acceptance criteria

- **AC-M09-01** For the documented dataset the stored CO values are 2.5, 2, 2 and PO1 2.21, PO2 2.08, PO3 2, PSO1 2, PSO3 2.25; unmapped outcomes are blank.
- **AC-M09-02** Importing end-sem marks recomputes attainment for the affected offerings without manual action (EXM-06).
- **AC-M09-03** A CO never assessed in a published assessment is reported as a warning, not as zero.
- **AC-M09-04** AI suggestions never change data until a person saves; no student data is sent to the model.
- **AC-M09-05** Changing thresholds in settings changes the next computation, and the report states the settings used.

## Validation checklist (human)

- [ ] Present the formula and the worked example (07 §4) to the client; record their answer to Q-07.
- [ ] Recompute one real course and compare with the department's existing attainment sheet; explain every difference.
- [ ] Faculty try "Suggest COs" on ten real questions; record how many suggestions they accepted unchanged.
