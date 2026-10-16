# 06 · Contracts

Cross-cutting contracts shared by the browser, the web process, the worker and external systems. Server Actions specific to a feature are specified in their milestone file; they all follow §1 and §2.

## 1. Error contract

```ts
// lib/errors.ts
export const ERROR_CODES = [
  'VALIDATION', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT',
  'LOCKED', 'CLOSED', 'RATE_LIMITED', 'INTEGRATION', 'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    // Per-field messages for failures found after parsing (for example, the rows of a rejected CSV).
    readonly fieldErrors?: Partial<Record<string, string[]>>,
  ) {
    super(message);
  }
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: Partial<Record<string, string[]>> };
```

**Where to go next.** An action that creates a record the user should open next (a course, a programme, a user) returns `{ next: string }` — an app path — as its `data`, instead of calling `redirect()`. `FormDialog` (08 §5.2) shows its success state, closes, then navigates to `next`. Edits return nothing and call `refresh()`. Only the pre-sign-in actions (`login`, `resetPassword`) and sign-out actions still `redirect()`, because they leave the signed-in shell.

| Code | Meaning | Typical message | Route-handler status |
|---|---|---|---|
| `VALIDATION` | Input failed Zod or a business rule about the input | "Weights must add up to 50." | 400 |
| `UNAUTHENTICATED` | No valid session | "Please sign in again." | 401 |
| `FORBIDDEN` | Role not allowed for this action | "You do not have access to this action." | 403 |
| `NOT_FOUND` | Record missing (actions only; pages use `notFound()`) | "Assessment not found." | 404 |
| `CONFLICT` | Would violate uniqueness or a reference | "CO2 is used by 3 questions and cannot be deleted." | 409 |
| `LOCKED` | Offering marks are locked | "Marks for this course are locked." | 423 |
| `CLOSED` | Outside an allowed time window | "This assessment closed at 5:00 PM." | 409 |
| `RATE_LIMITED` | Too many attempts | "Too many attempts. Try again in 10 minutes." | 429 |
| `INTEGRATION` | An external system failed or rejected the request | "The code runner is busy. Try again in a minute." | 502 |
| `INTERNAL` | Unexpected; logged with an `errorId` | "Something went wrong. Reference: <errorId>" | 500 |

## 2. Shared input primitives — `lib/schemas/common.ts`

| Name | Definition | Notes |
|---|---|---|
| `objectId` | `z.string().regex(/^[a-f\d]{24}$/i)` | |
| `page` | `z.coerce.number().int().min(1).max(10_000).default(1)` | `pageSize = 25`; `max per page = 100` |
| `richText` | the editor's hidden input (a JSON string, `''` when empty), ≤ 100 KB, parsed into `RichTextDoc`: a `doc` whose nodes and marks are StarterKit's (`paragraph text heading bulletList orderedList listItem blockquote codeBlock hardBreak horizontalRule`; marks `bold italic underline strike code link`), any other type → "Unsupported content." A document without text becomes `null` | `lib/schemas` may import only `zod`, so the type list stands in for a test render; `lib/domain/rich-text.ts` renders with `@tiptap/html/server` and its tests prove the output is inert. DAL reads parse stored documents with `RichTextDoc` |
| `istDateTime` | `z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)`; the action converts it with `parseIstLocal` (`lib/schemas` imports only `zod`) | `<input type="datetime-local">` sends no time zone; the server interprets it as **IST (+05:30)**. `parseIstLocal('2026-10-12T10:30')` → `2026-10-12T05:00:00.000Z`. Added with its first caller (M04) |
| `istTime` | `HH:mm`, 00:00–23:59 (M03) | `<input type="time">`; the action joins it to an `istDate` and converts with `parseIstLocal` (scheduling a live class: date, start time and length, A-68) |
| `istDate` | `YYYY-MM-DD` string, checked to be a real date | for calendar dates; `lib/schemas` imports `zod` only, so the action converts it with `istDateToDate` (`lib/domain/time.ts`) to a `Date` at 00:00 IST |
| `marks` | `z.coerce.number().min(0).max(1000)` then `roundHalfUp(x, 2)` | all hand-entered marks |
| `ids[]` | `z.array(objectId).max(n)` with the `name[]` form convention | |
| `email` | `z.email().toLowerCase()` | |

Pure helpers used by these (`parseIstLocal`, `istDayKey`, `roundHalfUp`) live in `lib/domain/time.ts` and `lib/domain/round.ts` with tests (07 §1, §11).

## 3. Route handlers (external callers only)

| Route | Method | Caller | Auth | Request | Responses | Effect |
|---|---|---|---|---|---|---|
| `/api/health` | GET | Load balancer, uptime monitor | none | — | `200 {"ok":true,"mongo":"up","redis":"up"}`; `503` with the failing part | Pings Mongo (`db.admin().ping()`) and Redis (`PING`) with a 2 s timeout. No other data |
| `/api/beacon` | POST | Browser `sendBeacon` | session | `Beacon` union (below) | `204`; `400`; `401`; `429` | Updates `lessonProgress` / `attendance.focusedSec` and `engagementDaily` (07 §8–9) |
| `/api/files/[...key]` | GET | Browser links, `<video src>` | session | key path | `302` to presigned GET; `404` | Authorizes by key prefix (§5) then redirects |
| `/api/webhooks/live` | POST | Live engine | engine signature | raw body + `Authorization` | `200`; `401` bad signature | Normalizes to `LiveEvent`; appends presence; on `room_finished` enqueues `compute/finalizeLiveSession` |
| `/api/webhooks/github` | POST | GitHub App | `X-Hub-Signature-256` | raw body + `X-GitHub-Event`, `X-GitHub-Delivery` | `200`; `401` | On `push` for a linked repo: enqueue `sync/githubProject` (debounced by job id) |
| `/api/auth/github/callback` | GET | GitHub OAuth redirect | session + `state` | `code`, `state` | `302` to `/profile` | Verifies `state`, exchanges `code`, stores `users.github` |
| `/api/exports/internal-marks` | GET | Admin's browser (file download) | session, admin | `termId`, `departmentId?` | `200 text/csv` attachment | 06 §8.4; the only UI-facing route handler, because a generated file download cannot be a Server Action (M08) |

```ts
// Beacon payload
const Beacon = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('video'), lessonId: objectId, ranges: z.array(z.tuple([z.number().min(0), z.number().min(0)])).max(50) }),
  z.object({ kind: z.literal('live'), sessionId: objectId, focusedSec: z.number().int().min(0).max(120) }),
]);
```

Rules for every handler: read the raw body once; validate with Zod; verify signatures before parsing JSON for webhooks; respond within 500 ms (enqueue anything slower); never return internal error text.

## 4. Adapter interfaces — `lib/integrations/`

Signatures are the contract; implementations may change. All functions throw `AppError('INTEGRATION', <safe message>)` on vendor failure and log the vendor detail.

### 4.1 Storage — `storage.ts` (M02)
```ts
presignUpload(key: string, contentType: string, size: number): Promise<string>   // PUT, 300 s
presignDownload(key: string, fileName: string): Promise<string>                 // GET, 600 s
deleteObjects(keys: string[]): Promise<void>                                     // batches of ≤ 1000
downloadToFile(key: string, path: string): Promise<void>                         // worker only (transcode)
uploadFromFile(key: string, path: string, contentType: string): Promise<void>     // worker only (transcode)
```
Production target is Cloudflare R2 (ADR-19): `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`.

### 4.2 Mail — `mail.ts` (M00)
```ts
sendMail(message: { to: string; subject: string; text: string; html: string }): Promise<void>
```
Only the `mail` worker calls it. One recipient per message (no CC/BCC lists of students). HTML is built by pure template functions in `lib/domain/email-templates.ts` that HTML-escape every interpolated value.

### 4.3 Live — `live.ts` (M03; self-hosted LiveKit — ADR-18)
```ts
type LiveRole = 'host' | 'participant';
joinToken(input: { roomName: string; userId: string; name: string; role: LiveRole; ttlSec: number }): Promise<{ serverUrl: string; token: string }>
closeRoom(roomName: string): Promise<void>
parseWebhook(rawBody: string, authorization: string | null): Promise<LiveEvent>   // throws AppError('FORBIDDEN') if the signature is invalid

type LiveEvent =
  | { type: 'joined'; roomName: string; userId: string; sid: string; at: Date }
  | { type: 'left'; roomName: string; userId: string; sid: string; joinedAt: Date; at: Date }
  | { type: 'room_finished'; roomName: string; at: Date }
  | { type: 'ignored' };
```
LiveKit mapping (verified against `livekit-server-sdk` 2.19.1 types): `new AccessToken(key, secret, { identity: userId, name, ttl })`, `addGrant({ roomJoin: true, room, canPublish, canSubscribe: true, canPublishData: true, roomAdmin: role === 'host' })`, `await toJwt()`. Webhooks: `new WebhookReceiver(key, secret)`, `await receive(body, authHeader)`; events `participant_joined`, `participant_left`, `room_finished`; others (including `participant_connection_aborted`) → `ignored`. `sid` is `event.participant.sid`, one per connection (a reconnect or a second tab is a new one); a `left` carries the connection's own `participant.joinedAtMs`, so a leave whose join never arrived still gives its interval. `closeRoom` treats the engine's `ServerError` with status 404 (`not_found`) as already closed. Students get `canPublish: true` (they may speak when the teacher allows in the room UI); `roomAdmin` only for hosts.

### 4.4 Code runner — `code-runner.ts` (M05; reference: Judge0 CE 1.13.1)
```ts
type RunStatus = 'accepted' | 'wrong_answer' | 'time_limit' | 'compile_error' | 'runtime_error' | 'internal_error';
runBatch(jobs: { runnerLanguageId: number; source: string; stdin: string; expected: string | null; timeLimitSec: number; memoryKb: number }[]):
  Promise<{ status: RunStatus; stdout: string; stderr: string; compileOutput: string; timeMs: number | null; memoryKb: number | null }[]>
listLanguages(): Promise<{ id: number; name: string }[]>
```
Judge0 mapping (verified from the v1.13.1 source): `POST /submissions/batch?base64_encoded=true` with `{ submissions: [{ source_code, language_id, stdin, expected_output, cpu_time_limit, memory_limit }] }` → `[{ token }]`; poll `GET /submissions/batch?tokens=<csv>&base64_encoded=true&fields=token,status,stdout,stderr,compile_output,time,memory` every 500 ms until no status id is 1 (In Queue) or 2 (Processing), timeout 20 s. Status ids: 3 → accepted, 4 → wrong_answer, 5 → time_limit, 6 → compile_error, 7–12 → runtime_error, 13–14 → internal_error. Batch size ≤ 20 (Judge0 default `MAX_SUBMISSION_BATCH_SIZE`). Auth header `X-Auth-Token` (Judge0 default `AUTHN_HEADER`) with `CODE_RUNNER_TOKEN`. Default language ids in Judge0 CE: 50 C (GCC 9.2.0), 54 C++ (GCC 9.2.0), 62 Java (OpenJDK 13.0.1) — configurable in settings (§7) and verifiable with `listLanguages()`.

### 4.5 GitHub — `github.ts` (M07; `octokit` 5)
```ts
installUrl(): string
oauthAuthorizeUrl(state: string): string
exchangeOAuthCode(code: string): Promise<{ id: number; login: string }>
resolveRepo(owner: string, name: string): Promise<{ installationId: number; defaultBranch: string }>   // NOT_FOUND if the App is not installed on it
listCommits(input: { installationId: number; owner: string; name: string; since: Date | null }): Promise<{ sha: string; authorLogin: string | null; authorId: number | null; committedAt: Date; message: string; parents: number }[]>
commitStats(input: { installationId: number; owner: string; name: string; sha: string }): Promise<{ additions: number; deletions: number }>
verifyWebhook(rawBody: string, signature: string): Promise<void>   // app.webhooks.verify → false → AppError('FORBIDDEN'); the route then parses the JSON with Zod
```

### 4.6 Exam system — `exam-api.ts` (**blocked on Q-04**; do not create the file until the API documentation exists)
```ts
pullEndSem(termCode: string, courseCode: string): Promise<EndSemRow[]>
pushInternal(rows: InternalMarksRow[]): Promise<{ accepted: number; rejected: { rollNo: string; reason: string }[] }>
```
`EndSemRow` and `InternalMarksRow` are the same row types the CSV path uses (§8.3, §8.4), so M08's CSV import/export and a future API share all downstream code.

### 4.7 AI — `ai.ts` (M09; `@anthropic-ai/sdk` 0.133.0)
```ts
suggestItemTags(input: { promptText: string; cos: { code: string; statement: string }[] }): Promise<{ coCodes: string[]; bloomLevel: BloomLevel; rationale: string } | null>
suggestCoMap(input: { cos: { code: string; statement: string }[]; outcomes: { code: string; title: string }[] }): Promise<{ co: string; outcome: string; level: 1 | 2 | 3; rationale: string }[] | null>
explainEngagement(input: { metrics: Record<string, number>; band: string; trend: string }): Promise<string | null>
```
Reference call shape (type-checked against SDK 0.133.0):
```ts
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

const res = await client().beta.messages.parse({
  model: 'claude-opus-5-5',
  max_tokens: 2000,
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
  output_config: { effort: 'low', format: betaZodOutputFormat(ItemTagSuggestion) },
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userContent }],
});
if (res.stop_reason === 'refusal') return null;
return res.parsed_output; // already validated against the Zod schema; null if parsing failed
```
Rules: never send names, roll numbers, emails or answers — only question text, CO statements, outcome titles and numeric metrics. `null` means "no suggestion" and the UI says so. Rate-limited (09 §4). The server-side refusal fallback is enabled (`fallbacks: 'default'`).

### 4.8 Courseware — `courseware.ts` (M01b; courseware.cutm.ac.in, read only)
```ts
coursewareUrl(path?: string): string                                   // COURSEWARE_URL + path
listCourseIds(page: number): Promise<{ ids: number[]; lastPage: number }>   // /courses?page=n; a missing page → no ids
fetchCoursePage(id: number): Promise<CoursewarePage | null>             // /course/{id}; 404 → null
parseCoursePage(html: string): CoursewarePage                           // exported for the fixture tests
type CoursewareBlock = { kind: 'line'; text: string; bold: boolean } | { kind: 'table'; rows: string[][] };
type CoursewarePage = { title: string; typeLabel: string | null; identifier: string | null; blocks: CoursewareBlock[] };
```
- Requests time out after 90 s (pages are rendered on request and take 30–60 s) and send `User-Agent: CUTM-LMS catalogue importer (<APP_URL>)`.
- happy-dom parses the page with scripts off (03); the adapter flattens the course body into lines (text, `<br>`, block elements; a list item stays one line starting with `• `) and tables (rows of cell text, a cell's own line breaks as `\n`). It does not interpret anything: `lib/domain/courseware.ts` reads the course out of the blocks (07 §17).
- **Contact details never leave the adapter:** email addresses and Indian mobile numbers are cut out of every line and cell, and a line or table row labelled as contact details (contact, phone, mobile, email, …) is dropped (09 §5).
- "One page" imports accept only a numeric id or a URL on the `COURSEWARE_URL` host whose path is `/course/<id>` (`coursewarePageId` in `lib/domain/courseware.ts`), so the importer cannot be pointed at another host.

## 5. Upload purposes

Uploads are authorized per purpose by `createUpload` (02 §4.3). The key prefix encodes ownership; `/api/files` authorizes downloads from the same table.

| Purpose | Who may upload | Context | Content types | Max size | Key | Who may download |
|---|---|---|---|---|---|---|
| `lesson-video` | teach | offering | `video/mp4`, `video/webm` | 2 GB | `lesson-video/<offeringId>/<userId>/<uuid>.<ext>` | teach, oversee, learn (published lessons only) |
| `lesson-doc` | teach | offering | `application/pdf` | 50 MB | `lesson-doc/<offeringId>/…` | same |
| `syllabus` | admin, or the course's coordinator (CRS-07, M01b) | course | `application/pdf` | 20 MB | `syllabus/<courseId>/…` | any viewer with access to an offering of the course |
| `submission` | learn (own attempt in progress) | assessment | `application/pdf`, `image/jpeg`, `image/png`, `image/heic` | 25 MB each, ≤ 10 per item | `submission/<assessmentId>/<userId>/<uuid>.<ext>` | the owner; teach, oversee |
| `proctor-snapshot` | learn (own proctored attempt) | submission | `image/jpeg` | 300 KB | `proctor/<submissionId>/<userId>/<uuid>.jpg` | teach, oversee |

The file name stored for display is sanitized (strip path separators and control characters, ≤ 120 chars). The extension in the key comes from the content type, never from the user's file name.

## 6. Jobs

All payload schemas live in `lib/schemas/jobs.ts`. Job ids use `-` separators (04 §6.9).

| Queue / name | Payload | Job id | Idempotency | Effect |
|---|---|---|---|---|
| `mail/send` | `MailSend { to, subject, text, html }` (M00) | `mail-<ref>`, `ref` chosen by the producer (e.g. `reset-<userId>-<minuteBucket>`) | id dedupes | one email |
| `mail/fanout` | `MailJob` union: `invitation{userIds[]}` (M01) · `coursePlanPublished{offeringId, version}` (M02). A single known recipient (password reset) skips the fanout and enqueues `mail/send` directly | `<kind>-<id>[-<version>]` | id dedupes; per-recipient `mail/send` ids dedupe | enqueues one `mail/send` per recipient (chunks of 500). Results and grade-sheet events are in-app notifications only (no email) |
| `compute/internalMarks` | `{ offeringId }` | `ce-<offeringId>-<minuteBucket>` | full recompute, upsert | 07 §2 |
| `compute/attainment` | `{ offeringId }` or `{ programId, batchId, termIds }` | `att-<id>-<minuteBucket>` | full recompute, upsert latest | 07 §4–5 |
| `media/transcodeLesson` | `{ lessonId }` | `transcode-<lessonId>` | re-running overwrites the same `lowKey` | 480p data-saver copy (M02 T8b) |
| `compute/finalizeLiveSession` | `FinalizeLiveJob { sessionId }` (M03) | `live-final-<sessionId>` | one transaction: the claim on `finalizedAt` and every write commit together, so a crash is retried from the start and a second run finds nothing to claim; manual marks untouched | 07 §10 |
| `compute/liveSweep` | `LiveSweepJob {}` (M03) | scheduler `live-finalize-hourly` | ends a session only while it is `live`; re-adding a finalize job is deduped by its id, and a failed one is retried instead | ends classes still live 30 min after `scheduledEnd` (at `scheduledEnd`, closing their rooms) and finalizes ended sessions left unfinalized for 10 min (02 §8) |
| `compute/assessmentSweep` | `{}` | scheduler | `dueNotifiedAt` guards reminders; auto-submit is idempotent | 24 h reminders (COM-03) + auto-submit expired attempts (M04) |
| `compute/gradeCode` | `{ submissionId }` | `code-<submissionId>` | overwrites the same results | M05 |
| `compute/engagementSnapshot` | `{ offeringId }` | `eng-<offeringId>-<day>` | overwrites `enrollments.engagement` | M10 |
| `compute/proctorRetention` | `{}` | scheduler | deletes keys then `$unset` | 05 §8 |
| `sync/githubProject` | `{ projectId }` | `gh-<projectId>-<minuteBucket>` | commits upserted by sha | 07 §12 |
| `sync/coursewareList` | `CoursewareListJob { syncRunId, mode: 'new'\|'all', page }` (M01b) | `cw-list-<syncRunId>-<page>` | counts the page's courses into `stats.rows` before queueing them; `new` skips pages already bound to a course | reads one listing page, queues a `coursewarePage` per course, then the next listing page; the last one sets `listedAt` |
| `sync/coursewarePage` | `CoursewarePageJob { syncRunId, coursewareId, force }` (M01b) | `cw-<syncRunId>-<coursewareId>` | `source.lastRunId` counts a page once; a failure is recorded once per page | fetch → normalise → match (bound page, code, unique title) → bind atomically → write in one transaction with `course.imported` (05 §3.6). Concurrency 2: a page takes 30–60 s |
| `sync/examPull`, `sync/examPush` | `{ offeringId, syncRunId }` | `exam-<pull\|push>-<syncRunId>` | **blocked on Q-04** | M08 |

`<minuteBucket>` = `Math.floor(now / 60000)`: repeated triggers inside one minute collapse into one job.

## 7. Settings registry — `lib/schemas/settings.ts`

Every key has a Zod schema with `.default()`s; `getSettings(key)` returns `Schema.parse(stored ?? {})`. Admins edit them on `/admin/settings/<key>` (M02) with a plain form written for that key: a labelled field per value with its help text and the recommended value, never raw JSON (at Aniket's request, 13 Oct 2026). `saveSettings` parses the posted fields with the key's schema and returns field errors under the field names. Every change is audited (`settings.updated`, entity `<key>_settings`, the changed fields before and after).

| Key | Fields (default) | Used by | Status |
|---|---|---|---|
| `lessons` | `completePct` (90) | 07 §8, skill attendance | proposed — confirm Q-17 |
| `evaluation` (M01b) | theory `theoryMidTerm1` 15, `theoryMidTerm2` 15, `theoryAssignment` 5, `theoryAttendance` 5, `theoryEndSem` 60; attendance `attendanceMinPct` 75 and bands `band1Pct` 90 → `band1Marks` 5, 85 → 4, 80 → 3, 75 → 2; practice rubric `practiceConcept` 5, `practicePlanning` 10, `practiceResult` 10, `practiceRecord` 10, `practiceConduct` 5, `practiceViva` 10; project rubrics `projectRelevance` 5, `projectLiterature` 5, `projectMethodology` 10, `projectAnalysis` 10, `projectInterpretation` 10, `projectReport` 10, `projectExtRelevance` 10, `projectExtReport` 20, `projectExtDefence` 20 | 07 §2; copied onto each credit offering at creation (05 §3.7) | CUTM's Examination Policy (2020). Rules: theory parts total 100; bands fall and their marks do not rise or exceed the attendance part; the practice rubric totals 50; the project rubrics total 100. Q-38, Q-41 |
| `attendance` (M03) | `liveThresholdPct` (75) | 07 §10; read by the finalize job | proposed — confirm Q-17 |
| `ceTrend` | `window` (6), `minPoints` (3), `slopeThreshold` (2) | 07 §3 | proposed |
| `attainment` | `targetPct` (60), `level3Pct` (70), `level2Pct` (60), `level1Pct` (50), `cieWeight` (0.5), `seeWeight` (0.5), `defaultTargetLevel` (2) | 07 §4 | proposed — confirm Q-07 |
| `grading` | `scale` (O ≥ 90 → 10, A+ ≥ 80 → 9, A ≥ 70 → 8, B+ ≥ 60 → 7, B ≥ 50 → 6, C ≥ 45 → 5, P ≥ 40 → 4, F < 40 → 0), `absentGrade` ("Ab", 0), `showSgpa` (true) | 07 §6 | proposed (UGC CBCS letter grades) — confirm Q-19, Q-21 |
| `engagement` | `windowDays` (28), weights `attendance` 30 · `video` 20 · `timeliness` 25 · `practice` 15 · `activity` 10, `highBand` (70), `mediumBand` (40), `trendDelta` (10) | 07 §7 | proposed — confirm Q-26 |
| `proctoring` | `snapshotRetentionDays` (90) | 05 §8 | proposed — confirm Q-24 |
| `codeRunner` | `languages` ([{ key: 'c', label: 'C (GCC 9.2.0)', runnerId: 50 }, { key: 'cpp', label: 'C++ (GCC 9.2.0)', runnerId: 54 }, { key: 'java', label: 'Java (OpenJDK 13.0.1)', runnerId: 62 }]), `runCooldownSec` (3) | M05 | defaults verified against Judge0 CE source |
| `projects` | `lastMinuteHours` (48), `hugeCommitLines` (1000), `messageStopWords` (["update","fix","changes","commit","wip","test","minor","asdf","."]) | 07 §12 | proposed |
| `examIntegration` | `mode` ("csv") | M08 | `api` blocked on Q-04 |

Secrets are never settings (A-05): SMTP credentials, LiveKit keys, Judge0 token, GitHub App key, Anthropic key, S3 keys live in env (11 §2).

## 8. CSV formats

All CSVs: UTF-8, header row required, comma separated, parsed with `papaparse` (`header: true, skipEmptyLines: 'greedy'`, header names trimmed and lower-cased). Max 5,000 data rows per file (2 MB action body limit). Imports are **all-or-nothing per file**: if any row fails validation, nothing is written and the action returns every row error (`{ row, message }`, row numbers 1-based excluding the header). The parsing and row validation are pure functions in `lib/domain/csv.ts`.

### 8.1 Users — "Import CSV" dialog on `/admin/users` (M01)
`role,name,email,rollno,employeeid,department,program,batchstartyear,section`
- `role` ∈ `student, faculty, hod, support` (admins are never imported). `hod` rows get roles `['faculty','hod']`.
- students: `rollno`, `program` (code), `batchstartyear`, `section` required; faculty/hod: `employeeid`, `department` (code) required.
- Upsert by `email`. New users are `invited` and receive an invitation email (07-day token).

### 8.2 Enrollment changes — form on `/courses/<id>/people` (M01)
`rollno,action` with `action` ∈ `add, drop`. (The whole batch/section is enrolled automatically when the offering is created.)

### 8.5 Course list — "Upload course list" on `/admin/imports` (M01b, ADM-06)
`programme,stream,basket,type,code,title,credits,tpp` — CUTM's Course Repository, one row per programme × course.
- `programme`, `code`, `title`, `credits`, `tpp` required; `stream` (≤ 60), `basket` (≤ 60) and `type` (≤ 80) optional.
- `code` is normalised (`cutm 1535` → `CUTM1535`) and must be letters and digits. `tpp` is the T+P+Pj split in any of CUTM's spellings (`3+0+1`, `2--2--2`, `1.5+0+1.5`) with three parts, and its total must equal `credits`.
- The same code on several rows keeps one title and one split; a programme lists a code once.
- `programme` is matched to an LMS programme by name, then by code (case and spaces ignored), so `MSc` finds the programme named MSc even when `M.Sc` was given the code `MSC`. With "Create programmes that do not exist yet" ticked, a missing one is created (code from its name, no department, PSO titles by default); otherwise its rows are errors.
- `basket` is matched by name inside the programme or added to it (≤ 12 baskets). `type` labels the link; it sets the course's type only when the course has none.
- Courses are upserted by code: a new course is `active`; for a known one only the title and the credits change (a credit change adds the review note "Credits changed by the course list from X to Y."), never its content. Links are upserted; an unchanged link is not rewritten, so the same file twice changes nothing. Nothing is deleted (A-64). One transaction and one audit entry `course.list_imported` (entity `course_list`) with the counts.

### 8.3 End-semester marks — `/admin/exams/import` (M08)
`rollno,coursecode,termcode,endsemmarks,endsemmax,absent`
- `absent` ∈ `Y, N`; when `Y`, `endsemmarks` must be empty.
- `endsemmarks` 0…`endsemmax`, ≤ 2 decimals.
- Every (`rollno`, `coursecode`, `termcode`) must match an active enrollment in a non-locked offering; unmatched rows are errors (mismatch report, EXM-07).

### 8.4 Internal marks export — `/admin/exams/export` (M08)
`rollno,name,coursecode,termcode` followed by the internal marks of each component the offering's credits copy has (`theoryinternal` of 40, `practiceinternal` of 50, `projectinternal` of 50 under the evaluation policy; the exact columns wait for Q-04 and Q-41). Exported only for locked offerings (CE-11, CE-12).

## 9. Notification kinds

| Kind | Recipient | Created when | `href` |
|---|---|---|---|
| `plan.requested` | the offering's faculty | offering activated without a published plan (CRS-06) | `/courses/<id>/plan` |
| `plan.published` | enrolled students | course plan published (also emailed, COM-01) | `/courses/<id>` |
| `assessment.published` | enrolled students | assessment published | `/courses/<id>/assessments/<aid>` |
| `assessment.dueSoon` | students without a submission | closes within 24 h (hourly scheduler) | same |
| `results.published` | students with a submission | results published | same |
| `live.scheduled` | enrolled students | session scheduled | `/courses/<id>/live/<sid>` |
| `live.changed` | enrolled students | a scheduled session's title, time, length or attendance mode changed (M03 decision 1) | same |
| `live.cancelled` | enrolled students | a scheduled session cancelled (M03 decision 1) | same |
| `live.started` | enrolled students | the teacher started the session (M03 decision 1) | same |
| `task.assigned` | assignee | tracker task assigned | `/courses/<id>/projects/<pid>` |
| `gradeSheet.published` | students in the term | grade sheet published | `/results` |
