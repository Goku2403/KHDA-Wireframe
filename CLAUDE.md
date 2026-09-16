# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static HTML/CSS/JS wireframe of the KHDA HEDB higher-education data submission portal. **No build step, no package manager, no dependencies, no tests.** Every file is served as-is. `README.md` is a long, detailed functional spec — read the section relevant to your task before changing behaviour.

The git repo root is `KHDA-Wireframe/`; `D:\KHDA` is just the parent folder.

## Running

Pages use relative paths, so they must be served, not opened as `file://`:

```bash
python -m http.server 8765
```

Then <http://localhost:8765/dashboard.html>. `.claude/launch.json` defines this same server as the `khda-wireframe` launch config.

To verify a change, load a page and use the demo data: type `qwerty` (outside any form field) then Enter to reveal the **Demo data** button, or append `?demo=on`, or press `Ctrl+Shift+D`, or call `KHDA_DEMO.seed()` in the console.

## Architecture

### Metadata-driven: nothing is hand-coded per dataset

One set of pages serves all **46 datasets / 1,226 fields / 44 code lists** from the HEDB Data Dictionary 2026 (31 Periodic, 15 Real-time). The form, validation, grid columns, Excel template, report and charts are all *derived*. Adding a per-dataset special case is the wrong shape for this codebase — extend the derivation instead.

The data flow is a strict three-layer stack:

1. **Generated metadata** — `js/datasets.js` (`window.KHDA_DATASETS`, 330 KB) and `js/lists.js` (`window.KHDA_LISTS`, 205 KB). Machine-generated from `HEDB_Data_Dictionary_2026 1 (2).xlsx` (not in the repo). **Never hand-edit these.** Deliberate deviations from the dictionary belong in `schema.js` as named, commented rules.
2. **Derivation** — `js/schema.js` (`window.KHDA_SCHEMA`) turns raw field metadata into descriptors: control type, mandatory flag, length/number limits, dropdown options, primary key, cross-field rules, grid columns, measure detection. Public API: `get, validate, pkOf, dupKeyOf, sampleRecord, display, measureFields, sections, GRID_COLS, all`.
3. **Page controllers** — one per page, each an IIFE that reads `KHDA_SCHEMA`.

Two rules in `schema.js` are deliberate overrides, not parse bugs, and are commented as such — preserve them:

- `OPTIONAL_DESPITE_DICTIONARY` makes **Last Updated** optional even though 29 sheets mark it non-nullable (it is a system stamp, not something an institution types).
- Repeated database column names within a sheet get suffixed (`Contact_Email_2`), so template headers stay distinct and an upload cannot feed two fields from one column.

### Scripts are classic IIFEs, not modules — load order matters

Every JS file is an IIFE that hangs a global on `window`. There is no bundler and no `import`. If you add a module, add its `<script>` tag to **each** page that needs it, after its dependencies.

| Global | File | Role |
|---|---|---|
| `KHDA_DATASETS` / `KHDA_LISTS` | `datasets.js` / `lists.js` | generated metadata |
| `KHDA_SCHEMA` | `schema.js` | derivation engine (needs the two above) |
| `KHDA_I`, `window.t()`, `window.khdaToast` | `i18n.js` | EN/AR dictionary, `data-i18n` tagging, portal header, toasts |
| `KHDA_A` | `a11y.js` | accessibility panel, skip link |
| `KHDA_ACTIVITY` | `activity.js` | activity log the dashboard reads |
| `KHDA_XLSX` | `template.js` | dependency-free OOXML writer |
| `KHDA_EXPORT` | `export.js` | whole-submission workbook, plus the cycle windows the dashboard calendar draws |
| `KHDA_DEMO` | `demo.js` | demo cycle seed/clear |
| `KHDA_CHOOSE` | `choose.js` | the bulk-vs-form step overlay |
| `khdaFit` | `fit.js` | page zoom |
| `khdaRowMenu` / `KHDADatePicker` | `rowmenu.js` / `datepicker.js` | widgets |

### Pages to controllers

| Page | Controller | Notes |
|---|---|---|
| `dashboard.html` | `dashboard.js` | landing page; every card derives from drafts + metadata |
| `submissions.html` | `catalogue.js` + `choose.js` | dataset catalogue; also hosts the step overlay |
| `index.html` | `app.js` | data entry; `?sheet=<sheet>&mode=bulk\|form&edit=<id>` |
| `report.html` | `report.js` | statistics, analytics bars, data grid |
| `choose.html` | — | **redirect shim only.** It `location.replace`s to `submissions.html?choose=<sheet>`. The README still describes it as a standalone step page; the step now runs as an overlay over the catalogue. |

`js/data.js` is dead code — no page loads it and nothing reads `window.KHDA_DATA`.

### State lives entirely in localStorage

There is no backend. Keys:

| Key | Written by |
|---|---|
| `khda.hedb.<sheet>.v1` | `app.js` — per-dataset draft: `records`, `step`, `submittedAt` |
| `khda.activity.v1` | `activity.js` — capped at 60; same-action runs within 10 min fold into one entry |
| `khda.lang` | `i18n.js` |
| `khda.a11y.v1` | `a11y.js` |
| `khda.submissions.favourites` | `catalogue.js` |
| `khda.demo.v1`, `khda.demo.reveal` (sessionStorage) | `demo.js` |

A dataset counts as submitted once `submittedAt` is stamped; changing any record afterwards clears it, and the dashboard shows the dataset as open again.

## Conventions

- **Cache-busting**: every `<link>` and `<script>` carries `?v=20260920f`. When you change a CSS or JS file, bump this string in **all** HTML files together, or a reviewer gets a stale cached copy.
- **Design tokens only**: `css/khda.css` defines ~480 CSS variables from the KHDA Design System (DDS v2.2) in `:root`. Use `var(--primary)`, `var(--outline)`, `var(--chip-done)` and so on. Never hard-code a new colour. The section comments carry the Figma frame ids and exact measurements each rule implements — keep them accurate when you change a value.
- **Bilingual**: every user-visible string goes through `t('key')` or a `data-i18n` attribute and needs an entry in **both** the `en` and `ar` blocks of `js/i18n.js`. Arabic sets `lang="ar" dir="rtl"` on the root and `khda.css` has a dedicated RTL section. Dataset titles and field names deliberately stay in English — the dictionary publishes them that way, and Excel template headers must match the database field names.
- **Typography**: Dubai (300/400) with a Segoe UI fallback. **No webfont is bundled**, so rendering depends on Dubai being installed; the fallback sets about 6% wider and shifts line breaks and card heights.
- **Page scaling**: `fit.js` sets `body.zoom` from the viewport against the 1600px Figma canvas, multiplied by the a11y panel's `--a11y-zoom`. Layouts are drawn at 1:1 Figma sizes and scaled — do not write your own viewport math.
- **Accessibility settings are attributes on `<html>`**, so CSS reacts to them. Add new a11y behaviour as a CSS rule keyed off the attribute, not as JS style mutation.

## Excel: write offline, read online

- **Writing** (the template and the whole-submission export) uses `js/template.js`, a hand-rolled OOXML writer, **because the SheetJS community build cannot write data validation**. It works with no network. Templates carry real dropdowns from named ranges, numeric/date/length/custom-formula validation, a Field guide sheet, and one sheet per referenced code list.
- **Reading** uploads and writing the per-dataset export use SheetJS from a CDN (`xlsx 0.18.5`); both fall back to CSV when it fails to load. The CSV reader follows RFC 4180.
- Sheet names are trimmed to Excel's 31 characters and de-duplicated.

## The `plan/` directory

A separate deliverable from the wireframe itself: a product plan for the full portal, assembled from JSON specs into a standalone `plan/index.html`.

- `plan/_context/brief.md` is the shared source of truth (roles, the Release-1 pipeline architecture, scale, competitor analysis). `plan/_context/mockup-guide.md` is the authoring contract for mockups — personas, the 46-dataset display-name table, the status-to-chip vocabulary, the old/changed/new markers.
- `node plan/_tools/build.js` assembles `plan/index.html`. It currently **fails**: it requires `plan/_context/final-ia.json` and `plan/_context/pages/*.json`, neither of which exists yet.
- `plan/_tools/render.sh <page-id> [height] [scale]` screenshots a mockup to PNG with headless Chrome. Its `ROOT` and `URL` are hard-coded to the old path `D:/KHDA wireframe/plan` and need updating before use.
