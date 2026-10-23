# M06 · Continuous evaluation

| | |
|---|---|
| Depends on | M04, M04b (the coding modes, from M05), M05 (closed 23 Oct 2026) |
| Requirements | CE-01, CE-06, CE-07 (computation), CE-08, CE-09, CE-10 (marks view and the policy's rubric entry; further workflow blocked on Q-06), REC-04 (records flow into CE), LAB-05 (lab results flow into CE), NFR-04, DSH-02 |
| Release | **R2** |
| Packages added | — (shadcn `chart`, `progress` and `recharts` are already vendored) |
| Collections | `internalMarks`, `rubricMarks`; `assessments.countsToward` |
| Components introduced | `TrendChart` (a client boundary in the 08 §5.2 inventory) |

## Goal

Every published result of a credit course flows by itself into each student's internal marks, computed by CUTM's Examination Policy as the offering copied it (07 §2): theory internal out of 40 (Mid-term I 15, Mid-term II 15, assignment 5, attendance 5), practice and project internal out of 50 each, by the policy's rubrics. Teachers, heads of department and admins see the whole class with each student's rising or dropping trend. Students see their own breakdown. The computation is pure and tested, and recomputing is automatic and idempotent.

## Decisions (Aniket, 23 Oct 2026 — Q-41 answered)

1. **Theory parts.** Each assessment of a credit course with theory credits picks what it counts toward: Mid-term I · Mid-term II · Assignment · Not counted (`assessments.countsToward`). A presentation for Mid-term II is an assignment with a rubric. Marks flow in when results are published (A-20).
2. **Several assessments in one part** count by the average of their percentages, each equally: `partMax × mean(counted / maxMarks)`. A missed one counts 0 (A-14).
3. **Practice and project internals** come from the policy's rubrics, which the teacher fills per student on the Marks tab (`rubricMarks`): practice concept 5, planning and execution 10, result 10, record 10, conduct 5, viva 10; project relevance 5, literature 5, methodology 10, analysis 10, interpretation 10, report 10. Saved, audited, frozen by the lock.
4. **External marks** (theory end-semester 60, practice examiner 50, project external 50) come from the exam section's CSV with the end-semester marks in M08. Teachers never type them.

These replace M01b's note on this file. There are no evaluation schemes: `rebindScheme` is now **Refresh the evaluation policy** (admin, while unlocked, audited `offering.evaluation_refreshed`), which copies today's Settings onto one offering.

Carried over from M04b: the recompute job is debounced on one id per offering (`ce-<offeringId>`, as `queueTestStats` does), not one per minute, because a minute bucket left M04b's ranks stale after a quick regrade.

## Mock-ups (T0)

Drawn inside the real app (a build on port 3101 with the e2e data, faculty1, student01, the HoD and admin), at 1440 px and 390 px. Two variants where there is a real choice; Aniket's picks are recorded here before T3.

| # | Screen | Variants |
|---|---|---|
| M1 | The teacher's Marks tab | A · a part-by-part table · B · a component table whose rows open to their parts |
| M2 | Rubric entry | A · a ten-row grid with "Save this page" · B · a dialog per student |
| M3 | The student's own marks | one |
| M4 | "Counts toward" in the New assessment dialog and the builder's settings | one |
| M5 | The CE report | one |

**Picks (Aniket, 23 Oct 2026):**
- M1 **A** · part by part: a column per theory part, then the components' internals and the trend.
- M2 **A** · the ten-row grid with "Save this page".
- M3–M5 as shown.
- The tab row (found while drawing: a teacher's tabs are 1212 px in a 1104 px row at 1440 px, so People is out of view, and Marks adds one) **scrolls to show the current tab, with a fade at an edge that has more tabs**. `TabNav` keeps one row and its icons.
- The mock-ups' own faults are not to be copied: tiles without their icons, buttons and inputs on the page grey instead of white, the attendance line cut off, and headings wrapping under the buttons. The screens use the app's components (`Section`, `DataTable`, the hand-ins tiles).

## Tasks

### T1 · Foundation: models, rules, settings
Files: `lib/models/internal-mark.ts`, `lib/models/rubric-mark.ts` (05 §5.3, §5.3a), `lib/models/assessment.ts` (+ `countsToward`), `lib/schemas/assessment.ts` (+ `COUNTS_TOWARD`, the field on `CreateAssessment` and `UpdateAssessmentSettings`), `lib/domain/evaluation.ts` (+ test), `lib/domain/trend.ts` (+ test), `lib/schemas/settings.ts` (+ `ceTrend`, 06 §7), `lib/schemas/jobs.ts` (+ `InternalMarksJob`), `scripts/sync-indexes.ts`.
- `partMarks`, `addedUp`, `computeInternalMarks` — 07 §2, every vector and the worked example as `it.each`. The shared lists (`THEORY_PARTS`, `RUBRIC_COMPONENTS`, `TRENDS`) and the actions' inputs are in `lib/schemas/marks.ts`. Reuse `attendancePoints`, `attendancePct` (07 §10) and `countedScore` (07 §14).
- `computeTrend(points, settings)` — 07 §3, every vector.

### T2 · Recompute (shared by actions and the worker)
`lib/data/internal-marks.ts` (worker-safe: nothing from `next/*`) — `recomputeInternalMarks(offeringId, now)`:
1. Load the offering (`category`, `credits`, `evaluation`, `lockedAt`); return `{ skipped }` for a skill or locked offering. An offering made before it had an evaluation copy uses today's settings (as `listRoster` does).
2. Published-results assessments of the offering (≤ 200, index `{ offeringId, status, closesAt }`): `_id`, `maxMarks`, `attemptPolicy`, `countsToward`, `closesAt`.
3. Active enrolments (≤ 1,000); graded attempts of those assessments (index `{ assessmentId, status, submittedAt }`), grouped per assessment and student for `countedScore`; finalized attendance per student (the `listRoster` aggregate); the offering's `rubricMarks`.
4. Per student: the parts, components, `complete`, `internalPct`, and the trend over every published assessment by `closesAt` (counted or not).
5. One `bulkWrite` of upserts on `{ offeringId, studentId }`; delete rows of students no longer active.

`queueInternalMarks(offeringId)` in `lib/queue.ts`, the `queueTestStats` pattern; the `internalMarks` and `internalMarksNightly` cases in `worker/jobs/compute.ts`; the nightly scheduler in `worker/index.ts` (02 §8).

Triggers (each only for an assessment with an offering):
- `releaseResults` (by hand and by the sweep);
- after results are published: `gradeSubmission`, `waivePenalty` (waiving and putting back), and the `gradeCode` job;
- `finalizeLiveSession` and `markAttendance` (the attendance part);
- `changeEnrollments`, `addStudent`, `setEnrollmentStatus`;
- a change of "Counts toward", `saveRubricMarks`, `refreshEvaluation`;
- the nightly scheduler.

Move `requireUnlocked` from the assessments actions to `lib/data/offerings.ts` as `assertUnlocked` (the name M08 T2 uses); its callers are the assessments actions and the new marks actions.

### T3 · Actions
- "Counts toward" is a field of `createAssessment` and `updateAssessmentSettings` (it stays editable after students start, outside the fields that freeze): only on a credit offering with theory credits, refused while locked, audited `assessment.counts_toward` when it changes, and it queues the recompute.
- `saveRubricMarks` (`app/(app)/courses/[offeringId]/marks/actions.ts`; teach; unlocked; a component the offering has; a page of students, each criterion blank or 0 to its maximum in steps of 0.01): one `rubricMarks` upsert and one `marks.rubric_saved` audit entry per student whose criteria changed; queues the recompute.
- `requestRecompute` (teach; limit 1 a minute per offering): queues the recompute.
- `refreshEvaluation` (`app/(app)/admin/offerings/actions.ts`; admin; credit offering; unlocked): copies the `evaluation` settings onto the offering, audited `offering.evaluation_refreshed` with before and after; queues the recompute.

### T4 · Screens (to the picked mock-ups)
- **Marks tab**, `/courses/[offeringId]/marks` (credit offerings; 08 §3 already lists it):
  - teach and oversee: tiles (students, complete, dropping, average internal %); "What counts" — each theory part's assessments, and a warning for a part that has none; the student list (ten a page, A-79; search; filters dropping and incomplete) with each part, each component's internal, the trend badge and a `TrendChart` sparkline; "Worked out <time>" and, for teachers, "Work them out again".
  - practice and project rubric entry (teach edits; oversee reads), in the picked form, with each student's lab-record average beside Record (REC-04, for reference only).
  - learn: their own parts with `Progress` bars, the assessments that count with their counted marks, their own rubric marks and trend.
- **`TrendChart`** (`components/trend-chart.tsx`, client): the shadcn chart, with a sentence for screen readers.
- **"Counts toward"** in the New assessment dialog and the builder's settings card, on a credit course with theory credits.
- **CE report** `/reports/ce` (HoD, admin) and a Reports entry in the sidebar: term (the active term by default), department (admins; a HoD sees their own); offerings ten a page with students, average internal %, % complete and the number dropping, each linking to its Marks tab. One `$group` over `internalMarks` for the page's offerings. No `TabNav` until M09 adds a second report.
- **Admin offerings:** the row action "Refresh the evaluation policy", which asks first.
- CE-10: the client has yet to describe "continuous evaluation in mark entry" (Q-06). The rubric entry is the policy's (Q-41); do not invent more.

### T5 · Tests
- Unit: 07 §2 and §3 vectors; the `ceTrend` schema; `countsToward` on the assessment schemas.
- Integration (`tests/integration/internal-marks.test.ts`): the worked example as real documents gives 28.53, 40.5 and 76.7; a missed assessment counts 0; a not-counted assessment changes only the trend; the attendance part from finalized classes; rubric saves audited, refused for a student, a HoD and a locked offering; a locked offering is skipped; a dropped student's row is removed; a Settings change alters nothing until an admin refreshes the offering; a student reads only their own row; a HoD of another department gets 404; a standalone test never counts; a release queues one job, and a regrade seconds later is not lost.
- E2E (`tests/e2e/marks.spec.ts`): faculty sets a quiz to count toward Mid-term I; a student takes it; results published; after the job the Marks tab shows the part; faculty fills the practice rubric; the student sees their own breakdown; the HoD sees the CE report.

## Acceptance criteria

- **AC-M06-01** For the 07 §2 worked example, the stored theory internal is 28.53 (28.5333…), the practice internal 40.5, and the internal percentage 76.7.
- **AC-M06-02** Publishing results, regrading a published hand-in, finalizing a class or saving a rubric updates the internal marks within a minute with no manual step.
- **AC-M06-03** A student's trend is `dropping` for percentages 80, 70, 60, 50 and `insufficient` with fewer than three published assessments.
- **AC-M06-04** Changing the evaluation policy in Settings changes no offering's marks until an admin refreshes that offering (audited).
- **AC-M06-05** A HoD sees the CE report for their department only; students never see classmates' marks.
- **AC-M06-06** "Counts toward" and rubric marks cannot change while an offering is locked, and every change is audited.

## Validation checklist (human)

- [ ] With the client's marks for one real subject, compare the LMS internal marks of five students with a hand-made spreadsheet of the same scores.
- [ ] Ask the client to walk through how they want mark entry to work (Q-06), starting from the Marks tab.
- [ ] A teacher finds the students whose performance is dropping in under 10 seconds.
- [ ] Confirm with the client that Mid-term II as an assignment with a rubric fits how presentations are marked.
