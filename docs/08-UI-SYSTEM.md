# 08 · UI system

Server-first, minimal JavaScript, mobile-first, readable on a slow connection. Students use phones and lab machines; faculty use laptops; admins use desktops.

## 1. Principles

1. **A page that only shows data ships no client JavaScript.** Interactivity is isolated in the inventory's client components (§5).
2. **One way to do each thing:** lists → `DataTable`; forms → `ActionForm` + `Field`; filters → GET `<form>`; destructive actions → `ConfirmSubmit`; navigation inside an area → `TabNav`.
3. **No modals, toasts, drawers, carousels, drag-and-drop, infinite scroll** (04 §1).
4. **Every page has four states designed:** loading (`loading.tsx` skeleton), empty (a sentence saying what to do next), error (`error.tsx`), not found (`not-found.tsx`).
5. **Words over icons.** Icons (lucide-react) only beside a text label.

## 2. Route map

Access: S student · F faculty (teach) · H hod (oversee, read-only) · A admin · P support. Every route under `(app)` is behind the session; record access is enforced by the DAL, not by hiding links.

| Route | Who | Milestone | Purpose |
|---|---|---|---|
| `/login` | public | M00 | Email + password |
| `/forgot-password` | public | M00 | Request a reset link |
| `/reset-password?token=` | public | M00 | Set a password (reset and invitation) |
| `/home` | all | M00 (+ every milestone adds its section) | Role-aware landing: today's live classes, due soon, to-grade, recent results |
| `/profile` | all | M00, M07 | Change password; link GitHub (students) |
| `/notifications` | all | M02 | Notification list; mark read |
| `/courses` | S F H A | M01 | My offerings (admin: all, filterable) |
| `/courses/[offeringId]` | S F H A | M01, M02 | Overview: syllabus, objectives, COs, published plan and calendar |
| `/courses/[offeringId]/plan` | F A | M02 | Edit and publish course plan and calendar |
| `/courses/[offeringId]/content` | S F H A | M02 | Modules and lessons; F adds/orders/publishes |
| `/courses/[offeringId]/content/new` | F | M02 | Add a lesson |
| `/courses/[offeringId]/content/[lessonId]` | S F H A | M02 | View a lesson (video player, document, link) |
| `/courses/[offeringId]/live` | S F H A | M03 | Sessions list; F schedules |
| `/courses/[offeringId]/live/[sessionId]` | S F | M03 | Join the room; F: start/end, attendance sheet |
| `/courses/[offeringId]/assessments` | S F H A | M04 | Assessments (all modes); S sees status per item |
| `/courses/[offeringId]/assessments/new` | F | M04 | Create (`?mode=`) |
| `/courses/[offeringId]/assessments/[aid]` | S F H A | M04 | S: start / continue / view result; F: summary and actions |
| `/courses/[offeringId]/assessments/[aid]/edit` | F | M04, M05 | Builder: settings, items, rubrics, CO tags, test cases |
| `/courses/[offeringId]/assessments/[aid]/attempt` | S | M04, M05 | The attempt runner (timer, autosave, proctoring, code) |
| `/courses/[offeringId]/assessments/[aid]/grade` | F | M04 | Submissions list with status |
| `/courses/[offeringId]/assessments/[aid]/grade/[submissionId]` | F | M04 | Grade one submission |
| `/courses/[offeringId]/records` | S F H A | M04 | Learning and lab records (record-mode assessments + the student's entries) |
| `/courses/[offeringId]/marks` | S F H A | M06 | Internal marks: F/H/A all students with trend; S own breakdown |
| `/courses/[offeringId]/projects` | S F H A | M07 | Projects/teams; F creates |
| `/courses/[offeringId]/projects/[projectId]` | S F H A | M07 | Tracker board or GitHub dashboard |
| `/courses/[offeringId]/outcomes` | F H A | M09 | CO attainment, PO/PSO values, AI tag suggestions |
| `/courses/[offeringId]/people` | F H A | M01, M10 | Roster, enrollment changes; engagement column (M10) |
| `/courses/[offeringId]/people/[studentId]` | F H A | M10 | Student drill-down (ENG-02) |
| `/results` | S | M08 | Own grade sheets |
| `/reports/ce` | H A | M06 | CE overview across the department's offerings |
| `/reports/attainment` | H A | M09 | Program/batch attainment |
| `/reports/engagement` | H A | M10 | Engagement across offerings; skill-course traceability |
| `/admin` | A | M01 | Admin landing |
| `/admin/departments`, `/admin/programs`, `/admin/programs/[id]` | A | M01 | Structure, POs/PSOs, batches |
| `/admin/terms` | A | M01 | Academic calendar (terms) |
| `/admin/courses`, `/admin/courses/[id]` | A | M01 | Catalog, components, COs, CO-PO-PSO matrix, syllabus |
| `/admin/schemes`, `/admin/schemes/[componentKey]` | A | M01 | Evaluation schemes and versions |
| `/admin/offerings`, `/admin/offerings/new` | A | M01 | Create offerings, assign faculty and scheme |
| `/admin/users`, `/admin/users/import`, `/admin/users/[id]` | A P | M01 | Users; P may only view and send a reset link |
| `/admin/settings`, `/admin/settings/[key]` | A | M01 | Settings registry (06 §7) |
| `/admin/exams` | A | M08 | End-sem import, CE export, locks, grade sheets |
| `/admin/integrations` | A | M07, M08 | Sync runs, failed jobs, GitHub App status |
| `/admin/audit` | A | M01 | Audit log search |

## 3. Navigation

The `(app)` layout renders a header (product name, notifications count, user menu) and a primary nav. The nav lists only routes that exist: M00 ships Home and Profile; each milestone adds its own items with their role filter. On screens ≥ 1024 px the nav is a left sidebar; below that it is a `<details>` menu in the header. Items by role (a user with several roles sees the union, in this order):

| Item | Roles |
|---|---|
| Home | all |
| My courses (`/courses`) | student, faculty, hod, admin |
| Results | student |
| Reports | hod, admin |
| Administration | admin |
| Users (`/admin/users`) | support |
| Notifications | all |
| Profile | all |

**Course workspace tabs** (`TabNav` in `app/(app)/courses/[offeringId]/layout.tsx`, computed from access and the offering's category/components):

| Tab | Shown when |
|---|---|
| Overview | always |
| Content | always |
| Live | always |
| Assessments | always |
| Records | ugc and the course has `theory` or `practice` |
| Marks | ugc |
| Projects | the course has `project` |
| Outcomes | ugc and access is teach/oversee |
| People | access is teach/oversee |

The workspace layout reads `params` and the offering, so its header and tabs render inside their own `<Suspense>` (02 §5).

## 4. Design tokens and CSS classes — `app/globals.css`

Tokens go in Tailwind v4's `@theme` so utilities exist (`bg-primary`, `text-muted`, `border-border`). Brand colours are placeholders until CUTM provides its palette (Q-32).

```css
@import "tailwindcss";

@theme {
  --color-primary: #1d3557;
  --color-primary-hover: #16283f;
  --color-accent: #b7791f;
  --color-surface: #ffffff;
  --color-page: #f7f7f5;
  --color-ink: #18181b;
  --color-muted: #52525b;
  --color-border: #d4d4d8;
  --color-success: #15803d;
  --color-warning: #b45309;
  --color-danger: #b91c1c;
  --color-info: #1d4ed8;
}
```

Component classes, defined once with `@apply` in `@layer components` (verified to compile through the `@tailwindcss/turbopack` loader). Use these class names; do not re-create them with ad-hoc utility strings.

| Class | For |
|---|---|
| `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-sm` | Buttons and button-styled links |
| `.input` | `<input>`, `<select>`, `<textarea>` |
| `.form`, `.field`, `.field-label`, `.field-hint`, `.field-error`, `.form-error`, `.form-success` | Forms (`ActionForm`, `Field`) |
| `.page-header` | `<header>` with `<h1>`, optional description and actions |
| `.card` | Bordered surface block |
| `.badge`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`, `.badge-muted` | Statuses |
| `.table` | Tables (`DataTable` uses it) |
| `.skeleton` | Loading placeholders |
| `.empty` | Empty-state sentence |
| `.prose-lms` | Rendered rich text |

Status → badge tone mapping lives in one function, `statusTone(status)` in `lib/format.ts`.

## 5. Shared component inventory (closed list)

These are the **only** files allowed in `components/`. The entries below are pre-approved: each has two or more planned call sites (or is a client boundary), even if the second arrives in a later milestone. Adding a **new** entry requires two real call sites (or a client boundary) and a row here, in the same commit (04 §2).

| Component | File | Kind | Props (contract) | Used by | Milestone |
|---|---|---|---|---|---|
| `ActionForm`, `Field` | `action-form.tsx` | client | 04 §6.8 | every form | M00 |
| `DataTable` | `data-table.tsx` | server | `{ columns: { header: string; cell: (row: T) => ReactNode; className?: string }[]; rows: T[]; rowKey: (row: T) => string; total: number; page: number; pageSize: number; query: Record<string, string>; path: string; empty: string }` — renders `.table`, an empty sentence, and Previous/Next links that keep `query` | every list | M01 |
| `TabNav` | `tab-nav.tsx` | client (`usePathname`) | `{ tabs: { href: string; label: string }[] }` | course workspace, admin, reports | M01 |
| `ConfirmSubmit` | `confirm-submit.tsx` | client | `{ message: string; className?: string; children: ReactNode }` — a submit button that cancels unless `window.confirm(message)` | publish, lock, end session, delete | M01 |
| `RichTextEditor` | `rich-text-editor.tsx` | client | `{ name: string; initial?: RichTextDoc; placeholder?: string }` — Tiptap StarterKit, `immediatelyRender: false`, writes JSON to a hidden input `name` | plan, lesson description, item prompts, text answers, task description | M02 |
| `RichTextView` | `rich-text-view.tsx` | server | `{ doc: RichTextDoc }` — `generateHTML` from `@tiptap/html/server` with StarterKit into `.prose-lms` | everywhere rich text is shown | M02 |
| `FileUpload` | `file-upload.tsx` | client | `{ name: string; purpose: UploadPurpose; contextId: string; accept: string; maxBytes: number; multiple?: boolean }` — calls `createUpload`, PUTs with `XMLHttpRequest` (for progress), writes keys to hidden inputs `name[]` | lesson files, syllabus, submissions | M02 |
| `VideoPlayer` | `video-player.tsx` | client | `{ lessonId: string; src: string; lowSrc: string \| null; durationSec: number }` — native `<video controls>`; an "HD / Data saver" toggle when `lowSrc` exists (default Data saver below 768 px wide, choice kept in `localStorage`; switching keeps the playback position); collects played ranges, `sendBeacon` every 30 s and on `pagehide` | lesson page | M02 |
| `LiveRoom` | `live-room.tsx` | client | `{ sessionId: string; serverUrl: string; token: string }` — LiveKit `LiveKitRoom` + `VideoConference`; focus beacon every 60 s while visible | live session page | M03 |
| `AssessmentRunner` | `assessment-runner.tsx` | client | `{ attempt: AttemptDTO }` (no answer keys, no hidden cases) — timer, autosave per answer, submit, proctoring hooks, renders items by type | attempt page | M04, M05 |
| `CodeEditor` | `code-editor.tsx` | client | `{ name?: string; value: string; language: 'c' \| 'cpp' \| 'java'; readOnly?: boolean; onChange?: (v: string) => void }` | runner, builder (starter code) | M05 |
| `Sparkline` | `sparkline.tsx` | server | `{ values: number[]; max: number; label: string }` — inline SVG polyline, `role="img"` + `aria-label` | marks trend, engagement trend | M06 |
| `Meter` | `meter.tsx` | server | `{ value: number \| null; max: number; label: string }` — CSS bar with the number as text | attainment, progress, engagement | M06 |
| `CoPoMatrix` | `co-po-matrix.tsx` | server | `{ cos: { id: string; code: string }[]; outcomes: string[]; cells: Record<string, number>; mode: 'edit' \| 'levels' \| 'values' }` — `edit` renders `<select name="cell[]">` per cell for an `ActionForm` | course admin, outcomes report | M01, M09 |

Not components (use markup/CSS): page headers, badges, empty states, search/filter forms, cards, the kanban board (a server-rendered grid with per-card status forms), notification lists.

## 6. Page patterns

**List page** — `page.tsx` validates `searchParams` (Zod), calls one DAL list function, renders `.page-header` (title + primary action link), an optional GET filter `<form>`, and `DataTable`.

**Detail page** — validates `params`, calls DAL `get…` (which `notFound()`s on no access), renders sections. Secondary actions are small `ActionForm`s or `ConfirmSubmit` buttons.

**Create / edit page** — a route (`/new`, `/[id]/edit`) with one `ActionForm`. On success the action `redirect()`s to the detail page.

**Workspace** — `courses/[offeringId]/layout.tsx` renders the offering title and `TabNav` inside `<Suspense>`; each tab is its own page with its own `loading.tsx` when it has heavy data.

**Role-aware page** — one route serves several roles; the DAL returns a discriminated DTO (`{ view: 'student', … } | { view: 'teacher', … }`) and the page renders the matching section. Do not create parallel routes per role.

## 7. Content and formatting

- Sentence case for headings and buttons ("Publish results", not "Publish Results").
- Dates: `12 Oct 2026, 10:30 AM` in IST via `formatDateTime()`; relative times only for "due in 3 h" badges (`formatDue()`); both in `lib/format.ts`.
- Marks: `36 / 50`; percentages with up to 2 decimals and no trailing zeros (`74%`, `66.67%`).
- Empty states say what to do: "No lessons yet. Add the first lesson to Module 1."
- Error messages come from `AppError` messages (06 §1); never show stack traces or vendor text.

## 8. Accessibility and responsiveness

- Every input has a visible `<label>` (via `Field`). Errors are associated text, not colour alone.
- Keyboard: everything reachable and operable; visible focus outline (`.input`, `.btn` define it).
- Contrast: WCAG 2.1 AA for text and badges.
- `aria-live="polite"` for the attempt timer's minute updates and autosave status; `role="alert"` for form errors.
- Layout works from 360 px wide. Tables scroll horizontally inside their container on small screens; the attempt runner is single-column on phones.
- Low bandwidth (NFR-07): read pages are server-rendered HTML; uploads show progress and can be retried; videos stream from object storage/CDN with `preload="metadata"`.
