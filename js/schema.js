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
    const order = [...pk, ...fields.map(f => f.key).filter(k => !pk.includes(k))];
    const gridCols = order.slice(0, GRID_COLS);

    return {
      sheet: ds.sheet, title: ds.title, desc: ds.desc, group: ds.group,
      fields, pk, cross, gridCols,
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
