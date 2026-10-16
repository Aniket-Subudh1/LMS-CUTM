# 10 · Testing and validation

An agent's report is a claim; a test run or a human walkthrough is the verification. This document defines both.

## 1. Test layers

| Layer | Tool | Location | What it proves | Runs in CI |
|---|---|---|---|---|
| Unit | Vitest (`unit` project) | `lib/**/*.test.ts` next to the code | Pure functions: every vector table in `07-ALGORITHMS.md`, CSV row validation, schema edge cases, the `action()` wrapper | every push |
| Integration | Vitest (`integration` project) + MongoDB replica set | `tests/integration/**/*.test.ts` | DAL scoping, actions end to end (validation, auth, writes, audit), jobs, transactions | every push |
| End-to-end | Playwright | `tests/e2e/**/*.spec.ts` | Critical user journeys in a real browser against a production build | every PR to `main`; every release |
| Load | k6 (external binary) | `tests/load/*.js` | Capacity targets (02 §11) | M11 and before each release |
| Manual validation | A human, with the milestone checklist | milestone files | What tests cannot: real email inbox, webcam, second device, usability | each milestone |

## 2. Vitest configuration (verified)

```ts
// vitest.config.ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./', import.meta.url)),
  'server-only': fileURLToPath(new URL('./tests/server-only.ts', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: 'unit', environment: 'node', include: ['lib/**/*.test.ts'] } },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
```

```ts
// tests/server-only.ts — `server-only` throws outside React Server Components; tests alias it to this
export {};
```

```ts
// tests/setup.ts (M00 content; M02 adds the S3_* test values)
import { afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Redis } from 'ioredis';
import './next-request';

let memory: MongoMemoryReplSet | undefined;

beforeAll(async () => {
  if (process.env.TEST_MONGODB_URI) {
    const url = new URL(process.env.TEST_MONGODB_URI);
    url.pathname = `/lms_test_${process.pid}`;
    process.env.MONGODB_URI = url.toString();
  } else {
    memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = memory.getUri('lms_test');
  }
  Object.assign(process.env, {
    APP_URL: 'http://localhost:3000',
    REDIS_URL: 'redis://localhost:6379/1',
    SESSION_PASSWORD: 'test-session-password-at-least-32-chars',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    MAIL_FROM: 'CUTM LMS <lms@test.local>',
    LOG_LEVEL: 'error',
  });
  // Redis database 1 belongs to the tests: start every file without rate-limit counters or queued jobs.
  const redis = new Redis(process.env.REDIS_URL ?? '');
  await redis.flushdb();
  await redis.quit();
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await memory?.stop();
});
```

```ts
// tests/next-request.ts (imported by tests/setup.ts)
import { vi } from 'vitest';

// Integration tests run actions outside a Next request. This stands in for one browser: its cookies and its IP.
export const browser = { cookies: new Map<string, string>(), ip: '203.0.113.1' };

export function switchBrowser(cookies: Map<string, string>, ip = '203.0.113.1') {
  browser.cookies = cookies;
  browser.ip = ip;
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = browser.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => [...browser.cookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      if (value === '') browser.cookies.delete(name);
      else browser.cookies.set(name, value);
    },
  }),
  headers: async () => new Headers({ 'x-forwarded-for': browser.ip }),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

vi.mock('next/cache', () => ({ refresh: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));
```

- Actions run for real: `cookies()` is an in-memory jar, so `signIn`/`getViewer`/`signOut` go through iron-session unchanged. `switchBrowser(new Map())` starts a fresh browser; keep two `Map`s to test "the other browser" (verified in `tests/integration/profile.test.ts`).
- `redirect()` throws an error whose **digest** holds the target: `await expect(act(fd)).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/home;/) })` (the message is just `NEXT_REDIRECT`).
- Redis database **1** belongs to the tests and is flushed at the start of every file (rate-limit counters, queued jobs). A test file that touches the queue closes `mailQueue()` and quits `redis()` in `afterAll`.
- **Every required env var must be set in `tests/setup.ts`.** When you add one to `lib/env.ts`, add a test value here in the same commit.
- `mongodb-memory-server` downloads a `mongod` binary from `fastdl.mongodb.org` on first run. Where that host is blocked (some CI/sandbox networks), start the compose stack and set `TEST_MONGODB_URI='mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'` — this is how the canonical patterns were verified.
- Transactions require the collection to exist: call `Model.createCollection()` in a test's setup for any collection written inside a transaction (production collections are created by `scripts/sync-indexes.ts`).

### 2.1 Testing actions (verified pattern)

```ts
import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('next/cache', () => ({ refresh: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  getViewer: vi.fn(async () => ({ id: new Types.ObjectId().toString(), name: 'Admin', email: 'admin@cutm.ac.in', roles: ['admin'], departmentId: null })),
}));

describe('renameOffering', () => {
  it('validates, writes, and rejects unknown ids', async () => {
    const { db } = await import('@/lib/db');
    const { Offering } = await import('@/lib/models/offering');
    const { renameOffering } = await import('@/app/(app)/courses/actions');
    await db();
    await Offering.createCollection();
    const o = await Offering.create({ courseId: new Types.ObjectId(), termId: new Types.ObjectId(), departmentId: new Types.ObjectId(), title: 'Old', facultyIds: [] });

    expect(await renameOffering({ offeringId: String(o._id), title: 'x' })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await renameOffering({ offeringId: String(o._id), title: 'New title' })).toEqual({ ok: true, data: { offeringId: String(o._id) } });
    expect((await Offering.findById(o._id).lean())?.title).toBe('New title');
    await expect(renameOffering({ offeringId: new Types.ObjectId().toString(), title: 'Nope' })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
```

- Mock `@/lib/auth/session` to control the viewer; mock `next/cache` because there is no Next request context in tests.
- Import modules **inside** the test (after mocks and env are in place).
- `tests/factories.ts` holds `makeUser`, `makeOffering`, `makeAssessment`, … returning minimal valid documents; it is the only shared test helper file.

### 2.2 Required integration tests (every milestone)

For each new DAL read: one test that a user with access gets the data and one that a user **without** access gets `notFound` / an empty result. For each new action: invalid input → `VALIDATION`; wrong role → `FORBIDDEN`; another offering's id → 404; success path writes what the milestone says, including the audit entry where 09 §6 requires one.

## 3. End-to-end tests (Playwright)

- `playwright.config.ts`: `testDir: 'tests/e2e'`, Chromium only, `baseURL: 'http://localhost:3100'`, `webServer.command: 'npm run start:e2e'` (builds nothing — CI builds first), `reuseExistingServer: !process.env.CI`.
- `start:e2e` runs the standalone server with `.env.e2e` (database `lms_e2e`) after `npm run db:indexes:e2e` and `npm run db:seed:e2e` (`scripts/seed.ts --e2e`, safe to repeat) creates deterministic fixtures (M01b): one admin, one HoD, two faculty, twenty students (B.Tech section A), departments CSE and MATH, programmes BTECH-CSE (NBA PO titles, baskets I, II and IV, batch 2025 with sections A and B) and MSC-MATH, one term, five real CUTM courses — CUTM1602 Programming in C 1-2-1 (fixture outcomes, mapping, two modules and six sessions; faculty1 coordinates it), CUTM1001 2-0-1, CUTM1014 1.5-0-1.5, CUTM1535 3-0-1 with its public courseware content read from `tests/fixtures/courseware/836.html`, and the non-credit SK01 0-0-0 — and two offerings (CUTM1602 section A with the twenty students; SK01 section B with nobody enrolled). All fixture users share the password `E2E_PASSWORD`; their emails are `admin@`, `hod@`, `faculty1@`, `faculty2@` and `student01@`…`student20@seed.cutm.test`.
- Seeded e2e passwords exist only in `.env.e2e` (never committed with real values; CI generates them).
- `.env.e2e` (gitignored; CI generates it) — M00 content:
  ```
  PORT=3100
  APP_URL=http://localhost:3100
  MONGODB_URI=mongodb://localhost:27017/lms_e2e?replicaSet=rs0&directConnection=true
  REDIS_URL=redis://localhost:6379/2
  SESSION_PASSWORD=<openssl rand -base64 32>
  SMTP_HOST=localhost
  SMTP_PORT=1025
  SMTP_SECURE=false
  MAIL_FROM="CUTM LMS <lms@localhost>"
  LOG_LEVEL=info
  E2E_PASSWORD=<openssl rand -hex 12>
  S3_ENDPOINT=http://localhost:9000        # M02: the compose stack's RustFS
  S3_REGION=us-east-1
  S3_BUCKET=cutm-lms-e2e
  S3_ACCESS_KEY_ID=lmsdev
  S3_SECRET_ACCESS_KEY=lmsdev-secret-key
  S3_FORCE_PATH_STYLE=true
  LIVEKIT_URL=ws://localhost:7880           # M03: the development keys in livekit.yaml
  LIVEKIT_API_URL=http://localhost:7880
  LIVEKIT_API_KEY=lmsdevkey
  LIVEKIT_API_SECRET=lms-dev-livekit-secret-at-least-32-chars
  ```
  `LOG_LEVEL` must be at least `info`: Playwright starts the worker (`npm run worker:e2e`) as a second `webServer` and waits for its `worker started` line.
- The compose stack must be running (Mongo, Redis, Mailpit, RustFS), `npm run s3:setup:e2e` must have created the e2e bucket with its CORS rule (M02), and `npm run build` must have run. The worker that Playwright starts transcodes uploaded lectures with the bundled ffmpeg. Tests read emails from Mailpit (`GET http://localhost:8025/api/v1/messages`, then `/api/v1/message/<ID>` → `Text`).
- M03: a LiveKit server must be running with `livekit.yaml` (11 §3.1), whose webhooks reach the e2e build on port 3100; CI starts it with `docker run --network host`. `playwright.config.ts` launches Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, so the room gets a fake camera and microphone without a permission prompt. `tests/e2e/live.spec.ts` runs a class end to end with two browser contexts (faculty and student).
- Next keeps the previous page mounted but hidden after a client navigation, and `getByLabel` matches hidden elements: look fields up with `page.getByLabel(label).filter({ visible: true })` (the `field()` helper in `tests/e2e/auth.spec.ts`); `getByRole` already ignores hidden elements. Use `exact: true` when one label is a prefix of another ("New password" / "Repeat the new password"). After a click that navigates client-side, wait for the new page (`toHaveURL` or its heading) before filling: for a moment both forms are visible and a fill can bind to the old one as it is hidden (verified failure, with trace).
- Courseware fixtures (`tests/fixtures/courseware/*.html`) are real public pages trimmed to their `<main>` (scripts and icons removed) with any contact details replaced by fake ones; never commit a page with a real phone number or email (A-60). The courseware import test serves them through a mocked adapter, so tests never call the real site.
- Run `npx playwright install chromium` once. In a sandbox with a preinstalled Chromium of another revision, set `PW_CHROMIUM_PATH` to its executable; `playwright.config.ts` passes it as `launchOptions.executablePath` only when set.

Journeys added per milestone are listed in each milestone file; together they form the release suite.

## 4. npm scripts (created in M00)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local web |
| `build` | `next build` | Production build (standalone output) |
| `start` | `node .next/standalone/server.js` | Production web (Docker copies `.next/static` — and `public/` once it has files — into the standalone folder) |
| `start:local` | `cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ && node --env-file-if-exists=.env.local .next/standalone/server.js` (add `cp -r public .next/standalone/` when `public/` gets its first file — git does not keep empty folders) | Run a production build locally (`next start` does not work with `output: 'standalone'` — verified warning) |
| `start:e2e` | `cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ && node --env-file=.env.e2e .next/standalone/server.js` (`.env.e2e` sets `PORT=3100`) | Playwright target |
| `worker` | `tsx --env-file-if-exists=.env.local --conditions=react-server worker/index.ts` | Background worker |
| `worker:dev` | `tsx watch --env-file-if-exists=.env.local --conditions=react-server worker/index.ts` | Worker with reload (verified) |
| `db:indexes` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/sync-indexes.ts` | Create collections + indexes |
| `db:seed` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/seed.ts` | Development data (users stay invited; needs an existing administrator) |
| `db:indexes:e2e` | `tsx --env-file=.env.e2e --conditions=react-server scripts/sync-indexes.ts` | Collections and indexes in the e2e database (the production server does not auto-create them) |
| `db:seed:e2e` | `tsx --env-file=.env.e2e --conditions=react-server scripts/seed.ts --e2e` | e2e fixtures with passwords |
| `db:migrate:catalog-v2` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/migrate-catalog-v2.ts` | One-off move of an M01/M02 database to catalogue v2 (11 §5.1); a second run changes nothing |
| `s3:setup:e2e` | `tsx --env-file=.env.e2e --conditions=react-server scripts/s3-setup.ts` | The e2e bucket and its CORS rule (M02) |
| `admin:create` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/create-admin.ts` | First admin account |
| `s3:setup` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/s3-setup.ts` | Create bucket + CORS |
| `lint` | `eslint` | |
| `typecheck` | `next typegen && tsc --noEmit` | `typegen` generates `PageProps`/`LayoutProps` |
| `test` | `vitest run --project unit` | |
| `test:integration` | `vitest run --project integration` | |
| `test:e2e` | `playwright test` | |
| `check` | `npm run lint && npm run typecheck && npm run test` | Run after every task |
| `check:bundle` | `tsx --env-file-if-exists=.env.local scripts/check-bundle.ts` | Secret scan of `.next/static` (09 §7): forbidden names always; the values of secret variables when they are set (locally, from `.env.local`) |
| `format` | `prettier --write .` | |

`--env-file-if-exists` loads `.env.local` when present (Next.js loads it automatically for `next dev`; the worker and scripts do not). A missing variable fails loudly through `env()`.

## 5. Continuous integration — `.github/workflows/ci.yml` (M00)

On every push and pull request (two parallel jobs, Node 24, `npm ci`):
1. **verify:** `npm run lint`, `npm run typecheck`, `npm run test`, then `npm run build` with **no** env (the build needs none — 02 §5) and `npm run check:bundle`.
2. **integration:** a `redis:8.6` service container; `npm run test:integration` **without** `TEST_MONGODB_URI`, so `tests/setup.ts` starts a mongodb-memory-server replica set (GitHub service containers cannot pass `--replSet`). The `mongod` binary is cached at `/home/runner/.cache/mongodb-binaries` (`MONGOMS_DOWNLOAD_DIR`, an absolute path: Node does not expand `~`).
3. From M01 (when `scripts/seed.ts` exists), on pull requests to `main`: start the stack, `npm run db:indexes:e2e`, `npm run db:seed:e2e`, `npm run test:e2e`. Until then e2e runs locally (M00 T9).

## 6. Release gates

A release (R1–R4, Launch) goes to staging only when every box is ticked and recorded in `PROGRESS.md`:

- [ ] All milestones in the release are `Done`; their validation checklists are signed by a human (`Validated`).
- [ ] CI green on the release commit, including e2e.
- [ ] `npm run check:bundle` clean.
- [ ] No open question tagged `blocks: release` unanswered.
- [ ] `scripts/sync-indexes.ts` run against staging; no index build errors.
- [ ] Backup taken before deploy; restore of that backup tested within the last 30 days (11 §6).
- [ ] Load test for the release's critical paths meets 02 §11 at staging scale (from R2 onward).
- [ ] Release notes list delivered requirement IDs and known gaps.

## 7. How to report verification (in `PROGRESS.md`)

Paste the command and the summary line it printed, e.g.:

```
npm run check            → eslint: 0 problems · tsc: 0 errors · Tests 41 passed (41)
npm run test:integration → Tests 23 passed (23) (TEST_MONGODB_URI=local compose)
```

List manual steps you **did** perform and those you **did not** (with why). Never write "tested" without the output.
