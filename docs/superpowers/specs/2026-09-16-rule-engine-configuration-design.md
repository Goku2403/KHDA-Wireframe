# Rule engine configuration page — design

**Date:** 2026-09-16
**Status:** Approved for planning

## Problem

The HEDB wireframe validates submissions using rules hard-coded in `js/schema.js`, derived
from the data dictionary. Those rules are invisible and unmanageable: nobody can see which
rules apply to a field, and nothing can express the rule types KHDA actually needs for the
Qlik Data Quality layer.

This adds a **Configuration** page where a rule engine is authored per dataset: select a
dataset, see its fields, and attach typed validation rules to each field.

## Scope decisions

Two decisions were taken up front and constrain everything below.

**Rules are seeded from the dictionary, not authored from a blank slate.** Each field
arrives carrying the rules `schema.js` already derives, marked `derived`. The author adds,
supplements or disables. This keeps the page consistent with the live validator and makes
all 46 datasets immediately populated.

**The page is a configuration UI only.** It authors, persists and exports rule definitions.
It does **not** change how `index.html` validates. `js/schema.js`, `js/app.js` and the
validation path are untouched. Authored rules are a hand-off artefact for the Qlik DQ layer.

## What already exists

`KHDA_SCHEMA.validate()` enforces 8 of the 12 rule types, so they must be *derived*, not
re-authored:

| Rule type | Already derived from | Field descriptor |
|---|---|---|
| `REQUIRED` | "Accept null value = No" | `f.required` |
| `DATA_TYPE` | dictionary type string | `f.control`, `f.integer` |
| `MAX_LENGTH` | `TEXT(n)` vs sample length | `f.maxLen` |
| `ALLOWED_VALUE` | referenced code list | `f.opts`, `f.listName` |
| `EMAIL_FORMAT` | "email format" in values | `f.email` |
| `DATE_FORMAT` | `DATE` type | `f.control === 'date'` |
| `REFERENCE_EXISTS` | referenced code list | `f.listName` |
| `CONDITIONAL_REQUIRED` (partial) | "cannot exceed" cross rules | `schema.cross` |

Genuinely absent, authored only: **`MIN_LENGTH`, `PHONE_FORMAT`, `REFERENCE_MATCH`,
`CUSTOM_BUSINESS_RULE`**, and true `CONDITIONAL_REQUIRED` (today's `schema.cross` expresses
only numeric "cannot exceed" comparisons, never "mandatory when field X = value Y").

## Architecture

Three new files, following the existing model/controller split (`schema.js` / `app.js`):

| File | Responsibility |
|---|---|
| `configuration.html` | Page shell, portal header, two-pane layout |
| `js/rules.js` | `window.KHDA_RULES` — rule-type catalogue, derivation, persistence, export |
| `js/config.js` | Page controller — rail, detail pane, composer, wiring |

Script load order on `configuration.html`, matching the other pages:

```
i18n.js → a11y.js → activity.js → fit.js → lists.js → datasets.js
       → schema.js → rules.js → demo.js → config.js
```

`rules.js` depends on `KHDA_SCHEMA` and `KHDA_LISTS`; `config.js` depends on `KHDA_RULES`.

### `KHDA_RULES` public API

```
TYPES                    // the 12 rule-type descriptors, in display order
derive(schema)           // → { <fieldKey>: [rule] }  the dictionary-derived rules
load(sheet)              // → stored rule document, or a derived-only document
save(sheet, doc)
disabled(sheet)          // → Set of disabled derived-rule ids
exportJson(sheet)        // → JSON hand-off artefact
```

### Rule shape

```js
{
  id: 'r7',                    // unique within the field
  type: 'ALLOWED_VALUE',
  value: ['PR','BOT','BOG'],   // shape varies by type; null when the type takes no value
  origin: 'derived' | 'custom',
  enabled: true,
}
```

`origin: 'derived'` rules are **read-only with a disable toggle**. They are never edited in
place: overwriting a dictionary-derived rule would silently contradict `schema.js`, which
still enforces the original. Disabling is reversible and honest.

### Persistence

`localStorage` under `khda.rules.<sheet>.v1`, matching the existing key convention. Only
custom rules and the set of disabled derived-rule ids are stored — derived rules are
recomputed from the dictionary on load, so regenerating `datasets.js` does not leave stale
copies behind.

## The 12 rule types and their value editors

The value control swaps entirely on the selected rule type. This is the core interaction.

| Rule type | Value editor | Stored value |
|---|---|---|
| `REQUIRED` | none — "No rule value needed" | `null` |
| `EMAIL_FORMAT` | none | `null` |
| `DATA_TYPE` | select: INTEGER / DECIMAL / DATE / TEXT / BOOLEAN | string |
| `MAX_LENGTH` | number input, min 1 | number |
| `MIN_LENGTH` | number input, min 1 | number |
| `ALLOWED_VALUE` | chip input: Enter commits, Backspace removes last, paste splits on comma | string[] |
| `PHONE_FORMAT` | pattern input + live preview | string |
| `DATE_FORMAT` | format select + live preview | string |
| `REFERENCE_EXISTS` | master-table select → column select | `{table, column}` |
| `REFERENCE_MATCH` | multi-field picker, 2+ fields of this dataset | string[] of field keys |
| `CONDITIONAL_REQUIRED` | condition builder `[field][op][value]` | `{field, op, value}` |
| `CUSTOM_BUSINESS_RULE` | handler name + SQL editor | `{handler, sql}` |

**`REFERENCE_EXISTS` is grounded in real data**, not free text: the master-table select is
populated from the 44 code lists in `KHDA_LISTS` (`Institutional Codes`, `Academic Period`,
`Country`, `Degree or Program Level`, …), displayed in the `MST_<List>.<Column>` convention.

**`CONDITIONAL_REQUIRED` operators:** `=`, `≠`, `is empty`, `is not empty`. The field select
lists the other fields of the same dataset. When the chosen field has a code list, the value
control becomes a select of that list rather than free text.

**`CUSTOM_BUSINESS_RULE`** is a styled `<textarea>` with a line-number gutter and monospace
type — **not** a CDN editor, because this wireframe works offline and pulls only SheetJS
from a CDN. The SQL must return a boolean. A `Validate` button performs a shape check only
(non-empty, single statement, starts with `SELECT`); there is no database to execute against
and the button must not imply otherwise.

## Layout

Two-pane master-detail below the standard portal header.

```
Configuration                 [ Dataset ▾ ]        [Export rules]

┌─ Fields ─── search ────┐  ┌─ <field name> ──── <type> · <db column> ─┐
│ ● Institution Code  3  │  │  <rule cards>                            │
│ ○ Academic Period   2  │  │  + Add rule                              │
│ [All][Has rules][None] │  └──────────────────────────────────────────┘
└────────────────────────┘
```

The field rail **must** carry search and an All / Has rules / No rules filter: OBF Self
Report has 102 fields and Students - Enrollments has 72, so an unfiltered list is unusable.
Each row shows a rule-count badge and a dot indicating whether any rule is custom.

Adding a rule opens an **inline composer** in the detail pane (not a modal): rule-type
select, then the adaptive value editor, then Save / Cancel. Inline keeps the field's
existing rules visible while a new one is written, which a modal would hide.

## Visual language

Modern interaction patterns, rendered **entirely from the existing DDS v2.2 tokens** in
`css/khda.css`. No new palette, no new type scale, no new font. Rule-type badges reuse the
existing chip classes; the rail reuses list and search patterns already in the stylesheet.

New CSS lives in one clearly-commented section of `css/khda.css`, consistent with how the
dashboard and catalogue sections are organised.

## Internationalisation

Every visible string goes through `t()` or `data-i18n`, with entries in **both** the `en`
and `ar` blocks of `js/i18n.js` — roughly 40 new keys covering the page chrome, the 12 rule
purposes, the composer and the empty states.

Following the established convention, these stay **English in both languages**: rule type
names (`ALLOWED_VALUE`), dataset names, field names, database column names, and SQL. Rule
*purposes* and all UI chrome are translated. The page must mirror correctly under
`dir="rtl"`, including the two-pane layout and the chip input.

## Accessibility

- The field rail is a listbox with roving focus; arrow keys move, Enter selects.
- The chip input announces additions and removals through a live region.
- The composer's value editor swap moves focus to the new control and announces the change.
- Every control reachable by keyboard; the rail scrolls within its own pane rather than
  growing the page, matching the dashboard's remediation queue.

## Out of scope

- Changing validation behaviour anywhere in `index.html` or `schema.js`.
- Rule severity levels (error vs warning) — not requested.
- Executing `CUSTOM_BUSINESS_RULE` SQL; there is no backend.
- Per-institution rule variation; rules are per dataset.
- Importing a rule document back in. Export only, this pass.

## Risks

**`KHDA_SCHEMA.get(sheet)` silently falls back to `SETS[0]`** when the sheet is unknown,
rather than returning null. The configuration page must validate `?sheet=` against
`KHDA_DATASETS` itself before calling `get()`, or an unknown sheet will quietly show
Applicants - Basic Details while the URL claims otherwise.

**Nav is duplicated across 4 HTML files** — `dashboard.html`, `submissions.html`,
`index.html`, `report.html`. (`choose.html` is a redirect shim and carries no nav, so it
must *not* gain one.) Adding Configuration means editing all four, or the new item appears
on some pages only.

**The `?v=` cache-bust bump is wider than the nav change**: all 5 existing HTML files carry
`?v=20260920f`, including `choose.html` on its favicon link. Every one must move to the new
value together, or a stale `khda.css` renders the new page unstyled.
