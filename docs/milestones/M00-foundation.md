# M00 · Foundation

| | |
|---|---|
| Depends on | — |
| Requirements | NFR-03 (audit infrastructure), NFR-06 (auth, sessions, headers), NFR-07 (responsive shell), ADM-05 (user accounts, first admin), SUP-01 (support role exists), SUP-04 (health endpoint) |
| Release | — (part of R1) |
| Packages added | 03 §3 rows marked M00 (+ dev dependencies); `@types/node` → 24.19.2 |
| Env vars added | `NODE_ENV`, `APP_URL`, `MONGODB_URI`, `REDIS_URL`, `SESSION_PASSWORD`, `SMTP_*`, `MAIL_FROM`, `LOG_LEVEL` |
| Collections | `users`, `auditLogs` |

## Goal

A secure, deployable skeleton every later milestone builds on: tooling, local stack, the canonical core modules from 04 §6, email + password authentication with invitations and resets, the role-aware app shell, the worker, audit, health check and CI. After M00 a human can start the stack, create the first admin, receive the invitation in Mailpit, set a password, sign in, change the password and sign out everywhere.

## In scope / out of scope

- **In:** everything in the tasks below.
- **Out:** any academic entity (M01), file storage (M02 — S3 env vars arrive there), notifications (M02), SSO (Q-13).

## Before you start

- Read 02, 03, 04 (all of §6), 06 §1–2, 09 §4, §7–9, 10, 11 §2–3.
- `docker compose up -d` must work on your machine (the file is created in T1).

## Tasks

### T1 · Tooling and configuration
Files: `package.json`, `next.config.ts`, `tsconfig.json` (unchanged unless needed), `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `playwright.config.ts`, `compose.yaml`, `.env.example`, `README.md`, `app/page.tsx`, `public/` (remove the five create-next-app SVGs), `tests/server-only.ts`, `tests/setup.ts`.

1. `package.json`: `"type": "module"`, `"engines": { "node": ">=22.13" }`, the scripts in 10 §4 except `s3:setup` (M02), exact versions from 03 §3 (`npm install --save-exact`) for packages M00 actually imports (`lucide-react` and `@next/playwright` wait for their first use), `@types/node` 24.19.2.
2. `next.config.ts`: 03 §4 without `serverActions` (added in M01) (`SECURITY_HEADERS` from 09 §8 defined in the same file). Add `!.env.example` to `.gitignore` (the scaffold's `.env*` rule ignores it).
3. `.prettierrc.json`: `{ "singleQuote": true, "printWidth": 120, "plugins": ["prettier-plugin-tailwindcss"] }`. Run `npm run format` once.
4. `vitest.config.ts`, `tests/setup.ts`, `tests/server-only.ts`: exactly 10 §2 (without the S3 variables until M02).
5. `playwright.config.ts`: 10 §3.
6. `compose.yaml`: exactly 11 §3.
7. `.env.example`: every M00 variable with local values (`MONGODB_URI=mongodb://localhost:27017/lms_dev?replicaSet=rs0&directConnection=true`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, `MAIL_FROM="CUTM LMS <lms@localhost>"`).
8. `app/page.tsx`: `redirect('/home')`. Delete the scaffold SVGs in `public/` and the scaffold markup.
9. `README.md`: what the project is, the local setup steps from 11 §3, and a pointer to `docs/00-START-HERE.md`.

Verify: `npm run lint`, `npm run typecheck`, `npm run build` all succeed.

### T2 · Core library (pure + infrastructure)
Files: `lib/env.ts`, `lib/db.ts`, `lib/log.ts` (+ test), `lib/errors.ts`, `lib/schemas/common.ts` (`objectId`, `ROLES` only).

Helpers whose first caller is a later milestone are created there, not here (deletion test, 04 §1): `lib/format.ts`, `lib/domain/time.ts` and `page`/`pageSize` in M01; `lib/domain/round.ts` in M04; the `settings` model in M02.

- Copy 04 §6.2 (`env`, `db`), 06 §1 (`errors`), 04 §6.3 (`common`, minus `page`/`pageSize`) exactly. `env` contains only the M00 variables listed above (`SMTP_PORT` via `z.coerce.number()`, `SMTP_SECURE` via `z.stringbool()`, `LOG_LEVEL` enum default `info`).
- `lib/log.ts`: JSON lines to stdout/stderr with `level`, `msg`, `time` and fields; errors serialized as `{ name, message, stack }`; levels below `LOG_LEVEL` are dropped.

### T3 · Models and index sync
Files: `lib/models/user.ts`, `lib/models/audit-log.ts`, `scripts/sync-indexes.ts`.

- Fields and indexes exactly as 05 §3.1, §7.5; pattern 04 §6.1.
- `scripts/sync-indexes.ts`: imports each model file explicitly (no barrel), calls `await db()`, then for each model `createCollection()` and `createIndexes()`; logs each; exits 0. Never `syncIndexes()`.

Verify: `npm run db:indexes` against the compose stack; `mongosh` shows the indexes.

### T4 · Passwords, sessions, rate limiting, audit
Files: `lib/auth/password.ts`, `lib/auth/session.ts`, `lib/auth/tokens.ts` (+ test), `lib/rate-limit.ts`, `lib/queue.ts`, `lib/audit.ts`, `lib/action.ts` (+ test), `lib/schemas/auth.ts` (+ test), `lib/schemas/jobs.ts`.

- `password.ts`: `hashPassword(pw)` and `verifyPassword(hash, pw)` with `@node-rs/argon2` defaults.
- `lib/schemas/auth.ts`: `Email` (trimmed, lower-cased), `Password` (10–128 chars), `LoginInput`, `ResetRequestInput`, `ResetInput`, `ChangePasswordInput` (`confirm` mismatch reported on the `confirm` field). "Must not equal the email" (09 §9) is checked in the actions, which know the email.
- `session.ts`: exactly 04 §6.4 (including `await connection()`); add `signIn(user)` (sets `uid`, `sv`, saves) and `signOut()` (destroys).
- `tokens.ts`: `createToken({ uid, sv, purpose })` / `readToken(token, purposes)` using `sealData`/`unsealData` with `SESSION_PASSWORD`; `purpose` ∈ `reset` (1800 s) · `invite` (604800 s) and fixes the TTL. `readToken` returns `null` for any failure (tampered, expired, wrong purpose).
- `rate-limit.ts`: `limit(name, subject, max, windowMs)` per 07 §16 using `redis()`; throws `AppError('RATE_LIMITED', 'Too many attempts. Try again in N minutes.')`. `clientIp()`: first `X-Forwarded-For` entry (09 §4).
- `queue.ts`: 04 §6.9 (`redis()`, `mailQueue()`).
- `audit.ts`: 04 §6.13. `action.ts`: 04 §6.6.
- `lib/schemas/jobs.ts`: `MailSend` only (04 §6.9). The `fanout` union arrives with its first producer (M01 invitations).

Unit tests: token round-trip, wrong purpose, tampered and expired → null; `Password` bounds, email normalization, `confirm` mismatch path; `action()` wrapper (unauthenticated, wrong role, validation, success).

### T5 · Mail adapter, templates and worker
Files: `lib/integrations/mail.ts`, `lib/domain/email-templates.ts` (+ test), `worker/index.ts`, `worker/jobs/mail.ts`.

- `mail.ts`: `sendMail({ to, subject, text, html })` via a lazily created `nodemailer.createTransport({ host, port, secure, auth? })` (verified API).
- `email-templates.ts`: pure functions `invitationEmail({ to, name, link })`, `resetEmail({ to, name, link })` returning a `MailSend`; every interpolated value HTML-escaped (test: a name containing `<script>` is escaped). `invitationEmail`'s first caller is `scripts/create-admin.ts` (T8), which prints the link and also enqueues the email.
- `worker/jobs/mail.ts`: processes `send` (validates `MailSend`, calls `sendMail`). Logs `job failed`. The `fanout` job is added in M01.
- `worker/index.ts`: 04 §6.9.

Verify: run `npm run worker`, trigger a reset from the UI (T7), see the email in Mailpit.

### T6 · Auth actions and public pages
Files: `app/(auth)/actions.ts`, `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, `components/action-form.tsx`.

These actions run before sign-in, so they use `publicAction(input, run)` (04 §6.6): the same validation and error mapping as `action()`, without the viewer check.

| Action | Input | Behaviour | Errors |
|---|---|---|---|
| `login` | `email`, `password` | rate-limit (09 §4) → find user `status: active` with `+passwordHash` → `verifyPassword` → `signIn` → set `lastLoginAt` → `redirect('/home')` | generic "Email or password is incorrect." for every failure; `RATE_LIMITED` |
| `logout` | — | `signOut()` → `redirect('/login')` | — |
| `requestPasswordReset` | `email` | rate-limit; if an active or invited user exists, create a reset token and enqueue `mail/send` with `resetEmail(…)`, job id `mail-reset-<userId>-<minuteBucket>`, and say the email is registered; if none exists, say so | `NOT_FOUND` "This email does not exist in the database."; `RATE_LIMITED` |
| `resetPassword` | `token`, `password`, `confirm` | `readToken(token, 'reset' or 'invite')`; user active or invited and `sessionVersion === sv`; password ≠ email; one `findOneAndUpdate` conditional on that `sessionVersion` sets `passwordHash`, `status: 'active'`, `sessionVersion + 1` (a racing second use matches nothing); audit `user.password_changed` (status before/after); `signIn`; `redirect('/home')` | "This link has expired or was already used."; "Your password must not be your email address." |

Pages use `ActionForm`/`Field` (04 §6.8). `/reset-password` reads `token` from `searchParams` inside a Suspense boundary in the page itself (no `app/(auth)/loading.tsx`: a route-level boundary streams `/login` and `/forgot-password` too, and without JavaScript their forms stay hidden behind the fallback), calls `await connection()` before `readToken` (unsealing checks expiry against the clock; without it the runtime prerender logs the `Date.now()` error — verified), then shows "Set up your account" (invite) or "Choose a new password" (reset), or "Link not valid" with a link to `/forgot-password` when the token is tampered, expired, of the wrong purpose, or no longer current (`isTokenCurrent`: the user's `sessionVersion` moved on because the link was used, or the account is disabled) — so a used link never shows a form that can only fail. `lib/auth/tokens.ts` itself must not import `next/*` (the worker creates invite tokens from M01).

### T7 · App shell, home, profile
Files: `app/layout.tsx`, `app/globals.css`, `app/not-found.tsx`, `app/(app)/layout.tsx`, `app/(app)/loading.tsx`, `app/(app)/error.tsx`, `app/(app)/home/page.tsx`, `app/(app)/profile/page.tsx`, `app/(app)/profile/actions.ts`, `proxy.ts`.

- UI system (client decision during M00): shadcn/ui per 08 §1, §4, §5 — `components.json`, `components/ui/` primitives listed in 08 §5.1, `hooks/use-mobile.ts`, `lib/cn.ts`, `lib/format.ts` (`ROLE_LABEL`), `components/page-header.tsx`, `components/app-nav.tsx`.
- `globals.css`: shadcn tokens with the CUTM palette per 08 §4.
- `(auth)/layout.tsx`: split screen — form column, and from 1024 px a navy brand panel.
- `(app)/layout.tsx`: the sidebar shell per 08 §3; the user menu (name, email, Profile, Sign out posting to `logout`) inside `<Suspense>` (04 §6.7).
- `home/page.tsx`: "Welcome, <first name>", today's date (IST), a card explaining each of the viewer's roles, and an account-security card linking to the profile; later milestones add sections. No placeholder sections for features that do not exist yet.
- `profile/page.tsx` + `actions.ts`: `changePassword` (`current`, `password`, `confirm`; verify current; new hash; `sessionVersion + 1`; `signIn` again so this browser stays signed in; audit `user.password_changed`); `signOutEverywhere` (`sessionVersion + 1`; audit `user.sessions_revoked`; redirect to `/login`).
- `proxy.ts`: as 04's verified pattern — redirect to `/login` when the `lms_session` cookie is absent; matcher excludes `login`, `forgot-password`, `reset-password`, `api/`, `_next/`, `favicon.ico`, `icon.png`, and static image files (so the public brand mark can load on the sign-in page).

### T8 · First admin, health check, CI, bundle scan
Files: `scripts/create-admin.ts`, `app/api/health/route.ts`, `.github/workflows/ci.yml`, `scripts/check-bundle.ts`.

- `create-admin.ts --email --name`: upserts an `invited` user with roles `['admin']`; enqueues `invitationEmail` (`mail/send`, job id `mail-invite-<userId>-<minuteBucket>`) and prints `<APP_URL>/reset-password?token=<invite token>` (the link is a secret: printed to the operator's terminal, never logged); refuses (exit 1) if the email belongs to an `active` or `disabled` account; re-running for an `invited` one issues a fresh link.
- `/api/health`: 06 §3 (2 s timeouts; `503` on failure; no data beyond up/down); `await connection()` first so it is never prerendered. `lib/db.ts` must not cache a failed first connection (verified: Mongo down at start-up, then up → the next request connects).
- `ci.yml`: 10 §5 steps 1–4 (e2e in step 5 from M01 when seed exists).
- `check-bundle.ts`: 09 §7.

### T9 · Tests
- Unit tests are written with their modules (T2, T4, T5).
- Integration: `login` success / wrong password / disabled user / invited user without a password / rate limit (6th attempt for one email in the window); `resetPassword` single use (second use fails); `changePassword` increments `sessionVersion`; `signOutEverywhere` writes an audit entry.
- E2E (`tests/e2e/auth.spec.ts`): create-admin link → set password → land on `/home` → sign out → sign in → forgot password → read the link from Mailpit (`GET http://localhost:8025/api/v1/messages`, then `/api/v1/message/<ID>`, verified) → reset → sign in with the new password.

## Acceptance criteria

- **AC-M00-01** Given the compose stack and `.env.local`, when a developer runs the README steps, then `/login` renders and `/api/health` returns `200 {"ok":true,"mongo":"up","redis":"up"}`.
- **AC-M00-02** Given no session cookie, when any `(app)` URL is requested, then the response redirects to `/login`.
- **AC-M00-03** Given an invited admin, when they open the printed link and set a valid password, then they are signed in on `/home` and the token cannot be used again.
- **AC-M00-04** Given wrong credentials, when signing in, then the message is exactly "Email or password is incorrect." and after 5 failures for the same email within 15 minutes the 6th returns the rate-limit message.
- **AC-M00-05** Given two browsers signed in as the same user, when "Sign out everywhere" is used in one, then the other is redirected to `/login` on its next request, and an audit entry `user.sessions_revoked` exists.
- **AC-M00-06** `npm run build` succeeds with **no** env vars set, and `npm run check:bundle` passes.
- **AC-M00-07** Security headers from 09 §8 are present on `/login` (`curl -I`).
- **AC-M00-08** The layout renders at 360 px wide without horizontal scrolling; below 768 px the sidebar is hidden and opens as a sheet from the header button.

## Validation checklist (human)

- [ ] Fresh clone → README steps → first admin invitation received in Mailpit.
- [ ] Set password; sign out; sign in; wrong password message is generic.
- [ ] Forgot password for an unknown email shows the same message as for a known one.
- [ ] Change password, then the old password fails.
- [ ] Phone-width view of `/login` and `/home` is usable.
- [ ] `docker compose stop mongo` → `/api/health` returns 503 within ~2 s; start it again → 200.
