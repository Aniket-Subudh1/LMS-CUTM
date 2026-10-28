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
| `page` | `z.coerce.number().int().min(1).max(10_000).default(1)` | `pageSize = 10` (25 until 17 Oct 2026, when Aniket asked for ten rows a page); `max per page = 100` |
| `richText` | the editor's hidden input (a JSON string, `''` when empty), ≤ 100 KB, parsed into `RichTextDoc`: a `doc` whose nodes and marks are StarterKit's (`paragraph text heading bulletList orderedList listItem blockquote codeBlock hardBreak horizontalRule`; marks `bold italic underline strike code link`), any other type → "Unsupported content." A document without text becomes `null` | `lib/schemas` may import only `zod`, so the type list stands in for a test render; `lib/domain/rich-text.ts` renders with `@tiptap/html/server` and its tests prove the output is inert. DAL reads parse stored documents with `RichTextDoc` |
| `istDateTime` | `z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)`; the action converts it with `parseIstLocal` (`lib/schemas` imports only `zod`) | `<input type="datetime-local">` sends no time zone; the server interprets it as **IST (+05:30)**. `parseIstLocal('2026-10-12T10:30')` → `2026-10-12T05:00:00.000Z`. Added with its first caller (M04) |
| `istTime` | `HH:mm`, 00:00–23:59 (M03) | `<input type="time">`; the action joins it to an `istDate` and converts with `parseIstLocal` (scheduling a live class: date, start time and length, A-68) |
| `istDate` | `YYYY-MM-DD` string, checked to be a real date | for calendar dates; `lib/schemas` imports `zod` only, so the action converts it with `istDateToDate` (`lib/domain/time.ts`) to a `Date` at 00:00 IST |
| `marks` | `z.coerce.number().min(0).max(1000)` then `roundHalfUp(x, 2)` in the action (`lib/schemas` imports only `zod`) | all hand-entered marks (M04) |
| `ids[]` | `z.array(objectId).max(n)` with the `name[]` form convention | |
| `email` | `z.email().toLowerCase()` | |

Pure helpers used by these (`parseIstLocal`, `istDayKey`, `roundHalfUp`) live in `lib/domain/time.ts` and `lib/domain/round.ts` with tests (07 §1, §11).

## 3. Route handlers (external callers only)

| Route | Method | Caller | Auth | Request | Responses | Effect |
|---|---|---|---|---|---|---|
| `/api/health` | GET | Load balancer, uptime monitor | none | — | `200 {"ok":true,"mongo":"up","redis":"up"}`; `503` with the failing part | Pings Mongo (`db.admin().ping()`) and Redis (`PING`) with a 2 s timeout. No other data |
| `/api/beacon` | POST | Browser `sendBeacon` | session | `Beacon` union (below) | `204`; `400`; `401`; `429` | Updates `lessonProgress` / `attendance.focusedSec` and `engagementDaily` (07 §8–9) |
| `/api/files/[...key]` | GET | Browser links, `<video src>`, `<img src>` | session | key path | `302` to presigned GET with `Cache-Control: private, max-age=300` (the presigned URL lives 600 s; a page of thumbnails costs one check each per five minutes, M03b); `404` | Authorizes by key prefix (§5) then redirects |
| `/api/webhooks/live` | POST | Live engine | engine signature | raw body + `Authorization` | `200`; `401` bad signature | Normalizes to `LiveEvent`; appends presence; on `room_finished` enqueues `compute/finalizeLiveSession`. M03c: a join by a removed student is removed again and not recorded; a student's join while any of `studentsMay` is off gets `setRights` |
| `/api/webhooks/github` | POST | GitHub App | `X-Hub-Signature-256` | raw body + `X-GitHub-Event`, `X-GitHub-Delivery` | `200`; `401` | On `push` for a linked repo: enqueue `sync/githubProject` (debounced by job id) |
| `/api/auth/github/callback` | GET | GitHub OAuth redirect | session + `state` | `code`, `state` | `302` to `/profile` | Verifies `state`, exchanges `code`, stores `users.github` |
| `/api/exports/internal-marks` | GET | Admin's browser (file download) | session, admin | `termId`, `batchId` | `200 text/csv` attachment; `400` when no course is locked or over 10,000 rows; `404` without an admin session or for an unknown batch or term | §8.4: one batch's locked offerings in the term, built in memory (at most 10,000 rows, about 1 MB); an `exam_push_csv` run, `offerings.lastPushedAt`, audit `ce.exported`. The only UI-facing route handler, because a generated file download cannot be a Server Action (M08) |

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
sendMail(message: { to: string; subject: string; text: string; html: string; calendar?: { method: 'REQUEST' | 'CANCEL'; content: string } }): Promise<void>
```
M03c T4: `calendar` is a meeting invitation's file (§8.7), sent as nodemailer's `icalEvent` (`invite.ics` with the method), which Gmail and Outlook show as an invitation. Only the `mail` worker calls it. One recipient per message (no CC/BCC lists of students). HTML is built by pure template functions in `lib/domain/email-templates.ts` that HTML-escape every interpolated value.

### 4.3 Live — `live.ts` (M03; self-hosted LiveKit — ADR-18)
```ts
type LiveRole = 'host' | 'participant';
type StudentRights = { share: boolean; unmute: boolean; chat: boolean };   // M03c
type RoomPerson = { identity: string; host: boolean; microphones: string[] };   // M03c: open microphone track ids
type RoomTopic = 'notice' | 'controls' | 'poll' | 'breakout' | 'board';   // M03c; 'poll' (T6): a poll started, ended or was shown; 'breakout' (T7): rooms opened or are closing; 'board' (T8): the whiteboard opened, closed or changed who draws
const JOIN_TTL_SEC = 600;   // M03c
joinToken(input: { roomName: string; userId: string; name: string; role: LiveRole; rights: StudentRights }): Promise<{ serverUrl: string; token: string }>
closeRoom(roomName: string): Promise<void>
setHand(roomName: string, identity: string, raisedAt: Date | null): Promise<void>   // M03b: raise (the time) or lower ("") a hand
roomPeople(roomName: string): Promise<RoomPerson[]>   // M03c
muteMicrophone(roomName: string, identity: string, trackSids?: string[]): Promise<boolean>   // M03c: false when it was already off
setRights(roomName: string, identity: string, rights: StudentRights): Promise<void>   // M03c
removeFromRoom(roomName: string, identity: string): Promise<void>   // M03c
tell(roomName: string, topic: RoomTopic, text: string, identities?: string[]): Promise<void>   // M03c
recordingEnabled(): boolean   // M03c T5: LIVEKIT_EGRESS === 'on'
startRecording(roomName: string, key: string): Promise<string | null>   // M03c T5: the egress id; null when the room is not open
stopRecording(roomName: string, egressId: string): Promise<void>   // M03c T5: one already ended changes nothing
activeRecordings(roomName: string): Promise<Recording[]>   // M03c T13: what the engine is recording in the room now
recordingInfo(roomName: string, egressId: string): Promise<Recording | null>   // M03c T13: one recording, ended or not; null once forgotten
parseWebhook(rawBody: string, authorization: string | null): Promise<LiveEvent>   // throws AppError('FORBIDDEN') if the signature is invalid

type LiveEvent =
  | { type: 'joined'; roomName: string; userId: string; sid: string; host: boolean; at: Date }
  | { type: 'left'; roomName: string; userId: string; sid: string; joinedAt: Date; at: Date }
  | { type: 'room_finished'; roomName: string; at: Date }
  | ({ type: 'recording'; roomName: string; at: Date } & Recording)   // M03c T5
  | { type: 'ignored' };
// M03c T13: `key` is the file path the LMS asked for (the request's `fileOutputs[0].filepath`, else `fileResults[0].filename`).
type Recording = { egressId: string; key: string; status: 'active' | 'saved' | 'failed'; durationSec: number | null };
```
M03c T5 (verified on the test server's LiveKit 1.13.10 with Egress v1.15.0, 24 Oct 2026): `startRecording` is `EgressClient.startRoomCompositeEgress(roomName, new EncodedFileOutput({ fileType: MP4, filepath: key, output: { case: 's3', value: new S3Upload({ the LMS's S3_* settings }) } }), { layout: 'speaker' })`, so Egress keeps no storage credentials; `stopRecording` is `stopEgress`, and `failed_precondition` (already ended) is nothing to do. The recording page starts only once someone is in the room (an empty room is aborted with "Start signal not received"). Webhooks `egress_started`, `egress_updated`, `egress_ended` carry `egressInfo` (its `roomName`, `status`, `fileResults[0].duration` in ns): statuses below `EGRESS_COMPLETE` are `active`; `EGRESS_FAILED`, `EGRESS_ABORTED` or no file are `failed`; `EGRESS_COMPLETE` and `EGRESS_LIMIT_REACHED` with a file are `saved`. Browsers learn that a room is recorded from the engine (`useIsRecording`). M03c T13: `activeRecordings` is `listEgress({ roomName, active: true })` and `recordingInfo` is `listEgress({ egressId })` (`ListEgressOptions`, verified in `livekit-server-sdk` 2.19.1); both map an `EgressInfo` as the webhook does.
LiveKit mapping (verified against `livekit-server-sdk` 2.19.1 types): `new AccessToken(key, secret, { identity: userId, name, ttl: JOIN_TTL_SEC, attributes: { role } })` (M03b: the room tells hosts apart by the `role` attribute; M03c T4: a meeting's guest has `role: 'guest'` with a member's rights, so People marks them and the breakout setup leaves them in the main room, A-201), `addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData, canPublishSources })`, `await toJwt()`. Hosts get `canPublishData: true` and no `canPublishSources` (every source); students get `canPublishData: rights.chat` and `canPublishSources` `camera`, plus `microphone` with `unmute` and `screen_share`, `screen_share_audio` with `share` (M03c). No token grants `roomAdmin` (M03c: hosts act through the LMS, which checks and audits) or `canUpdateOwnMetadata`, so no browser can change its own name, role or hand. Tokens live 10 minutes (M03c): LiveKit renews them for everyone connected, and Rejoin reloads the page for a new one, so a removed student's kept token soon stops working. Webhooks: `new WebhookReceiver(key, secret)`, `await receive(body, authHeader)`; events `participant_joined`, `participant_left`, `room_finished`; others (including `participant_connection_aborted`) → `ignored`. `sid` is `event.participant.sid`, one per connection (a reconnect or a second tab is a new one); `host` is `participant.attributes.role === 'host'`; a `left` carries the connection's own `participant.joinedAtMs`, so a leave whose join never arrived still gives its interval. Every `RoomServiceClient` call treats the engine's `ServerError` with status 404 (`not_found`) as nothing to change (a room nobody is in, someone who has left) and maps any other failure to `AppError('INTEGRATION')`. `setHand` is `updateParticipant(room, identity, { attributes: { hand } })` with `hand` the time raised in ms, or `""` to lower it (M03b, verified on the dev LiveKit server 17 Oct 2026). M03c, verified on the dev LiveKit server 17 Oct 2026: `roomPeople` is `listParticipants`; `muteMicrophone` is `mutePublishedTrack(room, identity, sid, true)` for each open microphone track (found with `getParticipant` unless given) — a host turns a microphone off, never on, as in Google Meet; `setRights` is `updateParticipant(room, identity, { permission })` with the whole permission (it is replaced, not merged: `canSubscribe`, `canPublish`, `canPublishData`, `canPublishSources`, `canUpdateMetadata: false`), and the engine unpublishes a track whose source is no longer allowed; `removeFromRoom` is `removeParticipant` (it does not stop the person's token on a self-hosted engine); `tell` is `sendData(room, utf8(text), RELIABLE, { topic, destinationIdentities })` — browsers act only on these topics from the server (no sender), never from another browser.

### 4.4 Code runner — `code-runner.ts` (M05; reference: Judge0 CE 1.13.1)
```ts
type RunStatus = 'accepted' | 'wrong_answer' | 'time_limit' | 'compile_error' | 'runtime_error' | 'internal_error';
runBatch(jobs: { runnerLanguageId: number; source: string; stdin: string; timeLimitSec: number; memoryKb: number }[]):
  Promise<{ status: RunStatus; stdout: string; stderr: string; compileOutput: string; timeMs: number | null; memoryKb: number | null }[]>
listLanguages(): Promise<{ id: number; name: string }[]>
```
Built in M04b (TP-09). The adapter runs code and never compares outputs (07 §14), so no expected output is sent. `CODE_RUNNER_URL` defaults to Judge0's free public server (`https://ce.judge0.com`, Judge0 CE 1.14.0, the same API and language ids; no token) until the university runs its own (Q-55); the header goes only when `CODE_RUNNER_TOKEN` is set. Verified against that server on 18 Oct 2026: C, C++, Java and Python programs, a time limit and a compile error. Every failure (no answer in 15 s, an error status, an answer of another shape, still running after 20 s) is `AppError('INTEGRATION', 'The code runner is busy. Try again in a minute.')`; outputs are cut at 64 KB. Judge0 mapping (verified from the v1.13.1 source): `POST /submissions/batch?base64_encoded=true` with `{ submissions: [{ source_code, language_id, stdin, cpu_time_limit, memory_limit }] }` → `[{ token }]`; poll `GET /submissions/batch?tokens=<csv>&base64_encoded=true&fields=token,status,stdout,stderr,compile_output,time,memory` every 500 ms until no status id is 1 (In Queue) or 2 (Processing), timeout 20 s. Status ids: 3 → accepted, 4 → wrong_answer, 5 → time_limit, 6 → compile_error, 7–12 → runtime_error, 13–14 → internal_error. Batch size ≤ 20 (Judge0 default `MAX_SUBMISSION_BATCH_SIZE`). Auth header `X-Auth-Token` (Judge0 default `AUTHN_HEADER`) with `CODE_RUNNER_TOKEN`. Default language ids in Judge0 CE: 50 C (GCC 9.2.0), 54 C++ (GCC 9.2.0), 62 Java (OpenJDK 13.0.1) — configurable in settings (§7) and verifiable with `listLanguages()`.

### 4.5 GitHub — `github.ts` (M07; `octokit` 5)
```ts
installUrl(): string
oauthAuthorizeUrl(state: string): string
exchangeOAuthCode(code: string): Promise<{ id: number; login: string }>
resolveRepo(owner: string, name: string): Promise<{ installationId: number; owner: string; name: string; defaultBranch: string }>   // GitHub's own spelling of owner/name; NOT_FOUND if the App is not installed on it
githubConfigured(): boolean   // all six GITHUB_* settings present (M07)
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

### 4.7 AI — `ai.ts` (M04b, M09; `openai` 7.27.0)
```ts
aiConfigured(): boolean // OPENAI_API_KEY is set (M04b)
draftQuestions(input: { topic: string; count: number; type: 'mcq' | 'msq' | 'true_false' | 'numeric' | 'text'; level: 'mixed' | 'easy' | 'medium' | 'hard'; cos: { code: string; statement: string }[] }): Promise<AiDraft[] | null> // M04b, TP-10: AiDrafts in lib/schemas/bank.ts; 16,000 output tokens
suggestItemTags(input: { promptText: string; cos: { code: string; statement: string }[] }): Promise<{ coCodes: string[]; bloomLevel: BloomLevel; rationale: string } | null> // M09: ItemTagSuggestion in lib/schemas/ai.ts; codes not in `cos` dropped, none left → null
suggestCoMap(input: { cos: { code: string; statement: string }[]; outcomes: { code: string; title: string }[] }): Promise<{ co: string; outcome: string; level: 1 | 2 | 3; rationale: string }[] | null> // M09: CoMapSuggestion; only titled outcomes are passed (M09 decision 2); unknown codes and repeated pairs dropped, none left → null
explainEngagement(input: { metrics: Record<string, number>; band: string; trend: string }): Promise<string | null>
```
Reference call shape (type-checked against SDK 7.27.0; OpenAI replaced Anthropic on 18 Oct 2026, Aniket's choice for cost):
```ts
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

const res = await client().responses.parse({
  model: env().OPENAI_MODEL, // default 'gpt-5.4-mini'
  instructions: SYSTEM_PROMPT,
  input: userContent,
  max_output_tokens: 2000,
  text: { format: zodTextFormat(ItemTagSuggestion, 'item_tags') },
});
return res.output_parsed; // validated against the Zod schema; null for a refusal or an answer that does not fit
```
Rules: never send names, roll numbers, emails or answers — only question text, a topic a teacher typed, CO statements, outcome titles and numeric metrics. Without the key every call is `AppError('CONFLICT', 'AI suggestions are not set up.')`; a failed request is `AppError('INTEGRATION', …)`, logged. A draft's fields are plain (structured output carries no transforms) and are checked afterwards as a CSV row is (§8.6). `null` means "no suggestion" and the UI says "No suggestion available right now". Rate-limited (09 §4).

M09 actions (CPP-07), each needing the AI set up and counting toward the `ai` limit, and writing nothing: `suggestItemTags(formData)` (`app/(app)/tests/bank/actions.ts`) takes the question dialog's own fields — `assessmentId` in the builder (teach), `offeringId` in a course bank (`requireBankEditor`) — and answers `{ coIds, bloomLevel, rationale }`; the dialog ticks and selects them, and Save stores them. `suggestCoMap({ courseId, offeringId? })` (`app/(app)/catalog/actions.ts`, the course's editors) answers `{ cells: { coId, outcome, level, rationale }[], untitled: string[], titlesAt: { id, code }[] }`: titles from the offering's programme, or on the catalogue course the first title each code has among the programmes listing it (by programme code); `untitled` names the codes left out, and `titlesAt` (for admins only, empty otherwise) the programmes asked, whose pages give them titles. The editor puts the cells into the grid as unsaved changes (cells it does not name keep their level); `saveCoMap` stores them. Whether the buttons show: `Builder.aiReady` (`lib/data/assessments.ts`), `BankPage.aiReady`, and `aiReady` on `OfferingCourse` and `CatalogCourse` (`lib/data/courses.ts`; `EditableCourse` carries it).

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
| `lesson-doc` | teach | offering | `application/pdf` | 50 MB | `lesson-doc/<offeringId>/…` | same; also a lesson's PDF notes (`attachments`, M03b) |
| `lesson-thumb` | teach | offering | `image/jpeg`, `image/png`, `image/webp` (never SVG) | 2 MB | `lesson-thumb/<offeringId>/…` | same as the lesson (M03b); cropped and resized in the browser to 1280 × 720 JPEG |
| `offering-cover` | teach | offering | `image/jpeg`, `image/png`, `image/webp` (never SVG) | 2 MB | `offering-cover/<offeringId>/…` | teach, oversee, learn (M03b); resized in the browser to 1600 × 640 JPEG |
| `syllabus` | admin, or the course's coordinator (CRS-07, M01b) | course | `application/pdf` | 20 MB | `syllabus/<courseId>/…` | any staff member (admin, HoD, faculty — they all open the catalogue course), or a student with access to an offering of the course (Q-53) |
| `submission` | whoever takes it (own attempt in progress) | assessment | `application/pdf`, `image/jpeg`, `image/png`, `image/heic` | 25 MB each, ≤ 10 per item | `submission/<assessmentId>/<userId>/<uuid>.<ext>` | the owner; teach, oversee; for a standalone test (M04b) its owners and admins |
| `proctor-snapshot` | whoever takes it: their own running attempt on a test that takes camera snapshots, at most 240 an attempt; its own limit, 4 a minute (M04b) | submission | `image/jpeg` | 300 KB | `proctor-snapshot/<submissionId>/<userId>/<uuid>.jpg` | the test's staff (teach, oversee; a standalone test's owners and admins), never the person in it (09 §11) |
| `live-recording` | nobody: LiveKit Egress writes it when a host records (M03c T5; `createUpload` refuses the purpose) | live session | `video/mp4` | — (6 h at most) | `live-recording/<sessionId>/<hostId>/<uuid>.mp4` | a `saved` recording of the session: for a class whoever reaches its offering (teach, oversee, learn — the class page's audience), for a meeting its hosts and members |
| `test-file` | nobody: the `makeTestFile` job makes it (`createUpload` refuses the purpose) (M04b, TP-12) | assessment | `application/pdf`, the .xlsx type | — | `test-file/<assessmentId>/<owner>/<uuid>.<pdf\|xlsx>` (the owner is the taker for a scorecard or certificate, the requester for the staff's files) | the record's current key only (`testFiles.key`): the Excel export and reports to the test's staff (teach, oversee; a standalone test's owners and admins); a scorecard or certificate to the person it is about and the test's staff |

The file name stored for display is sanitized (strip path separators and control characters, ≤ 120 chars). The extension in the key comes from the content type, never from the user's file name.

## 6. Jobs

All payload schemas live in `lib/schemas/jobs.ts`. Job ids use `-` separators (04 §6.9).

| Queue / name | Payload | Job id | Idempotency | Effect |
|---|---|---|---|---|
| `mail/send` | `MailSend { to, subject, text, html }` (M00) | `mail-<ref>`, `ref` chosen by the producer (e.g. `reset-<userId>-<minuteBucket>`; M04b: `otp-<otpId>-<ms>` for a guest's code, `test-invite-<linkId>-<base64url(email)>-<day>` for an invitation, so a day's repeat to one address is dropped) | id dedupes | one email. M04b: `guestCodeEmail` (the code leads the subject, so a phone's notification shows it) and `testInvitationEmail` (`lib/domain/email-templates.ts`) |
| `mail/fanout` | `MailJob` union: `invitation{userIds[]}` (M01) · `coursePlanPublished{offeringId, version}` (M02) · `meetingInvites{sessionId, sequence, method, userIds[], guestIds[], cancelTo[{email, name}], changed, resentAt?}` (M03c T4: one `mail/send` per person, id `mail-meeting-<sessionId>-<sequence>-<method>-<recipient>[-<resentAt>]`, each with its own §8.7 file and, T14, their own link and the passcode; `cancelTo` are people taken off the meeting; `changed` makes it "Updated invitation", for a new time or title only; `resentAt` is a host's "Send again"). A single known recipient (password reset) skips the fanout and enqueues `mail/send` directly | `<kind>-<id>[-<version>]` | id dedupes; per-recipient `mail/send` ids dedupe | enqueues one `mail/send` per recipient (chunks of 500). Results and grade-sheet events are in-app notifications only (no email) |
| `compute/internalMarks` | `InternalMarksJob { offeringId }` (M06) | `ce-<offeringId>`, queued 5 s ahead; asking again while one waits does nothing, while one runs adds a follow-up (`queueInternalMarks`, the `queueTestStats` pattern: a minute bucket left M04b's ranks stale) | full recompute of every active student, one `bulkWrite`; skips skill and locked offerings | 07 §2 |
| `compute/internalMarksNightly` | `{}` (M06) | scheduler | queues `compute/internalMarks` for every active credit offering | safety net |
| `compute/attainment` | `AttainmentJob { offeringId, actorId? }` (M09; `actorId` when someone pressed "Work it out again", stored as `computedBy`) | `att-<offeringId>`, queued 5 s ahead by `queueAttainment` (the `queueInternalMarks` pattern) | full recompute of the offering, one upsert of its record | 07 §4: skips skill offerings, runs on locked ones. Queued by `releaseResults`, a grade change on published results (`gradeSubmission`, `gradeCode`), `importEndSem` (each offering the file touched), `publishGradeSheets` (the batch's credit offerings in the term, EXM-06), `saveCoMap` and `deleteCo` (the course's active credit offerings) and "Work it out again" (`requestAttainment`, `app/(app)/courses/[offeringId]/outcomes/actions.ts`: teach or admin, credit offerings only). The worker runs `recomputeAttainment` (`lib/data/attainment.ts`); the pages read through `getOfferingAttainment` and `getProgramAttainment` (`lib/data/attainment-views.ts`). The programme report (07 §5) has no job (M09 decision 4) |
| `media/transcodeLesson` | `MediaJob { lessonId, fileKey }` (M03b) | `transcode-<lessonId>-<fileUuid(fileKey)>`, so a replaced video is a new job | every write is conditional on the lesson still holding `fileKey`; a job whose file was replaced meanwhile deletes what it uploaded, and its failure marks nothing | the frame first (`frameKey`, 07 §18), then the 480p data-saver copy (`lowKey`) (M02 T8b, M03b) |
| `compute/finalizeLiveSession` | `FinalizeLiveJob { sessionId }` (M03) | `live-final-<sessionId>` | one transaction: the claim on `finalizedAt` and every write commit together, so a crash is retried from the start and a second run finds nothing to claim; manual marks untouched | 07 §10 |
| `compute/liveSweep` | `LiveSweepJob {}` (M03) | scheduler `liveSweep` | ends a session only while it is `live`; re-adding a finalize job is deduped by its id, and a failed one is retried instead | ends classes still live 30 min after `scheduledEnd` (at `scheduledEnd`, closing their rooms) and finalizes ended sessions left unfinalized for 10 min (02 §8) |
| `compute/liveControl` | `LiveControlJob { op: 'rights', sessionId } \| { op: 'muteAll', sessionId, byId, byName } \| { op: 'closeBreakouts', sessionId } \| { op: 'settleRecordings', sessionId }` (M03c; `closeBreakouts` T7, queued for 15 s after `breakout.closesAt`; `settleRecordings` T13, queued 2 min after a stop and 1 min after the room closes with one running: `settleRecordings` in `lib/data/recordings.ts`) | none: each control is its own job | reads the class as it is when it runs, so a repeat applies the same state; nothing once the class is not live | `rights`: `setRights` with the class's `studentsMay` for every student in the room. `muteAll`: `muteMicrophone` for everyone but `byId`, then `tell` them "<byName> muted everyone" |
| `compute/assessmentSweep` | `AssessmentSweepJob {}` (M04) | scheduler `assessmentSweep` | a reminder is claimed by setting `dueNotifiedAt` only where it is null; an attempt is handed in only while `in_progress`, so its counters go up once | 24 h reminders (COM-03) to enrolled students without a submission — for a standalone test, to those its links let in (`testGrants`, M04b), linking to `/tests/<id>` — + hand in attempts whose `deadlineAt` is more than 5 min past, in batches (M04) |
| `compute/gradeCode` | `GradeCodeJob { submissionId }` (M04b, TP-09) | `code-<submissionId>`, queued by `handInAttempts` when the paper has a code question; a grader's "Run the tests again" (`queueGradeCode(id, true)`) removes a finished job and adds it anew | results and the tests' marks replace the last run's; a grader's own mark stays; the write is guarded by the attempt's `updatedAt` and read again when a grader saved meanwhile | every test of each answered code question run in its language (`codeRunner` setting), compared (07 §14) and marked by `codeItemMarks`; unanswered → 0; a language no longer offered fails every test (`internal_error`); then `total` and `graded` when nothing else waits. A runner failure throws and BullMQ retries |
| `compute/draftQuestions` | `DraftQuestionsJob { bank: { courseId } \| { ownerId }, offeringId?, requestedBy, topic, count, type, level, coIds }` (M04b, TP-10) | `draft-<requestedBy>-<ms>`; one try only | not retried, since a retry after saving would save the drafts twice; every outcome is told to the teacher | asks `draftQuestions` with the topic, the chosen outcomes' statements and the level; checks each draft as a CSV row (§8.6), keeps only the chosen outcomes, saves those that pass (within the bank's 5,000) with `aiDraft: true`, and notifies `bank.drafted` — how many are ready, that none could be used, or that the AI could not be reached |
| `compute/makeTestFile` | `MakeTestFileJob { fileId }` (M04b, TP-12) | `file-<fileId>-<requestedAt ms>`; 3 tries, 10 s apart | builds in a temporary folder and uploads under a new key; `ready` is set only while the record's `requestedAt` is the job's, otherwise its object is deleted; the last failed try sets `failed` | one file from a test's results (07 §20): `results_xlsx` (a Results sheet of each taker's counted attempt, ranked, with sections and the test's own questions; a Questions sheet from `testStats` once worked out), `reports_pdf` (a cover, then one report per hand-in by name), `scorecard`, `certificate` (gives the attempt its `certificateCode` the first time). Queued by `requestTestFile` |
| `compute/testStats` | `TestStatsJob { assessmentId }` (M04b, TP-11) | `stats-<assessmentId>`; `queueTestStats` adds nothing while one waits, removes a finished one and adds it anew, and adds a follow-up (`stats-<id>-<ms>`) while one runs; 5 s delay | rebuilds `testStats` whole and sets `rank`/`percentile` and `similar` afresh, so a repeat writes the same | over each taker's counted attempt: ranks, the histogram, item analysis, alike answers (07 §19) and the leaderboard. Queued by publishing results (by hand or rule), by a regrade, a waived penalty or a code re-run after publication, and by "Work them out again" |
| `compute/engagementSnapshot` | `{ offeringId }` | `eng-<offeringId>-<day>` | overwrites `enrollments.engagement` | M10 |
| `compute/proctorRetention` | `ProctorRetentionJob {}` (M04b) | scheduler `proctorRetention` | storage first, then `proctor.snapshots` emptied and the test's `snapshotsDeletedAt` set, so a repeat finds nothing | up to 50 tests a run whose results went out more than `snapshotRetentionDays` ago (05 §8) |
| `sync/githubProject` | `GithubProjectJob { projectId }` (M07) | `gh-<projectId>`, debounced as `compute/internalMarks` is | commits upserted by `{ projectId, sha }`; a `syncRuns` row per run | 07 §12 |
| `sync/githubNightly` | `{}` (M07) | scheduler | queues `sync/githubProject` for every active GitHub project with a repository | safety net |
| `sync/coursewareList` | `CoursewareListJob { syncRunId, mode: 'new'\|'all', page }` (M01b) | `cw-list-<syncRunId>-<page>` | counts the page's courses into `stats.rows` before queueing them; `new` skips pages already bound to a course | reads one listing page, queues a `coursewarePage` per course, then the next listing page; the last one sets `listedAt` |
| `sync/coursewarePage` | `CoursewarePageJob { syncRunId, coursewareId, force }` (M01b) | `cw-<syncRunId>-<coursewareId>` | `source.lastRunId` counts a page once; a failure is recorded once per page | fetch → normalise → match (bound page, code, unique title) → bind atomically → write in one transaction with `course.imported` (05 §3.6). Concurrency 2: a page takes 30–60 s |
| `compute/lockOffering` | `LockOfferingJob { offeringId, syncRunId, actorId }` (M08) | `lock-<syncRunId>-<offeringId>` | a locked offering counts as applied and is not locked again; counting the offering and finishing the run is one pipeline update | `recomputeInternalMarks`, then the lock with audit `marks.locked` in one transaction when every active student is `complete`; otherwise a failure naming how many students are incomplete (a lock with a reason is done one offering at a time) |
| `compute/gradeSheets` | `GradeSheetsJob { termId, batchId, syncRunId, actorId }` (M08) | `gs-<syncRunId>`; the action starts no run while one for the batch and term is running (a run that has not moved for 2 hours has stopped) | upserts every non-published sheet of the batch whole, so a repeat writes the same; the last failed try marks the run failed | 07 §6: `draft` or `incomplete` per student (05 §5.5), 200 students at a time; a student with no credit course this term keeps no unpublished sheet; then the run's figures (`rows` students, `applied` ready, `failed` incomplete, `skipped` already published) |
| `sync/examPull`, `sync/examPush` | `{ offeringId, syncRunId }` | `exam-<pull\|push>-<syncRunId>` | **blocked on Q-04** | M08 |

`<minuteBucket>` = `Math.floor(now / 60000)`: repeated triggers inside one minute collapse into one job.

### 6.2 Building and taking a test (M04b phase B, `lib/schemas/assessment.ts`, `lib/schemas/bank.ts`)

- **Questions:** `saveItem` takes one question's fields for every type (`ItemInput`: options, key, rubric, blanks, pairs, negative marks, partial credit, explanation, difficulty, topic) plus its `sectionId`; `storedItem` (`lib/data/questions.ts`) gives every option, criterion, blank and pair a new id.
- **Sections:** `saveSection`, `deleteSection` (only an empty one), `reorderSections`; the first section takes in every question there is. `publishAssessment` refuses while a draw cannot be met (`shortfallMessages`, `lib/data/papers.ts`).
- **Bank:** `saveBankItem`, `deleteBankItem`, `importBankCsv`, `copyToBank` (`app/(app)/tests/bank/actions.ts`, faculty and admin; a course bank through an offering they teach, `requireBankEditor`) and `addFromBank` (assessment actions). Reads: `getBank`, `getBankItem`, `pickFromBank` (`lib/data/bank.ts`).
- **Extra time:** `setExtraTime({ assessmentId, who, minutes })` — `who` is an email or roll number; 0 takes it away; a running attempt's `deadlineAt` moves at once; audited.
- **Attempt:** `startAttempt({ assessmentId, agree })` refuses a new attempt (VALIDATION) unless `agree` (the lobby's "I have read the rules", 09 §11; M05, 23 Oct 2026), then builds the paper (`buildPaper`: fixed questions per section, then draws seeded by the attempt id; `usedCount` +1 on drawn bank questions; CONFLICT when the bank can no longer meet a rule) and opens the first section. `saveAnswer({ submissionId, itemId, answer, spentSec })` checks the answer against the paper's question and refuses (CLOSED) a closed section; `flagItem({ submissionId, itemId, flagged })`; `enterSection({ submissionId, sectionId })` applies `planSectionMove` and writes the visits whole over the ones read (CONFLICT from another tab).
- **Grading:** `gradeSubmission` reads the attempt's paper; a mark may be as low as the question's `−negativeMarks`; a code question's mark left empty keeps the one its tests gave (phase D).
- **Results (phase E1, TP-11, 07 §19):** `saveResultRules({ assessmentId, release, showAnswers, showExplanations, leaderboard, bandLabel[], bandMin[] })` (manage; bands highest first; `setBy` records who saved); `refreshResults({ assessmentId })` queues `testStats`. `releaseResults(test, actorId, now, reason?)` (`lib/data/results.ts`, worker-safe) is the one publish — by `publishResults` and by the sweep for `on_close` — its status change and audit entry in one transaction, then the notice and `testStats`. Reads: `MyResult` gains `maxMarks`, `pct`, `band`, `standing` (once published), `sections`, `outcomes`, `leaderboard` and per question `given`, `correct` and `explanation` (only as the rules allow); `getTestResults(assessmentId)` (manage, oversee) returns the last `testStats` with each question's labels and whether to look at it; `HandIns.rows[].similar`; `GradingView.similar`. The hourly `assessmentSweep` also publishes `on_close` tests.
- **AI drafts (phase E3, TP-10, §4.7):** `draftWithAi({ offeringId?, topic, count, type, level, coIds[] })` (the bank's editors: faculty teaching an offering of the course, admins, or one's own bank; 1–20 at a time; the course's outcomes only; limit `ai` 30 an hour; CONFLICT "AI suggestions are not set up." without the key) queues `draftQuestions`. `saveBankItem` on an AI draft accepts it (`aiDraft: false`). Reads: `BankPage.aiReady`, `stats.drafts` (the other counts are of reviewed questions), `BankRow.aiDraft`; `getBankItem` adds `aiDraft`; `pickFromBank`, `addFromBank` and the paper draws skip drafts. The AI's suggested mark bands for written and code answers are not built (Q-56).
- **Files from the results (phase E2, TP-12, 07 §20):** `saveResultRules` also takes `certificateFrom` (0–100, empty for none). `requestTestFile({ assessmentId, kind })` (any role; limit `test-file` 10 an hour): `results_xlsx` and `reports_pdf` for the test's staff (manage, oversee) once anyone has handed in; `scorecard` for a taker whose result shows (published, or `instant`) and `certificate` when it earns one; it sets the `testFiles` record `making` and queues `makeTestFile`. Reads: `MyResult.files` (`{ scorecard, certificate? }`) and `TestResults.files` (`{ results_xlsx, reports_pdf }`, null before any hand-in), each a `TestFileState`: `ask` (with `failed`), `making`, or `ready` with its `/api/files` link and `madeAt`; a request still `making` after 10 minutes counts as failed. `getCertificate(code)` (`lib/data/results.ts`, no session) answers the public `/v/<code>` page.
- **Code questions (phase D, TP-09):** `saveItem` and the bank's `saveBankItem` take a `code` question's languages, starters, limits and up to 15 tests (`ItemInput`), checked against the `codeRunner` setting (`requireOfferedLanguages`, `lib/data/questions.ts`); a test holds at most 5. The runner's `runCode({ submissionId, itemId, language, source })` saves the code as the answer and runs it on the visible tests only (`runSamples`, `lib/data/code.ts`), answering `{ results: SampleRun[], runsLeft }` — `SampleRun` is `{ id, status, stdout, error, timeMs, memoryKb }`, outputs cut at 4 KB, never a hidden test; it refuses a language the question does not offer (VALIDATION), a question's runs past its `runLimit` (CONFLICT), and more than one run per `runCooldownSec` or 200 an hour (RATE_LIMITED). `saveAnswer` takes `{ type: 'code', language, source }` (≤ 64 KB). A grader's `rerunCode({ submissionId })` queues `gradeCode` again (audited `submission.code_rerun`). Reads: `StudentItem.code` (languages, starters, limits, visible `samples`, the `hidden` count), `TeacherItem.tests` (all), `AttemptDTO.languages`, `runCooldownSec` and each item's `runs`; `GradingView.submission.runs`, `results` and `codeGradedAt`.
- **Proctoring and the live monitor (phase C, TP-08, 07 §15):** `saveProctoring` (refused once anyone has started); the runner's `proctorBeat({ submissionId, sessionId, events })` every 15 s and at once with what it noticed — it answers `{ state: 'live' \| 'blocked', hard, deadlineAt, messages }` or `{ state: 'ended', endedBy }` — and `addSnapshot({ submissionId, key })` after a `proctor-snapshot` upload; the monitor's `extendAttempts({ assessmentId, submissionId?, minutes })` (1–120, audited `assessment.time_added`), `messageTakers({ assessmentId, submissionId?, text })` and `endAttempt({ submissionId })` (audited `submission.ended`); a grader's `waivePenalty({ submissionId, waived })` (audited). Without `submissionId` the monitor's actions reach every running attempt. Reads: `getMonitor(assessmentId, page)`; `GradingView.proctor`; `MyResult.warnings` and `penalty`. Every writer of `total` goes through `totalOf` (`lib/data/attempts.ts`), which takes the penalty off.

### 6.1 Test links and guests (M04b, `lib/schemas/tests.ts`)

Not jobs, but the contract other phases build on. Actions: `createTest`, `createLink`, `setLinkActive`, `deleteLink`, `inviteToTest` (`app/(app)/tests/actions.ts`, faculty and admin, `requireManage`); `openLink`, `signInToTest`, `registerGuest`, `returnAsGuest`, `verifyGuestCode`, `leaveLink` (`app/(auth)/t/[token]/actions.ts`, before or after sign-in). Every M04 assessment action takes `assessmentId` (or `submissionId`) alone; access comes from the assessment (`assessmentAccess` in `lib/auth/access.ts`: `manage` · `oversee` · `take`).

| Rule | Where |
|---|---|
| A link lets someone **new** in while the test is published and not closed, and the link is on, in date and under `maxUses` (`linkState`, `lib/domain/test-links.ts`); the access code and email domains are checked where they are typed | `usableLink`, `requireCode`, `requireDomain` |
| Someone a link already let in goes straight to the test whatever the link's state, and is never counted twice | `alreadyIn` (a `testGrants` row) |
| Letting in = one transaction: `uses` `$inc` only while `uses < maxUses`, then the grant; a course's assessment gets no grant (enrolment decides) | `enter` |
| A guest's code: 6 digits, 10 minutes, 5 tries counted before the check, kept as an HMAC; a new request replaces it | `lib/auth/otp.ts`, `otps` (05 §5.2c) |
| An email that belongs to a non-candidate account never signs in by code; it signs in with its password on the same page | `registerGuest` (CONFLICT), `verifyGuestCode` (FORBIDDEN) |
| Rate limits: guests 20 per address and 5 per email per 15 min; code checks 30 per address per 15 min; invitations 20 sends (≤ 500 each) per owner per day; link-page sign-in uses the login limits | `limit()` |

## 7. Settings registry — `lib/schemas/settings.ts`

Every key has a Zod schema with `.default()`s; `getSettings(key)` returns `Schema.parse(stored ?? {})`. Admins edit them on `/admin/settings/<key>` (M02) with a plain form written for that key: a labelled field per value with its help text and the recommended value, never raw JSON (at Aniket's request, 13 Oct 2026). `saveSettings` parses the posted fields with the key's schema and returns field errors under the field names. Every change is audited (`settings.updated`, entity `<key>_settings`, the changed fields before and after).

| Key | Fields (default) | Used by | Status |
|---|---|---|---|
| `lessons` | `completePct` (90) | 07 §8, skill attendance | proposed — confirm Q-17 |
| `evaluation` (M01b) | theory `theoryMidTerm1` 15, `theoryMidTerm2` 15, `theoryAssignment` 5, `theoryAttendance` 5, `theoryEndSem` 60; attendance `attendanceMinPct` 75 and bands `band1Pct` 90 → `band1Marks` 5, 85 → 4, 80 → 3, 75 → 2; practice rubric `practiceConcept` 5, `practicePlanning` 10, `practiceResult` 10, `practiceRecord` 10, `practiceConduct` 5, `practiceViva` 10; project rubrics `projectRelevance` 5, `projectLiterature` 5, `projectMethodology` 10, `projectAnalysis` 10, `projectInterpretation` 10, `projectReport` 10, `projectExtRelevance` 10, `projectExtReport` 20, `projectExtDefence` 20 | 07 §2; copied onto each credit offering at creation (05 §3.7) | CUTM's Examination Policy (2020). Rules: theory parts total 100; bands fall and their marks do not rise or exceed the attendance part; the practice rubric totals 50; the project rubrics total 100. Q-38, Q-41 |
| `attendance` (M03) | `liveThresholdPct` (75) | 07 §10; read by the finalize job | proposed — confirm Q-17 |
| `ceTrend` (M06) | `window` (6; 3–12 results), `minPoints` (3; 2–12, at most `window`), `slopeThreshold` (2; 0.5–20 points in steps of 0.5) | 07 §3; the recompute reads it | proposed |
| `attainment` (M09) | `targetPct` (60; 1–100), `level3Pct` (70), `level2Pct` (60), `level1Pct` (50), `cieWeight` (0.5), `seeWeight` (0.5), `defaultTargetLevel` (2; 0–3 in steps of 0.1, the target of every CO, M09 decision 3) | 07 §4; the `compute/attainment` job reads it and stores a copy with each record | proposed — confirm Q-07. Rules: 100 ≥ `level3Pct` > `level2Pct` > `level1Pct` ≥ 0; each weight 0–1 in steps of 0.05, adding up to 1. The form ends with 07 §4's example worked out by the saved values |
| `grading` (M08) | `scale` (O ≥ 90 → 10, A+ ≥ 80 → 9, A ≥ 70 → 8, B+ ≥ 60 → 7, B ≥ 50 → 6, C ≥ 45 → 5, P ≥ 40 → 4, F ≥ 0 → 0; 2–12 entries, the form posts lines of `grade \| from % \| points`), `absentGrade` ("Ab"), `absentPoints` (0), `showSgpa` (true; the form posts `yes` or `no`) | 07 §6; the `gradeSheets` job reads it | proposed (UGC CBCS letter grades) — confirm Q-19, Q-21, Q-40. Rules: grades unique, ≤ 4 characters; `from %` strictly falling and the last 0; points 0–10 and not rising |
| `engagement` | `windowDays` (28), weights `attendance` 30 · `video` 20 · `timeliness` 25 · `practice` 15 · `activity` 10, `highBand` (70), `mediumBand` (40), `trendDelta` (10) | 07 §7 | proposed — confirm Q-26 |
| `proctoring` (M04b) | `snapshotRetentionDays` (90; 7–365) | 05 §8; the daily `proctorRetention` job reads it | proposed — confirm Q-24 |
| `codeRunner` (M04b) | `languages` ([{ key: 'c', label: 'C (GCC 9.2.0)', runnerId: 50 }, { key: 'cpp', label: 'C++ (GCC 9.2.0)', runnerId: 54 }, { key: 'java', label: 'Java (OpenJDK 13.0.1)', runnerId: 62 }]; 1–10, keys lower-case and unique; the form posts lines of `key \| label \| runner id`), `runCooldownSec` (3; 1–60) | TP-09: the code question dialog, `runCode`, the `gradeCode` job | defaults verified against Judge0 CE source and the free public server; the settings page lists the runner's own languages. Python (71) is configuration, not a default (LAB-06) |
| `projects` (M07) | `lastMinuteHours` (48; 1–168), `hugeCommitLines` (1000; 100–100,000), `messageStopWords` (["update","fix","changes","commit","wip","test","minor","asdf","."]; up to 50, chips the form posts separated by commas, kept lower-case) | 07 §12 | proposed |
| `examIntegration` | `mode` ("csv") | M08 T7 | not built until Q-04: CSV is the only mode until the API exists |

Secrets are never settings (A-05): SMTP credentials, LiveKit keys, Judge0 token, GitHub App key, OpenAI key, S3 keys live in env (11 §2).

## 8. CSV formats

All CSVs: UTF-8, header row required, comma separated, parsed with `papaparse` (`header: true, skipEmptyLines: 'greedy'`, header names trimmed and lower-cased). Max 5,000 data rows per file (2 MB action body limit). Imports are **all-or-nothing per file**: if any row fails validation, nothing is written and the action returns every row error (`{ row, message }`, row numbers 1-based excluding the header). The parsing and row validation are pure functions in `lib/domain/csv.ts`.

Every import dialog has "Download sample CSV" above its file box (24 Oct 2026): a static file in `public/samples/` (`users.csv`, `enrolment-changes.csv`, `course-list.csv`, `question-bank.csv`, `my-question-bank.csv` for a personal bank, which has no `cos`, and `exam-marks.csv`). Its people use `example.com` addresses, so importing a sample as-is invites nobody real. `lib/domain/csv.test.ts` parses each with its import's parser, so a sample cannot drift from the format.

### 8.1 Users — "Import CSV" dialog on `/admin/users` (M01)
`role,name,email,rollno,employeeid,department,program,batchstartyear,section`
- `role` ∈ `student, faculty, hod, support` (admins are never imported). `hod` rows get roles `['faculty','hod']`.
- students: `rollno`, `program` (code), `batchstartyear`, `section` required; faculty/hod: `employeeid`, `department` (code) required.
- Upsert by `email`. New users are `invited` and receive an invitation email (07-day token).

### 8.2 Enrollment changes — form on `/courses/<id>/people` (M01)
`rollno,action` with `action` ∈ `add, drop`. (The whole batch/section is enrolled automatically when the offering is created.) A file that would take the offering past 1,000 enrolments, dropped ones included, is refused whole (A-83, M03b). One student is also added from the roster's "Add student" (roll number or email), and dropped or added again from its row menu.

### 8.5 Course list — "Upload course list" on `/admin/imports` (M01b, ADM-06)
`programme,stream,basket,type,code,title,credits,tpp` — CUTM's Course Repository, one row per programme × course.
- `programme`, `code`, `title`, `credits`, `tpp` required; `stream` (≤ 60), `basket` (≤ 60) and `type` (≤ 80) optional.
- `code` is normalised (`cutm 1535` → `CUTM1535`) and must be letters and digits. `tpp` is the T+P+Pj split in any of CUTM's spellings (`3+0+1`, `2--2--2`, `1.5+0+1.5`) with three parts, and its total must equal `credits`.
- The same code on several rows keeps one title and one split; a programme lists a code once.
- `programme` is matched to an LMS programme by name, then by code (case and spaces ignored), so `MSc` finds the programme named MSc even when `M.Sc` was given the code `MSC`. With "Create programmes that do not exist yet" ticked, a missing one is created (code from its name, no department, PSO titles by default); otherwise its rows are errors.
- `basket` is matched by name inside the programme or added to it (≤ 12 baskets). `type` labels the link; it sets the course's type only when the course has none.
- Courses are upserted by code: a new course is `active`; for a known one only the title and the credits change (a credit change adds the review note "Credits changed by the course list from X to Y."), never its content. Links are upserted; an unchanged link is not rewritten, so the same file twice changes nothing. Nothing is deleted (A-64). One transaction and one audit entry `course.list_imported` (entity `course_list`) with the counts.

### 8.6 Question bank — "Import CSV" on a question bank (M04b, TP-05)

`parseBankCsv` (`lib/domain/csv.ts`, rows checked by `BankCsvRow` in `lib/schemas/bank.ts`); at most 500 rows; every row is checked before any is saved (the CSV contract of §8).

| Column | Needed | Value |
|---|---|---|
| `type` | yes | `one answer`, `several answers`, `true or false`, `number`, `written answer` (or `mcq`, `msq`, `true_false`, `numeric`, `text`) |
| `question` | yes | plain text, ≤ 4,000 characters |
| `options` | for one / several answers | 2–8, separated by `|` |
| `answer` | for all but written | the right option's number (several: `1|3`); `true` or `false`; a number with an optional margin `3.14 ± 0.01` |
| `marks` | yes | > 0 |
| `difficulty`, `topic`, `bloom` | no | easy/medium/hard; a short topic; a Bloom level |
| `cos` | no | the course's CO codes separated by `|` (a personal bank has none) |
| `negative` | no | marks taken off when wrong, ≤ marks |

### 8.3 End-semester marks — "Bring back the marks" on `/admin/exams/<batchId>` (M08 decision 1)
The §8.4 export with its three external columns filled in by the exam section. `parseEndSemCsv` and `checkEndSemRow` (`lib/domain/csv.ts`). At most **10,000 rows** (a batch's file; about 100 bytes a row).
- Needed columns: `rollno`, `coursecode`, `termcode`, `theoryexternal`, `practiceexternal`, `projectexternal`. Any other column (`name`, the internal columns) is ignored.
- Each external value is a number from 0 to its maximum with ≤ 2 decimals (theory end-semester 60, practice 50, project 50, from the offering's evaluation copy, 07 §6), `AB` (any case) for absent, or blank. It is blank exactly where the course has no such component (credits 0): a blank for a component the course has, or a value for one it lacks, is a row error.
- A (`rollno`, `coursecode`, `termcode`) appears once in a file.
- Every row must match one active enrolment in a credit offering of the page's batch, of that course and the page's term (a student of another batch enrolled in one matches too). Locked or not, it does not matter. Unmatched rows are errors: the mismatch report (EXM-07). So are rows of a student whose grade sheet for the term is published.
- All or nothing (§8): one transaction upserts `endSemMarks` (05 §5.4), turns the students' draft sheets `incomplete` and finishes the `exam_pull_csv` run; audit `endsem.imported`.

### 8.4 Internal marks export — "Send to the exam section" on `/admin/exams/<batchId>` (M08)
`rollno,name,coursecode,termcode,theoryinternal,practiceinternal,projectinternal,theoryexternal,practiceexternal,projectexternal` — the same header for every course, so one batch's file is one table. `buildInternalMarksCsv`, `papaparse.unparse`.
- One row per active enrolment in the batch's **locked** credit offerings of the term (CE-11, CE-12), sorted by course code and roll number.
- An internal column holds the student's internal marks for that component (out of 40, 50 and 50 under the evaluation policy) at 2 dp, and is blank where the course has no such component or the mark is missing. A mark can be missing only where the lock was given a reason; that student gets no grade sheet (M08 decision 2).
- The three external columns are empty, for the exam section to fill in (§8.3).
- At most 10,000 rows (the import's limit); a larger batch is refused with a message.

### 8.7 Meeting invitation — `invite.ics` (M03c T4, `lib/domain/ics.ts`)
RFC 5545, CRLF line ends, lines folded at 75 octets: `METHOD:REQUEST` (or `CANCEL`), one `VEVENT` with `UID:meeting-<sessionId>@<APP_URL host>`, `SEQUENCE` (`meeting.sequence`: a new time or title, or people taken off, is a new version), `DTSTAMP`, `DTSTART`, `DTEND` in UTC, `SUMMARY` (the title), `DESCRIPTION` (the recipient's own link and, T14, `Passcode: <six digits>`) and `URL`/`LOCATION` (the recipient's own `/m/<token>`, a member's as a guest's since T14), `ORGANIZER;CN="<first host>":mailto:<MAIL_FROM address>`, one `ATTENDEE` — the recipient alone, so no address reaches another person — with `RSVP=FALSE`, and `STATUS:CONFIRMED` or `CANCELLED`. Text values escape `\ ; ,` and new lines; a name loses double quotes. Test vector: `lib/domain/ics.test.ts`.

### 8.8 The room and meetings (M03c T4)
- **The room's actions** (`app/(room)/actions.ts`) take `{ sessionId }` (and `identity` or `identity[]`), for a class and a meeting alike; who may act comes from the session (`roomAccess`, `lib/auth/access.ts`: a class through `offeringAccess` — teach and admins host, learn takes part, a head of department watches; a meeting through `meeting.hostIds` and `memberIds`, nobody else, admins included). `raiseHand` (taking part), `lowerHands` (own, or any for a host; T17: the others whose hand a host lowered are told who, `notice`), `muteParticipant`, `muteEveryone`, `setStudentRight`, `removeParticipant` (a class's students; a meeting's members and guests), `allowBack` and `endRoom` (hosts; T14 removed `admitGuests` and `denyGuest` with the lobby). Someone without the right role meets 404, as with the course's host-only actions.
- **Meetings** (`app/(app)/meetings/actions.ts`, faculty, HoD, admin): `saveMeeting({ meetingId?, title, date, startTime, endTime, coHost[], member[], guests, typed })` — co-hosts staff, ≤ 4; members ≤ 50 that the scheduler may invite (`requireInvitable`: staff, and the students they can see, 09 §3); guests ≤ 20 emails; the same IST day, at most 6 h; a change only while scheduled. T14: `typed` is what is still in the people box, matched as `matchPeople` matches and the rest added as guests; anything neither is VALIDATION on `typed`. A new meeting gets its six-digit `passcode` (`crypto.randomInt`). T19 (decision 13): while the meeting runs, a save may change its people only (anything else is VALIDATION on `startTime`); people added are invited at once (`meeting.started` for those from the LMS) and people taken off get the cancellation and are put out of the room (`removeFromRoom`). `cancelMeeting` works until the meeting ends: a running one becomes `cancelled` with `endedAt`, its rooms close (`closeLiveRooms`, breakout rooms too) and a running recording is settled a minute later; an ended one is CLOSED. `resendInvitation({ meetingId, personId })` (hosts, while not over, 3 an hour per person) sends one member's, co-host's or guest's invitation again. `cancelMeeting({ meetingId })` (until it ends, T19), `startMeeting({ meetingId })` (hosts; from 15 minutes before to the end), `findPeople({ q, scope })` (≤ 10; `scope` `all`, `staff` for co-hosts, or `faculty` for an offering's faculty, where the viewer is not left out), `matchPeople({ keys })` (the fields round: 1–100 pasted emails and roll numbers, matched exactly among the people the viewer may invite; returns `{ key, person }` for each match, and the meeting's people field treats the rest as guests or reports them). `Person` carries `staff`. Reads (`lib/data/meetings.ts`): `listMeetings`, `getMeeting` (T14: `invitation` for hosts — the passcode and each person's link by id), `getMeetingRoom`, `getMeetingLink(token)`.
- **Recording** (M03c T5, `app/(room)/actions.ts`, hosts, while it runs and `LIVEKIT_EGRESS=on`): `startRecording({ sessionId })` claims the session's one running recording (CONFLICT when the engine records already or 20 exist; T13: a row the engine no longer runs is settled first), starts Egress, stores its id (T13: if the start times out, the engine is asked for a recording writing the key, and its id is kept), audits `live.recording_started` and tells everyone in the room (`notice`); CLOSED when the room is not open. `stopRecording({ sessionId })` (T13) stops every recording the engine runs for the room, whether or not its id was stored, queues `settleRecordings` for 2 min later, audits `live.recording_stopped` with the keys and tells the room; CONFLICT "Nothing is being recorded." when the engine runs none. The egress webhook marks a row `saved` with its length, or `failed`, found by `egressId` or else by `key` (`recordingEnded`). Reads: `SessionDetail.canRecord`, `recordings` (saved, for whoever sees the class page); `MeetingDetail.recordings`; `MeetingRoom.canRecord`.
- **Polls** (M03c T6, `app/(room)/actions.ts`, mock-ups R3-B A and R3-C): `createPoll({ sessionId, question, option[], showResults })` (hosts; options trimmed, blanks and repeats dropped, 2–6; CONFLICT while one is open or 20 exist), `answerPoll({ sessionId, pollId, optionId })` (those taking part, and since T15 people in by link through `answerPollByLink`; an upsert, so a changed answer replaces the last; CLOSED once ended), `endPoll` and `showPollResults({ sessionId, pollId })` (hosts). Starting, ending and showing tell everyone (`poll`) and starting also says so (`notice`). Reads: `SessionDetail.polls` and `MeetingRoom.polls` (`RoomPoll`: hosts every poll with its counts; the others the open poll with their own answer, and counts once shown or ended with `showResults`); hosts' pages read them again every 3 s while one is open.
- **Breakout rooms** (M03c T7, `app/(room)/actions.ts`, mock-up R3-D): `openBreakouts({ sessionId, rooms, limitMin, assign[] })` (hosts; 2–20 rooms; a limit of 0–120 min, 0 for none; each `<identity>:<room>` one of the people taking part — a class's students, a meeting's members — once; CONFLICT while rooms are open) sets `breakout`, queues the close for the time limit and tells the room (`breakout`, `notice`). `closeBreakouts({ sessionId })` brings `closesAt` to at most a minute away, queues the close and tells every room. `messageBreakouts({ sessionId, text })` tells every breakout room (`notice`). `roomToken({ sessionId, room })` — 0 the class or meeting, `n` a breakout room while open (one's own; any for a host); FORBIDDEN for a removed person or one watching. Reads: `SessionDetail.breakout`, `MeetingRoom.breakout` (`RoomBreakout`: hosts every room with its people; the others their own room). The worker's `closeBreakouts` closes each LiveKit room once `closesAt` has passed and sets `closedAt`; ending the class or meeting closes them too; a browser treats rooms past `closesAt` as closed before it reads them again. A move keeps the viewer's camera and microphone as they were, and a blurred camera starts in the next room already blurred (LiveKit applies a capture-time processor before publishing). Guests (`role: 'guest'`) are not offered in the setup (A-201). The webhook maps a breakout room to its session (07 §10).
- **The whiteboard** (M03c T8, mock-up R3-E): `openBoard({ sessionId, studentsDraw })`, `setBoardDrawing({ sessionId, allowed })`, `closeBoard({ sessionId })` (hosts) set `board` and tell the room (`board`). Reads: `board` on `SessionDetail`, `MeetingRoom` and `MeetingLink`. The drawing travels between browsers, never through the server: text streams (`localParticipant.sendText`, topic `whiteboard`) of `{ kind: 'elements', elements }` — the elements whose version moved, at most every 150 ms — and `{ kind: 'sync' }`, which hosts answer with the whole board for the one who asked; a receiver checks each element's `id`, `type`, `version`, `versionNonce` and `isDeleted`, ignores changes from someone who may not draw, and merges with Excalidraw's `reconcileElements`. T16: reads give `board: { studentsDraw, by }`. The presenter (`by`, else the first host in the room) sends `{ kind: 'view', x, y, w, h }` — the scene rectangle in view — when it moves (at most every 200 ms) and in answer to `sync`; the others fit it to their screen while following. An element marked as sent only once its send succeeded. Pointers go as lossy data packets on `whiteboard-pointer`, `{ x, y, tool: 'pointer' | 'laser', button }`, at most every 40 ms, from people who may draw, and show as Excalidraw collaborators (laser in `DEFAULT_LASER_COLOR`) until 3 s still. While the room is recorded the presenter's browser publishes a 1280 × 720, 10 fps canvas of the board as a `ScreenShare` track named `whiteboard` (`BOARD_TRACK`), which Egress's layout records as a shared screen and the room itself never shows (decision 11).
- **Captions** (M03c T9, decision 6, mock-up R3-F): no server part. A host's "Caption my speech" runs the browser's `SpeechRecognition` (`webkitSpeechRecognition` in Chrome; `en-IN`, continuous, interim results, started again after Chrome's pauses) and sends each line on the data topic `caption` as plain text, `I:<text>` (a line still being heard, lossy, at most every 300 ms) or `F:<text>` (a finished line, reliable), ≤ 500 characters. Browsers take captions from hosts only (`role` attribute) and show the latest two lines with the speaker's name while CC is on; nothing is stored.
- **Joining by link** (T14, decision 9; `app/(room)/m/[token]/actions.ts`, signed out): the token is `<guestId>.<sig>` for a guest or `<sessionId>.<userId>.<sig>` for a member or co-host (`lib/auth/meeting-link.ts`, HMAC-SHA256 of `meeting-guest:<guestId>` or `meeting-member:<sessionId>:<userId>` under `SESSION_PASSWORD`, base64url). `joinMeeting({ token, name, passcode })` — while the meeting runs, for someone still invited and not removed; a guest gives a name (2–80), a member joins under their account's; the passcode is compared in constant time (none asked of a meeting from before passcodes). Wrong passcodes are limited to 10 per link and 30 per IP in 15 minutes; a right one gives its tries back. It sets the sealed cookie `lms_meeting` (`lib/auth/meeting-pass.ts`, iron-session, 12 h) naming the session and the person. `getMeetingLink(token)` gives the page: `signedIn` when the viewer is the member the link names (the page then opens `/meetings/<id>/room`), `asksPasscode`, `removed`, and `join` — a token while it runs for a browser holding that person's pass: a guest's identity is their guest id, a member's or co-host's their user id, and everyone in by link has `role: 'guest'` — no hosting and no breakout rooms (A-221, A-201). T15 (A-225): `raiseHandByLink({ sessionId })`, `lowerHandByLink({ sessionId })` and `answerPollByLink({ sessionId, pollId, optionId })` act as the person the browser's pass names, while they are invited, not removed and the meeting runs (UNAUTHENTICATED without the pass); answers share `answerPollAs` (`lib/data/live.ts`) with `answerPoll`, kept against the guest's id. `MeetingLink.polls` are the polls as someone taking part sees them.

## 9. Notification kinds

| Kind | Recipient | Created when | `href` |
|---|---|---|---|
| `plan.requested` | the offering's faculty | offering activated without a published plan (CRS-06) | `/courses/<id>/plan` |
| `plan.published` | enrolled students | course plan published (also emailed, COM-01) | `/courses/<id>` |
| `assessment.published` | enrolled students | assessment published | `/courses/<id>/assessments/<aid>` |
| `assessment.dueSoon` | students without a submission | closes within 24 h (hourly scheduler) | same |
| `results.published` | students with a submission | results published | same |
| `bank.drafted` | the teacher who asked | the AI's drafts were saved, could not be used, or could not be made (M04b, TP-10) | `/courses/<id>/bank`, or `/tests/bank` for one's own bank |
| `live.scheduled` | enrolled students | session scheduled | `/courses/<id>/live/<sid>` |
| `live.changed` | enrolled students | a scheduled session's title, time, length or attendance mode changed (M03 decision 1) | same |
| `live.cancelled` | enrolled students | a scheduled session cancelled (M03 decision 1) | same |
| `live.started` | enrolled students | the teacher started the session (M03 decision 1) | same |
| `task.assigned` | assignee | tracker task assigned | `/courses/<id>/projects/<pid>` |
| `gradeSheet.published` | students in the term | grade sheet published | `/results` |
| `meeting.invited` | the co-hosts and people from the LMS added (M03c T4) | meeting scheduled, or they were added | `/meetings/<id>` |
| `meeting.changed` | the others invited | its time or title changed | same |
| `meeting.cancelled` | everyone invited but the host who cancelled | meeting cancelled | same |
| `meeting.started` | everyone invited but the host who started it | meeting started | same |
