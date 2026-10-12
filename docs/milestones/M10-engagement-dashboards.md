# M10 · Engagement scoring & dashboards

| | |
|---|---|
| Depends on | M03, M04, M06 (and M09 for the AI adapter) |
| Requirements | ENG-01, ENG-02, ENG-03 (signals already collected), ENG-04 (score shown; alerts backlog), SKL-02, DSH-01, DSH-05 |
| Release | **R4** |
| Packages added | — |
| Collections | — (adds `enrollments.engagement`) |

## Goal

Faculty, HoDs and admins see, for every student, how much they are studying: a deterministic, explainable engagement score built from attendance, video watching, on-time submissions, practice (quiz attempts and code runs) and active days, with a band, a trend and a drill-down into the evidence (ENG-01/02). An AI-written summary explains a student's numbers on request; it never changes them (ADR-16). Skill courses get the traceability dashboard the client asked for (SKL-02, DSH-05).

## Data-model change (update 05 §3.9 in the same commit)
`enrollments.engagement`: `{ score: N?, band: S?, trend: S, signals: { attendance: N?, video: N?, timeliness: N?, practice: N?, activity: N? }, computedAt: D }?` — the latest nightly snapshot, so lists and reports read one document per student.

## Tasks

### T1 · Pure functions
File: `lib/domain/engagement.ts` (+ test): `p90(values)`, `engagementSignals(raw, classP90s)`, `engagementScore(signals, weights)`, `band(score, settings)`, `engagementTrend(current, previous, delta)` — every vector in 07 §7. Add the `engagement` settings key (06 §7).

### T2 · Computing (shared by the job and the drill-down)
File: `lib/data/engagement.ts` — `computeOfferingEngagement(offeringId, now)` returns per-student signals for the current and previous windows using five index-backed queries for the offering:
1. `engagementDaily` in both windows grouped by student (sums of counters, count of active days) — index `{ offeringId, day }`.
2. Finalized live sessions in the windows and the matching `attendance` rows.
3. Published video lessons (durations) and `lessonProgress` (`watchedSec`) — all time.
4. Assessments whose `closesAt` fell in each window and the students' earliest submission time per assessment.
5. Active enrollments.
Class P90s are computed over active enrollments (zeros included). Returns `{ studentId, current: { signals, score, band }, previous: { score } , trend }[]`.

### T3 · Nightly snapshot
Worker scheduler `engagement-nightly` (`30 2 * * *` IST) → `compute/engagementSnapshot { offeringId }` for every active offering (job id `eng-<offeringId>-<day>`): `computeOfferingEngagement` → one `bulkWrite` setting `enrollments.engagement`. A "Recompute" button on the People tab enqueues the same job (teach, 1/min).

### T4 · People tab: engagement columns (ENG-02 list, DSH-01)
For `teach`/`oversee`: score, band badge, trend arrow, the five signal values as small `Meter`s, last activity; filters: band, trend; sort by score. For skill offerings the existing traceability columns (lessons completed, watched minutes, quizzes attempted, time-based attendance %) stay alongside (DSH-05). "Computed <time>".

### T5 · Student drill-down (ENG-02)
Route: `/courses/[offeringId]/people/[studentId]` (teach/oversee):
- Live computation for this student (T2 for one student, reusing the class P90s from the snapshot to avoid recomputing the class).
- Sections: signals with the raw numbers behind each (e.g. "6 of 8 classes attended"), daily activity over the window (`Sparkline` of active minutes = (videoSec + liveSec) / 60 per day), attendance list, assessment timeline (% per published assessment with the M06 trend), video progress per lesson, project metrics when the course has a project, and internal marks summary.
- "Explain with AI": a link to `?explain=1`; the page calls `explainEngagement` (06 §4.7) with **only** the numbers and labels (no name, roll number or email) and shows the text in a box labelled "AI-generated summary — based only on the numbers above". System prompt: "Explain to a university teacher, in at most 120 words and plain language, what these engagement numbers suggest and which one or two signals most need attention. Do not speculate about causes outside the data. Do not judge the student." Refusal or error → "No summary available right now." Rate limit 30/hour per user.

### T6 · Department and skill reports (DSH-01, DSH-05)
Route: `/reports/engagement` (hod, admin; add to the reports `TabNav`): term + category filters (ugc / skill); offerings with average score, counts per band, number `falling`; skill filter adds average lesson completion, average quizzes attempted and average time-based attendance. One aggregation over `enrollments` (`{ offeringId, status }` index) for the page's offerings.

### T7 · Home
Faculty: per active offering, the number of students in the `low` band, linking to the People tab filtered by band. HoD: their department's offerings with the most `low`-band students (top 5).

### T8 · Tests
- Unit: 07 §7 vectors including the 69.5 → 70 boundary and the "no live sessions" redistribution.
- Integration: a seeded offering with known counters, attendance, progress and submissions produces the expected signals and score for two students; snapshot written once per day per offering; a student cannot open any drill-down (404); the AI prompt contains only numeric metrics and labels (assert on the built prompt); HoD of another department → 404.
- E2E: faculty opens People, filters `low`, opens a drill-down.

## Acceptance criteria

- **AC-M10-01** Each student's score is reproducible from the numbers shown in their drill-down using 07 §7.
- **AC-M10-02** Students in the `low` band can be listed for any offering in one click; HoDs can see this across their department.
- **AC-M10-03** The AI summary is labelled, uses no personal data, and never alters scores.
- **AC-M10-04** Skill-course faculty see engagement, quizzes attempted and time-based attendance per learner (SKL-02, DSH-05).
- **AC-M10-05** Lists and reports for a 400-student offering load in < 1 s (they read the nightly snapshot).

## Validation checklist (human)

- [ ] Review the score with two faculty members on a real class: do the "low" students match their judgement? Record disagreements.
- [ ] Confirm with the client what "AI" must mean for engagement (Q-26) and whether students should see their own score (Q-29).
