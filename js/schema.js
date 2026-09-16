/* KHDA — dataset schema engine.
   Turns the HEDB Data Dictionary metadata for any dataset into field descriptors, validation rules,
   grid columns and a sample row, so one form/grid/report works for all 40 datasets. */
(function () {
  'use strict';

  const LISTS = window.KHDA_LISTS || {};
  const SETS = window.KHDA_DATASETS || [];
  const GRID_COLS = 8;               // columns shown in the record grids; export always carries every field

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // The dictionary marks "Last Updated" as not accepting nulls in 29 of the 30 sheets that
  // carry it, which would make it mandatory. It is a system stamp rather than something the
  // institution types, so the portal does not demand it. Deliberate override, not a parse bug.
  const OPTIONAL_DESPITE_DICTIONARY = /^\s*last\s*updated\s*$/i;

  function buildField(f, i) {
    const raw = String(f.t || '');
    const T = raw.toUpperCase();
    const v = String(f.v || '');
    const k = String(f.k || '');
    const len = (T.match(/\((\d+)\)/) || [])[1];
    const isText = /TEXT|VARCHAR|STRING|CHAR/.test(T);
    const isNum = /NUMBER|NUMERIC|\bINT\b|DECIMAL|FLOAT/.test(T);
    const isDate = /DATE/.test(T) || /date\s*format/i.test(v);
    // a decimal sample (3.5) means the field is not whole-number only
    const decimals = /decimal/i.test(v) || /^-?\d+\.\d+$/.test(String(f.s || '').trim());

    let control = 'text', opts = null;
    if (f.list && LISTS[f.list]) {
      control = 'select';
      opts = LISTS[f.list].map(([code, label]) => ({ v: code, l: label ? `${code} — ${label}` : code }));
    } else if (f.opts && f.opts.length) {
      control = 'select';
      opts = f.opts.map(o => ({ v: o, l: o }));
    } else if (/^\s*Y\s*,\s*N\s*$/i.test(v) || /LOV\(\s*Y/i.test(v)) {
      control = 'select';
      opts = [{ v: 'Y', l: 'Y — Yes' }, { v: 'N', l: 'N — No' }];
    } else if (isDate) control = 'date';
    else if (isNum) control = 'number';

    return {
      key: 'f' + i, idx: i, label: f.n, db: f.db || 'F' + i, type: raw, values: v, keyText: k,
      desc: f.d || '', sample: f.s || '', listName: f.list || null,
      control, opts, required: f.r === 'Yes' && !OPTIONAL_DESPITE_DICTIONARY.test(f.n || ''),
      // the dictionary sometimes declares a size shorter than its own example (TEXT(10) vs "1-1234-5678"),
      // so the example wins when the two disagree
      maxLen: isText && len ? Math.max(Number(len), String(f.s || '').trim().length) : null,
      integer: isNum && !decimals,
      min: /greater than or equal to\s*['"]?0/i.test(v) || /\bnon[- ]negative\b/i.test(v) ? 0 : null,
      email: /email format/i.test(v),
    };
  }

  function buildSchema(ds) {
    const fields = ds.fields.map(buildField);
    // A couple of sheets repeat a database column name (two "Contact_Email" columns, for
    // instance). Left alone, the template writes two identical headers and an upload feeds
    // both fields from the first column, so the second field silently takes the wrong value.
    const seenDb = new Map();
    for (const f of fields) {
      const n = (seenDb.get(f.db) || 0) + 1;
      seenDb.set(f.db, n);
      if (n > 1) f.db = f.db + '_' + n;
    }
    const byName = new Map(fields.map(f => [norm(f.label), f]));
    const findField = name => {
      const n = norm(name);
      if (byName.has(n)) return byName.get(n);
      return fields.find(f => norm(f.label) === n) ||
             fields.find(f => norm(f.label).includes(n) && n.length > 3) ||
             fields.find(f => n.includes(norm(f.label)) && norm(f.label).length > 3) || null;
    };

    // Primary key. The dictionary writes it three ways:
    //   "Primary key (Institution Code, Academic Period, Degree)"
    //   "Primary Key: Institution Code, Course Code, Program Code"
    //   "Primary Key: Institution Code\n Institution Name\n Program Code"
    let pk = [];
    for (const f of fields) {
      const m = f.keyText.match(/primary key\s*(?:\(([^)]*)\)|:([^.]*))/i);
      if (!m) continue;
      const body = m[1] != null ? m[1] : m[2];
      const names = body.split(/[&,;\r\n]+/).map(x => x.trim()).filter(x => x && x.length <= 60);
      pk = [...new Set(names.map(x => findField(x)).filter(Boolean).map(x => x.key))];
      if (pk.length) break;
    }

    // Cross-field limits, e.g. "Number of admissions offered cannot exceed number of applicants"
    const cross = [];
    for (const f of fields) {
      const m = f.keyText.match(/cannot exceed\s+(?:the\s+)?([^.]+)/i);
      if (!m) continue;
      const other = findField(m[1]);
      if (other && other.key !== f.key && other.control === 'number') {
        cross.push({ key: f.key, other: other.key, message: `Cannot exceed ${other.label}.` });
      }
    }

    // Derived values, e.g. "Institution Name should match with the Institution code as per list"
    for (const f of fields) {
      const m = f.keyText.match(/should match with\s+(?:the\s+)?([^.]*?)\s+as per\s+(?:the\s+)?list/i);
      if (!m) continue;
      const src = findField(m[1]);
      if (src && src.opts && src.key !== f.key) {
        // the value is looked up from another field, so it is shown read-only rather than as its own dropdown
        f.derivedFrom = src.key;
        f.readonly = true;
        f.control = 'text';
        f.opts = null;
        f.listName = null;
      }
    }

    // Grid columns: primary key first, then field order
    // The dictionary's "Key Constraints" column states placeholders and conditional mandatories
    // in prose. Only high-confidence shapes are read; anything else is left alone rather than
    // guessed at, because a wrong rule here would be exported as real validation.

    // "If not available use X" is only one of the ways the sheet states a placeholder; it also
    // writes "use xyz@xyz.com if email not available", "For undeclared programs, use 99" and
    // "Use 0 for non credit programs". Only value-shaped tokens are accepted, so wording like
    // "Use the CAA licensed list" is never mistaken for a placeholder.
    // A value-shaped token only: a quoted literal, an email, or a number (optionally signed,
    // decimal or hyphenated like a phone placeholder). Bare words are deliberately excluded —
    // with the /i flag a class such as [A-Z]{2,4} also matches prose like "xyz" or "TR".
    const VALUE_TOKEN = "(?:[\"'][^\"']+[\"']|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+.[A-Za-z]{2,}|[+]?[0-9][0-9.-]*)";
    const SENTINELS = [
      new RegExp('(?:if\\s+)?not\\s+available[,;\\s]*(?:then\\s+)?use\\s*(' + VALUE_TOKEN + ')', 'i'),
      new RegExp('\\buse\\s+(' + VALUE_TOKEN + ')\\s+(?:if|for|when)\\b', 'i'),
      new RegExp('\\buse\\s+(' + VALUE_TOKEN + ')\\s*(?:[.;]|$)', 'i'),
    ];
    const NO_RULE = /leave (?:it )?blank/i;
    for (const f of fields) {
      const text = String(f.keyText || '').replace(/\s+/g, ' ');
      if (!text) continue;
      // "If not available, then leave it blank" states the absence of a constraint
      if (NO_RULE.test(text) && !/\buse\b/i.test(text)) { f.nullableByDictionary = true; continue; }
      // A field with its own option list has no placeholder: wording such as "use 'Y' otherwise
      // 'N'" describes the allowed values, which ALLOWED_VALUE already carries.
      if (f.opts && f.opts.length) continue;
      // The same wording appears on fields the dictionary never turned into a list, because it
      // writes "Y or N" where the option parser expects "Y, N". Two uses joined by else/otherwise
      // state a choice between values, and a short enum in the values column says the same.
      if (/\buse\b[^.]{0,40}\b(?:else|otherwise)\b[^.]{0,20}\buse\b/i.test(text)) continue;
      if (/^\s*[A-Za-z0-9]{1,3}(\s*(?:,|or|\/)\s*[A-Za-z0-9]{1,3})+\s*$/i.test(String(f.values || ''))) continue;
      for (const re of SENTINELS) {
        const m = re.exec(text);
        if (!m) continue;
        // a sentence-ending full stop is punctuation, not part of the placeholder
        const raw = m[1].trim().replace(/^["']|["']$/g, '').replace(/[.,;]+$/, '');
        if (!raw || /^(the|a|an|this|that|it)$/i.test(raw)) continue;
        f.placeholder = raw.replace(/\s+/g, '');
        break;
      }
    }

    // "greater than or equal to 0", "Less than 0 not allowed", "should be greater than 0"
    for (const f of fields) {
      if (f.min != null || f.control !== 'number') continue;
      const text = String(f.keyText || '') + ' ' + String(f.values || '');
      let m = /greater than or equal to\s*["']?(-?\d+(?:\.\d+)?)/i.exec(text)
        || /less than\s*["']?(-?\d+(?:\.\d+)?)["']?\s*(?:is\s+)?not\s+allowed/i.exec(text)
        || /(?:no|not)\s+(?:less than|below)\s*["']?(-?\d+(?:\.\d+)?)/i.exec(text);
      if (m) { f.min = Number(m[1]); continue; }
      // "greater than 0" is exclusive, so on a whole-number field the floor is the next integer
      m = /(?:should be |must be )?greater than\s*["']?(-?\d+(?:\.\d+)?)["']?(?!\s*or equal)/i.exec(text);
      if (m && f.integer) f.min = Number(m[1]) + 1;
    }


    // Each entry: the field that cannot be blank, and the condition that makes it mandatory.
    // `requires` is set only when the field to fill lives in a different dataset.
    const conditional = [];
    const condRules = [
      // the sheet writes the same idea as "cannot be blank", "cannot be NULL" and "cannot be empty"
      // "If Nationality is United Arab Emirates then this field cannot be NULL"
      // "If Employment status= Y then this field cannot be blank"
      { re: /if\s+(?:the\s+)?["']?([a-z0-9 /&'-]+?)["']?\s*(?:indicator\s*)?(?:is|=)\s*["']?([a-z0-9 ]+?)["']?\s*,?\s*then\s+.{0,40}?can\s?not\s+be\s+(?:blank|null|empty)/i, op: '=' },
      // "Cannot be blank if teaching workload is NOT 0"
      { re: /can\s?not\s+be\s+(?:blank|null|empty)\s+if\s+(?:the\s+)?["']?([a-z0-9 /&'-]+?)["']?\s+is\s+not\s+["']?([a-z0-9 ]+?)["']?\s*(?:[.;]|$)/i, op: '≠' },
      // "If there is a value present for EXCH_IN_OUT, then ... cannot be blank"
      { re: /if\s+there\s+is\s+a\s+value\s+present\s+for\s+([a-z0-9_ /&'-]+?)\s*,?\s*then\s+.{0,60}?can\s?not\s+be\s+(?:blank|null|empty)/i, op: 'is not empty' },
      // "If Emirates ID is not available(or is 999999999999999), then this field cannot be blank"
      { re: /if\s+([a-z0-9 /&'-]+?)\s+is\s+not\s+available\s*\(?\s*or\s+is\s+([0-9\s]+)\)?\s*,?\s*then\s+.{0,40}?can\s?not\s+be\s+(?:blank|null|empty)/i, op: '=' },
      // "For Student Degree( FD,CR,DP ...) CANNOT be blank"
      { re: /for\s+(?:the\s+)?([a-z0-9 /&'-]+?)\s*\(\s*([a-z0-9,\s]+?)\s*\)\s*,?\s*.{0,60}?can\s?not\s+be\s+(?:blank|null|empty)/i, op: 'in' },
    ];

    for (const f of fields) {
      const text = String(f.keyText || '').replace(/\s+/g, ' ');
      if (!/cans?not be (?:blank|null|empty)|must be provided|has to be provided/i.test(text)) continue;

      // "(If above row is Y then a value must be provided here)" — the row before this one
      const above = /if\s+above\s+row\s+is\s+["']?([a-z0-9]+)["']?/i.exec(text);
      if (above && f.idx > 0) {
        conditional.push({ key: f.key, field: fields[f.idx - 1].key, op: '=', value: above[1].toUpperCase() });
        continue;
      }

      // "... the reason for missing ID MUST be provided in the enrollment dataset" — the field
      // that must be filled lives in another dataset, so the target is recorded for resolution.
      const other = /reason\s+for\s+missing\s+(?:e)?id\s+must\s+be\s+provided\s+in\s+the\s+([a-z ]+?)\s*(?:sheet|dataset)/i.exec(text);
      if (other) {
        conditional.push({
          key: f.key, field: f.key, op: '=',
          value: f.placeholder || '999999999999999',
          requires: { sheet: other[1].trim(), field: 'missing' },
        });
        continue;
      }

      // One cell can state several clauses — "If not available use '999' If Nationality is
      // United Arab Emirates then cannot be NULL" is a placeholder AND a condition. Every
      // shape that matches is kept, deduplicated, rather than stopping at the first.
      const seen = new Set();
      for (const r of condRules) {
        const m = r.re.exec(text);
        if (!m) continue;
        const src = findField(m[1]);
        if (!src || src.key === f.key) continue;
        let value = r.op === 'in'
          ? m[2].split(',').map(x => x.trim()).filter(Boolean)
          : String(m[2] || '').replace(/\s+/g, ' ').trim();
        // the sheet writes the Emirates ID sentinel as "999999999 999999"; a number carries no
        // spaces, so they are stripped rather than exported into the rule
        if (typeof value === 'string' && /^[\d\s]+$/.test(value)) value = value.replace(/\s+/g, '');
        // The dictionary names the value ("If Nationality is United Arab Emirates") but a coded
        // field stores the code ("AE"). Comparing against the name would match no record, so the
        // name is resolved to its code whenever the source field carries a list.
        const toCode = v => {
          if (!src.opts || !src.opts.length) return v;
          const want = norm(v);
          if (src.opts.some(o => norm(o.v) === want)) return v;
          const hit = src.opts.find(o => norm(o.l) === want)
            || src.opts.find(o => norm(o.l).endsWith(' ' + want) || norm(o.l) === norm(o.v + ' ' + v));
          return hit ? hit.v : v;
        };
        value = Array.isArray(value) ? value.map(toCode) : toCode(value);
        // "If the High School System is present" and "... is NOT NULL" describe presence, not a
        // value to compare against, so they become the operator that actually says that.
        let op = r.op;
        if (typeof value === 'string' && /^(?:present|not null|not blank|filled|available)$/i.test(value)) {
          op = 'is not empty';
          value = '';
        }
        if (op !== 'is not empty' && !(Array.isArray(value) ? value.length : value)) continue;
        const entry = { key: f.key, field: src.key, op, value: op === 'is not empty' ? '' : value };
        const id = entry.field + '|' + entry.op + '|' + entry.value;
        if (seen.has(id)) continue;
        seen.add(id);
        conditional.push(entry);
      }
    }

    const order = [...pk, ...fields.map(f => f.key).filter(k => !pk.includes(k))];
    const gridCols = order.slice(0, GRID_COLS);

    return {
      sheet: ds.sheet, title: ds.title, desc: ds.desc, group: ds.group,
      fields, pk, cross, conditional, gridCols,
      field: key => fields.find(f => f.key === key),
      storageKey: 'khda.hedb.' + ds.sheet.replace(/[^A-Za-z0-9]+/g, '_') + '.v1',
    };
  }

  const cache = new Map();
  function get(sheet) {
    const ds = SETS.find(d => d.sheet === sheet) || SETS[0];
    if (!ds) return null;
    if (!cache.has(ds.sheet)) cache.set(ds.sheet, buildSchema(ds));
    return cache.get(ds.sheet);
  }

  // ---------- validation ----------
  const isIntLike = v => /^-?\d+$/.test(String(v).trim());
  const isNumLike = v => /^-?\d+(\.\d+)?$/.test(String(v).trim());

  function validate(rec, all, schema) {
    const err = {};
    for (const f of schema.fields) {
      const raw = rec[f.key];
      const val = raw == null ? '' : String(raw).trim();
      if (!val) {
        if (f.required) err[f.key] = `${f.label} is required.`;
        continue;
      }
      if (f.control === 'select' && f.opts && !f.opts.some(o => String(o.v) === val)) {
        err[f.key] = 'Value is not in the accepted list.';
      } else if (f.control === 'number') {
        if (!isNumLike(val)) err[f.key] = 'Enter a number.';
        else if (f.integer && !isIntLike(val)) err[f.key] = 'Enter a whole number.';
        else if (f.min != null && Number(val) < f.min) err[f.key] = `Must be ${f.min} or more.`;
      } else if (f.control === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) err[f.key] = 'Use the date format YYYY-MM-DD.';
        else if (/updated/i.test(f.label) && val > new Date().toISOString().slice(0, 10)) err[f.key] = 'Date cannot be in the future.';
      } else {
        // codes taken from an official list are authoritative even when longer than the declared size
        if (f.maxLen && !f.opts && val.length > f.maxLen) err[f.key] = `Use ${f.maxLen} characters or fewer.`;
        if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) err[f.key] = 'Enter a valid email address.';
      }
    }
    for (const c of schema.cross) {
      if (err[c.key]) continue;
      const a = rec[c.key], b = rec[c.other];
      if (a === '' || a == null || b === '' || b == null) continue;
      if (isNumLike(a) && isNumLike(b) && Number(a) > Number(b)) err[c.key] = c.message;
    }
    if (schema.pk.length && !schema.pk.some(k => err[k]) && schema.pk.every(k => String(rec[k] ?? '').trim() !== '')) {
      const mine = pkOf(rec, schema);
      if (all.some(r => r.id !== rec.id && pkOf(r, schema) === mine)) {
        err[schema.pk[schema.pk.length - 1]] = 'A record with this key combination already exists.';
      }
    } else if (!schema.pk.length && schema.fields.length) {
      // No key is declared for this dataset, so the most we can say is that the same row twice is wrong
      const mine = rowSignature(rec, schema);
      if (mine && all.some(r => r.id !== rec.id && rowSignature(r, schema) === mine)) {
        err[schema.fields[0].key] = 'An identical record has already been entered.';
      }
    }
    return err;
  }
  function pkOf(rec, schema) { return schema.pk.map(k => String(rec[k] ?? '').trim()).join('|'); }
  function rowSignature(rec, schema) {
    const parts = schema.fields.map(f => String(rec[f.key] ?? '').trim());
    return parts.some(Boolean) ? parts.join('\u0001') : '';
  }
  // What counts as "the same record": the declared primary key when the dictionary gives one,
  // otherwise every field, so at least an identical row cannot be entered twice.
  function dupKeyOf(rec, schema) {
    if (!schema.pk.length) return rowSignature(rec, schema);
    return schema.pk.every(k => String(rec[k] ?? '').trim() !== '') ? pkOf(rec, schema) : '';
  }

  // The real-time schema sheets carry no Sample Data column, so roughly a fifth of all fields
  // had nothing to show and fell back to echoing their own label ("Person Id" -> "Person Id").
  // Shape a plausible value from the field name instead.
  function initials(label) {
    const letters = (String(label).match(/\b[A-Za-z]/g) || ['X']).join('').toUpperCase();
    return letters.slice(0, 4);
  }
  function inventValue(f) {
    const L = String(f.label).toLowerCase();
    const seed = (f.idx * 37) % 90 + 10;
    const serial = 1000 + (f.idx * 137) % 8999;
    // check the explanatory fields first, so "Reason Emirates Id is Missing" is not read as an ID
    if (/\breason\b|^why\b/i.test(L)) return 'Not available at the time of submission.';
    if (/e-?mail/.test(L)) return 'records' + seed + '@example.ac.ae';
    if (/website|url\b|link\b|portal/.test(L)) return 'https://www.example.ac.ae';
    if (/phone|mobile|telephone|fax/.test(L)) return '+971 4 555 ' + String(1000 + seed).slice(0, 4);
    if (/emirates\s*id/.test(L)) return '784-1990-' + String(1000000 + f.idx * 13457).slice(0, 7) + '-1';
    if (/\bgcc\b/.test(L)) return 'GCC' + serial;
    if (/passport/.test(L)) return 'A' + String(1000000 + f.idx * 7919).slice(0, 7);
    if (/country|nationality/.test(L)) return 'United Arab Emirates';
    if (/address|location|premises/.test(L)) return 'Dubai Knowledge Park, Dubai';
    if (/\b(college|faculty|department|school|campus|unit)\b/.test(L)) return 'College of Engineering';
    if (/revenue|expenditure|\bcost\b|\bbudget\b|salary|funding|grant|\bfee\b|\bamount\b/.test(L)) return '1500000';
    if (/\b(details?|title|subject|topic|purpose|objective)\b/.test(L)) return 'Sample text for demonstration.';
    if (/mechanism|\bmethod\b|process|procedure/.test(L)) return 'Extracted from the institutional student system.';
    if (/\bcity\b|emirate\b/.test(L)) return 'Dubai';
    if (/\b(period|semester|term)\b/.test(L)) return '2025' + String(f.idx % 3).padStart(2, '0');
    if (/\byear\b/.test(L)) return '2025';
    if (/percent|\bratio\b|\brate\b/.test(L)) return String(50 + f.idx % 45);
    if (/\b(comments?|description|remarks?|notes?|summary)\b/.test(L)) return 'Sample text for demonstration.';
    if (/\b(status|flag)\b/.test(L)) return 'Active';
    if (/\b(type|category|level|mode)\b/.test(L)) return 'General';
    if (/\b(ids?|codes?|numbers?|no)\b/.test(L)) return initials(f.label) + '-' + serial;
    if (/\bname\b/.test(L)) {
      const base = f.label.replace(/\s*names?\s*$/i, '').trim() || f.label;
      return base + ' ' + String.fromCharCode(65 + f.idx % 26);
    }
    return f.label;
  }

  function sampleRecord(schema) {
    const rec = {};
    for (const f of schema.fields) {
      let v = String(f.sample || '').trim();
      if (!v || /^(yyyy|n\/a|na)$/i.test(v)) v = '';
      if (f.control === 'select' && f.opts) {
        v = f.opts.some(o => String(o.v) === v) ? v : String(f.opts[0].v);
      } else if (f.control === 'date') {
        v = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10);
      } else if (f.control === 'number' && !isNumLike(v)) {
        v = String(10 + (f.idx * 7) % 90);
      } else if (!v) {
        // only an invented string is trimmed to the declared size; a real example, a code
        // or a date is left alone (some date fields are declared TEXT(8), too short for one)
        v = String(inventValue(f)).slice(0, Math.min(f.maxLen || 60, 60));
      }
      rec[f.key] = String(v);
    }
    // a field the dictionary says mirrors another one should show that one's description,
    // not its own name
    for (const f of schema.fields) {
      if (!f.derivedFrom) continue;
      const src = schema.field(f.derivedFrom);
      if (!src || !src.opts) continue;
      const hit = src.opts.find(o => String(o.v) === String(rec[f.derivedFrom]));
      if (!hit) continue;
      const label = hit.l.includes(' \u2014 ') ? hit.l.split(' \u2014 ').slice(1).join(' \u2014 ') : hit.l;
      rec[f.key] = String(label).slice(0, Math.min(f.maxLen || 90, 90));
    }
    return rec;
  }

  function display(rec, f) {
    const val = rec[f.key];
    if (val == null || val === '') return '';
    if (f.opts) {
      const hit = f.opts.find(o => String(o.v) === String(val));
      if (hit) return hit.l.includes(' — ') ? hit.l.split(' — ')[1] : hit.l;
    }
    return String(val);
  }

  // Numeric fields worth summing or charting. Identifiers (IDs, codes, phone numbers) are numeric in the
  // dictionary but meaningless to total, so they are filtered out and real measures are ranked first.
  const ID_LIKE = /\b(id|ids|code|codes|number)\b|phone|mobile|passport|emirates|zip|postal|\byear\b|\bcip\b/i;
  const MEASURE_LIKE = /\b(number of|total|count|amount|credits?|hours?|salary|expenditure|cost|budget|score|rate|enrol\w*|applicants?|admissions?|graduates?|students?|staff|employees?|publications?|projects?|patents?)\b/i;
  function measureFields(schema) {
    const nums = schema.fields.filter(f => f.control === 'number' && !ID_LIKE.test(f.label));
    const preferred = nums.filter(f => MEASURE_LIKE.test(f.label));
    return preferred.length ? preferred.concat(nums.filter(f => !preferred.includes(f))) : nums;
  }

  // ---------- form sections ----------
  // The dictionary is a flat list of fields, so the form groups them itself: what identifies the
  // record, how it is classified, who it describes, what is counted, and when. A section is only
  // offered if it has fields, and a long one is split so no step runs past a dozen inputs.
  const SECTION_MAX = 18;
  const PEOPLE_LIKE = /\b(name|email|e-mail|phone|mobile|contact|nationality|gender|birth|address|title|position|designation)\b/i;
  const SECTION_ORDER = [
    { id: 'identity', pick: (f, schema) => schema.pk.includes(f.key) || /\b(code|id|institution|academic (year|period|term)|semester|term)\b/i.test(f.label) },
    { id: 'classification', pick: f => !!f.opts },
    { id: 'people', pick: f => f.control === 'text' && PEOPLE_LIKE.test(f.label) },
    { id: 'figures', pick: f => f.control === 'number' },
    { id: 'dates', pick: f => f.control === 'date' },
    { id: 'details', pick: () => true },
  ];

  function sections(schema) {
    const left = schema.fields.slice();
    const out = [];
    for (const sec of SECTION_ORDER) {
      const mine = left.filter(f => sec.pick(f, schema));
      if (!mine.length) continue;
      mine.forEach(f => left.splice(left.indexOf(f), 1));
      // a section longer than SECTION_MAX becomes "… 1 of n" parts, in dictionary order
      const parts = Math.ceil(mine.length / SECTION_MAX);
      const size = Math.ceil(mine.length / parts);   // even parts rather than a stub at the end
      for (let i = 0; i < parts; i++) {
        out.push({
          id: sec.id + (parts > 1 ? '-' + (i + 1) : ''),
          kind: sec.id,
          part: parts > 1 ? i + 1 : 0,
          parts: parts > 1 ? parts : 0,
          fields: mine.slice(i * size, (i + 1) * size).map(f => f.key),
        });
      }
    }
    return out;
  }

  window.KHDA_SCHEMA = { get, validate, pkOf, dupKeyOf, sampleRecord, display, measureFields, sections, GRID_COLS, all: () => SETS };
})();
