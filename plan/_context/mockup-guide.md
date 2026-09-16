# Mockup guide — how every page mockup is built

Read `brief.md` first, then `final-ia.json` (the page you are assigned is one entry in `pages[]`). This guide tells you how to turn that entry into a rendered image that is on the KHDA Design System.

## 1. Files and commands

- Template to copy: `D:\KHDA wireframe\plan\mockups\_template.html`
- Your mockup: `D:\KHDA wireframe\plan\mockups\<page-id>.html` (page-id = the `id` from final-ia.json)
- Render to PNG (1600px wide canvas, choose the height so nothing is cut off):
  `bash "D:/KHDA wireframe/plan/_tools/render.sh" <page-id> <height>`  → writes `D:\KHDA wireframe\plan\images\<page-id>.png`
  Heights: 1100 (short page), 1300 (typical), 1500 (table-heavy), 1800 (matrix / long list). Nothing may be clipped at the bottom; if the page is taller, raise the height.
- After rendering, **Read the PNG** and fix anything wrong (overflow, overlap, empty panels, clipped text, wrong nav). Re-render. Max 3 iterations.
- A rendered reference of the template: `plan\images\_template.png`. Old wireframe pages for visual continuity: `plan\_old\*.png`.

The mockup is static HTML + CSS only. No JavaScript is needed. Do not load anything from the internet. Assets you may use: `../../assets/gov-dubai.svg`, `../../assets/khda-logo.svg`, `../../assets/campus-cover.jpg`, `../../assets/hero-artwork.png`.

## 2. Design system rules (non-negotiable)

- Link `../../css/khda.css` first, then `_mock.css`. Use their classes; add page-specific CSS only in the `<style>` block and only with the CSS variables (`var(--primary)`, `var(--outline)` …). Never hard-code new colours.
- Font is Dubai (installed on this machine; headless Chrome renders it). Type scale: title 40/48 light, section 24/32 or 20/28, body 16/24, caption 14/20, small 12/16.
- Keep the portal header exactly as in the template (crest + Dubai Knowledge lockup, nav, search pill, bell, accessibility, العربية, user pill). Set `aria-current="page"` on the current nav item. Use the navigation for the page's role from `final-ia.json` → `navigation`.
- Layout width is the `.page` container (gutter 80). Cards: `.panel` / `.dash-card` (radius 16–24, 1px outline). Tables: `.data-table` (or `.data-table--compact`). Chips: `.chip chip--complete|current|error|warning|pending|neutral|outline`. Buttons: `.btn btn--primary|outline|ghost|tonal` + `btn--md` for 40px. Search: `.search`. Segmented: `.segmented`. Tabs: `.tabs > .tab[aria-selected]`. KPI tiles: `.kpi-grid > .kpi.kpi--primary|success|warning|error|info`.
- Kit components for new concepts (see `_mock.css`): `.journey` (pipeline tracker, horizontal or `--vertical`), `.matrix` (institution × dataset grid, set `--cols`), `.heat--0..5` (field quality), `.timeline` (audit / activity), `.kv` (key–value), `.drawer` + `.drawer-scrim` (right-side sheet), `.modal-host` + `.modal`, `.notif`, `.palette` (command palette), `.map` + `.map__pin`, `.inst-card`, `.code` + `.token` (API pages), `.prog` (bars), `.status--ok|warn|error|info|muted`, `.hstep` (horizontal stepper), `.stepper` (vertical stepper from the old wireframe), `.alert alert--success|error`.
- Status vocabulary → chip: Accepted → `chip--complete`; Processing / In validation → `chip--current`; Needs correction → `chip--error`; Late / Overdue → `chip--warning`; Pending approval / Draft → `chip--pending`; Non-submitted → `chip--neutral`.

## 3. Say what is old / changed / new INSIDE the image

Put a marker on each major component so the image itself tells the reader what is new:
```html
<section class="panel has-mark"><span class="mark mark--new">New</span> …</section>
<section class="panel has-mark"><span class="mark mark--changed">Changed</span> …</section>
<section class="panel has-mark"><span class="mark mark--old">From wireframe</span> …</section>
```
Use them on 3–8 components per page, not on every element.

## 4. Realistic content (never lorem, never "Content…")

Use the facts in `brief.md`. Illustrative numbers are fine but must be internally consistent (e.g. 46 datasets = accepted + processing + needs correction + non-submitted).

**Reporting periods:** current Fall · 2026–2027 (due dates in Sept/Oct 2026); history Fall · 2025–2026, Winter · 2025–2026, Spring · 2025–2026.

**Personas (user pill):**
- Institution: role "Data Steward · BITS Pilani", name "Noura Al Khatib". Approver: "Registrar · BITS Pilani", "Dr. Rania Haddad". Institution admin: "Institution Admin", "Khalid Mansoor".
- KHDA Data: role "KHDA Data · Analyst", name "Fatima Al Marri". Supervisor: "KHDA Data · Lead", "Saeed Al Hammadi".
- KHDA IT: role "KHDA IT · Integration", name "Omar Haddad".

**Institutions (illustrative, Dubai campuses):** BITS Pilani (Academic City, Wave 2), American University in the Emirates — AUE (Academic City, Pilot Wave 1), Abu Dhabi University (Knowledge Park, Pilot 1), American University in Dubai (Media City, Pilot 1), Amity University (Academic City, Pilot 1), Hult International Business School (Internet City, Pilot 1), University of Wollongong in Dubai (Knowledge Park, Pilot 1), Manipal Academy (Academic City, Pilot 1), Curtin University Dubai (Academic City, Wave 2), Murdoch University Dubai (Knowledge Park, Wave 2), Heriot-Watt University Dubai (Knowledge Park, Wave 2), Middlesex University Dubai (Knowledge Park, Wave 2), Symbiosis (Knowledge Park, Wave 2), DIDI (Design District, Wave 2), EM Normandie (Wave 2), London Business School (DIFC, Wave 2), Istituto Marangoni (DIFC, Wave 2), ESCP (Wave 3), British University in Dubai (Academic City, Wave 3), Plekhanov (Wave 3), Georgetown (DIFC, Wave 3), Luiss (Trade Centre, Wave 3), Saint Joseph (Academic City, Wave 3), University of Europe (Trade Centre, Wave 4), American University of Beirut (Wave 4).

**The 46 datasets — always use the display name, never the raw code (this is one of the competitor's failures):**

| Display name | Group | Fields | Code / sheet |
|---|---|---|---|
| Applicants - Basic Details | Semester | 9 | APPLICANTS_BASIC_DETAILS |
| Graduates | Semester | 38 | GRADUATES |
| Employee - Basic Details | Semester | 33 | EMPLOYEE_BASIC_DETAILS |
| Employee - Workload | Semester | 30 | EMPLOYEE_WORKLOAD_B |
| Students - Attrition | Semester | 19 | STUDENTS_ATTRITION |
| Students - Enrollments | Semester | 72 | STUDENTS_ENROLLMENTS |
| Students - Internship | Semester | 39 | STUDENTS_INTERNSHIP |
| Students - Scholarship | Semester | 20 | STUDENTS_SCHOLARSHIP |
| Students - Students of Determination (SOD) | Semester | 16 | SOD |
| Courses | Semester | 27 | COURSES |
| Course Faculty | Semester | 16 | COURSE_FACULTY_B |
| Graduate Licensure | Semester | 18 | GRADUATES_LICENSURES |
| Students - Research | Semester | 33 | STUDENTS_RESEARCH |
| Institute - Leadership Contact Information | Annual | 15 | INSTITUTE_LEADERSHIP |
| Institute - Partnerships | Annual | 23 | INSTITUTE_PARTNERSHIPS |
| Institute - Scholarly Output | Annual | 15 | INSTITUTE_PUBLICATIONS |
| Institute - Employers | Annual | 13 | INSTITUTE_EMPLOYERS |
| Institute - Startup Spinoffs | Annual | 11 | INSTITUTE_STARTUPS |
| Institute - Intellectual Properties | Annual | 17 | INSTITUTE_IP |
| Institute - Academic Programs | Semester | 56 | INSTITUTE_ACADEMIC_PROGRAMS |
| Institute - Research Units | Annual | 21 | INSTITUTE_RESEARCH_UNITS |
| Program Learning Outcomes | Semester | 8 | PLO |
| Course Learning Outcomes | Semester | 10 | CLO |
| Program Skills | Semester | 9 | SKILLS |
| OBF Self Report | Semester | 102 | OBF_SELF_REPORT |
| Institute - R&D | Annual | 46 | INSTITUTE_RD |
| Institute - R&D Classified Expenditures | Annual | 40 | INSTITUTE_RD_EXPENDITURES |
| Institute - Financials | Annual | 71 | INSTITUTE_FINANCIALS |
| Institute - Research Projects | Annual | 44 | INSTITUTE_RESEARCH_PROJECTS |
| Institute - Events | Semester | 33 | INSTITUTE_EVENTS |
| Institute - Overview | Annual | 52 | INSTITUTE_OVERVIEW |
| Person Profile | Real-time | 22 | PERSON_PROFILE |
| Education Background | Real-time | 24 | EDUCATION_BACKGROUND |
| Academic Program | Real-time | 49 | ACADEMIC_PROGRAM |
| Course | Real-time | 24 | COURSE |
| Student Lifecycle Event | Real-time | 28 | STUDENT_LIFECYCLE_EVENT |
| Graduate Licensure (real-time) | Real-time | 10 | GRADUATE_LICENSURE |
| Scholarship Transaction | Real-time | 9 | SCHOLARSHIP_TXN |
| Internship Transaction | Real-time | 25 | INTERNSHIP_TXN |
| Student Research Transaction | Real-time | 13 | STUDENT_RESEARCH_TXN |
| Students of Determination Transaction | Real-time | 13 | SOD_TXN |
| Employee Profile | Real-time | 11 | EMPLOYEE_PROFILE |
| Employee Workload (real-time) | Real-time | 25 | EMPLOYEE_WORKLOAD |
| Course Faculty (real-time) | Real-time | 9 | COURSE_FACULTY |
| Program Learning Outcomes (real-time) | Real-time | 4 | PLO_RT |
| Course Learning Outcomes (real-time) | Real-time | 4 | CLO_RT |

Subject areas (for grouping): Students & applicants, Graduates, Employees, Programs & courses, Institution, Research & innovation.

**Submission journey (R1 pipeline) — the stages every submission tracker shows:**
1. Received — iPaaS (Integration layer) · 2. Authenticated — Azure API Hub (client id, token, IP allowlist) · 3. Stored — University Adapter (own DB) · 4. Validated — Qlik Data Quality (schema + rules) · 5. Profiled — Qlik DQ (completeness, distributions, outliers) · 6. Processed — Qlik DQ (loaded to warehouse) · 7. Published — Qlik Portal (dashboards, receipt issued).
States per stage: done / current / waiting / error / warning. Show timestamps like "12 Sept 2026, 13:04 (Dubai)".

**Validation issue examples:** "Emp_Institution_Code not in CAA licensed institutions list (row 14, 27, 31)", "Academic_Period must be one of 202600–202605", "Total_Credits cannot exceed Program_Credits (row 8)", "Duplicate primary key Institution Code + Academic Period + Employee ID (rows 3 and 19)", "Graduation_Date cannot be in the future".

## 5. Arabic / RTL page

At least one page in the set is rendered in Arabic. For it: `<html lang="ar" dir="rtl">`, translate the chrome (nav, buttons, labels, chips) into Arabic, keep dataset names and field names in English (the dictionary publishes them in English), and let khda.css mirror the layout. The language pill then reads "English".

## 6. Quality bar (check before you finish)

- Every panel has real content; no placeholders; no clipped text; nothing outside the 1600px canvas; no horizontal overflow.
- The page shows the `keyComponents` and `interactions` listed for it in final-ia.json — if an interaction is a drawer, modal, or palette, show it OPEN on the page (static) so the reader sees it.
- Markers (old / changed / new) present on major components.
- Header nav matches the role; user pill matches the role; current nav item highlighted.
- Numbers add up. Names are display names. Dates are in the Fall 2026–2027 period.
- File saved at the exact path, PNG rendered, and you looked at the PNG.
