# KHDA Higher-Education Data Portal — Final Development Plan

Version 1.0 · 2026-09-16 · Source of truth for the proposal and the build. Companion files: `plan/_context/brief.md` (context), `plan/_context/architecture.json` (pipeline, security objects, roles, data model), `plan/_context/audit-competitor.json` (what to match / beat), `plan/_context/mockup-guide.md` (how mockups are produced).

---

## 1. Goal and positioning

Deliver a KHDA Higher-Education Data Portal that is clearly better than the competitor's "KHDA Data Gateway" demo on four axes they cannot answer quickly:

| Axis | Competitor | Ours |
|---|---|---|
| Actions | Display-only (Upload, Send, Bulk send, API docs are stubs) | Every action works or shows an honest disabled reason |
| Roles | One institution view + one staff view | Institution (4 sub-roles) · KHDA Data · KHDA IT, each with Analyst / Supervisor / Administrator tiers |
| Pipeline | "Processing" black hole | Submission Journey tracker across the R1 pipeline (Source → iPaaS → API Hub → Adapter → Validation → Profiling → Processing → Published) |
| Compliance | Required / Late / Missing / On-time "Not available" | Requirement table (37 × 46 per period) so compliance is computed, never unavailable |

Plus what we already have and they do not show: metadata-driven forms, validation, Excel templates with real dropdowns, upload, export, English + Arabic RTL, accessibility panel, KHDA Design System fidelity.

---

## 2. Roles and permissions

```
Institution ─┬─ Institution Admin   profile, users, credentials, waivers, audit
             ├─ Data Steward        prepares submissions (API / form / upload), fixes, resubmits
             ├─ Approver            maker-checker sign-off before dispatch
             └─ Read-only           dashboards, status, history

KHDA ────────┬─ KHDA Data   Chatbot · Remediation report · Analytics
             └─ KHDA IT     Chatbot · Remediation report · Rule engine for all forms
                 each KHDA user = one team × one tier:
                 Analyst (work queues, draft) → Supervisor (approve, send, escalate) → Administrator (publish, configure, users)
```

Tier gating rules used throughout the pages:

| Action | Analyst | Supervisor | Administrator |
|---|---|---|---|
| View dashboards, reports, matrix, history, journeys | ✓ | ✓ | ✓ |
| Run / export remediation report; use chatbot; annotate | ✓ | ✓ | ✓ |
| Draft rules, draft follow-up emails | ✓ | ✓ | ✓ |
| Accept / return submissions; approve waivers | – | ✓ | ✓ |
| Send / bulk-send communications; assign owners; escalate | – | ✓ | ✓ |
| Approve rule changes and dictionary versions | – | ✓ | ✓ |
| Publish rules / dictionary versions; scoring weights | – | – | ✓ |
| KHDA users & tiers; credentials; IP allowlists; environments; chatbot sources; audit log | – | – | ✓ |

---

## 3. Final page inventory

Legend — **Keep**: exists in the wireframe, carried forward · **Changed**: exists, extended · **New**: not in the wireframe. Phase per §9.

### 3.1 Shared shell (every page)

Government of Dubai crest + KHDA mark · role-aware navigation · reporting-period selector (Fall / Winter / Spring · academic year) · global search (datasets, institutions, receipt / correlation IDs) · notifications · chatbot panel · EN / AR · accessibility panel · light / dark · workspace + role chip · sign-out · footer.

### 3.2 Institution

| ID | Page | Status | Phase | Key content |
|---|---|---|---|---|
| I-0 | Sign-in | New | 1 | Institution picker, UAE PASS; Active Directory for KHDA staff; live sector-readiness strip (data, not decoration) |
| I-1 | Home | Changed (`dashboard.html`) | 1 | 4-state KPI tiles (total / submitted / accepted / needs correction), progress ring, agenda tabs Upcoming / Overdue / Real-time with due-date blocks, next-best-action panel, in-flight journey mini-trackers, notifications, highlights carousel, institution card (kept) |
| I-2 | Catalogue | Changed (`submissions.html`) | 1 | Cards ⇄ Table toggle; group by subject area / frequency / flat; columns frequency, due, status, freshness + channel, open issues, version; favourites, all-field search, Export everything (kept) |
| I-3 | Dataset detail drawer | New | 1 | Tabs: Specification (field, type, rules, dictionary row, code-list links) · Submissions (receipt history, versions) · Issues · Journey |
| I-4 | Choose channel | Keep (`choose.html`) | 2 | Third card: API dispatch (client ID, environment, trigger from source system) |
| I-5 | Data entry / Bulk upload | Keep (`index.html`) | 2 | Approver step (maker-checker), version stamp, submit for approval |
| I-6 | Remediation workbench | New | 2 | Errors grouped rule → row → field, severity chips, fix in place, bulk fix for coded values, download error report, resubmit as v2; fed by the Remediation report |
| I-7 | Submission journey | New | 2 | One receipt across the 8 pipeline stages; timestamps, correlation IDs, SLA per stage, failure codes, "Fix it" link |
| I-8 | Report | Keep (`report.html`) | 3 | Period comparison, sector benchmark line |
| I-9 | Leaderboard | New | 1 | Corrected scoring model (§6), podium, paginated rankings with breakdown, my next moves, ranking over time, "how it is calculated" |
| I-10 | Integration | New | 3 | API credentials (read-only), IP allowlist requests, sandbox tester, live API docs (OpenAPI) |
| I-11 | Users & roles | New | 3 | Invite, assign Steward / Approver / Read-only, audit trail |
| I-12 | Waivers & exceptions | New | 3 | Channel exception, deadline extension, not-applicable; status and history |

### 3.3 KHDA Data

| ID | Page | Status | Phase | Key content |
|---|---|---|---|---|
| D-1 | Sector home | New | 1 | Total HEIs / Compliant / Needs follow-up / At risk; sector gauge 1,099 / 1,702; follow-up queue with reason codes and SLA age; onboarding overview by wave |
| D-2 | Monitor — Cards / Matrix | New | 1 | 37 × 46 heat-map with click-through to journey; filter by wave / status / dataset; saved views; export PNG / XLSX |
| D-3 | Institution monitor | New | 2 | Agenda drawer, receipt history, contacts, working email / notification composer (To / CC, templates, attachments, delivery log), notes and activity log |
| D-4 | Compliance history | New | 1 | Computed Required / Received / Accepted / Late / Missing / On-time per period, recurring corrections, waivers, board-pack export |
| D-5 | Analytics studio | New | 2 | Sector and institution dashboards, DQ analytics (rule hit-rates, top failing rules, profiling anomalies), compliance trends, self-service report builder, scheduled exports |
| D-6 | Dictionary & schema versions | New | 3 | 2026 → 2027 diff, effective dates, impact per institution |
| D-7 | Leaderboard admin | New | 3 | Weight configuration with effective date and version history; preview before publish |
| D-8 | Remediation report | New | 2 | Per institution × dataset × period with roll-ups; failing rule, severity, rows / fields, sample values, suggested fix, recurrence, owner, SLA age; XLSX / PDF; attach to follow-up |

### 3.4 KHDA IT

| ID | Page | Status | Phase | Key content |
|---|---|---|---|---|
| T-1 | Onboarding board | New | 2 | Waves as managed objects; named Touch Points 1–6 with dates, owners, evidence, go-live gates |
| T-2 | Institution credentials | New | 2 | Client ID / secret rotation (reveal-once) / key upload / IP allowlist / sandbox vs production |
| T-3 | API health | New | 3 | Calls, error rate, latency, auth failures per institution and pipeline stage; alerts |
| T-4 | Environments & releases | New | 3 | Sandbox / production, schema version per environment, maintenance windows |
| T-5 | Audit log | New | 3 | Every credential, waiver, role, rule and configuration change |
| T-6 | Rule library (rule engine) | New | 2 | List, versions, effective periods, sandbox test against sample rows, approve (Supervisor), publish (Administrator); applied identically to form, template, API validation, remediation report |
| T-7 | KHDA users & tiers | New | 3 | Administrator only: teams, tiers, deactivate, AD sync |
| T-8 | Remediation report — technical view | New | 2 | D-8 filtered to auth, IP, schema, format, adapter failures per institution and environment |

### 3.5 Cross-cutting

| ID | Capability | Phase | Surface |
|---|---|---|---|
| X-1 | Chatbot | 2 | Persistent panel on every page; grounded in dictionary, rules, receipts, API docs; cites sources; deep-links; drafts emails; institution-scoped for HEIs; Administrator manages knowledge sources |
| X-2 | Submission Journey component | 1 | Reused in I-1, I-3, I-7, D-2, D-3, T-3 |
| X-3 | Status chips (one vocabulary) | 1 | Dataset: Not started · Draft · Awaiting approval · Dispatched · In validation · Needs correction · Accepted · Waived · Late-accepted. Institution: Compliant · Needs follow-up · At risk · Blocked |
| X-4 | Notifications feed | 2 | In-app + email; per-role preferences |

Totals: Institution 13 · KHDA Data 8 · KHDA IT 8 · cross-cutting 4 = **33 pages / components**, of which 5 are kept or changed from the current wireframe.

---

## 4. Key workflows

1. **Submit via API** — Steward triggers dispatch from source system → iPaaS → API Hub (auth, IP, token) → adapter persists → Qlik validation → profiling → processing → Accepted / Needs correction; each stage stamped on the Journey (I-7); institution notified (X-4).
2. **Submit via portal (exception-approved)** — Choose channel (I-4) → form or Excel upload with template validation (I-5) → Steward submits for approval → Approver signs off → dispatched into the same pipeline as (1).
3. **Remediate** — Needs correction → Remediation report generated (D-8) → institution workbench (I-6) fix in place or bulk fix → resubmit as new version → journey restarts → history keeps every receipt.
4. **KHDA follow-up** — Sector home queue (D-1) → institution monitor (D-3) → email composer with remediation report attached → Supervisor sends / bulk-sends → delivery log → SLA timer → escalation.
5. **Acceptance decision** — After processing, Analyst reviews DQ output, Supervisor accepts or returns with reason; compliance history (D-4) and leaderboard (I-9) update.
6. **Rule change** — Analyst drafts rule in library (T-6) → sandbox test against sample rows → Supervisor approves → Administrator publishes with effective period → form, template, API validation and remediation report all pick it up.
7. **Onboarding** — Administrator allocates wave (T-1) → touch points with owners and dates → credentials issued (T-2) → sandbox test → go-live gate → production enabled.
8. **Dictionary version** — KHDA Data publishes 2027 (D-6) → diff and impact shown per institution → rule library versions aligned → templates regenerate (no code change, as today).
9. **Ask the chatbot** — "Why was row 41 rejected?" → cites rule + dictionary row → links to the workbench row.

---

## 5. Design system and UX standards

- KHDA DS / Dubai Design System v2.2: Dubai typeface (12 / 14 / 16 / 20 / 24 / 28 / 32 / 40 / 48 / 68), Primary #A8305C, tokens already in `css/khda.css`; buttons per Figma "New Buttons" (XL 56 / L 48 / M 40 / S 32 / Link).
- Layout: 1440 canvas, 80 px content gutter, 64 px between sections, cards radius 12–16, table header #FBF8FD, rows 64 tall.
- Every chart has axes, labelled values, a sector benchmark line and an export action (dataviz rules).
- Empty states say what is missing, who provides it and when ("Touch Point 3 — credentials · awaiting KHDA IT · due 12 Oct"), never "Not available".
- Real-time datasets always show display name + code as secondary text (no raw `SOD_TXN` leaks).
- Bilingual EN / AR with RTL from the first mockup; accessibility panel; dark theme defined as DS tokens under `[data-theme="dark"]`.
- Honest actions: every control performs its action or is disabled with a reason and a link to the request that unblocks it.

---

## 6. Scoring model (replaces the competitor's)

| Measure | Max | Ours | Their flaw fixed |
|---|---|---|---|
| Coverage | 400 | Accepted ÷ required (waived excluded) | — |
| Data quality | 250 | Accepted rows ÷ validated rows, weighted by dataset size | Unweighted |
| Timeliness | 200 | On-time ÷ required-with-due-date; lateness deducts (−1 pt / day, floor 0); event datasets excluded | Rewards ≥30-days-early only, ignores lateness, no-due-date datasets in denominator |
| Automation | 150 | API ÷ required | ÷ submitted → #33 with 9 / 46 accepted scores 150 / 150 |

Ties: coverage → timeliness → data quality (never institution code). Weights versioned with effective dates (D-7); sector benchmark line on every chart; formulas and worked example shown on the leaderboard as they do, but correct.

---

## 7. Data model (entities the pages read)

Institution · User · Role / Tier · ReportingPeriod · Dataset · Field · CodeList · Rule (versioned, effective period) · Requirement (Institution × Dataset × Period: due date, applicability, waiver) · Submission (receipt, version, channel, client ID, environment, correlation ID) · JourneyStage (per submission: stage, state, timestamps, failure code) · ValidationIssue (rule, severity, row, field, value, suggested fix) · RemediationReport · Waiver · Communication (email / notification, delivery log) · OnboardingWave · TouchPoint · Credential (client ID, secret, key, IP) · ScoreSnapshot (per institution per period) · AuditEvent. Full field lists: `architecture.json` → `dataModel`.

---

## 8. Technical approach

**Now (proposal + interactive wireframe)** — static HTML / CSS / JS, no framework, as today. Metadata-driven engine (`js/datasets.js`, `js/schema.js`, `js/lists.js`) extended with: `js/requirements.js` (period × dataset due dates), `js/journey.js` (pipeline stages, mock timestamps), `js/rules.js` (rule library read by form, template, validator), `js/score.js` (leaderboard model), `js/roles.js` (role / tier switch in header, gates controls), `js/chatbot.js` (scripted assistant over dictionary + rules + local receipts). Demo data seeded for 37 institutions × 46 datasets × 4 periods so KHDA-side pages are never empty. All state in `localStorage`, one `?role=` switch for demos.

**Later (build)** — per the R1 architecture: institutions submit through iPaaS → Azure API Hub → adapter → Qlik Data Quality layer; Qlik Portal provides dashboards and self-service reporting; the web application (this design) fronts both with role-based access (UAE PASS for institutions, Active Directory for KHDA), the rule library feeding the Qlik DQ layer, and the remediation report generated from DQ output. The wireframe's metadata engine becomes the specification for the rule engine.

---

## 9. Phases

| Phase | Scope | Outcome |
|---|---|---|
| **P0 — Proposal pack** (now) | IA file, DS additions, 16 mockups, `plan/index.html` | Proposal that visibly beats every competitor screen and shows three roles |
| **P1 — Parity+ wireframe** | I-0, I-1, I-2, I-3, I-9, D-1, D-2, D-4, X-2, X-3 | Interactive wireframe matching every competitor screen, each better |
| **P2 — Differentiators** | I-4, I-5 (approval), I-6, I-7, D-3, D-5, D-8, T-1, T-2, T-6, T-8, X-1, X-4 | Working actions, journey, remediation, rule engine, chatbot, onboarding |
| **P3 — Enterprise completeness** | I-8, I-10, I-11, I-12, D-6, D-7, T-3, T-4, T-5, T-7 | Governance, security, versioning, audit |

### P0 work breakdown (immediate)

| # | Task | Output | Effort |
|---|---|---|---|
| 1 | Write `plan/_context/final-ia.json` from §3 (id, role, tier gates, nav, sections, old / new / changed, competitor-beats notes) | IA file the mockup guide expects | 0.5 day |
| 2 | Extend `css/khda.css`: 4-state / 9-state status chips, KPI tile, journey stepper, matrix cell, sparkline container, drawer, tier chip, dark tokens; fold in the pending button-scale change | DS ready for mockups | 1 day |
| 3 | Mockups (16): I-0, I-1, I-2, I-3, I-6, I-7, I-9, D-1 (with chatbot panel open), D-2 matrix, D-3, D-4, D-8, T-1, T-2, T-6, + I-1 in Arabic RTL; two of them rendered dark | `plan/images/*.png` via `render.sh`, reviewed | 4 days |
| 4 | Build `plan/index.html`: goal, roles & tiers, per-role journeys, per-page mockup + old / new / changed + why better, competitor comparison table (from audit), scoring-model comparison, phases, technical approach | Proposal page | 1.5 days |
| 5 | Review pass against `audit-competitor.json` → `mustMatch` / `mustBeat` checklists; fix gaps | Sign-off | 0.5 day |
| 6 | Commit and push at each milestone | GitHub history | — |

≈ 7.5 working days for P0. P1 ≈ 3 weeks, P2 ≈ 5 weeks, P3 ≈ 3 weeks of wireframe work (single developer; halve with two).

---

## 10. Acceptance — how we know it beats them

- Every one of the 10 competitor screens has a counterpart mockup that is at least as complete **and** shows one thing theirs cannot (a working action, a role gate, a journey stage, a computed compliance figure).
- All `mustMatch` items in `audit-competitor.json` are ticked; every `mustBeat` item is visible in at least one mockup.
- Three roles and three tiers demonstrable from one header switch.
- Zero "Not available" empty states without an owner and a next step.
- Arabic RTL and dark theme each shown on at least one mockup.
- No raw dataset codes without a display name.

---

## 11. Risks and assumptions

| Risk / assumption | Mitigation |
|---|---|
| Reporting-period due dates are not in the dictionary | Requirement table is illustrative in the wireframe; flagged as KHDA input in the plan |
| Qlik is the reporting portal; the web app must not duplicate Qlik dashboards | Analytics studio (D-5) is positioned as the shell that embeds / links Qlik; wireframe shows the frame, not a Qlik clone |
| Chatbot answers must be trustworthy | Scripted over structured sources with citations; no free-form generation in the wireframe |
| Scope size (33 pages) | Phased; P0 proves the story with 16 mockups; P3 can slip without weakening the proposal |
| Competitor may add working actions before evaluation | Our lead is roles, journey, compliance computation and rule engine — structural, not cosmetic |

---

## 12. Immediate next actions

1. Approve this plan (or edit §3 / §9).
2. Decide the pending button-scale CSS change (keep / revert) — it folds into task 2.
3. Start task 1 (`final-ia.json`) and task 2 (DS additions) — they unblock the mockups.
