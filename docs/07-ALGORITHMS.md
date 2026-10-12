# 07 · Algorithms

Every number a student, teacher or auditor sees is produced by a function specified here. Each lives in `lib/domain/` as a pure function (no I/O, no clock, no randomness — `now` is a parameter) and each **test vector table below must appear verbatim as an `it.each` test**. All worked examples were computed by script, not by hand.

Where a threshold or weight is configurable it is read from settings (06 §7) by the caller and passed in. The defaults are proposals awaiting client confirmation; the formulas are not.

## 1. Rounding — `lib/domain/round.ts`

- `roundHalfUp(x, d)`: half away from zero at `d` decimals, robust to binary floating-point noise (code in 04 §6.10).
- `ceilTo(x, d)`: `Math.ceil(Number((x * 10**d).toPrecision(15))) / 10**d`.
- **Where rounding happens:** item marks entered by hand → 2 dp on input. Attempt totals → 2 dp. Component marks → kept unrounded internally, displayed at 2 dp. Internal total → the scheme's rounding, **once**, at the end. Percentages → 2 dp. Attainment values → 2 dp. Engagement score → integer. Never round twice.

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

## 2. Internal marks (continuous evaluation) — `lib/domain/internal-marks.ts`

`computeInternalMarks(scheme, assessments, scoresByAssessment) → { components, total, complete }`

**Inputs**
- `scheme`: the offering's bound version (`internalMax`, `components[]`, `rounding`).
- `assessments`: the offering's assessments with `status = results_published` (`{ id, mode, maxMarks }`). Assessments in other states never count.
- The student's **counted score** per assessment:
  - `attemptPolicy = best` → the highest `total` among graded attempts; `last` → the `total` of the graded attempt with the highest `attemptNo`.
  - No graded attempt → **0** (a missed assessment counts as zero).

**Per component `c`**
1. `A_c` = counted assessments whose `mode ∈ c.modes`.
2. If `A_c` is empty → `pct = null`, `marks = 0`.
3. `p_i = score_i / maxMarks_i`.
4. `pct` by `c.aggregation`:
   - `average` → mean of `p_i`
   - `sum` → `Σ score_i / Σ maxMarks_i`
   - `best_n` → mean of the top `min(bestN, |A_c|)` values of `p_i`
5. `marks_c = pct × c.weight` (unrounded).

**Total:** `raw = Σ marks_c`; `total = ceilTo(raw, decimals)` if `rounding.mode = 'ceil'`, else `roundHalfUp(raw, decimals)`; clamp to `[0, internalMax]`.
**Complete:** every component has `|A_c| ≥ 1` (`≥ bestN` for `best_n`). Locking and export (M08) require `complete` for every enrolled student, or an admin override with a reason.

**Worked example** — scheme `theory+practice`, `internalMax` 50: quiz 15 (`average`, modes `quiz`), assignment 10 (`best_n`, n = 2, modes `assignment`), learning record 5 (`average`), lab record 5 (`sum`), lab test 15 (`average`, modes `lab_test`, `coding_test`); rounding 0 dp half-up.

| Component | Counted scores | pct | marks |
|---|---|---|---|
| quiz | 8/10, 15/20, 0/10 (missed) | (0.8 + 0.75 + 0)/3 = 0.51667 | 7.75 |
| assignment | 18/20, 12/20, 20/25 | best two of 0.9, 0.6, 0.8 → 0.85 | 8.5 |
| learning_record | 4/5 | 0.8 | 4 |
| lab_record | 9/10, 7/10 | 16/20 = 0.8 | 4 |
| lab_test | 30/40 | 0.75 | 11.25 |
| **total** | | | raw 35.5 → **36** |

| Case | Expected |
|---|---|
| Example above, rounding `{0, half_up}` | total 36, complete true |
| Same, rounding `{0, ceil}` | 36 |
| Same, rounding `{2, half_up}` | 35.5 |
| Same without any published lab test | lab_test `pct` null, raw 24.25 → total 24, complete false |
| Quiz attempts 6/10, 8/10, 7/10 with policy `best` | counted 8 |
| Same with policy `last` | counted 7 |
| `best_n` n = 2 with only one assessment published (0.9) | pct 0.9, complete false |

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
3. For each active enrolled student: `num = Σ` counted item marks on `I_k` (same counted attempt as §2; missing → 0), `den = Σ maxMarks` of `I_k`. The student **attains** `k` if `100 × num / den ≥ T`.
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

For each **ugc** offering of the student in the term:
- `internal` = locked `internalMarks.total`; `internalMax` = scheme `internalMax`.
- `external` = end-sem `marks` (absent → 0); `externalMax` = the imported `maxMarks`.
- `total = internal + external`; `pct = roundHalfUp(100 × total / (internalMax + externalMax), 2)`.
- Grade = the first scale entry (sorted by `minPct` descending) with `pct ≥ minPct`, compared **after** rounding `pct`. End-sem absent → `absentGrade` ("Ab", grade point 0).
- `SGPA = roundHalfUp(Σ credits × gradePoint / Σ credits, 2)` over rows with credits > 0; `null` if no credits or `showSgpa` is false.

Default scale (06 §7): O ≥ 90 (10) · A+ ≥ 80 (9) · A ≥ 70 (8) · B+ ≥ 60 (7) · B ≥ 50 (6) · C ≥ 45 (5) · P ≥ 40 (4) · F (0).

| Course | Credits | Internal | External | pct | Grade | GP |
|---|---|---|---|---|---|---|
| C Programming | 4 | 36/50 | 38/50 | 74 | A | 8 |
| Mathematics | 3 | 30/50 | 20/50 | 50 | B | 6 |
| C Lab | 2 | 45/50 | 40/50 | 85 | A+ | 9 |
| **SGPA** | | | | | | **7.56** |

Boundary vectors: pct 90 → O; 89.99 → A+; 39.99 → F; raw 44.995 → pct 45 → C; end-sem absent → Ab, GP 0, counted in the SGPA denominator.

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

**Skill-course attendance (SKL-04):** `100 × lessons with completedAt / published lessons`, 2 dp; no published lessons → null.

## 9. Beacon anti-inflation — `lib/domain/ranges.ts`

- **Video:** `newSec = watchedAfter − watchedBefore`. Allowed `= 2 × (now − lastBeaconAt) / 1000 + 30` (playback up to 2×, 30 s slack); first beacon (no `lastBeaconAt`) allows 120. If `newSec > allowed` the beacon is ignored (204, logged at `warn`). Otherwise store the merged ranges, set `lastBeaconAt = now`, and `$inc engagementDaily.videoSec` by `newSec` (only new unique seconds — re-watching never inflates).
- **Live focus:** accepted only while the session is `live` and the student has an open presence interval; `focusedSec ≤ min(120, (now − lastFocusAt) / 1000 + 5)`; `$inc` `attendance.focusedSec` and `engagementDaily.focusedSec`.

| lastBeaconAt | now | newSec | accepted |
|---|---|---|---|
| none | — | 120 | yes |
| none | — | 121 | no |
| 10:00:00 | 10:00:30 | 90 | yes (allowed 90) |
| 10:00:00 | 10:00:30 | 91 | no |

## 10. Derived live attendance (ATT-03, LIV-04) — `lib/domain/attendance.ts`

`deriveAttendance(presence, startedAt, endedAt, thresholdPct) → { presenceSec, status }`

1. Close open intervals at `endedAt`; intersect each with `[startedAt, endedAt]`; take the **union** (overlaps count once).
2. `presenceSec` = union length; `status = presenceSec ≥ thresholdPct / 100 × (endedAt − startedAt) ? 'present' : 'absent'`.
3. Finalization writes a row for every active enrolled student (no presence → absent). Rows with `source = manual` are never overwritten.
4. A session that never started (`startedAt` null) produces no rows.

Session 10:00–11:00 (3600 s), threshold 75 % (2700 s):

| Presence | presenceSec | Status |
|---|---|---|
| 09:55–10:50 | 3000 | present |
| 10:00–10:20, 10:30–11:10 | 3000 | present |
| 10:10–10:40, 10:20–10:50 | 2400 | absent |
| 10:15–(open) | 2700 | present (exactly at threshold) |
| none | 0 | absent |

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
