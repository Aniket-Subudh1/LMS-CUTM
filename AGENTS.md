<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CUTM LMS · Rules for AI agents

This file is the canonical instruction set for every coding agent (Claude Code, Codex, Cursor, Copilot, Gemini, Jules, or a human). `CLAUDE.md` imports it. If any tool-specific rule file disagrees with this one, this one wins.

This is a university Learning Management System. Its outputs are attendance records, internal marks, grade sheets and accreditation reports. A defect here is not a bad user experience — it is a wrong mark on a student's record.

## Before you write a single line

1. Read `docs/00-START-HERE.md` (reading order, milestone map, definition of done).
2. Read `docs/01-PROJECT-CONTEXT.md` (scope — contractual) and `docs/02-ARCHITECTURE.md`.
3. Read `docs/04-CODING-LAWS.md` in full. It is short on purpose and every law is enforced in review.
4. Read the milestone file you were assigned in `docs/milestones/` and every doc section it links to.
5. Check `docs/PROGRESS.md`: confirm the milestone's prerequisites are marked done and no open question blocks your task.

If you were handed only a milestone file, stop and read the context files first. Building from a task list without the architecture produces exactly the confident, wrong code these documents exist to prevent.

---

## The eight laws that are never bent

### 1 · Never invent scope
Build only requirement IDs listed in the milestone you are working on. **Must** and **Should** items are built. **Could** items are backlog — not built without written approval. **Confirm** items are blocked until the client answers. The out-of-scope list in `docs/01-PROJECT-CONTEXT.md` §4 is contractual. No feature gets built "just in case".

### 2 · Never invent an API
Every library call must match the installed version. Versions are pinned in `docs/03-TECH-STACK.md`. Before using a library API you have not used in this repo, read its types or README in `node_modules/<pkg>/`. For Next.js read `node_modules/next/dist/docs/`. If the docs and your memory disagree, the installed docs win.

### 3 · Write the least code that fully works
The best code is the code not written. Use the platform (HTML forms, Server Components, Server Actions, native `<dialog>`/`<details>`, `Intl`) before a library; use an installed library before writing your own. No speculative abstraction, no wrapper that only forwards, no "utils" file, no barrel `index.ts`. Details and examples: `docs/04-CODING-LAWS.md` §1.

### 4 · A shared component must already be shared
The UI is built from **shadcn/ui** primitives vendored in `components/ui/` at a pinned version (`docs/08-UI-SYSTEM.md` §5.1); a primitive is added only in the commit that first uses it, never restyled per page, and never replaced by a hand-made look-alike. An app component lives in `components/` only if it is in the inventory in `docs/08-UI-SYSTEM.md` §5.2 **and** is used by two or more routes, or it is a required client boundary (`'use client'`) listed there. Everything else is written inline in the page that uses it. Adding to the inventory requires two real call sites in the same commit.

### 5 · Build for 30,000 students from the first line
Every list is paginated (max 100 per page) and backed by a declared index. No unbounded array in a document. No file bytes pass through Next.js — uploads and downloads use presigned URLs. Anything slower than ~1 s or that fans out over many students runs in the worker, not in a request. The web process is stateless. Details: `docs/04-CODING-LAWS.md` §3.

### 6 · Authorize at the data, never at the screen
Every Server Action, Route Handler and DAL function verifies the session and the viewer's right to the specific record. Hiding a button is not authorization. Secrets live only in server environment variables; nothing sensitive is ever `NEXT_PUBLIC_`. Answer keys and hidden test cases never reach the browser. Details: `docs/09-SECURITY.md`.

### 7 · Marks are sacred
- Every calculation that produces a mark, percentage, grade, attendance status or attainment level is a **pure function** in `lib/domain/` with the test vectors from `docs/07-ALGORITHMS.md`.
- AI may **suggest** (CO tags, Bloom levels, explanations). AI never writes a mark, an attendance record, or a grade, and a suggestion is applied only by an explicit human action.
- Every change to a mark, attendance record, scheme, lock or sync is written to the audit log.
- Locked marks are immutable. Unlocking is an admin action with a mandatory reason.

### 8 · Vendors stay behind adapters
Only `lib/integrations/<name>.ts` may import a vendor SDK or call a vendor API (LiveKit, Judge0, GitHub, SMTP, S3, Anthropic, the university exam system). If a vendor quirk forces a change anywhere else, the adapter interface is wrong — **stop and report it** rather than special-casing.

---

## Do not generate filler

This codebase is handed over to another team. Every file must earn its place.

**Never produce:**
- A `TODO`, a `FIXME`, a stub, or a function that returns placeholder data
- A file the milestone did not ask for
- A wrapper that only forwards to another function or component
- A comment restating what the next line does
- A `try/catch` that swallows an error and continues
- An `any`, a non-null `!`, `@ts-ignore`, `@ts-expect-error`, or an `as` cast outside the boundaries listed in `docs/04-CODING-LAWS.md` §4
- A dependency not in `docs/03-TECH-STACK.md` (to add one, record the reason there in the same commit)
- Seed or mock data presented as real output
- A claim of verification you did not perform

**If you cannot complete something, leave it out and say so in your report.** An honest gap is fixable in ten minutes; a plausible-looking stub survives to production.

---

## Build order, always

**Database → backend → frontend.** Within a milestone, follow the task order in the milestone file. It is a dependency order, not a preference. The frontend is written last, against DAL functions and actions that already exist and already pass their tests.

## Layer rules (enforced in review)

| Layer | Path | May import | Must not |
|---|---|---|---|
| Schemas | `lib/schemas/` | `zod` only | anything else |
| Domain (pure) | `lib/domain/` | `lib/schemas` types | I/O, `Date.now()`, `Math.random()`, `process.env` |
| Models | `lib/models/` | `mongoose`, `lib/schemas` | business logic |
| Integrations | `lib/integrations/<name>.ts` | its vendor SDK, `lib/env`, `lib/log` | models, DAL |
| DAL | `lib/data/` | models, domain, integrations, auth | `next/navigation` redirects other than `notFound`/`redirect('/login')` |
| Actions | `app/**/actions.ts` | `lib/action`, DAL, models, domain, queue | rendering |
| Routes/UI | `app/**`, `components/**` | DAL, actions, components | models, integrations, vendor SDKs |
| Worker | `worker/` | models, domain, integrations, DAL internals, `lib/queue` (to enqueue follow-up jobs), `lib/auth/tokens` (invitation links) | `app/`, `components/`, `next/*` |

## Contracts

`docs/06-CONTRACTS.md`, `docs/05-DATA-MODEL.md` and `lib/schemas/` are the shared truth. To change one: edit the Zod schema or model, update the document **in the same commit**, update every caller and test, and note the change in `docs/PROGRESS.md`. The document and the code must never disagree — the next agent reads the document.

## Reporting

Every task ends with an entry in `docs/PROGRESS.md` using its headings: **Created · Not done · Assumptions · Open questions · Verification**. List every file created or changed, every assumption the docs did not specify, and the exact commands you ran with their results. A human then walks the milestone's validation checklist. Your report is a claim; their walkthrough is the verification. Write it to help them, not to look complete.

## Commits

One commit per task. Format:

```
<milestone>(<area>): <what changed>

<why, if not obvious>

Refs: CE-06, CE-07
```

Example:

```
M06(ce): compute internal marks from the bound scheme version

Components aggregate by their configured rule and the total rounds once,
at the end, using the scheme's rounding mode.

Refs: CE-06, CE-07, NFR-04
```

Never commit `.env*`, a secret, `node_modules`, uploaded files, or a test fixture containing real student data.

## When you are unsure

**Ask. Do not guess.** Record the question in the Open questions table in `docs/PROGRESS.md`, tag it `@client` or `@dev`, and continue with the parts that are not blocked. A question raised early costs a message; a wrong assumption discovered during the semester costs marks.
