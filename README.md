# CUTM LMS

Learning Management System for Centurion University of Technology and Management: UGC-aligned degree programs and skill courses — content and live classes, attendance, records and assignments, configurable continuous evaluation, a proctored virtual lab, project tracking (GitHub and a task tracker), CO-PO-PSO attainment, exam-system integration and grade sheets, and engagement dashboards.

**Status:** specification complete; implementation starts at milestone M00. See `docs/PROGRESS.md`.

## Stack

Next.js 16.4 (App Router, Cache Components) · React 19.3 · TypeScript · Tailwind CSS 4 · MongoDB 8 (Mongoose 9) · Redis 8 + BullMQ 6 · S3-compatible storage (Cloudflare R2 in production) · self-hosted LiveKit for live classes · Judge0 CE for the code runner · Vitest 5 · Playwright. Exact versions and reasons: `docs/03-TECH-STACK.md`.

## For AI coding agents and developers

Start with **`AGENTS.md`**, then **`docs/00-START-HERE.md`**. To hand a milestone to any agent, use **`docs/prompts/build-milestone.md`**.

| Doc | Purpose |
|---|---|
| `docs/01-PROJECT-CONTEXT.md` | Scope (contractual) and the full requirement register |
| `docs/02-ARCHITECTURE.md` | Runtimes, folders, request flows, rendering model, decisions |
| `docs/04-CODING-LAWS.md` | Least-code, reuse and scalability laws; verified canonical patterns |
| `docs/05-DATA-MODEL.md` | Every collection, field and index |
| `docs/06-CONTRACTS.md` | Errors, route handlers, adapters, jobs, settings, CSV formats |
| `docs/07-ALGORITHMS.md` | Marks, CE, attainment, grades, engagement — with test vectors |
| `docs/08-UI-SYSTEM.md` | Routes, navigation, CSS classes, the shared component inventory |
| `docs/09-SECURITY.md` | Permissions, scoping, uploads, audit, privacy |
| `docs/10-TESTING-AND-VALIDATION.md` | Test setup, scripts, CI, release gates |
| `docs/11-OPERATIONS.md` | Environment variables, local stack, deploy, backups, cost model, support |
| `docs/milestones/` | M00–M11 build plans with tasks, tests and acceptance criteria |

## Local development

Requires Node.js 24 (≥ 22.13) and Docker.

```bash
npm ci
docker compose up -d            # MongoDB (replica set), Redis, RustFS (S3), Mailpit
cp .env.example .env.local      # set SESSION_PASSWORD: openssl rand -base64 32
npm run db:indexes
npm run dev                     # web on http://localhost:3000
npm run worker:dev              # background jobs (second terminal)
npm run admin:create -- --email you@cutm.ac.in --name "Your Name"   # prints your set-password link
```

Open the printed link (the same invitation arrives in Mailpit) to set your password. `/api/health` reports Mongo and Redis status.

Checks: `npm run check` (lint, types, unit) · `npm run test:integration` · `npm run build && npm run test:e2e` (needs `.env.e2e`, see `docs/10-TESTING-AND-VALIDATION.md` §3).

Mail: http://localhost:8025 · Object storage console (from M02): http://localhost:9001
