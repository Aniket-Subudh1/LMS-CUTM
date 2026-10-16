# M03 · Live classes & attendance

> **Changed by M01b.** `offering.category` is still `ugc`/`skill` but is derived from the course credits: "skill offering" here means a non-credit (0-0-0) one. The Examination Policy's attendance part (bands 90/85/80/75 % → 5/4/3/2 marks of the theory internal, minimum 75 %) lives in Settings → Evaluation and each offering's copy (07 §2); this milestone only records attendance, and what the LMS does with the 75 % minimum is Q-42.

| | |
|---|---|
| Depends on | M01b (00 §3) |
| Requirements | CRS-04, LIV-01, LIV-02, LIV-03, LIV-04, ATT-01, ATT-02, ATT-03, NFR-02, COM-03 (`live.scheduled`, and since the decisions below `live.started`, `live.changed`, `live.cancelled`) |
| Release | part of R1 |
| Packages added | `livekit-server-sdk`, `livekit-client`, `@livekit/components-react`, `@livekit/components-styles` |
| Env vars added | `LIVEKIT_URL`, `LIVEKIT_API_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Collections | `liveSessions`, `attendance` |
| Components introduced | `LiveRoom`, `AutoRefresh` |

## Goal

Faculty schedule, start and end live classes inside the platform with no third-party meeting API. Students join from the course. Presence is captured from the live engine's signed webhooks; attendance is either marked manually by the teacher once the class has started (ATT-01) or derived from time present (ATT-03). Focused time is measured for engagement (LIV-03).

## Engine decision

Live classes run on **self-hosted LiveKit** (ADR-18, decided 12 Oct 2026 for lowest cost at scale, browser-only use, and automatic attendance). Mux and other per-minute streaming APIs were evaluated and rejected (ADR-18). The adapter boundary stays: if the client later mandates another engine, only `lib/integrations/live.ts` and `components/live-room.tsx` change; if that engine cannot provide signed join/leave events with per-user identity, **stop and record an `@dev` question**.

## Decisions (Aniket, 16 Oct 2026)

Taken while planning the build; where they change a task below, the task already says so.

1. **Three more notifications** (COM-03, in-app only): `live.started` when the teacher starts a class, `live.changed` when a scheduled class is edited, `live.cancelled` when it is cancelled. A scheduled class can be **edited** (title, date, time, length, attendance mode) until it starts (`updateSession`).
2. **Roll call:** when the teacher takes attendance, students who joined the room start ticked Present and everyone else Absent; nothing is stored until the teacher saves (an explicit human action, AGENTS.md law 7). This prefill applies only to a manual-mode class before it is finalized; otherwise the list shows what is stored.
3. **In class** the room fills the page; **Take attendance** opens the list in a `FormDialog`.

Decided by the developer for ease of use (assumptions A-68 – A-72 in PROGRESS):
- Scheduling asks for a **date, a start time and a length** (30 min to 6 h) instead of two date-time boxes; the title and date default to the next session of the course calendar on or after today.
- The student's waiting screen refreshes itself (`AutoRefresh`) until the class starts.
- Home shows **Today's live classes** (live now with Join, and the rest of today's), as the 08 §2 Home row promises.
- A scheduled class whose end has passed without a start is shown as "Not held"; it has no status of its own.

Decided after a design review (questions Q-50 – Q-52 in PROGRESS):
- **Presence is matched by the engine's connection id (`sid`)**, so reordered, repeated and replaced connections (a second tab) neither lose nor double time.
- **`room_finished` before `scheduledEnd` does not end the class.** LiveKit closes a room about 20 s after its last participant leaves; a teacher whose connection drops would otherwise end the class for good. The room is created again when someone rejoins. At or after `scheduledEnd` it ends the class at that moment.
- **`attendance.status` is unset until the class is finalized or the teacher marks it**, so a class in progress never shows a student as absent and the attendance percentage is one aggregation over rows that have a status.

## Tasks

### T1 · Live adapter and local engine
Files: `lib/env.ts`, `.env.example`, `tests/setup.ts`, `scripts/check-bundle.ts`, `lib/integrations/live.ts` (+ test), `livekit.yaml` (development keys only, clearly commented), `compose.yaml` (`livekit` service under the `live` profile — 11 §3.1).
- `joinToken`: `new AccessToken(key, secret, { identity: userId, name, ttl: ttlSec })`; `addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: role === 'host' })`; `serverUrl = LIVEKIT_URL`; `token = await toJwt()`.
- `closeRoom`: `new RoomServiceClient(LIVEKIT_API_URL, key, secret).deleteRoom(roomName)`; a "room not found" response is not an error.
- `parseWebhook(rawBody, authorization)`: `await new WebhookReceiver(key, secret).receive(rawBody, authorization ?? undefined)`; map `participant_joined` → `joined`, `participant_left` → `left` (both with the participant's `sid`), `room_finished` → `room_finished`, everything else → `ignored`; `at = new Date(Number(event.createdAt) * 1000)` (seconds — verified); signature failure → `AppError('FORBIDDEN', 'Invalid webhook signature')`.

### T2 · Models, settings, pure functions
Files: `lib/schemas/live.ts`, `lib/models/live-session.ts`, `lib/models/attendance.ts` (05 §4.3–4.4), `lib/schemas/settings.ts` (+ `attendance` key, 06 §7), `lib/domain/attendance.ts` (+ test), `lib/domain/ranges.ts` (`acceptFocusBeacon`, + test), `lib/data/engagement.ts`.
- `deriveAttendance(presence, startedAt, endedAt, thresholdPct)` with every vector in 07 §10.
- `attendancePct(present, total)` → `roundHalfUp(100 × present / total, 2)`, null when total 0.
- `acceptFocusBeacon({ focusedSec, lastFocusAt, now })` with the vectors in 07 §9.
- `addEngagement` moves from `lib/data/content.ts` to `lib/data/engagement.ts` (no `next/*` imports), so the finalize job can write the same counters (02 §3.1: a write used by an action and a job).

### T3 · Scheduling and session control
Files: `app/(app)/courses/[offeringId]/live/page.tsx`, `…/live/actions.ts`, `lib/data/live.ts`.

| Action | Who | Rules |
|---|---|---|
| `scheduleSession` | teach | offering `active`; title; `date` (`istDate`), `startTime` (`istTime`) and `lengthMin` (30–360) → `scheduledStart`/`scheduledEnd`; start not before the current minute; at most 500 sessions per offering; `attendanceMode` (skill offerings: forced `derived`); `kind: 'class'`; `roomName = 'ls-' + id`; `notify` enrolled students `live.scheduled` |
| `updateSession` | teach | only `scheduled`; same fields and rules; `notify` `live.changed` |
| `cancelSession` | teach | only `scheduled`; `notify` `live.cancelled` |
| `startSession` | teach | from 15 min before `scheduledStart` until `scheduledEnd`; conditional `scheduled → live`, `startedAt = now` (a second click finds it live and succeeds); `notify` `live.started` |
| `endSession` | teach | `closeRoom`, then conditional `live → ended`, `endedAt = now` (already ended — by a webhook or another click — is success); enqueue `compute/finalizeLiveSession` (job id `live-final-<sessionId>`) whenever the session is ended |

The Live tab (add to `TabNav`) lists sessions: live now (prominent "Join"), upcoming, and past with each session's present count.

### T4 · Joining
Route: `/courses/[offeringId]/live/[sessionId]`.
- `learn`: when `live` → `LiveRoom` with `joinToken({ role: 'participant', ttlSec: until scheduledEnd + 2 h })`; otherwise the status and start time; while waiting for the start, `AutoRefresh` re-renders the page every 20 s.
- `teach`: Start/End buttons (`ConfirmSubmit` for End), `LiveRoom` as `host` while live, and the attendance sheet (T7).
- `oversee` (HoD/admin not teaching): session details and attendance, no join; an admin also gets Start/End.
- `LiveRoom` (client): `<LiveKitRoom serverUrl token connect video={false} audio={false}>` with `<VideoConference />` and `@livekit/components-styles`; for students (`trackFocus`), while connected and `document.visibilityState === 'visible'`, accumulates focused seconds and `sendBeacon`s `{ kind: 'live', sessionId, focusedSec }` every 60 s and on `pagehide`. Leaving offers Rejoin (which re-renders the page for a fresh token); the room closing shows that the class has ended. It never reconnects by itself, so two tabs of one student cannot push each other out in a loop.

### T5 · Presence webhooks
File: `app/api/webhooks/live/route.ts`.
- Read the raw body (`await request.text()`) and `Authorization`; `parseWebhook`.
- `joined`: find the session by `roomName` with status `live`; if the identity is an actively enrolled **student**, upsert the attendance row (`source: 'derived'` on insert, no `status`) and `$push` `{ sid, joinedAt: at, leftAt: null }` with `$slice: -50`, unless an entry with that `sid` exists.
- `left`: find the session by `roomName` in any status (the leaves caused by `endSession` arrive after it); set `leftAt = at` on the entry with that `sid` (`arrayFilters`); if there is none (its `joined` never arrived), push the closed interval.
- `room_finished`: if the session is `live` and `at ≥ scheduledEnd`, set `ended`, `endedAt = at`; whenever the session is `ended` and not finalized, enqueue finalize.
- Teachers' identities are ignored. Return `200` for ignored or unknown rooms (never make the engine retry forever); `401` on a bad signature.

### T6 · Finalization job and scheduler
Files: `worker/jobs/compute.ts` (`finalizeLiveSession`, `liveSweep`), `worker/index.ts` (scheduler `liveSweep`, hourly at :05, 02 §8).
1. Read the `attendance` settings, then in **one transaction**: claim with `findOneAndUpdate({ _id, status: 'ended', finalizedAt: null }, { $set: { finalizedAt: now } })`; nothing returned → already finalized, stop (idempotent). A crash rolls the claim back with everything else, so a retry redoes the work.
2. For every active enrollment: compute `presenceSec` with `deriveAttendance`; upsert the row with `presenceSec`, then set the status — `derived` mode on every row whose `source` is not `manual`; `manual` mode only on rows without a status (unmarked students become `absent`).
3. `$inc engagementDaily.liveSec` by `presenceSec` for `istDayKey(startedAt)`.
4. Scheduler (`compute/liveSweep`): sessions `live` with `scheduledEnd + 30 min < now` → `closeRoom`, end at `scheduledEnd` and enqueue finalize; sessions `ended` with `finalizedAt: null` ended over 10 min ago → enqueue finalize, or retry its failed job (BullMQ ignores a new job with a failed job's id).

### T7 · Manual attendance (ATT-01) and overrides
On the session page for `teach`, once `startedAt` is set: **Take attendance** (during the class) or **Change attendance** (after it) opens a dialog listing up to 100 enrolled students per page with Present/Absent radios (prefilled per decision 2; presence minutes shown). `markAttendance` (teach): only after start; refused on skill offerings; every student must be actively enrolled; writes `status`, `source: 'manual'`, `markedBy`, `markedAt` for the students whose status changes with one `bulkWrite`, and in the same transaction one audit entry `attendance.marked` listing those students with before/after statuses (nothing changed → nothing written). Works before and after finalization (an override after finalize is the same action).

### T8 · Focus beacons (LIV-03)
`/api/beacon` live branch (07 §9): session `live`; viewer is an enrolled student with an open presence interval; `acceptFocusBeacon` (`focusedSec ≤ min(120, secondsSince(lastFocusAt) + 5)`, first beacon ≤ 120); `$inc attendance.focusedSec`, set `lastFocusAt` (conditional on the value read); `$inc engagementDaily.focusedSec`. The rate limit applies to both beacon kinds.

### T9 · Attendance views (ATT-02)
- Live tab, `learn`: own attendance per past session and overall % (`attendancePct`).
- People tab (`teach`/`oversee`), ugc offerings: attendance % column per student.
- Session page: present/absent counts and per-student presence minutes and focused minutes.
- Home: "Today's live classes" card for students and faculty (live now first, with Join).

### T10 · Tests
- Unit: 07 §9 and §10 vectors; `attendancePct`; the adapter's webhook mapping and signature check.
- Integration (mock `@/lib/integrations/live` `parseWebhook`/`closeRoom`): joined → row + interval; left closes it; reordered and repeated events by `sid`; a non-enrolled identity is ignored; `room_finished` before the scheduled end leaves the class live; finalize twice → one `liveSec` increment; manual mark survives finalize; the sweep ends an abandoned class; `markAttendance` before start → CLOSED; `markAttendance` on a skill offering refused; student calling `startSession` → FORBIDDEN; focus beacon without open presence ignored.
- E2E (`tests/e2e/live.spec.ts`, LiveKit running; Chromium flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`): faculty schedules and starts; student joins and sees the conference UI; faculty marks attendance; ends the class; the session shows the student present.

## Acceptance criteria

- **AC-M03-01** No code path calls Zoom, Google Meet or any meeting API; only `lib/integrations/live.ts` imports the live SDK (grep check in review).
- **AC-M03-02** A student who stays 50 of 60 minutes is present at a 75 % threshold; one who stays 40 minutes in two overlapping tabs (union 40 min) is absent.
- **AC-M03-03** A teacher's manual mark is never overwritten by derived attendance and every change is in the audit log.
- **AC-M03-04** Webhooks with a bad signature return 401 and change nothing.
- **AC-M03-05** A session nobody ends is ended and finalized by the hourly scheduler.
- **AC-M03-06** Skill offerings never show the manual attendance sheet.

## Validation checklist (human)

- [ ] Two real devices (laptop + phone) join one class; audio/video work; leaving and rejoining keeps one attendance row.
- [ ] Mark attendance manually during class; end class; check the result and the audit entry.
- [ ] Switch tabs for 5 minutes during class; focused minutes are lower than presence minutes.
- [ ] Run 3 rooms at once on the target live engine; note CPU and bandwidth for the M11 sizing.
