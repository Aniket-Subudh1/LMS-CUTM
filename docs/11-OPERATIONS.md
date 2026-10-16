# 11 · Operations

## 1. Environments

| Environment | Purpose | Data | Who deploys |
|---|---|---|---|
| local | Development | Seeded fixtures | Developer / agent |
| staging | Client UAT for each release (R1–R4) | Anonymized or seeded; never production copies with real student data unless the client approves | Delivery team |
| production | Live university use | Real | Delivery team after the release gate (10 §6) |

Hosting (university servers vs. vendor cloud) and data residency are **open (Q-12)**. Everything below works on any Linux host with Docker, or on managed equivalents (MongoDB Atlas, managed Redis, S3/R2, LiveKit Cloud).

## 2. Environment variables

One schema in `lib/env.ts`; web and worker receive the same set. A variable becomes required in the milestone that introduces it (the schema, `.env.example` and `tests/setup.ts` change together).

| Variable | Since | Example | Notes |
|---|---|---|---|
| `NODE_ENV` | M00 | `production` | |
| `APP_URL` | M00 | `https://lms.cutm.ac.in` | Absolute; used in emails, OAuth redirects, bucket CORS |
| `MONGODB_URI` | M00 | `mongodb://…/lms?replicaSet=rs0` | Replica set required |
| `REDIS_URL` | M00 | `redis://redis:6379` | |
| `SESSION_PASSWORD` | M00 | 32+ random chars | Rotating it signs everyone out |
| `S3_ENDPOINT` | M02 | local `http://localhost:9000`; production `https://<account-id>.r2.cloudflarestorage.com` | Cloudflare R2 (ADR-19) |
| `S3_REGION` | M02 | `auto` (R2) | |
| `S3_BUCKET` | M02 | `cutm-lms` | Private |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | M02 | | An R2 API token with Object Read & Write on the bucket only |
| `S3_FORCE_PATH_STYLE` | M02 | `true` locally (RustFS); `false` for R2 | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | M00 | `localhost`, `1025`, `false` | Mailpit locally |
| `SMTP_USER`, `SMTP_PASSWORD` | M00 | | Optional (Mailpit needs none) |
| `MAIL_FROM` | M00 | `CUTM LMS <lms@cutm.ac.in>` | Sender domain needs SPF/DKIM (Q-31) |
| `COURSEWARE_URL` | M01b | `https://courseware.cutm.ac.in` | CUTM's public course pages, read by the courseware import; the default is the real site |
| `LOG_LEVEL` | M00 | `info` | `debug` · `info` · `warn` · `error` |
| `LIVEKIT_URL` | M03 | `wss://live.cutm.ac.in` | Passed to the browser as a prop, not `NEXT_PUBLIC_` |
| `LIVEKIT_API_URL` | M03 | `http://livekit:7880` | Server-side Room Service URL |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | M03 | | Must match the server's `keys` and `webhook.api_key` |
| `CODE_RUNNER_URL`, `CODE_RUNNER_TOKEN` | M05 | `http://judge0:2358`, token | Judge0 `AUTHN_TOKEN` |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY` | M07 | | PEM with `\n` escapes |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` | M07 | | The App's OAuth credentials and webhook secret |
| `ANTHROPIC_API_KEY` | M09 | | |

`.env.example` lists every variable with a safe placeholder. `.env*` files other than `.env.example` are git-ignored (already in `.gitignore`).

## 3. Local development

Prerequisites: Node.js 24 (≥ 22.13), Docker with Compose.

```yaml
# compose.yaml (verified: mongo becomes healthy with rs0 initiated; redis healthy; RustFS serves S3 with CORS)
name: cutm-lms

services:
  mongo:
    image: mongo:8.0
    command: ['--replSet', 'rs0', '--bind_ip_all']
    ports: ['27017:27017']
    volumes: ['mongo-data:/data/db']
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', "try { rs.status().ok } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] }).ok }"]
      interval: 5s
      timeout: 10s
      retries: 20

  redis:
    image: redis:8.6
    command: ['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction']
    ports: ['6379:6379']
    volumes: ['redis-data:/data']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      retries: 20

  s3:
    image: rustfs/rustfs:1.0.1
    environment:
      RUSTFS_ACCESS_KEY: lmsdev
      RUSTFS_SECRET_KEY: lmsdev-secret-key
    ports: ['9000:9000', '9001:9001']
    volumes: ['s3-data:/data']

  mail:
    image: axllent/mailpit:v1.31
    ports: ['1025:1025', '8025:8025']

volumes:
  mongo-data:
  redis-data:
  s3-data:
```

The replica-set member host is `localhost:27017`, so connect from the host with `mongodb://localhost:27017/lms_dev?replicaSet=rs0&directConnection=true`.

Steps:
1. `npm ci`
2. `docker compose up -d` and wait for `mongo` to be `healthy` (`docker compose ps`).
3. `cp .env.example .env.local` and fill in values (local values above).
4. `npm run s3:setup` (creates the bucket and CORS for `APP_URL`).
5. `npm run db:indexes`
6. `npm run admin:create -- --email you@cutm.ac.in --name "Your Name"` (prints a one-time invitation link)
7. `npm run dev` and, in another terminal, `npm run worker:dev`.
8. Mail: http://localhost:8025 · Object storage console: http://localhost:9001

If Docker Hub rate-limits anonymous pulls, the Google mirror serves the same official images (`mirror.gcr.io/library/mongo:8.0`, then `docker tag` it); this was needed during verification.

### 3.1 Live engine locally (M03, reference LiveKit — verified with v1.13.9)

`livekit.yaml` in the repository holds the development keys (`lmsdevkey`, matching `.env.example`) and sends webhooks to `http://localhost:3000/api/webhooks/live` (`npm run dev`) and `http://localhost:3100/api/webhooks/live` (the e2e build). Start the engine one of two ways:

- **Without Docker (macOS):** `brew install livekit`, then `livekit-server --config livekit.yaml`. The GitHub releases of v1.13 ship Linux and Windows builds only (checked 16 Oct 2026); to run it without installing, `brew fetch livekit` and unpack the bottle (`tar -xzf "$(brew --cache livekit)"`), which holds `livekit/<version>/bin/livekit-server` (v1.13.10 used for M03).
- **Docker (Linux):** `docker compose --profile live up -d livekit`. The service uses the host network, so the webhook URLs reach the app on `localhost` and WebRTC needs no port mapping (on Docker Desktop, turn host networking on first).

Env: `LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_URL=http://localhost:7880`, key/secret as in the file. Run the worker too (`npm run worker:dev`): it finalizes attendance after a class ends. Verified behaviour: tokens with the grants in 06 §4.3 connect; the webhook receiver gets `room_started`, `participant_joined` (identity = user id), `participant_left`, `room_finished`, each signed and accepted by `WebhookReceiver.receive`. Event `createdAt` is **Unix seconds** — convert with `new Date(Number(createdAt) * 1000)`. The engine closes a room about 20 s after its last participant leaves and sends `room_finished`; before the class's scheduled end the LMS keeps the class live and the room opens again when someone rejoins (Q-50).

### 3.2 Code runner locally (M05, reference Judge0 CE 1.13.1)

Judge0 runs only on a Linux host using cgroup v1 (`systemd.unified_cgroup_hierarchy=0` on the kernel command line). Use the release archive's own compose file (`judge0-v1.13.1.zip`): set `REDIS_PASSWORD`, `POSTGRES_PASSWORD` and `AUTHN_TOKEN` in `judge0.conf`, `docker compose up -d db redis`, then `docker compose up -d`. On macOS/Windows development machines, point `CODE_RUNNER_URL` at a shared Linux dev runner. Never expose Judge0 to the internet.

## 4. Production topology

```
Internet ─► Load balancer (TLS; overwrites X-Forwarded-For) ─► web × N (Docker, standalone Next.js)
Browsers ─► LiveKit nodes (self-hosted; WebRTC UDP 50000–60000, TCP 7881, TURN/TLS 443) ─► webhooks ─► web
Browsers ─► Cloudflare R2 (presigned PUT/GET; zero egress)
web × N, worker × M ─► MongoDB replica set (3 nodes) · Redis (AOF) · R2
worker ─► SMTP relay · GitHub API · Anthropic API · Judge0 (private network) · exam system (Q-04)
```

Sizing to start (adjust after the M11 load test): web 2 × (2 vCPU, 2 GB); worker 1 × (2 vCPU, 4 GB — transcodes); MongoDB 3 × (4 vCPU, 16 GB, SSD); Redis 1 × 2 GB; LiveKit 2 nodes to start (measure with `lk load-test` before launch; a room must fit on one node, nodes add rooms — LiveKit's benchmark guide); Judge0 sized for 600 concurrent test-takers with `runCooldownSec` 3 s.

### 4.1 LiveKit in production (ADR-18)
- Run `livekit/livekit-server:v1.13` on Linux VMs with **host networking** and a public IP; open UDP 50000–60000, TCP 7881, and TCP 443 for TURN/TLS. Many campus and mobile networks block UDP — enable LiveKit's embedded TURN with a TLS certificate on 443 so those students still connect.
- Multi-node: point every node at the same Redis (`redis:` block in `livekit.yaml`); LiveKit then places each room on one node. Add nodes for more simultaneous classes.
- Keys: a production `keys:` pair and `webhook.api_key`; webhook URL `https://<APP_URL host>/api/webhooks/live`.
- Choose hosting where outbound bandwidth is included or cheap: live video is the largest bandwidth consumer (~1 Mbps per watching student). This choice matters more than server size (Q-12).
- Zero-ops alternative: LiveKit Cloud runs the same protocol; switching is an env change (`LIVEKIT_URL`, `LIVEKIT_API_URL`, key/secret). Compare its current price before choosing it.

### 4.2 Cost model (why this stack is cheap at scale)
Costs that grow with students watching video are the ones to control:

| Item | This stack | Per-minute video APIs (e.g. Mux) |
|---|---|---|
| Live class delivery | Server + bandwidth on our LiveKit nodes; no per-viewer fee | Billed per viewer-minute delivered, plus live encoding per stream-minute |
| Recorded lecture delivery | **R2 egress is free**; reads cost ~$0.36 per million requests | Billed per viewer-minute delivered |
| Storage | R2 ~$0.015/GB-month (originals + 480p copies) | Billed per stored minute |
| Teacher setup | Browser only | Live needs RTMP software (OBS) — no browser ingest |

Illustration (verify current prices before quoting to the client): 40 live classes/day × 60 min × 150 students × 22 days ≈ 7.9 M viewer-minutes per month. At a per-minute delivery rate around $0.001, a per-minute API would bill roughly $7,900/month for delivery alone, before encoding and recorded-lecture viewing. On this stack the same month is the fixed cost of the LiveKit nodes and their bandwidth. R2 prices quoted here are from third-party summaries of Cloudflare's pricing; confirm on Cloudflare's pricing page.

## 5. Build and deploy

**Dockerfile** (multi-stage, two targets):
- `deps`: `node:24-bookworm-slim`, `npm ci`.
- `build`: copy source, `npm run build` (no secrets needed — 02 §5).
- `web` (target): `node:24-bookworm-slim`, copy `.next/standalone`, `.next/static` → `.next/standalone/.next/static`, `public` → `.next/standalone/public`; `CMD ["node", "server.js"]`; non-root user; `HEALTHCHECK` on `/api/health`.
- `worker` (target): copy `node_modules` (includes the `ffmpeg-static` binary, downloaded by its install script — the build needs network access to GitHub releases), `lib`, `worker`, `scripts`, `tsconfig.json`, `package.json`; `CMD ["npx", "tsx", "--conditions=react-server", "worker/index.ts"]`.

**Deploy sequence:**
1. Backup (§6).
2. `npm run db:indexes` against the target (creates collections and indexes; never drops).
3. Roll out `worker`, then `web` (rolling, one instance at a time; health check must pass).
4. Smoke test: `/api/health`, log in as the smoke-test admin, open a course.
5. Record the release in `PROGRESS.md`.

`scripts/sync-indexes.ts` imports every model and calls `Model.createCollection()` then `Model.createIndexes()`. It never calls `syncIndexes()` (that drops unlisted indexes).

### 5.1 Moving to catalogue v2 (M01b, once per environment)
1. Back up the database (§6) and keep the dump until the course list is loaded.
2. Deploy the M01b build, then run `npm run db:migrate:catalog-v2` against the target **before** `npm run db:indexes`. It merges courses that share a code (offerings and calendar outcome ids follow), splits old credit numbers into T-P-Pj (flagged "check T-P-Pj" where it had to guess), turns each rich-text syllabus into one module, links courses to their old programmes, turns PO/PSO lists into outcome titles, copies credits and the evaluation policy onto offerings, drops the old course indexes and the `evaluationschemes` collection, and writes one `catalog.migrated` audit entry. Run it again: it must say "nothing to change".
3. `npm run db:indexes` (the unique course code index needs step 2 first).
4. Set each programme's department on its page if it has none, and check Settings → Evaluation policy.
5. Upload the course list on Imports (the Course Repository converted to the CSV of 06 §8.5; it is kept outside the repository — record its row count and checksum in `PROGRESS.md`). Tick "Create programmes that do not exist yet" only on the first load.
6. Start a courseware import, "Pages not imported yet", in the evening: about 1,300 pages at most one a second take at least 25 minutes, and 5–6 hours when the site is slow; the worker must stay up. Check the run page the next day; failed pages are listed with the reason.
7. Assign coordinators on the catalogue, starting with the courses offered this term.

## 6. Backups and restore

- MongoDB: nightly `mongodump --oplog` (or the managed service's continuous backup) retained 30 days; weekly copy off-site retained 6 months.
- Object storage: bucket versioning on; lifecycle rule deletes noncurrent versions after 30 days.
- Redis: AOF on; queue loss is recoverable (schedulers re-register on worker start; syncs re-run).
- **Restore drill** every 30 days into a scratch environment; record the date and duration in `PROGRESS.md`. A release gate requires a drill within the last 30 days.

## 7. Monitoring and alerting

| Signal | Source | Alert when |
|---|---|---|
| Uptime | External monitor on `/api/health` every minute | 2 consecutive failures |
| Error rate | JSON logs (`level: error`) | > 1 % of requests over 5 min |
| Latency | Load balancer metrics | p95 > 1.5 s over 10 min |
| Failed jobs | BullMQ failed count per queue (admin integrations page; worker logs `job failed`) | > 20 in 1 h, or any `sync` job failed 3 times |
| Live engine | LiveKit's own metrics | its documented thresholds |
| Disk / DB | MongoDB metrics | replication lag > 10 s; disk > 80 % |

Target availability (NFR-08, proposal): 99.5 % monthly, with change freezes during end-sem and scheduled live-class peaks.

## 8. Support runbook (SUP-01; SLA proposal SUP-04 — confirm Q-14)

| Request | Who | How |
|---|---|---|
| Student can't log in | support | `/admin/users` → find → "Send reset link". Never set passwords by hand |
| Not seeing a course | support → admin | Check enrollment on the offering's People tab; admin fixes |
| Wrong attendance | faculty | Manual override on the session (audited) |
| Wrong mark | faculty | Regrade the submission (audited); if locked, admin unlocks with a reason |
| End-sem import errors | admin | `/admin/exams` → download the mismatch report → fix the CSV → re-import |
| GitHub commits missing | admin | `/admin/integrations` → re-sync the project; check the App installation |
| Live class failing | admin | Check LiveKit status; reschedule; attendance can be marked manually |

Proposed SLA: P1 (platform down / exam-day blocker) response 30 min, resolution 4 h; P2 (feature broken for a class) response 4 h, resolution 2 business days; P3 (individual issue) response 1 business day.
