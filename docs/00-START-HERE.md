# 00 · Start here

This folder is the complete build specification for the CUTM Learning Management System. It is written for an AI coding agent (any vendor) or a developer who has never seen the project. Follow it literally. Where it is silent, ask — do not fill the gap with a guess.

## 1. Reading order

| # | Document | Answers | Read when |
|---|---|---|---|
| 1 | `AGENTS.md` (repo root) | The non-negotiable rules | Always, first |
| 2 | `01-PROJECT-CONTEXT.md` | What is being built, for whom, what is out of scope, every requirement ID | Always |
| 3 | `02-ARCHITECTURE.md` | Runtimes, folders, request flows, rendering model, jobs, adapters, decisions | Always |
| 4 | `04-CODING-LAWS.md` | How code must be written; canonical patterns to copy | Always |
| 5 | `03-TECH-STACK.md` | Exact versions; what each package is for; what is banned | Before adding or using any package |
| 6 | `05-DATA-MODEL.md` | Every collection, field, index and invariant | Before touching a model or query |
| 7 | `06-CONTRACTS.md` | Error contract, route handlers, adapter interfaces, jobs, settings, CSV formats | Before writing an action, handler, job or integration |
| 8 | `07-ALGORITHMS.md` | Every formula that produces a number a student or auditor sees, with test vectors | Before writing anything in `lib/domain/` |
| 9 | `08-UI-SYSTEM.md` | Routes, navigation, CSS classes, the shared component inventory, page patterns | Before writing anything in `app/` or `components/` |
| 10 | `09-SECURITY.md` | Permission matrix, data scoping, uploads, secrets, audit, retention | Before writing any read or write path |
| 11 | `10-TESTING-AND-VALIDATION.md` | Test layers, commands, fixtures, release gates | Before writing tests; before reporting |
| 12 | `11-OPERATIONS.md` | Environment variables, local stack, deploy, backups, monitoring, support runbook | M00, M11, and whenever you add an env var |
| 13 | `milestones/Mxx-*.md` | The task you were given | Your assignment |
| 14 | `PROGRESS.md` | What is done, open questions, assumptions, the log | Before starting and when finishing |
| 15 | `prompts/build-milestone.md` | The prompt a human pastes to start an agent on a milestone | When handing work to an agent |

## 2. How to execute a milestone

1. Open `PROGRESS.md`. Confirm every milestone listed under **Depends on** is `Done` and no open question marked `blocks: Mxx` is unanswered for the tasks you plan to do.
2. Read the milestone file top to bottom, then every section it links to.
3. Work the tasks **in the order written**. Each task is ordered database → backend → frontend → tests.
4. After each task: run `npm run check` (lint + typecheck + unit tests) and the task's own verification. Commit using the format in `AGENTS.md`.
5. When the milestone's acceptance criteria all pass, walk its validation checklist yourself as far as an agent can (anything requiring a human — a real email inbox, a webcam, a second device — is listed as not performed).
6. Append the report to `PROGRESS.md` and set the milestone status.

Never start a later task because an earlier one is "almost done". Never mark a criterion passed that you did not execute.

## 3. Milestone map

| ID | Milestone | Depends on | SRS phase | Release |
|---|---|---|---|---|
| M00 | Foundation: tooling, local stack, auth, app shell, audit, worker | — | 1 Core | — |
| M01 | Academic structure & administration | M00 | 1 Core | — |
| M02 | Content, course plan, announcements, skill-course progress | M01 | 1 Core | — |
| M01b | Catalogue v2: CUTM's course repository, courseware import, evaluation policy | M02 | 1 Core | — |
| M03 | Live classes & attendance | M01b | 1 Core | — |
| M03b | Course workspace redesign: builder, player, outcomes and syllabus in the course, plan as a list | M03 | 1 Core | — |
| M04 | Assessment engine: quizzes, tests, assignments, records, grading | M01b | 1 Core | **R1 pilot** |
| M05 | Virtual lab (compilers) & proctoring | M04 | 2 Evaluation | — |
| M06 | Continuous evaluation: internal marks, trends, dashboards | M04 (M05 for coding modes) | 2 Evaluation | **R2** |
| M07 | Projects: GitHub analytics, task tracker, reviews | M03, M04 | 3 Projects & integration | — |
| M08 | Exam-system integration, marks lock, grade sheet | M06 | 3 Projects & integration | **R3** |
| M09 | CO-PO-PSO attainment & AI tagging assistance | M04, M08 | 4 Outcomes & AI | — |
| M10 | Engagement scoring & dashboards | M03, M04, M06 | 4 Outcomes & AI | **R4** |
| M11 | Hardening, load, security, backups, launch | all | all | **Launch** |

M01b redesigns M01's catalogue, schemes and offering creation after CUTM's real data (decision of 15 Oct 2026); it comes after M02 because M02 was already built. M03 and M04 may proceed in parallel after M01b (different agents, different folders). M07 may start after M04 if M03 is done. Everything else is sequential.

A **release** (R1–R4) deploys to the staging environment for client UAT after its milestone passes the release gate in `10-TESTING-AND-VALIDATION.md` §6. R1 exists because the client must see a working core quickly or move to D2L (`01-PROJECT-CONTEXT.md` §1).

## 4. Definition of done (every task)

A task is done only when all of these are true:

- [ ] The code does exactly what the milestone task specifies — no less, no more.
- [ ] `npm run check` passes (ESLint, `tsc --noEmit`, unit tests).
- [ ] `npm run test:integration` passes for any task that touches a model, DAL function, action or job.
- [ ] Every new calculation has the test vectors from `07-ALGORITHMS.md` as unit tests.
- [ ] Every new read path is scoped per `09-SECURITY.md` §3 and has a test proving another user's record is not returned.
- [ ] Every new list is paginated and its query is covered by an index listed in `05-DATA-MODEL.md`.
- [ ] Every new env var is in `11-OPERATIONS.md` §2 and `.env.example`.
- [ ] Every contract change is reflected in the docs in the same commit.
- [ ] No item from the "Do not generate filler" list in `AGENTS.md` is present.
- [ ] `PROGRESS.md` has an entry for the task.

## 5. Status vocabulary

| Status | Meaning |
|---|---|
| `Not started` | Nothing committed |
| `In progress` | Some tasks committed |
| `Blocked` | Waiting on an open question; the question ID is named |
| `Done` | All acceptance criteria pass and the report is written |
| `Validated` | A human has walked the validation checklist and signed it in `PROGRESS.md` |

## 6. When the docs and the code disagree

The docs win until someone changes them. If you find a disagreement:

1. Do not silently follow the code.
2. If the doc is clearly wrong (a typo, an impossible instruction), fix the doc and the code together in one commit and say so in your report.
3. If it is a design question, record it in `PROGRESS.md` as an open question tagged `@dev` and continue with unblocked work.

## 7. Sources

- **SRS v1.0 draft** — "Learning Management System (LMS) — Software Requirements Specification", prepared 12 Oct 2026 from the requirements call. Every requirement ID used in these docs (CRS-, COM-, ATT-, REC-, ASG-, CE-, LAB-, PRJ-, CPP-, EXM-, SKL-, LIV-, ENG-, ADM-, SUP-, NFR-) comes from it. `DSH-` IDs were assigned by the delivery team to the SRS §14 dashboard table.
- **Requirements call transcript** — call with Saneev Sir, 10 Oct 2026, 15 min. Timestamps in the SRS refer to it.

Neither source file is committed to this repository; the requirement register in `01-PROJECT-CONTEXT.md` §7 carries their content. If the client revises the SRS, update the register first, then the affected milestones.
