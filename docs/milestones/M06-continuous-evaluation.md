# M06 · Continuous evaluation

| | |
|---|---|
| Depends on | M04 (M05 for coding modes) |
| Requirements | CE-01, CE-06, CE-07 (computation), CE-08, CE-09, CE-10 (marks view; workflow details blocked on Q-06), REC-04 (records flow into CE), LAB-05 (lab results flow into CE), NFR-04, DSH-02 |
| Release | **R2** |
| Packages added | — |
| Collections | `internalMarks` |
| Components introduced | `Sparkline`, `Meter` |

## Goal

Every graded, published assessment flows automatically into each student's internal marks, computed exactly by the offering's bound evaluation scheme (component weights, aggregation, rounding) and mapped to the internal maximum. Faculty, HoDs and admins see the whole class with each student's rising/dropping trend; students see their own breakdown. The computation is a pure, tested function and recomputation is automatic and idempotent.

## Data-model change (update 05 §5.3 in the same commit)
`internalMarks` also stores `trend` (`rising · dropping · steady · insufficient`), `slope` (N?) and `points` ([N], max 6 — the percentages used for the trend), computed at recompute time so dashboards never compute trends per page view.

## Tasks

### T1 · Model and pure functions
Files: `lib/models/internal-marks.ts`, `lib/domain/internal-marks.ts` (+ test), `lib/domain/trend.ts` (+ test); add the model to `scripts/sync-indexes.ts`.
- `computeInternalMarks(scheme, assessments, countedScores)` — 07 §2, every vector in its tables.
- `computeTrend(points, settings)` — 07 §3, every vector.
- `countedScore` already exists (M04 `lib/domain/attempts.ts`) — reuse it.
- Add the `ceTrend` settings key (06 §7).

### T2 · Recompute (shared by actions and the worker)
File: `lib/data/internal-marks.ts` — `recomputeInternalMarks(offeringId, now)`:
1. Load the offering (`schemeId`, `lockedAt`, `category`); skip skill offerings and locked offerings (return `{ skipped: 'locked' }`).
2. Scheme version via `getSchemeVersion` (cached, 02 §5); `ceTrend` settings.
3. Assessments with `status: results_published` (projection: `_id`, `mode`, `maxMarks`, `attemptPolicy`, `closesAt`).
4. Active enrollments; graded submissions of those assessments (projection: `assessmentId`, `studentId`, `attemptNo`, `total`) — one query.
5. Per student: counted score per assessment (missing → 0), `computeInternalMarks`, trend points ordered by `closesAt`, `computeTrend`.
6. One `bulkWrite` of upserts keyed by `{ offeringId, studentId }`; delete rows of students no longer actively enrolled.

Triggers (enqueue `compute/internalMarks { offeringId }`, job id `ce-<offeringId>-<minuteBucket>`):
- `publishResults` (M04);
- `gradeSubmission` on an assessment whose results are already published (M04);
- `gradeCode` completion when results are already published (M05);
- `changeEnrollments` (M01);
- `rebindScheme` (T5);
- scheduler `internal-marks-nightly` (02 §8) for every active ugc offering.

### T3 · Marks tab (CE-09, DSH-02, CE-10)
Route: `/courses/[offeringId]/marks` (ugc only; add the tab).
- `teach` / `oversee`: `DataTable` of students — roll no, name, one column per scheme component (`marks / weight`), total (`total / internalMax`), a "complete" badge, trend badge and `Sparkline` of `points`; filters: trend (`dropping` first), incomplete; sort by total. Header shows "Computed <time>" and, for `teach`, a "Recompute now" button (`requestRecompute`, rate-limited 1/min per offering).
- `learn`: own component breakdown with a `Meter` per component, the list of contributing published assessments with counted scores, and the own trend `Sparkline`.
- `Sparkline` (server SVG, 08 §5) and `Meter` (server CSS bar) are introduced here; their second call sites are the CE report (T4) and M09/M10.
- CE-10: the client has yet to describe "continuous evaluation in mark entry" (Q-06). This milestone delivers the computed marks view and the grading flows from M04/M05; do not invent an additional mark-entry screen.

### T4 · CE report (DSH-02 for HoD/admin)
Route: `/reports/ce` (`hod`, `admin`), `app/(app)/reports/layout.tsx` with `TabNav` (CE now; Attainment in M09; Engagement in M10).
- Filters: term (default current), department (admin only; HoD fixed to theirs).
- `DataTable` of offerings: title, faculty, students, average internal % (`Meter`), % complete, number of students `dropping`; each row links to the offering's Marks tab.
- One aggregation over `internalMarks` grouped by `offeringId` for the page's offerings (index `{ offeringId, studentId }`).

### T5 · Scheme rebinding (admin)
`rebindScheme` on `/admin/offerings` (row action): only while the offering is not locked; the new version must have the same `componentKey`; audit `offering.scheme_rebound` (before/after version ids); enqueue recompute.

### T6 · Tests
- Unit: 07 §2 and §3 vectors.
- Integration: build the 07 §2 worked example as real documents (scheme, five assessments with published results, submissions, one missed quiz) → `recomputeInternalMarks` stores total 36, complete true; changing the scheme to `{2, half_up}` via rebind → 35.5; a locked offering is skipped; a dropped student's row is removed; a student reading the Marks tab gets only their own row; HoD of another department → 404; `publishResults` enqueues exactly one recompute job per minute bucket.

## Acceptance criteria

- **AC-M06-01** For the 07 §2 example, the stored internal total is exactly 36 (and 35.5 with two-decimal rounding).
- **AC-M06-02** Publishing results or regrading a published submission updates internal marks within a minute without any manual step.
- **AC-M06-03** A student's trend is `dropping` for percentages 80, 70, 60, 50 and `insufficient` with fewer than three published assessments.
- **AC-M06-04** Changing a scheme in admin does not change any existing offering's marks until an admin rebinds that offering (audited).
- **AC-M06-05** HoDs see the CE report for their department only; students never see classmates' marks.

## Validation checklist (human)

- [ ] With the client's real scheme for one subject type, compare the LMS internal marks for 5 students with a hand-made spreadsheet of the same scores.
- [ ] Ask the client to walk through how they want mark entry to work (Q-06) using the Marks tab as the starting point.
- [ ] Faculty can find the students whose performance is dropping in under 10 seconds.
