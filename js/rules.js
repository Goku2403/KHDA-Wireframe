/* KHDA — rule engine model.
   The rule-type catalogue, the rules derived from the data dictionary, persistence and export.
   Authoring only: this never changes how js/app.js validates a record. */
(function () {
  'use strict';

  const TYPES = [
    { id: 'REQUIRED',             value: 'none',      derivable: true  },
    { id: 'DATA_TYPE',            value: 'select',    derivable: true,
      options: ['INTEGER', 'DECIMAL', 'DATE', 'TEXT', 'BOOLEAN'] },
    { id: 'MAX_LENGTH',           value: 'number',    derivable: true,  min: 1 },
    { id: 'MIN_LENGTH',           value: 'number',    derivable: false, min: 1 },
    // the dictionary states floors as "greater than or equal to 0" / "non-negative"
    { id: 'MIN_VALUE',            value: 'number',    derivable: true,  min: null },
    { id: 'ALLOWED_VALUE',        value: 'chips',     derivable: true  },
    { id: 'EMAIL_FORMAT',         value: 'none',      derivable: true  },
    { id: 'PHONE_FORMAT',         value: 'pattern',   derivable: false },
    { id: 'DATE_FORMAT',          value: 'format',    derivable: true  },
    { id: 'REFERENCE_EXISTS',     value: 'reference', derivable: true  },
    { id: 'REFERENCE_MATCH',      value: 'fields',    derivable: true  },
    // the dictionary declares a composite primary key on 26 of the 46 sheets; schema.js already
    // enforces it at entry, so it belongs in the exported rule set too
    { id: 'UNIQUE_KEY',           value: 'fields',    derivable: true  },
    // repeatable: a field can carry several conditions, or several business rules
    { id: 'CONDITIONAL_REQUIRED', value: 'condition', derivable: false, repeatable: true },
    { id: 'CUSTOM_BUSINESS_RULE', value: 'sql',       derivable: true,  repeatable: true },
  ];

  const type = id => TYPES.find(t => t.id === id);

  const MAX_RULE_VALUE = 1000;   // Rule_Value nvarchar(1000)
  const MAX_ERROR_CODE = 100;    // Error_Code nvarchar(100)
  const MAX_ERROR_MSG = 500;     // Error_Message nvarchar(500)

  const upper = s => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  // KHDA's canonical API codes, from plan/_context/mockup-guide.md. Some agree with
  // derivation and are listed for completeness (so they aren't flagged unverified); others
  // provably disagree with derivation (Course Faculty -> COURSE_FACULTY_B, Institute - R&D
  // -> INSTITUTE_RD), which is exactly why this map exists instead of deriving everything.
  const CODE_MAP = {
    'Applicants - Basic Details': 'APPLICANTS_BASIC_DETAILS',
    'Graduates': 'GRADUATES',
    'Employee - Basic Details': 'EMPLOYEE_BASIC_DETAILS',
    'Students - Enrollments': 'STUDENTS_ENROLLMENTS',
    'Students - Internship': 'STUDENTS_INTERNSHIP',
    'Students - Scholarship': 'STUDENTS_SCHOLARSHIP',
    'Courses': 'COURSES',
    'Course Faculty': 'COURSE_FACULTY_B',
    'Students - Research': 'STUDENTS_RESEARCH',
    'Institute - Partnerships': 'INSTITUTE_PARTNERSHIPS',
    'Institute - Employers': 'INSTITUTE_EMPLOYERS',
    'Institute - Academic Programs': 'INSTITUTE_ACADEMIC_PROGRAMS',
    'Institute - R&D': 'INSTITUTE_RD',
    'Institute - Financials': 'INSTITUTE_FINANCIALS',
    'Institute - Research Projects': 'INSTITUTE_RESEARCH_PROJECTS',
    'Institute - Events': 'INSTITUTE_EVENTS',
    'Institute - Overview': 'INSTITUTE_OVERVIEW',
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

  // REFERENCE_MATCH and CONDITIONAL_REQUIRED carry field keys ('f0'), which are internal ids
  // meaningless to the target database. Given a schema they resolve to database column names;
  // without one the key is returned unchanged, so the function stays usable on its own.
  function serialize(type, value, schema) {
    if (value == null || value === '') return null;
    const col = k => {
      const f = schema && schema.field ? schema.field(k) : null;
      return f ? f.db : k;
    };
    if (Array.isArray(value)) {
      const keyed = type === 'REFERENCE_MATCH' || type === 'UNIQUE_KEY';
      return (keyed ? value.map(col) : value).join(',');
    }
    if (typeof value === 'object') {
      if (type === 'REFERENCE_EXISTS') return value.table + '.' + value.column;
      if (type === 'CONDITIONAL_REQUIRED') {
        const v = value.value;
        const shown = v == null ? '' : (Array.isArray(v) ? '(' + v.join(',') + ')' : v);
        // a word operator needs air around it; a symbol reads fine without
        const op = /^[a-z]/i.test(value.op) ? ' ' + value.op + ' ' : value.op;
        return (col(value.field) + op + shown).trim();
      }
      if (type === 'CUSTOM_BUSINESS_RULE') return value.sql;
      return JSON.stringify(value);
    }
    return String(value);
  }

  // Execution_Order: presence first, then shape, then cross-record checks. Rules run cheapest-first,
  // so a null value never reaches a reference lookup.
  // A placeholder ("use 999999999999999 if not available") is not a rule: no record can fail
  // it. It stays on the field, shown in the UI and the review, and never reaches Rule_Value.
  const ORDER = {
    REQUIRED: 10, CONDITIONAL_REQUIRED: 20, DATA_TYPE: 30, MIN_VALUE: 35, MIN_LENGTH: 40, MAX_LENGTH: 50,
    EMAIL_FORMAT: 60, PHONE_FORMAT: 60, DATE_FORMAT: 60, ALLOWED_VALUE: 70,
    REFERENCE_EXISTS: 80, REFERENCE_MATCH: 90, UNIQUE_KEY: 95, CUSTOM_BUSINESS_RULE: 100,
  };

  const MESSAGE = {
    REQUIRED: f => f.label + ' is required.',
    DATA_TYPE: (f, v) => f.label + ' must be ' + (v === 'INTEGER' ? 'a whole number' : v === 'DECIMAL' ? 'a number' : 'a valid ' + String(v).toLowerCase()) + '.',
    MAX_LENGTH: (f, v) => f.label + ' cannot exceed ' + v + ' characters.',
    MIN_LENGTH: (f, v) => f.label + ' must contain at least ' + v + ' characters.',
    MIN_VALUE: (f, v) => f.label + ' must be ' + v + ' or more.',
    ALLOWED_VALUE: f => f.label + ' must be one of the allowed values.',
    EMAIL_FORMAT: f => f.label + ' must be a valid email address.',
    PHONE_FORMAT: f => f.label + ' must be a valid phone number.',
    DATE_FORMAT: (f, v) => f.label + ' must use the date format ' + v + '.',
    REFERENCE_EXISTS: (f, v) => f.label + ' must exist in ' + v.table + '.',
    REFERENCE_MATCH: f => f.label + ' must match the referenced master record.',
    UNIQUE_KEY: () => 'A record with this key combination already exists.',
    CONDITIONAL_REQUIRED: f => f.label + ' is required when the stated condition is met.',
    CUSTOM_BUSINESS_RULE: (f, v) =>
      (v && v.handler === 'NotFutureDate') ? f.label + ' cannot be in the future.'
        : f.label + ' failed a business rule.',
  };

  const clip = (s, n) => (s.length <= n ? s : s.slice(0, n));

  // Error_Code must stay unique per field within nvarchar(100). Clipping the fully-assembled
  // string from the end can chop off the '_' + type suffix entirely when the prefix (code +
  // label) is already near the limit, collapsing every rule type on that field onto one code.
  // So the label — the only segment with unbounded length — is clipped to whatever room is
  // left after the fixed 'ERR_' + code + '_' prefix and the '_' + type suffix are reserved,
  // which keeps the type (and therefore uniqueness) intact.
  function makeRule(code, f, type, value, origin, msg) {
    const msgFn = MESSAGE[type];
    const prefix = 'ERR_' + code + '_';
    const suffix = '_' + type;
    const budget = MAX_ERROR_CODE - prefix.length - suffix.length;
    const label = clip(upper(f.label), Math.max(0, budget));
    return {
      id: (origin === 'derived' ? f.key + ':' + type : null),
      type, value,
      errorCode: clip(prefix + label + suffix, MAX_ERROR_CODE),
      errorMessage: clip(msg || (msgFn ? msgFn(f, value) : f.label + ' failed validation.'), MAX_ERROR_MSG),
      order: ORDER[type] || 100,
      origin, enabled: true,
    };
  }

  // Resolves "... must be provided in the enrollment dataset" to a real table and column.
  // Returns null when either cannot be found, so a half-resolved rule is never exported.
  function crossDataset(requires, from) {
    const S = window.KHDA_SCHEMA;
    const sets = (window.KHDA_DATASETS || []).filter(d => d.sheet !== from.sheet);
    const want = String(requires.sheet || '').toLowerCase();
    const hit = sets.find(d => d.title.toLowerCase().includes(want))
      || sets.find(d => String(d.sheet).toLowerCase().includes(want));
    if (!hit) return null;

    const sc = S.get(hit.sheet);
    const column = sc.fields.find(f => new RegExp(requires.field, 'i').test(f.label));
    // the two datasets are joined on the field the condition is about — the Emirates ID
    const join = sc.fields.find(f => /emirates\s*id/i.test(f.label));
    if (!column || !join) return null;
    return {
      api: apiCode(hit.sheet).code, title: hit.title,
      column: column.db, label: column.label, joinColumn: join.db,
    };
  }

  function derive(schema) {
    const code = apiCode(schema.sheet).code;
    const out = {};
    const mk = (f, type, value, msg) => makeRule(code, f, type, value, 'derived', msg);

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

      // the dictionary states a floor as "greater than or equal to 0" / "non-negative"
      if (f.min != null) rules.push(mk(f, 'MIN_VALUE', f.min));

      // schema.js refuses a future "Last Updated"; the same check, expressed for the platform
      if (f.control === 'date' && /updated/i.test(f.label)) {
        rules.push(mk(f, 'CUSTOM_BUSINESS_RULE', {
          handler: 'NotFutureDate',
          sql: 'SELECT CASE WHEN ' + f.db + ' <= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END',
        }));
      }

      if (f.email) rules.push(mk(f, 'EMAIL_FORMAT', null));
      out[f.key] = rules;
    }

    // A field whose value is looked up from another ("Institution Name should match with the
    // Institution code as per list") is a cross-field match, which is exactly REFERENCE_MATCH.
    for (const f of schema.fields) {
      if (!f.derivedFrom || !out[f.key]) continue;
      out[f.key].push(mk(f, 'REFERENCE_MATCH', [f.key, f.derivedFrom]));
    }

    // The dictionary's composite primary key. schema.js already refuses a duplicate on entry;
    // this carries the same constraint into the exported rule set. It hangs off the last key
    // member, which is where schema.js reports the clash, and names every member in its value.
    if (schema.pk && schema.pk.length) {
      const last = schema.field(schema.pk[schema.pk.length - 1]);
      if (last && out[last.key]) out[last.key].push(mk(last, 'UNIQUE_KEY', schema.pk.slice()));
    } else if (schema.fields.length) {
      // No key is declared, so the most that can be said is that the same row twice is wrong —
      // the wording schema.js uses. Skipped when the column list would overrun Rule_Value.
      const all = schema.fields.map(f => f.key);
      const first = schema.fields[0];
      if (serialize('UNIQUE_KEY', all, schema).length <= MAX_RULE_VALUE) {
        out[first.key].push(mk(first, 'UNIQUE_KEY', all,
          'An identical record has already been entered.'));
      }
    }

    // The dictionary's conditional mandatories, parsed by schema.js from the Key Constraints
    // column. A condition inside this dataset is a CONDITIONAL_REQUIRED; one that points at a
    // different dataset cannot be, so it becomes SQL that joins to the other table.
    for (const c of (schema.conditional || [])) {
      const target = schema.field(c.key);
      if (!target || !out[c.key]) continue;

      if (!c.requires) {
        out[c.key].push(mk(target, 'CONDITIONAL_REQUIRED', {
          field: c.field, op: c.op, value: c.value,
        }));
        continue;
      }

      // "the reason for missing ID must be provided in the enrollment dataset"
      const other = crossDataset(c.requires, schema);
      if (!other) continue;
      const self = schema.field(c.field) || target;
      out[c.key].push(mk(target, 'CUSTOM_BUSINESS_RULE', {
        handler: 'CrossDatasetRequired',
        sql: 'SELECT CASE WHEN ' + self.db + " <> '" + c.value + "'" +
          ' OR EXISTS (SELECT 1 FROM ' + other.api + ' x WHERE x.' + other.joinColumn +
          ' = ' + self.db + " AND NULLIF(LTRIM(RTRIM(x." + other.column + ")), '') IS NOT NULL)" +
          ' THEN 1 ELSE 0 END',
      }, target.label + ' is a placeholder, so ' + other.label + ' must be provided in ' + other.title + '.'));
    }

    for (const c of schema.cross) {
      const a = schema.field(c.key), b = schema.field(c.other);
      if (!a || !b || !out[c.key]) continue;
      out[c.key].push(mk(a, 'CUSTOM_BUSINESS_RULE', {
        handler: 'CrossFieldLimit',
        sql: 'SELECT CASE WHEN ' + a.db + ' <= ' + b.db + ' THEN 1 ELSE 0 END',
      }));
    }

    // A field can legitimately carry two rules of one type — the dictionary states two
    // conditions on some Enrollments fields. Both the rule id and Error_Code are keyed on
    // field + type, so the second of a pair is numbered to keep each of them unique.
    for (const list of Object.values(out)) {
      const seen = new Map();
      for (const r of list) {
        const n = (seen.get(r.type) || 0) + 1;
        seen.set(r.type, n);
        if (n === 1) continue;
        r.id = r.id ? r.id + ':' + n : null;
        const tail = '_' + n;
        r.errorCode = clip(r.errorCode, MAX_ERROR_CODE - tail.length) + tail;
      }
    }
    return out;
  }

  const storageKey = sheet => 'khda.rules.' + String(sheet).replace(/[^A-Za-z0-9]+/g, '_') + '.v1';

  function readRaw(sheet) {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey(sheet)) || 'null');
      if (!raw || typeof raw !== 'object') throw new Error('empty');
      const custom = raw.custom === undefined ? {} : raw.custom;
      const disabled = raw.disabled === undefined ? [] : raw.disabled;
      // Valid-but-wrong-shaped JSON (e.g. {"custom":"x"} or {"custom":5}) must not reach
      // addCustom/load, which assume custom is a plain object and disabled is an array.
      const customOk = custom !== null && typeof custom === 'object' && !Array.isArray(custom);
      const disabledOk = Array.isArray(disabled);
      if (!customOk || !disabledOk) throw new Error('bad shape');
      const otherwise = raw.otherwise && typeof raw.otherwise === 'object' && !Array.isArray(raw.otherwise)
        ? raw.otherwise : {};
      return { v: 1, custom, disabled, otherwise, apiCode: raw.apiCode || null };
    } catch (e) {
      return { v: 1, custom: {}, disabled: [], otherwise: {}, apiCode: null };   // corrupt payload must not break the page
    }
  }
  const writeRaw = (sheet, raw) => localStorage.setItem(storageKey(sheet), JSON.stringify(raw));

  // A stored custom rule missing errorCode/errorMessage/order (created before validation
  // existed, or hand-edited in localStorage, bypassing addCustom entirely) must not reach
  // rows()/exportSql() with NOT NULL columns unset or a non-numeric Execution_Order.
  function fillRuleDefaults(code, f, r) {
    const needFallback = !r.errorCode || !r.errorMessage;
    const fb = needFallback ? makeRule(code, f, r.type, r.value, 'custom') : null;
    const n = Number(r.order);
    return Object.assign({}, r, {
      errorCode: r.errorCode || fb.errorCode,
      errorMessage: r.errorMessage || fb.errorMessage,
      order: Number.isFinite(n) ? n : 100,
    });
  }

  function load(sheet) {
    const schema = window.KHDA_SCHEMA.get(sheet);
    const raw = readRaw(sheet);
    const resolved = apiCode(sheet);
    const disabled = new Set(raw.disabled);
    const byField = derive(schema);
    for (const f of schema.fields) {
      const mine = (raw.custom[f.key] || [])
        .map(r => fillRuleDefaults(resolved.code, f, r))
        .map(r => Object.assign({}, r, { origin: 'custom' }));
      byField[f.key] = byField[f.key].concat(mine);
      for (const r of byField[f.key]) r.enabled = !disabled.has(r.id);
    }
    // What happens when the condition is not met: the dictionary's own answer unless an
    // author has overridden it. 'blank' means the field may be left empty; 'value' means the
    // stated placeholder goes in instead. Neither is a rule — nothing can fail either one.
    const otherwise = {};
    for (const f of schema.fields) {
      const set = raw.otherwise[f.key];
      if (set && (set.mode === 'blank' || set.mode === 'value')) otherwise[f.key] = set;
      else if (f.placeholder) otherwise[f.key] = { mode: 'value', value: f.placeholder };
      else if (f.nullableByDictionary) otherwise[f.key] = { mode: 'blank', value: '' };
    }

    return {
      sheet, byField, disabled, otherwise,
      apiCode: raw.apiCode || resolved.code,
      apiName: schema.sheet,
      verified: raw.apiCode ? true : resolved.verified,
    };
  }

  // An author can change what happens otherwise: allow a blank, or name the value to use.
  function setOtherwise(sheet, fieldKey, choice) {
    const raw = readRaw(sheet);
    if (!choice) delete raw.otherwise[fieldKey];
    else raw.otherwise[fieldKey] = { mode: choice.mode, value: choice.mode === 'value' ? String(choice.value || '') : '' };
    writeRaw(sheet, raw);
    return true;
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
    const schema = window.KHDA_SCHEMA.get(sheet);
    const f = schema.field(fieldKey);
    const code = apiCode(sheet).code;
    const base = Object.assign({}, rule, {
      id: 'c' + (used.length ? Math.max.apply(null, used) + 1 : 1),
      origin: 'custom', enabled: true,
    });
    const made = fillRuleDefaults(code, f, base);
    (raw.custom[fieldKey] = raw.custom[fieldKey] || []).push(made);
    writeRaw(sheet, raw);
    return made;
  }

  // Edit a custom rule in place. The id and its position in the field's list are preserved, so
  // an edit does not silently reorder the rule list or orphan a disabled flag keyed on the id.
  function updateCustom(sheet, ruleId, patch) {
    const raw = readRaw(sheet);
    const schema = window.KHDA_SCHEMA.get(sheet);
    const code = apiCode(sheet).code;
    for (const k of Object.keys(raw.custom)) {
      const i = raw.custom[k].findIndex(r => r.id === ruleId);
      if (i < 0) continue;
      const base = Object.assign({}, raw.custom[k][i], patch, { id: ruleId, origin: 'custom' });
      raw.custom[k][i] = fillRuleDefaults(code, schema.field(k), base);
      writeRaw(sheet, raw);
      return raw.custom[k][i];
    }
    return null;
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
          Rule_Value: serialize(r.type, r.value, schema),
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

  // RuleID is a bigint identity column shared by every API in the target table, so it is
  // never sent on INSERT (the database assigns it) — only the other nine columns are.
  const SQL_COLUMNS = COLUMNS.filter(c => c !== 'RuleID');

  function exportSql(sheet) {
    const q = v => (v == null ? 'NULL' : "N'" + String(v).replace(/'/g, "''") + "'");
    // Execution_Order/Is_Active are spliced in unquoted (they're int/bit columns), so a
    // non-numeric value reaching this point must be coerced, not concatenated verbatim.
    const qi = (v, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : fallback;
    };
    const lines = rows(sheet).map(r =>
      'INSERT INTO API_Validation_Rules (' + SQL_COLUMNS.join(', ') + ') VALUES (' +
      [q(r.API_Code), q(r.Field_Name), q(r.Rule_Type), q(r.Rule_Value), q(r.Error_Code),
       q(r.Error_Message), qi(r.Execution_Order, 100), qi(r.Is_Active, 1), q(r.API_Name)].join(', ') + ');');
    return '-- ' + sheet + '\n-- generated ' + new Date().toISOString() + '\n' + lines.join('\n') + '\n';
  }

  function exportCsv(sheet) {
    const cell = v => {
      if (v == null) return '';
      const s = String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [COLUMNS.join(',')]
      .concat(rows(sheet).map(r => COLUMNS.map(c => cell(r[c])).join(',')))
      .join('\n') + '\n';
  }

  window.KHDA_RULES = { TYPES, type, derive, serialize, apiCode, storageKey, load, setApiCode,
    addCustom, updateCustom, removeCustom, setEnabled, setOtherwise, rows, exportJson, exportSql, exportCsv,
    COLUMNS, ORDER, MAX_RULE_VALUE, MAX_ERROR_CODE, MAX_ERROR_MSG };
})();
