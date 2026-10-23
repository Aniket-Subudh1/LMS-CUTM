# M03c · Live room with Google Meet's major features

| | |
|---|---|
| Depends on | M03, M03b (the room page, raised hands, chat) |
| Requirements | LIV-01–LIV-05, ATT-01–ATT-03, COM-03; new owner requests below |
| Release | part of R1, before M04 |
| Packages to add (each with its reason in 03 §3, in the commit that first uses it) | `@livekit/track-processors` (background blur); `@excalidraw/excalidraw` (whiteboard, MIT); the recording uses `livekit-server-sdk`'s `EgressClient`, already installed |
| Collections | `liveSessions` (removed people, locks, recording, polls), new `meetings` (and its guests) |
| Infrastructure | LiveKit **Egress** deployed next to the LiveKit server (recording) |

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

## How the pieces work (verified against the installed SDKs and LiveKit's docs)

- **Mute:** `RoomServiceClient.mutePublishedTrack` (a host can mute, not unmute, as in Meet).
- **Remove:** `removeParticipant`. On a self-hosted server it does not revoke the person's token, so the LMS keeps them out itself: their id goes on the session's removed list, no new token is issued, a join webhook for them removes them again, and tokens become short-lived (LiveKit refreshes them for people already connected).
- **Locks:** token grants (`canPublishSources`, `canPublishData`) for people joining, and `updateParticipant` permissions for those already in.
- **Picture-in-picture:** the Document Picture-in-Picture API (Chrome and Edge) for a window with the stage and controls; Chrome opens it on its own when the tab is left if the page registers the `enterpictureinpicture` media-session handler while using the camera or microphone. Other browsers: the video element's own picture-in-picture.
- **Reactions, polls' live results, whiteboard strokes, captions:** LiveKit data messages, reaching only the people in the room. Polls and their answers are stored (one row per answer); reactions, strokes and captions are not.
- **Breakout rooms:** separate LiveKit rooms named after the class; people move with new tokens; time in a breakout room counts as time in the class.
- **Captions:** decided at their task (engine and privacy: the browser's speech recognition sends audio to its maker; a server model needs a GPU).
- **Recording:** `EgressClient` room-composite recording to S3; the room tells everyone while it records; the egress webhook stores the file on the session.

## Tasks

Each task: database → backend → frontend, one commit, one PROGRESS entry.

- **T0** Decisions (this file, PROGRESS); mock-ups in rounds: (1) layouts, pinning, mini window, host controls, reactions; (2) meetings, invitations, guest lobby; (3) polls, breakout rooms, whiteboard, captions, recording.
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
- **T11** Report.

## Not built

Each needs Aniket's approval first:
- dial-in by phone;
- live streaming to YouTube;
- transcripts or AI notes;
- hand-raise, chat or poll analytics (01 §4).
