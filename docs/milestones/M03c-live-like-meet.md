# M03c · Live room with Google Meet's major features

| | |
|---|---|
| Depends on | M03, M03b (the room page, raised hands, chat) |
| Requirements | LIV-01–LIV-05, ATT-01–ATT-03, COM-03; new owner requests below |
| Release | part of R1, before M04 |
| Packages to add (each with its reason in 03 §3, in the commit that first uses it) | `@livekit/track-processors` 0.8.1 (background blur; 0.8.2 is under two weeks old); `@excalidraw/excalidraw` 0.18.1 (whiteboard, MIT); the recording uses `livekit-server-sdk`'s `EgressClient`, already installed |
| Collections | `liveSessions` (removed people, locks; T4–T7: `kind: 'meeting'` with its hosts, members and guests, the lobby, recording, polls, breakout rooms), new `pollAnswers` |
| Env vars added | `LIVEKIT_EGRESS` (`on` where an Egress service runs; recording is hidden otherwise) |
| Infrastructure | LiveKit **Egress** next to the LiveKit server on the test server, 65.20.89.9 (decision 5) |

## Goal

The live room works like Google Meet for a class, and the same room serves meetings outside classes:

- **See what you want.** Layouts as in Meet: Auto, Tiled, Spotlight, Sidebar. Pin anyone or the shared screen. Faces stay in view while someone presents.
- **Stay in the class from another tab.** A floating mini window (picture-in-picture) opens on its own when you switch tabs (Chrome 120+), or from a "Pop out" button, and stays on top of other apps.
- **Run the class.** Hosts mute one person or everyone, remove someone (who stays out until a host lets them back), and lock screen sharing, microphones or chat for students.
- **Take part.** Raised hands (M03b), chat (M03b), emoji reactions, polls, breakout rooms, a shared whiteboard, live captions and background blur.
- **Keep it.** Hosts record the class; everyone is told while it records; the recording appears on the class page.
- **Meet outside a class.** Staff schedule a meeting with LMS members and outside guests by email. Invitations carry a calendar file and a join link. Guests enter their name and wait in a lobby until a host lets them in.

## Decisions (Aniket, 17 Oct 2026)

Asked after M03b's live room, with research into Google Meet's host controls and layouts, LiveKit's server APIs and Chrome's picture-in-picture:

1. **Recording is built now** (LIV-05 moves out of the backlog). Aniket asked me to deploy LiveKit Egress on the LiveKit host myself. Each running recording takes 2–6 CPUs.
2. **Meetings may include outside guests**, who join from a personal link and wait in a lobby until a host admits them.
3. **A removed person stays out** of that class or meeting until a host lets them back; their time in the room so far still counts.
4. **Extras, all of them:** emoji reactions, host locks, background blur, polls, breakout rooms, live captions, and a whiteboard / canvas.

Each changes 01 §4 (out of scope: live-class recordings, chat and social features) and is recorded there in the commit that builds it.

Standing preference: every screen is shown first as static mock-ups; Aniket picks before it is built.

Round 1 (17 Oct 2026): **Auto puts the faces beside a shared screen (R1-A)**; **host controls at the top of People (R1-C)**; the tiled view with pinning and reactions (R1-B), the mini window (R1-D) and the removed screen (R1-E) **as shown**. T1–T3 are built to these.

## Decisions (Aniket, 24 Oct 2026)

Asked before T4, when Aniket said to complete the milestone:

5. **Recording runs on the current server**, 65.20.89.9, beside LiveKit. It has 2 vCPUs and 3.3 GB, and also runs the LMS, MongoDB and Redis. A recording can therefore slow the live class and the LMS while it runs. Aniket accepts this for trying it out; real use needs its own machine (M11, Q-12).
6. **Captions are the host's own speech.** The host's browser recognises it (Chrome's or Edge's speech recognition, which may send the audio to Google or Microsoft) and sends the text to everyone in the room. Each person turns captions on or off for themselves. Students' speech is not captioned, so no student's voice leaves for captions.
7. **Guests come in by personal link and a lobby.** Each invited guest's email holds their own link. They type their name and ask to join, and a host admits or turns them away. No account and no code. *Replaced by decision 9 (28 Oct 2026): a passcode, and no lobby.*
8. **One mock-up round for everything left** (rounds 2 and 3 together). After the picks, T4–T10 are built straight through, one commit each.

## Decisions (Aniket, 28 Oct 2026): the meeting fixes

Asked after using the room. Aniket reported that invited people did not get a link they could use, that people without an account must be able to join and the link must be safe "like Zoom" with a passcode, that a shared screen stayed hidden while the whiteboard was open, that Stop recording did not work, that the whiteboard had no full screen and phones saw it narrow and portrait, that polls hid in a side tab, and that phones opened the back camera with no way to turn it round. The picks below were made on a plan, without a mock-up round (he chose to build straight from it). They replace decision 7 and R3-B's default.

9. **A personal link and a passcode for everyone invited.** Every co-host, member and guest is emailed their own link and the meeting's 6-digit passcode. Signed in as that person, the link opens the meeting's room. Otherwise it asks for a name and the passcode, then joins straight away. No lobby: nobody waits for a host, and anyone not invited cannot get in. (Replaces decision 7.)
10. **Labelled buttons on the bar.** Hosts' tools (Board, Poll, Record) are buttons of their own. On a phone, the bar holds five buttons and `⋯` opens a sheet of labelled tiles. A poll pops up in front of everyone. (Replaces R3-B's Activities tab.)
11. **A recording shows the whiteboard.** While a recording runs with the board open, the presenter's browser sends the board as a video beside the cameras.
12. **The whiteboard has its own full screen**, and phones see the presenter's landscape view.

### Design of T12–T18 (dev)

- **Invitations (T14):**
  - The people field adds what was typed when it loses focus or the form is sent, so nothing typed is lost.
  - Every invitation carries the person's own link (`/m/<token>`) and the passcode. A member's token signs the meeting and their user id; a guest's stays their guest id, so links already sent keep working.
  - Hosts see the passcode on the meeting's page, and can copy anyone's link or send their invitation again.
  - Signing in returns to the page that asked for it.
- **Joining by link (T15):**
  - The passcode is checked in constant time, with tries limited per link and per address.
  - A right passcode gives the browser a sealed cookie for that meeting and person, until the meeting ends, so a reload comes straight back.
  - A guest's identity is their guest id; a member who did not sign in joins as themselves, taking part. A co-host who did not sign in takes part too; running the meeting needs signing in.
  - With a link, people answer polls and raise hands like everyone else. Guests still stay out of breakout rooms (A-201).
  - Everyone sees a "Ready to join?" screen first: their own picture from the front camera, the microphone and camera switches, and Flip on a phone.
- **Recording (T13):**
  - The engine says what is recording. Stop stops every recording the engine runs for the room. Start clears a stored recording the engine no longer runs. A start that times out keeps its row if the engine started it anyway.
  - The webhook finds a recording by its id or its file. After a room finishes, the worker settles any recording still marked as running.
  - Hosts see "Starting…" and "Stopping…" until the engine confirms.
- **The stage (T16):**
  - The board and every shared screen are presentations. The newest fills the stage; the others wait as tiles, and a tap swaps them for that viewer. The board stays loaded while it waits.
  - The board and a shared screen go full screen. A phone then turns to landscape where the browser lets it; an iPhone fills the window and asks to be turned sideways.
  - Viewers follow the presenter's view, so a phone sees what the laptop sees, scaled. The presenter's laser and pointer reach everyone.
  - The board's switches sit in a strip above it, not over Excalidraw's tools.
- **Controls (T17):** as decision 10. People and Chat open as a sheet from the bottom of a phone or tablet. A host's Leave offers "End for everyone". Errors close themselves.

## Design of T4–T10 (dev)

- **A meeting is a live session without a course.**
  - It is one `liveSessions` row (`kind: 'meeting'`, no `offeringId`). Its hosts, members, guests and invitation version are on that row (`meeting`), beside the room as a class's: removed people, locks, the lobby, recording, polls and breakout rooms. (Built so in T4: a separate `meetings` collection would have kept a second copy of the title and times.)
  - So one room serves both. Its actions take the session and work out the viewer's access from it: a class through its course (`offeringAccess`), a meeting through its hosts and members. M04b's assessment actions work the same way (`assessmentAccess`).
  - T1–T3's actions move to that shape in T4. Meetings take no attendance.
- **Scheduling (T4):**
  - Faculty, heads of department and admins schedule meetings. They pick members by name or email: staff, and the students they can already see (09 §3), at most 50. Guests are email addresses, at most 20.
  - A changed time sends the invitation again. Cancelling sends a cancellation.
  - The scheduler and the co-hosts they name are the hosts.
- **Invitations (T4):** an email to each member and guest, with the join link and an `.ics` calendar file.
  - The file is `METHOD:REQUEST`; a new time sends it again with a higher `SEQUENCE`, and cancelling sends `METHOD:CANCEL`.
  - Emails go through the mail queue. The mail adapter gains attachments (06 §4.2).
  - A guest's link is their id signed with the session secret, so nothing secret is stored and a re-sent invitation keeps the same link.
- **The guest lobby (T4):** `/m/<token>`, a public page like `/t/`.
  - It shows the meeting and its time, the guest's name, and a camera and microphone check, then "Ask to join".
  - The request goes on the session's `waiting` list. The server tells the hosts in the room (a `lobby` message), and People lists the waiting guests with Admit, Deny and Admit all.
  - The guest's page checks every 3 seconds. Once admitted, it gets a token for identity `guest-<guestId>`.
  - A turned-away guest may ask again. A removed guest stays out until let back (decision 3). Guests have no host controls.
- **Recording (T5):**
  - A host records with `EgressClient.startRoomCompositeEgress` (the speaker layout) to the S3 bucket, under a key the server chooses. One recording at a time per room.
  - The session keeps `recordings [{ egressId, by, startedAt, endedAt?, key?, durationSec?, status }]`, at most 20.
  - Everyone sees "Recording" beside "Live", and a notice when it starts and stops. The egress webhook stores the file.
  - The class page, or the meeting's page, plays it through `/api/files` for whoever can open that class or meeting.
  - Recording is hidden unless `LIVEKIT_EGRESS=on`.
- **Polls (T6):**
  - A host asks a question with 2–6 options. Each person answers once and may change their answer while the poll is open.
  - Hosts see the counts live: the server sends them after each answer. A host can show the results to everyone, and close the poll.
  - Each poll is stored on the session (at most 20 per class). Answers go in `pollAnswers`, one row per person and poll.
- **Breakout rooms (T7):**
  - A host makes 2–20 rooms, sends students to them at random or by hand, and may set a time limit.
  - Each room is its own LiveKit room, `ls-<sessionId>-b<n>`. Students get "Join breakout room n" and move with a new token. Time there counts as time in the class: the webhook maps a breakout room to its session.
  - Hosts can visit any room, send a message to every room, and close them. Everyone then returns after a 60-second countdown.
  - The plan is stored on the session (`breakout`).
- **Whiteboard (T8):**
  - A host opens Excalidraw as the stage's main tile and lets students draw or only watch.
  - Changes travel as data messages. Someone who joins late gets the board from a host's browser. Nothing is stored.
  - Excalidraw loads only when a board opens, and its fonts come from our own files.
- **Captions (T9):** as decision 6.
  - The host turns on "Caption my speech". The browser's recognition (English, India) sends `{ text, final }` on the `caption` topic.
  - "CC" in the bar shows a strip at the foot of the stage: the latest two lines with the speaker's name.
  - Hosts on a browser without speech recognition are told so.
- **Background blur (T10):**
  - "Blur my background" in More applies `@livekit/track-processors`' `BackgroundBlur` to the viewer's own camera.
  - Its model and wasm files are served from our own `public/`, so nothing is fetched from another site.
  - It is hidden where the browser cannot run it.

## Mock-ups (T0, rounds 2 and 3 together)

Drawn inside the real app at 1440 px and 390 px, with two variants where there is a real choice. The picks are recorded here before T4.

| # | Screen | Variants |
|---|---|---|
| R2-A | Meetings (in the menu for staff): upcoming and past, and the New meeting dialog | one |
| R2-B | The invitation email, with the calendar file and the join link | one |
| R2-C | The guest's lobby: before asking, and while waiting | one |
| R2-D | A host in the room while a guest asks to join: the notice on the stage and the waiting list in People | one |
| R3-A | Recording: Record for hosts, what everyone sees while it records, and the recording on the class page | one |
| R3-B | Polls, breakout rooms and the whiteboard: where hosts start them | A · an Activities tab beside People and Chat · B · their own buttons in the bar |
| R3-C | A poll: asking, answering, and the live results | one |
| R3-D | Breakout rooms: setting them up, a student's invitation, inside a room with the time left | one |
| R3-E | The whiteboard on the stage | one |
| R3-F | Captions on the stage | one |
| R3-G | Background blur in More, and the blurred tile | one |

Drawn on 24 Oct 2026 on the e2e data (CUTM1602's room, faculty1's Meetings, the class page) and shown to Aniket on one page: https://claude.ai/artifact/3eLKRW42zQFQf1dCNSyNPP (private).

**Picks (24 Oct 2026):** Aniket said “yes start building” without choosing R3-B, so it is **A · an Activities tab** beside People and Chat (Google Meet's place, and a shorter bar on a phone); B moves three buttons if he prefers it. Everything else as drawn. *On 28 Oct 2026 he chose buttons on the bar after all (decision 10).*

## How the pieces work (verified against the installed SDKs and LiveKit's docs)

- **Mute:** `RoomServiceClient.mutePublishedTrack` (a host can mute, not unmute, as in Meet).
- **Remove:** `removeParticipant`. On a self-hosted server it does not revoke the person's token, so the LMS keeps them out itself: their id goes on the session's removed list, no new token is issued, a join webhook for them removes them again, and tokens become short-lived (LiveKit refreshes them for people already connected).
- **Locks:** token grants (`canPublishSources`, `canPublishData`) for people joining, and `updateParticipant` permissions for those already in.
- **Picture-in-picture:** the Document Picture-in-Picture API (Chrome and Edge) for a window with the stage and controls; Chrome opens it on its own when the tab is left if the page registers the `enterpictureinpicture` media-session handler while using the camera or microphone. Other browsers: the video element's own picture-in-picture.
- **Reactions, polls' live results, whiteboard strokes, captions:** LiveKit data messages, reaching only the people in the room. Polls and their answers are stored (one row per answer); reactions, strokes and captions are not.
- **Breakout rooms:** separate LiveKit rooms named after the class; people move with new tokens; time in a breakout room counts as time in the class.
- **Captions:** the host's browser's speech recognition (decision 6); a server model would need a GPU.
- **Recording:** `EgressClient` room-composite recording to S3; the room tells everyone while it records; the egress webhook stores the file on the session.

## Tasks

Each task: database → backend → frontend, one commit, one PROGRESS entry.

- **T0** Decisions (this file, PROGRESS); mock-ups in rounds: (1) layouts, pinning, mini window, host controls, reactions; (2) meetings, invitations, guest lobby; (3) polls, breakout rooms, whiteboard, captions, recording. Rounds 2 and 3 are drawn together (decision 8).
- **T1** Layouts and pinning; the mini window.
- **T2** Host controls: mute one or all, remove and let back, locks.
- **T3** Emoji reactions.
- **T4** Meetings: scheduling, members and guests, email invitations with a calendar file, the guest lobby.
- **T5** Recording: Egress on the server, start/stop, the banner, the recording on the class page.
- **T6** Polls.
- **T7** Breakout rooms.
- **T8** Whiteboard.
- **T9** Live captions.
- **T10** Background blur.
- **T11** Report: the walk of T4–T10 on the dev LiveKit server and the fixes it led to (PROGRESS, 24 Oct 2026).
- **T12** Decisions 9–12 (this file, PROGRESS).
- **T13** Recording that starts, stops and saves.
- **T14** Invitations: a personal link and the passcode for everyone; copy and resend; signing in returns.
- **T15** Joining by link and passcode; the "Ready to join?" screen; the front camera and Flip.
- **T16** The stage: the board and shared screens together, full screen, following the presenter, the laser, the board in the recording.
- **T17** The bar's labelled buttons, the phone's sheet, the poll's pop-up, and the remaining fixes.
- **T18** Report: the walk of T12–T17 and its fixes.

## Not built

Each needs Aniket's approval first:
- dial-in by phone;
- live streaming to YouTube;
- transcripts or AI notes;
- hand-raise, chat or poll analytics (01 §4).
