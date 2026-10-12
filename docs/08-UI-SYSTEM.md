# 08 · UI system

Server-first, minimal JavaScript, mobile-first, readable on a slow connection. Students use phones and lab machines; faculty use laptops; admins use desktops.

## 1. Principles

The UI is built on **shadcn/ui** (Radix primitives styled with Tailwind v4), vendored into `components/ui/` at a pinned version. The bar is a professional, consistent product a first-time user understands without training.

1. **Server-first.** Pages are Server Components; interactivity lives in `components/ui/` primitives and the few app client components in §5. A page that only shows data ships no extra JavaScript of its own.
2. **One way to do each thing:** lists → `DataTable`; forms → `ActionForm` + `Field` with shadcn inputs; filters → GET `<form>`; destructive actions → `ConfirmSubmit` (shadcn `AlertDialog`); navigation inside an area → `TabNav`; feedback → inline `Alert` in the form (no toasts); dashboards → `Card` grids with shadcn charts (M06+).
3. **Not used:** toasts, carousels, drag-and-drop, infinite scroll, modals for creating or editing records (those are routes). `Sheet` is used only by the mobile sidebar; `AlertDialog` only for confirmations. The profile page is the exception: changing the password and signing out everywhere open a native `<dialog>` on that page.
4. **Every page has four states designed:** loading (`loading.tsx` with `Skeleton`), empty (shadcn `Empty` with a sentence saying what to do next), error (`error.tsx`), not found (`not-found.tsx`).
5. **Icons support words.** Icons (lucide-react) sit beside a text label; icon-only buttons are allowed only with an `aria-label` or `sr-only` text (the sidebar trigger, collapsed-sidebar items with tooltips).
6. **Explain as you go.** Every card has a title and a one-line description of what it is for; every form field has a label and, where a rule applies, a hint; every error says what to do next.

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

## 4. Design tokens — `app/globals.css`

shadcn's token set, defined once in `:root` and mapped to Tailwind colours with `@theme inline` (so `bg-primary`, `text-muted-foreground`, `bg-sidebar`, `border-border` exist). The palette is sampled from the official lockup at `public/brand/logo.svg` (Q-32): seal crimson primary `oklch(0.566 0.207 26.1)`, wordmark charcoal foreground, paper background `oklch(0.965 0.007 80.7)`, flame gold `--gold` `oklch(0.613 0.108 79.8)` for hairlines (the brightest petal gold disappears on the paper). Extra tokens beyond shadcn's: `--success`, `--warning`, `--gold`. No dark theme (out of scope); `@custom-variant dark` is declared only so shadcn's `dark:` classes stay inert.

The product mark is the full lockup — emblem, “Centurion”, “UNIVERSITY”, and “Shaping Lives… Empowering Communities…” — via `UniversityLogo`. Do not crop the words off the seal. Pages use `public/brand/logo.png` (a transparent render of the same lockup) because the official SVG is a 2 MB embedded PNG. The sidebar is light so that wordmark stays readable; the sidebar logo is 72 px wide. Layouts are fully fluid (no max-width on the shell); card groups use `auto-fit` grids.

Rules:
- Use shadcn components and token utilities (`bg-card`, `text-muted-foreground`); never hard-code a hex colour in a component.
- Typography: Inter for everything (`next/font/google`, self-hosted at build); no serif. Page titles via `PageHeader`; card titles via `CardTitle`.
- Status → `Badge` variant mapping lives in one function, `statusTone(status)` in `lib/format.ts` (added with its first caller, M01); role names in `ROLE_LABEL` there (M00).
- Rendered rich text uses one class, `.prose-lms`, defined in `globals.css` with `RichTextView` (M02).

## 5. Components

### 5.1 `components/ui/` — vendored shadcn/ui primitives

Source: shadcn/ui tag **`shadcn@4.21.4`**, style `new-york-v4` (`components.json`). The registry host may be blocked in some networks; the same files are at `https://raw.githubusercontent.com/shadcn-ui/ui/shadcn@4.21.4/apps/v4/registry/new-york-v4/ui/<name>.tsx` — copy with imports rewritten (`@/registry/new-york-v4/ui/` → `@/components/ui/`, `"cn"` → `@/lib/cn`, hooks → `@/hooks/`) and run `npm run format`.

- **Add a primitive only in the commit that first uses it** (deletion test). Never add one "for later".
- Do not restyle primitives per page; extend with `className` at the call site. Edit a vendored file only to fix a lint/type error, and mark the edit with a `Local change from shadcn 4.21.4` comment.
- In M00: `alert`, `avatar`, `badge`, `button`, `card`, `dropdown-menu`, `input`, `label`, `separator`, `sheet`, `sidebar`, `skeleton`, `tooltip` (+ `hooks/use-mobile.ts`, `lib/cn.ts`). Local changes: `sidebar` skeleton width fixed (purity lint), `use-mobile` rewritten with `useSyncExternalStore` (effect-setState lint).
- Planned first uses: `table`, `tabs`, `alert-dialog`, `select`, `textarea`, `empty`, `pagination` (M01); `progress`, `chart` (M06, adds `recharts`).

### 5.2 App components (closed list)

These are the **only** other files allowed in `components/`. Each has two or more call sites (or is a required client boundary). Adding an entry requires two real call sites and a row here, in the same commit (04 §2).

| Component | File | Kind | Props (contract) | Used by | Milestone |
|---|---|---|---|---|---|
| `ActionForm`, `Field` | `action-form.tsx` | client | 04 §6.8 | every form | M00 |
| `PageHeader` | `page-header.tsx` | server | `{ title: string; description?: string }` | every page in the shell | M00 |
| `UniversityLogo` | `university-logo.tsx` | server | `{ className?: string; sizes: string; priority?: boolean }` — the official lockup, words included | auth layout, auth stage, app sidebar, 404 | M00 |
| `AuthStage` | `auth-stage.tsx` | client (`gsap`) | none | `(auth)` layout | M00 |
| `AppNav`, `AppBreadcrumb` | `app-nav.tsx` | client (`usePathname`, `useSidebar`) | none; the `NAV` list lives in the file (items gain `roles` from M01) | `(app)` layout | M00 |
| `DataTable` | `data-table.tsx` | server | `{ columns: { header: string; cell: (row: T) => ReactNode; className?: string }[]; rows: T[]; rowKey: (row: T) => string; total: number; page: number; pageSize: number; query: Record<string, string>; path: string; empty: string }` — shadcn `Table` in a bordered card, an `Empty` state, and `Pagination` links that keep `query` | every list | M01 |
| `TabNav` | `tab-nav.tsx` | client (`usePathname`) | `{ tabs: { href: string; label: string }[] }` — link tabs styled as shadcn `Tabs` | course workspace, admin, reports | M01 |
| `ConfirmSubmit` | `confirm-submit.tsx` | client | `{ title: string; message: string; confirmLabel: string; variant?: 'default' \| 'destructive'; children: ReactNode }` — shadcn `AlertDialog`; the confirm button submits the enclosing form (`form.requestSubmit()`) | publish, lock, end session, delete | M01 |
| `RichTextEditor` | `rich-text-editor.tsx` | client | `{ name: string; initial?: RichTextDoc; placeholder?: string }` — Tiptap StarterKit, `immediatelyRender: false`, writes JSON to a hidden input `name` | plan, lesson description, item prompts, text answers, task description | M02 |
| `RichTextView` | `rich-text-view.tsx` | server | `{ doc: RichTextDoc }` — `generateHTML` from `@tiptap/html/server` with StarterKit into `.prose-lms` | everywhere rich text is shown | M02 |
| `FileUpload` | `file-upload.tsx` | client | `{ name: string; purpose: UploadPurpose; contextId: string; accept: string; maxBytes: number; multiple?: boolean }` — calls `createUpload`, PUTs with `XMLHttpRequest` (for progress, shadcn `Progress`), writes keys to hidden inputs `name[]` | lesson files, syllabus, submissions | M02 |
| `VideoPlayer` | `video-player.tsx` | client | `{ lessonId: string; src: string; lowSrc: string \| null; durationSec: number }` — native `<video controls>`; an "HD / Data saver" toggle when `lowSrc` exists (default Data saver below 768 px wide, choice kept in `localStorage`; switching keeps the playback position); collects played ranges, `sendBeacon` every 30 s and on `pagehide` | lesson page | M02 |
| `LiveRoom` | `live-room.tsx` | client | `{ sessionId: string; serverUrl: string; token: string }` — LiveKit `LiveKitRoom` + `VideoConference`; focus beacon every 60 s while visible | live session page | M03 |
| `AssessmentRunner` | `assessment-runner.tsx` | client | `{ attempt: AttemptDTO }` (no answer keys, no hidden cases) — timer, autosave per answer, submit, proctoring hooks, renders items by type | attempt page | M04, M05 |
| `CodeEditor` | `code-editor.tsx` | client | `{ name?: string; value: string; language: 'c' \| 'cpp' \| 'java'; readOnly?: boolean; onChange?: (v: string) => void }` | runner, builder (starter code) | M05 |
| `TrendChart` | `trend-chart.tsx` | client (shadcn `chart`) | `{ points: { label: string; value: number }[]; max: number; label: string }` — area/line chart with an accessible summary sentence | marks trend, engagement trend | M06 |
| `CoPoMatrix` | `co-po-matrix.tsx` | server | `{ cos: { id: string; code: string }[]; outcomes: string[]; cells: Record<string, number>; mode: 'edit' \| 'levels' \| 'values' }` — `edit` renders a `<select name="cell[]">` per cell for an `ActionForm` | course admin, outcomes report | M01, M09 |

Bars and percentages (attainment, progress, engagement) use the shadcn `Progress` primitive with the number as text beside it; there is no separate `Meter` component.

Not components (use shadcn primitives + markup): page sections (`Card`), badges, empty states (`Empty`), search/filter forms, the kanban board (a server-rendered grid of `Card`s with per-card status forms), notification lists.

## 6. Page patterns

**List page** — `page.tsx` validates `searchParams` (Zod), calls one DAL list function, renders `PageHeader` (title + description; the primary action `Button` beside it), an optional GET filter `<form>`, and `DataTable`.

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
- Keyboard: everything reachable and operable; visible focus rings come from the shadcn primitives (`focus-visible:ring`); Radix menus and dialogs handle focus and `Esc`.
- Contrast: WCAG 2.1 AA for text and badges.
- `aria-live="polite"` for the attempt timer's minute updates and autosave status; `role="alert"` for form errors.
- Layout works from 360 px wide (no horizontal page scroll — e2e asserts it). Tables scroll horizontally inside their container on small screens; the attempt runner is single-column on phones.
- Low bandwidth (NFR-07): read pages are server-rendered HTML; uploads show progress and can be retried; videos stream from object storage/CDN with `preload="metadata"`.
