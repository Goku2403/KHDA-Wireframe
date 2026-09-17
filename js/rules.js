/* Rule library (plan T-6) — one rule library, derived from the dictionary through the same schema the form,
   the Excel template and the validator use. Rules are typed, versioned with effective periods, sandbox-tested,
   approved by a Supervisor and published by an Administrator. KHDA IT owns it; KHDA Data authors. */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES, S = window.KHDA_SCHEMA;
  const DATA = window.KHDA_DATASETS || [];
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  let sheet = params.get('sheet') || DATA[0].sheet, type = 'all', q = '', highlight = params.get('rule');
  const DRAFT_KEY = 'khda.rules.drafts.v1';
  const drafts = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]'); } catch { return []; } };

  function rulesFor(d) {
    const sc = S.get(d.sheet); const out = [];
    const id = (f, k) => 'R-' + String(K.hash(d.sheet + f.db + k) % 900 + 100);
    sc.fields.forEach(f => {
      if (f.required) out.push({ id: id(f, 'm'), type: 'mandatory', field: f, text: `${f.label} must be provided`, expr: `NOT NULL(${f.db})` });
      if (f.listName) out.push({ id: id(f, 'c'), type: 'code_list', field: f, text: `${f.label} must be a value from the ${f.listName} list`, expr: `${f.db} IN LIST('${f.listName}')` });
      else if (f.opts && f.opts.length) out.push({ id: id(f, 'c'), type: 'code_list', field: f, text: `${f.label} must be one of ${f.opts.map(o => o.v).join(', ')}`, expr: `${f.db} IN (${f.opts.map(o => `'${o.v}'`).join(', ')})` });
      if (f.maxLen) out.push({ id: id(f, 'l'), type: 'type_length', field: f, text: `${f.label} is text up to ${f.maxLen} characters`, expr: `LEN(${f.db}) <= ${f.maxLen}` });
      if (f.control === 'number') out.push({ id: id(f, 'n'), type: 'range', field: f, text: `${f.label} is a ${f.integer ? 'whole' : 'decimal'} number${f.min != null ? ' ≥ ' + f.min : ''}`, expr: `IS_${f.integer ? 'INT' : 'NUMBER'}(${f.db})${f.min != null ? ` AND ${f.db} >= ${f.min}` : ''}` });
      if (f.control === 'date') out.push({ id: id(f, 'd'), type: 'date', field: f, text: `${f.label} is a date (YYYY-MM-DD) not after today`, expr: `IS_DATE(${f.db}) AND ${f.db} <= TODAY()` });
      if (f.email) out.push({ id: id(f, 'e'), type: 'custom', field: f, text: `${f.label} is a valid email address`, expr: `MATCHES(${f.db}, EMAIL)` });
      const m = /cannot exceed\s+(.+)/i.exec(f.values || '');
      if (m) out.push({ id: id(f, 'x'), type: 'cross_field', field: f, text: `${f.label} cannot exceed ${m[1].trim()}`, expr: `${f.db} <= [${m[1].trim()}]` });
    });
    if (sc.pk && sc.pk.length) out.push({ id: 'R-' + String(K.hash(d.sheet + 'pk') % 900 + 100), type: 'primary_key', field: null, text: `Primary key: ${sc.pk.map(k => (sc.fields.find(f => f.key === k) || {}).label || k).join(' + ')} must be unique`, expr: `UNIQUE(${sc.pk.map(k => (sc.fields.find(f => f.key === k) || {}).db || k).join(', ')})` });
    if (/Institution Code/.test(sc.fields.map(f => f.label).join('|'))) out.push({ id: 'R-' + String(K.hash(d.sheet + 'xd') % 900 + 100), type: 'cross_dataset', field: null, text: 'Institution Code must match the institution profile and the Institution - Overview dataset', expr: `Institution_Code IN DATASET('Institute - Overview').Institution_Code` });
    return out;
  }
  const TYPES = { mandatory: 'Mandatory', type_length: 'Type / length', code_list: 'Code list', range: 'Range', cross_field: 'Cross-field', cross_dataset: 'Cross-dataset', primary_key: 'Primary key', date: 'Date logic', custom: 'Custom expression' };
  const VERSIONS = [{ v: '2026.1', status: 'live', from: 'Fall · 2025–2026', by: 'Hessa Al Marri', note: 'Dictionary 2026 baseline' }, { v: '2026.2', status: 'approved', from: 'Fall · 2026–2027', by: 'Khalid Al Mansoori', note: 'Institution Code cross-dataset check added' }, { v: '2027.0-draft', status: 'draft', from: 'Fall · 2027–2028', by: 'Mariam Saeed', note: 'Dictionary 2027 — 3 new fields, 2 retired' }];

  function render() {
    const d = DATA.find(x => x.sheet === sheet) || DATA[0];
    let list = rulesFor(d);
    const counts = {}; list.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    if (type !== 'all') list = list.filter(r => r.type === type);
    if (q) list = list.filter(r => (r.id + r.text + r.expr + (r.field ? r.field.db : '')).toLowerCase().includes(q));
    const all = DATA.reduce((n, x) => n + rulesFor(x).length, 0);
    const myDrafts = drafts().filter(x => x.sheet === d.sheet);
    const sec = K.sector(K.currentPeriod());
    $('#main').innerHTML = `
      <div class="page-head"><div><div class="page-head__eyebrow">${R.role().team === 'it' ? 'KHDA IT · Rule engine' : 'KHDA Data · Rule library'}</div><h1 class="page-head__title">Rule library</h1><p class="page-head__sub">${all.toLocaleString()} rules across ${DATA.length} datasets — applied identically in the portal form, the Excel template, API validation in the Qlik DQ layer and the remediation report.</p></div>
        <div class="page-head__actions"><button class="btn btn--outline" type="button" id="testAll">▶ Test against sample data</button><button class="btn btn--outline" type="button" id="draftRule">＋ Draft a rule</button><button class="btn btn--primary" type="button" id="publish" data-tier="administrator">Publish 2026.2</button></div></div>
      <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Versions</h2><p class="panel__sub">Every version carries an effective period. Draft → Supervisor approves → Administrator publishes.</p></div></div>
        <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Version</th><th>Status</th><th>Effective from</th><th>By</th><th>Change</th><th></th></tr></thead><tbody>${VERSIONS.map(v => `<tr><td><span class="version-pill${v.status === 'live' ? ' is-live' : ''}">${esc(v.v)}</span></td><td>${v.status === 'live' ? '<span class="chip chip--complete">Live</span>' : v.status === 'approved' ? '<span class="chip chip--current">Approved · awaiting publish</span>' : '<span class="chip chip--pending">Draft</span>'}</td><td>${esc(v.from)}</td><td>${esc(v.by)}</td><td>${esc(v.note)}</td><td class="actions">${v.status === 'draft' ? '<button class="btn btn--outline btn--sm" type="button" data-tier="supervisor" data-approve="1">Approve</button>' : v.status === 'approved' ? '<button class="btn btn--outline btn--sm" type="button" data-tier="administrator" data-publish="1">Publish</button>' : '<a class="btn btn--text btn--sm" href="#">Diff →</a>'}</td></tr>`).join('')}</tbody></table></div></section>
      <div class="grid-main-side">
        <section class="panel"><div class="panel__head"><div><h2 class="panel__title">${esc(K.titleOf(d))}</h2><p class="panel__sub">${esc(K.codeOf(d))} · ${esc(K.frequencyOf(d))} · ${d.fields.length} fields · ${rulesFor(d).length} rules</p></div>
          <div class="panel__tools"><select class="control control--sm" id="sheetPick" aria-label="Dataset">${DATA.map(x => `<option value="${esc(x.sheet)}"${x.sheet === d.sheet ? ' selected' : ''}>${esc(K.titleOf(x))}</option>`).join('')}</select><input class="control control--sm" id="q" placeholder="Find a rule or field…" aria-label="Find a rule" value="${esc(q)}"></div></div>
          <div class="filter-row"><button class="chip-toggle" type="button" data-type="all" aria-pressed="${type === 'all'}">All <span class="count-badge">${rulesFor(d).length}</span></button>${Object.keys(TYPES).filter(k => counts[k]).map(k => `<button class="chip-toggle" type="button" data-type="${k}" aria-pressed="${type === k}">${TYPES[k]} <span class="count-badge">${counts[k]}</span></button>`).join('')}</div>
          <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Rule</th><th>Type</th><th>Field</th><th>Expression</th><th class="num">Hit rate</th><th></th></tr></thead><tbody>
            ${list.map(r => { const hits = K.hash(r.id + K.currentPeriod()) % 9; return `<tr class="${highlight === r.id ? 'is-selected' : ''}" id="${esc(r.id)}"><td><div class="issue__id">${esc(r.id)}</div><div class="cell-title">${esc(r.text)}</div></td><td><span class="rule-type">${TYPES[r.type]}</span></td><td>${r.field ? `<div>${esc(r.field.label)}</div><div class="cell-code">${esc(r.field.db)} · ${esc(r.field.type || '—')}</div>` : '<span class="cell-muted">dataset</span>'}</td><td><code class="formula" style="font-size:12px">${esc(r.expr)}</code></td><td class="num">${hits ? `<span class="${hits > 5 ? 'cell-late' : ''}">${hits}%</span><div class="cell-muted">${Math.round(hits * sec.rowsRejected / 60).toLocaleString()} rows</div>` : '<span class="cell-muted">0%</span>'}</td><td class="actions"><button class="btn btn--text btn--sm" type="button" data-edit="${esc(r.id)}">Edit</button></td></tr>`; }).join('')}
            ${myDrafts.map(r => `<tr><td><div class="issue__id">${esc(r.id)}</div><div class="cell-title">${esc(r.text)} <span class="chip chip--pending">Draft</span></div></td><td><span class="rule-type">${TYPES[r.type] || r.type}</span></td><td>${esc(r.field)}</td><td><code class="formula" style="font-size:12px">${esc(r.expr)}</code></td><td class="num">—</td><td class="actions"><button class="btn btn--text btn--sm" type="button" data-tier="supervisor" data-approve="1">Approve</button></td></tr>`).join('')}
          </tbody></table></div>
          <div class="panel__foot"><span>Hit rate = share of validated submissions in ${esc(K.period().label)} that failed this rule; rows from the remediation report.</span><a href="remediation.html">Remediation report →</a></div>
        </section>
        <div style="display:flex;flex-direction:column;gap:24px">
          <section class="panel" id="sandbox"><div class="panel__head"><h2 class="panel__title">Sandbox test</h2></div><p class="panel__sub" style="margin-top:-12px">Run the ${rulesFor(d).length} rules of this dataset against the dictionary's sample rows and the last accepted submission.</p><div id="testOut"><div class="empty empty--inline" style="padding:24px"><div class="empty__title">Not run yet</div></div></div><button class="btn btn--outline btn--md" type="button" id="runTest">▶ Run test</button></section>
          <section class="panel"><div class="panel__head"><h2 class="panel__title">Where rules apply</h2></div><ul class="spec-rules"><li><strong>Portal form</strong> — inline validation as the Steward types</li><li><strong>Excel template</strong> — dropdowns, number and length checks in the workbook</li><li><strong>API validation</strong> — Qlik DQ layer, stage 5 of the journey</li><li><strong>Remediation report</strong> — every failure cites its rule id</li><li><strong>Assistant</strong> — answers "why was this rejected?" from the same library</li></ul></section>
        </div>
      </div>
      <div class="modal-backdrop" id="ruleModal" hidden></div>`;
    $('#main').removeAttribute('aria-busy');
    $('#sheetPick').addEventListener('change', e => { sheet = e.target.value; highlight = null; history.replaceState(null, '', 'rules.html?sheet=' + encodeURIComponent(sheet)); render(); });
    $('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); const el = $('#q'); el.focus(); el.setSelectionRange(q.length, q.length); });
    $('#main').querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { type = b.dataset.type; render(); }));
    $('#main').querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(rulesFor(d).find(r => r.id === b.dataset.edit))));
    $('#draftRule').addEventListener('click', () => openEditor(null));
    $('#runTest').addEventListener('click', runTest); $('#testAll').addEventListener('click', () => { document.getElementById('sandbox').scrollIntoView({ behavior: 'smooth' }); runTest(); });
    $('#main').querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => { if (!R.can('supervisor')) return window.khdaToast('error', 'Supervisor tier required', 'Rule changes are approved by a Supervisor.'); window.khdaToast('success', 'Approved', 'Awaiting an Administrator to publish'); }));
    $('#main').querySelectorAll('[data-publish],#publish').forEach(b => b.addEventListener('click', () => { if (!R.can('administrator')) return window.khdaToast('error', 'Administrator tier required', 'Publishing a rule version is an Administrator action.'); window.khdaToast('success', 'Published 2026.2', 'Effective Fall · 2026–2027 · form, template, API validation and report updated'); }));
    if (highlight) { const el = document.getElementById(highlight); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    R.gate();

    function runTest() {
      const sc = S.get(d.sheet);
      const sample = S.sampleRecord(sc);
      const errs = S.validate(sample, [], sc);
      const bad = { ...sample }; const f = sc.fields.find(x => x.required); if (f) bad[f.key] = '';
      const errs2 = S.validate(bad, [sample], sc);
      $('#testOut').innerHTML = `<div class="test-result"><div><b style="color:var(--success)">${Object.keys(errs).length === 0 ? 'Pass' : Object.keys(errs).length + ' fail'}</b>Dictionary sample row</div><div><b style="color:var(--error)">${Object.keys(errs2).length} fail</b>Sample with ${f ? esc(f.label) : 'a field'} blanked</div><div><b>${rulesFor(d).length}</b>rules executed · 0.4 s</div></div><ul class="spec-rules" style="margin-top:12px">${Object.entries(errs2).slice(0, 4).map(([k, v]) => `<li>${esc((sc.fields.find(x => x.key === k) || {}).label || k)}: ${esc(v)}</li>`).join('')}</ul>`;
    }
    function openEditor(rule) {
      const m = $('#ruleModal');
      m.innerHTML = `<div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="rmTitle"><h3 class="modal__title" id="rmTitle">${rule ? 'Edit rule ' + esc(rule.id) : 'Draft a rule'}</h3><p class="modal__text">Changes create a draft in the next version; the live version is never edited in place.</p>
        <div class="form-grid" style="margin-top:16px;display:grid;gap:16px">
          <div class="field"><label class="field__label">Type</label><select class="control control--select" id="rmType">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}"${rule && rule.type === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label class="field__label">Field</label><select class="control control--select" id="rmField"><option value="">(dataset-level)</option>${S.get(d.sheet).fields.map(f => `<option value="${esc(f.db)}"${rule && rule.field && rule.field.db === f.db ? ' selected' : ''}>${esc(f.label)} · ${esc(f.db)}</option>`).join('')}</select></div>
          <div class="field"><label class="field__label">Plain-language rule</label><input class="control" id="rmText" value="${rule ? esc(rule.text) : ''}"></div>
          <div class="field"><label class="field__label">Expression</label><input class="control mono" id="rmExpr" value="${rule ? esc(rule.expr) : ''}"></div>
          <div class="field"><label class="field__label">Severity</label><select class="control control--select" id="rmSev"><option>Error</option><option>Warning</option></select></div>
          <div class="field"><label class="field__label">Effective from</label><select class="control control--select">${K.PERIODS.slice(-1).map(p => `<option>${esc(p.label)}</option>`).join('')}<option>Fall · 2027–2028</option></select></div>
        </div>
        <div class="modal__actions"><button class="btn btn--outline" type="button" id="rmCancel">Cancel</button><span class="modal__spacer"></span><button class="btn btn--outline" type="button" id="rmTest">Test in sandbox</button><button class="btn btn--primary" type="button" id="rmSave">Save draft</button></div></div>`;
      m.hidden = false;
      const close = () => { m.hidden = true; };
      $('#rmCancel').addEventListener('click', close); m.addEventListener('mousedown', e => { if (e.target === m) close(); });
      $('#rmTest').addEventListener('click', () => window.khdaToast('info', 'Sandbox', 'Rule evaluated against 12 sample rows · 2 would fail'));
      $('#rmSave').addEventListener('click', () => { const l = drafts(); l.push({ sheet: d.sheet, id: rule ? rule.id + '·d' : 'R-D' + (l.length + 1), type: $('#rmType').value, field: $('#rmField').value || 'dataset', text: $('#rmText').value || 'Untitled rule', expr: $('#rmExpr').value || '—' }); try { localStorage.setItem(DRAFT_KEY, JSON.stringify(l)); } catch { /* ignore */ } close(); window.khdaToast('success', 'Draft saved', 'Added to version 2027.0-draft · awaiting Supervisor approval'); render(); });
    }
  }
  render();
})();
