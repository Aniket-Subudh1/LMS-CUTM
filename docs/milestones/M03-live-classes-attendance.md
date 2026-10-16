# M03 · Live classes & attendance

> **Changed by M01b.** `offering.category` is still `ugc`/`skill` but is derived from the course credits: "skill offering" here means a non-credit (0-0-0) one. The Examination Policy's attendance part (bands 90/85/80/75 % → 5/4/3/2 marks of the theory internal, minimum 75 %) lives in Settings → Evaluation and each offering's copy (07 §2); this milestone only records attendance, and what the LMS does with the 75 % minimum is Q-42.

| | |
|---|---|
| Depends on | M02 |
| Requirements | CRS-04, LIV-01, LIV-02, LIV-03, LIV-04, ATT-01, ATT-02, ATT-03, NFR-02, COM-03 (`live.scheduled`) |
| Release | part of R1 |
| Packages added | `livekit-server-sdk`, `livekit-client`, `@livekit/components-react`, `@livekit/components-styles` |
| Env vars added | `LIVEKIT_URL`, `LIVEKIT_API_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Collections | `liveSessions`, `attendance` |
| Components introduced | `LiveRoom` |

## Goal

Faculty schedule, start and end live classes inside the platform with no third-party meeting API. Students join from the course. Presence is captured from the live engine's signed webhooks; attendance is either marked manually by the teacher once the class has started (ATT-01) or derived from time present (ATT-03). Focused time is measured for engagement (LIV-03).

## Engine decision

Live classes run on **self-hosted LiveKit** (ADR-18, decided 12 Oct 2026 for lowest cost at scale, browser-only use, and automatic attendance). Mux and other per-minute streaming APIs were evaluated and rejected (ADR-18). The adapter boundary stays: if the client later mandates another engine, only `lib/integrations/live.ts` and `components/live-room.tsx` change; if that engine cannot provide signed join/leave events with per-user identity, **stop and record an `@dev` question**.

## Tasks

### T1 · Live adapter and local engine
Files: `lib/env.ts`, `.env.example`, `tests/setup.ts`, `lib/integrations/live.ts`, `livekit.yaml` (development keys only, clearly commented), `compose.yaml` (`livekit` service under the `live` profile — 11 §3.1).
- `joinToken`: `new AccessToken(key, secret, { identity: userId, name, ttl: ttlSec })`; `addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: role === 'host' })`; `serverUrl = LIVEKIT_URL`; `token = await toJwt()`.
- `closeRoom`: `new RoomServiceClient(LIVEKIT_API_URL, key, secret).deleteRoom(roomName)`; a "room not found" response is not an error.
- `parseWebhook(rawBody, authorization)`: `await new WebhookReceiver(key, secret).receive(rawBody, authorization ?? undefined)`; map `participant_joined` → `joined`, `participant_left` → `left`, `room_finished` → `room_finished`, everything else → `ignored`; `at = new Date(Number(event.createdAt) * 1000)` (seconds — verified); signature failure → `AppError('FORBIDDEN', 'Invalid webhook signature')`.

### T2 · Models, settings, pure functions
Files: `lib/models/live-session.ts`, `lib/models/attendance.ts` (05 §4.3–4.4, including `lastFocusAt`), `lib/schemas/settings.ts` (+ `attendance` key, 06 §7), `lib/domain/attendance.ts` (+ test).
- `deriveAttendance(presence, startedAt, endedAt, thresholdPct)` with every vector in 07 §10.
- `attendancePct(statuses)` → `roundHalfUp(100 × present / total, 2)`, null when total 0.

### T3 · Scheduling and session control
Files: `app/(app)/courses/[offeringId]/live/page.tsx`, `…/live/actions.ts`, `lib/data/live.ts`.

| Action | Who | Rules |
|---|---|---|
| `scheduleSession` | teach | title; `scheduledStart`/`scheduledEnd` via `istDateTime`; start < end; ≤ 6 h; start not in the past; `attendanceMode` (skill offerings: forced `derived`); `kind: 'class'`; `roomName = 'ls-' + id`; `notify` enrolled students `live.scheduled` |
| `cancelSession` | teach | only `scheduled` |
| `startSession` | teach | from 15 min before `scheduledStart` until `scheduledEnd`; status `live`, `startedAt = now` |
| `endSession` | teach | status `ended`, `endedAt = now`; `closeRoom`; enqueue `compute/finalizeLiveSession` (job id `live-final-<sessionId>`) |

The Live tab (add to `TabNav`) lists sessions: upcoming, live now (prominent "Join"), and past with each session's present count.

### T4 · Joining
Route: `/courses/[offeringId]/live/[sessionId]`.
- `learn`: when `live` → `LiveRoom` with `joinToken({ role: 'participant', ttlSec: until scheduledEnd + 2 h })`; otherwise the status and start time.
- `teach`: Start/End buttons (`ConfirmSubmit` for End), `LiveRoom` as `host` while live, and the attendance sheet (T7).
- `oversee` (HoD/admin not teaching): session details and attendance, no join.
- `LiveRoom` (client): `<LiveKitRoom serverUrl token connect video={false} audio={false}>` with `<VideoConference />` and `@livekit/components-styles`; while connected and `document.visibilityState === 'visible'`, accumulates focused seconds and `sendBeacon`s `{ kind: 'live', sessionId, focusedSec }` every 60 s and on `pagehide`.

### T5 · Presence webhooks
File: `app/api/webhooks/live/route.ts`.
- Read the raw body (`await request.text()`) and `Authorization`; `parseWebhook`.
- `joined`: find the session by `roomName` with status `live`; if the identity is an actively enrolled **student**, upsert the attendance row (`status: 'absent'`, `source: 'derived'` on insert) and `$push` `{ joinedAt: at, leftAt: null }` with `$slice: -50`.
- `left`: set `leftAt = at` on open intervals (`arrayFilters: [{ 'open.leftAt': null }]`).
- `room_finished`: if the session is still `live`, set `ended`, `endedAt = at`, enqueue finalize.
- Teachers' identities are ignored. Return `200` for ignored or unknown rooms (never make the engine retry forever); `401` on a bad signature.

### T6 · Finalization job and scheduler
Files: `worker/jobs/compute.ts` (`finalizeLiveSession`), `worker/index.ts` (scheduler `live-finalize-hourly`, 02 §8).
1. Claim: `findOneAndUpdate({ _id, status: 'ended', finalizedAt: null }, { $set: { finalizedAt: now } }, { returnDocument: 'after' })`; nothing returned → already finalized, stop (idempotent).
2. For every active enrollment: compute `presenceSec` with `deriveAttendance`; upsert the row — `derived` mode sets `status` unless `source: 'manual'`; `manual` mode leaves existing manual statuses and sets unmarked students `absent`.
3. `$inc engagementDaily.liveSec` by `presenceSec` for `istDayKey(startedAt)`.
4. Scheduler: sessions `live` with `scheduledEnd + 30 min < now` → end at `scheduledEnd` and enqueue finalize; sessions `ended` with `finalizedAt: null` older than 10 min → enqueue finalize.

### T7 · Manual attendance (ATT-01) and overrides
On the session page for `teach`, once `startedAt` is set: a table of enrolled students with Present/Absent radios (pre-filled from current rows; presence minutes shown when available). `markAttendance` (teach): only after start; writes `status`, `source: 'manual'`, `markedBy`, `markedAt` with one `bulkWrite`; one audit entry `attendance.marked` listing changed students and before/after statuses. Works before and after finalization (an override after finalize is the same action).

### T8 · Focus beacons (LIV-03)
`/api/beacon` live branch (07 §9): session `live`; viewer is an enrolled student with an open presence interval; `focusedSec ≤ min(120, secondsSince(lastFocusAt) + 5)` (first beacon ≤ 120); `$inc attendance.focusedSec`, set `lastFocusAt`; `$inc engagementDaily.focusedSec`.

### T9 · Attendance views (ATT-02)
- Live tab, `learn`: own attendance per past session and overall % (`attendancePct`).
- People tab (`teach`/`oversee`), ugc offerings: attendance % column per student.
- Session page: present/absent counts and per-student presence minutes and focused minutes.
- Home: "Live now" card for students and faculty.

### T10 · Tests
- Unit: 07 §10 vectors; `attendancePct`.
- Integration (mock `@/lib/integrations/live` `parseWebhook`/`closeRoom`): joined → row + interval; left closes it; a non-enrolled identity is ignored; finalize twice → one `liveSec` increment; manual mark survives finalize; `markAttendance` before start → CLOSED; student calling `startSession` → FORBIDDEN; focus beacon without open presence ignored.
- E2E (`tests/e2e/live.spec.ts`, LiveKit profile running; Chromium flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`): faculty schedules and starts; student joins and sees the conference UI; faculty marks attendance; ends the class; the session shows the student present.

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
