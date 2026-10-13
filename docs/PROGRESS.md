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
| M01 Academic structure & admin | Done — awaiting human validation | | Entry 2026-10-13 · M01. CI e2e job not yet run on GitHub |
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
| Q-32 | CUTM brand colours and logo | @client | Official lockup `public/brand/logo.svg` (emblem plus the wordmark and tagline). Palette sampled from it: seal crimson primary, paper background and light sidebar, flame gold hairline (08 §4). **Superseded 13 Oct 2026:** Aniket chose a blue palette (decision in §5); the lockup stays in the sidebar, on the sign-in pages and on the 404 page. Worth confirming with the client | — | Answered 13 Oct 2026 |
| Q-33 | Do lab machines reach the LMS through one public IP (campus NAT)? The login limit is 30 failed attempts per IP per 15 min (successes do not count) | @client / @dev | Per-IP limit as specified; revisit with the campus network map | M11 load test | Open |
| Q-34 | Login and forgot-password take measurably longer for a registered email (argon2 runs only then), which allows email enumeration by timing. Add a dummy-hash verify for unknown emails? | @dev | Not built. Forgot-password now states whether the email is registered (requested 13 Oct 2026). Login messages stay identical. | M11 hardening | Open |
| Q-35 | AC-M01-03 says creating an offering enrols “the active students” of the batch and section, but a freshly imported cohort is `invited` until each student accepts. Enrol only `active` students (a new cohort would be missed), or every student who is not `disabled`? | @dev | Every student of the batch and section who is not `disabled` (A-26) | — | Open |

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
| A-24 | Inter is self-hosted through `next/font` (downloaded from Google Fonts at build time); one family for the whole UI, no serif | build | Q-12 |
| A-25 | `admin:create` only creates or re-invites; it refuses an email whose account is active or disabled | M00 | — |
| A-26 | Creating an offering enrols every student of the batch (and section) who is `invited` or `active`, never `disabled` | M01 | Q-35 |
| A-27 | An offering for a whole batch (`section: null`) and offerings for its sections can coexist; 05 §3.8's unique index allows it | M01 | — |
| A-28 | Faculty on an offering may be `invited` or `active`, not `disabled`; at most five | M01 | — |
| A-29 | `createOffering` writes the offering, its enrolments and the audit entry in one transaction (04 §6.14) | M01 | — |
| A-30 | The admin offerings list filters by term, department and status only when asked; it does not default to the current term (it sorts on `_id`, which is indexed) | M01 | — |
| A-31 | A student's section must be one of the batch's `sections` (single create and import); a section is added to the batch first | M01 | — |
| A-32 | Re-enabling a disabled account returns it to `invited` if the person never set a password, otherwise `active` | M01 | — |
| A-33 | CSV import replaces an existing user's roles with the role in the row; administrator accounts are never changed by import | M01 | — |
| A-34 | Home lists the newest six offerings the viewer teaches, oversees or is enrolled in, not “this term’s”; `/courses` has the full list | M01 | — |
| A-35 | A head of department sees the People roster of their department's offerings but cannot change enrolment; only admin and the offering's faculty can | M01 | — |
| A-36 | The worker may import `lib/queue` and `lib/auth/tokens` (to enqueue per-recipient mail and build invitation links); AGENTS.md's layer table says so | M01 | — |
| A-37 | The seed runs only against a local MongoDB (`localhost` or `127.0.0.1`) and never in production; without `--e2e` it leaves users `invited` and needs an existing administrator | M01 | — |
| A-38 | There is no public sign-up: accounts are created by an administrator and the person sets a password from the invitation link (01 §4–§5). The "sign up" screen of the redesign is that page, titled "Set up your account" | auth UI | — |
| A-39 | Home shows only data that exists today: counts of structure, catalogue, offerings and users for admins; offerings and enrolled students for faculty and HoD; enrolled courses for students; the six latest audit entries for admins. “Enrolled students” is counted as active enrolments across the viewer’s offerings (a student in two of them counts twice), so the count stays one indexed query. Later milestones add their sections | `/home` | — |
| A-40 | The large editors of later milestones (assessment builder, attempt runner) stay routes; every other create/edit form is a `FormDialog` (04 §1) | M02+ UI | — |
| A-41 | The Structure cards count every department, programme and term, archived ones included, so each matches the total on its list page; Home's Programmes tile counts only active programmes | `/admin`, `/home` | — |
| A-42 | Home's “top 3” panel (the reference's student leaderboard) ranks the three people with the most audit entries in the last seven days. The planned “largest offerings” would group every active enrolment on each Home view (04 §3 S11), and offerings carry no enrolment counter | `/home` | — |
| A-43 | The sidebar header is a light tinted card with the university lockup on a white chip beside “Centurion LMS” and “Learning Management System” (Aniket chose it from mock-ups, 13 Oct 2026), in place of the reference's logo and product name | app shell | Q-32 |
| A-44 | The reference's typeface was not identified; the UI stays on Inter (A-24) | all UI | — |

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

### 2026-10-13 · tooling · Cursor (AI agent)

**Created**
- `package.json` — `allowScripts` pins for `esbuild@0.28.2`, `fsevents@2.3.3`, `mongodb-memory-server@11.3.0`, `msgpackr-extract@3.0.4`, `unrs-resolver@1.12.2` (npm 11 install-script review)
- `.nvmrc` — `24`, matching the Node 24 LTS pin in `docs/03-TECH-STACK.md`

**Not done**
- The five high audit findings are one advisory, `braces` ≤ 3.0.3 (`GHSA-vfj7-8cjw-p6xm`), pulled in only by `eslint-config-next@16.4.0` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`. npm's latest `braces` is 3.0.3; no patched release exists. `npm audit fix --force` would install `eslint-config-next@14.2.35` and break the Next 16 toolchain, so it was not run.

**Assumptions**
- Local default Node was switched from 25.9.0 to 24.21.0 (`nvm alias default 24`). Vitest 5.0.4 does not list Node 25.

**Open questions** — none.

**Verification**
```
nvm install 24                         → Now using node v24.21.0 (npm v11.19.0)
npm i                                  → up to date, audited 547 packages; no EBADENGINE; no allow-scripts warning
npm audit fix                          → still 5 high; only offered fix is eslint-config-next@14.2.35 (breaking)
```

### 2026-10-13 · auth · Cursor (AI agent)

**Created**
- `app/(auth)/actions.ts` — `requestPasswordReset` returns not-found when the email has no active or invited user
- `app/(auth)/forgot-password/page.tsx` — success copy says the email is registered and the link was sent
- `tests/integration/auth.test.ts`, `tests/e2e/auth.spec.ts` — expect the two different answers
- `docs/09-SECURITY.md`, `docs/milestones/M00-foundation.md` — same contract

**Not done**
- Integration and e2e suites were not re-run here (they need local Redis on port 6379 and the compose stack).

**Assumptions**
- A disabled account is treated as not in the database for this form, same as before: only `active` and `invited` receive a reset link.
- The admin `aniketsubudhi00@gmail.com` was created directly as `active` with a password so the login form works. `admin:create` only invites and does not set a password.

**Open questions** — none.

**Verification**
- `GET http://localhost:3001/api/health` → `{"ok":true,"mongo":"up","redis":"up"}`
- Browser on `http://localhost:3001`: unknown email shows "This email does not exist in the database."; `aniketsubudhi00@gmail.com` shows "This email is registered. A reset link has been sent."; sign-in reaches `/home` with "Welcome, Aniket" and "Administrator".
- The mail worker picked up the reset job and Gmail rejected SMTP auth (`535 5.7.8 Username and Password not accepted`). The message was not delivered.
- Integration and e2e suites were not run (local Redis on port 6379 is not running).

### 2026-10-13 · shell · Cursor (AI agent)

**Created**
- `app/(app)/home/page.tsx`, `app/(app)/profile/page.tsx`, `app/(auth)/reset-password/page.tsx` — session and token reads sit in a child under `<Suspense>`
- `docs/02-ARCHITECTURE.md`, `docs/04-CODING-LAWS.md` — the shell `loading.tsx` does not cover a navigation between pages in the same layout

**Not done** — none.

**Assumptions** — none.

**Open questions** — none.

**Verification**
- Browser: `/home` shows "Welcome, Aniket"; client navigation to `/profile` shows the account. Dev log after the change has no `uncached data during prerendering or a navigation` error.

### 2026-10-13 · brand · Cursor (AI agent)

The sign-in screen and the signed-in shell now use the official Centurion lockup, including the words under the seal, and a palette sampled from that file.

**Created**
- `public/brand/logo.svg` — the university file, unchanged (a 2 MB PNG embedded in SVG)
- `public/brand/logo.png` — transparent 960 px render of the same lockup, including “Centurion”, “UNIVERSITY”, and “Shaping Lives… Empowering Communities…”, for the pages
- `public/brand/lotus.svg`, `public/brand/stage-print.jpg`
- `app/icon.png` — the full lockup, not a cropped seal
- `components/university-logo.tsx`, `components/auth-stage.tsx`
- `gsap@3.15.0`

**Changed**
- `app/globals.css`, `app/layout.tsx`, `app/not-found.tsx`
- `app/(auth)/layout.tsx`, `app/(auth)/loading.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`
- `app/(app)/layout.tsx`, `app/(app)/home/page.tsx`, `app/(app)/profile/page.tsx`
- `components/page-header.tsx`, `components/app-nav.tsx`
- `proxy.ts` — static images and `icon.png` are not redirected to `/login`, or the mark cannot load before sign-in
- `tests/e2e/auth.spec.ts` — home heading is the first name (`Asha`), with “Welcome” as the label above it
- `docs/02-ARCHITECTURE.md`, `docs/03-TECH-STACK.md`, `docs/08-UI-SYSTEM.md`, `docs/milestones/M00-foundation.md`

**Not done**
- `npm run test:e2e` was not run (it needs the compose stack and a production build).

**Assumptions**
- The brightest gold in the seal (`#F0D040`) disappears as a hairline on the paper, so `--gold` is a darker flame tone from the same mark (`#A67C2D`). The focus ring stays seal crimson, which passes WCAG on the paper; gold does not.
- The sidebar is light (paper), so the dark wordmark in the lockup stays readable.
- There is still no public registration page. The invitation screen is `/reset-password`.

**Open questions** — Q-32 answered (logo and sampled colours).

**Verification**
```
npm run check → eslint: 0 problems · tsc: 0 errors · Test Files 5 passed · Tests 11 passed
```
- `GET /brand/logo.png` without a session → `200` `image/png`. `GET /home` without a session → `307` to `/login`.
- Browser at 1280×800: `/login` shows the full lockup (seal, Centurion, UNIVERSITY, tagline), the gold rule, and the sign-in form. Email field is labelled. With `prefers-reduced-motion: reduce`, the logo stays at opacity 1 and the lotus has no transform.
- Browser at 360×740: `/login` scroll width is 360, the stage is hidden, the full lockup is 160 px wide above the form, and the Sign in button sits inside the viewport. `/forgot-password` and `/reset-password?token=not-a-real-token` (“Link not valid”) use the same lockup.
- Signed-in `/home`: sidebar shows the full lockup; heading “Aniket” with label “Welcome”; both cards fit (no horizontal scroll). Collapsed rail is the same image at 32×51, not a cropped seal. `/profile` shows the account and password fields.


### 2026-10-13 · ui-polish · Cursor (AI agent)

Typography, logo size, width and responsiveness fixes after review of the brand pass.

**Created** — none (`public/brand/logo.png` replaces `logo.jpg`; `emblem.png` removed).

**Changed**
- `app/layout.tsx`, `app/globals.css` — Inter only (A-24), light sidebar tokens
- `components/university-logo.tsx` — transparent PNG, `sizes` prop
- `components/auth-stage.tsx`, `app/(auth)/*` — smaller logo, left-aligned headings, tablet card and desktop split
- `app/(app)/layout.tsx` — sidebar 15 rem, 72 px logo, no max-width on the shell
- `app/(app)/home/page.tsx`, `app/(app)/profile/page.tsx`, `app/(app)/loading.tsx` — `auto-fit` card grids, hairline-top cards, welcome band
- `components/page-header.tsx` (no `eyebrow`), `components/app-nav.tsx` (active marker)
- `docs/02-ARCHITECTURE.md`, `docs/08-UI-SYSTEM.md`, `docs/PROGRESS.md`

**Not done**
- `npm run test:e2e` was not run (needs the compose stack and a production build).
- The mobile sidebar sheet and the collapsed rail were not re-measured after the change.

**Assumptions** — A-24 now reads Inter.

**Open questions** — none.

**Verification**
```
npm run check → eslint: 0 problems · tsc: 0 errors · Test Files 5 passed · Tests 11 passed
```
- Browser metrics (no emulated touch): no horizontal scroll at 360, 768, 1024, 1440 and 1920 px.
- `/login`: 1440 split with a 192 px lockup, form 448 px; 768 centred 448 px card with a 128 px lockup; 360 card 328 px wide (16 px gutters).
- `/home` at 1920: content spans x 280–1880 (40 px gutters), two cards 788 px each. At 360 cards are 328 px.
- `/profile`: 1024 single column, cards 705 px; 1440 two columns (365 and 731 px); 360 cards 313 px with inputs inside.
- Sidebar logo is 72×114 px on the light sidebar. Computed body font is Inter.
- Note: the dev server first checked was stale (served an old charcoal sidebar); it was restarted on port 3100 and the checks above ran against it.

### 2026-10-13 · profile-dialogs · Cursor (AI agent)

The profile page no longer shows the password form and sign-out action as cards. Both open in a dialog.

**Created**
- `app/(app)/profile/account-actions.tsx` — native `<dialog>` for change password and sign out everywhere

**Changed**
- `app/(app)/profile/page.tsx` — one account panel (name, email, roles) with those two actions
- `tests/e2e/auth.spec.ts` — opens each dialog before submitting
- `docs/08-UI-SYSTEM.md` — profile is the exception to “no modals for data entry”

**Not done**
- `npm run test:e2e` was not run (needs the compose stack and a production build).

**Assumptions**
- These two account actions stay on `/profile` inside a native dialog, rather than moving to their own routes.

**Open questions** — none.

**Verification**
- Browser: `/profile` shows one account panel. “Change password” opens a centred dialog; the first field is focused; Escape closes it. “Sign out everywhere” opens a centred confirmation dialog. At 360 px, `scrollWidth` is 360, the rows stack, and the dialog fits the screen.

### 2026-10-13 · M01 Academic structure & administration (T0–T12) · Cursor (AI agent), at Aniket's request

Admins can model the university end to end: departments, programmes with PO/PSO lists, batches, terms, the course catalogue with COs and the CO–PO–PSO matrix, versioned evaluation schemes, offerings with faculty and batch enrolment, users (single, CSV import, roles, status, sessions), and an audit log. Every role has “My courses” and a course workspace (Overview, People). Thirteen commits, `30a9918` to the one that adds this entry (`M01(deps)` … `M01(tests)`).

**Created** (new unless marked *changed*)
- Models: `lib/models/{department,program,batch,term,course,evaluation-scheme,offering,enrollment}.ts`; `audit-log.ts` *changed* (two indexes); `scripts/sync-indexes.ts` *changed*.
- Schemas and pure code: `lib/schemas/structure.ts`, `lib/schemas/common.ts` *changed* (`page`, `pageSize`, `istDate`), `lib/schemas/jobs.ts` *changed* (`MailJob`); `lib/domain/{structure,csv,time}.ts`; `lib/format.ts` *changed*; each with a co-located test.
- Access and plumbing: `lib/auth/access.ts` (`offeringAccess`, `requireTeach`); `lib/auth/tokens.ts` *changed* (`passwordLink`, `queueResetLink`); `lib/errors.ts` and `lib/action.ts` *changed* (`AppError` carries `fieldErrors`; `csvRejected`); `lib/db.ts` *changed* (`isDuplicateKey`); `lib/queue.ts` *changed* (`fanout`); `worker/jobs/mail.ts` *changed* (dispatch on job name, invitation fan-out); `next.config.ts` *changed* (`experimental.serverActions.bodySizeLimit: '2mb'`).
- DAL: `lib/data/{structure,courses,schemes,offerings,users,audit,workspace}.ts`.
- Actions: `app/(app)/admin/actions.ts`, `admin/courses/actions.ts`, `admin/schemes/actions.ts`, `admin/offerings/actions.ts`, `admin/users/actions.ts`, `courses/actions.ts`.
- Routes: `/admin` (+ layout), `/admin/{departments,programs,programs/[id],terms,courses,courses/new,courses/[id],schemes,schemes/[componentKey],offerings,offerings/new,users,users/new,users/import,users/[id],audit}`, `/courses`, `/courses/[offeringId]` (+ layout), `/courses/[offeringId]/people`; `/home` *changed* (offerings and shortcuts cards); `(app)/layout.tsx` *changed* (Suspense, `Nav`); `(auth)/actions.ts` *changed* (uses `queueResetLink`).
- Components: `data-table.tsx`, `tab-nav.tsx`, `co-po-matrix.tsx`, `confirm-submit.tsx`; `app-nav.tsx` and `action-form.tsx` *changed*; shadcn `ui/{table,tabs,empty,pagination,native-select,textarea,alert-dialog}.tsx` (`shadcn@4.21.4`, each added with its first user).
- Scripts and CI: `scripts/seed.ts`, `scripts/create-admin.ts` *changed*, `package.json` (`db:seed`, `db:seed:e2e`, `db:indexes:e2e`, `papaparse` and its types; `start:e2e` now copies `public/`), `playwright.config.ts` *changed* (loads `.env.e2e`), `.github/workflows/ci.yml` (`e2e` job).
- Tests: `tests/factories.ts`, `tests/next-request.ts` *changed*; integration `{access,structure,catalog,schemes,offerings,users,audit,workspace}.test.ts`; `auth.test.ts` and `mail-worker.test.ts` *changed*; e2e `tests/e2e/admin-structure.spec.ts`.
- Docs changed with the code: 03 §4, 04 §6.4 and §6.6, 05 §3.8 and §7.5, 06 §2, §6 and §8.2, 08 §2, §3, §5.1 and §5.2, 10 §3–§4, and `AGENTS.md` (Worker layer row).

**Not done**
- Nothing in the milestone's task list was left out. These are unverified or deferred:
  - The CI `e2e` job is written but has not run on GitHub. Locally only `admin-structure.spec.ts` was run; `auth.spec.ts` needs Mailpit, which is not installed here (no Docker).
  - The human validation checklist is not walked; that is the reviewer's step.
  - Screens were checked at 1280 px width only (screenshots of home, users, user detail, courses and the workspace). No mobile width, keyboard or screen-reader pass.
  - 3,000-row import timing (AC-M01-05) was not measured; the logic is tested with small files. The action runs in the request and the body limit is 2 MB, so a very large file is rejected rather than slowed.
  - The scheme editor and CO matrix grids were not exercised in a browser; only through the actions' integration tests.

**Assumptions** — A-26 to A-37 (§4).

**Open questions** — Q-35 (§3).

**Doc fixes made together with code**
| Where | Fix |
|---|---|
| 03 §4 | `serverActions.bodySizeLimit` sits under `experimental` in the installed Next 16.4 types |
| 06 §2 | `istDate` is a validated `YYYY-MM-DD` string; the action converts it with `istDateToDate` (schemas import only `zod`) |
| 04 §6.4 | students open only `active` or `completed` offerings, though they are enrolled while the offering is `draft` |
| 05 §3.8, §7.5 | extra indexes: `offerings {status, _id}`, `auditLogs {at}` and `{entity, at}` |
| 04 §6.6, 06 §2 | `AppError` carries optional `fieldErrors` (used for CSV row errors) |
| 06 §8.2 | the enrolment form is on `/courses/<id>/people`, not a separate import route |
| 08 §2 | `/admin/settings` belongs to M02; `/admin/users/new` added |
| 08 §3, §5.1, §5.2 | `AppNav({ roles })`; `ConfirmSubmit`, `TabNav`, `DataTable`, `CoPoMatrix` inventory with their call sites |
| AGENTS.md | Worker may import `lib/queue` and `lib/auth/tokens` (A-36) |
| 10 §3–§4 | `db:indexes:e2e`, `db:seed:e2e`, `E2E_PASSWORD`, fixture emails, `start:e2e` copies `public/` (without it the logo returned 404 on the standalone server) |

**Acceptance criteria** (what was run is in Verification)
| ID | Result | Evidence |
|---|---|---|
| AC-M01-01 | Pass | `schemes.test.ts`: weights 45 against 50 are rejected with both numbers in the message |
| AC-M01-02 | Pass | `schemes.test.ts`: version n+1 is active, the previous is retired; `offerings.test.ts`: an offering stores the id of the scheme version active when it was created. Versions are separate documents and nothing rewrites `schemeId`, so a new version cannot reach an existing offering; there is no test that creates a version after an offering and re-reads it |
| AC-M01-03 | Pass, with Q-35 | `offerings.test.ts`: section A gets exactly its students (invited and active, not disabled, other sections or batches); a repeat is `CONFLICT` and writes nothing |
| AC-M01-04 | Pass | `catalog.test.ts`: levels 1–3 and the programme's codes only; e2e: Overview shows the saved levels |
| AC-M01-05 | Pass for logic | `users.test.ts`: a file with six bad rows writes nothing and lists each as `Row N: …`; the corrected file creates users, queues invitations and writes one audit entry. Size not measured |
| AC-M01-06 | Pass | `workspace.test.ts` and `access.test.ts`: student, faculty, HoD and another department's offering answer 404; e2e: the student sees only CS101 |
| AC-M01-07 | Pass | `users.test.ts`: support lists, opens a user and queues a reset link; `revokeUserSessions` is `FORBIDDEN`; the audit page redirects to `/home` |
| AC-M01-08 | Pass | `users.test.ts` checks `user.created`, `user.imported`, `user.roles_changed`, `user.disabled`, `user.enabled`, `user.sessions_revoked`; `audit.test.ts` filters them |

**Verification**
- `npm run check` → eslint no warnings; `next typegen && tsc --noEmit` clean; unit `Test Files 10 passed, Tests 57 passed`.
- `npx vitest run --project integration` (local Mongo replica set via mongodb-memory-server, Redis db 1) → `Test Files 11 passed, Tests 116 passed`.
- `npm run build` → compiled with no errors; `npm run check:bundle` → `37 files scanned for 4 names and 3 secret values; clean`.
- `npm run db:indexes:e2e`, then `npm run db:seed:e2e` run twice → both print `Seeded e2e fixtures: 1 department, 2 programmes, 2 courses, 2 offerings, 20 students enrolled in CS101.`; counts after the second run: users 24, departments 1, programs 2, batches 2, terms 1, courses 2, schemes 1, offerings 2, enrollments 20 (repeat is a no-op). Against `mongodb://example.com/x` the seed prints `Refusing to seed "example.com"` and exits.
- `npx playwright test admin-structure` (against `npm run build` output, `.env.e2e` with generated values) → `3 passed`: admin adds a department, finds a user and opens CS101's Overview and People; faculty drops and re-adds a student by CSV and sees a row error for an unknown roll number; a student sees only CS101 and `/admin/users` sends them to `/home`.
- Not run: `npx playwright test auth` (needs Mailpit), the CI `e2e` job, any remote or Atlas database.

### 2026-10-13 · Decision: UI and UX redesign · Cursor (AI agent), at Aniket's request

Aniket asked (13 Oct 2026) for a complete redesign of the dashboard, the sign-in pages and the sidebar, to an industry-grade standard. He made these decisions:
- Every create/edit form is a modal (`FormDialog`). While saving, its fields and buttons lock. On success its fields give way to the success message, and it closes itself. This replaces the "forms are routes" rule (04 §1, 08 §1 and §6), and `/admin/courses/new`, `/admin/offerings/new`, `/admin/users/new` and `/admin/users/import` are removed.
- Icons are Phosphor (duotone) instead of lucide (03 §3).
- The sidebar stays light, with grouped sections and a tinted active pill. One-sided accent borders (the gold card tops, the inset bar on the active nav item) are removed everywhere.
- Large record lists (users, audit, offerings, the course catalogue) stay as redesigned tables. Navigation and small lists become icon card grids.
- Every submit shows a loader and cannot be pressed twice. Links and filters show a pending spinner.

Contract change: create actions return `{ next }` instead of calling `redirect()` (06 §1). The build entry follows below.

### 2026-10-13 · UI and UX redesign (build) · Cursor (AI agent), at Aniket's request

The shell, sidebar, sign-in pages, Home and every M01 page are redesigned. Every create/edit form is a dialog that locks while saving, swaps its fields for the success message and closes itself. Fifteen commits, from `a25f3a6 UI(docs)` to the one that adds this entry. Two of them fix M01 defects found during the walkthrough (`M01(offerings)`, and the `(auth)` loading boundary in `UI(auth): sign-in renders without JavaScript again`).

**Created** (new unless marked *changed* or *deleted*)
- Components: `form-dialog.tsx`, `filter-form.tsx`, `link-spinner.tsx`, `password-input.tsx`, `section.tsx` (`Section`, `Fact`), `offering-card.tsx`; *changed* `action-form.tsx` (fieldset lock, `replaceOnSuccess`, `onSuccess`, `onPendingChange`, `secondary` footer slot), `confirm-submit.tsx` (pending lock), `app-nav.tsx`, `auth-stage.tsx`, `data-table.tsx` (`PageNav`, `EmptyState`), `page-header.tsx` (icon, actions), `tab-nav.tsx` (icons, pill, spinner), `co-po-matrix.tsx`. shadcn `ui/dialog.tsx` (`shadcn@4.21.4`); *changed* `ui/{badge,dropdown-menu,native-select,pagination,sheet,sidebar}.tsx` (Phosphor icons, marked as local changes).
- Routes: *changed* `(app)/layout.tsx` (grouped sidebar, user card, breadcrumb, IST date), `(app)/{loading,error}.tsx`, `app/not-found.tsx`, `home/page.tsx`, new `home/loading.tsx`; every `admin/**/page.tsx`, `courses/page.tsx`, `courses/[offeringId]/{layout,page}.tsx`, `courses/[offeringId]/people/page.tsx`, `profile/page.tsx`; `(auth)/{layout.tsx,login,forgot-password,reset-password}`. *Deleted*: `admin/layout.tsx` (the sidebar replaces its tabs), `admin/courses/new`, `admin/offerings/new`, `admin/users/new`, `admin/users/import`, `profile/account-actions.tsx`, `(auth)/loading.tsx`, `public/brand/stage-print.jpg`.
- Actions: `admin/actions.ts`, `admin/courses/actions.ts`, `admin/offerings/actions.ts`, `admin/users/actions.ts` *changed*: creates return `{ next }`, edits call `refresh()`.
- DAL: `lib/data/workspace.ts` *changed* (`getHomeSummary`, shared `offeringScope`); `lib/data/structure.ts` *changed* (`getStructureCounts`; `getDepartment`, `getBatch`, `getTerm` removed, as edit dialogs take their values from the list row); `lib/data/offerings.ts` *changed* (unset filters are left out of the query). `lib/format.ts` *changed* (`dayGreeting`, `formatLongDate`).
- Styling and config: `app/globals.css` (cooler neutrals, `--shadow-card`/`--shadow-elevated`, `surface`, `surface-interactive`, `icon-chip`, `auth-aurora`, success and aurora keyframes, gold hairlines removed); `package.json` (`@phosphor-icons/react` 2.1.10 in, `lucide-react` out); `next.config.ts` (`optimizePackageImports` for Phosphor).
- Tests: integration `{catalog,offerings,structure,users,workspace}.test.ts` and `lib/format.test.ts` *changed*; e2e `auth.spec.ts` and `admin-structure.spec.ts` *changed* for the dialog flows.
- Docs changed with the code: 03 §3, 04 §1, 06 §1, 08 (§1–§6), M00 (reset page Suspense), M01 (no admin layout, `getHomeSummary`), this file (A-38 to A-41).

**Not done**
- `auth.spec.ts` › "invited admin sets a password…" fails locally at its first mail read (`fetch failed`): it needs Mailpit, which is not installed here (no Docker). The other seven e2e tests pass.
- The browser walkthrough was done as an administrator only. The seeded faculty and student passwords live in `.env.e2e`, which this agent does not read; their views are covered by the e2e tests (roster changes as faculty, "only their own course" as a student), not by screenshots.
- No keyboard-only or screen-reader pass.
- Deviations from the plan:
  - Row actions are icon buttons with an accessible label (for example "Edit CSE"), not a three-dot menu, and they have no tooltip. Each row has at most two actions, so a menu would only add a click.
  - `LinkSpinner` sits inside an ordinary `<Link>` rather than a `NavLink` wrapper, because a wrapper that only forwards is not allowed (04 §1).
  - Table headers are not sticky. `DataTable` scrolls sideways inside its own box, which becomes the sticky container, so a sticky header would never stick to the page.
  - Course cards show the offering title, which already carries the course code, plus the term and faculty. They have no student count, which is not in `MyOfferingRow`.
  - Home's greeting band does not repeat the date, since the top bar shows it on every page.
  - The sign-in stage's three feature rows describe courses, marks and account protection, not live classes and assessments, which do not exist yet.
- Aniket's own `npm run dev` on port 3001 was still serving CSS from an old Turbopack cache during this work (the old `#f6f3ee` background). The production build is correct. Restarting `npm run dev` (after deleting `.next/dev` if needed) picks up the new styles.

**Assumptions** — A-38 to A-41 (§4).

**Open questions** — none new.

**Fixes found during the walkthrough**
| Where | Fix |
|---|---|
| `/admin/offerings` | With no filter the page listed nothing: `{ termId: undefined }` reaches MongoDB as `null`. Integration test added (it fails without the fix) |
| `/login`, `/forgot-password` | A route-level `(auth)/loading.tsx` streamed the form behind a fallback, so without JavaScript it never appeared (`auth.spec.ts` › before hydration) |
| `ActionForm` | A form of hidden inputs only (row status actions, resend invite) kept an empty fieldset and its gap above the button |
| `Field`, CO cards | A grid cell stretched to its row spread its own rows apart (an input pushed below its neighbours, a stretched Bloom badge) |
| `TabNav` | The list kept the primitive's fixed `h-9` (a variant-scoped class `cn` does not merge), so the pills overflowed and showed a scrollbar |
| `FormDialog` | A `?new=` link back to a page Next kept mounted reopened nothing; the dialog now resets when `router.bfcacheId` changes |

**Verification**
- `npm run check` → eslint clean; `next typegen && tsc --noEmit` clean; unit `Test Files 10 passed, Tests 59 passed`.
- `npm run test:integration` → `Test Files 11 passed, Tests 119 passed`.
- `npx next build` → compiled with no errors; `npm run check:bundle` → `40 files scanned for 4 names and 0 secret values; clean` (no `.env.local` here, so no secret values to look for).
- `npm run db:seed:e2e`, then `npx playwright test` → `7 passed, 1 failed` (the Mailpit test above). `admin-structure.spec.ts` covers the department dialog (pending, success, auto-close, new card), the user search, the course workspace, the faculty roster dialog and the student's view.
- Browser, production build on port 3100, as an administrator, at 1440 px: sign-in stage and the "Set up your account" page (fields and button disabled and busy while saving); Home; the quick-action deep link opened and closed three times in a row and stayed closed on Back; department create from Home (fields locked, "Department added." in place of the fields, dialog closed, `?new=` removed from the URL, new card shown); Structure, Departments, Users (table and New user dialog), Offerings, Schemes, My courses, course Overview and People. At 360 px: Home (no horizontal scroll, `scrollWidth` 360) and the sign-in layout. Screenshots were reviewed in the session, not committed.

### 2026-10-13 · Decision: dashboard after a reference design · Claude Code, at Aniket's request

Aniket supplied a screenshot of a learning dashboard (13 Oct 2026) and asked for Home, the sidebar (header included) and the top bar to look exactly like it. He decided:
- The palette changes from the seal crimson to the reference's blue, across the whole app, sign-in included. This supersedes the Q-32 palette.
- Panels with no data behind them yet are left out rather than shown empty or with sample data. The reference's attendance, learning hours, assignments, schedule and leaderboard map to what M01 has, and each milestone adds its own panel.
- The shell is restyled too: icon-and-wordmark header, a “Menu” list of grey pills with a solid current pill, Profile and Sign out at the foot, and a user chip in the top bar.

Left out of the reference on purpose: the search box (no search feature), the theme toggle (light only, A-23), the notification bell (M02), certificates (out of scope, 01 §4), leave management (not in scope), and the AI button (no AI feature in M01).

### 2026-10-13 · Dashboard after a reference design (build) · Claude Code, at Aniket's request

Home, the sidebar and the top bar follow the reference. Four commits, `44cc331 UI(home)` to the one that adds this entry.

**Created** (all *changed* unless marked new)
- DAL: `lib/data/workspace.ts`. `getHomeSummary().admin` gains `activity` (audit entries per IST day, last seven days) and `mostActive` (top three people by audit entries that week); `departments` is removed, since Home no longer shows it. Both aggregations `$match` on the `{ at }` index and return at most seven and three documents.
- Styling: `app/globals.css` (blue tokens, `--violet`, blue sign-in aurora).
- Shell: `app/(app)/layout.tsx` (product-mark header, rounded grey content area, top-bar date pill and user chip); `components/app-nav.tsx` (“Menu” pills, Account group and Sign out at the foot, breadcrumb without the group; Home is labelled Dashboard).
- Home: `app/(app)/home/page.tsx` (hero, tiles, activity bars, most active, recent activity, offerings row), `home/loading.tsx`; `components/offering-card.tsx` (schedule-style card, `featured`); `lib/format.ts` (`dayGreeting` removed, now unused).
- Tests: `tests/integration/workspace.test.ts` (new test for `activity` and `mostActive`; the admin test no longer checks departments); `lib/format.test.ts` (greeting test removed).
- Docs: 08 §1, §3, §4, §5.2, §6; M01 T11; this file (Q-32 note, A-41 to A-44).

**Not done**
- Student and faculty Home is sparse: the reference's attendance, learning hours, assignments and schedule have no data until M02 to M04, so those panels are not there.
- The hero has no progress bar. Lesson progress arrives in M02.
- Not run: `auth.spec.ts` › “invited admin sets a password…”, which fails at its first mail read as before, because Mailpit is not installed here. No keyboard-only or screen-reader pass.
- Your `npm run dev` on port 3000 was not restarted. If it still shows crimson, restart it (delete `.next/dev` first if needed).

**Assumptions** — A-42 to A-44 (§4).

**Open questions** — none new. Q-32's palette is superseded; confirming the change with the client is worth doing.

**Verification**
- `npm run check` → eslint clean; `next typegen && tsc --noEmit` clean; unit `Test Files 10 passed, Tests 58 passed`.
- `npm run test:integration` (local Redis started for the run) → `Test Files 11 passed, Tests 120 passed`.
- `npx next build` → compiled with no errors.
- `npm run db:indexes:e2e`, `npm run db:seed:e2e`, then `npx playwright test` against the build on port 3100 → `7 passed, 1 failed` (the Mailpit test above).
- Screenshots of the production build, reviewed in the session and not committed: admin, faculty and student at 1440 px; admin and student at 390 px (`scrollWidth` 390, no horizontal scroll). The first phone shot overflowed by 17 px (the chart's “n changes” label); it is fixed and was shot again.

### 2026-10-13 · Dashboard follow-up: lockup in the sidebar, blue on the dev server · Claude Code, at Aniket's request

Aniket reported that the palette had not changed and asked for the original Centurion logo, named “LMS”. His `npm run dev` on port 3000 was serving the old CSS from its cache (`--primary: #d5282c`). It was stopped, `.next/dev` deleted and `npm run dev` started again; its CSS now has `--primary: #1c59e4`. That server now runs from the agent's session, so restart it from your own terminal if it stops.

**Created** (*changed*) — `app/(app)/layout.tsx` (sidebar header: `UniversityLogo` and “LMS”); `app/(app)/home/page.tsx` (hero fallback “Welcome to the LMS”; the chart leaves about a fifth of headroom above the tallest bar, because a full-height bar's label overlapped the “Last 7 days” pill); 08 §3, §4, §5.2; A-43 and the Q-32 note.

**Verification** — `npx eslint` and `npx tsc --noEmit` clean on the changed files; `npx next build` compiled; a screenshot of the admin Home at 1440 px on the build shows the lockup and “LMS” in the sidebar header.

### 2026-10-13 · Reference card design across the site · Claude Code, at Aniket's request

Aniket shared four more screens of the reference design (courses, an instructor dashboard, a student list) and asked for three things: no white shadows on buttons, no purple or violet anywhere, and the reference's card design on every page.

**Created** (*changed*)
- `app/globals.css`: `surface` is flat (`rounded-2xl`, hairline ring, no shadow); `surface-interactive` tints its ring on hover instead of lifting; `icon-chip` is an outlined square; `--violet`, `--elevation-card` and `shadow-card` are removed; the sign-in aurora's violet light is now sky blue.
- Primitives (marked as local changes): `ui/button.tsx` (outline: white, no shadow), `ui/input.tsx`, `ui/textarea.tsx`, `ui/native-select.tsx` (no shadow), `ui/badge.tsx` (status tones: ring, dot, capitalised).
- Components: `section.tsx` (a section is one card), `data-table.tsx` (rows as separate outlined strips, sentence-case header), `filter-form.tsx` (rounded white fields on the page, outline submit), `tab-nav.tsx` (solid primary current tab), `offering-card.tsx` (black “Open” pill).
- Pages: `home/page.tsx` (no white ring around the hero tile, no button shadows, solid primary hero button, course entries in black instead of violet); `profile/page.tsx` (avatar without the white ring and shadow).
- Docs: 08 §1, §4, §5.1, §5.2, §6.

**Not done** — Page headers keep their icon chip (the reference's have none). Dialogs keep their shadow so they stand off the overlay. `auth.spec.ts` › “invited admin sets a password…” still needs Mailpit.

**Verification**
- `npm run check` → eslint clean; typecheck clean; unit `Test Files 10 passed, Tests 58 passed`. `npm run test:integration` (local Redis started for the run) → `Test Files 11 passed, Tests 120 passed`. `npx next build` compiled.
- `npx playwright test` against the build on port 3100. The first run had 6 passed and 2 failed: the Mailpit test, and “phone width: no horizontal scroll…”. That test then passed alone and in a second full run (`7 passed, 1 failed`, the Mailpit test). The cause of its one failure was not captured.
- Screenshots at 1440 px as an administrator, reviewed in the session: Home, Users, My courses, a course Overview, Profile.

### 2026-10-13 · Sidebar header: centred lockup with an “LMS” pill · Claude Code, at Aniket's request

Aniket found the side-by-side lockup and “LMS” plain and out of keeping with the theme. Four treatments were mocked up as static HTML in the agent's scratchpad (logo │ LMS; a grey brand panel; a centred lockup with an LMS pill; logo │ blue LMS), and he chose the centred lockup.

**Created** (*changed*) — `app/(app)/layout.tsx` (header: lockup 68 px wide, centred, above a primary pill “LMS” in spaced capitals; collapsed, the lockup shrinks to 32 px and the pill is screen-reader only); 08 §3; A-43.

**Verification** — `npx eslint` and `npx tsc --noEmit` clean; `npx next build` compiled; a screenshot of the admin Home at 1440 px on the build shows the new header.

### 2026-10-13 · Collapsed sidebar centred · Claude Code, at Aniket's request

Collapsed, the rail was 48 px but the groups kept 12 px side padding, so the 32 px icon buttons spilled 8 px to the right. The rail is now 56 px (`--sidebar-width-icon: 3.5rem`), the groups pad 8 px in icon mode, and each item is a 40 px square; the lockup shrinks to 36 px.

**Created** (*changed*) — `components/app-nav.tsx`, `app/(app)/layout.tsx`, 08 §3.

**Verification** — eslint and `tsc --noEmit` clean; `npx next build` compiled. On the build at 1440 px, with the sidebar collapsed, every menu button measured 8 px from each edge of the 56 px rail and the lockup 10 px (bounding boxes read in the browser); screenshot reviewed. `npx playwright test` → `7 passed, 1 failed` (the Mailpit test, as before).

### 2026-10-13 · Sidebar header card; collapsed rail back to 48 px · Claude Code, at Aniket's request

Aniket asked to keep the collapsed rail at its original size and only centre it. He rejected two header treatments: the centred lockup with a spaced “L M S” pill, and a frosted-glass card over blurred blue glows. Three more were mocked up as static HTML in the agent's scratchpad (a blue brand card, a letterhead, a light tinted card), and he chose the light tinted card.

**Created** (*changed*)
- `components/app-nav.tsx`: collapsed items are the primitive's 32 px squares again, centred by 8 px of group padding in icon mode (the 56 px rail and 40 px items of `e75f364` are undone).
- `app/(app)/layout.tsx`: the `--sidebar-width-icon` override is removed. The header is a `rounded-2xl` card, `bg-linear-to-b from-primary/[0.03] to-primary/[0.08]` with `ring-primary/10`, holding the lockup on a white 46 × 58 px chip beside “Centurion LMS” (LMS in the primary colour) and “Learning Management System”. Collapsed, the card and chip drop their fill and ring, and the 32 px lockup alone shows.
- 08 §3; A-43.

**Verification** — eslint and `tsc --noEmit` clean; `npx next build` compiled. On the build at 1440 px, collapsed, the rail measured 48 px and every menu button and the lockup sat 8 px from each edge; screenshots of both states reviewed. `npx playwright test` → `7 passed, 1 failed` (the Mailpit test, as before).

### 2026-10-13 · Sidebar header spacing · Claude Code, at Aniket's request

The lockup filled its chip edge to edge and looked cropped, and the card sat tight against the top of the sidebar. The chip is now 48 × 64 px with the lockup 32 px wide (51 px tall): 7 px above and below it, 8 px either side. The header has 20 px above the card, the card has a little more padding and a slightly deeper diagonal tint, and the menu starts 16 px below it.

**Created** (*changed*) — `app/(app)/layout.tsx`.

**Verification** — eslint clean; `npx next build` compiled. On the build at 1440 px the lockup's margins in the chip measured 7 / 7 / 8 / 8 px and the card's top 20 px; collapsed, every rail item sat 8 px from each edge of the 48 px rail. Screenshots reviewed. `npx playwright test` → `7 passed, 1 failed` (the Mailpit test, as before).

