# M02 · Content, course plan, announcements, skill-course progress

| | |
|---|---|
| Depends on | M01 |
| Requirements | CRS-03, CRS-05 (syllabus, calendar), CRS-06, COM-01, COM-03 (infrastructure + plan events), ATT-03 / SKL-04 (skill attendance from time engaged), SKL-01, SKL-02 (video engagement), SKL-03 (video upload), ENG-03 (video signal) |
| Release | part of R1 |
| Packages added | `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `@tiptap/html`, `happy-dom`, `ffmpeg-static` |
| Env vars added | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` |
| Collections | `lessons`, `lessonProgress`, `notifications`, `engagementDaily` |
| Components introduced | `RichTextEditor`, `RichTextView`, `FileUpload`, `VideoPlayer` |

## Goal

Faculty upload lectures and documents into modules, write and publish the course plan and calendar, and enrolled students are emailed the calendar, syllabus, objectives, COs and POs (COM-01). Students watch lectures; the platform measures unique watched time per lesson, completion, and — for skill courses — attendance from time engaged. In-app notifications exist for every later milestone to use. Admins can edit settings.

## Before you start

Read 02 §4.3–4.4, 04 §6.11–6.12, 05 §4.1–4.2, §7.1–7.3, 06 §2 (`richText`, `istDate`), §3 (beacon, files), §4.1–4.2, §5, §6 (`mail/fanout`), §7, §9; 07 §8–9, §11; 08 §5; 09 §5.

## Tasks

### T1 · Object storage
Files: `lib/env.ts` (+ S3 vars), `.env.example`, `tests/setup.ts` (+ S3 vars, 10 §2), `lib/integrations/storage.ts`, `scripts/s3-setup.ts`, `package.json` (`s3:setup` script).
- `storage.ts`: 04 §6.12 plus `deleteObjects(keys)` (`DeleteObjectsCommand`, chunks of 1,000).
- `s3-setup.ts`: `HeadBucket` → `CreateBucket` if missing; `PutBucketCors` with `AllowedOrigins: [APP_URL]`, methods `GET PUT HEAD`, headers `*`, expose `ETag`, max age 3000 (verified against RustFS).

### T2 · Upload pipeline and file downloads
Files: `lib/schemas/uploads.ts`, `lib/domain/uploads.ts` (+ test), `app/(app)/actions.ts` (`createUpload`), `app/api/files/[...key]/route.ts`, `components/file-upload.tsx`.
- `uploads.ts` (schema): the purpose table from 06 §5 as data (`purpose → contentTypes, maxBytes`), including `submission` and `proctor-snapshot` rows even though their authorization arrives in M04/M05.
- `lib/domain/uploads.ts`: `extFor(contentType)`, `buildKey(purpose, contextId, userId, uuid, contentType)`, `parseKey(key)` → `{ purpose, contextId, userId } | null`, `sanitizeFileName(name)` (strip `/ \ : * ? " < > |` and control chars, collapse spaces, ≤ 120). Vectors: `lesson-video` + `video/mp4` → `lesson-video/<ctx>/<uid>/<uuid>.mp4`; `../../etc/passwd` → `etcpasswd`; a 300-char name → 120 chars keeping the extension.
- `createUpload` (`roles`: all; record check per purpose — `lesson-video`/`lesson-doc`: `requireTeach` on `contextId` = offering; `syllabus`: admin; other purposes → FORBIDDEN until their milestone): validates type and size, rate-limits (09 §4), returns `{ key, url }` from `presignUpload`. UUID via `crypto.randomUUID()`.
- `/api/files/[...key]`: `parseKey`; authorize per 06 §5 "who may download" (lesson files: the lesson must be published for `learn`); `302` to `presignDownload(key, displayName)`; anything else `404`.
- `FileUpload` (client, 08 §5): for each selected file → `createUpload` → `XMLHttpRequest` PUT with `Content-Type` and a progress bar → on success appends a hidden input `name[]` whose value is JSON `{ key, fileName, contentType, size, durationSec? }`. For `video/*` files it reads `durationSec` from a detached `<video>` element's `loadedmetadata` before uploading. Shows per-file errors with a Retry button.

### T3 · Settings registry and page
Files: `lib/schemas/settings.ts`, `lib/models/setting.ts` (exists), `lib/data/settings.ts`, `app/(app)/admin/settings/page.tsx`, `app/(app)/admin/settings/[key]/page.tsx`, `app/(app)/admin/settings/actions.ts`.
- Registry: `{ key, schema, label, description, fieldHelp: Record<field, string> }` entries. This milestone adds **`lessons`** only; each later milestone adds its key(s) from 06 §7.
- `getSettings(key)` (exported, server-only) → `Schema.parse(stored ?? {})`; the read is a `use cache` inner function (`cacheLife('minutes')`, tag `settings:<key>`).
- Page: a `<textarea>` with the current value as formatted JSON, the defaults and a field-help table. `saveSettings` (admin): `JSON.parse` → schema parse → on failure `fieldErrors.value` with one line per Zod issue (`path: message`); on success upsert, audit `settings.updated` (changed fields), `updateTag('settings:<key>')`.

### T4 · Rich text
Files: `lib/domain/rich-text.ts` (+ test), `lib/schemas/common.ts` (`richText`), `components/rich-text-editor.tsx`, `components/rich-text-view.tsx`.
- `renderRichText(doc)` → HTML via `generateHTML` from `@tiptap/html/server` with `StarterKit` (throws on unknown nodes). `richText` schema: `z.json()` + size ≤ 100 KB + `renderRichText` succeeds (issue "Unsupported content").
- Tests (verified behaviour): text with `<script>` is escaped; a `javascript:` link renders with an empty `href`; an `image` node is rejected; a 101 KB document is rejected.
- `RichTextEditor`: `useEditor({ extensions: [StarterKit], content: initial, immediatelyRender: false })`; a minimal toolbar (bold, italic, bullet list, ordered list, heading 2/3, link, undo/redo) using `.btn-sm`; on every update writes `JSON.stringify(editor.getJSON())` to a hidden input `name`.
- `RichTextView`: `<div className="prose-lms" dangerouslySetInnerHTML={{ __html: renderRichText(doc) }} />` (safe: output is generated from a schema, verified).

### T5 · Syllabus (CRS-05)
On `/admin/courses/[id]`: `saveSyllabus` (admin) with `syllabusText` (`RichTextEditor`) and an optional PDF (`FileUpload` purpose `syllabus`, context = course id). Overview shows the syllabus text and a "Download syllabus (PDF)" link via `/api/files/<key>`.

### T6 · Notifications (COM-03 infrastructure)
Files: `lib/models/notification.ts`, `lib/data/notifications.ts`, `app/(app)/notifications/page.tsx`, `app/(app)/notifications/actions.ts`; header count in `app/(app)/layout.tsx`.
- `notify(userIds, { kind, title, href })` → `insertMany(…, { ordered: false })` with `expiresAt = now + 90 days`; chunks of 1,000. Used by the web (actions) and the worker.
- `listMyNotifications(page)`, `unreadCount()` (index `{ userId, readAt, createdAt }`).
- Actions: `markRead(id)` (own only), `markAllRead()`.
- Kinds added now: `plan.requested`, `plan.published` (06 §9).
- Header: unread count badge inside the user-menu `<Suspense>`.

### T7 · Course plan and calendar (CRS-06, COM-01)
Routes: `/courses/[offeringId]/plan` (teach, admin). Workspace Overview shows the published plan and calendar to everyone with access.

| Action | Rules |
|---|---|
| `savePlan` | `plan.doc` (`richText`); teach |
| `saveCalendar` | rows `{ date: istDate, topic ≤ 200, coIds[] ⊂ course COs }`; the form shows existing rows plus 10 empty rows (blank rows ignored; to add more, save and the page shows 10 new blanks); ≤ 200 rows; sorted by date on save |
| `publishPlan` | requires `plan.doc` and ≥ 1 calendar row; `plan.version + 1`, `publishedAt`, `publishedBy`; enqueue `mail/fanout { kind: 'coursePlanPublished', offeringId, version }` with job id `plan-<offeringId>-<version>`; `notify` enrolled students `plan.published`; audit `plan.published` with recipient count |

- Modify M01's `setOfferingStatus`: when an offering becomes `active` and `plan.publishedAt` is null → `notify` its faculty `plan.requested` ("Publish the course plan and calendar for <title>"). Faculty home lists active offerings without a published plan (the system "requests" the plan, CRS-06).
- Worker `coursePlanPublished` fan-out: loads the offering, course (objectives, COs, syllabus text), program (POs, PSOs), calendar and active enrollments; for each student enqueues `mail/send` (job id `mail-plan-<offeringId>-<version>-<studentId>`) with `coursePlanEmail(...)`.
- `coursePlanEmail` (pure, in `lib/domain/email-templates.ts`): subject "Course plan: <code> <title>"; sections Course calendar (table date · topic · COs), Syllabus (rendered rich text + PDF link), Course objectives, Course outcomes (code, statement, Bloom level), Program outcomes (POs and PSOs); a link to the course. Test: all five sections present; HTML-escaped values.

### T8 · Modules, lessons and video progress (CRS-03, SKL-03)
Files: `lib/models/lesson.ts`, `lib/models/lesson-progress.ts`, `lib/models/engagement-daily.ts`, `lib/domain/ranges.ts` (+ test), `lib/data/content.ts`, `app/(app)/courses/[offeringId]/content/…`, `app/api/beacon/route.ts`, `components/video-player.tsx`.

Actions (`app/(app)/courses/[offeringId]/content/actions.ts`, teach):

| Action | Rules |
|---|---|
| `saveModule` | add/rename; ≤ 40 |
| `moveModule`, `moveLesson` | up/down buttons (swap `order`) |
| `createLesson` | kind `video`: one uploaded file of purpose `lesson-video` (key validated with `parseKey` against purpose/offering/viewer) + `durationSec`; `document`: purpose `lesson-doc`; `link`: `https://` URL; title; optional description; `published: false` |
| `updateLesson` | title, description, module |
| `setLessonPublished` | publish/unpublish |
| `deleteLesson` | only if unpublished and no progress rows; deletes the object; audit `lesson.deleted` |
| `completeLesson` | **learn** only; document/link lessons: sets `openedAt` and `completedAt`; `$inc engagementDaily.lessonsCompleted` once |

- Content page: modules in order with lessons; teach sees all with publish state; learn sees published lessons with progress % and a completed badge.
- Lesson page: video → `VideoPlayer` (`src` = `/api/files/<key>`, `preload="metadata"`); document → "Open document" link + "Mark as complete"; link → external link + "Mark as complete".
- `VideoPlayer` (client): native `<video controls>`; tracks played intervals from `timeupdate` (a new interval starts after a seek); every 30 s and on `pagehide` sends `navigator.sendBeacon('/api/beacon', JSON.stringify({ kind: 'video', lessonId, ranges }))` with ranges since the last beacon.
- `/api/beacon` (video branch): session → lesson published and `offeringAccess = learn` → rate-limit → read progress → `mergeRanges` (07 §8) → anti-inflation (07 §9) → `updateOne({ _id, updatedAt: previous }, …)` (optimistic concurrency; on no match re-read and retry once) → set `completedAt` the first time `progressPct ≥ lessons.completePct` → `$inc engagementDaily { videoSec: newSec, lessonsCompleted: 1 if newly completed }` keyed by `istDayKey(now)` → `204`.
- `ranges.ts`: `mergeRanges` and `acceptVideoBeacon` with every vector from 07 §8–§9.

### T8b · Data-saver copy of every lecture video (NFR-07, ADR-19)
Files: `lib/integrations/storage.ts` (+ `downloadToFile`, `uploadFromFile`), `lib/schemas/jobs.ts` (+ `MediaJob`), `lib/queue.ts` (+ `mediaQueue()`), `worker/jobs/media.ts`, `worker/index.ts`, `lib/models/lesson.ts` (+ `lowKey`, `transcode` — 05 §4.1).
- `createLesson` (video) sets `transcode: 'pending'` and enqueues `media/transcodeLesson { lessonId }` (job id `transcode-<lessonId>`).
- The job downloads the original to a temp file (`os.tmpdir()`), runs the bundled ffmpeg with exactly these arguments (verified with ffmpeg 7.0.2 from `ffmpeg-static` 5.3.0: H.264 Main, yuv420p, ~0.7 Mbps cap, `moov` atom first):
  `-loglevel error -y -i <in> -vf scale=-2:480 -c:v libx264 -pix_fmt yuv420p -profile:v main -preset veryfast -crf 28 -maxrate 700k -bufsize 1400k -c:a aac -b:a 64k -ac 1 -movflags +faststart <out>`
  via `spawn(ffmpegPath, args)` (never a shell string), uploads `<original key without extension>-480p.mp4`, sets `lowKey` and `transcode: 'ready'`, and always deletes both temp files (`finally`). A non-zero exit throws (BullMQ retries 5×); after the last failure the job's `failed` handler sets `transcode: 'failed'`. The `media` queue's worker has concurrency 1 (02 §8).
- `/api/files` serves `lowKey` under the same rule as the original (it shares the lesson's prefix).
- The lesson page passes `lowSrc` (`/api/files/<lowKey>`) to `VideoPlayer` when `transcode === 'ready'`; the HD/Data-saver toggle is described in 08 §5.
- Test (integration, worker): with a 3-second generated MP4 fixture, the job produces a playable 480p file and sets `ready`; with a corrupt file it ends `failed` and the original still plays.

### T9 · Skill-course traceability (SKL-02, SKL-04)
- People tab for **skill** offerings: per student lessons completed / published, attendance % (07 §8 skill formula), total watched minutes, last activity date. (Quizzes attempted is added in M04.)
- Overview for a **learn** viewer of a skill offering: own progress bar and attendance %.
- Skill offerings never show a manual attendance UI (SKL-04).

### T10 · Home
Student: "Continue learning" — up to 5 lessons with progress < 100 % ordered by last beacon. Faculty: offerings needing a plan (T7). All: unread notification count.

### T11 · Tests
- Unit: uploads, rich text, ranges, email templates (vectors above).
- Integration: `createUpload` authorization per purpose (student cannot get a `lesson-video` URL → 404); `/api/files` denies unpublished lesson files to students; `publishPlan` enqueues exactly one fan-out per version (second click same version → deduped) and notifies every enrolled student; beacon: unpublished lesson → 404 path, inflation rejected, two concurrent beacons both merged (optimistic retry), completion set once; `saveSettings` rejects invalid JSON with the Zod path.
- E2E (`tests/e2e/content.spec.ts`): faculty creates a module, uploads a short MP4 (fixture under `tests/e2e/fixtures/`), publishes; student plays 5 s, reloads, sees progress > 0; faculty publishes the plan → the student's email appears in Mailpit with all five sections.

## Acceptance criteria

- **AC-M02-01** A faculty member uploads a 200 MB video from the browser; the bytes go directly to object storage (no request body > 2 MB reaches the web server), and the lesson plays for enrolled students after publishing.
- **AC-M02-02** Watching the same 60 s twice counts 60 s, not 120 s; seeking past content does not count it as watched.
- **AC-M02-03** A beacon claiming 10 minutes of new watch time 30 s after the previous beacon is ignored.
- **AC-M02-04** Publishing the plan emails every active enrolled student once per version, containing calendar, syllabus, objectives, COs and POs; a second publish (new version) emails again.
- **AC-M02-05** An unpublished lesson's file URL returns 404 for a student and redirects for the teacher.
- **AC-M02-06** For a skill offering, a student's attendance % equals completed / published lessons, and no manual attendance UI exists.
- **AC-M02-07** Rich text containing `<script>` or `javascript:` links renders inert.
- **AC-M02-08** An invalid settings JSON shows the failing path and nothing is saved.
- **AC-M02-09** After upload, a 480p data-saver copy becomes available within minutes; on a phone the lesson starts in Data saver mode and can be switched to HD without losing the position.

## Validation checklist (human)

- [ ] Upload a real lecture video on a slow connection (browser throttling "Slow 4G"); progress shows; retry works after a forced failure.
- [ ] Watch on a phone; progress updates after closing the tab (pagehide beacon).
- [ ] Publish a plan; open the email in Mailpit; check formatting of all five sections.
- [ ] Faculty home shows the "publish your plan" prompt for a newly activated offering.
