# 02 · Architecture

## 1. System overview

```
                     Browser (desktop / mobile)
        ┌──────────────────────────┬─────────────────────────────┐
        │ HTML + RSC (pages)       │ presigned PUT/GET (files)   │ WebRTC (live class)
        ▼                          ▼                             ▼
 ┌───────────────┐          ┌──────────────┐             ┌────────────────┐
 │ web: Next.js  │◄────────►│ S3-compatible│             │ Live engine    │
 │ (N instances) │ presign  │ object store │             │ (LiveKit ref.) │
 │ pages, server │          └──────────────┘             └───────┬────────┘
 │ actions, API  │◄──────── webhooks (live, GitHub) ──────────────┘
 └──┬───┬───┬────┘
    │   │   │ enqueue jobs                          ┌─────────────────────┐
    │   │   └──────────────► Redis (BullMQ) ◄──────►│ worker (M instances)│
    │   │                                           │ mail, sync, compute │
    │   ▼                                           └──┬───┬───┬───┬──────┘
    │  MongoDB replica set ◄──────────────────────────┘   │   │   │
    │                                                      │   │   └► SMTP
    └► Code runner (Judge0 ref.) ◄─ run code (sync)        │   └────► GitHub API
                                                           └────────► Exam system (CSV now, API later)
    web + worker ──► Anthropic API (suggestions only)
```

## 2. Processes and services

| Process | What runs there | Scales by | State |
|---|---|---|---|
| **web** | Next.js 16.4 (`next start`, standalone output): pages, Server Actions, Route Handlers, `proxy.ts` | Instances behind a load balancer | None (stateless; session in a sealed cookie) |
| **worker** | `worker/index.ts` via `tsx`: BullMQ processors and schedulers | Instances × per-queue concurrency | None |
| MongoDB 8.0 | All application data | 3-node replica set in production | Durable |
| Redis 8.6 | BullMQ queues; rate-limit counters | Single primary with AOF (queues are not a cache — `noeviction`) | Durable enough for queues |
| Object storage — **Cloudflare R2** in production (any S3-compatible store works; RustFS locally) | Lecture videos (original + 480p data-saver copy), documents, submission files, proctoring snapshots | Provider-managed; **zero egress fees** | Durable |
| Live engine — **LiveKit, self-hosted** (open source) | Real-time audio/video class rooms in the browser | Add nodes; each room lives on one node | Ephemeral |
| Code runner | Sandboxed compile/run of student code | Its own workers | Ephemeral |
| SMTP relay | Outbound email | Provider | — |

Nothing else. No microservices, no separate API server, no websocket server of our own. The live engine and code runner are separate systems we integrate with, not services we write.

## 3. Repository layout

Paths are exact. Do not create folders not listed here without updating this section.

```
.
├── AGENTS.md · CLAUDE.md · README.md
├── app/
│   ├── layout.tsx                      root <html>, Inter, globals.css
│   ├── globals.css                     shadcn design tokens (08 §4)
│   ├── page.tsx                        redirect('/home')
│   ├── not-found.tsx
│   ├── (auth)/                         public pages, no app shell
│   │   ├── actions.ts                  login, logout, forgot, reset
│   │   ├── login/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (room)/                         authenticated, no app shell (M03b)
│   │   └── courses/[offeringId]/live/[sessionId]/room/page.tsx   a live class filling its own tab
│   ├── (app)/                          authenticated, shared shell
│   │   ├── layout.tsx                  shell; user menu inside <Suspense>
│   │   ├── loading.tsx                 Suspense boundary for every page below
│   │   ├── error.tsx
│   │   ├── home/page.tsx               role-aware landing
│   │   ├── courses/…                   offering workspace (08 §2)
│   │   ├── results/…                   student grade sheet
│   │   ├── profile/…                   password, GitHub link
│   │   ├── reports/…                   HoD/admin dashboards
│   │   └── admin/…                     administration (support users get /admin/users only)
│   └── api/                            external callers only (06 §3)
│       ├── health/route.ts
│       ├── beacon/route.ts
│       ├── files/[...key]/route.ts
│       ├── webhooks/live/route.ts
│       ├── webhooks/github/route.ts
│       ├── auth/github/callback/route.ts
│       └── exports/internal-marks/route.ts
├── components/                         app components — inventory only (08 §5.2)
│   └── ui/                             vendored shadcn/ui primitives, added on first use (08 §5.1)
├── hooks/use-mobile.ts                 shadcn sidebar's viewport hook
├── components.json                     shadcn configuration (style new-york-v4, aliases)
├── lib/
│   ├── env.ts                          lazy, validated environment
│   ├── db.ts                           Mongo connection (cached on globalThis)
│   ├── log.ts                          JSON-line logger
│   ├── errors.ts                       AppError, ErrorCode, ActionResult
│   ├── action.ts                       the Server Action wrapper
│   ├── audit.ts                        writeAudit()
│   ├── queue.ts                        queue handles + job types
│   ├── rate-limit.ts                   Redis fixed-window limiter
│   ├── format.ts                       labels (ROLE_LABEL) and Intl date/number formatting (IST)
│   ├── cn.ts                           cn(): clsx + tailwind-merge for shadcn classes
│   ├── auth/                           session.ts · password.ts · access.ts
│   ├── schemas/                        Zod only — shared by browser, web and worker
│   ├── models/                         one Mongoose model per collection
│   ├── domain/                         pure functions + co-located *.test.ts
│   ├── data/                           DAL: reads, access checks, shared writes
│   └── integrations/                   one file per external system (06 §4)
│       storage.ts · mail.ts · live.ts · code-runner.ts · github.ts · ai.ts (exam-api.ts when Q-04 is answered)
├── worker/
│   ├── index.ts                        registers processors and schedulers
│   └── jobs/                           one file per queue
├── scripts/                            seed.ts · create-admin.ts · sync-indexes.ts · s3-setup.ts
├── tests/
│   ├── setup.ts · server-only.ts · factories.ts
│   ├── integration/                    DAL, actions, jobs against MongoDB
│   └── e2e/                            Playwright flows
├── proxy.ts                            optimistic auth redirect
├── compose.yaml · Dockerfile · .env.example
├── next.config.ts · vitest.config.ts · playwright.config.ts · eslint.config.mjs · tsconfig.json
└── .github/workflows/ci.yml
```

### 3.1 Where code goes — decision table

| You are writing… | It goes in… |
|---|---|
| A Zod schema used by a form and its action | `lib/schemas/<area>.ts` |
| A formula (marks, attainment, engagement, ranges, metrics) | `lib/domain/<area>.ts` + `<area>.test.ts` |
| A read for a page | `lib/data/<area>.ts`, exported, calls `requireViewer()` and the access check |
| A write used only by one action | inside that action in `app/**/actions.ts` |
| A write used by an action **and** a job (or two actions in different routes) | `lib/data/<area>.ts`, exported |
| A Server Action | `actions.ts` in the closest route segment containing all its callers |
| A Server Action that a shared component calls (M03b) | `actions.ts` of the route that owns the record: `CourseOutcomes` and `CourseSyllabus` call `app/(app)/catalog/actions.ts` from the catalogue page and from the course workspace alike |
| Talking to an external system | `lib/integrations/<system>.ts` |
| Background work | `worker/jobs/<queue>.ts`, enqueued via `lib/queue.ts` |
| UI used by one route | inline in that route's `page.tsx` (a local function component in the same file is fine) |
| UI used by two or more routes | `components/` — only if it is in the inventory (08 §5) |

## 4. Request flows

### 4.1 Page render
1. `proxy.ts` — if the session cookie is absent on an app route, redirect to `/login`. (Optimistic only; never the real check.)
2. `app/(app)/layout.tsx` renders the static shell; the user menu reads the session inside its own `<Suspense>`.
3. `app/(app)/loading.tsx` is the Suspense boundary for the page. The page awaits `params` / `searchParams`, validates them with Zod, and calls DAL functions.
4. Each DAL function calls `requireViewer()` (memoized per request with React `cache()`), then the record-level access check (`lib/auth/access.ts`), then queries with `.lean()` and maps to a plain DTO (string ids).

### 4.2 Mutation (Server Action)
1. A form posts to an action created with `action({ input, roles }, run)` (`lib/action.ts`).
2. The wrapper: reads the viewer → checks role → parses input with Zod → runs → maps `AppError` to `ActionResult` → logs unknown errors with an `errorId`.
3. `run` performs the record-level access check, writes, writes the audit entry where required (09 §6), enqueues jobs, calls `updateTag()` for any cached tag it invalidates, and calls `refresh()` so the current page re-renders.
4. The client `ActionForm` shows `message` / `fieldErrors` or the success message.

### 4.3 File upload
1. Client calls the `createUpload` action with `{ purpose, fileName, contentType, size, context }`.
2. The action authorizes the purpose for that context, validates type and size against 09 §5, builds the object key (`<purpose>/<contextId>/<userId>/<uuid>.<ext>`), and returns a presigned PUT URL (5-minute expiry).
3. Browser PUTs the file directly to object storage, then submits the form with the returned `key`.
4. The consuming action re-validates that the key's prefix matches the purpose, context and viewer before storing it.
5. Downloads go through `GET /api/files/<key>`: authorize → 302 to a presigned GET (10-minute expiry). File bytes never pass through Next.js.

### 4.4 Engagement beacon
`navigator.sendBeacon('/api/beacon', json)` from the video player (watched ranges) and live room (focus time). The handler verifies the session, validates with Zod, applies the anti-inflation rule (07 §9), and updates `lessonProgress` / `engagementDaily` with single upserts. It never blocks rendering and returns `204`.

### 4.5 Webhook
`/api/webhooks/<system>` reads the raw body, verifies the signature through the adapter, converts to a normalized event, and either applies a small idempotent upsert or enqueues a job. It returns `200` quickly; work over ~200 ms goes to the worker.

### 4.6 Background job
Producer: `await mailQueue().add(name, payload, { jobId })` with a deterministic `jobId` so duplicates are no-ops. Consumer: `worker/jobs/<queue>.ts` validates the payload with its Zod schema, does idempotent work (upserts, "set" not "increment" unless the key is unique per event), and logs completion. Retries: exponential backoff, 5 attempts; failures stay in the failed set for the admin integrations page.

## 5. Rendering and caching model (Next.js 16.4, Cache Components on)

`next.config.ts` already sets `cacheComponents: true` and `partialPrefetching: true`. Consequences you must design for (verified with a production build of the canonical patterns):

1. **Any read of `cookies()`, `headers()`, `params`, `searchParams` or `connection()` must sit under a `<Suspense>` boundary** or the build fails. The boundary has to be inside the segment that changes: `app/(app)/loading.tsx` wraps the layout's children, so it sits above a navigation between `/home` and `/profile` and does not count. A page that reads the session puts that read in a child wrapped in its own `<Suspense>`. Layouts must not `await` the session at top level.
2. **Environment variables are read lazily.** `env()` parses `process.env` on first call. Never read `env()` (or open a DB/Redis connection) at module top level: modules are evaluated during `next build`, where production secrets are absent.
3. **Default: no `use cache`.** MongoDB with the right index is fast, and in-memory caches on several web instances drift apart after a mutation. `use cache` is allowed only on the functions listed here, each with `cacheLife` and `cacheTag`:

   | Function (in `lib/data/`) | Directive | `cacheLife` | Tag | Invalidated by |
   |---|---|---|---|---|
   | `getSettings(key)` inner reader | `'use cache'` | `'minutes'` | `settings:<key>` | `updateTag` in the settings action |
   | `listProgramsForSelect()` / `listCurriculumForSelect(programId)` inner readers | `'use cache'` | `'minutes'` | `catalog` | `updateTag('catalog')` in the catalogue, programme and course-list actions (the courseware worker cannot, so its new courses appear within the window) |

   Cached functions take ids, never the viewer, and are not exported directly — an exported wrapper does the access check first (pattern in 04 §6.4). Other instances see a change within the profile's revalidate window (1 minute for `'minutes'`); this is acceptable only for the reference data above.
4. **After a mutation** the action calls `refresh()` from `next/cache` (unless it redirects). If it changed cached reference data it also calls `updateTag(tag)`.
5. **`'use cache: private'` is not used.** The viewer is memoized per request with React `cache()`, which works identically in pages, actions and route handlers.
6. **Errors:** unknown record or no access → `notFound()` (never reveal existence). No session → `redirect('/login')`. Role mismatch on a page → `redirect('/home')`. Do not use the experimental `forbidden()`/`unauthorized()` APIs.

## 6. Authentication and session

- **Login:** email + password. Passwords hashed with argon2id via `@node-rs/argon2` (library defaults). Login is rate-limited (09 §4).
- **Session:** `iron-session` v9 sealed, encrypted, `httpOnly`, `sameSite=lax` cookie `lms_session` holding only `{ uid, sv }` (user id, session version). TTL 12 hours.
- **Every request** re-reads the user (`_id`, `name`, `roles`, `status`, `sessionVersion`). The session is valid only if `status === 'active'` and `sessionVersion === sv`. Incrementing `sessionVersion` signs the user out everywhere (password change, admin "sign out all", disable).
- **Invitations and resets:** no token collection. A token is `sealData({ uid, sv, purpose }, { ttl })` (reset: 30 min; invitation: 7 days). It is accepted only if the user's current `sessionVersion` equals `sv`; setting the password increments `sessionVersion`, which makes the token single-use.
- **Bulk-imported users** have no password until they accept the invitation email.
- **`proxy.ts`** only redirects requests without the cookie. It is not a security boundary.

## 7. Authorization model (summary; full rules in 09)

Two checks, always both:
1. **Role check** — in `action({ roles })` for writes and `requireViewer(roles)` for pages.
2. **Record check** — `lib/auth/access.ts`:
   - `offeringAccess(viewer, offeringId)` → `'teach' | 'learn' | 'oversee'` or `notFound()`.
     - `oversee`: admin; or hod whose `departmentId` equals the offering's course department.
     - `teach`: viewer id ∈ `offering.facultyIds`.
     - `learn`: an active enrollment exists.
   - Writes that change teaching data require `'teach'` (or admin `'oversee'`); HoD oversight is read-only.
   - Student-owned records (submissions, progress, records) are always filtered by `studentId = viewer.id` when access is `'learn'`.

## 8. Background jobs

| Queue | Job names | Concurrency / instance | Producers |
|---|---|---|---|
| `mail` | `send`, `fanout` | 10 | auth, announcements, notifications |
| `compute` | `internalMarks`, `attainment`, `finalizeLiveSession`, `liveSweep` (M03), `assessmentSweep`, `gradeCode`, `testStats`, `makeTestFile`, `draftQuestions` (M04b), `engagementSnapshot`, `proctorRetention` | 4 | actions, schedulers, webhooks |
| `sync` | `coursewareList`, `coursewarePage` (M01b), `githubProject`, `examPull`, `examPush` | 2, and at most one job a second (CUTM's courseware server answers a page in under a second to 60 s and stopped answering when read faster; a full import takes from about 25 minutes to hours) | actions, schedulers, webhooks |
| `media` | `transcodeLesson` | 1 (CPU-bound; scale by adding worker instances) | lesson upload |

Schedulers (registered by `worker/index.ts` with `upsertJobScheduler`, timezone `Asia/Kolkata`):

| Scheduler id | Pattern | Job |
|---|---|---|
| `github-nightly` | `30 1 * * *` | enqueue `sync/githubProject` for every active GitHub project |
| `internal-marks-nightly` | `0 2 * * *` | enqueue `compute/internalMarks` for every active UGC offering (safety net) |
| `liveSweep` (M03) | `5 * * * *` | `compute/liveSweep`: end live sessions still open 30 min after their scheduled end and finalize ended sessions left unfinalized (M03) |
| `assessmentSweep` (M04; BullMQ names a scheduler after its job) | `0 * * * *` | `compute/assessmentSweep`: 24 h reminders + auto-submit expired attempts (M04) + publish the results of tests whose rule says so (M04b) |
| `engagement-nightly` | `30 2 * * *` | `compute/engagementSnapshot` per active offering (M10) |
| `proctorRetention` (M04b) | `30 3 * * *` | `compute/proctorRetention`: deletes camera snapshots `snapshotRetentionDays` after a test's results (05 §8) |

Rules:
- Every job payload has a Zod schema in `lib/schemas/jobs.ts`; the processor parses it first.
- Every job is idempotent and has a deterministic `jobId` (06 §6).
- Each `Queue`, `Worker` and `QueueEvents` instance gets **its own** Redis connection (sharing one with a `Worker` blocks — observed during verification).
- `maxRetriesPerRequest: null` on every BullMQ Redis connection.
- The worker handles `SIGTERM` by closing workers, then the Mongo connection, then exiting.

## 9. Integrations

Each external system sits behind one file in `lib/integrations/` exposing a typed interface (signatures in 06 §4). Only that file imports the vendor SDK or calls the vendor URL.

| System | File | Reference implementation | Status |
|---|---|---|---|
| Object storage | `storage.ts` | `@aws-sdk/client-s3` + presigner; Cloudflare R2 in production (ADR-19) | M02 |
| Email | `mail.ts` | `nodemailer` SMTP | M00 |
| Live classes | `live.ts` | LiveKit server SDK + React components, self-hosted LiveKit server (ADR-18) | M03 |
| Code runner | `code-runner.ts` | Judge0 CE 1.13.1 HTTP API (Judge0's free public server, 1.14.0, until the university runs its own — **Q-55**) | M04b (from M05) — same caveat (**Q-25**) |
| GitHub | `github.ts` | `octokit` App (installation token) + OAuth (identity link) | M07 |
| Exam system | `exam-api.ts` | — | **Blocked on Q-04**. CSV import/export ships in M08 without an adapter |
| AI | `ai.ts` | `@anthropic-ai/sdk`, model `claude-opus-5-5`, structured output | M04b (bank drafts), M09 |
| CUTM courseware | `courseware.ts` | `fetch` + `happy-dom` (scripts off); read only | M01b |

## 10. Conventions

- **Time:** store `Date` (UTC). Display with `lib/format.ts` in `Asia/Kolkata`. A "day" for engagement counters is the IST calendar date string `YYYY-MM-DD` (07 §11). Domain functions never call `Date.now()`; callers pass `now`.
- **Numbers:** marks are JavaScript numbers. Rounding happens only where 07 says, using `roundHalfUp(x, decimals)` from `lib/domain/round.ts`. Never `toFixed` for anything stored or compared.
- **IDs:** MongoDB `ObjectId` in the database; 24-hex strings everywhere else (DTOs, URLs, forms, job payloads).
- **Text:** English only. User-facing error messages come from `AppError` messages written for a student or teacher, never from a raw exception or vendor response.
- **Packages:** the project is ESM (`"type": "module"`).

## 11. Capacity targets (assumption A-03 — confirm with Q-11)

| Dimension | Design target |
|---|---|
| Students / faculty | 30,000 / 1,500 |
| Concurrent signed-in users | 3,000 |
| Peak web throughput | 300 requests/s sustained, p95 page render < 800 ms |
| Concurrent live classes | 40 rooms × up to 200 participants |
| Concurrent proctored lab-test takers | 600, each limited to one code run per 3 s |
| Enrollments per offering | up to 400 |
| Video storage growth | ~5 TB / year (served via CDN) |

How the design meets them: stateless web instances; every query indexed and paginated; no file bytes through Next; fan-out work (emails to a class, recomputing a class's marks, syncs) in the worker; engagement written as per-day counters (one upsert per event) rather than raw event rows; live media and code execution handled by their own horizontally scalable systems.

## 12. Decision log

| # | Decision | Why | Alternatives rejected |
|---|---|---|---|
| ADR-01 | One Next.js app + one worker process, one repo | Least moving parts that still keep long work out of requests | Microservices, separate REST API |
| ADR-02 | MongoDB replica set via Mongoose 9 | Client requirement (MongoDB); schemas, indexes and transactions with little code | Native driver (more boilerplate), Prisma (weaker Mongo support) |
| ADR-03 | iron-session sealed cookie + argon2id; no auth framework | Small, stable, documented in the bundled Next docs; no session store | Auth.js, Better Auth (more surface, faster-moving APIs) |
| ADR-04 | Server Actions for all UI mutations; Route Handlers only for external callers | No hand-written fetch layer; typed end to end | Internal REST/tRPC |
| ADR-05 | Server Components read through the DAL directly | No internal API for our own UI | Client-side data fetching libraries |
| ADR-06 | Zod 4 schemas in `lib/schemas`, shared by form, action and worker | One validation source | Duplicated validators |
| ADR-07 | S3-compatible storage with presigned URLs | Scales; keeps bytes off web instances; vendor-neutral | Storing files in MongoDB/GridFS |
| ADR-08 | BullMQ 6 on Redis for jobs and schedules | Reliable retries, idempotent job ids, cron with time zones | Cron in the web process, MongoDB-polling queues |
| ADR-09 | Adapters for live, code runner, GitHub, mail, storage, AI, exam API | Engines may be swapped (Q-25, Q-04) without touching features | Vendor calls inside features |
| ADR-10 | Tailwind CSS 4 + native HTML; no UI kit, no chart library | Least code and JS; works on low bandwidth | Component libraries, chart libraries |
| ADR-11 | Tiptap 3 for rich text, stored as JSON, rendered server-side with `@tiptap/html/server` | Server render escapes text, drops `javascript:` links and rejects unknown nodes (verified) | Storing HTML, Markdown editors |
| ADR-12 | CodeMirror 6 for code editing | Much lighter than Monaco on low bandwidth | Monaco |
| ADR-13 | All marks/attainment/engagement math as pure functions with doc-defined test vectors | Auditable and testable | Logic inside actions or aggregation pipelines |
| ADR-14 | One unified Assessment model for every gradable activity | One builder, one attempt flow, one grading flow, one CO pipeline | One model per mode |
| ADR-15 | Cache Components on; `use cache` only for listed reference data | Required by the repo config; avoids cross-instance staleness on marks | Caching user data |
| ADR-16 | Engagement score is deterministic; AI only explains and suggests | Explainable to students and auditors; AI never touches records | AI-generated scores |
| ADR-17 | English UI; IST display; UTC storage | Scope; single university in India | i18n framework |
| ADR-18 | Live classes on **self-hosted LiveKit** (open source WebRTC SFU) | Cheapest at scale (no per-minute fees — cost is servers + bandwidth); teachers and students need only a browser (no OBS/RTMP); two-way audio for questions; signed join/leave webhooks give automatic attendance; scales by adding nodes (one room per node, so a class of 200 fits easily); verified end to end on v1.13.9. The same code works against LiveKit Cloud if the university prefers not to run servers (env change only) | **Mux Live** (and similar per-minute streaming APIs): billed per minute encoded *and* per viewer-minute delivered, so cost grows with every student; RTMP/SRT ingest only — Mux's FAQ states direct WebRTC/browser ingest is not supported — so every teacher would need OBS; one-way broadcast (students cannot speak); no participant presence for attendance |
| ADR-19 | Recorded lectures as MP4 on **Cloudflare R2** + a worker-generated 480p data-saver copy (`ffmpeg-static`) | R2 charges no egress, so video delivery cost stays near zero as viewing grows; MP4 plays natively in every browser with range requests (no player library); the 480p copy (~0.7 Mbps cap) serves phones on mobile data (NFR-07); no vendor lock-in (S3 API) | **Mux Video / Cloudflare Stream**: easiest adaptive streaming, but delivery is billed per minute watched — at university scale (tens of millions of viewer-minutes a month) that becomes the largest line item; self-built HLS packaging: more code and per-segment signing |
| ADR-20 | **Catalogue v2 from CUTM's own data** (M01b): one course per code listed by programmes in baskets; T-P-Pj credits decide the features (a credit course gets everything, 0-0-0 is non-credit); fixed outcome codes PO1–PO12, PSO1–PSO3 titled per programme; a coordinator per course; content imported from courseware.cutm.ac.in and the course list from the Course Repository CSV | Matches how CUTM already describes its courses, so most content arrives by import instead of by hand; a course is maintained once, not once per programme; fewer boxes (one dialog per step, a click-to-cycle mapping grid) | M01's per-programme courses with component checkboxes, one dialog per CO and a dropdown per matrix cell (rejected by the product owner as too complex, 15 Oct 2026); asking CUTM IT for an export (Q-37, still worth having) |
| ADR-21 | **The evaluation policy is one Settings form, copied onto each offering** | CUTM's Examination Policy is one rule set for every course (each component out of 100, credit-weighted course percentage); a copy per offering keeps old marks stable when the policy changes | Admin-built evaluation schemes per component combination (145 controls; M01) |
| ADR-22 | **Courseware pages are parsed by an adapter with happy-dom (scripts off) into plain lines and tables, and read by a pure normaliser with fixture tests** | The pages are hand-typed WYSIWYG HTML in many shapes; a DOM gives real rows, cells and line breaks and decodes entities; keeping the interpretation pure makes it testable against real pages, and only the adapter needs fixing if the site's markup changes | Regular expressions over raw HTML (fragile); a headless browser (heavy, runs scripts) |

