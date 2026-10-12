# Prompt: build a milestone

Paste the block below into any coding agent (Claude Code, Codex, Cursor, Copilot agent, Gemini CLI, …) running in this repository. Replace `<MID>` with the milestone id (e.g. `M03`) and, optionally, `<TASKS>` with specific task ids (e.g. `T1–T4`) to split a milestone across sessions.

```text
You are implementing milestone <MID> of the CUTM LMS in this repository.

Before writing code:
1. Read AGENTS.md completely. Its eight laws and the "Do not generate filler" list are binding.
2. Read, in order: docs/00-START-HERE.md, docs/01-PROJECT-CONTEXT.md, docs/02-ARCHITECTURE.md, docs/04-CODING-LAWS.md.
3. Read docs/milestones/<MID>-*.md and every document section it references (03, 05, 06, 07, 08, 09, 10, 11 as linked).
4. Read docs/PROGRESS.md: confirm the milestone's "Depends on" milestones are Done and check the open questions that block this milestone. If a task is blocked, skip it and say so.
5. For Next.js, read the relevant guide in node_modules/next/dist/docs/. For any other package, read its installed README/types before using an API you have not used in this repo. Versions are pinned in docs/03-TECH-STACK.md.

While working:
- Do <TASKS or "all tasks"> in the order written: database → backend → frontend → tests.
- Copy the canonical patterns in docs/04-CODING-LAWS.md §6; do not improvise alternatives.
- Write the least code that fully satisfies the task. No new shared component without two call sites (docs/08-UI-SYSTEM.md §5). No TODOs, stubs, placeholder data, `any`, `!`, or swallowed errors.
- Every formula comes from docs/07-ALGORITHMS.md and gets its vector table as tests.
- Every read is scoped (docs/09-SECURITY.md §3); every write checks role and record access.
- If the docs are ambiguous or wrong, do not guess: add an open question to docs/PROGRESS.md (@dev or @client) and continue with unblocked work.
- After each task run `npm run check` (and `npm run test:integration` where relevant) and commit using the format in AGENTS.md ("<MID>(<area>): …" with "Refs:" requirement ids).

When finished:
- Append a report to docs/PROGRESS.md with: Created · Not done · Assumptions · Open questions · Verification (exact commands and their summary output; manual steps performed and not performed).
- Update the milestone's row in docs/PROGRESS.md §2.
- List the acceptance criteria and state for each whether you executed it and its result.
```

## Splitting large milestones

Milestones M02, M04, M05 and M08 are large. Run them in two or three sessions (`T1–T4`, then `T5–T8`, …). Each session must start by re-reading `AGENTS.md`, the milestone file and the latest `PROGRESS.md` entries.

## Reviewing an agent's work

Paste into a second agent session:

```text
Review the changes on this branch for milestone <MID> against AGENTS.md and docs/04-CODING-LAWS.md §10.
For each acceptance criterion in docs/milestones/<MID>-*.md, say whether the code satisfies it and how you checked.
Flag: any scope beyond the milestone, any unscoped query, any missing index, any shared component without two call sites,
any formula not matching docs/07-ALGORITHMS.md, any secret or answer key that could reach the browser.
Do not modify code; report findings with file:line.
```
