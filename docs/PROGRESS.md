# Progress

The living record of the build. Agents append; humans sign validations. Newest log entries go at the bottom of §5.

## 1. How to write an entry

```
### <date> · <milestone>/<task> · <agent or person>

**Created** — one line per file created or changed
**Not done** — what the task asked for that is not finished, and why
**Assumptions** — anything the docs did not specify that you decided (also add to §4)
**Open questions** — new questions (also add to §3)
**Verification** — exact commands and the summary line each printed; manual steps performed / not performed
```

## 2. Milestone status

| Milestone | Status | Validated by | Notes |
|---|---|---|---|
| M00 Foundation | Done — awaiting human validation | | shadcn/ui adopted at the client's request (entry below) |
| M01 Academic structure & admin | Not started | | |
| M02 Content, plan, announcements, skill progress | Not started | | |
| M03 Live classes & attendance | Not started | | Self-hosted LiveKit (ADR-18) |
| M04 Assessment engine | Not started | | |
| M05 Virtual lab & proctoring | Not started | | Runner identity: Q-25 (b); feature set: Q-09 |
| M06 Continuous evaluation | Not started | | CE-10 specifics: Q-06 |
| M07 Projects | Not started | | Q-22, PRJ-10: Q-03 |
| M08 Exam integration & grade sheet | Not started | | API: Q-04 |
| M09 Attainment & AI tagging | Not started | | Formula sign-off: Q-07 |
| M10 Engagement & dashboards | Not started | | Q-26 |
| M11 Hardening & launch | Not started | | Hosting: Q-12 |

## 3. Open questions

Owner `@client` = Saneev Sir / CUTM; `@dev` = delivery team. "Blocks" names what cannot be finished without the answer; everything else proceeds on the stated default.

| ID | Question | Owner | Default until answered | Blocks | Status |
|---|---|---|---|---|---|
| Q-01 | The call mentioned three course types; only UGC-aligned and skill were described. What is the third? | @client | Not built | — | Open |
| Q-02 | Skill courses "just like UDP": which program or platform is meant? | @client | Existing LMS feature set (SKL-03) | — | Open |
| Q-03 | Project reviews through Google Meet (07:19) or the in-house live class, given "no Meet API"? | @client | In-house live class | PRJ-10 | Open |
| Q-04 | Exam-system API: provider, documentation, authentication, data format, pull/push frequency | @client | CSV import/export | M08 API adapter | Open |
| Q-05 | Is the internal maximum always 50? Default component weights per subject type? | @client | Admin enters schemes | — | Open |
| Q-06 | Exact workflow for "continuous evaluation in mark entry" (CE-10) | @client | M06 marks view | CE-10 specifics | Open |
| Q-07 | Attainment formula: target %, level thresholds, CIE:SEE weights, direct/indirect, NBA format? | @client | 07 §4 defaults (60 %; 70/60/50; 0.5/0.5; direct only) | M09 sign-off | Open |
| Q-08 | Are PSOs the same for all programs or program-specific? | @client | Editable per program (defaults: Higher education, Entrepreneurship, Placement) | — | Open |
| Q-09 | Which proctoring features (webcam, screen, tab switch, AI flags)? | @client | Full-screen, tab-switch, paste block, optional webcam snapshots; no AI flags | — | Open |
| Q-10 | Languages and lab types beyond C, C++, Java? | @client | C, C++, Java only | LAB-06 | Open |
| Q-11 | Expected scale: students, faculty, programs, concurrent live-class users | @client | 02 §11 targets (A-03) | M11 sizing | Open |
| Q-12 | Hosting (university servers or vendor cloud) and data-residency requirements | @client | Docker on Linux; any S3 | M11 deploy | Open |
| Q-13 | SSO with university systems (ERP, email)? Mobile app? | @client | Email + password; responsive web | — | Open |
| Q-14 | Support person: hours, channels (phone, chat, email), SLA | @client | 11 §8 proposal | — | Open |
| Q-15 | Target go-live date; which semester/batch first | @client | R1 pilot after M04 | Release plan | Open |
| Q-16 | Format and deadline of the D2L review report | @client | — (not code) | — | Open |
| Q-17 | Lesson completion threshold (90 %) and live-attendance threshold (75 %) | @client | 90 % / 75 % | — | Open |
| Q-18 | Internal-marks rounding: integer or decimals; half-up or ceiling? | @client | Per scheme; seed 0 dp half-up | — | Open |
| Q-19 | Grading scale, grade points and pass rules (e.g. minimum end-sem %) | @client | UGC CBCS letters (06 §7); no separate pass rule | Grade-sheet sign-off | Open |
| Q-20 | A course shared by several programs: acceptable to create it once per program (A-12)? | @client | One course per program | — | Open |
| Q-21 | Should the LMS grade sheet show SGPA, or grades only? | @client | Show SGPA | — | Open |
| Q-22 | Does CUTM have a GitHub organization for student repos; private repos allowed? | @client | GitHub App installed on a CUTM org; private repos supported | M07 setup | Open |
| Q-23 | Are excused absences (medical leave) from assessments needed? | @client | No; missed = 0 (A-14) | — | Open |
| Q-24 | Retention period for proctoring snapshots | @client | 90 days after results (A-13) | — | Open |
| Q-25 | (a) Live engine — **decided by dev 12 Oct 2026: self-hosted LiveKit** (ADR-18); confirm with the client that this satisfies LIV-02 "reuse the previous solution". (b) The recruitment platform's compiler service: technology and repository access | @dev (Aniket) | (a) LiveKit; (b) Judge0 CE reference adapter | M05 adapter choice | (a) Decided · (b) Open |
| Q-26 | What must "AI" in engagement tracking mean? Is a deterministic score plus an AI-written explanation acceptable? | @client | Yes (ADR-16) | — | Open |
| Q-27 | Who edits CO-PO-PSO matrices: admin only, or faculty with HoD approval? | @client | Admin only | — | Open |
| Q-28 | Login identifier: email or roll number? University email domain? | @client | Email | — | Open |
| Q-29 | Should students see their own engagement score? | @client | No (DSH-01 audience is faculty/admin) | — | Open |
| Q-30 | Should late submissions carry an automatic penalty? | @client | No; flagged only (A-11) | — | Open |
| Q-31 | Email sender address/domain and SMTP provider (SPF/DKIM) | @client | `MAIL_FROM` from env | M11 | Open |
| Q-32 | CUTM brand colours and logo | @client | Navy primary, gold accent, navy sidebar (shadcn tokens in `app/globals.css`); graduation-cap icon as the logo | — | Open |
| Q-33 | Do lab machines reach the LMS through one public IP (campus NAT)? The login limit is 30 failed attempts per IP per 15 min (successes do not count) | @client / @dev | Per-IP limit as specified; revisit with the campus network map | M11 load test | Open |
| Q-34 | Login and forgot-password take measurably longer for a registered email (argon2 runs only then), which allows email enumeration by timing. Add a dummy-hash verify for unknown emails? | @dev | Not built (the messages are already identical) | M11 hardening | Open |

## 4. Assumptions register

| ID | Assumption | Where it matters | Confirm via |
|---|---|---|---|
| A-01 | UI is English only | all | — |
| A-02 | Times are shown in IST; stored in UTC | all | — |
| A-03 | Capacity targets in 02 §11 | sizing, load tests | Q-11 |
| A-04 | One university (single tenant) | data model | — |
| A-05 | Integration secrets live in env, not in admin settings (deviation from ADM-04's "credentials") | settings, ops | — |
| A-06 | A user may hold several roles (faculty + hod) | auth | — |
| A-07 | An item tagged with several COs counts in full toward each | attainment | Q-07 |
| A-08 | End-sem attainment applies equally to every CO of the course | attainment | Q-07 |
| A-09 | Live classes use self-hosted LiveKit (now a decision: ADR-18) | M03 | Q-25 (a) |
| A-10 | Judge0 CE is the reference code runner until Q-25 is answered | M05 | Q-25 |
| A-11 | Late submissions are flagged, not penalized automatically | M04, M06 | Q-30 |
| A-12 | A course belongs to exactly one program | data model | Q-20 |
| A-13 | Proctoring snapshots are deleted 90 days after results | M05 | Q-24 |
| A-14 | A missed assessment counts as 0 in CE | M06 | Q-23 |
| A-15 | HoD access is read-only oversight of their department | auth | — |
| A-16 | Skill courses have no CE scheme, CO/PO or grade sheet; attendance = lesson completion | M02, M06, M08 | Q-02 |
| A-17 | Multiple-select questions score all-or-nothing | M04 | — |
| A-18 | Imported users receive an invitation email to set their own password | M00, M01 | Q-28 |
| A-19 | Students do not see engagement scores | M10 | Q-29 |
| A-20 | Only assessments with published results count toward CE and attainment | M06, M09 | — |
| A-21 | Production object storage is Cloudflare R2; lecture videos are MP4 with a 480p data-saver copy (ADR-19) | M02, M11 | Q-12 |
| A-22 | Login rate limits count failed attempts only (a success refunds its slot); forgot-password counts every request | M00 | Q-33 |
| A-23 | The UI is shadcn/ui on Tailwind v4 (client request, 12 Oct 2026); light theme only | all UI | — |
| A-24 | The Geist font is self-hosted through `next/font` (downloaded from Google Fonts at build time) | build | Q-12 |
| A-25 | `admin:create` only creates or re-invites; it refuses an email whose account is active or disabled | M00 | — |

## 5. Log

### 2026-10-12 · Docs baseline · Claude (AI agent)

**Created**
- `AGENTS.md` — rewritten as the cross-agent rule set (Next.js managed block kept at the top)
- `CLAUDE.md` — imports `AGENTS.md`
- `README.md` — project overview and doc index
- `docs/00-START-HERE.md` … `docs/11-OPERATIONS.md` — specification
- `docs/milestones/M00-…` … `M11-…` — milestone build plans
- `docs/prompts/build-milestone.md` — prompt template for any agent
- `docs/PROGRESS.md` — this file

**Not done**
- No application code was written; the repository is still the `create-next-app` scaffold. M00 starts the build.
- The Judge0 code runner was not run (it needs a cgroup-v1 Linux host); its API mapping comes from the v1.13.1 source (routes, status enum, config defaults, language ids).
- No live call to the Anthropic API or the GitHub API was made (no credentials in this environment); the SDK call shapes were type-checked only.
- `mongodb-memory-server` could not download `mongod` here (fastdl.mongodb.org blocked by this sandbox's network policy); integration tests ran against a real MongoDB 8.0 replica set via `TEST_MONGODB_URI` instead.
- The shadcn/ui CLI could not reach its registry; the docs specify Tailwind + native HTML instead (ADR-10), which needs no registry.

**Assumptions** — A-01 … A-20 above.

**Open questions** — Q-01 … Q-32 above.

**Verification** (performed in a scratch copy of this repository on Node 22.22.0; none of that prototype code is committed)
- Package versions: `npm view <pkg> version` for every package in 03 §3; Docker Hub tag lookups for every image in 03 §1 (`minio/minio:latest` → 404, hence RustFS).
- `tsc --noEmit` → 0 errors for the canonical patterns in 04 §6 (models, env, db, session, access, DAL, action wrapper, actions, pages, ActionForm, queue, worker, storage adapter, audit, beacon route, rounding). Found and fixed during verification: the `(models.X as Model<T>) ?? model()` union type is not callable under Mongoose 9.
- `next build` (16.4.0, Cache Components + Partial Prefetching) → compiled; `/courses` and `/courses/[offeringId]` partially prerendered; proxy registered. Found: module-level env parsing fails the build without secrets → `env()` made lazy.
- Standalone server (`node .next/standalone/server.js`) with MongoDB 8.0 (rs0), Redis 8.6, RustFS 1.0.1: no cookie → 307 to `/login`; admin session → page renders with `oversee` access and the edit form; stale `sessionVersion` → redirect to `/login`; non-enrolled student → 404; beacon without session → 401. Found: session read during runtime prerender logs "unstable value `Date.now()`" → fixed with `await connection()` in `getViewer` (0 occurrences after).
- Vitest 5.0.4: `unit` 10 tests passed (rounding vectors, action wrapper auth/role/validation/success); `integration` 2 tests passed against the replica set (action writes + 404 on foreign id; transaction commit and rollback). Found: Vitest 5 requires `@types/node` ^22 or ≥ 24.
- BullMQ 6.3.13 + ioredis 6.0.0 on Redis 8.6: enqueue → worker → result; duplicate `jobId` deduped; `upsertJobScheduler` with `tz: 'Asia/Kolkata'` → next run 01:30 IST; invalid payload → failed with the Zod error. Found: a Worker sharing the Queue's connection hangs; custom job ids containing `:` are rejected.
- Worker under `tsx --conditions=react-server` imports `server-only` modules and processes jobs; without the condition it throws (both verified).
- RustFS: bucket create, `PutBucketCors`, presigned PUT 200, presigned GET 200, CORS preflight 200 with the allowed origin.
- LiveKit server v1.13.9 with the config in 11 §3.1: Node participant (`@livekit/rtc-node`) joined with our token grants; webhooks `room_started`, `participant_joined`, `participant_left`, `room_finished` received and verified by `WebhookReceiver`.
- Tiptap 3.31.4 `@tiptap/html/server`: text is HTML-escaped, `javascript:` hrefs are emptied, unknown node types throw.
- Tailwind v4 `@layer components` + `@apply` compile through `@tailwindcss/turbopack`.
- `@anthropic-ai/sdk` 0.133.0: `client.beta.messages.parse` with `betaZodOutputFormat`, `fallbacks: 'default'`, `output_config.effort` → type-checks.
- All worked examples in 07 were computed by script (`roundHalfUp`/`ceilTo` vectors, internal marks, trend slopes, attainment, grades/SGPA, engagement, commit scores, IST conversions).

**Manual steps not performed:** no human has walked any validation checklist yet.

### 2026-10-12 · Decision: live classes and video delivery · Claude (AI agent), at Aniket's request

Request: "look at live streaming — maybe Mux"; then "do whatever is cheap, very highly scalable and easy to use".

**Decision** — ADR-18 (self-hosted LiveKit for live classes) and ADR-19 (Cloudflare R2 MP4 + 480p data-saver copy for recorded lectures). Mux evaluated and not chosen.

**Evidence**
- Mux SDK `@mux/mux-node` 15.5.0 installed and read: live ingest protocols are `rtmp | srt` (`active_ingest_protocol`); Mux's live-streaming FAQ states direct WebRTC/browser ingest is not supported (https://www.mux.com/docs/guides/live-streaming-faqs) → teachers would need OBS. Latency modes `low | reduced | standard`; `max_continuous_duration` default 12 h; live streams auto-record to assets; webhooks `video.live_stream.active/idle/disconnected`, `video.asset.ready`. A Mux adapter and `@mux/mux-player-react` 3.14.0 component were type-checked (tsc 0 errors) so a switch later is low-risk.
- Mux pricing (third-party summaries of mux.com/docs/pricing, conflicting between pages — verify): live encoding ~$0.025–0.032/min (≤720p, first tier); delivery ~$0.00096/min after 100K free minutes. Per-viewer-minute billing scales with every student.
- Cloudflare R2: zero egress; ~$0.015/GB-month; Class A $4.50/M, Class B $0.36/M (third-party summaries — verify on Cloudflare's page).
- LiveKit: verified end to end earlier today (v1.13.9). Official benchmark guide: a room must fit on one node; nodes add rooms; measure with `lk load-test` (https://docs.livekit.io/transport/self-hosting/benchmark/).
- ffmpeg 7.0.2 via `ffmpeg-static` 5.3.0: the data-saver command transcoded a 20 s 1080p test clip to 854×480 H.264 Main/yuv420p in ~2.2 s with `moov` first; without `-pix_fmt yuv420p` the output was High 4:4:4 (unplayable on many phones) — now mandatory in the command.

**Changed docs** — 01 (LIV-02), 02 (services, integrations, ADR-18/19), 03 (infra, `ffmpeg-static`, not-used list), 05 (`lessons.lowKey`, `transcode`), 06 (storage functions, R2 config, `media/transcodeLesson` on its own queue), 08 (`VideoPlayer` toggle), 11 (R2 env, LiveKit production + TURN, cost model, worker image), M02 (T8b), M03 (engine decision), this file (Q-25, A-09, A-21).

**Open** — confirm with the client that self-hosted LiveKit meets LIV-02 (Q-25a); hosting with included bandwidth (Q-12).

### 2026-10-12 · M00 Foundation (T1–T9) · Claude (AI agent), at Aniket's request

Requests: "completely plan m0 and start making it properly"; mid-way, "pull the best UI library and components … everything top notch" and "make sure m0 is completely done".

**Created** (one commit per task: 78daf99 tooling · d849fd1 core · e7be9a7 models · aba60ea auth primitives · bc43bcb mail · 43e5434 auth pages · 097731b shell · 615717e UI system · 8092df6 ops · this commit tests)
- Tooling: `package.json` (exact versions, scripts incl. `worker:e2e`), `next.config.ts` (security headers), `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `playwright.config.ts`, `compose.yaml`, `.env.example`, `.gitignore`, `components.json`, `.github/workflows/ci.yml`
- Core: `lib/env.ts`, `lib/db.ts`, `lib/log.ts`, `lib/errors.ts`, `lib/action.ts` (`action`, `publicAction`), `lib/audit.ts`, `lib/queue.ts`, `lib/rate-limit.ts`, `lib/cn.ts`, `lib/format.ts`
- Auth: `lib/auth/{password,session,tokens}.ts`, `lib/schemas/{common,auth,jobs}.ts`
- Data: `lib/models/{user,audit-log}.ts`, `scripts/sync-indexes.ts`
- Mail: `lib/integrations/mail.ts`, `lib/domain/email-templates.ts`, `worker/index.ts`, `worker/jobs/mail.ts`
- UI: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/not-found.tsx`, `app/(auth)/{actions.ts,layout.tsx,loading.tsx}`, `app/(auth)/{login,forgot-password,reset-password}/page.tsx`, `app/(app)/{layout,loading,error}.tsx`, `app/(app)/home/page.tsx`, `app/(app)/profile/{page.tsx,actions.ts}`, `proxy.ts`, `components/{action-form,app-nav,page-header}.tsx`, `components/ui/{alert,avatar,badge,button,card,dropdown-menu,input,label,separator,sheet,sidebar,skeleton,tooltip}.tsx` (shadcn 4.21.4), `hooks/use-mobile.ts`
- Ops: `app/api/health/route.ts`, `scripts/create-admin.ts`, `scripts/check-bundle.ts`
- Tests: `lib/log.test.ts`, `lib/action.test.ts`, `lib/auth/tokens.test.ts`, `lib/schemas/auth.test.ts`, `lib/domain/email-templates.test.ts`, `tests/setup.ts`, `tests/server-only.ts`, `tests/next-request.ts`, `tests/integration/{auth,profile,mail-worker}.test.ts`, `tests/e2e/auth.spec.ts`
- Removed: the five scaffold SVGs in `public/`
- Docs changed in the same commits as the code: AGENTS (laws 4 and 8), README, 02, 03, 04 (§2, §6.2, §6.4, §6.6, §6.8, §6.9), 05 §1, 06 §6, 07 §16, 08 (§1, §3, §4, §5 rewritten for shadcn), 09 §4, 10 (§2, §3, §4, §5), M00, M01, M06, M07, M09, M10

**Decisions and deviations** (each recorded in the doc it changes)
- Files whose first caller is a later milestone moved there (deletion test): `round.ts` → M04; `time.ts`, `page`/`pageSize` → M01; settings model → M02. Password reset enqueues `mail/send` directly; the `fanout` job arrives with invitations in M01.
- UI system: shadcn/ui replaces the hand-written CSS classes (client request). The registry host is blocked here, so the files were copied from the pinned GitHub tag with the CLI's import rewrites; the method is in 08 §5.1. Charts for later dashboards: shadcn `chart` (Recharts) instead of hand-drawn SVG.
- `publicAction()` added so the three pre-sign-in actions share the wrapper's validation and error mapping.

**Defects found and fixed during M00** (each has a test now)
- `lib/db.ts` cached a failed first connection: a server started while Mongo was down stayed down after Mongo recovered.
- Login counted successful sign-ins toward the limit: a 6th sign-in in 15 min (a student moving between lab machines) would have been blocked.
- React 19 cleared every field after a failed form submit (`<form action>`): the email had to be retyped after a wrong password.
- Before hydration, a submitted form did a native GET: the email and **password** went into the URL. Now `method="post"` and the button is disabled until hydrated.
- A used invite/reset link still showed the password form (the action rejected it, but only after typing). The page now checks `isTokenCurrent`.
- `/reset-password` read the clock during the runtime prerender (`Date.now()` error) → `await connection()`.

**Not done**
- E2E is not in CI until M01 provides `scripts/seed.ts` (10 §5).
- Timing-based email enumeration is not mitigated (Q-34).
- No dark theme (not in scope).

**Assumptions** — A-22 … A-25 (§4).

**Open questions** — Q-33, Q-34 (§3); Q-32 default updated.

**Verification** (compose stack: mongo:8.0 rs0, redis:8.6, mailpit; Node 22.22.0; Chromium 1194 via `PW_CHROMIUM_PATH`)
```
npm run check              → eslint: 0 problems · tsc: 0 errors · Test Files 5 passed · Tests 11 passed (11)
npm run test:integration   → Test Files 3 passed · Tests 15 passed (15)   (TEST_MONGODB_URI = local replica set)
env -i … npm run build     → ✓ Compiled successfully (no environment variables); /home, /profile, /reset-password partially prerendered; /api/health dynamic; Proxy registered
npm run check:bundle       → check-bundle: 25 files scanned for 4 names and 3 secret values; clean   (planted "SESSION_PASSWORD" file → exit 1)
npm run test:e2e           → 5 passed (≈20 s); 8 consecutive runs and 2 runs after fresh builds all green
npm run db:indexes         → users (email unique, partial uniques, text index, …) and auditlogs indexes created
```
- GitHub Actions run #1 on `ae654e9` (https://github.com/Aniket-Subudh1/LMS-CUTM/actions/runs/38295067817): **verify** ✓ (lint, typecheck, unit, build without env, bundle scan) and **integration** ✓ (`Test Files 3 passed · Tests 15 passed`, mongodb-memory-server downloaded `mongod` 8.2.6 during `npm ci`; binary cache saved). Warning only: `actions/cache@v4` runs on the deprecated Node 20 action runtime.
- Mutation check: removing the login refund or the reset token's `sessionVersion` condition makes the matching integration tests fail (2 failures), then restored.
- E2E flakiness investigated, not retried away: 4 failures in 22 runs before the fix. The saved trace showed a fill binding to the previous page's input while Next hid it after a client navigation; fixed by waiting for the new page (10 §3). Separately, all runs shared one client IP and so one rate-limit window; each run now sends its own `X-Forwarded-For`.

| AC | Result | How |
|---|---|---|
| AC-M00-01 | Pass | `curl /api/health` → `200 {"ok":true,"mongo":"up","redis":"up"}`; `/login` renders; e2e asserts both |
| AC-M00-02 | Pass | `curl /home`, `/profile` without cookie → `307` to `/login`; e2e |
| AC-M00-03 | Pass | e2e: `admin:create` link → set password → `/home` → same link shows "Link not valid"; integration: second use → expired message |
| AC-M00-04 | Pass | integration: identical message for wrong password, disabled, invited and unknown emails; 6th failure → `RATE_LIMITED` even with the right password |
| AC-M00-05 | Pass | e2e with two browser contexts; integration: other browser's viewer is null, `user.sessions_revoked` audit entry |
| AC-M00-06 | Pass | build with `env -i`; bundle scan clean; negative test fails as expected |
| AC-M00-07 | Pass | `curl -I /login` and e2e: CSP, nosniff, Referrer-Policy, Permissions-Policy, HSTS |
| AC-M00-08 | Pass | e2e at 360 × 740: `scrollWidth` ≤ 360 on `/login`, `/home`, `/profile`; sidebar hidden, opens as a sheet, closes on navigation |

Health under failure: `docker stop` mongo → `503 {"ok":false,"mongo":"down","redis":"up"}` in 2.01 s; redis → 503 in 2.01 s; both recover on restart; Mongo down at server start then up → recovers on the next request.

Screenshots reviewed at 1280 px (login, home, profile, user menu) and 360 px (login with error, home, sidebar sheet).

**Manual steps not performed:** no human has walked the M00 validation checklist; email was checked in Mailpit only (no real inbox); the 360 px checks ran in headless Chromium, not on a phone.

