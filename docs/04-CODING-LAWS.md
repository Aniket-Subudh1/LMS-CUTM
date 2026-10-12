# 04 · Coding laws

These laws are enforced in review. A change that breaks one is rejected regardless of whether it works. The canonical patterns in §6 were compiled (`tsc`), built (`next build` with Cache Components) and run (standalone server, MongoDB 8.0 replica set, Redis 8.6, RustFS) on 12 Oct 2026 — copy them; do not "improve" them from memory.

---

## 1. The least-code law

> Write the smallest amount of code that completely and correctly does what the milestone asks. Every line must be justified by a requirement ID.

**Prefer, in this order:**
1. **Not writing it** — is it in scope? Is it already done by something that exists?
2. **The platform** — HTML (`<form>`, `<details>`, `<dialog>`, `<input type="date">`, `required`, `pattern`), CSS, Server Components, Server Actions, `Intl`, `crypto.randomUUID()`, `URLSearchParams`.
3. **An installed package** listed in `03-TECH-STACK.md`.
4. **Your own code** — in the place `02-ARCHITECTURE.md` §3.1 says.

**Concretely:**
- A page that only displays data is a Server Component with zero client JavaScript.
- Filtering, sorting and pagination are a GET `<form>` and `searchParams`, not client state.
- One feedback pattern for mutations: `ActionForm` showing `message` / `fieldErrors`. No toasts.
- No modal dialogs for create/edit. Use a dedicated route (`…/new`, `…/[id]/edit`) or an inline `<details>` section.
- No drag-and-drop. A `<select>` or two buttons change a status.
- No optimistic UI unless a milestone asks for it.
- No configuration for things nobody asked to configure. Constants live next to their only use.
- No "generic" anything: no generic repository, generic CRUD factory, generic table builder, generic form builder.
- Delete code that a change made unused, in the same commit.

**The deletion test:** before committing, for every function, component, type and file you added, ask "what breaks if I delete this?" If the answer is "nothing a requirement needs", delete it.

## 2. The reuse law

- **Rule of two:** extract a function or component only when it has **two real call sites in the same commit**. Never extract "because it might be reused".
- **Shared components** live in `components/` and must be in the inventory (`08-UI-SYSTEM.md` §5). Inventory entries are pre-approved. To add a new one: two call sites + an inventory row, same commit.
- **Client boundary exception:** a component that must be `'use client'` gets its own file even with one call site, because a Server Component page cannot contain client code. It still goes in the inventory.
- **Local components:** a component used by one page is a function in that page's file, not a new file.
- **Shared functions:** a pure calculation used twice goes to `lib/domain/`; a write used by an action and a job goes to `lib/data/` (02 §3.1).
- **No wrappers that only forward.** `function Button(props) { return <button {...props} className="btn" /> }` is forbidden — write `<button className="btn">`. A wrapper must add behaviour.
- **No barrel files** (`index.ts` that re-exports). Import from the defining file.
- **Duplication of two or three lines is cheaper than a wrong abstraction.** Do not extract a helper to save fewer than ~5 lines unless it encodes a rule (then it belongs in `lib/domain/`).

## 3. Scalability laws

| # | Law | How it is checked |
|---|---|---|
| S1 | Every list query has `.limit()` (max 100) and is paginated with `page`/`pageSize` or a cursor | Review; integration test asserts page size |
| S2 | Every query filter/sort is covered by an index declared in the model **and** listed in `05-DATA-MODEL.md` | Review; `explain()` in the M11 performance pass |
| S3 | No unbounded arrays in documents. Every embedded array has a documented maximum enforced by the Zod schema or `$slice` | Review against 05 |
| S4 | No N+1: load related records with one `$in` query, then join in memory with a `Map` | Review |
| S5 | Read only the fields you render: always pass a projection to `find`/`findOne`; always `.lean()` for reads | Review |
| S6 | No file bytes through Next.js. Presigned PUT for upload, `/api/files/<key>` → presigned GET for download | Review |
| S7 | Work that touches more than one offering's worth of students, sends more than one email, calls an external API that can be slow, or takes > ~1 s goes to the worker | Review |
| S8 | The web process holds no state between requests (no in-memory maps of users, rooms, progress). Only module-level singletons for clients (DB, Redis, S3) | Review |
| S9 | Counters are written as single atomic upserts (`$inc`, `$max`, `$addToSet`) — never read-modify-write | Review |
| S10 | Rate-limit anything a user can trigger in a loop: login, password reset, code runs, uploads, AI suggestions (09 §4) | Integration test |
| S11 | Aggregations that run on every page view must use an index-backed `$match` first and return ≤ 1 document per row displayed | Review |

## 4. TypeScript laws

- `strict: true` stays on. No `any`, no non-null `!`, no `@ts-ignore` / `@ts-expect-error`, no `// eslint-disable` without an issue reference in the same line.
- `as` casts are allowed only in these places: `as const`; the `globalThis as typeof globalThis & { … }` singleton pattern (§6.2). Everything else uses Zod parsing, type guards, or `satisfies`.
- External input (form data, JSON bodies, query params, webhook payloads, job payloads, CSV rows, LLM output, env vars) is `unknown` until parsed by a Zod schema.
- Types are inferred from the source of truth: `z.infer<typeof Schema>` for inputs, `InferSchemaType<typeof schema>` for documents. Do not hand-write duplicate interfaces.
- DTOs returned by the DAL are plain objects with string ids and are declared as an exported `type` next to the function.
- Prefer discriminated unions over optional-field soup (`{ kind: 'video', … } | { kind: 'document', … }`).
- `readonly` arrays for constants (`as const`).

## 5. Naming and files

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `evaluation-scheme.ts` |
| React components | PascalCase, one exported component per shared file | `ActionForm` in `components/action-form.tsx` |
| Models | Singular PascalCase model, plural camelCase collection (Mongoose default) | `Offering` → `offerings` |
| DAL functions | verb + noun, describing the result | `listOfferingAssessments`, `getGradeSheet` |
| Actions | imperative verb + noun | `publishCoursePlan`, `submitAttempt` |
| Domain functions | what they compute | `computeInternalMarks`, `mergeRanges` |
| Job names | camelCase in a named queue | `compute/internalMarks` |
| Settings keys | camelCase | `attainment`, `grading` |
| Audit actions | `entity.verb` | `submission.graded`, `marks.locked` |
| Env vars | SCREAMING_SNAKE, grouped by prefix | `S3_BUCKET`, `LIVEKIT_API_KEY` |

---

## 6. Canonical patterns

Copy these shapes exactly. File paths are the real ones.

### 6.1 Model — `lib/models/<name>.ts`

```ts
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ROLES } from '@/lib/schemas/common';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    roles: { type: [String], enum: ROLES, required: true },
    departmentId: { type: Schema.Types.ObjectId },
    rollNo: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    sessionVersion: { type: Number, required: true, default: 1 },
    status: { type: String, enum: ['invited', 'active', 'disabled'], required: true, default: 'invited' },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ rollNo: 1 }, { unique: true, partialFilterExpression: { rollNo: { $type: 'string' } } });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User: Model<UserDoc> = mongoose.models.User ?? mongoose.model('User', userSchema);
```

Rules:
- **Export the model annotated as `Model<Doc>`.** The tempting `(models.User as Model<UserDoc>) ?? model(...)` produces a union type whose methods are not callable under Mongoose 9 (verified).
- `mongoose.models.X ?? mongoose.model(...)` prevents `OverwriteModelError` when Next.js re-evaluates modules in development. Use the **default import** for `models` and `connection`: under plain Node ESM (`tsx` — the worker and scripts) Mongoose does not provide them as named exports (verified: `SyntaxError: … does not provide an export named 'models'`); `Schema`, `Types` and `isValidObjectId` are fine as named imports.
- Indexes are declared in the model with `schema.index(...)`, never ad hoc in code.
- Middleware (rare): `schema.pre('save', async function () { … })` — Mongoose 9 passes **no `next`**.
- No business logic, statics, methods or virtuals unless a milestone specifies one.

### 6.2 Environment and connections — `lib/env.ts`, `lib/db.ts`

```ts
// lib/env.ts
import 'server-only';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_PASSWORD: z.string().min(32),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  // …every other variable in 11-OPERATIONS.md §2
});

let parsed: z.infer<typeof Env> | undefined;

export function env(): z.infer<typeof Env> {
  parsed ??= Env.parse(process.env);
  return parsed;
}
```

```ts
// lib/db.ts
import 'server-only';
import mongoose from 'mongoose';
import { env } from '@/lib/env';

const globalForDb = globalThis as typeof globalThis & { mongoose?: Promise<typeof mongoose> };

export function db(): Promise<typeof mongoose> {
  globalForDb.mongoose ??= mongoose.connect(env().MONGODB_URI, {
    autoIndex: env().NODE_ENV !== 'production',
    maxPoolSize: 20,
  });
  return globalForDb.mongoose;
}
```

Rules:
- **`env()` is lazy.** Parsing `process.env` at module top level breaks `next build` wherever runtime secrets are absent (verified: the build fails collecting page data). Never call `env()`, `db()` or create a client at module top level.
- One schema for all variables; web and worker receive the same environment.
- `autoIndex` is off in production; `scripts/sync-indexes.ts` creates collections and indexes at deploy (11 §5).
- Every server-only module starts with `import 'server-only';`.

### 6.3 Schemas — `lib/schemas/<area>.ts`

```ts
// lib/schemas/common.ts
import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const page = z.coerce.number().int().min(1).max(10_000).default(1);
export const pageSize = 25;

export const ROLES = ['admin', 'hod', 'faculty', 'student', 'support'] as const;
export type Role = (typeof ROLES)[number];
```

```ts
// lib/schemas/assessment.ts (shape example)
import { z } from 'zod';
import { objectId } from '@/lib/schemas/common';

export const CreateAssessment = z.object({
  offeringId: objectId,
  title: z.string().trim().min(3).max(160),
  mode: z.enum(['quiz', 'written_test', 'assignment']),
  closesAt: z.coerce.date(),
});
export type CreateAssessment = z.infer<typeof CreateAssessment>;
```

Rules: imports `zod` only. Error messages are written for a student or teacher. Form fields that arrive as strings use `z.coerce.*` or `z.stringbool()`.

### 6.4 Session, viewer and record access — `lib/auth/session.ts`, `lib/auth/access.ts`

```ts
// lib/auth/session.ts
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getIronSession, type SessionOptions } from 'iron-session';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { User } from '@/lib/models/user';
import type { Role } from '@/lib/schemas/common';

export type SessionData = { uid: string; sv: number };
export type Viewer = { id: string; name: string; email: string; roles: Role[]; departmentId: string | null };

export const SESSION_COOKIE = 'lms_session';

function options(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: env().SESSION_PASSWORD,
    ttl: 60 * 60 * 12,
    cookieOptions: { secure: env().NODE_ENV === 'production', sameSite: 'lax', httpOnly: true, path: '/' },
    onUnsealError: (reason, error) => {
      if (reason !== 'expired') log.warn('session cookie rejected', { reason, error });
    },
  };
}

export async function session() {
  return getIronSession<SessionData>(await cookies(), options());
}

export async function signIn(user: { id: string; sessionVersion: number }): Promise<void> {
  const s = await session();
  s.uid = user.id;
  s.sv = user.sessionVersion;
  await s.save();
}

export async function signOut(): Promise<void> {
  (await session()).destroy();
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  await connection();
  const s = await session();
  if (!s.uid || s.sv === undefined) return null;
  await db();
  const user = await User.findById(s.uid, { name: 1, email: 1, roles: 1, departmentId: 1, sessionVersion: 1, status: 1 }).lean();
  if (!user || user.status !== 'active' || user.sessionVersion !== s.sv) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    roles: user.roles,
    departmentId: user.departmentId ? String(user.departmentId) : null,
  };
});

export async function requireViewer(roles?: readonly Role[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  if (roles && !viewer.roles.some((r) => roles.includes(r))) redirect('/home');
  return viewer;
}
```

- **`await connection()` comes first.** Without it, Next 16's runtime prerender evaluates the session read (which checks expiry against the clock) and logs "encountered the unstable value `Date.now()` while prerendering" (verified). With it, the read is request-time.
- `cache()` memoizes the viewer for the request, so pages, layouts and DAL functions can all call `getViewer()` and hit the database once.
- `signIn` is called by login, password reset and password change (a change bumps `sessionVersion`, so the current browser re-signs to stay signed in); `signOut` by logout.

```ts
// lib/auth/access.ts
import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { db } from '@/lib/db';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import type { Viewer } from '@/lib/auth/session';

export type OfferingAccess = 'teach' | 'learn' | 'oversee';

export const offeringAccess = cache(async (viewer: Viewer, offeringId: string): Promise<OfferingAccess> => {
  if (!isValidObjectId(offeringId)) notFound();
  await db();
  const offering = await Offering.findById(offeringId, { facultyIds: 1, departmentId: 1 }).lean();
  if (!offering) notFound();
  if (viewer.roles.includes('admin')) return 'oversee';
  if (offering.facultyIds.some((id) => id.equals(viewer.id))) return 'teach';
  if (viewer.roles.includes('hod') && viewer.departmentId !== null && offering.departmentId.equals(viewer.departmentId)) return 'oversee';
  if (await Enrollment.exists({ offeringId, studentId: viewer.id, status: 'active' })) return 'learn';
  notFound();
});

export async function requireTeach(viewer: Viewer, offeringId: string): Promise<void> {
  const access = await offeringAccess(viewer, offeringId);
  if (access === 'learn' || (access === 'oversee' && !viewer.roles.includes('admin'))) notFound();
}
```

### 6.5 DAL read — `lib/data/<area>.ts`

```ts
import 'server-only';
import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requireViewer } from '@/lib/auth/session';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { pageSize } from '@/lib/schemas/common';

export type OfferingRow = { id: string; title: string; status: string };

export async function listMyOfferings(page: number): Promise<{ rows: OfferingRow[]; total: number }> {
  const viewer = await requireViewer();
  await db();
  const filter = viewer.roles.includes('admin')
    ? {}
    : {
        $or: [
          { facultyIds: new Types.ObjectId(viewer.id) },
          { _id: { $in: await Enrollment.distinct('offeringId', { studentId: viewer.id, status: 'active' }) } },
        ],
      };
  const [docs, total] = await Promise.all([
    Offering.find(filter, { title: 1, status: 1 }).sort({ _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    Offering.countDocuments(filter),
  ]);
  return { rows: docs.map((d) => ({ id: String(d._id), title: d.title, status: d.status })), total };
}
```

Rules: exported DAL functions begin with `requireViewer()` and, for offering-scoped data, `offeringAccess()`. They return DTOs (string ids, no Mongoose documents, no `ObjectId`). Students' data is filtered by `studentId: viewer.id` when access is `'learn'`. When a function uses `use cache` (only those listed in 02 §5), the cached part is an unexported inner function taking ids:

```ts
async function readSchemeVersion(id: string) {
  'use cache';
  cacheLife('max');
  cacheTag(`scheme:${id}`);
  await db();
  return EvaluationScheme.findById(id, { /* projection */ }).lean();
}
```

### 6.6 Server Action — `lib/action.ts` and `app/**/actions.ts`

```ts
// lib/action.ts
import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { getViewer, type Viewer } from '@/lib/auth/session';
import { AppError, type ActionResult } from '@/lib/errors';
import { log } from '@/lib/log';
import type { Role } from '@/lib/schemas/common';

function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    const values = fd.getAll(key);
    out[key] = key.endsWith('[]') || values.length > 1 ? values : values[0];
  }
  return out;
}

export function action<S extends z.ZodType, R>(
  config: { input: S; roles: readonly Role[] },
  run: (input: z.infer<S>, viewer: Viewer) => Promise<R>,
) {
  return async (raw: z.input<S> | FormData): Promise<ActionResult<R>> => {
    try {
      const viewer = await getViewer();
      if (!viewer) return { ok: false, code: 'UNAUTHENTICATED', message: 'Please sign in again.' };
      if (!viewer.roles.some((r) => config.roles.includes(r))) {
        return { ok: false, code: 'FORBIDDEN', message: 'You do not have access to this action.' };
      }
      const parsed = config.input.safeParse(raw instanceof FormData ? formDataToObject(raw) : raw);
      if (!parsed.success) {
        const { fieldErrors, formErrors } = z.flattenError(parsed.error);
        return {
          ok: false,
          code: 'VALIDATION',
          message: formErrors[0] ?? 'Please correct the highlighted fields.',
          fieldErrors,
        };
      }
      return { ok: true, data: await run(parsed.data, viewer) };
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof AppError) return { ok: false, code: error.code, message: error.message };
      const errorId = crypto.randomUUID();
      log.error('action failed', { errorId, error });
      return { ok: false, code: 'INTERNAL', message: `Something went wrong. Reference: ${errorId}` };
    }
  };
}
```

```ts
// app/(app)/courses/actions.ts — an action
'use server';

import { z } from 'zod';
import { refresh } from 'next/cache';
import { action } from '@/lib/action';
import { requireTeach } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { Offering } from '@/lib/models/offering';
import { objectId } from '@/lib/schemas/common';

export const renameOffering = action(
  { input: z.object({ offeringId: objectId, title: z.string().trim().min(3).max(120) }), roles: ['admin', 'faculty'] },
  async ({ offeringId, title }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const res = await Offering.updateOne({ _id: offeringId }, { $set: { title } });
    if (res.matchedCount === 0) throw new AppError('NOT_FOUND', 'Offering not found.');
    refresh();
    return { offeringId };
  },
);
```

Rules:
- Actions accept either `FormData` (from `ActionForm`) or a plain object (from a client component via `startTransition`). Repeated fields use the `name[]` convention to always arrive as arrays.
- The role check in `action()` is coarse; the record check inside `run` is mandatory.
- Expected failures throw `AppError(code, message)`. Never return raw exception text.
- `unstable_rethrow` lets `redirect()` / `notFound()` thrown inside `run` behave normally. The shared access helpers (`offeringAccess`, `requireTeach`) call `notFound()`, so a tampered or stale id ends in Next's not-found handling rather than an `ActionResult` — intended. Integration tests assert it with `await expect(act(input)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')` (verified).
- Call `refresh()` after a successful mutation unless you `redirect()`.

### 6.7 Page — `app/(app)/**/page.tsx` (+ `loading.tsx`)

```tsx
// app/(app)/loading.tsx — the Suspense boundary for every page in the shell
export default function Loading() {
  return <div className="skeleton h-40" aria-busy="true" />;
}
```

```tsx
// app/(app)/layout.tsx — never await the session at the top level of a layout
import { Suspense } from 'react';
import Link from 'next/link';
import { getViewer } from '@/lib/auth/session';

async function UserMenu() {
  const viewer = await getViewer();
  return <span>{viewer?.name}</span>;
}

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="app-shell">
      <header>
        <Link href="/home">CUTM LMS</Link>
        <Suspense fallback={<span className="skeleton w-24" />}>
          <UserMenu />
        </Suspense>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

```tsx
// app/(app)/courses/page.tsx — list page with URL pagination
import Link from 'next/link';
import { listMyOfferings } from '@/lib/data/offerings';
import { page as pageParam } from '@/lib/schemas/common';

export default async function CoursesPage({ searchParams }: PageProps<'/courses'>) {
  const page = pageParam.parse((await searchParams).page ?? 1);
  const { rows, total } = await listMyOfferings(page);
  return (
    <section>
      <h1>My courses ({total})</h1>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/courses/${r.id}`}>{r.title}</Link> <span className="badge">{r.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Rules: `PageProps<'/route'>` and `LayoutProps<'/route'>` are global types generated by Next (`next typegen` / `next dev` / `next build`); `params` and `searchParams` are Promises. Validate every param with Zod (an invalid `page` must not throw a 500 — use `.catch(1)` on the schema if a friendly fallback is wanted). In real pages, lists render through `DataTable` (08 §5).

### 6.8 Client form — `components/action-form.tsx`

```tsx
'use client';

import { createContext, use, useActionState, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/errors';

type Result = ActionResult<unknown> | null;
const FormErrors = createContext<Partial<Record<string, string[]>> | undefined>(undefined);

export function ActionForm({
  action,
  submitLabel,
  successMessage,
  children,
}: {
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  successMessage?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<Result, FormData>((_prev, fd) => action(fd), null);
  return (
    <form action={formAction} className="form">
      {state && !state.ok && <p role="alert" className="form-error">{state.message}</p>}
      {state?.ok && successMessage && <p role="status" className="form-success">{successMessage}</p>}
      <FormErrors value={state && !state.ok ? state.fieldErrors : undefined}>{children}</FormErrors>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

export function Field({ name, label, hint, children }: { name: string; label: string; hint?: string; children: ReactNode }) {
  const errors = use(FormErrors)?.[name];
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {errors?.map((e) => <span key={e} className="field-error">{e}</span>)}
    </label>
  );
}
```

Usage from a Server Component page (an action is passed straight through — no wrapper):

```tsx
<ActionForm action={renameOffering} submitLabel="Rename" successMessage="Saved.">
  <input type="hidden" name="offeringId" value={offeringId} />
  <Field name="title" label="Title">
    <input name="title" className="input" required />
  </Field>
</ActionForm>
```

### 6.9 Jobs — `lib/queue.ts` (producer) and `worker/jobs/<queue>.ts` (consumer)

```ts
// lib/queue.ts
import 'server-only';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@/lib/env';
import type { MailSend } from '@/lib/schemas/jobs';

const globalForQueue = globalThis as typeof globalThis & { redis?: Redis; mail?: Queue<MailSend, void, 'send'> };

export function redis(): Redis {
  globalForQueue.redis ??= new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
  return globalForQueue.redis;
}

export function mailQueue(): Queue<MailSend, void, 'send'> {
  globalForQueue.mail ??= new Queue<MailSend, void, 'send'>('mail', {
    connection: redis(),
    defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return globalForQueue.mail;
}
// compute and sync queues follow the same shape.
```

The type parameters are `<data, result, job name>`; BullMQ then rejects a wrong job name or payload at compile time. M01 adds the `fanout` job: the queue becomes `Queue<MailSend | MailJob, void, 'send' | 'fanout'>` and the worker dispatches on `job.name`.

```ts
// lib/schemas/jobs.ts — every job payload has a schema (M00 content)
import { z } from 'zod';

export const MailSend = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().min(1),
});
export type MailSend = z.infer<typeof MailSend>;
// M01 adds `MailJob`, the `fanout` union (06 §6): z.discriminatedUnion('kind', [z.object({ kind: z.literal('invitation'), … }), …])
```

```ts
// producer, inside an action (M00 password reset)
await mailQueue().add('send', resetEmail({ to: user.email, name: user.name, link }), {
  jobId: `mail-reset-${user._id}-${Math.floor(Date.now() / 60_000)}`,
});
```

```ts
// worker/jobs/mail.ts — consumer shape (M00 content)
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { sendMail } from '@/lib/integrations/mail';
import { log } from '@/lib/log';
import { MailSend } from '@/lib/schemas/jobs';

export function startMailWorker(redisUrl: string): Worker {
  const worker = new Worker('mail', async (job) => sendMail(MailSend.parse(job.data)), {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    concurrency: 10,
  });
  worker.on('failed', (job, error) =>
    log.error('job failed', { queue: 'mail', id: job?.id, attemptsMade: job?.attemptsMade, error }),
  );
  return worker;
}
```

Integration-test a worker through the real queue (`tests/integration/mail-worker.test.ts`): mock the adapter, start the worker, `add` a job and `await job.waitUntilFinished(new QueueEvents(…))`; close the worker, the events connection, the queue and `redis()` at the end.

```ts
// worker/index.ts — entry point (run: tsx --conditions=react-server worker/index.ts)
import mongoose from 'mongoose';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { startMailWorker } from './jobs/mail';

await db();
const workers = [startMailWorker(env().REDIS_URL)];
log.info('worker started', { queues: workers.map((w) => w.name) });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void Promise.all(workers.map((w) => w.close()))
      .then(() => mongoose.disconnect())
      .then(() => process.exit(0));
  });
}
```

Rules:
- **Run the worker and every script with `tsx --conditions=react-server`.** Server modules start with `import 'server-only'`, which throws under plain Node; the `react-server` export condition resolves it to an empty module (verified both ways). The npm scripts in M00 encode this.
- Producers in the web process share `redis()`. **Every `Worker` and `QueueEvents` gets a new dedicated connection** — a `Worker` on a shared connection blocks it (verified hang).
- **Job ids:** deterministic, built with `-` separators, never containing `:` and never a bare integer. BullMQ 6 rejects `:` in custom ids (except a legacy three-part form its source marks for removal) and rejects integer strings (verified).
- A duplicate `jobId` is ignored; the *returned* job object echoes your new payload, but the stored job keeps the original (verified). Never rely on the returned payload.
- An invalid payload fails the job with the Zod error as `failedReason` (verified) — it surfaces on the admin integrations page; it is not retried into success.
- Schedulers: `queue.upsertJobScheduler(id, { pattern, tz: 'Asia/Kolkata' }, { name, data })` — idempotent, safe to call on every worker start (verified next-run computation in IST).
- `worker/` imports from `lib/` with the `@/` alias (`tsx` honours `tsconfig` paths). It must not import `next/*` or anything that does (`lib/auth/session.ts`, `lib/auth/access.ts`, `lib/action.ts`).

### 6.10 Pure domain function — `lib/domain/<area>.ts` + test

```ts
// lib/domain/round.ts
export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const shifted = Math.abs(value) * factor;
  const rounded = Math.round(Number(shifted.toPrecision(15)));
  return (Math.sign(value) * rounded) / factor;
}
```

```ts
// lib/domain/round.test.ts
import { describe, expect, it } from 'vitest';
import { roundHalfUp } from './round';

describe('roundHalfUp', () => {
  it.each([
    [1.005, 2, 1.01],
    [2.675, 2, 2.68],
    [1.255, 2, 1.26],
    [37.5, 0, 38],
    [37.4999, 0, 37],
    [-1.005, 2, -1.01],
    [0.1 + 0.2, 2, 0.3],
    [14.999999999999998, 2, 15],
    [0, 2, 0],
  ])('roundHalfUp(%d, %d) = %d', (value, decimals, expected) => {
    expect(roundHalfUp(value, decimals)).toBe(expected);
  });
});
```

Rules: no I/O, no `Date.now()`, no `Math.random()`, no `process.env`. Inputs are plain data; time is an argument. Every vector table in `07-ALGORITHMS.md` becomes an `it.each`.

### 6.11 Route Handler — `app/api/**/route.ts`

```ts
// app/api/beacon/route.ts (shape)
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { objectId } from '@/lib/schemas/common';

const Beacon = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('video'), lessonId: objectId, ranges: z.array(z.tuple([z.number().min(0), z.number().min(0)])).max(50) }),
  z.object({ kind: z.literal('live'), sessionId: objectId, focusedSec: z.number().int().min(0).max(120) }),
]);

export async function POST(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 401 });
  const parsed = Beacon.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  // access check + single upsert (M02/M03)
  return new Response(null, { status: 204 });
}
```

Route handlers exist only for external callers (06 §3). They return status codes, not `ActionResult`.

### 6.12 Integration adapter — `lib/integrations/storage.ts`

```ts
import 'server-only';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/lib/env';

let client: S3Client | undefined;

function s3(): S3Client {
  client ??= new S3Client({
    region: env().S3_REGION,
    endpoint: env().S3_ENDPOINT,
    forcePathStyle: env().S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env().S3_ACCESS_KEY_ID, secretAccessKey: env().S3_SECRET_ACCESS_KEY },
  });
  return client;
}

export function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ContentType: contentType, ContentLength: size }), { expiresIn: 300 });
}

export function presignDownload(key: string, fileName: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ResponseContentDisposition: `inline; filename="${fileName.replace(/["\\\r\n]/g, '')}"` }),
    { expiresIn: 600 },
  );
}
```

Rules: an adapter exports functions in domain terms (`presignUpload`), never the vendor client. It translates vendor errors into `AppError('INTEGRATION', <safe message>)` and logs the vendor detail.

### 6.13 Audit — `lib/audit.ts`

```ts
import 'server-only';
import type { ClientSession } from 'mongoose';
import { AuditLog } from '@/lib/models/audit-log';

export type AuditEntry = {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  offeringId?: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  await AuditLog.create([{ ...entry, at: new Date() }], { session });
}
```

When an audited change and its audit entry must succeed together, write both in one transaction (§6.14). Which actions are audited: 09 §6.

### 6.14 Transactions

```ts
import mongoose from 'mongoose';

await mongoose.connection.transaction(async (session) => {
  await InternalMarks.updateMany({ offeringId, lockedAt: null }, { $set: { lockedAt: now, lockedBy } }, { session });
  await writeAudit({ actorId, action: 'marks.locked', entity: 'offering', entityId: offeringId, offeringId }, session);
});
```

Rules: use a transaction only when two or more writes must commit together (locks, publishes, imports that replace a set). Collections must already exist (created by `scripts/sync-indexes.ts`). Keep transactions short; never call an external system inside one.

---

## 7. Error-handling laws

- Never `catch` without rethrowing, converting to `AppError`, or returning a typed failure. Never `catch {}`.
- User-facing messages are written in plain English for the person on screen; vendor or stack details go to `log.error` with an `errorId`.
- Background jobs throw on failure (BullMQ retries); they never swallow.
- Route handlers return precise status codes (`400` invalid, `401` no session, `403` bad signature, `404` not found, `409` conflict, `429` rate-limited).
- `notFound()` for missing or inaccessible records (never `403`, which leaks existence).

## 8. Comments and documentation

- Comment **why**, never **what**. A comment that restates the code is deleted in review.
- A rule that comes from a requirement gets its ID in a short comment where the rule is enforced: `// CE-07: weights must sum to the internal maximum`.
- No commented-out code, no `TODO`/`FIXME`, no changelogs in comments.

## 9. Anti-patterns (rejected on sight)

| Anti-pattern | Instead |
|---|---|
| `useEffect` + `fetch` to load page data | Server Component + DAL |
| A `/api/...` route called by our own UI | Server Action or Server Component |
| `"use client"` at the top of a page | Keep the page a Server Component; isolate interactivity in an inventory component |
| Reading `cookies()` / session at the top of a layout | Child component inside `<Suspense>` |
| `env()`/`db()`/`new Redis()` at module top level | Lazy accessor functions |
| `Model.find({})` without projection/limit | Projection + `.limit()` + index |
| `doc.save()` in a loop | `bulkWrite` / `updateMany` |
| Read, modify in JS, write back a counter | `$inc` / `$max` upsert |
| `JSON.parse(x) as Foo` | `Foo.parse(JSON.parse(x))` |
| `Date.now()` inside `lib/domain` | Pass `now` in |
| `toFixed()` for stored/compared values | `roundHalfUp` |
| Storing HTML from the editor | Store Tiptap JSON; render with `@tiptap/html/server` |
| Hiding a button as authorization | Role + record check in the action |
| Vendor SDK import outside `lib/integrations/` | Adapter function |
| A new shared component with one call site | Inline it |
| `forbidden()` / `unauthorized()` (experimental) | `notFound()` / `redirect('/login')` |

## 10. Self-review before every commit

- [ ] Every line traces to a requirement ID in this milestone.
- [ ] Ran the deletion test (§1).
- [ ] No new shared component/function without two call sites.
- [ ] Every query: projection, limit/pagination, index exists in model and 05.
- [ ] Every action: Zod input, role list, record-level check, audit where required, `refresh()`.
- [ ] Every page: under a Suspense boundary; params validated; no client JS unless necessary.
- [ ] No `any`, `!`, unlisted `as`, `ts-ignore`, `TODO`, swallowed errors.
- [ ] Docs updated for any contract/model/env change.
- [ ] `npm run check` and the relevant integration tests pass, and the output is pasted in the report.
