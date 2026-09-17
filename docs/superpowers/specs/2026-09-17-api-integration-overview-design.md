# API Integration Overview — design

Date: 2026-09-17
Branch: feature/rule-engine-configuration
Status: approved, ready to build

## Why

`plan/_context/brief.md` §5 records the competitor's "KHDA Home (API integration
Overview)" screen and what is wrong with it: every action is a stub (email cannot
send), the readiness score divides by *what was submitted* rather than by the 46
datasets required, touch points are empty, and the charts have no axes. This page
is our answer to that screen — the KHDA-admin view of which institutions are
actually consuming the API, how clean the data arrives, and who needs chasing.

## Scope

A new page `api.html` with controller `js/api.js` and a data module
`js/api-data.js`. No change to submission, catalogue, entry, report or rule-engine
behaviour. The page is read-only over derived telemetry; the only state it writes
is the record of what the admin did.

## 1. Navigation

`api.html` joins the portal nav on every page:

    Dashboard · Submissions · Data Governance Policies · API Integration

Key `nav.api`, in both the `en` and `ar` blocks of `js/i18n.js`. The nav block is
copied verbatim in all seven HTML files (`dashboard`, `submissions`, `index`,
`report`, `governance`, `configuration`, `api`), so all seven change together.
`choose.html` is a redirect shim and carries no nav.

The page uses `body class="on-canvas on-canvas--admin"` — it is a KHDA-admin
surface, like governance and configuration, not the institution portal.

## 2. Data model — `js/api-data.js` (`window.KHDA_API`)

There is no backend, so telemetry is **deterministic mock**: a seeded PRNG
(mulberry32) keyed on the institution code. Every reload, every browser and every
reviewer sees identical numbers; nothing is `Math.random()`.

### Roster

37 institutions taken from the real `Institutional Codes` list in `js/lists.js`
(136 code/name pairs from the dictionary). Selection prefers names matching a
Dubai-linked keyword set, then tops up in code order to exactly 37.

> **Assumption.** The dictionary does not mark which of the 136 licensed
> institutions are the 37 Dubai HEIs in scope. Release 1 supplies the real roster;
> until then the wireframe derives a stable stand-in. A `ROSTER_NOTE` comment in
> `api-data.js` carries this caveat.

### Per institution

    { code, name, wave, tier, channel, contact, lastCallAt, callsThisCycle,
      weekly[12], ledger[46] }

- `wave` — onboarding wave 1–4, sized 7 / 14 / 13 / 3 per the brief.
- `tier` — `active` (API calls this cycle) | `dormant` (onboarded, silent this
  cycle) | `not-integrated` (never called; files by portal upload or not at all).
- `channel` — `api` | `portal` | `none`.
- `weekly[12]` — API calls per week for the last 12 weeks; drives the volume chart.
- `ledger` — exactly one row per dataset in `KHDA_DATASETS`, so the 46 come from
  metadata and are never hand-listed:

      { sheet, title, group, status, channel, lastAt, errorCount, topError }

  `status` is one of `accepted | processing | needs-correction | non-submitted`.
  `topError` is drawn from a fixed catalogue of realistic integration errors
  (schema mismatch, reference code not found, primary-key collision, mandatory
  field null, date outside the academic period, 401 token expired).

### Rating — `KHDA_API.score(inst)`

Returns `{ total, stars, coverage, accuracy, freshness }`.

| Component | Points | Formula |
|---|---|---|
| Coverage | 50 | `50 × accepted / 46` — the denominator is **always 46** |
| Accuracy | 30 | `30 × (1 − errored / attempted)`; `0` when `attempted === 0` |
| Freshness | 20 | linear decay from `lastCallAt`: 20 at ≤ 7 days, 0 at ≥ 60 days, 0 if never |

`total` is rounded to an integer and clamped to 0–100. `stars = round(total / 10) / 2`
— a 0–5 value in half-star steps, rendered as five glyphs with a half state.

This fixes the competitor's two defects: the coverage denominator is the
requirement, not the submission, so an institution that sends 9 datasets cleanly
cannot outrank one that sends 40; and accuracy is undefined-safe rather than
perfect when nothing was attempted.

### Aggregates

`KHDA_API.summary()` returns the totals the stat row and charts need: institutions
by tier, the 1,702-row status split (37 × 46), datasets in error, and the mean
score.

## 3. Page layout

### Stat row

Six cards, each a measurement rather than a bare number: an icon, the figure, the share
of the whole it represents as a chip and a meter, and a one-line note. Tone comes from
the chip palette, handed to the card as --tone / --tone-soft so no colour is written
into the markup. There is no heading over the row and no lede under the page title:
the figures are the summary of the title, and a label saying so only pushed them down.

Total HEIs · Consuming API · Not consuming · Datasets accepted (of 1,702) ·
Datasets in error · Average rating.

### Charts

1. **API adoption** — a full ring with the consuming figure in the middle, and the three
   tiers listed beside it with counts and share meters.
2. **Dataset outcomes** — the 1,702 rows as one stacked bar, then each status on its own
   line with count and share, so the card carries the detail the bar cannot.
3. **API call volume** — an area with a line and week markers over **labelled x and y axes**,
   led by three figures (calls in 12 weeks, this week, busiest week). Four axis labels,
   anchored at both ends: every third week fitted in English but collided in Arabic,
   where the same label is three times as wide.
4. **Adoption by onboarding wave** — a row per wave with count, percentage and a track;
   a wave nobody has joined shows its figure in the error colour.

All four use existing design tokens. No new colour is introduced; the status palette is
--chip-done, --chip-progress, --chip-late, --surface-dim.

### Institution table (`.data-table`)

Built as the **records grid** from the entry page, not a second grid pattern: a
`.records__header` carrying the headline, the count chip and the tools (search and
the segmented filter), then the table, then a `.pagination` footer with
"Showing a to b of c results", a Rows selector (5/10/25/50) and page buttons.
Sort indicators are the same `⇅` / `↑` / `↓` glyphs the entry grid uses, and the
default sort is Datasets accepted, descending.

The grid carries the rating as its own sortable column, placed after Last API call so
it reads as the conclusion drawn from the columns before it rather than a second
reading of the accepted count beside it. A sort key left in `khda.api.v1` by an earlier
visit is validated against the columns that exist, so a key no header shows falls back
to the default sort.

The segmented filter is All · Consuming · Not consuming · Has errors. Changing the
filter, the search or the page size returns to page one.

| Column | Content |
|---|---|
| Institution | name, with code and wave beneath |
| Channel | chip: API / Portal upload / Not integrated |
| Accepted | `34 / 46` with a progress bar |
| Errors | count, `chip--error` when non-zero |
| Last API call | relative time, or "Never" |
| Rating | `score.total` as a percentage over a meter filled to it, banded green ≥ 70, amber ≥ 40, red below |
| Actions | **View datasets** and **Send email**, as outlined buttons carrying an arrow and an envelope |

A row that is not consuming carries a `chip--error` "Not consuming" and a red edge.

There is no row selection. The grid is a read-and-act surface: email goes out one
institution at a time, from its own row or from the ledger drawer, so a follow-up is
always addressed to a named institution with that institution’s own figures in it.

## 4. Drawers

Both reuse the `cfg-drawer` scrim/panel pattern from `configuration.html`:
`role="dialog" aria-modal="true"`, Escape closes, focus moves in and returns to the
invoking control.

Each drawer is a flex column — title and footer fixed, only the body scrolls — and
while one is open `<html>` carries `has-drawer`, which parks the page behind the
scrim. Left as a single scrolling box the panel showed two scrollbars side by side:
its own, and the page's still running underneath.

### View datasets

Header: institution name and the score breakdown — coverage, accuracy and freshness
each shown as earned points over maximum, so the rating is auditable rather than
asserted.

Body: the 46-row ledger grouped by `group` (Semester / Annual / Real-time), each row
showing status chip, channel, last received, error count and `topError`. A toggle
filters to errored rows only. A **Notify about these errors** button hands the
errored sheets to the email composer.

### Send email

KHDA-branded preview: maroon rule, KHDA lockup, reporting period, headline, the
counts strip (non-submitted / needs correction / processing), "N of 46 datasets
accepted", and a priority-dataset table with status and due date.

**Preview / Edit message** toggle; subject and body are editable. Content is
auto-filled from that institution's real ledger — not lorem.

**Send works.** It raises a success toast and stamps the row `Notified 17 Sept 2026`,
which survives a reload.

> **Deviation from the original plan.** The send does *not* write to
> `KHDA_ACTIVITY`. That log feeds the institution's own dashboard, where every entry
> links to a dataset the institution can open; a KHDA-side follow-up has no such
> link and belongs to the admin, so the trail lives in `khda.api.v1` instead.

## 5. State

`khda.api.v1` in localStorage holds only the admin's own actions and view
preferences:

    { notified: { [code]: isoDate }, filter, sort, dir }

Telemetry is always derived from the seed, so it cannot drift from the numbers on
screen. Clearing the key resets the page to its initial state; `js/demo.js` is not
involved.

## 6. Cross-cutting

- Every user-visible string goes through `t()` or `data-i18n`, with entries in both
  the `en` and `ar` blocks. Dataset titles and institution names stay English, per
  the existing convention.
- New CSS lives in one commented section of `css/khda.css` using existing variables
  only, with an RTL block alongside the others. That block isolates every score pair
  (`57 / 100`) and the plot's coordinate space: without it the bidi algorithm renders
  the score as `100 / 57` and pushes the y-axis labels off the canvas.
- Cache-bust `?v=` bumps from `20260926q` to `20260926r` in **all** HTML files.
- `js/api-data.js` loads after `lists.js` and `datasets.js`; `js/api.js` loads last.

## 7. Tests — `tests/api-score.test.js`

Run with `node --test tests/`, using the existing `tests/helpers/shim.js`.

1. The roster is exactly 37 institutions, each with a distinct code.
2. Every institution's ledger has exactly 46 rows, one per dataset in
   `KHDA_DATASETS`.
3. `score().total` is within 0–100 for every institution.
4. Coverage uses 46 as the denominator: an institution with all 46 accepted scores
   the full 50.
5. Accuracy is 0 — not 30 — when nothing was attempted.
6. Freshness is 0 when `lastCallAt` is null.
7. `stars` lands on a half-step in 0–5 and tracks `total`.
8. The seed is stable: building the roster twice yields identical scores.
9. `summary()` totals reconcile: the four status counts sum to 37 × 46 = 1,702.
