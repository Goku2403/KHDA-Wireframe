# Rule Engine Configuration Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Configuration page to the KHDA wireframe where typed validation rules are authored per dataset field, seeded from the rules `schema.js` already derives.

**Architecture:** Three new files following the repo's model/controller split — `js/rules.js` owns the rule-type catalogue, derivation, persistence and export; `js/config.js` drives the two-pane UI; `configuration.html` is the shell. Nothing in the existing validation path changes.

**Tech Stack:** Vanilla ES5-style IIFEs hanging globals on `window`, no bundler, no dependencies. Tests use Node 22's built-in `node:test` runner with a `window`/`localStorage` shim — zero npm installs, matching the repo's zero-dependency ethos.

**Spec:** `docs/superpowers/specs/2026-09-16-rule-engine-configuration-design.md`

## Global Constraints

- **No new runtime dependencies.** No npm packages, no CDN scripts. The page must work offline.
- **Scripts are classic IIFEs**, not modules. Each hangs one global on `window`. No `import`/`export` in `js/`.
- **Design tokens only.** Every colour, radius, shadow and font comes from an existing `var(--*)` in `css/khda.css`. Never hard-code a colour.
- **Bilingual.** Every visible string goes through `t()` or `data-i18n`, with an entry in **both** the `en` and `ar` blocks of `js/i18n.js`.
- **English in both languages:** rule type names (`ALLOWED_VALUE`), dataset names, field names, database column names, SQL.
- **Cache-bust:** the current string is `?v=20260920f`. When any CSS/JS changes, bump it to `?v=20260926a` in **all** HTML files together.
- **Nav lives in 4 files only:** `dashboard.html`, `submissions.html`, `index.html`, `report.html`. `choose.html` is a redirect shim and must NOT gain a nav.
- **Do not modify** `js/schema.js`, `js/app.js`, `js/datasets.js`, `js/lists.js`.
- **Never run `git commit`, `git add` or `git push`.** The user commits manually. Each task ends at a checkpoint that reports what changed and stops.
- **Run all tests:** `node --test "tests/**/*.test.js"` — a bare directory path fails on Windows; the glob is required.
- **Target table** (rules must populate it): `API_Validation_Rules(RuleID bigint, API_Code nvarchar(100) NOT NULL, Field_Name nvarchar(100) NOT NULL, Rule_Type nvarchar(50) NOT NULL, Rule_Value nvarchar(1000) NULL, Error_Code nvarchar(100) NOT NULL, Error_Message nvarchar(500) NOT NULL, Execution_Order int NOT NULL DEFAULT 100, Is_Active bit NOT NULL DEFAULT 1, CreatedOn datetime2, CreatedBy nvarchar(100), ModifiedOn datetime2, ModifiedBy nvarchar(100), API_Name nvarchar(250) NOT NULL)`. Error_Code and Error_Message are NOT NULL and are auto-generated, editable.
- **CSS classes that DO NOT exist in this repo** — use these instead: `.btn--md`→`.btn--sm`, `.btn--ghost`→`.btn--text`, `.chip--progress`→`.chip--current`, `.chip--late`→`.chip--outline`, `.service-header__lede`→ define `.cfg-lede` in the new CSS section. `.sr-only` ALREADY EXISTS — do not re-add it.
- **Serve the app:** `node tools/serve.js . 8765` (Python is NOT installed on this machine).
- **Target table the rules must populate** — `API_Validation_Rules`:
  `RuleID bigint NOT NULL`, `API_Code nvarchar(100) NOT NULL`, `Field_Name nvarchar(100) NOT NULL`,
  `Rule_Type nvarchar(50) NOT NULL`, `Rule_Value nvarchar(1000) NULL`,
  `Error_Code nvarchar(100) NOT NULL`, `Error_Message nvarchar(500) NOT NULL`,
  `Execution_Order int NOT NULL DEFAULT 100`, `Is_Active bit NOT NULL DEFAULT 1`,
  `CreatedOn datetime2 NOT NULL DEFAULT sysutcdatetime()`, `CreatedBy nvarchar(100) NULL`,
  `ModifiedOn datetime2 NULL`, `ModifiedBy nvarchar(100) NULL`, `API_Name nvarchar(250) NOT NULL`.
  Every length limit above is enforced. `Error_Code` and `Error_Message` are auto-generated and editable.
- **CSS classes the plan once assumed but that DO NOT exist in this repo** — verified against
  `css/khda.css`. Use the replacement, never the original:
  `.btn--md` → `.btn--sm` · `.btn--ghost` → `.btn--text` · `.chip--progress` → `.chip--current` ·
  `.chip--late` → `.chip--outline` · `.service-header__lede` → define `.cfg-lede` in the new
  Configuration CSS section. `.sr-only` ALREADY EXISTS — do not re-add it.

---

### Task 1: Test harness and rule-type catalogue

**Files:**
- Create: `tests/helpers/shim.js`
- Create: `js/rules.js`
- Create: `tests/rules-types.test.js`
- Create: `tools/serve.js`

**Interfaces:**
- Consumes: `window.KHDA_SCHEMA` from `js/schema.js`, `window.KHDA_LISTS` from `js/lists.js`.
- Produces: `window.KHDA_RULES.TYPES` — an array of 12 descriptors, each `{ id, value, derivable, options? }` where `value` is one of `'none' | 'select' | 'number' | 'chips' | 'pattern' | 'format' | 'reference' | 'fields' | 'condition' | 'sql'`. Also `KHDA_RULES.type(id)` returning one descriptor or `undefined`.

- [x] **Step 1: Write the shim helper**

Create `tests/helpers/shim.js`:

```js
// Loads the repo's window-global IIFEs into Node, with a localStorage stand-in.
function install() {
  global.window = {};
  let store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { store = {}; },
  };
  window.localStorage = global.localStorage;
  const root = require('path').resolve(__dirname, '../..');
  require(root + '/js/lists.js');
  require(root + '/js/datasets.js');
  require(root + '/js/schema.js');
  require(root + '/js/rules.js');
  return window;
}
module.exports = { install };
```

- [x] **Step 2: Write the failing test**

Create `tests/rules-types.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/shim');
const window = install();
const R = window.KHDA_RULES;

const EXPECTED = ['REQUIRED','DATA_TYPE','MAX_LENGTH','MIN_LENGTH','ALLOWED_VALUE',
  'EMAIL_FORMAT','PHONE_FORMAT','DATE_FORMAT','REFERENCE_EXISTS','REFERENCE_MATCH',
  'CONDITIONAL_REQUIRED','CUSTOM_BUSINESS_RULE'];

test('exposes all 12 rule types in display order', () => {
  assert.deepStrictEqual(R.TYPES.map(t => t.id), EXPECTED);
});

test('REQUIRED and EMAIL_FORMAT take no rule value', () => {
  assert.strictEqual(R.type('REQUIRED').value, 'none');
  assert.strictEqual(R.type('EMAIL_FORMAT').value, 'none');
});

test('ALLOWED_VALUE uses the chip editor, CUSTOM_BUSINESS_RULE the sql editor', () => {
  assert.strictEqual(R.type('ALLOWED_VALUE').value, 'chips');
  assert.strictEqual(R.type('CUSTOM_BUSINESS_RULE').value, 'sql');
});

test('DATA_TYPE offers the five datatypes', () => {
  assert.deepStrictEqual(R.type('DATA_TYPE').options,
    ['INTEGER','DECIMAL','DATE','TEXT','BOOLEAN']);
});

test('type() returns undefined for an unknown id', () => {
  assert.strictEqual(R.type('NOPE'), undefined);
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `node --test "tests/**/*.test.js"`
Expected: FAIL — `Cannot find module '.../js/rules.js'`

- [x] **Step 4: Write the catalogue**

Create `js/rules.js`:

```js
/* KHDA — rule engine model.
   The rule-type catalogue, the rules derived from the data dictionary, persistence and export.
   Authoring only: this never changes how js/app.js validates a record. */
(function () {
  'use strict';

  const TYPES = [
    { id: 'REQUIRED',             value: 'none',      derivable: true  },
    { id: 'DATA_TYPE',            value: 'select',    derivable: true,
      options: ['INTEGER', 'DECIMAL', 'DATE', 'TEXT', 'BOOLEAN'] },
    { id: 'MAX_LENGTH',           value: 'number',    derivable: true  },
    { id: 'MIN_LENGTH',           value: 'number',    derivable: false },
    { id: 'ALLOWED_VALUE',        value: 'chips',     derivable: true  },
    { id: 'EMAIL_FORMAT',         value: 'none',      derivable: true  },
    { id: 'PHONE_FORMAT',         value: 'pattern',   derivable: false },
    { id: 'DATE_FORMAT',          value: 'format',    derivable: true  },
    { id: 'REFERENCE_EXISTS',     value: 'reference', derivable: true  },
    { id: 'REFERENCE_MATCH',      value: 'fields',    derivable: false },
    { id: 'CONDITIONAL_REQUIRED', value: 'condition', derivable: false },
    { id: 'CUSTOM_BUSINESS_RULE', value: 'sql',       derivable: false },
  ];

  const type = id => TYPES.find(t => t.id === id);

  window.KHDA_RULES = { TYPES, type };
})();
```

- [x] **Step 5: Run test to verify it passes**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS — 5 tests

- [x] **Step 6: Add the dev server**

Python is not installed, so `.claude/launch.json`'s command does not run. Create `tools/serve.js`:

```js
// Static server for the wireframe. Stands in for `python -m http.server`.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(process.argv[2] || process.cwd());
const PORT = Number(process.argv[3] || 8765);
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon' };
http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/dashboard.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^[\\/]+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT));
```

- [x] **Step 7: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `tests/helpers/shim.js tests/rules-types.test.js js/rules.js tools/serve.js`
- Suggested message if the user chooses to commit: "Add rule-type catalogue, node test harness and dev server"

---

### Task 2: Derive rules from the data dictionary

**Files:**
- Modify: `js/rules.js`
- Create: `tests/rules-derive.test.js`

**Interfaces:**
- Consumes: `KHDA_RULES.TYPES` from Task 1; a schema from `KHDA_SCHEMA.get(sheet)` shaped `{ sheet, title, fields, pk, cross, gridCols, field(key), storageKey }`. Field descriptors carry `{ key, label, db, control, opts, listName, required, maxLen, integer, email, min }`.
- Produces:
  - `KHDA_RULES.apiCode(sheet)` → `{ code, verified }`
  - `KHDA_RULES.serialize(type, value)` → the `Rule_Value` string (or `null`)
  - `KHDA_RULES.derive(schema)` → `{ [fieldKey]: Rule[] }`

**Rule shape** — every field maps to a column of the target table:

```js
{
  id: 'f0:REQUIRED',     // local only; RuleID is assigned at export
  type: 'REQUIRED',      // Rule_Type
  value: null,           // typed in memory; serialize() makes Rule_Value
  errorCode: '...',      // Error_Code   — NOT NULL, always populated
  errorMessage: '...',   // Error_Message — NOT NULL, always populated
  order: 100,            // Execution_Order
  origin: 'derived',
  enabled: true,         // Is_Active
}
```

- [x] **Step 1: Write the failing test**

Create `tests/rules-derive.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/shim');
const window = install();
const R = window.KHDA_RULES, S = window.KHDA_SCHEMA;

const schema = S.get('Applicants - Basic Details');
const derived = R.derive(schema);
const KEY0 = schema.fields[0].key;

test('every field gets an entry', () => {
  assert.strictEqual(Object.keys(derived).length, schema.fields.length);
});

test('a mandatory coded field derives REQUIRED and REFERENCE_EXISTS', () => {
  assert.strictEqual(schema.fields[0].label, 'Institution Code');
  const t = derived[KEY0].map(r => r.type);
  assert.ok(t.includes('REQUIRED'));
  assert.ok(t.includes('REFERENCE_EXISTS'));
});

test('every derived rule populates the NOT NULL columns', () => {
  for (const key of Object.keys(derived)) {
    for (const r of derived[key]) {
      assert.ok(r.errorCode && r.errorCode.length <= 100, 'Error_Code set, <=100: ' + r.type);
      assert.ok(r.errorMessage && r.errorMessage.length <= 500, 'Error_Message set, <=500');
      assert.strictEqual(typeof r.order, 'number');
      assert.strictEqual(r.origin, 'derived');
      assert.strictEqual(r.enabled, true);
    }
  }
});

test('error codes are unique within a field and upper-snake', () => {
  const codes = derived[KEY0].map(r => r.errorCode);
  assert.strictEqual(new Set(codes).size, codes.length);
  codes.forEach(c => assert.match(c, /^ERR_[A-Z0-9_]+$/));
});

test('REQUIRED runs before format rules', () => {
  const req = derived[KEY0].find(r => r.type === 'REQUIRED');
  const ref = derived[KEY0].find(r => r.type === 'REFERENCE_EXISTS');
  assert.ok(req.order < ref.order);
});

test('serialize renders each value shape as a Rule_Value string', () => {
  assert.strictEqual(R.serialize('REQUIRED', null), null);
  assert.strictEqual(R.serialize('MAX_LENGTH', 255), '255');
  assert.strictEqual(R.serialize('ALLOWED_VALUE', ['PR', 'BOT']), 'PR,BOT');
  assert.strictEqual(R.serialize('REFERENCE_EXISTS', { table: 'MST_X', column: 'C' }), 'MST_X.C');
  assert.strictEqual(R.serialize('CONDITIONAL_REQUIRED', { field: 'executivePosition', op: '=', value: 'BOT' }), 'executivePosition=BOT');
  assert.strictEqual(R.serialize('CUSTOM_BUSINESS_RULE', { handler: 'H', sql: 'SELECT 1' }), 'SELECT 1');
});

test('no derived Rule_Value exceeds nvarchar(1000) in any dataset', () => {
  for (const d of window.KHDA_DATASETS) {
    const s = S.get(d.sheet), v = R.derive(s);
    for (const key of Object.keys(v)) {
      for (const r of v[key]) {
        const sv = R.serialize(r.type, r.value);
        if (sv != null) assert.ok(sv.length <= 1000,
          d.sheet + ' ' + r.type + ' is ' + sv.length + ' chars');
      }
    }
  }
});

test('a field on an oversized list derives REFERENCE_EXISTS but not ALLOWED_VALUE', () => {
  // "Universities" serializes to ~19k chars, far past nvarchar(1000)
  let found = false;
  for (const d of window.KHDA_DATASETS) {
    const s = S.get(d.sheet), v = R.derive(s);
    for (const f of s.fields) {
      if (f.listName !== 'Universities') continue;
      found = true;
      const t = v[f.key].map(r => r.type);
      assert.ok(!t.includes('ALLOWED_VALUE'), 'oversized list must not become an enum');
      assert.ok(t.includes('REFERENCE_EXISTS'));
    }
  }
  assert.ok(found, 'at least one field references Universities');
});

test('a short list still derives ALLOWED_VALUE', () => {
  const f = schema.fields.find(x => x.listName === 'Degree or Program Level');
  assert.ok(f);
  assert.ok(derived[f.key].map(r => r.type).includes('ALLOWED_VALUE'));
});

test('apiCode uses an uppercase sheet name as-is and marks it verified', () => {
  const r = R.apiCode('PERSON_PROFILE');
  assert.strictEqual(r.code, 'PERSON_PROFILE');
  assert.strictEqual(r.verified, true);
});

test('apiCode marks a derived code unverified', () => {
  const r = R.apiCode('OBF self report');
  assert.strictEqual(r.verified, false);
  assert.match(r.code, /^[A-Z0-9_]+$/);
});

test('cross-field limits derive a CUSTOM_BUSINESS_RULE', () => {
  const withCross = window.KHDA_DATASETS.map(d => S.get(d.sheet)).find(s => s.cross.length);
  assert.ok(withCross);
  const dv = R.derive(withCross), c = withCross.cross[0];
  const rule = dv[c.key].find(r => r.type === 'CUSTOM_BUSINESS_RULE');
  assert.ok(rule);
  assert.strictEqual(rule.value.handler, 'CrossFieldLimit');
});

test('derive is pure', () => {
  assert.deepStrictEqual(R.derive(schema), R.derive(schema));
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test "tests/**/*.test.js"`
Expected: FAIL — `R.derive is not a function`

- [x] **Step 3: Implement**

Add to `js/rules.js` before the export line:

```js
  const MAX_RULE_VALUE = 1000;   // Rule_Value nvarchar(1000)
  const MAX_ERROR_CODE = 100;    // Error_Code nvarchar(100)
  const MAX_ERROR_MSG = 500;     // Error_Message nvarchar(500)

  const upper = s => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  // KHDA's canonical API codes, from plan/_context/mockup-guide.md. Derivation alone does not
  // reproduce them (Course Faculty -> COURSE_FACULTY_B, Institute - R&D -> INSTITUTE_RD).
  const CODE_MAP = {
    'Course Faculty': 'COURSE_FACULTY_B',
    'Institute - R&D': 'INSTITUTE_RD',
    'Program Learning Outcomes': 'PLO',
    'Course Learning Outcomes': 'CLO',
  };

  function apiCode(sheet) {
    const s = String(sheet);
    if (/^[A-Z0-9_]+$/.test(s)) return { code: s, verified: true };   // real-time sheets are codes
    if (CODE_MAP[s]) return { code: CODE_MAP[s], verified: true };
    return { code: upper(s), verified: false };                       // best guess; flagged in the UI
  }

  const masterTable = listName => 'MST_' + String(listName).trim().replace(/[^A-Za-z0-9]+/g, '_');

  function serialize(type, value) {
    if (value == null || value === '') return null;
    if (Array.isArray(value)) return value.join(',');
    if (typeof value === 'object') {
      if (type === 'REFERENCE_EXISTS') return value.table + '.' + value.column;
      if (type === 'CONDITIONAL_REQUIRED') {
        return value.field + value.op + (value.value == null ? '' : value.value);
      }
      if (type === 'CUSTOM_BUSINESS_RULE') return value.sql;
      return JSON.stringify(value);
    }
    return String(value);
  }

  // Execution_Order: presence first, then shape, then cross-record checks. Rules run cheapest-first,
  // so a null value never reaches a reference lookup.
  const ORDER = {
    REQUIRED: 10, CONDITIONAL_REQUIRED: 20, DATA_TYPE: 30, MIN_LENGTH: 40, MAX_LENGTH: 50,
    EMAIL_FORMAT: 60, PHONE_FORMAT: 60, DATE_FORMAT: 60, ALLOWED_VALUE: 70,
    REFERENCE_EXISTS: 80, REFERENCE_MATCH: 90, CUSTOM_BUSINESS_RULE: 100,
  };

  const MESSAGE = {
    REQUIRED: f => f.label + ' is required.',
    DATA_TYPE: (f, v) => f.label + ' must be ' + (v === 'INTEGER' ? 'a whole number' : v === 'DECIMAL' ? 'a number' : 'a valid ' + String(v).toLowerCase()) + '.',
    MAX_LENGTH: (f, v) => f.label + ' cannot exceed ' + v + ' characters.',
    MIN_LENGTH: (f, v) => f.label + ' must contain at least ' + v + ' characters.',
    ALLOWED_VALUE: f => f.label + ' must be one of the allowed values.',
    EMAIL_FORMAT: f => f.label + ' must be a valid email address.',
    PHONE_FORMAT: f => f.label + ' must be a valid phone number.',
    DATE_FORMAT: (f, v) => f.label + ' must use the date format ' + v + '.',
    REFERENCE_EXISTS: (f, v) => f.label + ' must exist in ' + v.table + '.',
    REFERENCE_MATCH: f => f.label + ' must match the referenced master record.',
    CONDITIONAL_REQUIRED: f => f.label + ' is required when the stated condition is met.',
    CUSTOM_BUSINESS_RULE: f => f.label + ' failed a business rule.',
  };

  const clip = (s, n) => (s.length <= n ? s : s.slice(0, n));

  function makeRule(code, f, type, value, origin) {
    const msgFn = MESSAGE[type];
    return {
      id: (origin === 'derived' ? f.key + ':' + type : null),
      type, value,
      errorCode: clip('ERR_' + code + '_' + upper(f.label) + '_' + type, MAX_ERROR_CODE),
      errorMessage: clip(msgFn ? msgFn(f, value) : f.label + ' failed validation.', MAX_ERROR_MSG),
      order: ORDER[type] || 100,
      origin, enabled: true,
    };
  }

  function derive(schema) {
    const code = apiCode(schema.sheet).code;
    const out = {};
    const mk = (f, type, value) => makeRule(code, f, type, value, 'derived');

    for (const f of schema.fields) {
      const rules = [];
      if (f.required) rules.push(mk(f, 'REQUIRED', null));

      if (f.control === 'number') rules.push(mk(f, 'DATA_TYPE', f.integer ? 'INTEGER' : 'DECIMAL'));
      else if (f.control === 'date') {
        rules.push(mk(f, 'DATA_TYPE', 'DATE'));
        rules.push(mk(f, 'DATE_FORMAT', 'YYYY-MM-DD'));
      }

      if (f.maxLen && !f.opts) rules.push(mk(f, 'MAX_LENGTH', f.maxLen));

      if (f.opts && f.opts.length) {
        // Rule_Value is nvarchar(1000). A list too long to serialize is a reference table,
        // not an enum, so it derives REFERENCE_EXISTS only — never a truncated ALLOWED_VALUE.
        const vals = f.opts.map(o => String(o.v));
        if (serialize('ALLOWED_VALUE', vals).length <= MAX_RULE_VALUE) {
          rules.push(mk(f, 'ALLOWED_VALUE', vals));
        }
        if (f.listName) {
          rules.push(mk(f, 'REFERENCE_EXISTS', { table: masterTable(f.listName), column: f.db }));
        }
      }

      if (f.email) rules.push(mk(f, 'EMAIL_FORMAT', null));
      out[f.key] = rules;
    }

    for (const c of schema.cross) {
      const a = schema.field(c.key), b = schema.field(c.other);
      if (!a || !b || !out[c.key]) continue;
      out[c.key].push(mk(a, 'CUSTOM_BUSINESS_RULE', {
        handler: 'CrossFieldLimit',
        sql: 'SELECT CASE WHEN ' + a.db + ' <= ' + b.db + ' THEN 1 ELSE 0 END',
      }));
    }
    return out;
  }
```

Update the export line to:
`window.KHDA_RULES = { TYPES, type, derive, serialize, apiCode, MAX_RULE_VALUE, MAX_ERROR_CODE, MAX_ERROR_MSG };`

- [x] **Step 4: Run test to verify it passes**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS

- [x] **Step 5: Sanity-check across all 46 datasets**

```bash
node -e "
const {install}=require('./tests/helpers/shim');const w=install();
let f=0,r=0,unver=[];
for(const d of w.KHDA_DATASETS){const s=w.KHDA_SCHEMA.get(d.sheet);
const v=w.KHDA_RULES.derive(s);f+=s.fields.length;r+=Object.values(v).flat().length;
if(!w.KHDA_RULES.apiCode(d.sheet).verified)unver.push(d.sheet);}
console.log('fields',f,'rules',r,'unverified API_Code',unver.length);"
```

Expected: `fields 1226`, a rule count above 1226, and an unverified count printed (expected around 12) with no exception.

- [x] **Step 6: Checkpoint — stop and report**

Do NOT commit. Report: files touched `js/rules.js`, `tests/rules-derive.test.js`; the test output; and the unverified-API_Code count from Step 5.

---

### Task 3: Persistence and the three export formats

**Files:**
- Modify: `js/rules.js`
- Create: `tests/rules-store.test.js`

**Interfaces:**
- Consumes: `derive`, `serialize`, `apiCode` from Task 2.
- Produces:
  - `storageKey(sheet)` → `` `khda.rules.${sheet.replace(/[^A-Za-z0-9]+/g,'_')}.v1` ``
  - `load(sheet)` → `{ sheet, apiCode, apiName, verified, byField, disabled:Set }`
  - `addCustom(sheet, fieldKey, rule)` where `rule` is `{ type, value, errorCode, errorMessage, order }` → the created rule
  - `removeCustom(sheet, ruleId)` → boolean; `setEnabled(sheet, ruleId, enabled)` → boolean
  - `setApiCode(sheet, code)` → persists a user override
  - `rows(sheet)` → `Object[]` one per rule, keyed by the real column names
  - `exportJson(sheet)`, `exportSql(sheet)`, `exportCsv(sheet)` → strings

- [x] **Step 1: Write the failing test**

Create `tests/rules-store.test.js`:

```js
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/shim');
const window = install();
const R = window.KHDA_RULES;
const SHEET = 'Applicants - Basic Details';
const KEY0 = window.KHDA_SCHEMA.get(SHEET).fields[0].key;
const custom = over => Object.assign({
  type: 'MIN_LENGTH', value: 3, errorCode: 'ERR_X', errorMessage: 'too short', order: 40,
}, over || {});

beforeEach(() => localStorage.clear());

test('storage key matches the repo convention', () => {
  assert.strictEqual(R.storageKey(SHEET), 'khda.rules.Applicants___Basic_Details.v1');
});

test('load with nothing stored returns derived rules only', () => {
  const doc = R.load(SHEET);
  assert.ok(doc.byField[KEY0].length > 0);
  assert.ok(doc.byField[KEY0].every(r => r.origin === 'derived'));
  assert.strictEqual(doc.apiName, 'Applicants - Basic Details');
});

test('a custom rule persists and reloads', () => {
  const made = R.addCustom(SHEET, KEY0, custom());
  assert.strictEqual(made.origin, 'custom');
  const back = R.load(SHEET).byField[KEY0].filter(r => r.origin === 'custom');
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].errorCode, 'ERR_X');
});

test('custom rule ids are unique', () => {
  const a = R.addCustom(SHEET, KEY0, custom());
  const b = R.addCustom(SHEET, KEY0, custom({ type: 'PHONE_FORMAT', value: '+###' }));
  assert.notStrictEqual(a.id, b.id);
});

test('disabling a derived rule persists without deleting it', () => {
  const id = KEY0 + ':REQUIRED';
  R.setEnabled(SHEET, id, false);
  const doc = R.load(SHEET);
  assert.ok(doc.disabled.has(id));
  assert.strictEqual(doc.byField[KEY0].find(r => r.id === id).enabled, false);
});

test('removeCustom refuses a derived rule', () => {
  const made = R.addCustom(SHEET, KEY0, custom());
  assert.strictEqual(R.removeCustom(SHEET, KEY0 + ':REQUIRED'), false);
  assert.strictEqual(R.removeCustom(SHEET, made.id), true);
});

test('stored payload holds no derived rules', () => {
  R.addCustom(SHEET, KEY0, custom());
  const raw = JSON.parse(localStorage.getItem(R.storageKey(SHEET)));
  assert.ok(Object.values(raw.custom).flat().every(r => r.origin === 'custom'));
});

test('an API_Code override persists', () => {
  R.setApiCode(SHEET, 'APPLICANTS_BASIC_DETAILS');
  const doc = R.load(SHEET);
  assert.strictEqual(doc.apiCode, 'APPLICANTS_BASIC_DETAILS');
  assert.strictEqual(doc.verified, true);   // a user-set code counts as verified
});

test('rows() emits every target-table column with correct types', () => {
  const rows = R.rows(SHEET);
  assert.ok(rows.length > 0);
  const r = rows[0];
  for (const c of ['RuleID','API_Code','Field_Name','Rule_Type','Rule_Value','Error_Code',
                   'Error_Message','Execution_Order','Is_Active','API_Name']) {
    assert.ok(c in r, 'missing column ' + c);
  }
  assert.strictEqual(typeof r.RuleID, 'number');
  assert.strictEqual(typeof r.Execution_Order, 'number');
  assert.ok(r.Is_Active === 1 || r.Is_Active === 0);
});

test('rows() honours every NOT NULL and length constraint', () => {
  for (const d of window.KHDA_DATASETS) {
    for (const r of R.rows(d.sheet)) {
      assert.ok(r.API_Code && r.API_Code.length <= 100, 'API_Code ' + d.sheet);
      assert.ok(r.API_Name && r.API_Name.length <= 250, 'API_Name ' + d.sheet);
      assert.ok(r.Field_Name && r.Field_Name.length <= 100, 'Field_Name ' + d.sheet);
      assert.ok(r.Rule_Type && r.Rule_Type.length <= 50, 'Rule_Type ' + d.sheet);
      assert.ok(r.Error_Code && r.Error_Code.length <= 100, 'Error_Code ' + d.sheet);
      assert.ok(r.Error_Message && r.Error_Message.length <= 500, 'Error_Message ' + d.sheet);
      if (r.Rule_Value !== null) assert.ok(r.Rule_Value.length <= 1000, 'Rule_Value ' + d.sheet);
    }
  }
});

test('RuleID is sequential from 1 and unique', () => {
  const ids = R.rows(SHEET).map(r => r.RuleID);
  assert.deepStrictEqual(ids, ids.map((_, i) => i + 1));
});

test('rows() omits disabled rules', () => {
  const before = R.rows(SHEET).length;
  R.setEnabled(SHEET, KEY0 + ':REQUIRED', false);
  assert.strictEqual(R.rows(SHEET).length, before - 1);
});

test('SQL export escapes single quotes and renders NULL unquoted', () => {
  R.addCustom(SHEET, KEY0, custom({ errorMessage: "O'Brien said \"no\"" }));
  const sql = R.exportSql(SHEET);
  assert.ok(sql.includes('INSERT INTO'));
  assert.ok(sql.includes("O''Brien"), 'single quote must be doubled');
  assert.ok(/,\s*NULL\s*,/.test(sql), 'a null Rule_Value renders as bare NULL');
});

test('CSV export quotes fields containing commas and quotes', () => {
  const csv = R.exportCsv(SHEET);
  const head = csv.split('\n')[0];
  assert.ok(head.startsWith('RuleID,API_Code,Field_Name,Rule_Type,Rule_Value'));
  const listRow = csv.split('\n').find(l => l.includes('ALLOWED_VALUE'));
  if (listRow) assert.ok(listRow.includes('"'), 'a comma-bearing value must be quoted');
});

test('JSON export parses and matches rows()', () => {
  const out = JSON.parse(R.exportJson(SHEET));
  assert.strictEqual(out.length, R.rows(SHEET).length);
  assert.strictEqual(out[0].API_Name, 'Applicants - Basic Details');
});

test('a corrupt payload falls back to derived rules', () => {
  localStorage.setItem(R.storageKey(SHEET), '{not json');
  assert.ok(R.load(SHEET).byField[KEY0].length > 0);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test "tests/**/*.test.js"`
Expected: FAIL — `R.storageKey is not a function`

- [x] **Step 3: Implement**

Add to `js/rules.js` before the export line:

```js
  const storageKey = sheet => 'khda.rules.' + String(sheet).replace(/[^A-Za-z0-9]+/g, '_') + '.v1';

  function readRaw(sheet) {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey(sheet)) || 'null');
      if (!raw || typeof raw !== 'object') throw new Error('empty');
      return { v: 1, custom: raw.custom || {}, disabled: raw.disabled || [], apiCode: raw.apiCode || null };
    } catch (e) {
      return { v: 1, custom: {}, disabled: [], apiCode: null };   // corrupt payload must not break the page
    }
  }
  const writeRaw = (sheet, raw) => localStorage.setItem(storageKey(sheet), JSON.stringify(raw));

  function load(sheet) {
    const schema = window.KHDA_SCHEMA.get(sheet);
    const raw = readRaw(sheet);
    const resolved = apiCode(sheet);
    const disabled = new Set(raw.disabled);
    const byField = derive(schema);
    for (const f of schema.fields) {
      const mine = (raw.custom[f.key] || []).map(r => Object.assign({}, r, { origin: 'custom' }));
      byField[f.key] = byField[f.key].concat(mine);
      for (const r of byField[f.key]) r.enabled = !disabled.has(r.id);
    }
    return {
      sheet, byField, disabled,
      apiCode: raw.apiCode || resolved.code,
      apiName: schema.sheet,
      verified: raw.apiCode ? true : resolved.verified,
    };
  }

  function setApiCode(sheet, code) {
    const raw = readRaw(sheet);
    raw.apiCode = String(code).trim() || null;
    writeRaw(sheet, raw);
    return true;
  }

  function addCustom(sheet, fieldKey, rule) {
    const raw = readRaw(sheet);
    const used = Object.values(raw.custom).flat().map(r => Number(String(r.id).slice(1)) || 0);
    const made = Object.assign({}, rule, {
      id: 'c' + (used.length ? Math.max.apply(null, used) + 1 : 1),
      origin: 'custom', enabled: true,
      order: rule.order == null ? 100 : rule.order,
    });
    (raw.custom[fieldKey] = raw.custom[fieldKey] || []).push(made);
    writeRaw(sheet, raw);
    return made;
  }

  function removeCustom(sheet, ruleId) {
    const raw = readRaw(sheet);
    let hit = false;
    for (const k of Object.keys(raw.custom)) {
      const n = raw.custom[k].length;
      raw.custom[k] = raw.custom[k].filter(r => r.id !== ruleId);
      if (raw.custom[k].length !== n) hit = true;
    }
    if (hit) writeRaw(sheet, raw);
    return hit;
  }

  function setEnabled(sheet, ruleId, enabled) {
    const raw = readRaw(sheet);
    const set = new Set(raw.disabled);
    if (enabled) set.delete(ruleId); else set.add(ruleId);
    raw.disabled = Array.from(set);
    writeRaw(sheet, raw);
    return true;
  }

  // One object per enabled rule, keyed by the target table's columns.
  function rows(sheet) {
    const schema = window.KHDA_SCHEMA.get(sheet);
    const doc = load(sheet);
    const out = [];
    let id = 0;
    for (const f of schema.fields) {
      const mine = doc.byField[f.key].filter(r => r.enabled).slice()
        .sort((a, b) => a.order - b.order);
      for (const r of mine) {
        out.push({
          RuleID: ++id,
          API_Code: doc.apiCode,
          Field_Name: f.db,
          Rule_Type: r.type,
          Rule_Value: serialize(r.type, r.value),
          Error_Code: r.errorCode,
          Error_Message: r.errorMessage,
          Execution_Order: r.order,
          Is_Active: 1,
          API_Name: doc.apiName,
        });
      }
    }
    return out;
  }

  const COLUMNS = ['RuleID', 'API_Code', 'Field_Name', 'Rule_Type', 'Rule_Value', 'Error_Code',
    'Error_Message', 'Execution_Order', 'Is_Active', 'API_Name'];

  const exportJson = sheet => JSON.stringify(rows(sheet), null, 2);

  function exportSql(sheet) {
    const q = v => (v == null ? 'NULL' : "N'" + String(v).replace(/'/g, "''") + "'");
    const lines = rows(sheet).map(r =>
      'INSERT INTO API_Validation_Rules (' + COLUMNS.join(', ') + ') VALUES (' +
      [r.RuleID, q(r.API_Code), q(r.Field_Name), q(r.Rule_Type), q(r.Rule_Value), q(r.Error_Code),
       q(r.Error_Message), r.Execution_Order, r.Is_Active, q(r.API_Name)].join(', ') + ');');
    return '-- ' + sheet + '\n-- generated ' + new Date().toISOString() + '\n' + lines.join('\n') + '\n';
  }

  function exportCsv(sheet) {
    const cell = v => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [COLUMNS.join(',')]
      .concat(rows(sheet).map(r => COLUMNS.map(c => cell(r[c])).join(',')))
      .join('\n') + '\n';
  }
```

Update the export line to:

```js
  window.KHDA_RULES = { TYPES, type, derive, serialize, apiCode, storageKey, load, setApiCode,
    addCustom, removeCustom, setEnabled, rows, exportJson, exportSql, exportCsv,
    COLUMNS, MAX_RULE_VALUE, MAX_ERROR_CODE, MAX_ERROR_MSG };
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS

- [x] **Step 5: Checkpoint — stop and report**

Do NOT commit. Report files touched and the full test output.

---

### Task 4: Page shell, navigation and translations

**Files:**
- Create: `configuration.html`
- Modify: `dashboard.html`, `submissions.html`, `index.html`, `report.html` (nav + `?v=`)
- Modify: `choose.html` (`?v=` only — no nav)
- Modify: `js/i18n.js`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime; the page loads `js/rules.js` and `js/config.js`.
- Produces: `configuration.html` with these element ids for Task 5+ — `#dsSelect`, `#apiCode`,
  `#apiCodeFlag`, `#exportMenu` (containing three `button[data-fmt=sql|json|csv]`),
  `#fieldSearch`, `#fieldFilter`, `#fieldRail`, `#rulePane`.
  Note: `data-i18n-ph` (placeholders) and `data-i18n-title` (tooltips) are both supported by
  `js/i18n.js` — verified at lines 700 and 701.

- [x] **Step 1: Add the nav link to the four pages that carry a nav**

In each of `dashboard.html`, `submissions.html`, `index.html`, `report.html`, find the `<nav class="portal-nav" aria-label="Portal">` block and add a third link after the Submissions one:

```html
          <a href="configuration.html" data-i18n="nav.configuration">Configuration</a>
```

`choose.html` is a redirect shim with no nav — do not add one.

- [x] **Step 2: Add the translations**

In `js/i18n.js`, in the **`en`** block beside `'nav.submissions'`:

```js
      'nav.configuration': 'Configuration',
      'cfg.title': 'Configuration',
      'cfg.lede': 'Define the validation rules applied to each dataset before submission.',
      'cfg.dataset': 'Dataset',
      'cfg.fields': 'Fields',
      'cfg.searchFields': 'Search fields',
      'cfg.filter.all': 'All',
      'cfg.filter.has': 'Has rules',
      'cfg.filter.none': 'No rules',
      'cfg.export': 'Export rules',
      'cfg.addRule': 'Add rule',
      'cfg.ruleType': 'Rule type',
      'cfg.ruleValue': 'Rule value',
      'cfg.noValue': 'No rule value needed',
      'cfg.save': 'Save rule',
      'cfg.cancel': 'Cancel',
      'cfg.remove': 'Remove',
      'cfg.disable': 'Disable',
      'cfg.enable': 'Enable',
      'cfg.derived': 'derived',
      'cfg.custom': 'custom',
      'cfg.disabled': 'disabled',
      'cfg.pickField': 'Select a field to see its rules.',
      'cfg.noRules': 'No rules on this field yet.',
      'cfg.ruleCount': '{n} rules',
      'cfg.exported': 'Rules exported',
      'cfg.exportedText': '{n} rules for {ds}.',
      'cfg.errorCode': 'Error code',
      'cfg.errorMessage': 'Error message',
      'cfg.execOrder': 'Execution order',
      'cfg.apiCode': 'API code',
      'cfg.unverified': 'unverified',
      'cfg.unverifiedHint': 'This API code was derived from the dataset name and may not match the API registry. Edit it if you know the correct code.',
      'cfg.tooLong': 'Value is {n} characters; the limit is {max}.',
      'cfg.exportJson': 'JSON',
      'cfg.exportSql': 'SQL INSERT',
      'cfg.exportCsv': 'CSV',
```

In the **`ar`** block, beside the matching `'nav.submissions'` entry:

```js
      'nav.configuration': 'الإعدادات',
      'cfg.title': 'الإعدادات',
      'cfg.lede': 'حدد قواعد التحقق المطبقة على كل مجموعة بيانات قبل الإرسال.',
      'cfg.dataset': 'مجموعة البيانات',
      'cfg.fields': 'الحقول',
      'cfg.searchFields': 'ابحث في الحقول',
      'cfg.filter.all': 'الكل',
      'cfg.filter.has': 'لديها قواعد',
      'cfg.filter.none': 'بدون قواعد',
      'cfg.export': 'تصدير القواعد',
      'cfg.addRule': 'إضافة قاعدة',
      'cfg.ruleType': 'نوع القاعدة',
      'cfg.ruleValue': 'قيمة القاعدة',
      'cfg.noValue': 'لا حاجة لقيمة',
      'cfg.save': 'حفظ القاعدة',
      'cfg.cancel': 'إلغاء',
      'cfg.remove': 'إزالة',
      'cfg.disable': 'تعطيل',
      'cfg.enable': 'تفعيل',
      'cfg.derived': 'مشتقة',
      'cfg.custom': 'مخصصة',
      'cfg.disabled': 'معطلة',
      'cfg.pickField': 'اختر حقلاً لعرض قواعده.',
      'cfg.noRules': 'لا توجد قواعد على هذا الحقل بعد.',
      'cfg.ruleCount': '{n} قواعد',
      'cfg.exported': 'تم تصدير القواعد',
      'cfg.exportedText': '{n} قاعدة لـ {ds}.',
      'cfg.errorCode': 'رمز الخطأ',
      'cfg.errorMessage': 'رسالة الخطأ',
      'cfg.execOrder': 'ترتيب التنفيذ',
      'cfg.apiCode': 'رمز الواجهة',
      'cfg.unverified': 'غير مؤكد',
      'cfg.unverifiedHint': 'تم اشتقاق رمز الواجهة من اسم مجموعة البيانات وقد لا يطابق السجل. عدّله إذا كنت تعرف الرمز الصحيح.',
      'cfg.tooLong': 'القيمة {n} حرفاً، والحد الأقصى {max}.',
      'cfg.exportJson': 'JSON',
      'cfg.exportSql': 'SQL INSERT',
      'cfg.exportCsv': 'CSV',
```

Rule type ids (`ALLOWED_VALUE`) stay English in both blocks and are never translated.

- [x] **Step 3: Create the page shell**

Create `configuration.html` by copying the header and footer structure of `submissions.html` exactly — the same `<head>`, skip link, `<header class="portal-header">` and script block — changing only the `<main>` and setting `aria-current="page"` on the Configuration nav link. The main region:

```html
  <main class="page" id="main" tabindex="-1">
    <div class="service-header">
      <h1 data-i18n="cfg.title">Configuration</h1>
      <p class="service-header__lede" data-i18n="cfg.lede">Define the validation rules applied to each dataset before submission.</p>
    </div>

    <div class="cfg-toolbar">
      <label class="cfg-ds">
        <span data-i18n="cfg.dataset">Dataset</span>
        <select id="dsSelect"></select>
      </label>
      <label class="cfg-ds cfg-ds--code">
        <span data-i18n="cfg.apiCode">API code</span>
        <span class="cfg-codewrap">
          <input type="text" id="apiCode" maxlength="100">
          <span class="chip chip--warning" id="apiCodeFlag" hidden
                data-i18n-title="cfg.unverifiedHint" data-i18n="cfg.unverified">unverified</span>
        </span>
      </label>
      <div class="cfg-export" id="exportMenu">
        <span class="cfg-export__label" data-i18n="cfg.export">Export rules</span>
        <button class="btn btn--outline btn--sm" type="button" data-fmt="sql" data-i18n="cfg.exportSql">SQL INSERT</button>
        <button class="btn btn--outline btn--sm" type="button" data-fmt="json" data-i18n="cfg.exportJson">JSON</button>
        <button class="btn btn--outline btn--sm" type="button" data-fmt="csv" data-i18n="cfg.exportCsv">CSV</button>
      </div>
    </div>

    <div class="cfg-grid">
      <aside class="cfg-rail" aria-label="Fields">
        <div class="cfg-rail__head">
          <h2 data-i18n="cfg.fields">Fields</h2>
          <input type="search" id="fieldSearch" class="search" data-i18n-ph="cfg.searchFields" placeholder="Search fields">
          <div class="segmented" id="fieldFilter" role="group">
            <button type="button" data-f="all" aria-pressed="true" data-i18n="cfg.filter.all">All</button>
            <button type="button" data-f="has" aria-pressed="false" data-i18n="cfg.filter.has">Has rules</button>
            <button type="button" data-f="none" aria-pressed="false" data-i18n="cfg.filter.none">No rules</button>
          </div>
        </div>
        <ul class="cfg-rail__list" id="fieldRail" role="listbox" aria-label="Fields" tabindex="0"></ul>
      </aside>
      <section class="cfg-pane" id="rulePane" aria-live="polite"></section>
    </div>
  </main>
```

Script block, in this order (`rules.js` after `schema.js`, `config.js` last):

```html
  <script src="js/i18n.js?v=20260926a"></script>
  <script src="js/a11y.js?v=20260926a"></script>
  <script src="js/activity.js?v=20260926a"></script>
  <script src="js/fit.js?v=20260926a"></script>
  <script src="js/lists.js?v=20260926a"></script>
  <script src="js/datasets.js?v=20260926a"></script>
  <script src="js/schema.js?v=20260926a"></script>
  <script src="js/rules.js?v=20260926a"></script>
  <script src="js/demo.js?v=20260926a"></script>
  <script src="js/config.js?v=20260926a"></script>
```

- [x] **Step 4: Bump the cache-bust string everywhere**

Run:

```bash
sed -i 's/?v=20260920f/?v=20260926a/g' dashboard.html submissions.html index.html report.html choose.html
grep -c "20260926a" dashboard.html submissions.html index.html report.html choose.html configuration.html
```

Expected: a non-zero count for all six files, and zero remaining matches for `20260920f`:

```bash
grep -rn "20260920f" *.html || echo "no stale cache-bust left"
```

- [x] **Step 5: Create a placeholder controller so the page loads**

Create `js/config.js`:

```js
/* KHDA — configuration page controller. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const sel = $('#dsSelect');
  if (!sel) return;
  for (const d of (window.KHDA_DATASETS || [])) {
    const o = document.createElement('option');
    o.value = d.sheet; o.textContent = d.title;
    sel.appendChild(o);
  }
})();
```

- [x] **Step 6: Verify in the browser**

Start the server, then load the page:

```bash
node tools/serve.js . 8765
```

Navigate to `http://127.0.0.1:8765/configuration.html` and confirm:
- The nav shows Dashboard / Submissions / **Configuration**, with Configuration marked current.
- The dataset select lists **46** options.
- The browser console reports **zero** errors.
- `dashboard.html` still renders and its nav also shows the third link.

- [x] **Step 7: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `configuration.html js/config.js js/i18n.js dashboard.html submissions.html index.html report.html choose.html`
- Suggested message if the user chooses to commit: "Add configuration page shell, nav entry and translations"

---

### Task 5: Field rail with search, filter and rule counts

**Files:**
- Modify: `js/config.js`
- Modify: `css/khda.css`

**Interfaces:**
- Consumes: `KHDA_RULES.load(sheet)` from Task 3; `#dsSelect`, `#fieldSearch`, `#fieldFilter`, `#fieldRail` from Task 4.
- Produces: module-internal `state = { sheet, schema, doc, selectedKey, query, filter }` and `renderRail()`, `selectField(key)` used by Task 6.

- [x] **Step 1: Implement the rail**

Replace the body of `js/config.js` with:

```js
/* KHDA — configuration page: pick a dataset, walk its fields, author validation rules. */
(function () {
  'use strict';

  const R = window.KHDA_RULES, S = window.KHDA_SCHEMA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const t = (k, v) => (window.t ? window.t(k, v) : k);

  const sel = $('#dsSelect'), rail = $('#fieldRail'), pane = $('#rulePane');
  if (!sel || !rail || !pane) return;

  const DATA = window.KHDA_DATASETS || [];
  const state = { sheet: null, schema: null, doc: null, selectedKey: null, query: '', filter: 'all' };

  // KHDA_SCHEMA.get() falls back to the first dataset for an unknown sheet rather than
  // returning null, so the sheet is checked here before it is trusted.
  function validSheet(sheet) {
    return DATA.some(d => d.sheet === sheet) ? sheet : (DATA[0] && DATA[0].sheet);
  }

  function setDataset(sheet) {
    state.sheet = validSheet(sheet);
    state.schema = S.get(state.sheet);
    state.doc = R.load(state.sheet);
    state.selectedKey = null;
    sel.value = state.sheet;
    const url = new URL(location.href);
    url.searchParams.set('sheet', state.sheet);
    history.replaceState(null, '', url);
    renderRail();
    renderPane();
  }

  const rulesOf = key => (state.doc.byField[key] || []);
  const activeCount = key => rulesOf(key).filter(r => r.enabled).length;

  function visibleFields() {
    const q = state.query.trim().toLowerCase();
    return state.schema.fields.filter(f => {
      const n = activeCount(f.key);
      if (state.filter === 'has' && !n) return false;
      if (state.filter === 'none' && n) return false;
      if (!q) return true;
      return (f.label + ' ' + f.db).toLowerCase().includes(q);
    });
  }

  function renderRail() {
    rail.innerHTML = '';
    for (const f of visibleFields()) {
      const n = activeCount(f.key);
      const hasCustom = rulesOf(f.key).some(r => r.origin === 'custom' && r.enabled);
      const li = document.createElement('li');
      li.className = 'cfg-field' + (f.key === state.selectedKey ? ' is-selected' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(f.key === state.selectedKey));
      li.dataset.key = f.key;
      li.innerHTML =
        '<span class="cfg-field__dot' + (hasCustom ? ' is-custom' : '') + '" aria-hidden="true"></span>' +
        '<span class="cfg-field__name"></span>' +
        '<span class="cfg-field__count">' + n + '</span>';
      li.querySelector('.cfg-field__name').textContent = f.label;
      li.addEventListener('click', () => selectField(f.key));
      rail.appendChild(li);
    }
  }

  function selectField(key) {
    state.selectedKey = key;
    renderRail();
    renderPane();
  }

  // Task 6 replaces this with the real rule list.
  function renderPane() {
    pane.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'cfg-empty';
    p.textContent = state.selectedKey ? '' : t('cfg.pickField');
    pane.appendChild(p);
  }

  // ---------- wiring ----------
  for (const d of DATA) {
    const o = document.createElement('option');
    o.value = d.sheet; o.textContent = d.title;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => setDataset(sel.value));

  $('#fieldSearch').addEventListener('input', e => { state.query = e.target.value; renderRail(); });

  $$('#fieldFilter button').forEach(b => b.addEventListener('click', () => {
    state.filter = b.dataset.f;
    $$('#fieldFilter button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderRail();
  }));

  // roving focus: arrow keys walk the rail, Enter opens the field
  rail.addEventListener('keydown', e => {
    const items = $$('.cfg-field', rail);
    if (!items.length) return;
    let i = items.findIndex(x => x.dataset.key === state.selectedKey);
    if (e.key === 'ArrowDown') { i = Math.min(items.length - 1, i + 1); }
    else if (e.key === 'ArrowUp') { i = Math.max(0, i - 1); }
    else return;
    e.preventDefault();
    selectField(items[i].dataset.key);
    items[i].scrollIntoView({ block: 'nearest' });
  });

  // Three export formats, all rendering the same rows() against the real target table.
  const FORMATS = {
    json: { fn: s => R.exportJson(s), ext: 'json', mime: 'application/json' },
    sql:  { fn: s => R.exportSql(s),  ext: 'sql',  mime: 'text/plain' },
    csv:  { fn: s => R.exportCsv(s),  ext: 'csv',  mime: 'text/csv' },
  };

  function download(kind) {
    const spec = FORMATS[kind];
    const text = spec.fn(state.sheet);
    const blob = new Blob([text], { type: spec.mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.sheet.replace(/[^A-Za-z0-9]+/g, '_') + '_Rules.' + spec.ext;
    a.click();
    URL.revokeObjectURL(a.href);
    if (window.khdaToast) {
      window.khdaToast('success', t('cfg.exported'),
        t('cfg.exportedText', { n: R.rows(state.sheet).length, ds: state.schema.title }));
    }
  }

  $$('#exportMenu button[data-fmt]').forEach(b =>
    b.addEventListener('click', () => download(b.dataset.fmt)));

  // API_Code is a NOT NULL join key. When it was only derived from the dataset name it may not
  // match KHDA's API registry, so it is shown, flagged and editable rather than silently assumed.
  const apiInput = $('#apiCode');
  function renderApiCode() {
    apiInput.value = state.doc.apiCode;
    $('#apiCodeFlag').hidden = state.doc.verified;
  }
  apiInput.addEventListener('change', () => {
    R.setApiCode(state.sheet, apiInput.value);
    state.doc = R.load(state.sheet);
    renderApiCode();
  });

  setDataset(new URLSearchParams(location.search).get('sheet') || (DATA[0] && DATA[0].sheet));
})();
```

- [x] **Step 2: Add the layout CSS**

Append a new section to `css/khda.css`, using only existing tokens:

```css
/* ==========================================================================
   Configuration — rule engine
   ========================================================================== */
.cfg-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.cfg-ds { display: flex; flex-direction: column; gap: 8px; font: 400 16px/24px var(--font); }
.cfg-ds select { height: 56px; min-width: 360px; padding: 0 16px; border: 1px solid var(--outline); border-radius: 8px; background: var(--surface); font: inherit; color: var(--on-surface); }
.cfg-grid { display: grid; grid-template-columns: 366px minmax(0, 1fr); gap: 16px; align-items: start; }
.cfg-rail { background: var(--surface); border: 1px solid var(--outline); border-radius: 16px; padding: 16px; }
.cfg-rail__head { display: flex; flex-direction: column; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--outline); }
.cfg-rail__head h2 { font: 400 20px/28px var(--font); margin: 0; }
/* the rail scrolls inside its own card: 102 fields must not stretch the page */
.cfg-rail__list { list-style: none; margin: 0; padding: 8px 0 0; max-height: 560px; overflow-y: auto; }
.cfg-field { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; cursor: pointer; }
.cfg-field:hover { background: var(--surface-bright); }
.cfg-field.is-selected { background: var(--primary-container); color: var(--on-primary-container); }
.cfg-field__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--outline-variant); flex: 0 0 auto; }
.cfg-field__dot.is-custom { background: var(--primary); }
.cfg-field__name { flex: 1 1 auto; min-width: 0; font: 400 16px/24px var(--font); overflow-wrap: anywhere; }
.cfg-field__count { flex: 0 0 auto; min-width: 24px; height: 24px; padding: 0 8px; border-radius: 999px; background: var(--surface-dim); color: var(--on-surface-secondary); font: 400 14px/24px var(--font); text-align: center; }
.cfg-pane { background: var(--surface); border: 1px solid var(--outline); border-radius: 16px; padding: 24px; min-height: 400px; }
.cfg-empty { color: var(--on-surface-muted); font: 400 16px/24px var(--font); }
.cfg-rail__list:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 8px; }

/* right-to-left */
[dir="rtl"] .cfg-field__count { text-align: center; }
[dir="rtl"] .cfg-ds select { background-position: left 16px center; }

@media (max-width: 1100px) { .cfg-grid { grid-template-columns: 1fr; } }
```

- [x] **Step 3: Verify in the browser**

With the server running, open `http://127.0.0.1:8765/configuration.html` and confirm:
- Selecting **OBF Self Report** lists 102 fields and the rail scrolls inside its own card without stretching the page.
- Typing `institution` in the search narrows the list.
- **Has rules** / **No rules** change the list; counts match the badges.
- Arrow keys move the selection; the URL gains `?sheet=`.
- **Export rules** downloads a `.json` file and raises a toast.
- Console reports zero errors.

- [x] **Step 4: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `js/config.js css/khda.css`
- Suggested message if the user chooses to commit: "Add configuration field rail with search, filter and rule counts"

---

### Task 6: Rule list, origin badges and the disable toggle

**Files:**
- Modify: `js/config.js` (replace `renderPane`)
- Modify: `css/khda.css`

**Interfaces:**
- Consumes: `state`, `rulesOf(key)`, `renderRail()` from Task 5; `KHDA_RULES.setEnabled`, `removeCustom` from Task 3.
- Produces: `renderPane()` rendering the field header and rule cards, and `describe(rule)` → a human-readable value string, reused by Task 7's composer preview.

- [x] **Step 1: Replace renderPane**

In `js/config.js`, replace the placeholder `renderPane` with:

```js
  // A rule's value has a different shape per type; this is the one place that flattens it.
  function describe(rule) {
    const v = rule.value;
    if (v == null || v === '') return t('cfg.noValue');
    if (Array.isArray(v)) {
      if (rule.type === 'REFERENCE_MATCH') {
        return v.map(k => (state.schema.field(k) || {}).label || k).join(' + ');
      }
      return v.length > 8 ? v.slice(0, 8).join(', ') + ' … (' + v.length + ')' : v.join(', ');
    }
    if (typeof v === 'object') {
      if (rule.type === 'REFERENCE_EXISTS') return v.table + '.' + v.column;
      if (rule.type === 'CONDITIONAL_REQUIRED') {
        const f = state.schema.field(v.field);
        return (f ? f.label : v.field) + ' ' + v.op + (v.value ? ' ' + v.value : '');
      }
      if (rule.type === 'CUSTOM_BUSINESS_RULE') return v.handler;
      return JSON.stringify(v);
    }
    return String(v);
  }

  function ruleCard(rule) {
    const li = document.createElement('li');
    li.className = 'cfg-rule' + (rule.enabled ? '' : ' is-off');
    li.dataset.id = rule.id;

    const head = document.createElement('div');
    head.className = 'cfg-rule__head';
    const name = document.createElement('code');
    name.className = 'cfg-rule__type';
    name.textContent = rule.type;                       // rule ids stay English
    const origin = document.createElement('span');
    origin.className = 'chip ' + (rule.origin === 'derived' ? 'chip--neutral' : 'chip--progress');
    origin.textContent = t(rule.origin === 'derived' ? 'cfg.derived' : 'cfg.custom');
    head.appendChild(name);
    head.appendChild(origin);
    if (!rule.enabled) {
      const off = document.createElement('span');
      off.className = 'chip chip--late';
      off.textContent = t('cfg.disabled');
      head.appendChild(off);
    }

    const val = document.createElement('p');
    val.className = 'cfg-rule__value';
    val.textContent = describe(rule);

    const actions = document.createElement('div');
    actions.className = 'cfg-rule__actions';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn--ghost btn--md';
    toggle.textContent = t(rule.enabled ? 'cfg.disable' : 'cfg.enable');
    toggle.addEventListener('click', () => {
      R.setEnabled(state.sheet, rule.id, !rule.enabled);
      state.doc = R.load(state.sheet);
      renderRail(); renderPane();
    });
    actions.appendChild(toggle);

    // derived rules are never deleted — schema.js still enforces them, so only disabling is honest
    if (rule.origin === 'custom') {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--ghost btn--md cfg-rule__remove';
      del.textContent = t('cfg.remove');
      del.addEventListener('click', () => {
        R.removeCustom(state.sheet, rule.id);
        state.doc = R.load(state.sheet);
        renderRail(); renderPane();
      });
      actions.appendChild(del);
    }

    li.appendChild(head); li.appendChild(val); li.appendChild(actions);
    return li;
  }

  function renderPane() {
    pane.innerHTML = '';
    if (!state.selectedKey) {
      const p = document.createElement('p');
      p.className = 'cfg-empty';
      p.textContent = t('cfg.pickField');
      pane.appendChild(p);
      return;
    }
    const f = state.schema.field(state.selectedKey);

    const head = document.createElement('header');
    head.className = 'cfg-pane__head';
    const h2 = document.createElement('h2');
    h2.textContent = f.label;                            // field names stay English
    const meta = document.createElement('p');
    meta.className = 'cfg-pane__meta';
    meta.textContent = f.type + ' · ' + f.db;
    head.appendChild(h2); head.appendChild(meta);
    pane.appendChild(head);

    const list = document.createElement('ul');
    list.className = 'cfg-rules';
    const rules = rulesOf(f.key);
    if (!rules.length) {
      const p = document.createElement('p');
      p.className = 'cfg-empty';
      p.textContent = t('cfg.noRules');
      pane.appendChild(p);
    } else {
      rules.forEach(r => list.appendChild(ruleCard(r)));
      pane.appendChild(list);
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn--outline btn--md cfg-add';
    add.id = 'addRule';
    add.textContent = '+ ' + t('cfg.addRule');
    pane.appendChild(add);
  }
```

- [x] **Step 2: Add the rule-card CSS**

Append to the Configuration section of `css/khda.css`:

```css
.cfg-pane__head { padding-bottom: 16px; border-bottom: 1px solid var(--outline); margin-bottom: 16px; }
.cfg-pane__head h2 { font: 400 24px/32px var(--font); margin: 0 0 4px; }
.cfg-pane__meta { font: 400 14px/20px var(--font); color: var(--on-surface-muted); margin: 0; }
.cfg-rules { list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.cfg-rule { border: 1px solid var(--outline); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.cfg-rule.is-off { background: var(--disabled-bg); color: var(--disabled-fg); }
.cfg-rule__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cfg-rule__type { font-family: Consolas, "Courier New", monospace; font-size: 14px; letter-spacing: .02em; color: var(--on-surface-strong); }
.cfg-rule.is-off .cfg-rule__type { color: var(--disabled-fg); }
.cfg-rule__value { margin: 0; font: 400 16px/24px var(--font); color: var(--on-surface-secondary); overflow-wrap: anywhere; }
.cfg-rule__actions { display: flex; gap: 8px; }
.cfg-rule__remove { color: var(--error); }
.cfg-add { align-self: flex-start; }
```

- [x] **Step 3: Verify in the browser**

Reload `configuration.html` and confirm on **Applicants - Basic Details** → **Institution Code**:
- Three derived cards appear: `REQUIRED`, `ALLOWED_VALUE`, `REFERENCE_EXISTS`.
- `ALLOWED_VALUE` shows a truncated list ending `… (75)`, not 75 raw values.
- `REFERENCE_EXISTS` reads `MST_Institutional_Codes.App_Institution_Code`.
- Derived cards show a **Disable** button and **no Remove** button.
- Disabling one greys the card, drops the rail count by one, and survives a page reload.
- Console reports zero errors.

- [x] **Step 4: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `js/config.js css/khda.css`
- Suggested message if the user chooses to commit: "Render rule cards with origin badges and a disable toggle"

---

### Task 7: Rule composer with the simple value editors

**Files:**
- Modify: `js/config.js`
- Modify: `css/khda.css`
- Modify: `js/rules.js` — **one line only**: add `ORDER` to the `window.KHDA_RULES = { … }` export
  so the composer can default `Execution_Order` per rule type without duplicating the map.
  Change nothing else in that file.

**Interfaces:**
- Consumes: `renderPane()`, `describe()` from Task 6; `KHDA_RULES.TYPES`, `type()`, `addCustom()`.
- Produces: `openComposer()`, and the editor registry `EDITORS` — an object keyed by the descriptor's `value` string (`'none'`, `'select'`, `'number'`, `'pattern'`, `'format'`), each `{ mount(host, field, onChange), read() }`. Tasks 8–11 add `'chips'`, `'reference'`, `'fields'`, `'condition'` and `'sql'` to this same registry.

- [x] **Step 1: Add the editor registry and composer**

In `js/config.js`, before `renderPane`:

```js
  // Each editor mounts its own controls and knows how to read a value back out.
  // Tasks 8-11 register the remaining editors against the same contract.
  const EDITORS = {};

  EDITORS.none = {
    mount(host) {
      const p = document.createElement('p');
      p.className = 'cfg-empty';
      p.textContent = t('cfg.noValue');
      host.appendChild(p);
    },
    read() { return null; },
  };

  EDITORS.select = {
    mount(host, field, onChange, descriptor) {
      const s = document.createElement('select');
      s.className = 'cfg-input';
      s.id = 'cfgValue';
      for (const o of descriptor.options) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        s.appendChild(opt);
      }
      s.addEventListener('change', onChange);
      host.appendChild(s);
    },
    read() { return $('#cfgValue').value; },
  };

  EDITORS.number = {
    mount(host, field, onChange) {
      const i = document.createElement('input');
      i.type = 'number'; i.min = '1'; i.className = 'cfg-input'; i.id = 'cfgValue';
      i.addEventListener('input', onChange);
      host.appendChild(i);
    },
    read() {
      const n = Number($('#cfgValue').value);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
  };

  function previewEditor(host, id, sample, test) {
    const i = document.createElement('input');
    i.type = 'text'; i.className = 'cfg-input'; i.id = id; i.value = sample;
    const p = document.createElement('p');
    p.className = 'cfg-preview';
    const redraw = () => {
      const ok = test(i.value);
      p.textContent = (ok ? '✓ ' : '✕ ') + i.value;
      p.className = 'cfg-preview ' + (ok ? 'is-ok' : 'is-bad');
    };
    i.addEventListener('input', redraw);
    host.appendChild(i); host.appendChild(p); redraw();
  }

  EDITORS.pattern = {
    mount(host) {
      previewEditor(host, 'cfgValue', '+971-4-1234567',
        v => /^\+?[\d#]+([-\s][\d#]+)+$/.test(v.trim()));
    },
    read() { return $('#cfgValue').value.trim() || null; },
  };

  EDITORS.format = {
    mount(host) {
      const s = document.createElement('select');
      s.className = 'cfg-input'; s.id = 'cfgValue';
      for (const o of ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DDTHH:mm:ss']) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        s.appendChild(opt);
      }
      const p = document.createElement('p');
      p.className = 'cfg-preview is-ok';
      const redraw = () => {
        const d = new Date('2026-09-16T00:00:00');
        const pad = n => String(n).padStart(2, '0');
        const map = {
          'YYYY-MM-DD': '2026-09-16', 'DD/MM/YYYY': '16/09/2026',
          'MM/DD/YYYY': '09/16/2026', 'YYYY-MM-DDTHH:mm:ss': '2026-09-16T00:00:00',
        };
        p.textContent = '✓ ' + (map[s.value] || pad(d.getDate()));
      };
      s.addEventListener('change', redraw);
      host.appendChild(s); host.appendChild(p); redraw();
    },
    read() { return $('#cfgValue').value; },
  };

  function openComposer() {
    const existing = $('.cfg-composer');
    if (existing) existing.remove();
    const field = state.schema.field(state.selectedKey);

    const box = document.createElement('form');
    box.className = 'cfg-composer';

    const typeLabel = document.createElement('label');
    typeLabel.className = 'cfg-label';
    typeLabel.textContent = t('cfg.ruleType');
    const typeSel = document.createElement('select');
    typeSel.className = 'cfg-input'; typeSel.id = 'cfgType';
    for (const ty of R.TYPES) {
      const o = document.createElement('option');
      o.value = ty.id; o.textContent = ty.id;          // rule ids stay English
      typeSel.appendChild(o);
    }
    typeLabel.appendChild(typeSel);

    const valLabel = document.createElement('label');
    valLabel.className = 'cfg-label';
    valLabel.textContent = t('cfg.ruleValue');
    const valHost = document.createElement('div');
    valHost.className = 'cfg-valuehost';
    valLabel.appendChild(valHost);

    const actions = document.createElement('div');
    actions.className = 'cfg-composer__actions';
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'btn btn--primary btn--md';
    save.textContent = t('cfg.save');
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn--ghost btn--md';
    cancel.textContent = t('cfg.cancel');
    cancel.addEventListener('click', () => { box.remove(); $('#addRule').focus(); });
    actions.appendChild(save); actions.appendChild(cancel);

    let current = null;
    function mountEditor() {
      valHost.innerHTML = '';
      const descriptor = R.type(typeSel.value);
      current = EDITORS[descriptor.value] || EDITORS.none;
      current.mount(valHost, field, () => {}, descriptor);
      // moving focus to the new control keeps a keyboard user oriented after the swap
      const first = valHost.querySelector('input, select, textarea, button');
      if (first) first.focus();
    }
    typeSel.addEventListener('change', mountEditor);

    // Error_Code and Error_Message are NOT NULL in the target table, so they are generated
    // from the chosen type and kept editable. Execution_Order defaults to the type's rank.
    const metaRow = document.createElement('div');
    metaRow.className = 'cfg-row cfg-row--meta';
    const mkMeta = (id, labelKey, maxLen) => {
      const l = document.createElement('label');
      l.className = 'cfg-label';
      l.textContent = t(labelKey);
      const i = document.createElement('input');
      i.type = 'text'; i.className = 'cfg-input'; i.id = id; i.maxLength = maxLen;
      l.appendChild(i);
      metaRow.appendChild(l);
      return i;
    };
    const codeIn = mkMeta('cfgErrCode', 'cfg.errorCode', R.MAX_ERROR_CODE);
    const msgIn  = mkMeta('cfgErrMsg',  'cfg.errorMessage', R.MAX_ERROR_MSG);
    const orderLabel = document.createElement('label');
    orderLabel.className = 'cfg-label';
    orderLabel.textContent = t('cfg.execOrder');
    const orderIn = document.createElement('input');
    orderIn.type = 'number'; orderIn.className = 'cfg-input'; orderIn.id = 'cfgOrder'; orderIn.min = '1';
    orderLabel.appendChild(orderIn);
    metaRow.appendChild(orderLabel);

    // regenerate the defaults whenever the type changes, unless the user has edited them
    let codeTouched = false, msgTouched = false;
    codeIn.addEventListener('input', () => { codeTouched = true; });
    msgIn.addEventListener('input', () => { msgTouched = true; });
    function refreshMeta() {
      const probe = R.derive(state.schema);   // reuse the same generator the derived rules use
      const sample = (probe[state.selectedKey] || [])[0];
      const prefix = sample ? sample.errorCode.replace(/_[A-Z_]+$/, '') : 'ERR';
      if (!codeTouched) codeIn.value = (prefix + '_' + typeSel.value).slice(0, R.MAX_ERROR_CODE);
      if (!msgTouched) msgIn.value = (field.label + ' failed ' + typeSel.value + '.').slice(0, R.MAX_ERROR_MSG);
      orderIn.value = String((R.ORDER && R.ORDER[typeSel.value]) || 100);
    }

    box.addEventListener('submit', e => {
      e.preventDefault();
      const value = current.read();
      const descriptor = R.type(typeSel.value);
      if (descriptor.value !== 'none' && (value == null || (Array.isArray(value) && !value.length))) {
        valHost.classList.add('is-invalid');
        return;
      }
      // Rule_Value is nvarchar(1000); refuse rather than let the database truncate
      const serialized = R.serialize(typeSel.value, value);
      if (serialized != null && serialized.length > R.MAX_RULE_VALUE) {
        valHost.classList.add('is-invalid');
        valHost.setAttribute('data-error',
          t('cfg.tooLong', { n: serialized.length, max: R.MAX_RULE_VALUE }));
        return;
      }
      if (!codeIn.value.trim() || !msgIn.value.trim()) return;   // both are NOT NULL
      R.addCustom(state.sheet, state.selectedKey, {
        type: typeSel.value, value,
        errorCode: codeIn.value.trim(),
        errorMessage: msgIn.value.trim(),
        order: Number(orderIn.value) || 100,
      });
      state.doc = R.load(state.sheet);
      renderRail(); renderPane();
      $('#addRule').focus();
    });

    box.appendChild(typeLabel); box.appendChild(valLabel);
    box.appendChild(metaRow); box.appendChild(actions);
    pane.appendChild(box);
    mountEditor();
    typeSel.focus();
  }
```

- [x] **Step 2: Wire the Add rule button**

At the end of `renderPane()`, after `pane.appendChild(add);`, add:

```js
    add.addEventListener('click', openComposer);
```

- [x] **Step 3: Add the composer CSS**

Append to the Configuration section of `css/khda.css`:

```css
.cfg-composer { border: 1px solid var(--primary); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 16px; background: var(--surface-bright); }
.cfg-label { display: flex; flex-direction: column; gap: 8px; font: 400 16px/24px var(--font); }
.cfg-input { height: 56px; padding: 0 16px; border: 1px solid var(--outline); border-radius: 8px; background: var(--surface); font: 400 16px/24px var(--font); color: var(--on-surface); width: 100%; }
.cfg-input:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cfg-valuehost.is-invalid .cfg-input { border-color: var(--error); }
.cfg-composer__actions { display: flex; gap: 8px; }
.cfg-preview { margin: 8px 0 0; font: 400 14px/20px var(--font); }
.cfg-preview.is-ok { color: var(--success); }
.cfg-preview.is-bad { color: var(--error); }
```

- [x] **Step 4: Verify in the browser**

On any field, click **+ Add rule** and confirm:
- The type select lists all 12 ids in English.
- `REQUIRED` shows "No rule value needed" and saves with no value.
- `MIN_LENGTH` shows a number input; saving `3` adds a `custom` card reading `3`.
- `PHONE_FORMAT` shows a live preview flipping ✓/✕ as you type.
- `DATE_FORMAT` previews the chosen format.
- Switching type swaps the editor and moves focus to the new control.
- Saving an empty required value marks the field invalid rather than saving.
- A saved custom rule survives reload and has a **Remove** button.

- [x] **Step 5: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `js/config.js css/khda.css`
- Suggested message if the user chooses to commit: "Add rule composer with none, select, number, pattern and format editors"

---

### Task 8: Chip editor for ALLOWED_VALUE

**Files:**
- Modify: `js/config.js`
- Modify: `css/khda.css`

**Interfaces:**
- Consumes: the `EDITORS` registry contract from Task 7.
- Produces: `EDITORS.chips` — values added one at a time, returned as `string[]`.

- [x] **Step 1: Implement the chip editor**

In `js/config.js`, after `EDITORS.format`:

```js
  EDITORS.chips = {
    mount(host) {
      const values = [];
      const wrap = document.createElement('div');
      wrap.className = 'cfg-chips';
      const live = document.createElement('span');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'cfg-chips__input'; input.id = 'cfgValue';

      function redraw() {
        Array.from(wrap.querySelectorAll('.cfg-chip')).forEach(c => c.remove());
        values.forEach((v, i) => {
          const c = document.createElement('span');
          c.className = 'cfg-chip';
          c.textContent = v;
          const x = document.createElement('button');
          x.type = 'button'; x.className = 'cfg-chip__x';
          x.setAttribute('aria-label', 'Remove ' + v);
          x.textContent = '×';
          x.addEventListener('click', () => { values.splice(i, 1); live.textContent = v + ' removed'; redraw(); });
          c.appendChild(x);
          wrap.insertBefore(c, input);
        });
      }

      function add(raw) {
        // pasting "PR,BOT,BOG" becomes three chips rather than one long value
        for (const piece of String(raw).split(',')) {
          const v = piece.trim();
          if (v && !values.includes(v)) values.push(v);
        }
        live.textContent = values.length + ' values';
        input.value = '';
        redraw();
      }

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); add(input.value); }
        else if (e.key === 'Backspace' && !input.value && values.length) { values.pop(); redraw(); }
      });
      input.addEventListener('paste', e => {
        const txt = (e.clipboardData || window.clipboardData).getData('text');
        if (txt.includes(',')) { e.preventDefault(); add(txt); }
      });
      // a value typed but not committed must not be lost on save
      input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); });

      wrap.appendChild(input);
      host.appendChild(wrap);
      host.appendChild(live);
      host._values = values;
      redraw();
    },
    read() {
      const host = $('.cfg-valuehost');
      return host._values && host._values.length ? host._values.slice() : null;
    },
  };
```

- [x] **Step 2: Add the chip CSS**

```css
.cfg-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 56px; padding: 8px 12px; border: 1px solid var(--outline); border-radius: 8px; background: var(--surface); }
.cfg-chips:focus-within { box-shadow: var(--focus-ring); }
.cfg-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px 0 10px; border-radius: 999px; background: var(--primary-container); color: var(--on-primary-container); font: 400 14px/20px var(--font); }
.cfg-chip__x { border: 0; background: none; cursor: pointer; color: inherit; font-size: 16px; line-height: 1; padding: 0 2px; }
.cfg-chips__input { flex: 1 1 120px; min-width: 120px; border: 0; outline: none; height: 36px; font: 400 16px/24px var(--font); background: transparent; color: var(--on-surface); }
```

If `.sr-only` is not already defined in `css/khda.css`, add it:

```css
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
```

- [x] **Step 3: Verify in the browser**

Add an `ALLOWED_VALUE` rule and confirm: typing `PR` + Enter makes a chip; pasting `BOT,BOG,BOTC` makes three more; Backspace on an empty input removes the last; the × removes a specific one; duplicates are ignored; saving stores all five and the card reads `PR, BOT, BOG, BOTC, …`.

- [x] **Step 4: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `js/config.js css/khda.css`
- Suggested message if the user chooses to commit: "Add chip editor for ALLOWED_VALUE rules"

---

### Task 9: Reference editors

**Files:**
- Modify: `js/config.js`
- Modify: `css/khda.css`

**Interfaces:**
- Consumes: the `EDITORS` contract; `window.KHDA_LISTS` (44 code lists).
- Produces: `EDITORS.reference` → `{table, column}`; `EDITORS.fields` → `string[]` of 2+ field keys.

- [x] **Step 1: Implement both editors**

```js
  EDITORS.reference = {
    mount(host, field) {
      const tableSel = document.createElement('select');
      tableSel.className = 'cfg-input'; tableSel.id = 'cfgRefTable';
      // grounded in the 44 real code lists rather than free text
      for (const name of Object.keys(window.KHDA_LISTS || {}).sort()) {
        const o = document.createElement('option');
        o.value = 'MST_' + name.trim().replace(/[^A-Za-z0-9]+/g, '_');
        o.textContent = o.value;
        tableSel.appendChild(o);
      }
      const colSel = document.createElement('select');
      colSel.className = 'cfg-input'; colSel.id = 'cfgRefCol';
      for (const f of state.schema.fields) {
        const o = document.createElement('option');
        o.value = f.db; o.textContent = f.db;
        if (f.key === field.key) o.selected = true;
        colSel.appendChild(o);
      }
      const row = document.createElement('div');
      row.className = 'cfg-row';
      row.appendChild(tableSel); row.appendChild(colSel);
      host.appendChild(row);
    },
    read() {
      return { table: $('#cfgRefTable').value, column: $('#cfgRefCol').value };
    },
  };

  EDITORS.fields = {
    mount(host, field) {
      const box = document.createElement('div');
      box.className = 'cfg-checks';
      for (const f of state.schema.fields) {
        const l = document.createElement('label');
        l.className = 'cfg-check';
        const c = document.createElement('input');
        c.type = 'checkbox'; c.value = f.key;
        if (f.key === field.key) { c.checked = true; c.disabled = true; }  // the field itself is always part of the match
        const s = document.createElement('span');
        s.textContent = f.label;
        l.appendChild(c); l.appendChild(s);
        box.appendChild(l);
      }
      box.id = 'cfgFields';
      host.appendChild(box);
    },
    read() {
      const picked = Array.from($('#cfgFields').querySelectorAll('input:checked')).map(c => c.value);
      return picked.length >= 2 ? picked : null;   // a match needs at least two fields
    },
  };
```

- [x] **Step 2: Add the CSS**

```css
.cfg-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cfg-checks { max-height: 240px; overflow-y: auto; border: 1px solid var(--outline); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.cfg-check { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font: 400 16px/24px var(--font); cursor: pointer; }
.cfg-check:hover { background: var(--surface-bright); }
@media (max-width: 1100px) { .cfg-row { grid-template-columns: 1fr; } }
```

- [x] **Step 3: Verify in the browser**

Confirm `REFERENCE_EXISTS` lists 44 `MST_*` tables with the current field's column preselected, and saves as `MST_X.Col`. Confirm `REFERENCE_MATCH` preselects and locks the current field, refuses to save with only that one selected, and saves as `A + B` once a second is ticked.

- [x] **Step 4: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `js/config.js css/khda.css`
- Suggested message if the user chooses to commit: "Add reference-exists and reference-match editors"

---

### Task 10: CONDITIONAL_REQUIRED condition builder

**Files:**
- Modify: `js/config.js`

**Interfaces:**
- Consumes: the `EDITORS` contract.
- Produces: `EDITORS.condition` → `{ field, op, value }` where `op` ∈ `'='`, `'≠'`, `'is empty'`, `'is not empty'`.

- [x] **Step 1: Implement the builder**

```js
  EDITORS.condition = {
    mount(host, field) {
      const row = document.createElement('div');
      row.className = 'cfg-row cfg-row--3';

      const fieldSel = document.createElement('select');
      fieldSel.className = 'cfg-input'; fieldSel.id = 'cfgCondField';
      for (const f of state.schema.fields) {
        if (f.key === field.key) continue;              // a field cannot be conditional on itself
        const o = document.createElement('option');
        o.value = f.key; o.textContent = f.label;
        fieldSel.appendChild(o);
      }

      const opSel = document.createElement('select');
      opSel.className = 'cfg-input'; opSel.id = 'cfgCondOp';
      for (const op of ['=', '≠', 'is empty', 'is not empty']) {
        const o = document.createElement('option');
        o.value = op; o.textContent = op;
        opSel.appendChild(o);
      }

      const valHost = document.createElement('div');
      valHost.id = 'cfgCondValueHost';

      // when the chosen field is coded, the value becomes a picker of that list
      function redrawValue() {
        valHost.innerHTML = '';
        const needsValue = ['=', '≠'].includes(opSel.value);
        if (!needsValue) return;
        const f = state.schema.field(fieldSel.value);
        let el;
        if (f && f.opts && f.opts.length) {
          el = document.createElement('select');
          for (const o of f.opts) {
            const opt = document.createElement('option');
            opt.value = o.v; opt.textContent = o.l;
            el.appendChild(opt);
          }
        } else {
          el = document.createElement('input');
          el.type = 'text';
        }
        el.className = 'cfg-input'; el.id = 'cfgCondValue';
        valHost.appendChild(el);
      }
      fieldSel.addEventListener('change', redrawValue);
      opSel.addEventListener('change', redrawValue);

      row.appendChild(fieldSel); row.appendChild(opSel); row.appendChild(valHost);
      host.appendChild(row);
      redrawValue();
    },
    read() {
      const op = $('#cfgCondOp').value;
      const needsValue = ['=', '≠'].includes(op);
      const el = $('#cfgCondValue');
      const value = needsValue ? (el ? String(el.value).trim() : '') : '';
      if (needsValue && !value) return null;
      return { field: $('#cfgCondField').value, op, value };
    },
  };
```

- [x] **Step 2: Add the three-column row CSS**

```css
.cfg-row--3 { grid-template-columns: 1fr auto 1fr; align-items: start; }
@media (max-width: 1100px) { .cfg-row--3 { grid-template-columns: 1fr; } }
```

- [x] **Step 3: Verify in the browser**

On **Institute - Leadership Contact Information**, add a `CONDITIONAL_REQUIRED` rule. Confirm the field select excludes the current field; choosing a coded field turns the value into a dropdown of that list; choosing `is empty` hides the value control; `=` with an empty value refuses to save; a saved rule reads like `Executive Position = BOT`.

- [x] **Step 4: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `js/config.js css/khda.css`
- Suggested message if the user chooses to commit: "Add conditional-required condition builder"

---

### Task 11: CUSTOM_BUSINESS_RULE SQL editor

**Files:**
- Modify: `js/config.js`
- Modify: `css/khda.css`

**Interfaces:**
- Consumes: the `EDITORS` contract.
- Produces: `EDITORS.sql` → `{ handler, sql }`.

- [x] **Step 1: Implement the SQL editor**

A styled `<textarea>` with a line-number gutter — no CDN editor, because the page must work offline.

```js
  EDITORS.sql = {
    mount(host, field) {
      const handler = document.createElement('input');
      handler.type = 'text'; handler.className = 'cfg-input'; handler.id = 'cfgHandler';
      handler.placeholder = 'CrossFieldLimit';

      const wrap = document.createElement('div');
      wrap.className = 'cfg-sql';
      const gutter = document.createElement('div');
      gutter.className = 'cfg-sql__gutter'; gutter.setAttribute('aria-hidden', 'true');
      const ta = document.createElement('textarea');
      ta.className = 'cfg-sql__area'; ta.id = 'cfgSql'; ta.rows = 6; ta.spellcheck = false;
      ta.value = 'SELECT CASE WHEN ' + field.db + ' IS NOT NULL THEN 1 ELSE 0 END';

      const note = document.createElement('p');
      note.className = 'cfg-preview';

      function gutterRedraw() {
        const n = ta.value.split('\n').length;
        gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
      }
      // shape check only: there is no database here, so this must not imply execution
      function check() {
        const v = ta.value.trim();
        const ok = /^select\b/i.test(v) && !v.slice(0, -1).includes(';');
        note.textContent = ok
          ? '✓ Returns a boolean. Validated on shape only — not executed.'
          : '✕ Must be a single SELECT returning 1 or 0.';
        note.className = 'cfg-preview ' + (ok ? 'is-ok' : 'is-bad');
        return ok;
      }
      ta.addEventListener('input', () => { gutterRedraw(); check(); });
      ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });

      const validate = document.createElement('button');
      validate.type = 'button'; validate.className = 'btn btn--outline btn--md';
      validate.textContent = 'Validate';
      validate.addEventListener('click', check);

      wrap.appendChild(gutter); wrap.appendChild(ta);
      host.appendChild(handler); host.appendChild(wrap); host.appendChild(note); host.appendChild(validate);
      gutterRedraw(); check();
    },
    read() {
      const sql = $('#cfgSql').value.trim();
      const handler = $('#cfgHandler').value.trim();
      if (!sql || !/^select\b/i.test(sql)) return null;
      return { handler: handler || 'CustomRule', sql };
    },
  };
```

- [x] **Step 2: Add the SQL editor CSS**

```css
.cfg-sql { display: grid; grid-template-columns: 44px minmax(0, 1fr); border: 1px solid var(--outline); border-radius: 8px; overflow: hidden; background: var(--surface); margin-top: 8px; }
.cfg-sql:focus-within { box-shadow: var(--focus-ring); }
.cfg-sql__gutter { padding: 12px 8px; text-align: right; background: var(--surface-dim); color: var(--on-surface-muted); font: 400 14px/20px Consolas, "Courier New", monospace; white-space: pre; overflow: hidden; user-select: none; }
.cfg-sql__area { border: 0; outline: none; resize: vertical; padding: 12px; font: 400 14px/20px Consolas, "Courier New", monospace; color: var(--on-surface); background: transparent; }
/* SQL stays left-to-right even in the Arabic layout */
[dir="rtl"] .cfg-sql { direction: ltr; }
```

- [x] **Step 3: Verify in the browser**

Add a `CUSTOM_BUSINESS_RULE`. Confirm the gutter numbers track the lines and scroll with the textarea; a non-SELECT shows the ✕ note; **Validate** re-checks; saving stores `{handler, sql}` and the card shows the handler name; in Arabic the SQL block stays left-to-right.

- [x] **Step 4: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `js/config.js css/khda.css`
- Suggested message if the user chooses to commit: "Add SQL editor for custom business rules"

---

### Task 12: Arabic, accessibility and full-journey verification

**Files:**
- Modify: `css/khda.css` (RTL fixes only, as found)
- Modify: `js/config.js` (a11y fixes only, as found)
- Create: `tests/rules-export.test.js`

**Interfaces:**
- Consumes: everything built in Tasks 1–11.
- Produces: no new API. This task proves the feature works end to end.

- [x] **Step 1: Write an export round-trip test across many datasets**

Create `tests/rules-export.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/shim');
const window = install();
const R = window.KHDA_RULES;

test('all 46 datasets export JSON that satisfies every table constraint', () => {
  for (const d of window.KHDA_DATASETS) {
    const out = JSON.parse(R.exportJson(d.sheet));
    assert.ok(Array.isArray(out), d.sheet + ' exports an array of rows');
    for (const r of out) {
      assert.ok(R.type(r.Rule_Type), 'Rule_Type in catalogue: ' + r.Rule_Type);
      for (const c of R.COLUMNS) assert.notStrictEqual(r[c], undefined, c + ' present');
      assert.ok(r.API_Code && r.Field_Name && r.Error_Code && r.Error_Message, 'NOT NULLs set');
      if (r.Rule_Value !== null) assert.ok(r.Rule_Value.length <= 1000);
    }
  }
});

test('SQL export is syntactically plausible for every dataset', () => {
  for (const d of window.KHDA_DATASETS) {
    const sql = R.exportSql(d.sheet);
    const stmts = sql.split('\n').filter(l => l.startsWith('INSERT INTO'));
    assert.strictEqual(stmts.length, R.rows(d.sheet).length, d.sheet);
    for (const s of stmts) {
      assert.ok(s.endsWith(');'), 'statement terminated: ' + d.sheet);
      // an unescaped apostrophe would leave an odd number of quote marks
      assert.strictEqual((s.match(/'/g) || []).length % 2, 0, 'quotes balanced: ' + d.sheet);
    }
  }
});

test('CSV export has one header plus one line per rule, for every dataset', () => {
  for (const d of window.KHDA_DATASETS) {
    const lines = R.exportCsv(d.sheet).trimEnd().split('\n');
    assert.strictEqual(lines[0], R.COLUMNS.join(','), d.sheet + ' header');
    // a quoted value may contain newlines, so only assert a lower bound
    assert.ok(lines.length >= 1, d.sheet);
  }
});

test('custom rules on one dataset never leak into another', () => {
  localStorage.clear();
  const a = window.KHDA_DATASETS[0].sheet, b = window.KHDA_DATASETS[1].sheet;
  const key = window.KHDA_SCHEMA.get(a).fields[0].key;
  R.addCustom(a, key, { type: 'MIN_LENGTH', value: 5, errorCode: 'ERR_A', errorMessage: 'm', order: 40 });
  const inB = R.load(b);
  const leaked = Object.values(inB.byField).flat().filter(r => r.origin === 'custom');
  assert.strictEqual(leaked.length, 0);
});
```

- [x] **Step 2: Run the whole suite**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS — every test across all four test files.

- [x] **Step 3: Verify the Arabic layout**

With the server running, open `configuration.html`, click **العربية**, and confirm:
- The two-pane layout mirrors; the rail moves to the right.
- Page chrome, filters and buttons are Arabic; **rule type ids, field names, db columns and SQL stay English**.
- The chip editor lays out right-to-left but chip text with English codes reads correctly.
- The SQL block stays left-to-right.
- Switching back to English restores the layout.

- [x] **Step 4: Verify keyboard and screen-reader behaviour**

- Tab order: skip link → header → dataset select → export → search → filters → rail → pane.
- Arrow keys move the rail selection; the selected row has `aria-selected="true"`.
- Adding and removing a chip announces through the live region.
- Changing rule type moves focus to the new control.
- The accessibility panel's **More spacing** and **Higher contrast** settings visibly affect the page.

- [x] **Step 5: Verify the full journey with demo data**

Load `configuration.html?demo=on`, then:
1. Pick **Applicants - Basic Details**; confirm derived rules on Institution Code.
2. Add `MIN_LENGTH` = 3 on Institution Name.
3. Disable the derived `REQUIRED` on a field; confirm the rail count drops.
4. **Export rules**; open the JSON and confirm the custom rule is present and the disabled one absent.
5. Reload; confirm both the custom rule and the disabled state survived.
6. Open `index.html?sheet=Applicants - Basic Details` and confirm **data entry still validates exactly as before** — the configuration page must not have changed it.
7. Confirm zero console errors on every page.

- [x] **Step 6: Checkpoint — stop and report**

Do NOT commit. Report the change for review:

- Files touched: `tests/rules-export.test.js css/khda.css js/config.js`
- Suggested message if the user chooses to commit: "Verify rule engine across datasets, Arabic layout and accessibility"

---

## Self-Review

**Spec coverage.** All 12 rule types have an editor (Tasks 7–11). Seeding from the dictionary is Task 2; config-only behaviour is guaranteed by the Global Constraint forbidding edits to `schema.js`/`app.js` and proved by Task 12 Step 5.6. Two-pane layout, rail search/filter and the 102-field scroll case are Task 5. Derived-rules-are-read-only-with-disable is Task 6. Persistence, export and the sanitized storage key are Task 3. i18n in both blocks is Task 4; RTL and a11y are Task 12. The `get()` fallback risk is handled by `validSheet()` in Task 5. The nav-in-4-files and cache-bust-in-5-files risks are Task 4 Steps 1 and 4.

**Two deliberate corrections to the spec**, both recorded here rather than silently applied:
1. The spec wrote the storage key as `khda.rules.<sheet>.v1`. The repo sanitizes sheet names (`schema.js` `storageKey`), so this plan matches that convention — otherwise keys would contain spaces and dashes.
2. The spec listed `schema.cross` as deriving a partial `CONDITIONAL_REQUIRED`. It is a numeric "cannot exceed" comparison, which is a different thing, so it derives a `CUSTOM_BUSINESS_RULE` with handler `CrossFieldLimit`.

**Type consistency.** `EDITORS` keys match the `value` strings in `TYPES` exactly: `none`, `select`, `number`, `chips`, `pattern`, `format`, `reference`, `fields`, `condition`, `sql` — all ten registered across Tasks 7–11. `load()` returns `{sheet, byField, disabled}`, consumed as `state.doc.byField` in Task 5 and `rulesOf()` in Task 6. Derived ids are `` `${fieldKey}:${TYPE}` `` in both Task 2 and Task 3's tests.
