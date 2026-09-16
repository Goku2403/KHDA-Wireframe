# KHDA Higher-Education Data Portal — planning brief (context pack for all agents)

Read this fully before doing anything. It is the shared source of truth for the plan.

## 1. What we are doing

We (the team that built the static wireframe in `D:\KHDA wireframe`) are proposing a **new KHDA Higher-Education Data Portal**. A competitor has shown KHDA a demo ("KHDA Data Gateway"). We must produce a plan for a portal that is **clearly better**: more complete, more interactive, more "enterprise", aligned with the KHDA Design System (Dubai Design System v2.2 re-themed for KHDA), and grounded in KHDA's actual Release-1 architecture.

Deliverable of the overall effort: an HTML plan (`plan/index.html`) with one rendered mockup image per page, covering: every page, per role; the workflow/user journey; UX and interaction design; implementation notes; what is **old** (kept from our wireframe), **new**, or **changed**; competitor comparison; suggestions.

## 2. Roles (from KHDA, updated 2026-09-16)

- **Institution** — a licensed higher-education institution (HEI) in Dubai (37 in scope). Submits 46 datasets to KHDA each cycle. Sub-roles we should propose: Institution Admin, Data Steward (prepares), Approver (signs off), Read-only.
- **KHDA Data** — KHDA's data/quality team. Monitors submissions, data quality, compliance, follow-up, dictionary management. **Required capabilities: Chatbot, Remediation report, Analytics.**
- **KHDA IT** — KHDA's integration/IT team. Onboards institutions to the API, manages credentials/whitelisting, watches pipeline health, security, environments. **Required capabilities: Chatbot, Remediation report, Rule engine for all forms.**

**KHDA staff permission tiers** (apply to both KHDA Data and KHDA IT; a user is one team × one tier):

| Tier | Can do | Cannot do |
|---|---|---|
| **Analyst** | Work the queues: view all dashboards/reports, open institutions and submissions, run remediation reports, use the chatbot, draft follow-ups, annotate, propose rule changes / draft rules | Send bulk communications, accept/return submissions, publish rules, change credentials or configuration |
| **Supervisor** | Everything Analyst can, plus: approve/return submissions, approve waivers, send and bulk-send communications, assign owners and escalate, approve rule changes and dictionary versions for publishing, sign off onboarding gates | Manage users/roles, environments, scoring weights, system configuration |
| **Administrator** | Everything Supervisor can, plus: manage KHDA users and tiers, publish rules and dictionary versions, configure scoring weights (with effective date), credentials/IP allowlists/environments, chatbot knowledge sources, audit-log access, system settings | — |

**Cross-cutting KHDA capabilities (both teams):**

- **Chatbot** — an in-portal assistant grounded in the data dictionary, validation rules, submission history and API docs. Answers "why was row 41 rejected?", "which institutions are overdue for Graduates?", "what changed in Dictionary 2027?", drafts follow-up emails, and deep-links to the page that answers the question. The same assistant is offered to institutions with an institution-scoped view. Administrator manages knowledge sources; every answer cites its source.
- **Remediation report** — a generated report per institution × dataset × period (and roll-ups per institution, per dataset, sector): every failing rule with severity, affected rows/fields, sample values, suggested fix, recurrence across periods, owner and SLA age. Exportable (XLSX/PDF), attachable to follow-up emails, and the source of the institution's remediation workbench. KHDA IT uses the same report filtered to pipeline/technical failures (auth, schema, format).
- **Rule engine for all forms** (owned by KHDA IT, rules authored jointly with KHDA Data) — a single rule library that drives every form, upload, API validation and template: rule types = mandatory, type/length, code list, range, cross-field, cross-dataset, primary key/uniqueness, date logic, custom expression. Rules are versioned with effective periods, tested against sample data in a sandbox, published by an Administrator, and applied identically in the portal form, Excel template validation, API validation in the Qlik DQ layer, and the remediation report. Our metadata-driven engine (`js/schema.js`) is the seed of this.
- **Analytics** (KHDA Data) — sector and institution dashboards, DQ analytics (rule hit-rates, top failing rules, profiling anomalies), compliance trends, leaderboard, self-service report builder, scheduled exports/board packs.

## 3. Release-1 architecture (from KHDA's "NEW APPROACH – R1: University → KHDA" diagram)

```
HE (University)
  ├─ existing users ──► School System Portal (legacy application)
  ├─ REST API ───────► iPaaS (Integration Layer)
  │                        │  Secure API access: Auth, Client ID, Secret, Private/Public Key, IP whitelisting
  │                        ▼
  │                    Azure: API Hub (API Management)
  │                        │  Inbound/outbound validation: auth validation, token validation, IP whitelisting
  │                        ▼
  │                    University Adapter / API Service  ("University API stores data in own DB")
  │                        │
  │                        ▼
  │                    Qlik Data Quality Layer (inside Azure): data validation, data profiling, data processing
  │                        │
  │                        ▼
  └─ Dashboards / ◄── Qlik Portal (Dashboards & Reporting): real-time dashboards, KPIs & metrics, self-service reporting
     reporting access

On-Prem School System (MSSQL: school data, user data, academic data, reference data) ──(data access via Qlik)──► Qlik DQ layer
                                                                                        ──► SaaS platform (Snowflake / SaaS data warehouse)
```

**Instruction from the user: "consider Qlik is the portal we are going to build".** So the portal we plan = the Qlik Data Quality layer + Qlik Portal (dashboards, reporting) surfaced as a web application for the three roles. Institutions submit via REST API through iPaaS → API Hub → adapter; an Excel/portal upload bridge exists for exception-approved institutions. Every submission flows through validation → profiling → processing. The portal must make this pipeline visible (a submission "journey" tracker per submission), and expose the security model (client ID, secret, keys, IP whitelisting) as manageable objects for KHDA IT and self-service views for institutions.

## 4. Scale and data facts

- 37 institutions × 46 datasets = 1,702 catalogue rows per reporting period.
- 46 datasets from the HEDB Data Dictionary 2026: 19 Semester, 12 Annual, 15 Real-time (event-based). 1,226 fields total. 44 referenced code lists (Institutional Codes, Universities, Country, Academic Period …). 26 datasets declare a primary key.
- Subject areas used by the competitor: Employees (4), Graduates (3), Institution (7), Programs & courses (11), Research & innovation (7), Students & applicants (14).
- Reporting periods: Fall / Winter / Spring per academic year (e.g., Fall 2026–2027).
- Statuses: non-submitted, processing, needs correction, accepted. Channels: API, portal upload.
- Onboarding waves: Pilot Wave 1 (7), Wave 2 (14), Wave 3 (13), Wave 4 (3).

## 5. The competitor build ("KHDA Data Gateway") — what it has, what it lacks

Screens seen (20 screenshots at `C:\Users\GokulImayavaramban\Downloads\EPortal Sample\image (9..28).png`):
- Sign-in with institution picker, UAE PASS, Active Directory for staff, animated Dubai campus map (37 workspaces).
- Institution Home: KPI tiles (Total 46 / Submitted / Non-submitted), submission gauge, dataset agenda (Upcoming/Overdue/Real time tabs), quick services (Data dictionary, API docs "Link pending", Remediation), leaderboard link, dark mode.
- Dataset catalogue grouped by subject area / frequency / flat, with columns Frequency, Due, Submission status, Freshness, Upload (DISABLED "Not available"), Remediation (open issue counts), Details.
- Dataset specification drawer (field, type, rule, dictionary row, reference sheet).
- Leaderboard: rank, readiness score /1000 = Coverage 400 + Data quality 250 + Timeliness 200 + Automation 150, podium, full rankings, per-row breakdown with formulas, "Your next move", ranking-over-time chart, formula spec panel.
- KHDA Home ("API integration Overview"): Total HEIs 37 / Compliant 2 / Needs follow-up 35; onboarding overview by wave (owner, commitment, blocker); entity submissions table (outstanding, DQ score, submissions missed, contact & next step, View datasets, Send email, Compliance history); sector gauge 1,099/1,702.
- Dataset agenda drawer (per institution): due date, last submission with timestamp and channel, status, next step.
- Send email drawer with branded preview — "Preview only. Email sending is not enabled."; Bulk send disabled.
- Monitor: cards view grouped by wave; 37×46 compliance matrix (one square per institution × dataset) with legend; institution detail with Onboarding journey (Touch Point 1–6 ALL "Not available") + next in agenda + upcoming semesters.
- Compliance history: reporting periods, datasets received, recurring corrections, on-time compliance "Not available"; submission trend bars; period-by-period table (Required/Late/Missing all "—").

Verified weaknesses (use these to beat it):
1. Every action is a stub: Upload disabled, email cannot send, API docs pending. Display-only product.
2. Scoring model flawed: Timeliness rewards ≥30-days-early only, ignores lateness, and no-due-date datasets sit in the denominator (top institution 70/200). Data quality / timeliness / automation divide by *what was submitted* → an institution ranked #33 with 9/46 accepted gets a perfect 150/150 automation. Ties broken by institution code.
3. Touch Points 1–6 empty; all owners are "Demo … team".
4. 15 real-time datasets have no display names (raw codes leak: STUDENT_LIFECYCLE_EVENT, SOD_TXN, EMPLOYEE_PROFILE…).
5. Compliance history cannot measure compliance (Required/Late/Missing/On-time all unavailable; no requirements/deadline table).
6. No Arabic / RTL, no accessibility panel, no roles/multi-user, no maker–checker approval, no audit trail, no versioning/resubmission history, no validation detail (only "13 open issues"), no notifications feed, no schema versioning, no saved views, no exports/board packs, no API sandbox, no waiver/exception workflow, no escalation engine, no global search, charts without axes, minor defects ("1 days late").

Competitor strengths to match or exceed: clean visual hierarchy, transparent score formulas, compliance matrix, compliance history trend, per-institution agenda drawer, spec drawer with dictionary rows, dark mode, branded email preview, honest empty states.

## 6. Our existing wireframe ("old") — what to keep

Location `D:\KHDA wireframe` (static HTML/CSS/JS, no framework). Pages: `dashboard.html`, `submissions.html` (catalogue of 46 dataset cards), `choose.html` (bulk upload vs form), `index.html?sheet=` (data entry, 2-step: Enter records → Review & submit, vertical stepper), `report.html?sheet=` (statistics tiles, analytics bars, data grid). Rendered screenshots in `plan/_old/*.png`.

Assets we already have and MUST carry forward (they beat the competitor):
- **Metadata-driven engine**: form, validation, grid columns, Excel template (with real dropdowns/named ranges), report and charts all derived from each dataset's field metadata (`js/datasets.js`, `js/schema.js`, `js/lists.js`). Nothing hand-coded per dataset. Dictionary 2027 = data change, not code change.
- **English + Arabic with full RTL** (`js/i18n.js`, 791 lines), stored in `localStorage khda.lang`.
- **Accessibility panel** (`js/a11y.js`): page size, higher contrast, more spacing, underline links, reduce motion, skip link, focus management.
- Excel template generator (`js/template.js`), upload (.xlsx/.xls/.csv) with duplicate-key skipping and row error flagging, export everything workbook (`js/export.js`).
- Validation from the dictionary: mandatory, coded lists, numeric limits, text length, cross-field "cannot exceed", dates, primary-key duplicates.
- Dashboard cards: highlights carousel, remediation queue, institution card, quick actions, submission progress half-ring, submission calendar, analytics meters, recent activity log.
- Portal header with Dubai Government crest + Dubai Knowledge lockup, EN/AR toggle, accessibility button, account pill.
- Only ONE role exists today (institution). No KHDA side. No API/integration surfaces. No leaderboard, matrix, compliance history, notifications, approvals.

## 7. KHDA Design System facts (DDS v2.2 re-themed for KHDA) — align everything to this

Tokens (from `css/khda.css`, derived from Figma "KHDA DS Core (DDS v2.2)" file YqPRSxUXoL7poAt9jvulVC):
- Primary #A8305C (hover #8E2650, pressed #7A1D42), primary-container #FFECF0 / on #881545.
- Error #C0000A (container #FFECEA), Success #0D6D2D (container #E3F6E7), Info #006687 (container #E6EFF7), Warning #C78200 (container #FFEEDD). Secondary #585E71.
- Surfaces: #FFFFFF, surface-dim #F5F3F7, surface-bright #FBF8FD, table-head #FAF9FB. Outline #E4E2E6, outline-variant #C0C6CF, divider #DDE2EB. Text #000 / strong #1B1B1F / secondary #4B4546 / muted #5E5E62.
- Status chips: In Progress #E6C9FF/#9925FF, Completed #C6FFC7/#00531F, Draft #E2F3FF/#3081E0, Delayed #FFEDEA/#930005, Action Required #FFEEDD/#643F00.
- Elevation-2 `0 4px 12px rgba(0,0,0,.10)`, elevation-3 `0 8px 24px rgba(0,0,0,.14)`, focus ring `0 0 0 3px rgba(168,48,92,.25)`.
- Font: **Dubai** (Regular 400, Light 300), fallback Segoe UI / Helvetica Neue / Arial. Type scale: Display 68/80, H1 48/56, H2 40/48, H3 32/40, H4 28/32, H5 24/32, H6 20/28, Body 16/24, Caption 14/20 (+0.14 tracking), Small 12/16 (+0.24).
- Layout: 1440/1600 canvas, header gutter 48, content gutter 80, sections 64 apart; page bg #F5F5F5 with a mint/pink gradient wash top-right; nav 16/24 active #A8305C with underline; cards radius 12–16; tables radius 12, header #FBF8FD, header pad 16/24, cells 12/24, 64px rows; buttons 48px tall pad 16/12; chips 14/20; stepper cards 374×68 r8 stroke #E4E2E6.
- Patterns to reuse from Figma Portal Delivery file (fmaRjmcD2geFcOlJbRVeYJ): Service Task Template (stage tabs, vertical stepper, form sections, Back / Save & Exit / Next-Submit footer); form sections with left icon rail, centred title, grey inline add/edit panel → saved white cards with chips; confirm-deletion modal; right-side celebration tray; milestone tracker; default-dashboard chooser; portal tour; teacher dashboard widgets.
- The CSS file `D:\KHDA wireframe\css\khda.css` (1,080 lines) is the implementation of these tokens and components (portal header, nav, cards, chips, buttons, tables, stepper, forms, toast, a11y modes, RTL). Mockups must link to it.

## 8. Constraints for the plan

- Wireframe fidelity is fine; the plan must still look like a KHDA product (Dubai font, maroon primary, DDS spacing).
- Everything must work in English and Arabic (RTL); the plan should show at least one Arabic/RTL mockup.
- Every page must belong to a role (Institution / KHDA Data / KHDA IT) or be shared, and must state: purpose, key components, interactions, data it needs, status (old / new / changed), how it beats the competitor.
- The pipeline from §3 must be visible in the product (submission journey tracker, integration health, credential management).
- Be honest: do not invent KHDA facts beyond §3–§7. Illustrative numbers are fine when labelled as examples.
