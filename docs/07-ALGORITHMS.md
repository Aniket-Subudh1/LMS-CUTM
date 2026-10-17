# 07 · Algorithms

Every number a student, teacher or auditor sees is produced by a function specified here. Each lives in `lib/domain/` as a pure function (no I/O, no clock, no randomness — `now` is a parameter) and each **test vector table below must appear verbatim as an `it.each` test**. All worked examples were computed by script, not by hand.

Where a threshold or weight is configurable it is read from settings (06 §7) by the caller and passed in. The defaults are proposals awaiting client confirmation; the formulas are not.

## 1. Rounding — `lib/domain/round.ts`

- `roundHalfUp(x, d)`: half away from zero at `d` decimals, robust to binary floating-point noise (code in 04 §6.10).
- `ceilTo(x, d)`: `Math.ceil(Number((x * 10**d).toPrecision(15))) / 10**d`.
- **Where rounding happens:** item marks entered by hand → 2 dp on input. Attempt totals → 2 dp. Component marks (theory, practice, project, each out of 100) → kept unrounded internally, displayed at 2 dp. The **course percentage rounds up once**, with `ceilTo(x, 0)` (Examination Policy, §2; ceiling or nearest is Q-39). Other percentages → 2 dp. Attainment values → 2 dp. Engagement score → integer. Never round twice.

| x | d | roundHalfUp | ceilTo |
|---|---|---|---|
| 1.005 | 2 | 1.01 | 1.01 |
| 2.675 | 2 | 2.68 | 2.68 |
| 37.5 | 0 | 38 | 38 |
| 37.4999 | 0 | 37 | 38 |
| 37.01 | 0 | 37 | 38 |
| 0.1 + 0.2 | 2 | 0.3 | 0.3 |
| 14.999999999999998 | 2 | 15 | 15 |
| −1.005 | 2 | −1.01 | — |

## 2. Evaluation policy — `lib/domain/evaluation.ts`

Since M01b the marking follows CUTM's Examination Policy (2020), held as the settings key `evaluation` (06 §7) and copied onto each offering when it is created (05 §3.7). Every **component** a course has (credits above 0) is marked **out of 100**:

| Component | Internal | External | Parts (policy defaults) |
|---|---|---|---|
| Theory | 40 | 60 (end-semester, offline) | Mid-term I 15 · Mid-term II 15 · assignment 5 · attendance 5 |
| Practice | 50 | 50 (external examiner) | rubric: concept 5 · planning and execution 10 · result and interpretation 10 · record 10 · conduct 5 · viva 10 (the external examiner uses the same rubric) |
| Project | 50 | 50 | internal rubric: relevance 5 · literature 5 · methodology 10 · analysis and results 10 · interpretation 10 · report 10; external: relevance 10 · report 20 · defence 20 |

How assessments feed these parts (which mid-term is which assessment, who enters the external marks) is **Q-41**; M06 computes the internal parts only after it is answered.

**`coursePercentage(credits, marks)`** — the credit-weighted average of the component marks, rounded up once:

`ceilTo((Wt·T + Wp·P + Wpr·Pj) / (Wt + Wp + Wpr), 0)`, over components with credits > 0. A missing mark for a weighted component → `null`; a 0-0-0 course → `null` (it has no marks).

| Credits | Marks | Raw | Result |
|---|---|---|---|
| **1-2-2 (DECT0901, the policy's example)** | T 87, P 89, Pj 92 | 89.8 | **90** |
| 3-0-1 | T 72.5, Pj 80 | 74.375 | 75 |
| 1.5-0-1.5 | T 60, Pj 61 | 60.5 | 61 |
| 2-0-0 | T 90 | 90 | 90 |
| 3-1-0 | T 89.2, P 89.2 | 89.2 | 90 |
| 3-0-1 | T 80, Pj missing | — | null |
| 0-0-0 | — | — | null |

**`attendancePoints(pct, bands)`** — the theory attendance part from the attendance percentage; bands are `{ minPct, marks }` from the highest down, and below the last band it is 0. Default bands 90 → 5, 85 → 4, 80 → 3, 75 → 2:

| Attendance % | 100 | 90 | 89.99 | 85 | 84.99 | 80 | 79.99 | 75 | 74.99 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|
| Marks | 5 | 5 | 4 | 4 | 3 | 3 | 2 | 2 | 0 | 0 |

The policy's 75 % minimum is stored only (Q-42).

## 3. Performance trend (CE-09) — `lib/domain/trend.ts`

`computeTrend(points, settings) → { trend: 'rising' | 'dropping' | 'steady' | 'insufficient', slope: number | null }`

1. `points`: one value per `results_published` assessment of the offering, `y = 100 × counted / maxMarks`, ordered by `closesAt` ascending (ties by id).
2. Keep the last `window` (default 6). `n` = count. If `n < minPoints` (default 3) → `insufficient`.
3. Least-squares slope with `x = 0 … n−1`: `slope = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)²`.
4. `slope ≥ slopeThreshold` (default 2) → `rising`; `≤ −slopeThreshold` → `dropping`; else `steady`. Report `slope` at 2 dp.

| y (oldest → newest) | slope | trend |
|---|---|---|
| 50, 60, 70 | 10 | rising |
| 80, 70, 60, 50 | −10 | dropping |
| 70, 72, 69, 71 | 0 | steady |
| 60, 62, 61, 65, 63, 64 | 0.77 | steady |
| 10, 20, 30, 40, 50, 60, 70 (window 6 keeps 20…70) | 10 | rising |
| 90, 40 | null | insufficient |

## 4. CO attainment for an offering (CPP-08) — `lib/domain/attainment.ts`

Settings (06 §7): `targetPct` T (60), level thresholds `level3Pct` (70), `level2Pct` (60), `level1Pct` (50), weights `cieWeight` (0.5) and `seeWeight` (0.5), `defaultTargetLevel` (2).

`level(p) = p ≥ level3Pct ? 3 : p ≥ level2Pct ? 2 : p ≥ level1Pct ? 1 : 0`

**CIE (internal) per CO `k`**
1. `I_k` = items tagged with `k` in the offering's `results_published` assessments.
2. If `I_k` is empty → CIE for `k` is `null` and a warning "COk was not assessed in any published assessment" is recorded.
3. For each active enrolled student: `num = Σ` counted item marks on `I_k` (the counted attempt of §14; missing → 0), `den = Σ maxMarks` of `I_k`. The student **attains** `k` if `100 × num / den ≥ T`.
4. An item tagged with several COs counts in full toward each (assumption A-07).
5. `pct = 100 × attained / students`; `cieLevel = level(pct)`.

**SEE (end-semester) — one value for the course**
- End-sem marks are per course, not per CO, so the SEE level applies to every CO (assumption A-08).
- Students considered = those with an `endSemMarks` row; `absent` counts as not attained. Students without a row are excluded and counted in a warning.
- A student attains if `100 × marks / maxMarks ≥ T`. `seeLevel = level(100 × attained / considered)`. No rows at all → SEE `null`.

**CO value**
- Both present → `roundHalfUp(cieWeight × cieLevel + seeWeight × seeLevel, 2)`.
- SEE null → `cieLevel` (warning "CIE only").
- CIE null → `null`.
- `target = co.targetLevel ?? defaultTargetLevel`; `met = value ≥ target` (null value → `met` null).

**PO / PSO value (course level)**
For outcome `j`: the cells of `coMap` with `outcome = j` whose CO value is not null. None → `null`. Otherwise `roundHalfUp(Σ value_k × level_kj / Σ level_kj, 2)`.

**Worked example** — "C Programming", 10 students, defaults above.
Items: quiz q1 (CO1, 5), q2 (CO2, 5); assignment a1 (CO2, 10), a2 (CO3, 10). End-sem max 50.

| Student | q1 | q2 | a1 | a2 | End-sem |
|---|---|---|---|---|---|
| s1 | 5 | 4 | 9 | 8 | 40 |
| s2 | 4 | 3 | 7 | 6 | 32 |
| s3 | 3 | 2 | 5 | 5 | 25 |
| s4 | 5 | 5 | 10 | 9 | 45 |
| s5 | 2 | 1 | 4 | 3 | absent |
| s6 | 4 | 4 | 8 | 7 | 30 |
| s7 | 3 | 3 | 6 | 4 | 29 |
| s8 | 5 | 2 | 6 | 6 | 35 |
| s9 | 1 | 3 | 5 | 8 | 31 |
| s10 | 4 | 5 | 9 | 2 | 20 |

| CO | Attained | pct | CIE level | SEE level | value |
|---|---|---|---|---|---|
| CO1 (q1) | 8/10 | 80 | 3 | 2 | **2.5** |
| CO2 (q2 + a1, max 15) | 6/10 | 60 | 2 | 2 | **2** |
| CO3 (a2) | 6/10 | 60 | 2 | 2 | **2** |
| SEE (≥ 30/50) | 6/10 | 60 | — | 2 | — |

CO→outcome map: CO1–PO1 3, CO1–PO2 1, CO1–PSO3 3, CO2–PO1 2, CO2–PO2 2, CO2–PO3 1, CO2–PSO3 3, CO3–PO1 2, CO3–PO2 3, CO3–PO3 2, CO3–PSO1 1.

| Outcome | Computation | value |
|---|---|---|
| PO1 | (2.5×3 + 2×2 + 2×2) / 7 | **2.21** |
| PO2 | (2.5×1 + 2×2 + 2×3) / 6 | **2.08** |
| PO3 | (2×1 + 2×2) / 3 | **2** |
| PO4 … PO12 | no mapping | **null** |
| PSO1 | (2×1) / 1 | **2** |
| PSO2 | no mapping | **null** |
| PSO3 | (2.5×3 + 2×3) / 6 | **2.25** |

Extra vectors: same data without end-sem rows → CO1 3, CO2 2, CO3 2 (all "CIE only"). A student exactly at T (s3 on CO1: 3/5 = 60 %) attains. s6 end-sem 30/50 = 60 % attains; s7 29/50 = 58 % does not.

## 5. Program-level attainment (CPP-09) — same file

For program P, batch B and a set of terms: take the latest offering-scope attainment of every offering of B in those terms. For each outcome `j`: `roundHalfUp(mean of the non-null course values for j, 2)`; `null` if none. The report also shows the course × outcome matrix and each value against `defaultTargetLevel`.

## 6. Grade sheet (EXM-05) — `lib/domain/grades.ts`

For each **credit** offering of the student in the term (non-credit offerings have no grade):
- Each component the offering's credits snapshot has (credits > 0) gets its mark out of 100: theory = locked internal (out of 40) + end-semester (out of 60); practice and project = internal (out of 50) + external (out of 50). An absent end-semester counts 0 and the grade is `absentGrade`.
- `pct = coursePercentage(credits, marks)` (§2: credit-weighted, rounded up once).
- Grade = the first scale entry (sorted by `minPct` descending) with `pct ≥ minPct`. End-sem absent → "Ab", grade point 0.
- `SGPA = roundHalfUp(Σ credits × gradePoint / Σ credits, 2)` over rows with credits > 0; `null` if no credits or `showSgpa` is false.

Default scale (06 §7): O ≥ 90 (10) · A+ ≥ 80 (9) · A ≥ 70 (8) · B+ ≥ 60 (7) · B ≥ 50 (6) · C ≥ 45 (5) · P ≥ 40 (4) · F (0). Only O ≥ 90 is confirmed by the policy; the rest is Q-40.

| Course | T-P-Pj | Credits | Marks | pct | Grade | GP |
|---|---|---|---|---|---|---|
| DECT0901 | 1-2-2 | 5 | T 87, P 89, Pj 92 | 89.8 → 90 | O | 10 |
| CUTM1535 | 3-0-1 | 4 | T 74, Pj 80 | 75.5 → 76 | A | 8 |
| CUTM1014 | 1.5-0-1.5 | 3 | T 60, Pj 61 | 60.5 → 61 | B+ | 7 |
| **SGPA** | | | | | | **103 / 12 = 8.58** |

(Computed with `coursePercentage` by script, 15 Oct 2026.)

Boundary vectors: pct 90 → O; 89 → A+; 39 → F; end-sem absent → Ab, GP 0, counted in the SGPA denominator.

## 7. Engagement score (ENG-01/02) — `lib/domain/engagement.ts`

Window: the last `windowDays` (28) IST days ending today. For one student in one offering, each signal is a value in [0, 1] or `null` (not applicable):

| Signal | Value | `null` when |
|---|---|---|
| `attendance` | present / finalized live sessions in the window | no finalized sessions in the window |
| `video` | Σ min(watchedSec, durationSec) / Σ durationSec over **all** published video lessons | no published video lessons |
| `timeliness` | assessments submitted on or before `closesAt` / assessments whose `closesAt` fell in the window (and is ≤ now) | none closed in the window |
| `practice` | min(1, count / P90) where count = Σ(`quizAttempts` + `codeRuns`) in the window and P90 is over all active students of the offering | P90 = 0 |
| `activity` | min(1, activeDays / P90) where activeDays = days in the window with any non-zero counter | P90 = 0 |

- **P90** is nearest-rank: sort ascending, take index `ceil(0.9 × n) − 1`. P90 of [0,0,1,2,3,4,5,6,8,10] = 8; of [3] = 3; of [0,0,0,5] = 5.
- **Score** = `roundHalfUp(100 × Σ w_k v_k / Σ w_k, 0)` over non-null signals (weights 30/20/25/15/10); all null → `null`.
- **Band**: ≥ 70 `high`; ≥ 40 `medium`; else `low`.
- **Trend**: the same score for the previous window; both present → Δ ≥ 10 `rising`, ≤ −10 `falling`, else `steady`; otherwise `new`.

| Case | Signals | Score | Band |
|---|---|---|---|
| All signals | attendance 0.75, video 0.6, timeliness 0.75, practice 12/16, activity 10/20 | 69.5 → **70** | high |
| No live sessions | attendance null, rest as above (weights sum 70) | 67.14 → **67** | medium |
| Nothing applicable | all null | null | — |

The AI explanation (M10) receives only these numbers and labels; it never changes them (ADR-16).

## 8. Watched ranges (video progress) — `lib/domain/ranges.ts`

`mergeRanges(existing, incoming, durationSec) → { ranges, watchedSec, progressPct }`

1. Round every bound with `Math.round`; clamp to `[0, durationSec]`; drop ranges with `end − start ≤ 0`.
2. Sort by start; merge when `next.start ≤ current.end + 1` (adjacent within 1 s).
3. `watchedSec = Σ (end − start)`; `progressPct = roundHalfUp(min(100, 100 × watchedSec / durationSec), 2)`.
4. `completedAt` is set once, the first time `progressPct ≥ lessons.completePct` (90).

| Existing | Incoming | Duration | Ranges | Watched | % |
|---|---|---|---|---|---|
| — | [0,30] | 100 | [0,30] | 30 | 30 |
| [0,30] | [30,60] | 100 | [0,60] | 60 | 60 |
| [0,30] | [31,40] | 100 | [0,40] | 40 | 40 |
| [0,30] | [50,70], [10,20] | 100 | [0,30], [50,70] | 50 | 50 |
| — | [90,130] | 100 | [90,100] | 10 | 10 |
| — | [40,40] | 100 | — | 0 | 0 |
| — | [60,80], [70,90], [0,10] | 100 | [0,10], [60,90] | 40 | 40 |

**Skill-course attendance (SKL-04):** `attendancePct(lessons with completedAt, published lessons)` (`lib/domain/attendance.ts`, §10): 2 dp; no published lessons → null.

## 9. Beacon anti-inflation — `lib/domain/ranges.ts`

- **Video:** `newSec = watchedAfter − watchedBefore`. Allowed `= 2 × (now − lastBeaconAt) / 1000 + 30` (playback up to 2×, 30 s slack); first beacon (no `lastBeaconAt`) allows 120. If `newSec > allowed` the beacon is ignored (204, logged at `warn`). Otherwise store the merged ranges, set `lastBeaconAt = now`, and `$inc engagementDaily.videoSec` by `newSec` (only new unique seconds — re-watching never inflates).
- **Live focus** (`acceptFocusBeacon`, M03): accepted only while the session is `live` and the student has an open presence interval; `focusedSec ≤ min(120, (now − lastFocusAt) / 1000 + 5)`, first beacon ≤ 120; `$inc` `attendance.focusedSec` and `engagementDaily.focusedSec`.

Video:

| lastBeaconAt | now | newSec | accepted |
|---|---|---|---|
| none | — | 120 | yes |
| none | — | 121 | no |
| 10:00:00 | 10:00:30 | 90 | yes (allowed 90) |
| 10:00:00 | 10:00:30 | 91 | no |

Live focus:

| lastFocusAt | now | focusedSec | accepted |
|---|---|---|---|
| none | — | 120 | yes |
| none | — | 121 | no |
| 10:00:00 | 10:01:00 | 65 | yes (allowed 65) |
| 10:00:00 | 10:01:00 | 66 | no |
| 10:00:00 | 10:05:00 | 120 | yes (capped at 120) |
| 10:00:00 | 10:05:00 | 121 | no |

## 10. Derived live attendance (ATT-03, LIV-04) — `lib/domain/attendance.ts`

`deriveAttendance(presence, startedAt, endedAt, thresholdPct) → { presenceSec, status }`

1. Close open intervals at `endedAt`; intersect each with `[startedAt, endedAt]`; take the **union** (overlaps count once).
2. `presenceSec` = union length in whole seconds; `status = presenceSec ≥ thresholdPct / 100 × (endedAt − startedAt) ? 'present' : 'absent'`. A session of no length (`endedAt ≤ startedAt`) marks everyone absent.
3. Finalization writes a row for every active enrolled student (no presence → absent). Rows with `source = manual` are never overwritten; in a `manual`-mode session only rows without a status get one (unmarked → absent).
4. A session that never started (`startedAt` null) produces no rows.

`attendancePct(attended, held)` → `roundHalfUp(100 × attended / held, 2)`, null when `held` is 0; the same function gives skill-course attendance (§8).

`shortOfAttendance(attended, held, minPct)` (M03b, the People tab's "below the minimum") → `held > 0 and 100 × attended < minPct × held`, in whole numbers so no rounding decides it. `minPct` is the offering's evaluation policy `attendanceMinPct` (75 by default). Vectors at 75: 3 of 4 → not short; 2 of 4 → short; 5 of 7 → short; 6 of 8 → not short; 0 of 0 → not short.

Session 10:00–11:00 (3600 s), threshold 75 % (2700 s):

| Presence | presenceSec | Status |
|---|---|---|
| 09:55–10:50 | 3000 | present |
| 10:00–10:20, 10:30–11:10 | 3000 | present |
| 10:10–10:40, 10:20–10:50 | 2400 | absent |
| 10:15–(open) | 2700 | present (exactly at threshold) |
| none | 0 | absent |
| 10:00–(open), session 10:00–10:00 | 0 | absent (no length) |

## 11. Time helpers — `lib/domain/time.ts`

- `parseIstLocal('YYYY-MM-DDTHH:mm')` → the UTC `Date` for that IST wall time.
- `istDayKey(date)` → `YYYY-MM-DD` of the IST calendar day.

| Input | Output |
|---|---|
| parseIstLocal('2026-10-12T10:30') | 2026-10-12T05:00:00.000Z |
| parseIstLocal('2026-10-13T00:15') | 2026-10-12T18:45:00.000Z |
| istDayKey(2026-10-12T18:29:59Z) | 2026-10-12 |
| istDayKey(2026-10-12T18:30:00Z) | 2026-10-13 |
| istDayKey(2026-03-31T18:30:00Z) | 2026-04-01 |

- `classDates(startDay, weekdays, count)` → `count` IST day keys from `startDay` on the given weekdays (0 = Sunday … 6 = Saturday); a start on a non-class day moves to the next class day; an empty or invalid weekday list throws `RangeError`. Used by "Start from the course's session plan" (M01b).

| Input | Output |
|---|---|
| 2026-07-06, [Mon, Wed, Fri], 5 | 07-06, 07-08, 07-10, 07-13, 07-15 |
| 2026-07-07 (a Tuesday), [Mon, Wed, Fri], 2 | 07-08, 07-10 |
| [] | RangeError |

- `istWeekStart(day)` → the Monday of the IST week holding the day key (M03b: the course plan groups sessions by week). 2026-10-19 → 2026-10-19; 2026-10-21 → 2026-10-19; 2026-10-25 (Sunday) → 2026-10-19; 2026-11-01 → 2026-10-26; 2027-01-01 → 2026-12-28.

## 12. Commit metrics (PRJ-03/04) — `lib/domain/commits.ts`

Inputs: the project's commits (merge commits — more than one parent — excluded), members, `startsOn`, `dueOn`, `now`, `projects` settings.

- `totalWeeks = max(1, ceil((min(now, dueOn) − startsOn) / 7 days))`; week index of a commit = `floor((committedAt − startsOn) / 7 days)`.
- Per member `m` (commits attributed by linked GitHub id, then login):
  - `commits`, `lines = Σ(additions + deletions)`, `hugeCommits` (> `hugeCommitLines`)
  - `regularity = distinct active weeks / totalWeeks`
  - `lastMinuteShare` = commits in `[dueOn − lastMinuteHours, dueOn]` / commits (0 if none)
  - `messageQuality` = share of commits whose first line, trimmed and lower-cased, is ≥ 10 characters and is not one of `messageStopWords`
  - `share = lines / team lines` (0 if team lines are 0); `balance = min(1, share × teamSize)`; `volume = min(1, commits / totalWeeks)`
- **Suggested score** = `roundHalfUp(100 × (0.35 regularity + 0.20 messageQuality + 0.15 (1 − lastMinuteShare) + 0.20 balance + 0.10 volume), 0)`; 0 commits → 0.
- The suggestion is shown to faculty while grading the project review; faculty enter the mark (risk mitigation: transparent metrics + override).

| Member | Inputs (totalWeeks 8, team of 2, team lines 800) | Score |
|---|---|---|
| A | 10 commits, 7 active weeks, 2 last-minute, 8 good messages, 600 lines | 88.625 → **89** |
| B | 3 commits, 2 active weeks, 2 last-minute, 1 good message, 200 lines | 34.17 → **34** |

Message vectors: "update" → bad · "fixed bug" (9 chars) → bad · "Add login form validation" → good · "updated readme file" → good.

## 13. Tracker metrics (PRJ-07) — `lib/domain/tracker.ts`

Per assignee: `assigned`; `done`; `doneOnTime` (`doneAt ≤ dueAt`); `overdue` (not done and `dueAt < now`); `onTimeRate = doneOnTime / (tasks done or with dueAt ≤ now)`, null when the denominator is 0.

## 14. Auto-grading — `lib/domain/grading.ts`

| Item | Marks |
|---|---|
| `mcq` | `maxMarks` if the chosen option equals the key, else 0 |
| `msq` | `maxMarks` if the chosen set equals the key set exactly, else 0 (no partial credit) |
| `numeric` | `maxMarks` if `|value − key| ≤ tolerance`, else 0 |
| `code` | `roundHalfUp(maxMarks × Σ weight of passed cases / Σ weight of all cases, 2)` |
| `text`, `file`, `observation` | manual; with a rubric, item marks = Σ criterion marks |

**Output comparison for code (we compare; the runner only executes):** normalize both strings — `\r\n` → `\n`, strip trailing whitespace on every line, strip trailing newlines — then compare exactly. A case passes when the runner status is `accepted` and the normalized outputs are equal.

| stdout | expected | Pass |
|---|---|---|
| `"5\n"` | `"5"` | yes |
| `"1 2 \n3\r\n"` | `"1 2\n3"` | yes |
| `"5"` | `"6"` | no |
| `"a b"` | `"a  b"` | no (inner whitespace is significant) |

Attempt total = `roundHalfUp(Σ item marks, 2)`. Results can be published only when every submitted attempt has every item scored.

**Counted score** — `countedScore(attempts, policy)` in `lib/domain/attempts.ts` (M04; these rows stood in §2 until M01b rewrote it). Only **graded** attempts count: `best` → the highest `total`; `last` → the `total` of the graded attempt with the highest `attemptNo`; no graded attempt → **0** (a missed assessment counts as zero, A-14). M06 and M09 use the same function.

| Graded attempts (attemptNo: total) | Policy | Counted |
|---|---|---|
| 1: 6, 2: 8, 3: 7 (of 10) | best | 8 |
| 1: 6, 2: 8, 3: 7 (of 10) | last | 7 |
| 1: 6 graded, 2: submitted, not graded | last | 6 |
| none | best | 0 |

**Quiz average** — `quizAveragePct(quizzes)` in `lib/domain/grading.ts` (SKL-02, M04: the People tab of a skill course). Over the offering's quizzes whose results are published, the mean of each quiz's `100 × counted / maxMarks`, with a quiz the student did not attempt counted as 0; `roundHalfUp(…, 2)`; `null` when no quiz has published results (A-M04-5).

| Quizzes (counted / max) | Result |
|---|---|
| 8/10, 15/20 | 77.5 |
| 8/10, missed (0/10) | 40 |
| 1/3 | 33.33 |
| none published | null |

## 15. Proctoring violations — `lib/domain/proctoring.ts`

Event types: `fullscreen_exit`, `tab_hidden`, `paste_blocked`, `webcam_unavailable`. Only `fullscreen_exit` and `tab_hidden` increment `violations`. With `tabSwitchLimit = N > 0`, the attempt auto-submits on violation `N + 1`; `N = 0` only logs.

| Limit | Violations so far | New event | Result |
|---|---|---|---|
| 3 | 3 | tab_hidden | violations 4 → auto-submit |
| 3 | 2 | tab_hidden | violations 3 → continue |
| 3 | 3 | paste_blocked | violations 3 → continue (logged) |
| 0 | 10 | tab_hidden | violations 11 → continue (logged) |

## 16. Rate limiting — `lib/rate-limit.ts` (not pure; integration-tested)

Fixed window: key `rl:<name>:<subject>:<floor(now / windowMs)>`; `INCR`; on the first increment `PEXPIRE windowMs`; allowed while the count ≤ limit. Limits per action are in 09 §4.

The attempt is counted **before** the check, so parallel guesses are limited too. `limit()` returns `{ refund }` bound to the key it incremented (`DECR` + `PEXPIRE` in one `MULTI`); login calls it after a correct password, so only failures count toward the login limits (AC-M00-04) and a student signing in on several lab machines is never blocked.

## 17. Credits, codes and Bloom levels — `lib/domain/catalog.ts` (M01b)

**`parseCredits(text)` → `{ credits, twoPart } | null`** reads a T-P-Pj split anywhere in a text: separators `+`, `-`, `--`, `–`, `—`, optional `hr`/`hours` units; each part ≥ 0 in 0.5 steps, total ≤ 30 (CUTM's 2021 repository has 0+0+24 internships, 2+0+21 domain tracks and 0+0+30 workshops). A two-part split is read as theory + practice and flagged (A-59).

| Input | Result |
|---|---|
| `3+0+1` · `(3-0-1)` · `Code(Credit) : CUTM1535(3-0-1)` | 3-0-1 |
| `2--2--2` | 2-2-2 |
| `1.5+0+1.5` | 1.5-0-1.5 |
| `CUTM 3114 (0-3-1)` | 0-3-1 |
| `3 – 1 – 0` | 3-1-0 |
| `3 (2+1)` | 2-1-0, `twoPart` |
| `4` · `1.25+0+1` · `2021-2022` · empty | null |

`creditTotal` sums the parts; `formatCredits` prints `3-0-1`; `courseMode` is `credit` when the total is above 0, else `noncredit` (01 §6).

**Codes and names.** `normalizeCode`: upper case without spaces, `-` or `_` (` cutm 1535 ` → `CUTM1535`, `ASAG 1101` → `ASAG1101`, `SK01` stays). `extractCode` finds 2–6 letters plus exactly 4 digits in free text (`ADVANCED JAVA-CUST1051` → `CUST1051`; `SGJ/N0101`, `PO12`, `26507` → null). `normalizeTitle` compares titles loosely (`SKILL: Solar PV Installation` = `solar pv installation`; `&` = `and`). `normalizePersonName` drops titles (`Dr. Goutam Kumar  Mahato` → `goutam kumar mahato`). `programmeCode('M.Sc Mathematics', taken)` → `MSC-MATHEMATICS`, then `-2` on a collision, ≤ 20 characters. `courseTypeFromLabel` maps the courseware and repository type labels to the six types (`Domain Elective` → domain; unknown → null).

**Bloom.** `inferBloom(statement)` skips a lead-in ("CO1:", "Students will be able to", "The student will", "To") and an adverb ("Critically"), then reads the first verb against a fixed verb list: `Explain …` → understand, `Evaluate …` → evaluate, `Design …` → create, `Analyze …` → analyse, `Get a deep understanding …` → understand, `Read and interpret …` → null. The result is only a **suggestion** shown pre-ticked; it becomes the CO's level when a person saves (A-58). `parseBloomLevels` reads stated levels in order — `Apply, Create`, `L2 - Understand`, `K3` (K1–K6 in order), `Analyzing` — keeping at most three (`extra` says more were given).

**Session plan text.** `parseSessionLines`: one session per line; a `Practice:`/`Practical:`/`Lab:` prefix makes a practice session and `Project:` a project session; blank lines are ignored. `formatSessionLines` is its inverse.

**Outcomes.** `nextCoCode(existing, seq)` never reuses a code: it is one above the highest of the existing codes and `seq` (`courses.coSeq`, the highest number ever given). Vectors: `([], 0)` → CO1; `(CO1, CO4; 0)` → CO5; `(CO1, CO5; 6)` → CO7 (CO6 was deleted); `(CO9; 6)` → CO10; `(Outcome 1; 0)` → CO1. `coNumber('CO7')` = 7, anything else 0. `mergeCos(existing, imported, newId)` keeps each CO's id by its code, so a re-import leaves calendar rows and question tags pointing at the same CO.

**`mappingCoverage(coIds, codes, cells)`** (M03b, the Outcomes tab) — for each PO/PSO code: `links`, the COs linked to it, and `average`, `roundHalfUp(Σ level / links, 2)` over those links only, or null with none; also `uncovered` (codes with no link) and `unmappedCoIds` (COs linked to nothing). A display of the course's articulation, not an attainment value (§4 weighs by level instead). Vector: four COs a–d and e; PO1 a 2, b 3, c 3, d 2 → 4 links, 2.5; PO4 b 2, c 2, d 1 → 1.67; PO6 a 1, d 1 → 1; PO7 none → null; uncovered PO7; unmapped e.

**`syllabusHours(modules)`** adds each module's `hours` as written (`4+0+2` → 6, `6` → 6, none → 0): `4+0+2`, `6`, none, `1.5+0+0.5` → 14.

**`courseReadiness(course)`** — the course page's checklist, in order: review the import (only while review notes exist) · coordinator · objectives · outcomes · Bloom levels (every CO) · mapping (every CO linked at least once) · syllabus (a module or the PDF) · books · session plan. A non-credit course drops outcomes, Bloom levels, mapping and books. CUTM1535 freshly imported: 5 of 8 done.

**Course-list CSV — `parseCourseListCsv` in `lib/domain/csv.ts`** (06 §8.5): `credits` must equal the T+P+Pj total (`Credits 4 do not match T+P+Pj 2-0-1.`); `tpp` must have three parts; one code keeps one title and one credit split across rows; a programme lists a code once.

**Courseware pages — `normalizeCourseware` in `lib/domain/courseware.ts`** reads the lines and tables the adapter extracts (06 §4.8):
- Hard-wrapped lines are joined (a line starting in lower case or after "of", "and" or a comma continues the previous one); bullets start entries; lead-ins ("Students will be able to:") are dropped.
- Code, credits and faculty from `Code(Credit) : …`, `CODE:`, `Credits:`, `Faculty:` lines, a descriptor table ("Course Code | ASAG 1101 | Credits | 3 (2+1)") or a header row over a value row ("Subject Code | … | T-Pr-Pi" above "CUTM 2603 | … | 3-2-0"); the code falls back to the slug or the title.
- Outcomes from a CO table if there is one, otherwise from the outcomes list, numbered in order (a review note says so). Stated levels ("(Apply, Analyze)") are kept; otherwise a suggestion from the verb.
- Mapping from a table with PO/PSO columns: 3/2/1 or H/M/L; other columns are left out with a note; a mapping where every CO has the same row gets a note.
- Modules `Module II (4hr+0hr+2hr)` → title "Module II", hours `4+0+2`; a bold module line starts the syllabus even with no syllabus heading above it; `Practice n:` and experiment lists are practicals; `PROJECT n:` lines and project lists ("List of Projects", "Project Ideas") are projects; "Project (1 hour):" and "Practical (4 hours):" label parts of a module or a week, not sections; a course-level practical list becomes a module "Practicals".
- Books: `Chapters:` lines join the book above; numbered entries run on across wrapped lines.
- Sessions: `Session 8 & 9` → two sessions with the same topic; tables by their header (`Lect. No`, `Points To Covered`, `Methodology`); a `Project…`/`Practice…` prefix or type cell sets the kind; links are dropped, and so are the labels left behind ("PPT Link:", "Video Link:", "E-material (…):").
- Sizes follow `CATALOG_LIMITS`; a long session description is cut to 200 characters with "…", and any other cut gets a review note.

Fixture vectors (`lib/integrations/courseware.test.ts`, eight real pages): 1084 → modules without a syllabus heading, levels written after each outcome, five projects and no numbered sessions; 1115 → credits 3-2-0 from a header-row table; page 836 → CUTM1535, 3-0-1, 2 objectives, 2 COs, no mapping, 7 modules, 6 projects, 1 textbook with chapters, 43 sessions (31 theory, 12 project); 500 → CUTM3073, 0-3-1, skill, 6 modules, 12 projects, 20 practice sessions; 1250 → ASAG1101, `3 (2+1)` → 2-1-0 with a note, H/M/L mapping, and no phone number or email in the output.

## 18. Lesson media keys and reordering — `lib/domain/uploads.ts`, `lib/domain/order.ts` (M03b)

- `fileUuid(key)` → the upload's own id, the last part of its key without the extension (`…/abc-123.mp4` → `abc-123`); the media job's id carries it, so a replaced video gets a job of its own (06 §6).
- `derivedKey(fileKey, suffix)` → the key of a file the worker makes from an upload, beside it: `…/abc-123.mp4` with `-480p.mp4` → `…/abc-123-480p.mp4`, with `-frame.jpg` → `…/abc-123-frame.jpg`. `/api/files` serves both under the video's rule.
- `frameAtSec(durationSec)` → where the thumbnail frame is taken: a tenth into the video, at least 1 s in, never past its last second: `min(max(1, round(d / 10)), max(0, d − 1))`. 1 s → 0; 2 s → 1; 5 s → 1; 60 s → 6; 7200 s → 720.
- `isPermutation(current, proposed)` → true when `proposed` holds exactly the members of `current`, each once, in any order. A dropped or "Move up / down" order is accepted only then, so a list built from a stale page is refused instead of half-applied. [a b c] → [c a b] true; same order true; [] → [] true; [a b c] → [a b] false; [a b] → [a b c] false; [a b c] → [a b d] false; [a b c] → [a a c] false.

