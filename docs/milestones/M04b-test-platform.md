# M04b · Test platform

| | |
|---|---|
| Depends on | M04 (the assessment engine) |
| Requirements | CE-03, CE-04, CE-05, CE-08, ASG-01–ASG-04, LAB-01–LAB-05 (from M05), CPP-05, CPP-06, COM-03; owner requests TP-01–TP-12 below |
| Release | R1 pilot (with M04) |
| Packages to add (each with its reason in 03 §3, in the commit that first uses it) | `@uiw/react-codemirror` 4.25.12 and its C, C++, Java and Python languages (pinned for M05 already); `openai` 7.27.0 (replacing `@anthropic-ai/sdk`, pinned for M09, on 18 Oct 2026); a PDF library for scorecards, certificates and attempt reports; an Excel writer for exports; a QR-code generator for share links |
| Collections | `assessments` and `submissions` (extended); new `questionBank`, `testLinks`, `testGrants`, `otps` |
| Infrastructure | A Judge0 CE 1.13.1 server (as the recruitment portal uses) for coding questions |

## Goal

Every gradable activity in the LMS becomes a full test platform. It brings together:
- what Aniket's two earlier test products did (DSW test v2 and the CSE recruitment portal);
- what the best testing platforms offer (HackerRank, Mettl, TestGorilla, Moodle Quiz, Canvas New Quizzes).

The aim is a platform a university can run its quizzes, mid-terms, placement tests and faculty recruitment on.

- **Share a test by link.** A link takes an LMS user straight to the test after signing in. A link for outside people (recruitment, entrance, placement) lets a guest register with name and email, confirm a one-time code sent to that email, and start.
- **Tests outside a course.** Staff create standalone tests (a recruitment test, a placement drive) from a new Tests page, as well as assessments inside a course.
- **Build fast.** A question bank per course (and a personal one for standalone tests) is tagged by CO, Bloom level, difficulty and topic. Each student gets their own paper drawn from it, organized in sections. More question types. AI drafts questions that a teacher reviews.
- **Take it calmly and fairly.**
  - A lobby that checks the device, with the rules to accept.
  - A runner with sections, a question map, "flag for review", a review page before handing in, autosave that survives a lost connection, and the server's clock.
  - Full proctoring with a live monitor for the teacher.
- **Coding questions.** C, C++, Java and Python on Judge0, with public and hidden test cases and a limit on runs.
- **Results worth reading.**
  - Release rules: at once, after the window closes, or by hand; with or without answers and explanations.
  - Breakdowns by section and by CO; rank, percentile and a leaderboard.
  - Item analysis and a score histogram.
  - Scorecards, certificates and per-attempt PDF reports; Excel exports.

## Decisions (Aniket, 18 Oct 2026)

1. **Who opens a link (TP-01):** chosen per link. The audience is either "this class" (LMS users who sign in) or "guests" (outside people who register with name, email and an optional access code and confirm a code sent to their email).
2. **Scope pulled forward:** full proctoring and coding questions (from M05), a question bank with random papers, and AI helpers (from M09). AI drafts and suggests; a person always confirms; AI never writes a mark (AGENTS law 7).
3. **Results:** rich results and analytics, leaderboard and rank, certificates and scorecards, Excel and PDF exports.
4. **Delivery:** a phased milestone on branch `m04-assessments`. First the plan and the mock-ups (Aniket picks), then phases A–E, each database → server → screens → tests, each committed locally.

These change 01 §4 (Aniket's change, recorded in the same commit as the first code that needs it):
- A question bank shared across terms is now in scope.
- Excel and PDF exports of test results are now in scope.
- Certificates are in scope, but only for tests (SKL-05 course certificates stay out).
- AI drafting of questions and suggested grades is in scope, with a person confirming.
- AI "cheating" verdicts (face detection) stay out (Q-09).

5. **Mock-up picks** (round 2, 18 Oct 2026):
   - **Guest landing:** the LMS's own sign-in layout. `/t/<token>` lives in the `(auth)` route group: the form and the test's facts in the left column, the photo panel on the right.
   - **Lobby:** "B · Two columns": the device check on the left; the test, rules, countdown and Start on the right.
   - **Runner:** "A · One question at a time": sections as tabs, Previous / Save and next, the question map on the right.
   - **Everything else as shown**, and the three proposals below are accepted.

Accepted proposals (they were proposals until round 2):
- **Standalone tests (TP-02).** An assessment's `offeringId` becomes optional. A test without one belongs to its owners (faculty or admin). Its marks never feed CE or attainment.
- **Guests are `candidate` accounts (TP-03).** A new role with no password. They sign in with a one-time code sent to their email and see only their own tests and results. Guest accounts are kept, as records of the attempt, like any submission (05 §8).
- **Papers (TP-05).** An attempt keeps a copy of the questions it was given (its "paper"). Editing the bank later never changes an attempt that has started, and grading always reads the paper.

## Owner requests (added to 01 §7)

| ID | Request |
|---|---|
| TP-01 | Share links per test: audience class or guests; an access code, opening and expiry, a use limit, allowed email domains; copy, QR code and email invitations |
| TP-02 | Standalone tests outside a course, owned by staff, on a Tests page |
| TP-03 | Guest (candidate) registration through a link with an email one-time code |
| TP-04 | A lobby: the window and countdown, the rules to accept, and a device check (camera, microphone, browser, connection) |
| TP-05 | A question bank per course and per owner, with tags (CO, Bloom, difficulty, topic), import from CSV and from the M04 questions; random papers drawn by rules (count, difficulty mix, CO, topic) |
| TP-06 | Sections with their own time and order rules ("no going back"); more question types: true/false, fill in the blank, matching, ordering, passages with questions under them; pictures in questions and options; negative marking and partial credit; explanations |
| TP-07 | The runner: a question map, flag for review, a review page, time per question, font size and contrast, autosave kept in the browser while offline, extra time per student |
| TP-08 | Proctoring: full screen, tab and window switches, copy, paste, right-click, print and devtools, a second device or tab, connection gaps, webcam snapshots, a watermark; soft and hard violations; ending after N hard ones; an optional penalty per hard violation (a pure rule, shown and waivable by the teacher); a live monitor to extend time, end an attempt or message a student |
| TP-09 | Coding questions on Judge0: languages, starters, public and hidden cases, run limits, marks by weighted cases |
| TP-10 | AI helpers: draft questions, keys and explanations from a topic and COs; suggest a mark band for written and code answers; a person confirms |
| TP-11 | Results and analytics: release rules; answers and explanations; breakdowns by section and CO; recommendation bands (recruitment); rank, percentile and an optional leaderboard; item analysis (difficulty, discrimination, distractors); a score histogram; a similarity flag between hand-ins |
| TP-12 | Scorecards, certificates and per-attempt PDF reports (worker-generated, emailed or downloaded); Excel exports of results |

## Phases

Each phase runs database → server → screens → tests, and ends in a commit and a PROGRESS entry.

| Phase | Builds | Main pieces |
|---|---|---|
| T0 | Plan and mock-ups | This file; one round of 20 mock-ups at 1440 px and 4 at 390 px; Aniket's picks (decision 5) |
| A · Access | TP-01–TP-04 | `testLinks`, `testGrants`, `otps`, the `candidate` role and its sign-in; standalone tests and the Tests page; access decided from the assessment (course or owners); `/t/<token>`; the lobby |
| B · Build | TP-05, TP-06, TP-07 | `questionBank` with import, sections and draw rules; papers frozen per attempt; new question types and their grading rules (07 §14, with vectors); negative marking and partial credit; the runner v2 |
| C · Integrity | TP-08 | The proctoring rules (`lib/domain/proctoring.ts`, 07 §15 extended), heartbeat and session lock, snapshots, the watermark, violations and penalty, the live monitor |
| D · Code | TP-09 | `lib/integrations/code-runner.ts` (Judge0), `CodeEditor`, `runCode`, the `gradeCode` job, the code-run rate limits (09 §4) |
| E · Results | TP-10–TP-12 | Release rules, breakdowns, rank and leaderboard, item analysis, similarity, the AI helpers (`lib/integrations/ai.ts`), scorecard, certificate and report PDFs in the worker, Excel exports |

## Open questions

| ID | Question | Default until answered |
|---|---|---|
| Judge0 | Which Judge0 server and token should coding questions use (the recruitment portal's)? | Answered 18 Oct 2026 (Aniket): Judge0's free public server for now; the university's own server and key before going public (Q-55) |
| AI key | An OpenAI API key for the AI helpers (OpenAI since 18 Oct 2026)? | The helpers say "AI suggestions are not set up" |
| Certificates | The certificate's design, signatory and wording? | A clean design with the university lockup and the test owner's name |
| Guests | How long are guest accounts and their attempts kept? | Kept, like any submission (05 §8) |
