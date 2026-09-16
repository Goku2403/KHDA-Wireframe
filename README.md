# KHDA HEDB Data Submission — wireframe

Static HTML wireframe of the HEDB higher-education data submission journey, built on the KHDA Design System (DDS v2.2) and the Portal Delivery form and card patterns from Figma.

One set of pages serves **all 46 datasets** in the HEDB Data Dictionary 2026: 31 Semester/Annual datasets and 15 Real-Time datasets. Nothing is hand-coded per dataset. The form, the validation, the grid columns, the Excel template, the report and the charts are all derived from each dataset's field metadata.

The interface runs in **English and Arabic**, including a right-to-left layout.

## Pages

| Page | Purpose |
|---|---|
| `dashboard.html` | Landing page: highlights carousel, remediation queue, institution card, quick actions, submission progress gauge, submission calendar and analytics meters. Follows the Figma Portal Delivery dashboard (`24570:127550`). |
| `choose.html` | Step screen asking whether to bulk upload or use the form, then opening the dataset in that mode. Follows the Figma step page (`11058:260635`). |
| `submissions.html` | Catalogue of the 46 datasets as cards, with search, favourites, sort, paging and the whole-submission export. Follows the Figma Services page (`3578:78576`). Each card opens its own form or report. |
| `index.html` | Data entry for one dataset, chosen with `?sheet=<sheet name>`. Two-step flow: enter records, then review and submit. |
| `report.html` | Data report for one dataset: statistics, analytics bars and the full data grid with paging and an edit link back to the form. |

A card's **Start submission** button goes to `index.html?sheet=<sheet>`; its report icon goes to `report.html?sheet=<sheet>`. The report grid's edit icon returns to `index.html?sheet=<sheet>&edit=<record id>` with that record open in the form.

## Run

Open the pages through any static server, so the relative CSS and JS paths resolve:

```bash
python -m http.server 8765
```

Then browse to <http://localhost:8765/submissions.html>.

## Files

| Path | Purpose |
|---|---|
| `css/khda.css` | KHDA DS tokens (colour, Dubai type scale, elevation, radius), component styles, and the right-to-left overrides |
| `js/demo.js` | Demo data for walkthroughs: the header button, the URL and keyboard triggers, and the record generator |
| `js/activity.js` | The activity log the dashboard's recent activity card reads |
| `js/export.js` | The whole-submission export: summary, dataset register, analytics and one sheet per dataset |
| `js/dashboard.js` | Dashboard: reads every dataset's draft, derives status and totals, renders the carousel, task list, institution card, gauge, calendar and meters |
| `js/a11y.js` | Accessibility panel: page size, contrast, spacing, links, motion, plus the skip link |
| `js/i18n.js` | English and Arabic dictionary, `t()` helper, `data-i18n` tagging, language switch, portal header behaviour (account menu, shared toast) |
| `js/datasets.js` | Generated from the workbook: title, description, group, kind and field list for each of the 46 datasets (1,226 fields) |
| `js/lists.js` | Generated from the workbook: the 44 referenced code lists, such as Institutional Codes, Universities, Country and Academic Period |
| `js/schema.js` | Turns raw field metadata into usable descriptors: control type, mandatory flag, length and number limits, dropdown options, primary key, cross-field rules, derived fields, grid columns, measure detection |
| `js/app.js` | Data entry: form build, validation, duplicate primary key check, edit and delete, sort, search, filter, pagination, Excel template, upload, export, local draft persistence, submit flow |
| `js/report.js` | Report page: statistics tiles, grouped analytics bars, data grid with paging and edit links, export |
| `js/choose.js` | The submission-method step screen |
| `js/catalogue.js` | Catalogue behaviour: search, favourites, sort, paging, details modal |
| `js/template.js` | Minimal XLSX writer used for the download template (dropdowns, validation, named ranges, frozen header) |
| `js/datepicker.js` | Date field popover, localised months and weekdays |
| `js/fit.js` | Scales the page so the 1600px Figma proportions hold on any screen |

## Typography

The Figma frames use **Dubai** and nothing else, in Regular (400) and Light (300). The stylesheet asks for Dubai first, then falls back through Segoe UI, Helvetica Neue and Arial.

**There is no bundled webfont.** The pages rely on Dubai being installed on the machine. It is, on the machine this was built and checked on, so the rendering matches Figma. Anywhere Dubai is absent the text silently falls back to Segoe UI, which sets about six per cent wider, so line breaks and card heights shift. Bundling the official webfont would remove that dependency.

Sizes follow the DDS scale: Display 68/80, H1 48/56, H2 40/48, H3 32/40, H4 28/32, H5 24/32, H6 20/28, Body 16/24, Caption 14/20 at 0.14 tracking, Small 12/16 at 0.24.

## Language

The `العربية` button in the portal header switches the whole wireframe to Arabic and then reads `English`. The choice is stored in `localStorage` under `khda.lang` and applies to every page.

In Arabic the document gets `lang="ar"` and `dir="rtl"`, so the layout mirrors: navigation, stepper, table alignment, select chevrons, the date popover, the sticky report column and the toast stack all flip.

**Dataset names and field names stay in English.** They are published that way in the HEDB Data Dictionary, and the Excel template columns must keep the database field names so uploads match. English content sitting inside the Arabic layout keeps its own reading order, so trailing punctuation and numbers stay in the right place.

The date picker follows the language: Arabic month names and weekday abbreviations, Arabic Clear and Today links.

## Accessibility

The accessibility button in the portal header opens a settings panel. Choices are written as attributes on the root element, so CSS reacts to them, and saved in `localStorage` under `khda.a11y.v1` so they follow the user across every page.

| Setting | What it does |
|---|---|
| Page size | Normal, large or largest. Scales the page on top of the canvas fit, so the layout keeps its proportions. |
| Higher contrast | Black body text, heavier borders, outlined chips, underlined links, a solid black focus ring, and the background wash removed. |
| More spacing | Looser line height, wider letter spacing and taller rows in tables and lists. |
| Underline links | Underlines every link rather than only on hover. |
| Reduce motion | Stops the carousel, transitions and smooth scrolling. Switched on by default when the operating system asks for reduced motion. |

Beyond the panel: a **Skip to main content** link is the first thing a keyboard reaches on every page, the main landmark takes focus when it is used, the header button reports its expanded state, and Escape closes the panel and returns focus to the button.

The task rows on the dashboard respond to their own card width rather than the window's, so at a larger page size they stack instead of squeezing dataset names into unreadable stubs.

## Account menu

Clicking the profile pill opens a small menu with a single **Log out** action and its icon. It closes on a second click, on Escape, or on a click anywhere outside. Being a wireframe, it shows a toast rather than ending a session.

## Choosing how to submit

**Start submission** on a catalogue card opens `choose.html`, a step screen that asks how the institution wants to work before the dataset itself opens.

It follows the Figma step page (`11058:260635`): a tinted portal header, a rail of step circles down the left, a tall card holding a centred 40px heading, and a bordered footer carrying the actions. The two option cards inside come from the selector panel (`11063:261216`), 824 wide in total and 40 apart, each with a round icon badge, a 28px headline and a radio underneath. The chosen card takes a 2px primary border and fills its radio; the other keeps a 1px outline.

Arrow keys move between the options, a double click goes straight through, and an unknown sheet in the address sends the visitor back to the catalogue.

Two choices:

| Choice | What opens |
|---|---|
| Bulk upload | `index.html?sheet=<sheet>&mode=bulk` — a drop zone for the filled template, the template download, and the records grid with search, filter, paging and export. The form stays out of the way and appears only when a row is edited. |
| Form submission | `index.html?sheet=<sheet>&mode=form` — the guided form on its own. The records grid, the template and the upload controls are all hidden, since the route is about the form and what has been entered is reviewed on step two. |

The drop zone accepts a file dropped onto it or a click to browse, highlights while a file is over it, and runs the same reader as the upload button, so validation, duplicate skipping and error flagging behave identically.

A link without `mode` shows everything, so the dashboard, the report's edit links and any older link keep working as before.

## Stepped flow

The left stepper drives the page and its statuses come from the data:

1. **Enter records**: mandatory fields are marked with `*` and optional ones labelled. Fields that the dictionary says should match another field's list are filled automatically and are read-only. The grid offers search, an errors filter, paging, template download, upload and export. Next needs at least one record and no failing rows.
2. **Review and submit**: read-only grid with column totals and a confirmation checkbox that enables Submit.

Drafts persist per dataset in `localStorage` under `khda.hedb.<sheet>.v1`.

## Excel template, upload and export

- **Template** downloads `<Sheet>_Template.xlsx`. The **Data** sheet carries the database column names with the header row frozen. Coded fields get real Excel **dropdown lists** sourced from named ranges on the reference sheets. Numeric fields are validated as whole or decimal numbers with their minimum, cross-field rules become custom formulas, dates must be today or earlier, and text fields are length-checked. The workbook also holds a **Field guide** sheet listing every field with its type, mandatory flag, acceptable values, rules and example, plus one sheet per referenced code list.
- **Upload** accepts the filled template as `.xlsx`, `.xls` or `.csv`. It reads the sheet named `Data` (or the first sheet), matches columns by database field name, claiming each column once, converts Excel date cells to `YYYY-MM-DD`, skips duplicates, and flags failing rows in the grid. The CSV reader follows RFC 4180, so a quoted cell may carry commas, doubled quotes and line breaks.
- **Export** downloads the entered records as `.xlsx` with the same column names, so an exported file can be edited and uploaded again.

The template is generated by `js/template.js`, a small dependency-free OOXML writer, because the SheetJS community build cannot write data validation. It works offline. Reading uploads and writing the export use SheetJS from a CDN; without a connection both fall back to CSV.

## Validation

Rules are read from the data dictionary per field, so they differ by dataset:

- Mandatory fields come from the workbook's "Accept null value" column, where **No** means mandatory.
- One deliberate exception: **Last Updated**. The workbook marks it "Accept null value = No" in 29 of the 30 sheets that carry it, which would make it mandatory, but it is a system stamp rather than something the institution types, so the portal treats it as optional. The override is a named rule in `js/schema.js`, not a quiet edit to the generated data, and it flows through to the form, the validator and the template's field guide.
- Coded fields must hold a value from their referenced list.
- Numbers respect whole-number and minimum constraints; text respects its declared length, except where the value comes from an official list.
- Cross-field rules of the form "cannot exceed …" are enforced between fields.
- Dates use `YYYY-MM-DD` and cannot be in the future.
- Each dataset's primary key is parsed from the dictionary, which writes it three ways: in brackets, after a colon, or as a newline-separated list. 26 of the 46 datasets declare one. Duplicate keys are rejected on entry and skipped on upload.
- The other 20 datasets declare no key at all, so the wireframe falls back to refusing a row identical to one already entered rather than inventing a rule the dictionary does not state.
- Where a sheet repeats a database column name, the later ones are suffixed (`Contact_Email_2`) so the template headers stay distinct and an upload cannot feed two fields from the same column.

## Dashboard

The dashboard is the portal's landing page. Its layout follows the Figma frame: four columns of 312 / flexible / flexible / 312, with the task list spanning the two middle columns on the first row.

The page sits on the frame's own canvas rather than plain white: a mint wash in the top corner beside the Knowledge mark, fading into a flat light grey so the white cards read as panels. The portal header is transparent over it. The catalogue shares the same canvas. The wash mirrors in Arabic; the entry form and the report stay white.

Nothing on it is hard-coded. Each card reads the drafts saved in this browser and the dataset metadata:

| Card | Where the numbers come from |
|---|---|
| Highlights | Three rotating notices about the cycle, the templates and the real-time feeds. Auto-advances, pauses on hover, dots jump between them. The artwork and the mint-to-teal gradient come from the Figma card itself: `assets/hero-artwork.png` is the exact crop Figma applies to the source image. |
| Remediation queue | Every dataset ranked by how badly it needs work: failing validation first, then started, then untouched. Filter by needs remediation, in progress, not started or all, and expand past the first five. The expanded list scrolls inside its own card, so a long list never stretches the row and pushes the neighbouring cards out of view. Each row opens that dataset's form. |
| Institution | Laid out as in the Figma card: an inset cover photo taken from the Figma file, a crest centred over its lower edge, then the name, award chip and facts centred beneath. Every fact on it is read from the submission rather than invented: the institution code and name most often entered across the drafts, datasets submitted out of 46, records entered, records needing remediation, and how long ago the last dataset was submitted. Falls back to a placeholder name and "Not set" when nothing has been entered. |
| Quick actions | Start a submission, continue the first unfinished dataset, open a report for the first dataset holding data. |
| Submission progress | A half-ring split into submitted, in progress and not started, switchable between semester/annual and real-time. |
| Submission calendar | Which cadences fall in each collection window. Illustrative: the dictionary does not publish dates. |
| Analytics updates | Datasets started, records entered, and records needing remediation. |
| Recent activity | What actually happened, newest first: records added, edited, deleted, uploaded and submitted, with the dataset and how long ago. Each entry opens that dataset. |

Activity is recorded by the data entry page as the user works and kept in `localStorage` under `khda.activity.v1`, capped at 60 entries. Runs of the same action on the same dataset within ten minutes fold into one line, so adding six records reads as one entry rather than six.

A dataset counts as submitted once the submit step completes, which stamps `submittedAt` in its draft. Changing any record afterwards clears that stamp, so the dashboard shows it as open again.

## Demo data

Demo data fills the whole wireframe with a plausible submission cycle for one institution, so a dashboard or a report never has to be presented empty.

**The control is hidden.** To show it, type `qwerty` anywhere outside a form field and press Enter. A **Demo data** button then appears in the portal header: one click loads the cycle, the same button clears it. Typing the code again hides the button. The reveal lasts for that browser tab only, so it survives the reload that loading the data triggers, and any new tab starts clean. Typing the code inside a form field does nothing, so entering real data can never expose it by accident.

What it loads: 18 of the 46 datasets, around 220 records, 10 already submitted, 6 in progress, and 2 left failing validation so the dashboard has something to flag. The remaining datasets stay untouched, which is what a real cycle in progress looks like.

Rows are generated from each dataset's own field metadata and then checked with the live validator, so the demo never contains a row the wireframe would itself reject, apart from the two deliberate ones. Key fields carry the row number, so records are unique by construction rather than by luck.

These work whether or not the button is showing:

| Trigger | Effect |
|---|---|
| `?demo=on` / `?demo=off` on any page | Loads or clears before the page renders, then strips the parameter from the address bar |
| `Ctrl` + `Shift` + `D` | Toggles from anywhere in the app |
| `KHDA_DEMO.seed()` / `.clear()` / `.isOn()` | From the browser console |

Demo data lives in the same local storage as anything you type yourself, so clearing it clears both.

## Export everything

The **Export everything** button beside the sort control downloads one Excel workbook covering the whole submission:

| Sheet | Contents |
|---|---|
| Summary | Institution, cycle, generation time, then the headline counts: datasets in the dictionary, started, submitted, in progress, not started, records, records needing remediation, fields, and the same broken down by cadence |
| Datasets | A register of all 46: reference, title, sheet, cadence, field count, records, records needing remediation, status and the date it was submitted |
| Analytics | The figures behind the charts: progress by status for each cadence, the submission calendar, the indicator meters with their shares, and the ten largest datasets |
| One per dataset | The actual records of every dataset holding data, under their database column names, numbers stored as numbers |

The workbook is built by `js/export.js` and written by `js/template.js`, so it works with no internet connection. Sheet names are trimmed to Excel's 31 characters and de-duplicated. The button is disabled until something has been entered, and falls back to a CSV of the dataset register if the workbook cannot be built.

The export module also owns the submission-cycle windows that the dashboard's calendar chart draws, so the page and the workbook cannot drift apart.

## Search

Every grid has a search box that covers **all** of the dataset's fields, not just the columns on screen, and it matches the description behind a code as well as the code itself, so "Bachelors" finds a row storing `BA`. Several words all have to match, in any order and any column.

| Where | What it filters |
|---|---|
| Submissions catalogue | Dataset title, description, cadence, sheet name and every field name |
| Data entry, records grid | Every field of every entered record; paging and the errors filter follow |
| Review and submit | The review grid; the column totals follow the filter |
| Data report | The data grid; the row count, the totals row and the pager all follow |

Counts stay honest while a search is active: the chip reads "4 of 14 records" and the totals row reads "Total (4 matching)". Clearing the box restores everything.

## Sample rows

**Load sample row** fills the form from the dictionary's Sample Data column. The real-time schema sheets have no such column, so values are shaped from the field name instead: identifiers, codes, emails, phone numbers, websites, countries, academic periods, money amounts and short sentences. A field the dictionary says mirrors another one takes that one's description rather than its own name.

## Regenerating the dataset metadata

`js/datasets.js` and `js/lists.js` are generated from `HEDB_Data_Dictionary_2026 1 (2).xlsx`. The generator reads two different sheet layouts: periodic sheets with a "Field Name" header at a variable base column, and real-time schemas with an "Attribute / Null? / Field Size / Description" header.
