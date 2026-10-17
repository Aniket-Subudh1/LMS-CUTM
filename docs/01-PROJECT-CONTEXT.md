# 01 · Project context

## 1. The client and the situation

- **Client:** Centurion University of Technology and Management (CUTM), via Saneev Sir.
- **Delivery team:** Aniket and one colleague. The team previously built an LMS and a recruitment platform the client already knows; that platform's live-class solution was described as "good and highly scalable".
- **Need:** an in-house, end-to-end LMS covering UGC-aligned degree programs (BBA, online BBA, online MCA, B.Tech-style curricula) whose syllabus matches the offline syllabus, plus skill / short-term courses.
- **Competition:** the alternative under consideration is **D2L (Desire2Learn / Brightspace)**. The client said: "We need it badly and immediately. If it is delayed even slightly, they will go to D2L." Speed of a working core matters more than breadth. This is why the milestone plan has an early pilot release (R1).
- **Commercials (not code):** a fixed price based on requirements plus a separate maintenance charge for a dedicated support person (SUP-01, SUP-02). A combined quotation and a D2L review report are team deliverables outside this repository.

## 2. Objectives

| # | Objective |
|---|---|
| O-1 | One platform that runs UGC-aligned programs end to end, from content to grade sheet |
| O-2 | Track and quantify student engagement, per student, with AI assistance |
| O-3 | Continuous, configurable, transparent internal assessment with dashboards |
| O-4 | Automate CO-PO-PSO mapping and attainment for accreditation-style reporting |
| O-5 | Skill / short-term courses with engagement traceability |
| O-6 | Sustainable; able to "grow like anything" (users, courses, live classes) |
| O-7 | Delivered fast enough to win against D2L |

**Success criteria (proposed by the team, to confirm):** one UGC-aligned program runs a full semester on the LMS (content, attendance, CE, end-sem import, grade sheet); attainment reports generated from marks with no spreadsheet work; live classes at target concurrency without third-party meeting APIs; CE marks pushed to the exam section without re-entry.

## 3. Scope — in

Course, content and lecture management (upload and live) · loading CUTM's course catalogue from its Course Repository list (CSV) and its public courseware pages (ADM-06, ADM-07) · attendance (manual, live-derived, and time-engaged for skill courses) · AI-assisted engagement tracking and dashboards · learning records, lab records, assignments · continuous-evaluation engine (all modes), rubrics, configurable internal marks · virtual lab with compilers and proctoring; proctored quizzes · project tracking (GitHub for CSE, task tracker for non-CSE) and project reviews · CO/PO/PSO definition, mapping, question tagging and attainment · course announcements by email · exam-system integration (pull end-sem marks, push CE marks) and grade sheet · skill / short-term courses · admin configuration · support tooling for a dedicated support person.

## 4. Scope — out (contractual)

Nothing in this section is built without written client approval recorded in `PROGRESS.md`.

**Stated by the client:**
- Conducting end-semester examinations, answer-copy checking and end-term evaluation — the university does these offline (EXM-01, EXM-02).
- Zoom, Google Meet or any third-party meeting API for live classes (LIV-01).
- The university exam system itself — the LMS only consumes and supplies data through its interface.

**Excluded by the delivery team (not requested; would need approval):**
- Native mobile apps (the web app is responsive), offline mode, push notifications to devices.
- SSO / ERP / student-information-system integration (pending Q-13). Login is email + password.
- Admissions, fees, payments, hostel, library, timetable generation.
- Discussion forums, student-to-student chat, social features. (One exception, at Aniket's request on 17 Oct 2026: the chat inside a running live class, which reaches only the people in the room then and is not stored. Raising a hand in a live class is also in; hand-raise analytics stay out.)
- A question bank shared across offerings; copying a course between terms.
- Plagiarism detection (ASG-04 part), completion certificates (SKL-05), helpdesk/ticketing (SUP-03).
- Excel / PDF export (CPP-10 part). Reports are printable from the browser.
- Indirect attainment (course-exit surveys), at-risk alerting (ENG-04), live-class recordings (LIV-05).
- Chat / poll / hand-raise analytics, AI review of code diffs, AI-written feedback to students, any AI that writes marks or attendance.
- Multi-language UI. The UI is English.
- Language switching, translation, ambient monitoring beyond the proctoring set in M05.
- Google Meet scheduling for reviews (pending Q-03).
- Writing course content back to courseware.cutm.ac.in (the import reads it; export later, decision of 15 Oct 2026).

## 5. Users and roles

A user has one or more roles (`roles: Role[]`). A head of department usually also teaches, so `['faculty','hod']` is normal.

| Role | Who | What they do in the LMS |
|---|---|---|
| `admin` | University LMS administrators | Configure programs, the course catalogue and its imports, the evaluation policy, users, terms, offerings, integrations, settings; see everything; unlock marks with a reason |
| `hod` | Program / department head (SRS: Recommended) | Read-only oversight of every offering in their department: attainment, CE, engagement, projects |
| `faculty` | Teachers | Course plan and calendar, content, live classes, attendance, assessments, grading, records, projects (as project manager), CE review, CO tagging. A faculty member who is a course's **coordinator** also edits that catalogue course (CRS-07) |
| `student` | Learners | Attend live or recorded lectures, submit records/assignments, take quizzes and lab tests, work on projects, see own results and grade sheet |
| `support` | Vendor-side support executive (SUP-01) | Find users, reset passwords, see a student's enrollments and submission statuses (not answers or marks edits) |

The **university exam system** is an external system, not a login role. The full permission matrix is in `09-SECURITY.md` §2.

## 6. Course modes and types

A course's credits are written T-P-Pj: theory, practice and project credits, as in CUTM's Course Repository (e.g. `CUTM1535 · 3-0-1`, 4 credits). **The credits decide what the LMS does with a course** (decision of 15 Oct 2026, M01b):

| Mode | Credits | Offering `category` | Features |
|---|---|---|---|
| Credit course | T+P+Pj > 0 | `ugc` | Everything: content, live, attendance, records, assignments, CE by the evaluation policy, virtual lab, projects (when Pj > 0), CO-PO-PSO, exam integration, grade sheet |
| Non-credit course | 0-0-0 | `skill` | Videos, quizzes, engagement traceability, attendance derived from time engaged. No CE, no CO/PO, no exam integration |

The six courseware types — Core, Domain, Skill, Certificate, Advanced certificate, Diploma — are **labels** shown on the course; a Skill course with credits (e.g. CUTM3073, 0-3-1) is a credit course. Whether Certificate and Diploma courses carry credits is Q-45.

## 7. Requirement register

Priority: **Must** = stated in the call · **Should** = strongly implied · **Could** = recommended enhancement · **Confirm** = conflicting/unclear. Decision: **Build** (in the named milestone) · **Backlog** (not built without approval) · **Blocked** (named question) · **Constraint** (a rule, nothing to build).

### 7.1 Program, course & content
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| CRS-01 | Programs (BBA, online BBA, online MCA, B.Tech) containing courses mirroring the offline syllabus | Must | M01 | Build |
| CRS-02 | Each course classified by components: theory, practice (lab), project; components drive which records and evaluations apply | Must | M01, M01b | Build — since M01b the components are the T-P-Pj credits (a component applies when its credits are above 0) |
| CRS-03 | Faculty upload recorded lectures (video and materials) | Must | M02, M03b | Build — M03b (owner request, 17 Oct 2026): a course builder with lesson thumbnails, PDF notes, an offering cover and reordering |
| CRS-04 | Faculty schedule and conduct live classes inside the platform | Must | M03 | Build |
| CRS-05 | Each course stores syllabus, calendar, objectives, COs and linked POs | Must | M01, M02, M01b | Build — M01b: the syllabus is modules (with hours, practicals and projects), plus books and a session plan, importable from courseware |
| CRS-06 | Faculty submit a course plan and calendar; the system requests them at course start | Must | M02 | Build |
| CRS-07 | Each course has a coordinator (a faculty member) who keeps its catalogue content: objectives, COs, mapping, syllabus, books, session plan | Must | M01b, M03b | Build (product-owner decision, 15 Oct 2026); M03b: edited item by item inside the course workspace too |

### 7.2 Communication
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| COM-01 | On publishing plan and calendar, email enrolled students the calendar, syllabus, COs, objectives and POs | Must | M02 | Build |
| COM-02 | Announcements visible in-app on the course page | Could | — | Backlog (the in-app notification list from COM-03 shows the publish event) |
| COM-03 | Notifications for new assignments, evaluations, deadlines, live classes, published results | Should | M02 (infrastructure), each milestone (its events) | Build |

### 7.3 Attendance
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| ATT-01 | Faculty take attendance for a live class on the platform once it has started | Must | M03 | Build |
| ATT-02 | Attendance stored per student per session; feeds engagement analytics and dashboards | Must | M03 | Build |
| ATT-03 | Attendance optionally derived from time engaged in the live session; mandatory for skill courses | Should | M03 (live), M02 (skill lessons) | Build |

### 7.4 Records & assignments
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| REC-01 | Theory courses keep a learning record per student | Must | M04 | Build |
| REC-02 | Practice courses keep a lab record per student | Must | M04 | Build |
| REC-03 | Students submit an annual learning record through the platform | Must | M04 | Build |
| REC-04 | Faculty review and evaluate records; marks flow into CE | Should | M04, M06 | Build |
| ASG-01 | Assignment submission as scanned upload (images / PDF) | Must | M04 | Build |
| ASG-02 | Assignment written directly on the platform (rich-text editor) | Must | M04 | Build |
| ASG-03 | Every assignment question tagged with one or more COs | Must | M04 | Build |
| ASG-04 | Deadlines, late flags, resubmission, plagiarism check | Could | M04 (deadline, late flag, attempts via the generic assessment settings) | Partly Build; plagiarism Backlog |

### 7.5 Continuous evaluation
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| CE-01 | Evaluation is continuous across the semester | Must | M04, M06 | Build |
| CE-02 | After a submission, faculty choose the evaluation mode | Must | M04 | Build |
| CE-03 | Modes: quiz, written test, coding test, lab test, coding competition, assignment, learning/lab records, project reviews — "all modes that are possible" | Must | M04, M05, M07 | Build |
| CE-04 | Quizzes configurable (questions, timing, attempts) and may be proctored | Must | M04, M05 | Build |
| CE-05 | Faculty define the evaluation rubric | Must | M04 | Build |
| CE-06 | Component scores mapped to the internal maximum (e.g. out of 50) | Must | M06 | Build |
| CE-07 | Evaluation system dynamic, configured by admin per subject type and component combination (total internal and component weights) | Must | M01b (config), M06 (compute) | Build — since M01b one evaluation policy in Settings, from CUTM's Examination Policy (each component out of 100), copied onto each offering when it is created |
| CE-08 | CE results entered by faculty or recorded automatically; kept as a complete record | Must | M04 | Build |
| CE-09 | Dashboards show whether each student's performance is dropping or rising | Must | M06 | Build |
| CE-10 | Mark entry supports the CE workflow (to be detailed by the client) | Must | M06 | Build the faculty marks view; specifics **Blocked on Q-06** |
| CE-11 | CE data pushed to the exam section through the API | Must | M08 | Build (CSV now; API **Blocked on Q-04**) |
| CE-12 | Marks locked after submission to the exam section, with audit trail | Could | M08 | Build — required anyway by NFR-03 (audit trail for marks) and so pushed marks cannot drift |

### 7.6 Virtual lab & proctoring
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| LAB-01 | Practicals completely based on a virtual lab, done online | Must | M05 | Build |
| LAB-02 | In-browser compilers for at least C, C++, Java, "just like the recruitment platform" | Must | M05 | Build |
| LAB-03 | Lab activity tracked (time, attempts, submissions, test-case results) | Must | M05 | Build |
| LAB-04 | Lab tests and quizzes proctored | Must | M05 | Build (feature set **Q-09**; default set in M05) |
| LAB-05 | Coding tests auto-graded against test cases; results flow into CE | Should | M05 | Build |
| LAB-06 | More languages (Python, SQL) and non-programming labs | Could | — | Backlog (languages are configuration; not enabled by default) |

### 7.7 Projects
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| PRJ-01 | Courses may include a continuously evaluated project component | Must | M07 | Build |
| PRJ-02 | CSE projects must use GitHub; each project linked to a repository | Must | M07 | Build |
| PRJ-03 | CSE evaluation based on number and quality of commits | Must | M07 | Build |
| PRJ-04 | Project dashboard of GitHub metrics per student and team | Must | M07 | Build |
| PRJ-05 | Non-CSE projects use a generalised tracker "just like Jira" | Must | M07 | Build |
| PRJ-06 | Faculty act as project manager and allocate tasks to students | Must | M07 | Build |
| PRJ-07 | Students work from anywhere; system tracks whether deadlines are met | Must | M07 | Build |
| PRJ-08 | Tracker life cycle (backlog, in progress, review, done); tasks checked regularly, marks awarded on that basis | Must | M07 | Build |
| PRJ-09 | Project review sessions schedulable; reviews count as project component and CE | Must | M07 | Build |
| PRJ-10 | Reviews scheduled "through Google Meet automatically" | Confirm | — | **Blocked on Q-03**; reviews use the in-house live class meanwhile (LIV-01) |

### 7.8 CO-PO-PSO
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| CPP-01 | COs per course, each tagged with a Bloom's taxonomy level | Must | M01 | Build |
| CPP-02 | POs per program (default 12 for B.Tech) and PSOs (Higher education, Entrepreneurship, Placement), editable per program | Must | M01, M01b | Build — since M01b the codes are fixed (PO1–PO12, PSO1–PSO3) and each programme titles them |
| CPP-03 | CO-PO matrix and CO-PO-PSO matrix per course | Must | M01 | Build |
| CPP-04 | Each cell holds a correlation level 1–3 (3 = highly linked) | Must | M01 | Build |
| CPP-05 | Every question records which CO it belongs to | Must | M04 | Build |
| CPP-06 | CO linkage kept "everywhere" | Must | M04 (enforced on every gradable item) | Build |
| CPP-07 | An AI prompt assists with CO tagging and mapping (suggest CO + Bloom level; suggest CO-PO levels) | Must | M09 | Build (suggest only; a human applies) |
| CPP-08 | After results, compute CO attainment, then PO and PSO attainment through the matrices | Must | M09 | Build |
| CPP-09 | Attainment reports per course, program and batch, planned vs achieved | Must | M09 | Build |
| CPP-10 | Configurable thresholds, direct/indirect weights, Excel/PDF export | Could | M09 (thresholds only, as settings) | Partly Build; indirect + export Backlog |

### 7.9 Exams & integration
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| EXM-01 | End-sem exams conducted offline by the university | Must | — | Constraint |
| EXM-02 | University checks answer copies in its own system | Must | — | Constraint |
| EXM-03 | Pull end-sem marks from the exam-system API | Must | M08 | Build (CSV adapter now; API **Blocked on Q-04**) |
| EXM-04 | Push CE data to the exam section | Must | M08 | Build (same) |
| EXM-05 | Combine CE and end-sem marks into the grade sheet shown to students | Must | M08 | Build |
| EXM-06 | Grade-sheet data triggers attainment calculation | Must | M09 | Build |
| EXM-07 | Sync logs, retries, mismatch reports, manual re-sync | Should | M08 | Build |

### 7.10 Skill courses
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| SKL-01 | Second category: skill / short-term courses | Must | M01, M02 | Build — since M01b: non-credit (0-0-0) courses |
| SKL-02 | Traceability: how engaged each learner is and how many quizzes attempted | Must | M02, M04, M10 | Build |
| SKL-03 | Faculty easily upload videos and quiz materials | Must | M02, M04 | Build |
| SKL-04 | No manual attendance; attendance derived from time engaged | Must | M02 | Build |
| SKL-05 | Completion rules and certificates | Could | — | Backlog |

### 7.11 Live classes & engagement
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| LIV-01 | No Zoom / Google Meet / third-party meeting API | Must | M03 | Constraint + Build |
| LIV-02 | Reuse the live-class solution from the team's previous platform | Must | M03 | Build on self-hosted LiveKit (dev decision 12 Oct 2026, ADR-18 — cheapest at scale, browser-only, scalable). Confirm with the client that this is the expected solution (Q-25) |
| LIV-03 | Measure student engagement in live classes | Must | M03 | Build |
| LIV-04 | Attendance captured in the live class, optionally derived from time engaged | Must | M03 | Build |
| LIV-05 | Recordings saved to the content library | Could | — | Backlog |
| ENG-01 | Apply AI to platform activity to track how much each student is studying | Must | M10 | Build (deterministic score + AI explanation; meaning **Q-26**) |
| ENG-02 | Student-wise dashboard with drill-down | Must | M10 | Build |
| ENG-03 | Suggested signals (video, live presence and interaction, quizzes, lab, timeliness, logins) | Could | M10 | Build only from signals already collected; chat/poll/hand-raise Backlog |
| ENG-04 | Engagement score with at-risk alerts | Could | M10 (score shown) | Alerts Backlog |

### 7.12 Dashboards (IDs assigned by the delivery team to SRS §14)
| ID | Dashboard | Audience | Milestone |
|---|---|---|---|
| DSH-01 | Student engagement: study time, drill-down | Faculty, Admin, HoD | M10 |
| DSH-02 | Continuous evaluation: all CE results, rising/dropping trend | Faculty, Admin, HoD, Student (own) | M06 |
| DSH-03 | Project (CSE): commit count and quality per student/team | Faculty | M07 |
| DSH-04 | Project (non-CSE): task status, deadline adherence, reviews | Faculty | M07 |
| DSH-05 | Skill-course traceability: engagement, quizzes, time-based attendance | Faculty, Admin | M10 |
| DSH-06 | CO-PO-PSO attainment per course / program | Admin, HoD, Faculty (own) | M09 |
| DSH-07 | Grade sheet | Student (own), Admin | M08 |

### 7.13 Administration, support, non-functional
| ID | Requirement | Priority | Milestone | Decision |
|---|---|---|---|---|
| ADM-01 | Configure the evaluation scheme dynamically without code changes | Must | M01, M01b | Build — the evaluation policy in Settings (M01b) |
| ADM-02 | Manage programs, courses, categories, components | Must | M01, M01b | Build |
| ADM-03 | Manage CO/PO/PSO masters and mapping | Must | M01, M01b | Build |
| ADM-04 | Configure integrations (exam API, GitHub, email) | Should | M00, M07, M08 | Build endpoints and toggles as settings; **secrets stay in env** (A-05) |
| ADM-05 | User and role management, bulk import, academic calendar | Should | M00, M01 | Build |
| ADM-06 | Load and update the course catalogue from CUTM's Course Repository as a CSV (programme, stream, basket, type, code, title, credits, T+P+Pj) | Must | M01b | Build (product-owner decision, 15 Oct 2026) |
| ADM-07 | Import course content from courseware.cutm.ac.in, flagging anything that needs review and never overwriting content edited in the LMS | Must | M01b | Build (product-owner decision, 15 Oct 2026) |
| SUP-01 | Dedicated support person handles student queries | Must | M00 (role), M11 (runbook) | Build tooling; staffing is commercial |
| SUP-02 | Separate maintenance charge | Must | — | Commercial, no code |
| SUP-03 | In-app helpdesk / ticketing | Could | — | Backlog |
| SUP-04 | SLA, uptime monitoring, backups | Should | M11 | Build |
| NFR-01 | Scalability: grow in users, courses, concurrent live classes | Must | all; verified M11 | Build |
| NFR-02 | No dependency on third-party meeting APIs | Must | M03 | Constraint |
| NFR-03 | Integrity: proctoring; audit trail for marks | Must | M00, M05, M06, M08 | Build |
| NFR-04 | Configurability: evaluation rules by admin config, not code | Must | M01b, M06 | Build |
| NFR-05 | Interoperability: reliable exam-system integration | Must | M08 | Build |
| NFR-06 | Security & privacy: RBAC, TLS, secure storage, backups | Should | M00, M11 | Build |
| NFR-07 | Usability: desktop and mobile browsers; uploads work on low bandwidth | Should | all; verified M11 | Build |
| NFR-08 | Availability target (e.g. 99.5%), higher during exams and live sessions | Should | M11 | Build |

## 8. Glossary

| Term | Meaning |
|---|---|
| UGC | University Grants Commission (India) |
| CE / CIE | Continuous (internal) evaluation across the semester |
| SEE / End-sem | Semester-end examination, conducted offline by the university |
| Internal max | The internal share of a component's 100 marks under the evaluation policy: theory 40, practice 50, project 50 |
| Evaluation policy | CUTM's Examination Policy as one Settings form (M01b): each component marked out of 100, the course percentage the credit-weighted average, rounded up. Each offering keeps a copy made when it is created |
| Evaluation scheme | M01's admin-built rule sets; replaced by the evaluation policy in M01b |
| Component | Theory, practice or project; a course has a component when its credits for it are above 0 |
| T-P-Pj | A course's theory, practice and project credits, e.g. 3-0-1 (4 credits) |
| Course Repository | CUTM's published list of every programme's courses with their codes and T-P-Pj credits |
| Courseware | courseware.cutm.ac.in, CUTM's public course pages; the LMS imports from it |
| Curriculum | The courses a programme lists, each optionally in a basket |
| Basket | A group in a programme's structure (Basket I–VI), core or choice, with a minimum of credits |
| Coordinator | The faculty member who keeps a catalogue course's content (CRS-07) |
| Assessment | Any gradable activity: quiz, written test, coding test, lab test, competition, assignment, learning record, lab record, project review |
| Item | One gradable unit inside an assessment: a question, a coding problem, or a rubric criterion. Every item carries CO tags |
| Offering | One run of a course in a term for a batch/section, taught by named faculty. Most data hangs off an offering |
| Batch | A cohort of a program (e.g. "B.Tech CSE 2025–29") |
| Term | An academic period (e.g. "Odd 2026") |
| CO / PO / PSO | Course Outcome / Program Outcome / Program Specific Outcome |
| Bloom level | remember, understand, apply, analyse, evaluate, create |
| Attainment | Measured degree to which planned outcomes were reached, on a 0–3 scale |
| Virtual lab | In-browser coding environment backed by a sandboxed code runner |
| Proctoring | Monitoring of online tests to deter malpractice |
| DAL | Data Access Layer — the only code that reads the database for rendering |
| Adapter | The single module that talks to one external system behind a typed interface |
| D2L | Desire2Learn (Brightspace), the commercial LMS the client may otherwise adopt |
