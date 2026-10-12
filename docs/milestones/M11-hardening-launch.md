# M11 · Hardening, load, security, backups, launch

| | |
|---|---|
| Depends on | all previous milestones in the release being launched |
| Requirements | NFR-01, NFR-05, NFR-06, NFR-07, NFR-08, SUP-01, SUP-04 (and verification of every other NFR) |
| Release | **Launch** (a reduced version of T1–T4 runs before every release, 10 §6) |
| Packages added | none (k6 and the LiveKit CLI are external tools, not dependencies) |

## Goal

Prove — with measurements, not claims — that the system is secure, fast enough at the target scale, recoverable, observable and supportable; deploy it to production for the pilot batch; hand over runbooks.

## Tasks

### T1 · Security review (NFR-06, NFR-03)
Walk `09-SECURITY.md` section by section and record each check's result in `PROGRESS.md`:
1. **Authorization sweep:** list every exported DAL function and every action (`grep -rn "export const .* = action(" app` and `grep -rn "^export async function" lib/data`). For each, confirm an integration test proves a user of another offering/department/student gets 404/FORBIDDEN. Add the missing tests.
2. **Secrecy:** answer keys and hidden test cases absent from every student payload (existing tests + a manual network-tab check on the attempt page).
3. `npm audit --omit=dev` → no high/critical without a recorded decision; `npm run check:bundle` clean.
4. Headers on production (`curl -I`), HSTS active, cookies `Secure; HttpOnly; SameSite=Lax`.
5. Rate limits: script each limit in 09 §4 against staging and confirm 429 behaviour.
6. Uploads: wrong content type, oversize, foreign key prefix → rejected; bucket not publicly listable; CORS limited to `APP_URL`.
7. Webhooks: LiveKit and GitHub reject unsigned/bad-signature requests.
8. Secrets: production values unique, ≥ 32 random characters, stored only in the deployment's secret store; rotation procedure written (SESSION_PASSWORD rotation signs users out).
9. Proctoring and AI data policies (09 §11–12) reviewed against the code.

### T2 · Performance and load (NFR-01)
1. **Query plans:** in `mongosh` against staging data at target volume (seed 30,000 students, 1,500 faculty, 1,200 offerings, 400 per offering for the largest), run `explain('executionStats')` for the hot queries: my offerings (each role), offering assessments list, submissions by assessment, internal marks by offering, engagement daily by offering+day, notifications by user, attendance by offering+student, audit by entity. Every plan must use an index (no `COLLSCAN`) and examine ≤ 2× the returned documents. Record plans in `PROGRESS.md`; add or fix indexes (and 05) where they fail.
2. **k6 load tests** (`tests/load/*.js`, committed): (a) sign-in + home + course page + assessments list at 300 req/s for 10 min (p95 < 800 ms, errors < 0.5 %); (b) 600 students autosaving answers every 2 s during a timed test; (c) 3,000 concurrent video beacons every 30 s; (d) 600 code runs in 60 s against the real code runner. Record results and the instance sizes used.
3. **Live classes:** with the LiveKit CLI, `lk load-test` on one production-sized node — 1 publisher (video + audio) and 200 subscribers per room — increasing rooms until CPU ≈ 70 %; record rooms per node and bandwidth per room; size the node count for 40 concurrent classes (11 §4).
4. Fix what fails; re-run; record before/after.

### T3 · Production deployment (NFR-08)
- `Dockerfile` (11 §5, two targets), images built in CI and tagged by commit.
- Production environment per 11 §4 (hosting decided by Q-12): load balancer with TLS, web × 2, worker × 1, MongoDB replica set × 3, Redis with AOF, Cloudflare R2 bucket (+ `npm run s3:setup` CORS), LiveKit nodes with TURN/TLS, Judge0 on a private network, SMTP with SPF/DKIM for the sender domain (Q-31).
- Run the deploy sequence (11 §5) to staging, then production. Smoke test.

### T4 · Backups, monitoring, alerting (SUP-04)
- Nightly MongoDB backups + weekly off-site copy; R2 bucket versioning and lifecycle (11 §6).
- **Restore drill** into a scratch environment; record duration and result.
- Uptime monitor on `/api/health`; log shipping for JSON logs; alerts from 11 §7 wired to the support person's phone/email; BullMQ failed-job alert.

### T5 · Accessibility and mobile (NFR-07)
- Keyboard-only walkthrough of each role's main journeys; fix traps and invisible focus.
- Chrome Lighthouse accessibility ≥ 90 on `/login`, `/home`, a course Overview, the attempt runner, the Marks tab.
- 360 px width check of every page in 08 §2; a lesson video and an assignment upload on a throttled ("Slow 4G") phone profile.

### T6 · Pilot onboarding (with the client)
- Enter the pilot program's real structure, POs/PSOs, courses, COs and matrices, schemes (Q-05), term, offerings; import real students and faculty (invitations).
- Confirm deliverability of invitation emails to the university's domain (check spam placement).
- Faculty orientation session using the live classroom itself; record questions in `PROGRESS.md`.

### T7 · Support handover (SUP-01)
- `11-OPERATIONS.md` §8 runbook reviewed with the support person; SLA agreed (Q-14) and recorded.
- Support account created (role `support`), tested against the runbook's tasks.

### T8 · Go-live checklist
- [ ] Release gate (10 §6) passed for the launch commit.
- [ ] All `blocks: launch` questions answered (Q-12, Q-15, Q-31 at minimum).
- [ ] Restore drill within the last 30 days.
- [ ] Load-test results meet 02 §11 or the client has accepted the measured limits in writing.
- [ ] Rollback plan: previous image tags kept; database changes are additive (indexes only), so rollback is redeploying the previous web/worker images.

## Acceptance criteria

- **AC-M11-01** Every check in T1 is recorded with its result; no open high-severity finding.
- **AC-M11-02** Load-test targets met (or measured limits accepted in writing); query plans all index-backed.
- **AC-M11-03** A full restore from backup has been performed and timed.
- **AC-M11-04** Alerts reach the support person within 5 minutes of a simulated outage.
- **AC-M11-05** The pilot batch's students and faculty can sign in and use their courses in production.

## Validation checklist (human)

- [ ] Client sign-off on the pilot (date, names) recorded in `PROGRESS.md`.
- [ ] Support person confirms they can perform every runbook task.
- [ ] A stakeholder from the exam section confirms the CE export/end-sem import process.
