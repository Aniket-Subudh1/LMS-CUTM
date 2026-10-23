# 03 · Tech stack

Every version below was checked against the npm registry or Docker Hub on 12 Oct 2026, and the core patterns were compiled, built and run against them (see `PROGRESS.md`, entry 0). Install **exact** versions (`npm install --save-exact`). Upgrades are their own task with their own commit.

**Before you use any API of a package below, read its installed types or README** (`node_modules/<pkg>/README.md`, `node_modules/<pkg>/dist/*.d.ts`). Several packages had major releases in 2025–26 whose APIs differ from older training data; the "Breaking changes you will hit" column lists the ones that matter here.

## 1. Runtime and infrastructure

| Component | Version | Notes |
|---|---|---|
| Node.js | 24 LTS (Docker `node:24-bookworm-slim`); `engines: ">=22.13"` | iron-session 9 requires ≥ 22.13 |
| MongoDB | 8.0 (Docker `mongo:8.0`) | Replica set required (transactions). Local: single-node `rs0` |
| Redis | 8.6 (Docker `redis:8.6`) | `--appendonly yes --maxmemory-policy noeviction` (queues must not be evicted) |
| Object storage | **Cloudflare R2** in production (S3 API, zero egress — ADR-19); local `rustfs/rustfs:1.0.1` | Any S3-compatible service works with the same code. `minio/minio` is no longer published on Docker Hub (verified 404) |
| Local mail catcher | `axllent/mailpit:v1.31` | SMTP on 1025, web UI on 8025 |
| Live engine | `livekit/livekit-server:v1.13`, self-hosted (ADR-18) | Verified v1.13.9 with our token grants and webhooks. Enable its embedded TURN (TLS on 443) for campus networks that block UDP. LiveKit Cloud is a drop-in alternative (env change only) |
| Code runner (reference) | Judge0 CE **v1.13.1** (release zip) | Host must use cgroup v1 (`systemd.unified_cgroup_hierarchy=0`). Do not expose it publicly; set `AUTHN_TOKEN` |

## 2. Already in the repository (keep)

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.4.0 | Framework. Bundled docs: `node_modules/next/dist/docs/` |
| `react`, `react-dom` | 19.3.0 | UI |
| `typescript` | ^5 | Types (`strict: true`) |
| `tailwindcss` | ^4 | Styling, via the `@tailwindcss/turbopack` loader configured in `next.config.ts` (no PostCSS config) |
| `@tailwindcss/turbopack` | ^4 (4.3.3 installed) | Tailwind loader for Turbopack |
| `eslint`, `eslint-config-next` | ^9, 16.4.0 | Linting (`npm run lint` runs `eslint`) |
| `@types/react`, `@types/react-dom` | ^19 | Types |
| `@types/node` | **change to 24.19.2** | Vitest 5 rejects `@types/node@20` (peer `^22 \|\| >=24`) — verified |

## 3. Dependencies to add (exact versions, by milestone)

| Package | Version | Milestone | Used for | Import allowed in | Breaking changes you will hit |
|---|---|---|---|---|---|
| `mongoose` | 9.11.1 | M00 | Models, queries, transactions | `lib/models`, `lib/data`, `lib/db.ts`, actions, worker | Pre-hooks get **no `next()`** — use `async function`. `findOneAndUpdate` uses `returnDocument: 'after'` (not `new: true`). `FilterQuery` renamed `QueryFilter`. Update pipelines throw unless `{ updatePipeline: true }`. Export models as `Model<Doc>` (04 §6.1) |
| `zod` | 4.6.7 | M00 | Validation everywhere | anywhere | `z.email()`, `z.url()` are top-level. Use `z.flattenError(err)` (not `err.flatten()`) |
| `iron-session` | 9.0.1 | M00 | Sealed session cookie, invitation/reset tokens | `lib/auth/` | ESM only; reads typed `Partial<T>`; store numbers not `Date`s; `onUnsealError` for logging |
| `@node-rs/argon2` | 2.2.2 | M00 | Password hashing (`hash`, `verify`) | `lib/auth/password.ts` | Native module; already in Next's built-in server-external list |
| `bullmq` | 6.3.13 | M00 | Queues, schedulers | `lib/queue.ts`, `worker/` | `ioredis` is now an **optional peer** — install it. Each Queue/Worker/QueueEvents needs its own connection. Repeat jobs: `upsertJobScheduler(id, { pattern, tz }, template)` |
| `ioredis` | 6.0.0 | M00 | Redis client | `lib/queue.ts`, `lib/rate-limit.ts`, `worker/` | `import { Redis } from 'ioredis'`; `maxRetriesPerRequest: null` for BullMQ |
| `@aws-sdk/client-s3` | 3.1149.0 | M00 | Object storage | `lib/integrations/storage.ts`, `scripts/` | `forcePathStyle: true` for non-AWS endpoints |
| `@aws-sdk/s3-request-presigner` | 3.1149.0 | M00 | Presigned PUT/GET | `lib/integrations/storage.ts` | — |
| `nodemailer` | 10.1.0 | M00 | SMTP | `lib/integrations/mail.ts` | Read the v10 README before use |
| `server-only` | 0.0.1 | M00 | Guard server modules from client bundles | server modules | Aliased to an empty module in Vitest |
| `@phosphor-icons/react` | 2.1.10 | UI redesign (13 Oct 2026; replaced `lucide-react` 1.48.0 at the client's request) | Icons beside labels, duotone weight (08 §1) | `app/`, `components/` | Server Components import from **`@phosphor-icons/react/ssr`** (the root entry uses React context, which a Server Component cannot read); client components import from `@phosphor-icons/react`. Import the `…Icon` names (`HouseIcon`), not the deprecated bare names. Pass `weight="duotone"` (or `"fill"` for an active state); size with Tailwind `size-*` classes |
| `radix-ui` | 1.6.7 | M00 | Accessible primitives under `components/ui/` (shadcn) | `components/ui/` | The unified package: `import { Dialog as SheetPrimitive } from 'radix-ui'` |
| `class-variance-authority` | 0.7.1 | M00 | Variant classes in shadcn primitives | `components/ui/` | — |
| `clsx`, `tailwind-merge` | 2.1.1, 3.7.0 | M00 | `cn()` in `lib/cn.ts` (merges conflicting Tailwind classes) | `lib/cn.ts` | tailwind-merge 3 is the Tailwind v4 line |
| `tw-animate-css` | 1.4.0 | M00 | Enter/exit animations used by shadcn (`animate-in`, `fade-in-0`) | `app/globals.css` | CSS only (`@import 'tw-animate-css'`) |
| `gsap` | 3.15.0 | M00 | Entrance and the slow drift of the floating cards on the sign-in photo panel. Core only; no plugins | `components/auth-stage.tsx` | Import `gsap` from `"gsap"`. `gsap.context` scopes selectors and `revert()` cleans up. `gsap.matchMedia()` skips motion when `prefers-reduced-motion: reduce`. Do not import `@gsap/react` or `gsap/all` |
| `recharts`, `react-is` | 3.10.1, 19.3.0 (matches React) | M03b (moved from M06 at Aniket's request, 17 Oct 2026) | shadcn `chart` primitive and the charts built on it | `components/ui/chart.tsx`, `components/bar-chart.tsx` (M06 adds `components/trend-chart.tsx`) | Client only, and loaded only by the pages that draw a chart: today the catalogue course and the Outcomes tab (checked in the build's `page_client-reference-manifest.js` files, 17 Oct 2026). A server component that imports `BarChart` puts Recharts on every page that imports that component's file. `Cell` is deprecated in 3.x and goes in 4.0: colour a bar with `shape={(props: BarShapeProps) => <Rectangle {...props} fill={…} />}`. The vendored `chart.tsx` came from `shadcn@4.21.4 view chart`; do not run `shadcn add chart`, which adds the `cn` and `lucide-react` packages, widens Recharts to `^3.8.0` and asks to overwrite `card.tsx` (observed 17 Oct 2026) |
| `@dnd-kit/core`, `@dnd-kit/sortable` | 6.3.1, 10.0.0 | M03b (the drag-and-drop ban lifted by Aniket, 17 Oct 2026) | Reordering modules, lessons and syllabus modules by drag, with a keyboard sensor | `components/sortable-list.tsx` | Give `DndContext` an `id` from `useId()` (else its ARIA ids differ between server and client). Every sortable list also has "Move up / down" in its row menu (04 §1) |
| `papaparse` | 5.7.0 | M01 | CSV parse/unparse for imports and exports | `lib/domain/csv.ts` | — |
| `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm` | 3.31.4 | M02 | Rich-text editor | `components/rich-text-editor.tsx` (StarterKit also in `lib/domain/rich-text.ts`) | `useEditor({ immediatelyRender: false })` for SSR. StarterKit 3 already includes Link and Underline (configure them with `StarterKit.configure({ link })`; do not add `@tiptap/extension-link`). The editor no longer re-renders on every transaction: read toolbar state with `useEditorState` |
| `ffmpeg-static` | 5.3.0 | M02 | Bundled ffmpeg binary for the 480p data-saver transcode (worker only; spawned as a separate process — GPL binary, not linked). The binary is fetched by the package's install script, approved in `package.json` `allowScripts` (npm 11 skips unapproved install scripts) | `worker/jobs/media.ts` | Always pass `-pix_fmt yuv420p -profile:v main` (without it a 1080p source can produce High 4:4:4 that phones cannot play — verified) and `-movflags +faststart`. The binary differs by platform: ffmpeg 7.0.2 on linux-x64 (verified 12 Oct 2026), ffmpeg 6.0 on macOS arm64 (observed 13 Oct 2026); the arguments work on both |
| `@tiptap/html` | 3.31.4 | M02 | Server-side render of stored rich text | `components/rich-text-view.tsx`, `lib/domain/rich-text.ts` | Import from **`@tiptap/html/server`**. Throws on unknown node types (use this as validation) |
| `happy-dom` | 20.14.6 | M02 | Peer of `@tiptap/html` (`^20.8.9`); since M01b also the courseware page parser | Imported directly **only** by `lib/integrations/courseware.ts`, with the same settings Tiptap uses (JavaScript evaluation, script, CSS and iframe loading off) | Do not install 21.x |
| `livekit-server-sdk` | 2.19.1 | M03 | Room tokens, webhooks, room service | `lib/integrations/live.ts` | `await token.toJwt()`; `await receiver.receive(body, authHeader)` |
| `livekit-client` | 2.22.4 | M03 | Browser SDK (peer of components) | `components/live-room.tsx` | — |
| `@livekit/components-react` | 2.9.24 | M03 | `LiveKitRoom`, `VideoConference` | `components/live-room.tsx` | — |
| `@livekit/components-styles` | 1.2.0 | M03 | Styles for the above | `components/live-room.tsx` | — |
| `qrcode` | 1.5.4 | M04b | The QR code of a test's share link (TP-01), drawn as an SVG string on the server. Writing a QR encoder (Reed–Solomon, masking) is not "reasonable code" | `components/assessment-builder.tsx`; `worker/jobs/test-files.ts` (a certificate's verification QR, drawn as vector squares from `QRCode.create(url).modules`, TP-12) | `import QRCode from 'qrcode'`; `await QRCode.toString(text, { type: 'svg', margin: 1 })`. Server only: the browser bundle never loads it. Its `yargs` dependency is for the CLI and is never imported |
| `pdfkit` | 0.17.2 | M04b | Scorecards, certificates and attempt reports as PDFs, made by the worker (TP-12). Laying out PDF pages by hand means writing a PDF serializer with font metrics, which is not "reasonable code"; a headless browser to print HTML would be a far heavier dependency in the worker | `worker/jobs/test-files.ts` | `new PDFDocument({ size: 'A4', layout?, margin })` piped to a file stream; `doc.table({ data, columnStyles, defaultStyle })` (breaks across pages itself); `doc.image(path, x, y, { height })`; `doc.link(...)`. Only the built-in Helvetica and Times are used, which print Windows-1252 — every string goes through `pdfSafe` (07 §20). Centred text cannot change font mid-line (it overlaps), so the certificate sets its sentence itself (`centred`) |
| `write-excel-file` | 4.1.1 | M04b | The Excel export of a test's results (TP-12). An .xlsx is zipped XML parts; writing them is not "reasonable code". Small (its one dependency is `fflate`) and write-only | `worker/jobs/test-files.ts` | `import writeXlsxFile from 'write-excel-file/node'`; `await writeXlsxFile([{ sheet, data: Row[], columns: [{ width }], stickyRowsCount }]).toFile(path)`; a cell is a value or `{ value, fontWeight: 'bold' }`. Dates are written as IST text, since Excel dates carry no time zone |
| `@uiw/react-codemirror` | 4.25.12 | M04b (from M05) | Code editor (its peers `codemirror`, `@codemirror/state`, `@codemirror/view` and `@codemirror/theme-one-dark` come with it) | `components/code-editor.tsx` | — |
| `@codemirror/lang-cpp` | 6.0.3 | M04b (from M05) | C/C++ highlighting | `components/code-editor.tsx` | — |
| `@codemirror/lang-java` | 6.0.2 | M04b (from M05) | Java highlighting | `components/code-editor.tsx` | — |
| `octokit` | 5.0.5 | M07 | GitHub App, OAuth, webhooks | `lib/integrations/github.ts` | `new App({ appId, privateKey, oauth, webhooks })`; `app.getInstallationOctokit(id)`; `app.webhooks.verifyAndReceive(...)` |
| `openai` | 7.27.0 | M04b (replaces `@anthropic-ai/sdk`, Aniket's choice of 18 Oct 2026: ChatGPT costs less) | Question drafts for the bank (M04b); CO/Bloom suggestions, CO-PO suggestions, engagement explanation (M09). Its peers (`zod` and the AWS, `undici`, `ws` ones) are optional; only `zod` is used | `lib/integrations/ai.ts` | `await client.responses.parse({ model, instructions, input, max_output_tokens, text: { format: zodTextFormat(Schema, name) } })` → `res.output_parsed` (null when the answer does not fit), with `zodTextFormat` from `openai/helpers/zod` (works with Zod 4; checked by converting `AiDrafts`). The model comes from `OPENAI_MODEL`; no reasoning option is sent, so a model without one also works |

### Dev dependencies

| Package | Version | Milestone | Purpose |
|---|---|---|---|
| `vitest` | 5.0.4 | M00 | Unit + integration tests (two projects; 10 §2) |
| `mongodb-memory-server` | 11.3.0 | M00 | Ephemeral MongoDB replica set for integration tests (downloads `mongod` on first run; set `TEST_MONGODB_URI` to use a real replica set instead) |
| `tsx` | 4.23.15 | M00 | Run `worker/index.ts` and `scripts/*.ts` |
| `@playwright/test` | 1.64.0 | M00 | End-to-end tests |
| `@next/playwright` | 16.4.0 | when the first `instant()` test is written | `instant()` helper for navigation assertions (optional use) |
| `prettier` | 3.9.10 | M00 | Formatting |
| `prettier-plugin-tailwindcss` | 0.8.1 | M00 | Class ordering |
| `@types/nodemailer` | 8.0.2 | M00 | Types |
| `@types/papaparse` | 5.5.2 | M01 | Types |
| `@types/qrcode` | 1.5.6 | M04b | Types |
| `@types/pdfkit` | 0.17.6 | M04b | Types |

## 4. `next.config.ts` additions

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: 'standalone',
  serverExternalPackages: ['bullmq', 'ioredis'], // bullmq loads ioredis with a dynamic require
  experimental: { serverActions: { bodySizeLimit: '2mb' }, optimizePackageImports: ['@phosphor-icons/react'] }, // body limit added in M01 for CSV imports (files never go through actions; the key lives under `experimental` in the installed Next 16.4 types); the icon barrel is rewritten to per-icon imports (UI redesign)
  turbopack: { rules: { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } } },
  headers: async () => [{ source: '/:path*', headers: SECURITY_HEADERS }], // 09 §8
};
```

`mongoose`, `mongodb`, `@node-rs/argon2` and `@aws-sdk/client-s3` are already in Next's built-in server-external list (`node_modules/next/dist/lib/server-external-packages.jsonc`); do not add them.

## 5. Deliberately not used

Do not add these. If you believe one is needed, raise an `@dev` open question with the concrete problem it solves.

| Not used | Use instead | Reason |
|---|---|---|
| Other UI kits (MUI, Chakra, Mantine, Ant Design, daisyUI) | shadcn/ui, vendored in `components/ui/` (08 §5.1) | One design system. shadcn was chosen by the client (M00) for a professional dashboard UI: its source lives in the repo, is Tailwind-native and accessible (Radix) |
| Other chart libraries (Chart.js, D3, Nivo, ECharts) | shadcn `chart` (Recharts) and `Progress` | One charting approach, styled by the same tokens |
| Toast libraries (incl. shadcn `sonner`) | Inline `Alert` in `ActionForm` | One feedback pattern, next to the form it concerns |
| Form libraries (react-hook-form, Formik) | Native forms + Server Actions + Zod | Already validated on the server |
| Client data libraries (TanStack Query, SWR, Redux, Zustand) | Server Components + `refresh()` | Data lives on the server |
| tRPC, GraphQL, axios | Server Actions; `fetch` inside adapters | No internal API |
| Prisma, TypeORM | Mongoose | ADR-02 |
| Auth.js / NextAuth, Better Auth, Passport | iron-session + argon2 | ADR-03 |
| moment, date-fns, dayjs, luxon | `Intl.DateTimeFormat` in `lib/format.ts` | Built in |
| lodash, ramda | Plain TypeScript | Built in |
| pino, winston | `lib/log.ts` (JSON lines to stdout) | 20 lines; no worker-thread transports to bundle |
| socket.io, ws | Live engine's own SDK; `sendBeacon` for telemetry | No socket server of our own |
| Monaco editor | CodeMirror 6 | Bundle size on low bandwidth |
| Mux, Cloudflare Stream, other per-minute video APIs | LiveKit self-hosted (live) + R2 MP4 (recorded) | Per-viewer-minute billing; Mux live needs RTMP/OBS (ADR-18, ADR-19) |
| hls.js, video.js, other player libraries | Native `<video>` | MP4 with range requests needs no library |
| i18n frameworks | — | English-only scope |

## 6. Adding a dependency

1. Confirm the platform and existing packages cannot do it in reasonable code.
2. Add it with `npm install --save-exact <pkg>@<version>`.
3. Add a row to §3 in the same commit: version, milestone, purpose, where it may be imported, breaking changes.
4. If it is server-only and fails to bundle, add it to `serverExternalPackages` with a comment naming the reason.
