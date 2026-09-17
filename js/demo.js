/* Demo data for walkthroughs. The "Demo data" button is hidden until you type "qwerty"
   outside a form field and press Enter; it then loads the data and clears it again.
   These work whether or not the button is showing:
     ?demo=on   fills every page with a plausible submission cycle (the parameter is
                consumed before the page scripts run, so no reload and no flash)
     ?demo=off  clears it again
     Ctrl+Shift+D  toggles, from anywhere in the app
     KHDA_DEMO.seed() / .clear() / .isOn()  from the console

   Records are generated from each dataset's own field metadata and then checked with the
   real validator, so the demo never shows rows that the wireframe would itself reject —
   except the two datasets deliberately left failing so the dashboard has something to flag. */
(function () {
  'use strict';

  const S = window.KHDA_SCHEMA;
  const DATA = window.KHDA_DATASETS || [];
  if (!S || !DATA.length) return;

  const FLAG = 'khda.demo.v1';
  const keyOf = sheet => 'khda.hedb.' + sheet.replace(/[^A-Za-z0-9]+/g, '_') + '.v1';

  // One institution runs through the whole demo, so the dashboard names a single school.
  const HOME_CODE = '75';

  // How busy each dataset looks. Everything not listed stays untouched, which is realistic:
  // no institution has started all 46 at once.
  const PLAN = [
    ['Applicants - Basic Details', 24, 'submitted'],
    ['Graduates', 18, 'submitted'],
    ['Students - Enrollments', 30, 'submitted'],
    ['Employee - Basic Details', 16, 'submitted'],
    ['Courses', 22, 'submitted'],
    ['Institute - Overview', 3, 'submitted'],
    ['Institute - Academic Programs', 12, 'submitted'],
    ['Course Faculty', 14, 'submitted'],
    ['Students - Scholarship', 9, 'submitted'],
    ['Institute - Financials', 4, 'submitted'],
    ['Student- Attrition', 11, 'progress'],
    ['Students - Internship', 8, 'progress'],
    ['Graduates - Licensures', 6, 'progress'],
    ['Employee Workload', 10, 'progress'],
    ['PERSON_PROFILE', 12, 'progress'],
    ['ACADEMIC_PROGRAM', 7, 'progress'],
    ['Institute - Publications', 5, 'errors'],
    ['Students - Research', 7, 'errors'],
  ];

  // ---------- record generation ----------
  function optionAt(f, n) { return f.opts[Math.abs(n) % f.opts.length]; }
  function labelOf(o) { return o.l.includes(' — ') ? o.l.split(' — ').slice(1).join(' — ') : o.l; }

  function fillDerived(rec, schema) {
    for (const f of schema.fields) {
      if (!f.derivedFrom) continue;
      const src = schema.field(f.derivedFrom);
      if (!src || !src.opts) continue;
      const hit = src.opts.find(o => String(o.v) === String(rec[f.derivedFrom]));
      if (hit) rec[f.key] = labelOf(hit);
    }
  }

  function applyCrossRules(rec, schema) {
    for (let pass = 0; pass < 3; pass++) {
      for (const c of schema.cross) {
        const a = Number(rec[c.key]), b = Number(rec[c.other]);
        if (isFinite(a) && isFinite(b) && a > b) rec[c.key] = String(b);
      }
    }
  }

  function buildRecord(schema, i, salt) {
    const rec = { ...S.sampleRecord(schema), id: 'demo-' + schema.sheet.replace(/\W+/g, '') + '-' + i + '-' + salt };
    const coded = schema.fields.filter(f => f.opts && f.opts.length > 1 && !f.readonly);
    const nums = schema.fields.filter(f => f.control === 'number' && !f.readonly);

    coded.forEach((f, j) => {
      // keep this institution fixed; spread everything else across its list
      if (/institution\s*code/i.test(f.label) && f.opts.some(o => String(o.v) === HOME_CODE)) {
        rec[f.key] = HOME_CODE;
        return;
      }
      rec[f.key] = String(optionAt(f, i * (j + 3) + j + salt).v);
    });

    nums.forEach((f, j) => {
      const base = 12 + ((i * 7 + j * 13 + salt * 3) % 88);
      rec[f.key] = String(/number of|total|count/i.test(f.label) ? base * 5 : base);
    });

    // give a free-text field something that differs per row, so datasets with no declared
    // key still produce distinct records. Only fields with room to spare: some are TEXT(1).
    const tag = ' ' + (i + 1);
    const roomy = schema.fields.filter(f =>
      f.control === 'text' && !f.readonly && !f.opts && !f.derivedFrom && !f.email &&
      (!f.maxLen || f.maxLen >= tag.length + 4) &&
      // leave anything with a shape of its own alone: emails, links, formatted ids
      !/[@]|:\/\//.test(String(rec[f.key] || '')));
    // prefer a key field, so every row is unique by construction rather than by luck
    const usable = f => f && f.control === 'text' && !f.readonly && !f.opts && !f.derivedFrom &&
      !f.email && (!f.maxLen || f.maxLen >= tag.length + 4) && !/[@]|:\/\//.test(String(rec[f.key] || ''));
    const target = schema.pk.map(k => schema.field(k)).filter(usable)[0] || roomy[roomy.length - 1];
    if (target) {
      const cap = target.maxLen || 60;
      rec[target.key] = String(rec[target.key] || target.label).slice(0, cap - tag.length) + tag;
    }

    fillDerived(rec, schema);
    applyCrossRules(rec, schema);
    return rec;
  }

  function makeRecords(sheet, want) {
    const schema = S.get(sheet);
    const out = [];
    for (let i = 0; i < want; i++) {
      let rec = null;
      for (let salt = 0; salt < 8; salt++) {
        let candidate = buildRecord(schema, i, salt);
        let errs = S.validate(candidate, out.concat(candidate), schema);
        const clash = Object.values(errs).some(m => /already/i.test(m));
        if (Object.keys(errs).length && !clash) {
          // put the offending fields back to their dictionary examples and re-check
          const base = S.sampleRecord(schema);
          candidate = { ...candidate };
          for (const k of Object.keys(errs)) candidate[k] = base[k];
          errs = S.validate(candidate, out.concat(candidate), schema);
        }
        if (!Object.keys(errs).length) { rec = candidate; break; }
      }
      if (rec) out.push(rec);
    }
    return out;
  }

  function breakOne(records, sheet) {
    // clear one mandatory field so the row lands in the reconciliation queue
    const schema = S.get(sheet);
    const f = schema.fields.find(x => x.required && !x.readonly && !x.derivedFrom);
    if (f && records.length) records[0] = { ...records[0], [f.key]: '' };
    return records;
  }

  // ---------- storage ----------
  function clear() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (/^khda\.hedb\./.test(k) || k === FLAG)) localStorage.removeItem(k);
    }
    if (window.KHDA_ACTIVITY) window.KHDA_ACTIVITY.clear();
  }

  // a history to match the data, so the dashboard's activity card has something real to read
  function seedActivity(entries) {
    if (!window.KHDA_ACTIVITY) return;
    window.KHDA_ACTIVITY.clear();
    const list = entries.slice().sort((a, b) => a.t - b.t);
    try { localStorage.setItem(window.KHDA_ACTIVITY.KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }

  function seed() {
    clear();
    let datasets = 0, records = 0;
    const day = 24 * 3600 * 1000;
    const history = [];
    PLAN.forEach(([sheet, want, state], n) => {
      if (!DATA.some(d => d.sheet === sheet)) return;
      let rows = makeRecords(sheet, want);
      if (!rows.length) return;
      if (state === 'errors') rows = breakOne(rows, sheet);
      const submittedAt = state === 'submitted' ? new Date(Date.now() - (n + 2) * 3 * day).toISOString() : null;
      try {
        localStorage.setItem(keyOf(sheet), JSON.stringify({ records: rows, step: 1, submittedAt }));
        datasets++; records += rows.length;
        const worked = Date.now() - (n + 2) * 3 * day - 3600 * 1000;
        history.push({ t: worked, type: 'imported', sheet, n: rows.length });
        if (submittedAt) history.push({ t: new Date(submittedAt).getTime(), type: 'submitted', sheet, n: rows.length });
        else if (state === 'errors') history.push({ t: worked + 1800 * 1000, type: 'updated', sheet, n: 1 });
      } catch { /* storage full, stop quietly */ }
    });
    seedActivity(history);
    try { localStorage.setItem(FLAG, String(Date.now())); } catch { /* ignore */ }
    return { datasets, records };
  }

  function isOn() {
    try { return !!localStorage.getItem(FLAG); } catch { return false; }
  }

  // ---------- hidden triggers ----------
  const params = new URLSearchParams(location.search);
  const wanted = (params.get('demo') || '').toLowerCase();
  if (wanted === 'on' || wanted === 'off') {
    if (wanted === 'on') seed(); else clear();
    // drop the parameter so the address bar stays clean during a walkthrough
    params.delete('demo');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
  }

  document.addEventListener('keydown', e => {
    if (!e.ctrlKey || !e.shiftKey || (e.key || '').toLowerCase() !== 'd') return;
    e.preventDefault();
    const on = isOn();
    if (on) clear(); else seed();
    if (typeof window.khdaToast === 'function') {
      window.khdaToast('info', on ? 'Demo data cleared' : 'Demo data loaded', 'Reloading…');
    }
    setTimeout(() => location.reload(), on ? 250 : 400);
  });

  // ---------- the button is hidden until someone types the code ----------
  // Type "qwerty" anywhere outside a form field and press Enter. Typing it again hides the
  // button. The reveal is remembered for this tab only, so it survives the reload that
  // loading the data triggers, and a fresh tab starts clean again.
  const CODE = 'qwerty';
  const REVEAL_KEY = 'khda.demo.reveal';
  let typed = '';

  function isRevealed() {
    try { return sessionStorage.getItem(REVEAL_KEY) === '1'; } catch { return false; }
  }
  function setRevealed(on) {
    try {
      if (on) sessionStorage.setItem(REVEAL_KEY, '1');
      else sessionStorage.removeItem(REVEAL_KEY);
    } catch { /* ignore */ }
    paintButton();
  }

  function typingInAField(el) {
    return !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName || ''));
  }

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typingInAField(e.target)) { typed = ''; return; }
    if (e.key === 'Enter') {
      if (typed.endsWith(CODE)) {
        e.preventDefault();
        const next = !isRevealed();
        setRevealed(next);
        if (typeof window.khdaToast === 'function') {
          window.khdaToast('info', tr(next ? 'demo.revealed' : 'demo.hidden'), tr('demo.revealHint'));
        }
      }
      typed = '';
      return;
    }
    if (e.key === 'Backspace') { typed = typed.slice(0, -1); return; }
    if (e.key && e.key.length === 1) typed = (typed + e.key.toLowerCase()).slice(-12);
  });

  // ---------- header button ----------
  function paintButton() {
    const btn = document.getElementById('demoToggle');
    if (!btn) return;
    btn.hidden = !isRevealed();
    const on = isOn();
    const label = document.getElementById('demoToggleLabel');
    if (label) label.textContent = tr(on ? 'demo.clear' : 'demo.load');
    btn.title = tr(on ? 'demo.clearTitle' : 'demo.loadTitle');
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-on', on);
  }

  function tr(key) { return window.t ? window.t(key) : key; }

  function runFromButton() {
    const on = isOn();
    const btn = document.getElementById('demoToggle');
    if (btn) btn.disabled = true;
    let result = null;
    if (on) clear(); else result = seed();
    if (typeof window.khdaToast === 'function') {
      window.khdaToast('info',
        tr(on ? 'demo.clearedTitle' : 'demo.loadedTitle'),
        on ? tr('demo.clearedText')
          : tr('demo.loadedText').replace('{a}', result.datasets).replace('{b}', result.records));
    }
    setTimeout(() => location.reload(), 500);
  }

  function wireButton() {
    const btn = document.getElementById('demoToggle');
    if (!btn) return;
    paintButton();
    btn.addEventListener('click', runFromButton);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireButton);
  else wireButton();

  window.KHDA_DEMO = { seed, clear, isOn };
})();
