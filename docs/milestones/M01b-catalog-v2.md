# M01b · Catalogue v2: CUTM's course repository, courseware import, evaluation policy

| | |
|---|---|
| Depends on | M02 |
| Requirements | CRS-01, CRS-02, CRS-05, CRS-07 (new), CPP-01 – CPP-04, CE-07, ADM-01 – ADM-03, ADM-06 (new), ADM-07 (new), NFR-04, SKL-01 |
| Release | part of R1 |
| Packages added | — (`happy-dom` 20.14.6 is now also imported by `lib/integrations/courseware.ts`) |
| Env vars added | `COURSEWARE_URL` |
| Collections | `curriculumEntries`, `syncRuns` (new); `courses`, `programs`, `offerings` (changed); `evaluationSchemes` (removed) |
| Components introduced | `CoPoEditor`, `Checklist` |

## Goal

The M01 catalogue was designed before we had CUTM's real data, and it asks too much of people: a course belonged to one programme, credits were one number plus component checkboxes, every CO had its own dialog, the CO–PO matrix was one dropdown per cell, and admins built evaluation schemes by hand. A course took 9–10 saves.

CUTM already publishes its catalogue (product-owner decision, 15 Oct 2026):

- The **Course Repository** lists every course as Programme · Stream · Basket · Type · Code · Title · Credits · T+P+Pj (theory, practice and project credits, e.g. `CUTM1535 · 3+0+1`). One course appears in many programmes.
- **courseware.cutm.ac.in** has a page per course (about 1,284) with objectives, outcomes, sometimes a PO1–PO12 / PSO1–PSO3 table, modules with hours, practicals, projects, books and a session plan. Pages are typed by hand and vary a lot.
- The **Examination Policy (2020)** marks every component out of 100: theory = internal 40 (Mid-term I 15, Mid-term II 15, assignment 5, attendance 5) + end-semester 60; practice and project = 50 internal + 50 external, each by rubric; the course percentage is the credit-weighted average, rounded up.

This milestone loads every real course, matches the model to CUTM's, and makes finishing a course a few obvious clicks: a readiness checklist, one editor per step, a click-to-cycle CO–PO grid, an evaluation policy set once in Settings, and offerings for several sections created in one dialog.

## Decisions (Aniket, 15 Oct 2026)

1. **Import now, export later.** An admin-run courseware importer; anything it cannot settle is a review note, and the course shows "Needs review".
2. **University-wide catalogue.** One course per code. Programmes list their courses in baskets. CO–PO uses the fixed codes PO1–PO12 and PSO1–PSO3; programmes only give them titles.
3. **Credits decide the features.** A course with credits gets COs, mapping, marks and exam integration. A 0-0-0 course is non-credit and runs in M02's skill mode. The six courseware types (Core, Domain, Skill, Certificate, Advanced certificate, Diploma) are labels.
4. **Marking from the Examination Policy.** One Settings form; each offering keeps a copy (snapshot) made when it is created. Evaluation schemes and `/admin/schemes` go.
5. **Course coordinator.** One faculty member per course, prefilled from the courseware faculty name when exactly one person matches. The coordinator and admins edit a course's content; every change is audited.
6. **Course list by CSV upload** (`programme, stream, basket, type, code, title, credits, tpp`). The 2020/2021 repository PDFs are converted to this CSV once, offline.

## Before you start

Read 05 §3.3, §3.6, §3.6a, §3.7, §7.4; 06 §4.8, §6, §7, §8.5; 07 §1, §2, §6, §17; 08 §2, §5; 09 §2, §3, §6. The detailed rules below are the contract; where they and an older document disagree, this file wins until the T14 sweep.

## Tasks

T5–T12 change shared Mongoose types and land as **one** green commit (`M01b(core)`); every other task is its own commit.

### T1 · Decisions and this file
Files: this file, 00 §3, 01 (§3, §6, §7 notes, CRS-07, ADM-06, ADM-07, §8), PROGRESS (decision entry, questions, assumptions, status).

### T2 · Constants and input schemas
Files: `lib/schemas/structure.ts`, `lib/schemas/settings.ts`, `lib/schemas/jobs.ts` (+ tests).
- Constants `COURSE_TYPES`, `OUTCOME_CODES` (PO1–PO12, PSO1–PSO3), `SESSION_KINDS`, `BASKET_SCOPES`, `CATALOG_LIMITS` (sizes shared by the editors and the import).
- Forms: `SaveCourse` (code, title, type, theory/practice/project credits in 0.5 steps, total ≤ 30, status); `SaveObjectives`; `SaveCos` (rows `coId_i`, `statement_i`, `bloom_i[]` 0–3, `remove_i`); `SaveCoMap` (`cell[]` = `<coId>:<code>:<1–3>`, ≤ 225); `SaveSyllabus` (module rows, projects, PDF); `SaveBooks`; `SaveSessionPlan` (one session per line, `Practice:`/`Project:` prefixes); `CourseRef`; `SetCoordinator`; `SaveProgram`; `SaveProgramOutcomes` (15 titles); `SaveBaskets` (≤ 12); `AddProgrammeCourse`/`RemoveProgrammeCourse`; `CreateOfferings`; `UpdateOfferingFaculty`; `ImportCourseList`; `CourseListCsvRow`; `StartCoursewareImport`; `FillCalendar`.
- Settings key `evaluation` (flat fields, policy defaults; cross-field rules in 06 §7).
- Job payloads `CoursewareListJob`, `CoursewarePageJob`.

### T3 · Pure functions (07 §1, §2, §17)
Files: `lib/domain/catalog.ts`, `lib/domain/evaluation.ts`, `lib/domain/round.ts` (`ceilTo`), `lib/domain/time.ts` (`classDates`), `lib/domain/csv.ts` (`parseCourseListCsv`), all with test vectors.
- `parseCredits` reads `3+0+1`, `2--2--2`, `1.5+0+1.5`, `(3-0-1)`, `CUTM 3114 (0-3-1)`; `3 (2+1)` is a two-part split (flagged).
- `coursePercentage`: DECT0901 1-2-2 with 87/89/92 → 89.8 → **90**.
- `courseReadiness`: the course page's checklist; CUTM1535 freshly imported → 5 of 8 done.

### T4 · Courseware adapter and normaliser
Files: `lib/integrations/courseware.ts`, `lib/domain/courseware.ts`, `tests/fixtures/courseware/*.html` (trimmed real pages; contact details replaced), `lib/env.ts`, `.env.example`, `tests/setup.ts`.
- The adapter fetches (90 s timeout; 404 → no page), parses with happy-dom (scripts off) and flattens the body into lines and tables. Contact details (emails, mobile numbers, lines labelled as contact) never leave it.
- The pure normaliser reads code, credits, faculty, objectives, outcomes (CO table first, else the outcomes list, numbered in order), mapping (1–3 or H/M/L), modules (hours as written, e.g. `4+0+2`), practicals, projects, books (chapters attached), the session plan (`Session 8 & 9` → two sessions; tables by their header) and plain review notes.

### T5 · Models
Files: `lib/models/course.ts`, `program.ts`, `offering.ts`, `user.ts`, new `curriculum-entry.ts`, `sync-run.ts`; delete `evaluation-scheme.ts`; `scripts/sync-indexes.ts`; `tests/factories.ts`. Shapes in 05.

### T6 · Migration and seed
Files: `scripts/migrate-catalog-v2.ts` (`npm run db:migrate:catalog-v2`), `scripts/seed.ts`.
- Idempotent: a second run reports 0 changes. Merges duplicate codes (repointing offerings and calendar CO ids), splits old credits (flagged), turns the rich-text syllabus into one module, creates curriculum links, turns programme POs/PSOs into outcome titles, snapshots offerings, drops the old indexes and `evaluationschemes`, and writes one `catalog.migrated` audit entry.
- Seed: real courses CUTM1602 (1-2-1), CUTM1001 (2-0-1), CUTM1014 (1.5-0-1.5), CUTM1535 (3-0-1, its public courseware content), fixture SK01 (0-0-0); programmes BTECH-CSE and MSC-MATH with baskets; offering `CUTM1602 · Programming in C · 2026-ODD · A`.

### T7 · Access and DAL
Files: `lib/auth/access.ts` (`requireCourseEditor`), `lib/data/courses.ts`, `lib/data/structure.ts`, `lib/data/offerings.ts`, new `lib/data/imports.ts`, `lib/data/workspace.ts`, `lib/data/settings.ts`; delete `lib/data/schemes.ts`.
- The catalogue is readable by admin, HoD and faculty; content is editable by admins and the course's coordinator.

### T8 · Actions

| Action | Who | Rules · audit |
|---|---|---|
| `saveObjectives`, `saveCos`, `saveCoMap`, `saveSyllabus`, `saveBooks`, `saveSessionPlan`, `markReviewed` (`app/(app)/catalog/actions.ts`) | admin, or faculty who coordinate the course | sets `contentEditedAt`; `course.content_changed` / `course.cos_changed` / `course.map_changed` / `course.reviewed`; removing a CO removes its mapping |
| `saveCourse`, `setCoordinator`, `reimportCourse` | admin | code is fixed once the course has an offering; `course.updated`, `course.coordinator_changed` |
| `saveProgram`, `saveProgramOutcomes`, `saveBaskets`, `addProgrammeCourse`, `removeProgrammeCourse` | admin | renaming a basket moves its links; removing a basket in use is a conflict |
| `createOfferings`, `updateOfferingFaculty` | admin | one offering per section in one transaction; course must be in the batch programme's curriculum; programme must have a department; project mode exactly when project credits > 0; snapshots credits and the evaluation policy (null for non-credit) |
| `fillCalendarFromCourse` | teach | first date + weekdays → dated rows from the course's session plan; asks before replacing existing sessions |
| `importCourseList`, `startCoursewareImport` (`app/(app)/admin/imports/actions.ts`) | admin | 06 §8.5; one courseware run at a time |

### T9 · Worker and the plan email
Files: `lib/queue.ts` (`syncQueue`), `worker/jobs/sync.ts`, `worker/index.ts`, `worker/jobs/mail.ts`, `lib/domain/email-templates.ts`.
- `coursewareList` walks the listing and queues one `coursewarePage` job per page (concurrency 2, at most one job a second). A page job matches by code, then by a unique title; binds the page atomically; never overwrites content edited in the LMS unless forced; keeps CO ids by code; prefills the coordinator only on a unique name match; counts each page once in the run.
- The plan email lists modules, books and Bloom levels, and the programme's outcome titles.

### T10 · UI: catalogue
`/catalog` (search, filters, credit badge, coordinator, Needs review), `/catalog/[id]` (facts, review notes, readiness checklist, one editor per step, CO–PO grid), `components/co-po-editor.tsx`, `components/checklist.tsx`; navigation; `/admin/courses` and `/admin/schemes` removed.

### T11 · UI: structure, offerings, imports, settings
Programme page (department, outcome titles, baskets, curriculum, batches); New offering dialog; `/admin/imports` and `/admin/imports/[runId]`; the evaluation settings form with a live worked example.

### T12 · UI: workspace
Overview: credits, coordinator, modules, books, Bloom chips, programme outcome titles; setup step 1 "Catalogue course ready"; plan page "Start from the course's session plan".

### T13 · Tests
Integration: `catalog`, `course-list`, `courseware-import`, `offerings`, `structure`, `workspace`, `mail-worker`. E2E: `catalog.spec.ts`; `admin-structure.spec.ts` and `content.spec.ts` updated.

### T14 · Doc sweep and report
01–11, M01/M03/M04/M06/M08/M09/M10/M11 notes, PROGRESS report.

## Acceptance criteria

- **AC-M01b-01** A course-list CSV with one bad row writes nothing and names the row and the problem; a valid one creates or updates courses by code, links them to programmes and baskets, and a second identical upload changes nothing.
- **AC-M01b-02** Importing courseware page 836 gives CUTM1535 with credits 3-0-1, 2 objectives, 2 outcomes with suggested Bloom levels, 7 modules, 6 projects, 1 textbook, 43 sessions (12 of them project) and "Needs review". No email address or phone number from any page is stored.
- **AC-M01b-03** Content edited in the LMS is not overwritten by a later import; an admin's forced re-import replaces it and keeps CO ids by code.
- **AC-M01b-04** Only admins and the course's coordinator can change its content; another faculty member, an HoD and a student cannot (FORBIDDEN, and no edit buttons). Every change is in the audit log.
- **AC-M01b-05** The CO–PO editor saves in one action; codes outside PO1–PO12/PSO1–PSO3 and levels outside 1–3 are refused.
- **AC-M01b-06** One "New offering" dialog creates an offering per ticked section with its students enrolled, copying the course's credits and the current evaluation policy; a later change to the policy does not change those offerings.
- **AC-M01b-07** A 0-0-0 course becomes a non-credit offering: no evaluation copy, no outcomes or mapping, and M02's lesson-completion attendance.
- **AC-M01b-08** The evaluation settings refuse theory parts that do not add up to 100, or attendance bands that do not fall, and say which field is wrong.
- **AC-M01b-09** A teacher fills the calendar of a CUTM1535 offering from its session plan by choosing the first class date and weekdays: 43 dated sessions with their topics.
- **AC-M01b-10** Running the migration twice: the second run reports 0 changes.

## Validation checklist (human)

- [ ] Convert the 2021 Course Repository PDF to the CSV, upload it, and compare the course and programme counts with the PDF.
- [ ] Import "One page" for `/course/836` and compare the course page with the courseware page side by side.
- [ ] Start an "Only pages not imported yet" run before leaving for the night; check the run page the next morning and open ten imported courses at random.
- [ ] As a coordinator on a phone (390 px): finish CUTM1535 from the readiness checklist — confirm outcomes, click the mapping, mark reviewed.
- [ ] Create offerings for sections A and B in one dialog; fill one calendar from the session plan; publish; read the email in Mailpit.
