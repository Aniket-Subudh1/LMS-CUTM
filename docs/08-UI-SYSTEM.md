# 08 · UI system

Server-first, minimal JavaScript, mobile-first, readable on a slow connection. Students use phones and lab machines; faculty use laptops; admins use desktops.

## 1. Principles

The UI is built on **shadcn/ui** (Radix primitives styled with Tailwind v4), vendored into `components/ui/` at a pinned version. The bar is a professional, consistent product a first-time user understands without training.

1. **Server-first.** Pages are Server Components; interactivity lives in `components/ui/` primitives and the few app client components in §5. A page that only shows data ships no extra JavaScript of its own.
2. **One way to do each thing:** large record lists → `DataTable`; navigation and small lists (fewer than a page of items) → icon card grids; create/edit forms → `FormDialog` (an `ActionForm` + `Field` with shadcn inputs inside a shadcn `Dialog`); filters → `FilterForm`; destructive or one-click actions → `ConfirmSubmit` (shadcn `AlertDialog`); navigation inside the course workspace → `TabNav`; feedback → the dialog's success state, or an inline `Alert` in the form for errors (no toasts); dashboards → `Card` grids with shadcn charts (M06+).
3. **Not used:** toasts, carousels, drag-and-drop, infinite scroll, create/edit pages (`/new`, `/[id]/edit`) except the large editors named in 04 §1. `Sheet` is used only by the mobile sidebar; `AlertDialog` only for confirmations; `Dialog` only through `FormDialog`.
4. **Every page has four states designed:** loading (`loading.tsx` with `Skeleton`s shaped like the page), empty (shadcn `Empty` with a sentence saying what to do next), error (`error.tsx`), not found (`not-found.tsx`).
5. **Icons support words.** Icons (Phosphor, duotone weight; regular in the sidebar) sit beside a text label; icon-only buttons are allowed only with an `aria-label` or `sr-only` text (the sidebar trigger, row action menus, collapsed-sidebar items with tooltips).
6. **No double submits, no silent waits.** Every submit button disables and shows a spinner while its action runs, and the form's fields are disabled with it. A confirm dialog stays open with a spinner until its action settles. A sidebar or card link shows a spinner while its navigation is pending (`LinkSpinner`); a filter's button does too (`FilterForm`).
7. **Cards lift; they do not get one-sided borders.** A card is `rounded-xl bg-card ring-1 ring-border shadow-card`. A clickable card adds a hover that raises it slightly, deepens the shadow, tints the ring with the primary colour and fills its icon chip. No `border-l`/`border-t` accent stripes or inset side shadows anywhere, including the active sidebar item.
8. **Explain as you go.** Every card has a title and a one-line description of what it is for; every form field has a label and, where a rule applies, a hint; every error says what to do next.

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
| `/admin` | A | M01 | Academic structure: cards for departments, programmes and terms, each with its count (`getStructureCounts()`) |
| `/admin/departments`, `/admin/programs`, `/admin/programs/[id]` | A | M01 | Structure, POs/PSOs, batches |
| `/admin/terms` | A | M01 | Academic calendar (terms) |
| `/admin/courses`, `/admin/courses/[id]` | A | M01 | Catalog ("New course" dialog), components, COs, CO-PO-PSO matrix, syllabus |
| `/admin/schemes`, `/admin/schemes/[componentKey]` | A | M01 | Evaluation schemes and versions |
| `/admin/offerings` | A | M01 | Offerings; "New offering" and "Change faculty" dialogs |
| `/admin/users`, `/admin/users/[id]` | A P | M01 | Users; "New user" and "Import CSV" dialogs (admin). P may only view and send a reset link |
| `/admin/settings`, `/admin/settings/[key]` | A | M02 | Settings registry (06 §7) |
| `/admin/exams` | A | M08 | End-sem import, CE export, locks, grade sheets |
| `/admin/integrations` | A | M07, M08 | Sync runs, failed jobs, GitHub App status |
| `/admin/audit` | A | M01 | Audit log search |

## 3. Navigation

The `(app)` layout follows the reference dashboard Aniket supplied on 13 Oct 2026: a white sidebar and a white sticky top bar around a grey content area whose top-left corner is rounded. The sidebar header is the university lockup (`UniversityLogo`) beside the name “LMS”. The top bar holds the sidebar trigger and the breadcrumb on the left, and today's date (IST) and the user chip (initials avatar, name, email) on the right; the chip opens a menu with Profile and Sign out. The reference's search box, theme toggle and bell are left out: there is no search feature, the theme is light only (A-23), and notifications arrive in M02. On screens ≥ 768 px the sidebar is docked and collapses to icons (tooltips name each item); below that it opens as a `Sheet`.

The nav lists only routes that exist, in groups; each milestone adds its own items with their role filter. A group with no visible item is not shown. A group's label (“Menu”, “Administration”) sits above its items; each item is a grey pill with a Phosphor icon and its label, and the current item is a solid primary pill. The Account group has no label: it sits at the foot of the sidebar as plain rows, followed by a Sign out button. The most specific matching `href` (or listed prefix) is current; the breadcrumb prints that item (and the sub-item under Structure), without the group. Items by role (a user with several roles sees the union, in this order):

| Group | Item | Roles |
|---|---|---|
| Menu | Dashboard (`/home`) | all |
| Menu | Notifications (M02) | all |
| Menu | My courses (`/courses`) | student, faculty, hod, admin |
| Menu | Results (M08) | student |
| Menu | Reports (M06) | hod, admin |
| Administration | Structure (`/admin`; also owns departments, programmes, terms) with sub-items Departments, Programmes, Terms | admin |
| Administration | Courses, Schemes, Offerings, Audit log | admin |
| Administration | Users (`/admin/users`) | admin, support |
| Account (foot of the sidebar) | Profile, then Sign out | all |

The admin area has no `TabNav`: the sidebar is its navigation.

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

shadcn's token set, defined once in `:root` and mapped to Tailwind colours with `@theme inline` (so `bg-primary`, `text-muted-foreground`, `bg-sidebar`, `border-border` exist). The palette is blue (Aniket's decision of 13 Oct 2026, which replaces the crimson sampled from the lockup for Q-32): primary `oklch(0.52 0.22 263)` (`#1c59e4`, 5.8 : 1 on white), wordmark charcoal foreground, a cool grey page background `oklch(0.967 0.004 264)` with white cards so cards lift off the page, `--violet` `oklch(0.55 0.22 292)` as the second stop of the Home hero's gradient button, and flame gold `--gold` `oklch(0.613 0.108 79.8)` for small accents (never as a border stripe). Extra tokens beyond shadcn's: `--success`, `--warning`, `--gold`, `--violet`, and two elevation shadows, `--shadow-card` (resting) and `--shadow-elevated` (hover, dialogs), exposed as `shadow-card` / `shadow-elevated`. Radius is `0.75rem`. No dark theme (out of scope); `@custom-variant dark` is declared only so shadcn's `dark:` classes stay inert.

Motion: `tw-animate-css` enter animations plus three keyframes in `globals.css` — `success-pop` (the dialog's success check), `success-draw` (its stroke), `aurora` (the slow drift of the sign-in gradient). All motion is behind `motion-safe:`.

The product mark is the full lockup — emblem, “Centurion”, “UNIVERSITY”, and “Shaping Lives… Empowering Communities…” — via `UniversityLogo`, in the sidebar header, on the sign-in pages and on the 404 page. Do not crop the words off the seal. Pages use `public/brand/logo.png` (a transparent render of the same lockup) because the official SVG is a 2 MB embedded PNG. On the blue sign-in panel the lockup sits on a white chip. Layouts are fully fluid (no max-width on the shell); card groups use `auto-fit` grids.

Rules:
- Use shadcn components and token utilities (`bg-card`, `text-muted-foreground`); never hard-code a hex colour in a component.
- Typography: Inter for everything (`next/font/google`, self-hosted at build); no serif. Page titles via `PageHeader`; card titles via `CardTitle`. Numbers in stat tiles use `tabular-nums`.
- Status → `Badge` variant mapping lives in one function, `statusTone(status)` in `lib/format.ts` (added with its first caller, M01); role names in `ROLE_LABEL` there (M00).
- Rendered rich text uses one class, `.prose-lms`, defined in `globals.css` with `RichTextView` (M02).

## 5. Components

### 5.1 `components/ui/` — vendored shadcn/ui primitives

Source: shadcn/ui tag **`shadcn@4.21.4`**, style `new-york-v4` (`components.json`). The registry host may be blocked in some networks; the same files are at `https://raw.githubusercontent.com/shadcn-ui/ui/shadcn@4.21.4/apps/v4/registry/new-york-v4/ui/<name>.tsx` — copy with imports rewritten (`@/registry/new-york-v4/ui/` → `@/components/ui/`, `"cn"` → `@/lib/cn`, hooks → `@/hooks/`) and run `npm run format`.

- **Add a primitive only in the commit that first uses it** (deletion test). Never add one "for later".
- Do not restyle primitives per page; extend with `className` at the call site. Edit a vendored file only to fix a lint/type error, and mark the edit with a `Local change from shadcn 4.21.4` comment.
- In M00: `alert`, `avatar`, `badge`, `button`, `card`, `dropdown-menu`, `input`, `label`, `separator`, `sheet`, `sidebar`, `skeleton`, `tooltip` (+ `hooks/use-mobile.ts`, `lib/cn.ts`). Local changes: `sidebar` skeleton width fixed (purity lint), `use-mobile` rewritten with `useSyncExternalStore` (effect-setState lint).
- Planned first uses: `table`, `tabs`, `alert-dialog`, `native-select` (in place of Radix `select`: a real `<select>` posts with the form and needs no client code), `textarea`, `empty`, `pagination` (M01); `dialog` (UI redesign, used only by `FormDialog`); `progress`, `chart` (M06, adds `recharts`).
- Icons: shadcn ships lucide imports. Every vendored file that used one (`dialog`, `dropdown-menu`, `native-select`, `pagination`, `sheet`, `sidebar`) imports the Phosphor equivalent instead, marked `Local change from shadcn 4.21.4: Phosphor icons`. Do the same when vendoring a new primitive.

Shared surface classes are Tailwind `@utility` rules in `globals.css`, not components: `surface` (a resting card: white, `ring-1 ring-border`, `shadow-card`, `rounded-xl`), `surface-interactive` (adds the hover lift, ring tint and the filled icon chip on hover), and `icon-chip` (a rounded square holding a duotone icon in the primary tint; inside `surface-interactive` it fills on hover).

### 5.2 App components (closed list)

These are the **only** other files allowed in `components/`. Each has two or more call sites (or is a required client boundary). Adding an entry requires two real call sites and a row here, in the same commit (04 §2).

| Component | File | Kind | Props (contract) | Used by | Milestone |
|---|---|---|---|---|---|
| `ActionForm`, `Field`, `FieldErrors` | `action-form.tsx` | client | 04 §6.8, plus: `replaceOnSuccess?: boolean` (on success the fields are replaced by an animated check and `successMessage`); `onSuccess?: (data: unknown) => void` and `onPendingChange?: (pending: boolean) => void` (for a client parent such as `FormDialog`); `secondary?: ReactNode` (a control shown before the submit button, such as Cancel); `submitSize?: 'default' \| 'sm'` (compact one-click actions in cards and table rows). The children sit in a `<fieldset disabled>` while the action runs. `FieldErrors` is `{ name: string }` and prints that field's errors for a group of controls (a grid of rows) where `Field`'s single `<label>` does not fit | every form | M00 (`FieldErrors` M01; additions UI redesign) |
| `FormDialog` | `form-dialog.tsx` | client (shadcn `Dialog`, `useRouter`, `useSearchParams`) | `{ trigger: ReactNode; title: string; description?: string; icon?: ReactNode; size?: 'default' \| 'wide' \| 'full'; openParam?: string; preface?: ReactNode; action; submitLabel: string; successMessage: string; submitVariant?: 'default' \| 'destructive'; children?: ReactNode }` — `trigger` is the element that opens it (`DialogTrigger asChild`). The form inside is an `ActionForm` with `replaceOnSuccess`. While the action runs, Esc, an outside click and the close button do nothing. On success the header and fields give way to the success state; after 1.6 s the dialog closes and, if the action returned `{ next }` (06 §1), navigates there. Each open starts with a fresh form. `preface` renders above the form and outside it (the GET programme step of New offering). `openParam` opens it on load when the URL has `?new=<openParam>` (Home quick actions) — also when a fresh navigation returns to a page Next kept mounted (the state resets on a new `useRouter().bfcacheId`; back/forward restores it as it was); closing removes the parameter | every create/edit form | UI redesign |
| `FilterForm` | `filter-form.tsx` | client (`next/form`, `useFormStatus`) | `{ action: string; submitLabel?: string; plain?: boolean; children: ReactNode }` — a toolbar card holding GET filter fields (the children) and a submit button that shows a spinner while the filtered page loads; `plain` drops the card for a step inside a dialog | courses, admin courses, offerings (and the New offering programme step), users, audit | UI redesign |
| `Section`, `Fact` | `section.tsx` | server | `Section({ icon: ReactNode; title: string; description: string; action?: ReactNode; children })` — a detail-page section: icon chip, title, one-line description and an optional action (a `FormDialog` trigger) above its content. `Fact({ label, children })` — one label/value pair in a `<dl className="surface grid …">` facts strip | programme, course, user, profile, course people | UI redesign |
| `LinkSpinner` | `link-spinner.tsx` | client (`useLinkStatus`) | `{ className?: string }` — a fixed-size spinner, invisible until the enclosing `<Link>`'s navigation is pending; placed inside a `Link` | sidebar items, Home tiles, hero and offerings row, `OfferingCard`, `TabNav`, the admin landing and scheme cards | UI redesign |
| `OfferingCard` | `offering-card.tsx` | server | `{ offering: MyOfferingRow; featured?: boolean }` — a course-offering card linking to its workspace: status badge and term, title, and the first faculty member beside an initials avatar (“+n” for more). `featured` makes it the dark card with an “Open” pill, as the first card of Home's offerings row | Home, `/courses` | UI redesign |
| `PasswordInput` | `password-input.tsx` | client | the `Input` props except `type` — a password `Input` with a show/hide toggle button (`aria-label`, `aria-pressed`) | sign in, set password, change password | UI redesign |
| `PageHeader` | `page-header.tsx` | server | `{ title: string; description?: string; icon?: ReactNode; actions?: ReactNode }` — `icon` shows in an `icon-chip` before the title; `actions` (usually `FormDialog` triggers) align to the right and wrap below on phones | every page in the shell | M00 (`icon`, `actions` UI redesign) |
| `UniversityLogo` | `university-logo.tsx` | server | `{ className?: string; sizes: string; priority?: boolean }` — the official lockup, words included | auth layout, auth stage, app sidebar, 404 | M00 |
| `AuthStage` | `auth-stage.tsx` | client (`gsap`) | none — the blue brand panel on wide screens: the lockup on a white chip, a headline, three feature rows and the drifting lotus | `(auth)` layout | M00 |
| `AppNav`, `AppBreadcrumb` | `app-nav.tsx` | client (`usePathname`, `useSidebar`) | `AppNav({ roles })` — the layout reads the viewer and passes their roles; the Account group renders at the foot with a Sign out form (`logout`, a spinner while it runs). `AppBreadcrumb` takes none and prints the current item (and the sub-item under Structure). Each is wrapped in `<Suspense>` because `usePathname` is request data on a dynamic route. The `NAV` groups live in the file with a `roles` filter per item (the union for several roles; the longest matching `href` or prefix is current) | `(app)` layout | M00 (groups UI redesign) |
| `DataTable` | `data-table.tsx` | server | `{ columns: { header: string; cell: (row: T) => ReactNode; className?: string }[]; rows: T[]; rowKey: (row: T) => string; total: number; page: number; pageSize: number; query: Record<string, string>; path: string; empty: string }` — shadcn `Table` in a `surface` card with a muted header row and a row hover tint, an `Empty` state, and a footer with the range shown ("Showing 1–25 of 340") and `Pagination` links that keep `query`. Row actions are small icon buttons in the last column (`FormDialog` triggers, `ConfirmSubmit` forms). The file also exports `PageNav({ shown, total, page, pageSize, query, path, className? })` (that footer, for paginated card grids) and `EmptyState({ text, icon? })` (the empty card) | every large list; `PageNav`/`EmptyState` under the departments and terms grids | M01 |
| `TabNav` | `tab-nav.tsx` | client (`usePathname`) | `{ tabs: { href: string; label: string; icon?: ReactNode; prefixes?: string[] }[] }` — link tabs styled as shadcn `Tabs` in a card-coloured pill bar; the current tab is the tinted pill (as in the sidebar), each tab shows a `LinkSpinner` while it loads; a tab is current for its `href`, anything below it and any `prefixes`, longest match wins | course workspace, reports | M01 |
| `ConfirmSubmit` | `confirm-submit.tsx` | client | `{ title: string; message: string; confirmLabel: string; variant?: 'default' \| 'destructive'; pending: boolean; children: ReactNode }` — shadcn `AlertDialog`; `children` is the button that opens it and the confirm button submits the enclosing form (`form.requestSubmit()`). The dialog stays open, its buttons disabled and the confirm button spinning, until the action settles (`pending` from `ActionForm`). Used through `ActionForm`'s `confirm={{ title, message }}` prop, which makes the form's own submit button the trigger | offering status, delete a CO, account access actions, sign out everywhere, publish, lock, end session | M01 |
| `RichTextEditor` | `rich-text-editor.tsx` | client | `{ name: string; initial?: RichTextDoc; placeholder?: string }` — Tiptap StarterKit, `immediatelyRender: false`, writes JSON to a hidden input `name` | plan, lesson description, item prompts, text answers, task description | M02 |
| `RichTextView` | `rich-text-view.tsx` | server | `{ doc: RichTextDoc }` — `generateHTML` from `@tiptap/html/server` with StarterKit into `.prose-lms` | everywhere rich text is shown | M02 |
| `FileUpload` | `file-upload.tsx` | client | `{ name: string; purpose: UploadPurpose; contextId: string; accept: string; maxBytes: number; multiple?: boolean }` — calls `createUpload`, PUTs with `XMLHttpRequest` (for progress, shadcn `Progress`), writes keys to hidden inputs `name[]` | lesson files, syllabus, submissions | M02 |
| `VideoPlayer` | `video-player.tsx` | client | `{ lessonId: string; src: string; lowSrc: string \| null; durationSec: number }` — native `<video controls>`; an "HD / Data saver" toggle when `lowSrc` exists (default Data saver below 768 px wide, choice kept in `localStorage`; switching keeps the playback position); collects played ranges, `sendBeacon` every 30 s and on `pagehide` | lesson page | M02 |
| `LiveRoom` | `live-room.tsx` | client | `{ sessionId: string; serverUrl: string; token: string }` — LiveKit `LiveKitRoom` + `VideoConference`; focus beacon every 60 s while visible | live session page | M03 |
| `AssessmentRunner` | `assessment-runner.tsx` | client | `{ attempt: AttemptDTO }` (no answer keys, no hidden cases) — timer, autosave per answer, submit, proctoring hooks, renders items by type | attempt page | M04, M05 |
| `CodeEditor` | `code-editor.tsx` | client | `{ name?: string; value: string; language: 'c' \| 'cpp' \| 'java'; readOnly?: boolean; onChange?: (v: string) => void }` | runner, builder (starter code) | M05 |
| `TrendChart` | `trend-chart.tsx` | client (shadcn `chart`) | `{ points: { label: string; value: number }[]; max: number; label: string }` — area/line chart with an accessible summary sentence | marks trend, engagement trend | M06 |
| `CoPoMatrix` | `co-po-matrix.tsx` | server | `{ cos: { id: string; code: string }[]; outcomes: string[]; cells: Record<string, number>; mode: 'edit' \| 'levels' \| 'values' }` — `edit` renders a `<select name="cell[]">` per cell for an `ActionForm`; `levels` shows the saved level as a tinted chip (darker for a higher level) or “–”; `values` is added in M09 (M01 ships `edit` and `levels`) | course admin, outcomes report | M01, M09 |

Bars and percentages (attainment, progress, engagement) use the shadcn `Progress` primitive with the number as text beside it; there is no separate `Meter` component.

Not components (use shadcn primitives + markup + the `surface` utilities): stat tiles, the Home hero and activity bars, badges, empty states (`Empty`), the kanban board (a server-rendered grid of cards with per-card status forms), notification lists.

## 6. Page patterns

**List page** — `page.tsx` validates `searchParams` (Zod), calls one DAL list function, renders `PageHeader` (icon, title, description; the "New …" `FormDialog` triggers as `actions`), an optional `FilterForm`, and either `DataTable` (large lists) or a card grid (small lists such as departments, terms, schemes, the admin landing, my courses).

**Detail page** — validates `params`, calls DAL `get…` (which `notFound()`s on no access), renders sections as `surface` cards with an icon chip, a title and a one-line description. Each section shows its data read-only; its "Edit …" button opens a `FormDialog`. Destructive or one-click actions are `ConfirmSubmit` buttons.

**Create / edit** — a `FormDialog` on the list or detail page. Fields for an edit are pre-filled from the row or record already on the page. On success the action calls `refresh()` (the page behind updates while the success state shows); a create that leads somewhere returns `{ next }` and the dialog navigates there after closing.

**Workspace** — `courses/[offeringId]/layout.tsx` renders a header card (icon chip, offering title, status badge, term and faculty) and `TabNav` inside `<Suspense>`; each tab is its own page with its own `loading.tsx` when it has heavy data.

**Home** — the role-aware dashboard, laid out after the reference dashboard of 13 Oct 2026. “Hello, <first name>”, then two columns from 1280 px (one below). The left column holds the hero, a primary-gradient card featuring the viewer's newest offering (title, term, faculty, status) with a white “Open course” button and a violet-to-blue button for the next step: New offering for admins (it opens that dialog through `?new=`), the offering's Students for faculty and HoDs, All my courses for students, Find a user for support, who has no offerings. For admins it also holds the latest audit entries, each with a coloured entity tile. The right column holds stat tiles from `getHomeSummary()` that link to their list (admin: users and how many are yet to sign in, active offerings, courses, programmes; faculty and HoD: offerings and active enrolments; student: courses); for admins, the audit entries of the last seven IST days as server-rendered bars (seven bars need no Recharts; today's bar is striped and labelled) beside the three people with the most entries that week; and the viewer's next three offerings as `OfferingCard`s, the first `featured`. Only data that exists is shown, with no placeholder panels; each milestone adds its own section (continue learning M02, live now M03, due soon and to grade M04, results M08) when it ships. The earlier quick-actions grid, account-security card and role chips are gone: the same links are in the sidebar, the user menu and each list page's own buttons.

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
