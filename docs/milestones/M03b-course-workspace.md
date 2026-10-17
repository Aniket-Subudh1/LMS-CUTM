# M03b · Course workspace redesign

| | |
|---|---|
| Depends on | M03 (00 §3) |
| Requirements | CRS-03, CRS-04, CRS-05, CRS-06, CRS-07, CPP-01, CPP-03, CPP-04, ATT-01, ATT-02, COM-01, COM-03, SKL-03, NFR-07 |
| Release | part of R1, before M04 |
| Packages added | `@dnd-kit/core`, `@dnd-kit/sortable`, `recharts` (moved forward from M06), `react-is` 19.3.0 (Recharts' peer) |
| Collections changed | `lessons`, `offerings`, `courses`, `enrollments` (fields and an invariant; no new collection, no new index) |
| Components introduced | `SortableList`, `RowMenu`, `BarChart`, `CourseOutcomes`, `CourseSyllabus` (and `ProgressRing` if chosen in Round 1) |

## Goal

The course workspace (`/courses/[offeringId]`) becomes a course builder for teachers and a course player for students, after the way professional platforms work (Udemy's curriculum, Canvas modules, Moodle's course page, Coursera's player, NBA/OBE tools for outcomes):

- Teachers build the course one module at a time:
  - Lessons hold a video, an automatic or uploaded thumbnail, and up to five PDF notes.
  - Every row has its actions in a ⋮ menu: edit, replace file, move, publish, delete.
  - Modules and lessons reorder by dragging, or by keyboard.
- The course plan is a list of sessions, each added and edited in a dialog.
- Outcomes and the syllabus are edited inside the workspace by the course coordinator and admins: COs, the CO-PO-PSO heatmap and syllabus modules, each item on its own.
- Live classes and the roster gain the missing actions: delete or restore a class; add, drop or re-add one student.
- Students get one Resume button, a module switcher, per-module progress and the notes beside the video.
- The Overview is a compact dashboard instead of one long scroll.

## Decisions (Aniket, 17 Oct 2026)

Asked while planning; each one changes a project rule, recorded in the same commit as the first code that needs it.

1. **Drag-and-drop to reorder** (modules, lessons, syllabus modules) with `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0.
   - Every sortable list also works from the keyboard and has a "Move to top / up / down / bottom" menu on its handle.
   - A dropped order shows at once (`useOptimistic`) and returns to the saved order if the save fails.
   - Changes 04 §1 and 08 §1.
2. **Lesson media.**
   - The media worker takes a frame at 10% of every new video as its thumbnail; the teacher may upload a picture instead.
   - Any lesson may carry up to five PDF notes.
   - An offering may have a cover picture, shown on its course card and in the workspace header.
3. **COs, the CO-PO-PSO mapping and the syllabus** stay with the course coordinator and admins (Q-27, CRS-07), but are edited inside the workspace. Every other viewer sees them read-only with the coordinator's name.
4. **Charts with Recharts 3.10.1** through shadcn's chart component, loaded only on the pages that draw one. Moved forward from M06; changes 03 §3.
5. **Admins join any live class** whenever it is running, as host, in any course (asked after T5). Their Home lists the ten classes running now across the university. A host's time in the room is not attendance (only enrolled students are recorded). Changes 09 §2.
6. **A live class fills its own tab, like Google Meet** (asked after T5): a room page outside the app's sidebar and header, opened in a new tab by every Join button; the class page keeps attendance and the summary. Changes 08 §2 and the `LiveRoom` row.

Standing preference: every screen is shown first as static mock-ups with variants, and Aniket picks before it is built. The picks are recorded below as each round is decided.

### Mock-up rounds

| Round | Screens | Pick |
|---|---|---|
| 1 | Workspace frame and Overview (teacher, student); content builder; menu, drag and processing states | **Frame A** (a cover strip with title, teacher and stat chips on every tab; Overview a grid of cards). **Builder A** (modules on the left, the module's lessons on the right). **Progress: a ring** for the course total, bars per module (adds `ProgressRing`; 08 §5.2 changes its "no Meter component" line) |
| 2 | Lesson editor (teacher); lesson player (student); student Lessons tab | **Editor A** (the video as students see it on the left; Status, Details, Video, Thumbnail, Notes and Delete cards on the right). **Player A** (course outline with ticks on the left; video, About / Notes tabs and Previous / Next on the right). **Lessons tab as rows** (a resume bar, modules with progress on the left, the module's lessons as rows) |
| 3 | Outcomes tab; Syllabus tab; Course plan | **Outcomes A** (CO list with Bloom chips and ⋮; the heatmap edited in place by clicking cells, saved together, with an average row and coverage warnings; a bar chart of coverage per PO/PSO). **Syllabus** as shown (facts strip, sortable modules, objectives, books and projects cards). **Course plan A** (publish bar for unpublished changes; the plan text beside sessions grouped by week, each with date tile, CO and kind chips and ⋮) |
| 4 | Live, People, phone views | **Live** as shown (upcoming classes with Edit and ⋮; attendance per class as a bar chart; past classes table). **People** as shown (number tiles, search and status filter, roster with ⋮, Add student and Upload CSV, teaching staff card). Phone views are checked on the build (no mock-up) |
| — | Design language for every page (asked mid-build: "slim, sleek, classy") | **B · Crisp editorial**: 6 px corners (`--radius` 0.375rem), hairline cards, near-black main buttons, 32 px controls, underlined tabs, status badges as a dot and coloured text, small uppercase table headings. **The sidebar and the header are not part of it**: they keep the "D · Icon chips" sidebar with its generated icons, the rounded lockup, the round header controls and the rounded page panel, at a 12 px base corner (Aniket, 17 Oct 2026, after the first build changed them) |

## Information architecture

| Tab | Route | Student | Faculty (teach) | HoD (oversee) | Admin | Shown when |
|---|---|---|---|---|---|---|
| Overview | `/courses/[id]` | dashboard, Resume | dashboard, setup steps | dashboard | dashboard | always |
| Lessons / Content | `/content?module=<id>` | player outline | builder | builder, read only | builder | always |
| Course plan | `/plan` | published version | edit, publish | saved version, read only | edit | always |
| Live | `/live` | as M03 | + row menus, delete, restore | read only | manage; join any class as host | always |
| Syllabus | `/syllabus` | read | read; edit if coordinator | read | edit | always |
| Outcomes | `/outcomes` | read | read; edit if coordinator | read | edit | credit courses |
| People | `/people` | — | manage | read | manage | teach / oversee |

- The HoD sees a one-line banner: "You are viewing as head of department. The course's teachers make changes." Every write still answers 404 (`requireTeach`).
- Edit dialogs open from the URL (`?new=lesson-<id>`, `?new=session-<rowId>`, `?new=co-<id>` and so on).
  - The page mounts such a dialog only while its parameter is present, keyed by it.
  - `FormDialog` opens from the URL only when it mounts; a link that changes nothing but the search parameters keeps the same `bfcacheId`.

## Tasks

Each task: database → backend → frontend, one commit, one PROGRESS entry.

### T0 · Decisions, mock-ups

- This file; rows in 00 §2, 01 §7 and PROGRESS §2; the decision entry.
- Mock-up rounds 1–4: static HTML in the agent's scratchpad, Playwright screenshots at 1440 and 390 px, seed data.

### T1 · Lesson media (CRS-03, SKL-03, NFR-07)

**Model** (05 §4.1)
- `lessons.frameKey` (worker JPEG).
- `lessons.thumbKey` (uploaded picture).
- `lessons.attachments[] { _id, key, fileName ≤ 120, size }`: at most 5 PDFs, uploaded as `lesson-doc`.
- The thumbnail shown is `thumbKey ?? frameKey ??` the lesson type's mark.
- Deleting a lesson deletes every one of its keys.

**Uploads and downloads**
- New purpose `lesson-thumb`: jpeg, png or webp, at most 2 MB, never SVG.
- Resized in the browser to 1280 × 720.
- `/api/files` serves:
  - the frame under the video's rule;
  - the thumbnail and the notes under the lesson's rule;
  - every redirect with `Cache-Control: private, max-age=300` (06 §3, §5; 09 §5).

**Worker** (06 §6)
- `MediaJob { lessonId, fileKey }`; job id `transcode-<lessonId>-<file uuid>`.
- It takes the frame first (`frameAtSec`), then makes the 480p copy.
- Every write is conditional on `fileKey`. A job whose file was replaced meanwhile deletes what it uploaded, and its failure marks nothing.

**Actions**
- `replaceLessonFile`: a video is refused once any student has progress; a document is always allowed.
- `setLessonThumb` / `clearLessonThumb`.
- `addLessonNotes` / `removeLessonNote`.
- `updateLesson` takes the link's URL.
- `createLesson` takes notes and a thumbnail.

**UI**
- The teacher's lesson page becomes the editor (Round 2).
- The student's lesson page becomes the player, with an About / Notes tab and the thumbnail as the video's poster.

### T2 · Content builder (CRS-03)

**Pure function**
- `isPermutation` in `lib/domain/order.ts`.

**Actions** (`moveModule` and `moveLesson` are deleted)
- `deleteModule`: only an empty module.
- `reorderModules` / `reorderLessons`: a full list that must be a permutation.
- `moveLessonToModule`.
- `setModulePublished` (publish or unpublish a whole module).
- Optional `modules[].summary` ≤ 300.

**Reads**
- `getContent` adds thumbnail, notes count and processing state.
- `getLessonActivity` (opened / done counts, teach and oversee only).

**UI**
- `SortableList` and `RowMenu`.
- `FormDialog.trigger` becomes optional.
- The content page has a module switcher (`?module=`) for every role. Teachers build; the HoD reads; students see their progress.

### T3 · Workspace frame and Overview (CRS-03, CRS-04, CRS-06)

**Cover**
- New purpose `offering-cover` (jpeg, png or webp, 2 MB, resized to 1600 × 640).
- `offerings.coverKey`.
- `setOfferingCover` / `clearOfferingCover` (`requireTeach`).

**Reads**
- `getNextUp`: the next live class and the next plan session.
- `getMyProgress` resumes the most recently watched unfinished lesson.
- `getWorkspace` / `listMyOfferings` return the cover.

**UI**
- Header and tabs (Round 1) and the HoD banner.
- The Overview dashboard:
  - a primary action for each role;
  - Up next;
  - Progress, or "Get this course ready";
  - What you'll learn;
  - Next sessions.
- `OfferingCard` shows the cover.

### T4 · Course plan as a list (CRS-06, COM-01)

**Model** (05 §3.8)
- `plan.changedAt`.
- Calendar rows keep their ids and stay sorted by date (`$push $each $sort { date, _id }`).
- Optional `kind` (theory, practice or project).

**Actions**
- `addPlanSession`, `updatePlanSession`, `deletePlanSession`. Each sets `plan.changedAt`; at most 200 rows; COs must belong to the course.
- `saveCalendar` is deleted.
- `fillCalendarFromCourse` and `publishPlan` stay. There is no unpublish.

**Reads and UI**
- `getPlanView` returns the editor's view, the HoD's read-only view of the saved plan, or the student's view of the published version.
- The tab (Round 3) shows a "Changes since version n" bar.

### T5 · Syllabus and Outcomes in the workspace (CRS-05, CRS-07, CPP-01, CPP-03, CPP-04)

**Model and rules**
- `courses.coSeq`. Today `nextCoCode` gives a deleted highest CO's code to the next one, which breaks 05 §3.6.
- `nextCoCode(existing, seq)` and `mappingCoverage(cos, codes, cells)` in `lib/domain/catalog.ts`, with test vectors.

**Actions** (`requireCourseEditor`, audited `course.*` with before and after)
- `addCo`, `updateCo`.
- `deleteCo`: also removes its mapping cells and its id from every offering's calendar.
- `saveCourseModule`, `deleteCourseModule`, `reorderCourseModules`.
- `setSyllabusFile`, `saveProjects`.
- `saveCos` and `saveSyllabus` are deleted.
- The mapping keeps its whole-grid save, `saveCoMap`.
- COs keep their codes and are not reordered.

**UI**
- `CourseOutcomes`: CO list, CO × PO/PSO heatmap with an average row and coverage warnings, `BarChart` of coverage.
- `CourseSyllabus`.
- Both are used by `/catalog/[id]` and by the new `/syllabus` and `/outcomes` tabs.

### T6 · Live (CRS-04, ATT-01, ATT-02)

**Actions**
- `deleteSession`: only a class that never ran and has no attendance rows; audited `live.deleted` (09 §6).
- `restoreSession`: a cancelled class goes back to scheduled if its start is still ahead; students are told (`live.changed`).
- Upcoming classes get a pager.

**UI**
- Row ⋮ menus.
- An attendance-per-class chart built from the past-classes page already loaded.

### T7 · People

**Invariant** (05 §3.9; 02 §11)
- At most 1,000 enrolments per offering, checked by `changeEnrollments`, `addStudent` and `createOfferings`.

**Reads**
- `listRoster` searches roll number, name and email, filters by status, orders by roll number, and counts.

**Actions**
- `addStudent` (roll number or email) and `setEnrollmentStatus` (drop or add again).
- Both are refused while marks are locked and audited `enrollment.changed`.

**UI**
- Number tiles, toolbar, row menus.
- "Add student" and "Upload CSV" dialogs.
- A teaching-staff card.

### T8 · Report

Doc sweep (05, 06, 08, 09), PROGRESS status, acceptance walk.

## Rule changes (each in the commit of the first code that needs it)

| Rule | Change |
|---|---|
| 04 §1, 08 §1: no drag-and-drop | Drag only to reorder, always with the keyboard and a Move menu |
| 04 §1: no optimistic UI | A dropped order shows at once and reverts if the save fails |
| 08 §1: `AlertDialog` only for confirmations | Also for the message of a row-menu action that failed |
| 08 §3: tabs | Course plan and Outcomes for every role; new Syllabus tab |
| 03 §3: Recharts in M06 | Moved to M03b, with `react-is` 19.3.0; dnd-kit rows added |
| 02 §3.1: where actions live | The actions of a shared component live with the route that owns the record |
| 09 §6: audit list | `live.deleted` |

## Not built

Each needs Aniket's written approval (01 §4):
- attendance export;
- announcements (COM-02);
- recurring classes;
- "preview as student";
- creating lessons by dropping several files;
- a month calendar view.

COs are not reordered: their codes are fixed.

## Acceptance criteria

1. **Keyboard reorder:** a teacher reorders modules and lessons with the keyboard only, and the order survives a reload. A screen reader announces each move.
2. **Thumbnails:** a new video shows a frame from 10% of its length as its thumbnail within minutes. An uploaded picture replaces it, and removing the picture brings the frame back.
3. **Notes:** a lesson holds at most five notes PDFs. A student gets 404 for every file of an unpublished lesson.
4. **CO codes:** after CO6, the highest, is deleted, the next new CO is CO7. Its mapping cells and calendar tags are removed in one audited change.
5. **Plan sessions:** editing one keeps its id and its place in date order.
6. **Non-coordinators:** a faculty member who is not the coordinator sees Outcomes and Syllabus read-only with the coordinator's name, and their writes answer FORBIDDEN.
7. **HoD:** sees no edit control on any tab, and every write answers 404.
8. **Live delete:** a cancelled class can be deleted, audited. A class with attendance cannot.
9. **Roster:** a teacher adds a student by roll number and drops them, each audited. Both are refused while marks are locked.
10. **Phone width:** no workspace tab scrolls sideways at 360 px.
