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
// tests/setup.ts
import { afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

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
    REDIS_URL: 'redis://localhost:6379',
    SESSION_PASSWORD: 'test-session-password-at-least-32-chars',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'lms-test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
    S3_FORCE_PATH_STYLE: 'true',
  });
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await memory?.stop();
});
```

- **Every required env var must be set in `tests/setup.ts`.** When you add one to `lib/env.ts`, add a test value here in the same commit.
- `mongodb-memory-server` downloads a `mongod` binary from `fastdl.mongodb.org` on first run. Where that host is blocked (some CI/sandbox networks), start the compose stack and set `TEST_MONGODB_URI='mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'` — this is how the canonical patterns were verified.
- Transactions require the collection to exist: call `Model.createCollection()` in a test's setup for any collection written inside a transaction (production collections are created by `scripts/sync-indexes.ts`).

### 2.1 Testing actions (verified pattern)

```ts
import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('next/cache', () => ({ refresh: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  getViewer: vi.fn(async () => ({ id: new Types.ObjectId().toString(), name: 'Admin', roles: ['admin'], departmentId: null })),
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
- `start:e2e` runs the standalone server with `.env.e2e` (database `lms_e2e`) after `scripts/seed.ts --e2e` creates deterministic fixtures: one admin, one HoD, two faculty, twenty students, one department, one ugc program with a batch, one skill program, one term, two offerings.
- Seeded e2e passwords exist only in `.env.e2e` (never committed with real values; CI generates them).
- In a sandbox where Playwright's browsers are preinstalled, launch with the preinstalled Chromium; elsewhere run `npx playwright install chromium` once.

Journeys added per milestone are listed in each milestone file; together they form the release suite.

## 4. npm scripts (created in M00)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local web |
| `build` | `next build` | Production build (standalone output) |
| `start` | `node .next/standalone/server.js` | Production web (Docker copies `public` and `.next/static` into the standalone folder) |
| `start:local` | `cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/ && node --env-file-if-exists=.env.local .next/standalone/server.js` | Run a production build locally (`next start` does not work with `output: 'standalone'` — verified warning) |
| `start:e2e` | same as `start:local` with `.env.e2e` and `PORT=3100` | Playwright target |
| `worker` | `tsx --env-file-if-exists=.env.local --conditions=react-server worker/index.ts` | Background worker |
| `worker:dev` | `tsx watch --env-file-if-exists=.env.local --conditions=react-server worker/index.ts` | Worker with reload (verified) |
| `db:indexes` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/sync-indexes.ts` | Create collections + indexes |
| `db:seed` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/seed.ts` | Development / e2e fixtures |
| `admin:create` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/create-admin.ts` | First admin account |
| `s3:setup` | `tsx --env-file-if-exists=.env.local --conditions=react-server scripts/s3-setup.ts` | Create bucket + CORS |
| `lint` | `eslint` | |
| `typecheck` | `next typegen && tsc --noEmit` | `typegen` generates `PageProps`/`LayoutProps` |
| `test` | `vitest run --project unit` | |
| `test:integration` | `vitest run --project integration` | |
| `test:e2e` | `playwright test` | |
| `check` | `npm run lint && npm run typecheck && npm run test` | Run after every task |
| `check:bundle` | `tsx scripts/check-bundle.ts` | Secret scan of `.next/static` (09 §7) |
| `format` | `prettier --write .` | |

`--env-file-if-exists` loads `.env.local` when present (Next.js loads it automatically for `next dev`; the worker and scripts do not). A missing variable fails loudly through `env()`.

## 5. Continuous integration — `.github/workflows/ci.yml` (M00)

On every push and pull request:
1. `npm ci`
2. `npm run lint`, `npm run typecheck`, `npm run test`
3. Start service containers `mongo:8.0` (with `--replSet rs0`, initiated in a step) and `redis:8.6`; run `npm run test:integration` with `TEST_MONGODB_URI`.
4. `npm run build` with placeholder env (the build needs none — 02 §5), then `npm run check:bundle`.
5. On pull requests to `main`: start the stack, `npm run db:seed -- --e2e`, `npm run test:e2e`.

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
