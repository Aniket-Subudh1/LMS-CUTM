# 08 · UI system

Server-first, minimal JavaScript, mobile-first, readable on a slow connection. Students use phones and lab machines; faculty use laptops; admins use desktops.

## 1. Principles

The UI is built on **shadcn/ui** (Radix primitives styled with Tailwind v4), vendored into `components/ui/` at a pinned version. The bar is a professional, consistent product a first-time user understands without training.

1. **Server-first.** Pages are Server Components; interactivity lives in `components/ui/` primitives and the few app client components in §5. A page that only shows data ships no extra JavaScript of its own.
2. **One way to do each thing:** large record lists → `DataTable`; navigation and small lists (fewer than a page of items) → icon card grids; create/edit forms → `FormDialog` (an `ActionForm` + `Field` with shadcn inputs inside a shadcn `Dialog`); filters → `FilterForm`; destructive or one-click actions → `ConfirmSubmit` (shadcn `AlertDialog`); navigation inside the course workspace → `TabNav`; feedback → the dialog's success state, or an inline `Alert` in the form for errors (no toasts); dashboards → `Card` grids with shadcn charts (M06+).
3. **Not used:** toasts, carousels, drag-and-drop, infinite scroll, create/edit pages (`/new`, `/[id]/edit`) except the large editors named in 04 §1. `Sheet` is used only by the mobile sidebar; `AlertDialog` only for confirmations; `Dialog` only through `FormDialog`.
4. **Every page has four states designed:** loading (`loading.tsx` with `Skeleton`s shaped like the page), empty (shadcn `Empty` with a sentence saying what to do next), error (`error.tsx`), not found (`not-found.tsx`).
5. **Icons support words.** Icons (Phosphor, duotone weight; regular in the sidebar, on the coloured Home tiles and on the sign-in panel). On a solid fill the duotone layer (`path[opacity]`, a 20% copy of the icon) would be white and read as a smudge, so it is hidden there: every button, whatever its variant (in `button.tsx`; on a white button the layer reads as a grey smudge), the current tab (`TabNav`) and a hovered icon chip (`surface-interactive`) sit beside a text label; icon-only buttons are allowed only with an `aria-label` or `sr-only` text (the sidebar trigger, row action menus, collapsed-sidebar items with tooltips).
6. **No double submits, no silent waits.** Every submit button disables and shows a spinner while its action runs, and the form's fields are disabled with it. A confirm dialog stays open with a spinner until its action settles. A sidebar or card link shows a spinner while its navigation is pending (`LinkSpinner`); a filter's button does too (`FilterForm`).
7. **Cards are flat; they do not get shadows or one-sided borders.** A card is `rounded-2xl bg-card ring-1 ring-border/80` on the grey page (the reference designs of 13 Oct 2026). Boxes inside a card (CO cards, facts strips, list items, table rows) are the same white with the ring, so they read as outlined. A clickable card tints its ring with the primary colour and fills its icon chip on hover. Buttons, inputs and selects carry no shadow, and nothing uses violet. No `border-l`/`border-t` accent stripes or inset side shadows anywhere, including the active sidebar item. Dialogs keep `shadow-elevated` to stand off the overlay.
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
| `/courses/[offeringId]` | S F H A | M01, M02, M01b | Overview: the course (credits, coordinator, objectives), its modules and books, COs with Bloom levels and the mapping with the programme's outcome titles, the published plan and calendar; teachers get the setup checklist whose first step is the catalogue course's readiness |
| `/catalog` | F H A | M01b | Course catalogue: search by code or title; filters for programme, basket, type, status, "Needs review" and "Courses I coordinate"; A: "New course" dialog and "Import courses" |
| `/catalog/[id]` | F H A | M01b | A catalogue course: credits, review notes, the "Course readiness" checklist, one editor per step (objectives, outcomes with Bloom chips, the CO–PO grid, syllabus, books, session plan) for its coordinator and A; A: details, coordinator, "Replace with courseware content". Read-only for other staff |
| `/courses/[offeringId]/plan` | F A | M02 | Course plan tab: three numbered steps (write the plan, schedule the sessions, publish) |
| `/courses/[offeringId]/content` | S F H A | M02 | Modules and lessons; F adds (Add module, Add lesson dialogs), orders and publishes; S sees progress and “Up next” |
| `/courses/[offeringId]/content/[lessonId]` | S F H A | M02 | View a lesson (video player, document, link) beside the course outline, with Previous / Next; F edits (dialog), publishes, deletes a draft |
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
| `/admin/departments`, `/admin/programs`, `/admin/programs/[id]` | A | M01, M01b | Structure; a programme's department, baskets, curriculum (add and remove courses), outcome titles and batches |
| `/admin/terms` | A | M01 | Academic calendar (terms) |
| `/admin/offerings` | A | M01, M01b | Offerings; "New offering" (batch first, then a course of its programme's curriculum, the term and the sections, one offering each) and "Change faculty" dialogs |
| `/admin/imports`, `/admin/imports/[runId]` | A | M01b | Imports: the course-list upload with its columns and recent uploads; courseware runs (only new pages, all again, one page), their progress and the pages that failed. M07/M08 add their syncs here (replacing `/admin/integrations`) |
| `/admin/users`, `/admin/users/[id]` | A P | M01 | Users; "New user" and "Import CSV" dialogs (admin). P may only view and send a reset link |
| `/admin/settings`, `/admin/settings/[key]` | A | M02, M01b | Settings registry (06 §7); M01b adds the evaluation policy form with a worked example |
| `/admin/exams` | A | M08 | End-sem import, CE export, locks, grade sheets |
| `/admin/integrations` | A | M07, M08 | GitHub App status and failed jobs (sync runs are on `/admin/imports` since M01b) |
| `/admin/audit` | A | M01 | Audit log search |

## 3. Navigation

The `(app)` layout follows the reference dashboard Aniket supplied on 13 Oct 2026: a white sidebar and a white sticky top bar around a grey content area whose top-left corner is rounded. The sidebar header is a light primary-tinted card: the university lockup (`UniversityLogo`) on a white chip, beside “Centurion **LMS**” (LMS in the primary colour) and “Learning Management System”; collapsed, only the lockup shows, 32 px wide. The top bar holds the sidebar trigger and the breadcrumb on the left, and today's date (IST), a notification bell (a round button with the unread count on a small primary badge, linking to `/notifications`; M02) and the user chip (initials avatar, name, email) on the right; the chip opens a menu with Profile and Sign out. The bell and the chip read the session inside one `<Suspense>`. The reference's search box and theme toggle are left out: there is no search feature and the theme is light only (A-23). On screens ≥ 768 px the sidebar is docked and collapses to the primitive's 48 px icon rail (each item a 32 px square centred with 8 px either side; tooltips name each item); below that it opens as a `Sheet`.

The nav lists only routes that exist, in groups; each milestone adds its own items with their role filter. A group with no visible item is not shown. A group's label (“Menu”, “Administration”) sits above its items; each item is a grey pill with a Phosphor icon and its label, and the current item is a solid primary pill. The Account group has no label: it sits at the foot of the sidebar as plain rows, followed by a Sign out button. The most specific matching `href` (or listed prefix) is current; the breadcrumb prints that item (and the sub-item under Structure), without the group. Items by role (a user with several roles sees the union, in this order):

| Group | Item | Roles |
|---|---|---|
| Menu | Dashboard (`/home`) | all |
| Menu | Notifications (M02) | all |
| Menu | My courses (`/courses`) | student, faculty, hod, admin |
| Menu | Course catalogue (`/catalog`, M01b) | faculty, hod, admin |
| Menu | Results (M08) | student |
| Menu | Reports (M06) | hod, admin |
| Administration | Structure (`/admin`; also owns departments, programmes, terms) with sub-items Departments, Programmes, Terms | admin |
| Administration | Offerings, Imports (M01b), Settings, Audit log | admin |
| Administration | Users (`/admin/users`) | admin, support |
| Account (foot of the sidebar) | Profile, then Sign out | all |

The admin area has no `TabNav`: the sidebar is its navigation.

**Course workspace tabs** (`TabNav` in `app/(app)/courses/[offeringId]/layout.tsx`, computed from access and the offering's category and credits copy; `ugc` = a credit course, M01b):

| Tab | Shown when |
|---|---|
| Overview | always (teachers: a “Get this course ready” checklist first; students: “Your progress” with a Start/Continue button) |
| Course plan | admin and the offering's faculty (M02) |
| Content | always; labelled “Lessons” for students |
| Live | always |
| Assessments | always |
| Records | ugc and theory or practice credits above 0 |
| Marks | ugc |
| Projects | project credits above 0 |
| Outcomes | ugc and access is teach/oversee |
| People | access is teach/oversee |

The workspace layout reads `params` and the offering, so its header and tabs render inside their own `<Suspense>` (02 §5).

## 4. Design tokens — `app/globals.css`

shadcn's token set, defined once in `:root` and mapped to Tailwind colours with `@theme inline` (so `bg-primary`, `text-muted-foreground`, `bg-sidebar`, `border-border` exist). The palette is blue (Aniket's decision of 13 Oct 2026, which replaces the crimson sampled from the lockup for Q-32): primary `oklch(0.52 0.22 263)` (`#1c59e4`, 5.8 : 1 on white), wordmark charcoal foreground, a cool grey page background `oklch(0.967 0.004 264)` with white cards so cards lift off the page, and flame gold `--gold` `oklch(0.613 0.108 79.8)` for small accents (never as a border stripe). Extra tokens beyond shadcn's: `--success`, `--warning`, `--gold`, and one elevation shadow, `--shadow-elevated` (dialogs), exposed as `shadow-elevated`. Radius is `0.75rem`. No dark theme (out of scope); `@custom-variant dark` is declared only so shadcn's `dark:` classes stay inert.

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
- In M00: `alert`, `avatar`, `badge`, `button`, `card`, `dropdown-menu`, `input`, `label`, `separator`, `sheet`, `sidebar`, `skeleton`, `tooltip` (+ `hooks/use-mobile.ts`, `lib/cn.ts`). Local changes: `sidebar` skeleton width fixed (purity lint), `use-mobile` rewritten with `useSyncExternalStore` (effect-setState lint). Since the reference-design pass (13 Oct 2026, at Aniket's request): `button` outline variant, `input`, `textarea` and `native-select` lose shadcn's `shadow-xs` (the outline button is white, `bg-card`); `badge`'s status tones gain a hairline ring, a leading dot and `capitalize`. `button` hides a duotone icon's 20% layer in every variant.
- Planned first uses: `table`, `tabs`, `alert-dialog`, `native-select` (in place of Radix `select`: a real `<select>` posts with the form and needs no client code), `textarea`, `empty`, `pagination` (M01); `dialog` (UI redesign, used only by `FormDialog`); `progress` (M02: uploads, lesson and setup progress, skill attendance); `chart` (M06, adds `recharts`).
- Icons: shadcn ships lucide imports. Every vendored file that used one (`dialog`, `dropdown-menu`, `native-select`, `pagination`, `sheet`, `sidebar`) imports the Phosphor equivalent instead, marked `Local change from shadcn 4.21.4: Phosphor icons`. Do the same when vendoring a new primitive.

Shared surface classes are Tailwind `@utility` rules in `globals.css`, not components: `surface` (a card: white, `ring-1 ring-border/80`, `rounded-2xl`, no shadow), `surface-interactive` (adds the primary ring tint and the filled icon chip on hover), and `icon-chip` (an outlined square on the page grey holding a duotone icon in the primary colour, as on the reference's stat tiles; inside `surface-interactive` it fills on hover).

### 5.2 App components (closed list)

These are the **only** other files allowed in `components/`. Each has two or more call sites (or is a required client boundary). Adding an entry requires two real call sites and a row here, in the same commit (04 §2).

| Component | File | Kind | Props (contract) | Used by | Milestone |
|---|---|---|---|---|---|
| `ActionForm`, `Field`, `FieldErrors` | `action-form.tsx` | client | 04 §6.8, plus: `replaceOnSuccess?: boolean` (on success the fields are replaced by an animated check and `successMessage`); `onSuccess?: (data: unknown) => void` and `onPendingChange?: (pending: boolean) => void` (for a client parent such as `FormDialog`); `secondary?: ReactNode` (a control shown before the submit button, such as Cancel); `submitSize?: 'default' \| 'sm'` (compact one-click actions in cards and table rows); `submitVariant` also takes `'outline'` (a secondary one-click action such as Unpublish or a reorder arrow); `submitIcon?: ReactNode` (an icon before the label, replaced by the spinner while pending) and `iconOnly?: boolean` (a square `icon-sm` button whose `submitLabel` becomes its `aria-label` and tooltip: the reorder arrows, M02). The children sit in a `<fieldset disabled>` while the action runs. `FieldErrors` is `{ name: string }` and prints that field's errors for a group of controls (a grid of rows) where `Field`'s single `<label>` does not fit | every form | M00 (`FieldErrors` M01; additions UI redesign) |
| `FormDialog` | `form-dialog.tsx` | client (shadcn `Dialog`, `useRouter`, `useSearchParams`) | `{ trigger: ReactNode; title: string; description?: string; icon?: ReactNode; size?: 'default' \| 'wide' \| 'full'; openParam?: string; preface?: ReactNode; action; submitLabel: string; successMessage: string; submitVariant?: 'default' \| 'destructive'; children?: ReactNode }` — `trigger` is the element that opens it (`DialogTrigger asChild`). The form inside is an `ActionForm` with `replaceOnSuccess`. While the action runs, Esc, an outside click and the close button do nothing. Layout (design “A · Clean”, chosen by Aniket from three mock-ups on 13 Oct 2026): a header with the icon chip, title and description above a hairline; a body that scrolls on its own; and a grey button bar (Cancel, submit) that stays at the bottom. Sizes are `sm:max-w-xl`, `sm:max-w-3xl` (`wide`) and `sm:max-w-6xl` (`full`), never taller than the viewport; fields and selects take the full width and never spill past the edge (a native select no longer sizes itself to its longest option). Below 640 px the dialog is a full-width sheet rising from the bottom. On success the header and fields give way to the success state; after 1.6 s the dialog closes and, if the action returned `{ next }` (06 §1), navigates there. Each open starts with a fresh form. `preface` renders above the form and outside it (the GET programme step of New offering). `openParam` opens it on load when the URL has `?new=<openParam>` (Home quick actions) — also when a fresh navigation returns to a page Next kept mounted (the state resets on a new `useRouter().bfcacheId`; back/forward restores it as it was); closing removes the parameter | every create/edit form | UI redesign |
| `FilterForm` | `filter-form.tsx` | client (`next/form`, `useFormStatus`) | `{ action: string; submitLabel?: string; plain?: boolean; children: ReactNode }` — a row of GET filter fields (the children) straight on the page, with the inputs and selects white and fully rounded like the reference's filter pills, and an outline submit button that shows a spinner while the filtered page loads; `plain` keeps the fields' own style for a step inside a dialog | courses, catalogue, offerings (and the New offering batch step), the coordinator search, a programme's curriculum, users, audit | UI redesign |
| `Section`, `Fact` | `section.tsx` | server | `Section({ icon: ReactNode; title: string; description: string; action?: ReactNode; children })` — a detail-page section as one card (`surface`): icon chip, title, one-line description and an optional action (a `FormDialog` trigger) above its content. `Fact({ label, children })` — one label/value pair in a `<dl className="surface grid …">` facts strip | programme, catalogue course, imports, settings, user, profile, course Overview and people | UI redesign |
| `LinkSpinner` | `link-spinner.tsx` | client (`useLinkStatus`) | `{ className?: string }` — a fixed-size spinner, invisible until the enclosing `<Link>`'s navigation is pending; placed inside a `Link` | sidebar items, Home tiles, hero and offerings row, `OfferingCard`, `TabNav`, the admin landing and scheme cards | UI redesign |
| `OfferingCard` | `offering-card.tsx` | server | `{ offering: MyOfferingRow; featured?: boolean }` — a course-offering card linking to its workspace: status badge and term, title, and the first faculty member beside an initials avatar (“+n” for more). a black “Open” pill sits at its foot; `featured` makes it the dark card with a white “Open” pill, as the first card of Home's offerings row | Home, `/courses` | UI redesign |
| `PasswordInput` | `password-input.tsx` | client | the `Input` props except `type` — a password `Input` with a show/hide toggle button (`aria-label`, `aria-pressed`) | sign in, set password, change password | UI redesign |
| `PageHeader` | `page-header.tsx` | server | `{ title: string; description?: string; icon?: ReactNode; actions?: ReactNode }` — `icon` shows in an `icon-chip` before the title; `actions` (usually `FormDialog` triggers) align to the right and wrap below on phones | every page in the shell | M00 (`icon`, `actions` UI redesign) |
| `UniversityLogo` | `university-logo.tsx` | server | `{ className?: string; sizes: string; priority?: boolean }` — the official lockup, words included | auth layout, auth stage, app sidebar, 404 | M00 |
| `AuthStage` | `auth-stage.tsx` | client (`gsap`) | none — the blue brand panel on wide screens: the lockup on a white chip, a headline, three feature rows and the drifting lotus | `(auth)` layout | M00 |
| `AppNav`, `AppBreadcrumb` | `app-nav.tsx` | client (`usePathname`, `useSidebar`) | `AppNav({ roles })` — the layout reads the viewer and passes their roles; the Account group renders at the foot with a Sign out form (`logout`, a spinner while it runs). `AppBreadcrumb` takes none and prints the current item (and the sub-item under Structure). Each is wrapped in `<Suspense>` because `usePathname` is request data on a dynamic route. The `NAV` groups live in the file with a `roles` filter per item (the union for several roles; the longest matching `href` or prefix is current) | `(app)` layout | M00 (groups UI redesign) |
| `DataTable` | `data-table.tsx` | server | `{ columns: { header: string; cell: (row: T) => ReactNode; className?: string }[]; rows: T[]; rowKey: (row: T) => string; total: number; page: number; pageSize: number; query: Record<string, string>; path: string; empty: string }` — shadcn `Table` in a `surface` card with a plain sentence-case header row and each body row drawn as its own outlined, rounded strip (`border-separate`, as in the reference's student list) with a hover tint, an `Empty` state, and a footer with the range shown ("Showing 1–25 of 340") and `Pagination` links that keep `query`. Row actions are small icon buttons in the last column (`FormDialog` triggers, `ConfirmSubmit` forms). The file also exports `PageNav({ shown, total, page, pageSize, query, path, className? })` (that footer, for paginated card grids) and `EmptyState({ text, icon? })` (the empty card) | every large list; `PageNav`/`EmptyState` under the departments and terms grids | M01 |
| `TabNav` | `tab-nav.tsx` | client (`usePathname`) | `{ tabs: { href: string; label: string; icon?: ReactNode; prefixes?: string[] }[] }` — link tabs styled as shadcn `Tabs` in a white pill bar; the current tab is the solid primary pill (as in the sidebar), each tab shows a `LinkSpinner` while it loads; a tab is current for its `href`, anything below it and any `prefixes`, longest match wins | course workspace, reports | M01 |
| `ConfirmSubmit` | `confirm-submit.tsx` | client | `{ title: string; message: string; confirmLabel: string; variant?: 'default' \| 'destructive' \| 'outline'; pending: boolean; children: ReactNode }` — shadcn `AlertDialog`; `children` is the button that opens it and the confirm button submits the enclosing form (`form.requestSubmit()`). The dialog stays open, its buttons disabled and the confirm button spinning, until the action settles (`pending` from `ActionForm`). Used through `ActionForm`'s `confirm={{ title, message }}` prop, which makes the form's own submit button the trigger | offering status, delete a CO, account access actions, sign out everywhere, publish, lock, end session | M01 |
| `RichTextEditor` | `rich-text-editor.tsx` | client | `{ name: string; initial?: RichTextDoc \| null; placeholder?: string }` — Tiptap StarterKit, `immediatelyRender: false`, an icon toolbar (bold, italic, heading, subheading, bulleted and numbered list, link, undo, redo; each with an `aria-label` and its pressed state from `useEditorState`) and an inline link field instead of a browser prompt; writes the JSON to a hidden input `name` (`''` while empty) | plan, lesson description, item prompts, text answers, task description | M02 |
| `RichTextView` | `rich-text-view.tsx` | server | `{ doc: RichTextDoc }` — `generateHTML` from `@tiptap/html/server` with StarterKit into `.prose-lms` | everywhere rich text is shown | M02 |
| `FileUpload` | `file-upload.tsx` | client | `{ name: string; purpose: UploadPurpose; contextId: string; multiple?: boolean; required?: boolean }` — the accepted types and size come from the purpose (06 §5) and are said in words (“MP4 or WebM video, up to 2 GB”). A dashed drop zone over a native file input; per file: name, size (and a video's length), shadcn `Progress` while uploading, Retry and Remove (which also cancels). Reads a video's length before uploading and refuses one it cannot read; calls `createUpload`, PUTs with `XMLHttpRequest`, writes JSON to hidden inputs `name[]`. While a file uploads (or, with `required`, before one has), the input's custom validity blocks the form's submit | lesson files, syllabus, submissions | M02 |
| `VideoPlayer` | `video-player.tsx` | client | `{ lessonId: string; src: string; lowSrc: string \| null }` — native `<video controls>`; an "HD / Data saver" toggle when `lowSrc` exists (default Data saver below 768 px wide, choice kept in `localStorage`; switching keeps the playback position and play state); collects played ranges (a jump of more than 2 s starts a new range), `sendBeacon` every 30 s, on pause, when the page is hidden and on `pagehide`. Only students get it; teachers preview with a plain `<video>` | lesson page | M02 |
| `LiveRoom` | `live-room.tsx` | client | `{ sessionId: string; serverUrl: string; token: string }` — LiveKit `LiveKitRoom` + `VideoConference`; focus beacon every 60 s while visible | live session page | M03 |
| `AssessmentRunner` | `assessment-runner.tsx` | client | `{ attempt: AttemptDTO }` (no answer keys, no hidden cases) — timer, autosave per answer, submit, proctoring hooks, renders items by type | attempt page | M04, M05 |
| `CodeEditor` | `code-editor.tsx` | client | `{ name?: string; value: string; language: 'c' \| 'cpp' \| 'java'; readOnly?: boolean; onChange?: (v: string) => void }` | runner, builder (starter code) | M05 |
| `TrendChart` | `trend-chart.tsx` | client (shadcn `chart`) | `{ points: { label: string; value: number }[]; max: number; label: string }` — area/line chart with an accessible summary sentence | marks trend, engagement trend | M06 |
| `CoPoMatrix` | `co-po-matrix.tsx` | server | `{ cos: { id: string; code: string }[]; outcomes: { code: string; title: string }[]; cells: Record<string, number> }` — read only: COs are rows, PO1–PO12 and PSO1–PSO3 the columns (a programme's title on hover), each cell the level as a tinted chip (darker for higher) or “–”. Also exports `levelTone(level)`, the chip style `CoPoEditor` shares. M09 adds attainment values | catalogue course, course Overview, outcomes report | M01, M01b, M09 |
| `CoPoEditor` | `co-po-editor.tsx` | client (state) | `{ cos: { id: string; code: string; statement: string }[]; outcomes: { code: string; title: string }[]; cells: Record<string, number> }` — the mapping in one save (M01b): each cell is a button that goes – → 1 → 2 → 3 → – on click, or takes the keys 0–3 (Delete clears); each row has "Same as CO1" and "Clear row"; a running count of links; every linked cell is a hidden `cell[]` = `<coId>:<code>:<level>` for `saveCoMap` | catalogue course (mapping dialog); M09's AI suggestions apply into it | M01b |
| `Checklist` | `checklist.tsx` | server | `{ icon: ReactNode; title: string; readyTitle: string; steps: { title; detail; done; href: string \| null; action: string; waiting?: string }[]; hint?: string }` — a setup path in order: a progress bar and "n of m steps done", each step numbered or ticked with what is done or still to do, and a button to where it is done; the first unfinished step the viewer can do is highlighted; a step someone else does says who (`waiting`) | course Overview ("Get this course ready"), catalogue course ("Course readiness") | M02, M01b |

Bars and percentages (attainment, progress, engagement) use the shadcn `Progress` primitive with the number as text beside it; there is no separate `Meter` component.

Not components (use shadcn primitives + markup + the `surface` utilities): stat tiles, the Home hero and activity bars, badges, empty states (`Empty`), the kanban board (a server-rendered grid of cards with per-card status forms), notification lists.

## 6. Page patterns

**List page** — `page.tsx` validates `searchParams` (Zod), calls one DAL list function, renders `PageHeader` (icon, title, description; the "New …" `FormDialog` triggers as `actions`), an optional `FilterForm`, and either `DataTable` (large lists) or a card grid (small lists such as departments, terms, schemes, the admin landing, my courses).

**Detail page** — validates `params`, calls DAL `get…` (which `notFound()`s on no access), renders sections as `surface` cards with an icon chip, a title and a one-line description. Each section shows its data read-only; its "Edit …" button opens a `FormDialog`. Destructive or one-click actions are `ConfirmSubmit` buttons.

**Create / edit** — a `FormDialog` on the list or detail page. Fields for an edit are pre-filled from the row or record already on the page. On success the action calls `refresh()` (the page behind updates while the success state shows); a create that leads somewhere returns `{ next }` and the dialog navigates there after closing.

**Workspace** — `courses/[offeringId]/layout.tsx` renders a header card (icon chip, offering title, status badge, term and faculty) and `TabNav` inside `<Suspense>`; each tab is its own page with its own `loading.tsx` when it has heavy data.

**Home** — the role-aware dashboard, laid out after the reference dashboard of 13 Oct 2026. “Hello, <first name>”, then two columns from 1280 px (one below). The left column holds the hero, a primary-gradient card featuring the viewer's newest offering (title, term, faculty, status) with a white “Open course” button and a solid primary button for the next step: New offering for admins (it opens that dialog through `?new=`), the offering's Students for faculty and HoDs, All my courses for students, Find a user for support, who has no offerings. For admins it also holds the latest audit entries, each with a coloured entity tile. The right column holds stat tiles from `getHomeSummary()` that link to their list (admin: users and how many are yet to sign in, active offerings, courses, programmes; faculty and HoD: offerings and active enrolments; student: courses); for admins, the audit entries of the last seven IST days as server-rendered bars (seven bars need no Recharts; today's bar is striped and labelled) beside the three people with the most entries that week; and the viewer's next three offerings as `OfferingCard`s, the first `featured`. Only data that exists is shown, with no placeholder panels; each milestone adds its own section (M02: “Publish your course plan” for faculty with active offerings that have none, and “Continue learning” for students, both above the tiles; a Notifications tile with the unread count for everyone; live now M03, due soon and to grade M04, results M08) when it ships. The earlier quick-actions grid, account-security card and role chips are gone: the same links are in the sidebar, the user menu and each list page's own buttons.

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
