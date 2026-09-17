/* Reconciliation workbench — every dataset with records to fix for the reporting period: returned by KHDA
   validation or quality review, or failing checks in a draft. Three views on one page:
     Workbench  — dataset list, then the records grouped by failing rule: fix in place, bulk-fix a coded field,
                  mark fixed, download the error report, resubmit as the next version
     Report     — the reconciliation report: dataset × rule with severity, records, fields, sample value, suggested
                  fix, recurrence across periods, age and progress; exportable
     Analytics  — interactive SVG charts (hover for detail, click to drill into the workbench)
   Deep links: ?sheet=<sheet> opens a dataset; ?view=report|analytics opens a view. */
(function () {
  'use strict';
  const M = window.KHDA_MODEL, U = window.KHDA_UI, S = window.KHDA_SCHEMA;
  if (!M || !U) return;
  const { $, esc, t } = U;
  const LISTS = window.KHDA_LISTS || {};
  const params = new URLSearchParams(location.search);
  let view = ['work', 'report', 'analytics'].includes(params.get('view')) ? params.get('view') : 'work';
  let sheet = params.get('sheet') || '';
  let reportFilter = { src: 'all', sev: 'all', kind: 'all', q: '' };

  // severity per rule kind: errors block acceptance, warnings need confirmation
  const SEV = { Mandatory: 'error', 'Code list': 'error', 'Primary key': 'error', Reference: 'error', Duplicate: 'error', Length: 'warning', Range: 'warning', Date: 'warning', Consistency: 'warning', Outlier: 'warning', Form: 'error' };
  // DS palette: primary / info / success / warning / error, Secondary40 #585E71, Warning40 #835400, chip-draft blue, and the real-time purple the dashboard calendar already uses
  const KIND_COLOUR = { Mandatory: 'var(--primary)', 'Code list': 'var(--info)', 'Primary key': '#7C3AED', Reference: 'var(--error)', Duplicate: 'var(--primary-hover)', Length: 'var(--warning)', Range: '#835400', Date: 'var(--on-chip-draft)', Consistency: 'var(--success)', Outlier: '#585E71', Form: 'var(--on-chip-progress)' };
  const valuesLS = 'khda.recon.values.v1';   // record id → corrected value, per sheet
  const fixedValues = () => M.ls.get(valuesLS, {});

  // ---------- items: one per dataset needing reconciliation ----------
  function draftIssues(d) {
    const draft = M.ls.get(M.draftKey(d), {}); const recs = draft.records || []; if (!recs.length || draft.submittedAt) return [];
    const sc = S.get(d.sheet), out = [];
    recs.forEach((r, i) => {
      const errs = S.validate(r, recs, sc);
      Object.entries(errs).forEach(([k, msg]) => {
        const f = sc.fields.find(x => x.key === k) || {};
        out.push({ id: 'd' + i + '-' + k, rule: { id: 'FORM', kind: 'Form', text: String(msg), fix: t('rem.fixInForm') }, record: S.pkOf(r, sc) || '#' + (i + 1), keyLabel: t('rem.draftRecord'), field: f.label || k, db: f.db || '', value: String(r[k] == null ? '' : r[k]) || '(empty)', fixed: false, draft: true });
      });
    });
    return out;
  }
  function items() {
    const per = M.period(); const out = [];
    M.subs(per).forEach(sub => {
      const d = sub.dataset;
      let records = [], src = '';
      if (M.RETURNED(sub)) { records = sub.returned; src = sub.status; }
      else if (sub.status === 'draft') { records = draftIssues(d); src = 'draft'; }
      if (!records.length) return;
      const vals = fixedValues()[d.sheet] || {};
      records.forEach(r => { r.sev = SEV[r.rule.kind] || 'warning'; r.newValue = vals[r.id]; });
      const failed = M.journey(sub).find(j => j.state === 'failed');
      const age = failed ? M.daysBetween(M.TODAY, failed.at) : 0;
      // recurrence: the same rule returned in earlier periods for this dataset
      const rules = {};
      records.forEach(r => { const g = rules[r.rule.id] || (rules[r.rule.id] = { rule: r.rule, sev: r.sev, records: [], fields: new Set(), recurrence: 1 }); g.records.push(r); if (r.db) g.fields.add(r.db); });
      if (src !== 'draft') M.PERIODS.filter(p => p.start < per.start).forEach(p => { const prev = M.submission(d, p); const ids = new Set(prev.returned.map(x => x.rule.id)); Object.values(rules).forEach(g => { if (ids.has(g.rule.id)) g.recurrence++; }); });
      out.push({ sub, dataset: d, sheet: d.sheet, title: M.titleOf(d), src, records, rules: Object.values(rules).sort((a, b) => b.records.length - a.records.length), open: records.filter(r => !r.fixed).length, fixed: records.filter(r => r.fixed).length, age, returnedAt: failed ? failed.at : null });
    });
    return out.sort((a, b) => (a.src === 'draft') - (b.src === 'draft') || b.open - a.open);
  }
  const srcLabel = src => src === 'draft' ? t('rem.src.draft') : t(M.SOURCE[src]);
  const sevChip = sev => `<span class="chip chip--${sev}">${t(sev === 'error' ? 'rem.sev.error' : 'rem.sev.warning')}</span>`;
  const kindLabel = k => t('rem.kind.' + k.replace(/\s+/g, ''));

  // ---------- page ----------
  const ICON = {
    back: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>', rows: '<path d="M4 6h16M4 12h16M4 18h16"/>', rule: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>', check: '<path d="M20 6 9 17l-5-5"/>', send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  };
  const icon = (k, s) => `<svg width="${s || 22}" height="${s || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const stat = (k, label, value, note, accent) => `<div class="stat${accent ? ' stat--accent' : ''}"><span class="stat__icon">${icon(k)}</span><span class="stat__label">${esc(label)}</span><span class="stat__value">${value}</span>${note ? `<span class="stat__note">${esc(note)}</span>` : ''}</div>`;

  function render() {
    const per = M.period(), list = items();
    const all = list.flatMap(i => i.records), rulesFailing = new Set(list.flatMap(i => i.rules.map(g => g.rule.id))).size;
    const recurring = list.reduce((n, i) => n + i.rules.filter(g => g.recurrence > 1).length, 0);
    const ready = list.filter(i => i.src !== 'draft' && i.records.every(r => r.fixed)).length;

    $('#rmActions').innerHTML = U.periodSelect('rmPeriod');
    $('#rmPeriod').addEventListener('change', e => { M.setPeriod(e.target.value); sheet = ''; render(); });
    $('#rmTabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view));

    $('#rmStats').innerHTML = [
      stat('back', t('rem.s.datasets'), list.length, t('rem.s.datasetsNote', { a: list.filter(i => i.src !== 'draft').length, b: list.filter(i => i.src === 'draft').length }), true),
      stat('rows', t('rem.s.records'), all.length, t('rem.s.recordsNote', { n: all.filter(r => r.sev === 'error').length })),
      stat('rule', t('rem.s.rules'), rulesFailing, t('rem.s.rulesNote', { n: list.flatMap(i => i.rules).length })),
      stat('repeat', t('rem.s.recurring'), recurring, t('rem.s.recurringNote')),
      stat('check', t('rem.s.fixed'), all.filter(r => r.fixed).length, t('rem.s.fixedNote', { n: all.length })),
      stat('send', t('rem.s.ready'), ready, t('rem.s.readyNote')),
    ].join('');

    const host = $('#rmView');
    if (!list.length) { host.innerHTML = `<div class="empty"><div class="empty__title">${t('rem.none')}</div><div class="empty__text">${t('rem.noneText', { x: per.label })}</div><a class="btn btn--primary" href="status.html">${t('nav.status')}</a></div>`; return; }
    if (view === 'work') renderWork(host, list);
    else if (view === 'report') renderReport(host, list);
    else renderAnalytics(host, list);
  }

  // ================= Workbench =================
  function renderWork(host, list) {
    if (!list.some(i => i.sheet === sheet)) sheet = list[0].sheet;
    const cur = list.find(i => i.sheet === sheet);
    host.innerHTML = `<div class="rem-layout">
      <aside class="rem-list" aria-label="${t('rem.datasets')}">
        <div class="rem-list__head"><span class="dash-card__title">${t('rem.datasets')}</span><span class="chip chip--outline">${list.length}</span></div>
        ${list.map(i => `<button type="button" class="rem-item${i.sheet === sheet ? ' is-on' : ''}" data-sheet="${esc(i.sheet)}">
          <span class="rem-item__row"><span class="rem-item__title">${esc(i.title)}</span><span class="rem-item__n${i.open ? '' : ' is-done'}">${i.open}</span></span>
          <span class="rem-item__sub">${esc(srcLabel(i.src))} · ${t('rem.rulesN', { n: i.rules.length })}${i.age ? ' · ' + t('rem.ageDays', { n: i.age }) : ''}</span>
          <span class="rem-item__bar"><span style="width:${i.records.length ? Math.round(i.fixed / i.records.length * 100) : 0}%"></span></span>
        </button>`).join('')}
      </aside>
      <section class="rem-work" id="rmWork"></section></div>`;
    host.querySelector('.rem-list').addEventListener('click', e => { const b = e.target.closest('[data-sheet]'); if (!b) return; sheet = b.dataset.sheet; history.replaceState(null, '', 'reconciliation.html?sheet=' + encodeURIComponent(sheet)); render(); });
    renderDataset($('#rmWork'), cur);
  }

  function renderDataset(host, i) {
    const s = i.sub;
    const openN = i.records.filter(r => !r.fixed).length;
    host.innerHTML = `
      <div class="rem-work__head">
        <div><div class="small muted">${esc(M.codeOf(i.dataset))} · ${t('status.version', { n: s.version })}${s.receipt ? ' · ' + esc(s.receipt.id) : ''}</div>
          <h2 class="records__headline">${esc(i.title)}</h2>
          <p class="report-sub">${i.src === 'draft' ? t('rem.draftIntro', { n: i.records.length }) : t('rem.returnedIntro', { n: s.returnedCount, x: srcLabel(i.src).toLowerCase(), d: M.fmtDateTime(i.returnedAt), v: s.version + 1 })}</p></div>
        <div class="rem-work__actions">
          <button class="tool-btn" type="button" id="rmErrors"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12m0 0-4-4m4 4 4-4M4 16v4h16v-4"/></svg><span>${t('rem.downloadErrors')}</span></button>
          <a class="tool-btn" href="index.html?sheet=${encodeURIComponent(i.sheet)}">${t('recon.editInForm')}</a>
          ${i.src !== 'draft' ? `<a class="tool-btn" href="status.html?track=${encodeURIComponent(i.sheet)}">${t('portal.track')}</a>` : ''}
        </div>
      </div>
      <div class="rem-rules">
        ${i.rules.map((g, gi) => {
          const listName = g.rule.field && g.rule.field.listName, opts = listName && LISTS[listName] ? LISTS[listName] : null;
          const gOpen = g.records.filter(r => !r.fixed).length;
          return `<details class="rule"${gi === 0 ? ' open' : ''}>
            <summary class="rule__sum">
              <span class="rule__chev"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg></span>
              ${sevChip(g.sev)}
              <span class="rule__text"><span class="rule__title">${esc(g.rule.text)}</span><span class="rule__meta">${esc(g.rule.id)} · ${esc(kindLabel(g.rule.kind))}${g.fields.size ? ' · ' + [...g.fields].map(esc).join(', ') : ''}${g.recurrence > 1 ? ` · <b class="late">${t('rem.recurrenceN', { n: g.recurrence })}</b>` : ''}</span></span>
              <span class="rule__count"><b>${gOpen}</b><small>${t('rem.openOf', { n: g.records.length })}</small></span>
            </summary>
            <div class="rule__body">
              <div class="rule__fix"><span class="rule__fixlbl">${t('recon.h.fix')}</span><span class="rule__fixtext">${esc(g.rule.fix)}</span>
                ${opts && gOpen ? `<span class="rule__bulk"><select class="control control--select control--sm" data-bulk-select="${gi}" aria-label="${t('rem.bulkValue')}"><option value="">${t('rem.bulkChoose')}</option>${opts.map(([c, l]) => `<option value="${esc(c)}">${esc(c)}${l ? ' — ' + esc(l) : ''}</option>`).join('')}</select><button class="btn btn--outline btn--sm" type="button" data-bulk="${gi}" disabled>${t('rem.bulkApply', { n: gOpen })}</button></span>` : ''}
                ${!opts && gOpen && !g.records[0].draft ? `<button class="btn btn--outline btn--sm" type="button" data-fix-group="${gi}">${t('rem.markGroupFixed', { n: gOpen })}</button>` : ''}
              </div>
              <div class="table-wrap"><table class="data-table data-table--fit rule__table"><thead><tr><th>${t('recon.h.record')}</th><th>${t('recon.h.field')}</th><th>${t('recon.h.value')}</th><th>${t('rem.h.corrected')}</th><th>${t('status.h.status')}</th><th class="actions"><span class="sr-only">Action</span></th></tr></thead><tbody>
                ${g.records.map(r => `<tr${r.fixed ? '' : ' class="has-error"'}>
                  <td><div class="cell-title mono">${esc(r.record)}</div><div class="cell-sub">${esc(r.keyLabel)}</div></td>
                  <td><div class="cell-title">${esc(r.field)}</div>${r.db ? `<div class="cell-sub mono">${esc(r.db)}</div>` : ''}</td>
                  <td class="mono">${esc(r.value)}</td>
                  <td>${r.draft ? '—' : r.fixed ? `<span class="mono">${esc(r.newValue || t('rem.confirmed'))}</span>` : (opts ? `<select class="control control--select control--sm rule__input" data-input="${esc(r.id)}" aria-label="${t('rem.h.corrected')}"><option value="">${t('rem.pick')}</option>${opts.map(([c, l]) => `<option value="${esc(c)}">${esc(c)}${l ? ' — ' + esc(l) : ''}</option>`).join('')}</select>` : `<input class="control control--sm rule__input" data-input="${esc(r.id)}" placeholder="${t('rem.typeValue')}" aria-label="${t('rem.h.corrected')}">`)}</td>
                  <td>${r.fixed ? `<span class="chip chip--complete">${t('recon.f.fixed')}</span>` : sevChip(r.sev)}</td>
                  <td class="actions">${r.draft ? `<a class="btn btn--text btn--sm" href="index.html?sheet=${encodeURIComponent(i.sheet)}">${t('recon.editInForm')}</a>` : r.fixed ? `<button class="btn btn--text btn--sm" type="button" data-unfix="${esc(r.id)}">${t('recon.reopen')}</button>` : `<button class="btn btn--outline btn--sm" type="button" data-fix="${esc(r.id)}">${t('rem.save')}</button>`}</td>
                </tr>`).join('')}
              </tbody></table></div>
            </div>
          </details>`;
        }).join('')}
      </div>
      ${i.src !== 'draft' ? `<div class="form-actions"><span class="form-step-note">${openN ? t('recon.openLeft', { n: openN }) : t('recon.allFixedText')}</span><span class="form-actions__spacer"></span>
        <button class="btn btn--outline" type="button" id="rmFixAll"${openN ? '' : ' disabled'}>${t('recon.markAllFixed')}</button>
        <button class="btn btn--primary" type="button" id="rmSend"${openN ? ' disabled' : ''}>${t('recon.resubmit', { n: s.version + 1 })}</button></div>` : ''}`;

    // ---- interactions ----
    const setValue = (id, v) => { const all = fixedValues(); (all[i.sheet] = all[i.sheet] || {})[id] = v; M.ls.set(valuesLS, all); };
    host.addEventListener('click', e => {
      const fix = e.target.closest('[data-fix]'), unfix = e.target.closest('[data-unfix]'), grp = e.target.closest('[data-fix-group]'), bulk = e.target.closest('[data-bulk]');
      if (fix) { const inp = host.querySelector(`[data-input="${CSS.escape(fix.dataset.fix)}"]`); const v = inp ? inp.value.trim() : ''; if (v) setValue(fix.dataset.fix, v); M.markFixed(i.sheet, [fix.dataset.fix]); render(); }
      else if (unfix) { M.markFixed(i.sheet, [unfix.dataset.unfix], false); render(); }
      else if (grp) { const g = i.rules[+grp.dataset.fixGroup]; M.markFixed(i.sheet, g.records.map(r => r.id)); U.toast('success', t('rem.groupFixed'), g.rule.text); render(); }
      else if (bulk) { const sel = host.querySelector(`[data-bulk-select="${bulk.dataset.bulk}"]`); const g = i.rules[+bulk.dataset.bulk]; const ids = g.records.filter(r => !r.fixed).map(r => r.id); ids.forEach(id => setValue(id, sel.value)); M.markFixed(i.sheet, ids); U.toast('success', t('rem.bulkDone', { n: ids.length }), (g.rule.field ? g.rule.field.label : '') + ' → ' + sel.value); render(); }
    });
    host.addEventListener('change', e => { const sel = e.target.closest('[data-bulk-select]'); if (sel) host.querySelector(`[data-bulk="${sel.dataset.bulkSelect}"]`).disabled = !sel.value; });
    host.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[data-input]')) { e.preventDefault(); const b = host.querySelector(`[data-fix="${CSS.escape(e.target.dataset.input)}"]`); if (b) b.click(); } });
    const fixAll = $('#rmFixAll'); if (fixAll) fixAll.addEventListener('click', () => { M.markFixed(i.sheet, i.records.map(r => r.id)); render(); });
    const send = $('#rmSend'); if (send) send.addEventListener('click', () => resubmit(i));
    $('#rmErrors').addEventListener('click', () => {
      const grid = [[t('recon.h.record'), t('recon.h.field'), 'Column', t('recon.h.value'), t('rem.h.corrected'), 'Rule', t('rem.h.severity'), t('recon.h.reason'), t('recon.h.fix'), t('status.h.status')]];
      i.records.forEach(r => grid.push([r.record, r.field, r.db, r.value, r.newValue || '', r.rule.id, r.sev, r.rule.text, r.rule.fix, r.fixed ? 'Fixed' : 'Open']));
      U.download(`KHDA-errors-${M.codeOf(i.dataset)}-${M.period().id}-v${s.version}.csv`, U.csv(grid), 'text/csv');
      U.toast('success', t('rem.downloadErrors'), t('recon.exported', { n: i.records.length }));
    });
  }

  function resubmit(i) {
    const s = i.sub, base = { sheet: i.sheet, channel: 'portal', version: s.version + 1, rows: s.rows };
    M.record({ ...base, status: 'validation' });
    M.queue([[7000, { ...base, status: 'review' }], [16000, { ...base, status: 'accepted' }]]);
    M.clearFixed(i.sheet); const all = fixedValues(); delete all[i.sheet]; M.ls.set(valuesLS, all);
    U.toast('success', t('recon.resubmitted'), t('recon.resubmittedText', { x: i.title, n: s.version + 1 }));
    sheet = ''; history.replaceState(null, '', 'reconciliation.html'); render();
  }

  // ================= Reconciliation report =================
  function reportRows(list) {
    return list.flatMap(i => i.rules.map(g => ({ item: i, dataset: i.title, code: M.codeOf(i.dataset), src: i.src, rule: g.rule, kind: g.rule.kind, sev: g.sev, records: g.records.length, open: g.records.filter(r => !r.fixed).length, fields: [...g.fields], sample: g.records[0].value, recurrence: g.recurrence, age: i.age })));
  }
  function renderReport(host, list) {
    const all = reportRows(list);
    const rows = all.filter(r => (reportFilter.src === 'all' || r.src === reportFilter.src) && (reportFilter.sev === 'all' || r.sev === reportFilter.sev) && (reportFilter.kind === 'all' || r.kind === reportFilter.kind) && (!reportFilter.q || (r.dataset + ' ' + r.rule.id + ' ' + r.rule.text + ' ' + r.fields.join(' ')).toLowerCase().includes(reportFilter.q)));
    const byKind = [...new Set(all.map(r => r.kind))].map(k => ({ k, n: all.filter(r => r.kind === k).reduce((n, r) => n + r.records, 0) })).sort((a, b) => b.n - a.n);
    const bySrc = ['returned_v', 'returned_q', 'draft'].map(s => ({ s, n: list.filter(i => i.src === s).reduce((n, i) => n + i.records.length, 0), d: list.filter(i => i.src === s).length })).filter(x => x.d);
    host.innerHTML = `
      <section class="report-block">
        <div class="rem-rollups">
          <div class="chart"><div class="chart__head"><h3 class="chart__title">${t('rem.rollSrc')}</h3></div><div class="rem-roll">${bySrc.map(x => `<div class="rem-roll__row"><span>${esc(srcLabel(x.s))}</span><b>${x.n}</b><small>${t('rem.datasetsN', { n: x.d })}</small></div>`).join('')}</div></div>
          <div class="chart"><div class="chart__head"><h3 class="chart__title">${t('rem.rollKind')}</h3><span class="chart__count">${t('rem.c.clickFilter')}</span></div><div class="rem-roll">${byKind.map(x => `<button type="button" class="rem-roll__row rem-roll__row--btn${reportFilter.kind === x.k ? ' is-on' : ''}" data-kind="${esc(x.k)}"><span><i class="legend__dot" style="background:${KIND_COLOUR[x.k]}"></i>${esc(kindLabel(x.k))}</span><b>${x.n}</b><small>${sevChip(SEV[x.k])}</small></button>`).join('')}</div></div>
          <div class="chart"><div class="chart__head"><h3 class="chart__title">${t('rem.rollTop')}</h3><span class="chart__count">${t('rem.c.clickHint')}</span></div><div class="rem-roll">${list.slice(0, 6).map(i => `<button type="button" class="rem-roll__row rem-roll__row--btn" data-open="${esc(i.sheet)}"><span>${esc(i.title)}</span><b>${i.open}</b><small>${t('rem.openOf', { n: i.records.length })}</small></button>`).join('')}</div></div>
        </div>
      </section>
      <section class="report-block">
        <div class="report-block__head">
          <h2 class="report-block__title">${t('rem.tab.report')} <span class="chip chip--outline">${rows.length}</span></h2>
          <div class="rem-filters">
            <select class="control control--select control--sm" id="rfSrc" aria-label="${t('recon.h.returnedBy')}"><option value="all">${t('rem.f.allSources')}</option><option value="returned_v"${reportFilter.src === 'returned_v' ? ' selected' : ''}>${t('recon.byValidation')}</option><option value="returned_q"${reportFilter.src === 'returned_q' ? ' selected' : ''}>${t('recon.byReview')}</option><option value="draft"${reportFilter.src === 'draft' ? ' selected' : ''}>${t('rem.src.draft')}</option></select>
            <select class="control control--select control--sm" id="rfSev" aria-label="${t('rem.h.severity')}"><option value="all">${t('rem.f.allSeverities')}</option><option value="error"${reportFilter.sev === 'error' ? ' selected' : ''}>${t('rem.sev.error')}</option><option value="warning"${reportFilter.sev === 'warning' ? ' selected' : ''}>${t('rem.sev.warning')}</option></select>
            <label class="search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="rfQ" value="${esc(reportFilter.q)}" placeholder="${t('common.search')}" aria-label="${t('common.search')}"></label>
          </div>
        </div>
        <div class="table-wrap"><table class="data-table data-table--fit"><thead><tr><th>${t('status.h.dataset')}</th><th>${t('rem.h.rule')}</th><th>${t('rem.h.severity')}</th><th class="num">${t('status.h.records')}</th><th>${t('rem.h.fields')}</th><th>${t('rem.h.sample')}</th><th>${t('recon.h.fix')}</th><th class="num">${t('rem.h.recurrence')}</th><th class="num">${t('rem.h.age')}</th><th>${t('rem.h.progress')}</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td><div class="cell-title cell-wrap"><button class="btn-text" type="button" data-open="${esc(r.item.sheet)}">${esc(r.dataset)}</button></div><div class="cell-sub">${esc(srcLabel(r.src))}</div></td>
            <td><div class="cell-title cell-wrap">${esc(r.rule.text)}</div><div class="cell-sub">${esc(r.rule.id)} · ${esc(kindLabel(r.kind))}</div></td><td>${sevChip(r.sev)}</td><td class="num">${r.records}</td><td class="mono cell-wrap">${r.fields.map(esc).join(', ') || '—'}</td><td class="mono">${esc(r.sample)}</td><td class="cell-wrap">${esc(r.rule.fix)}</td>
            <td class="num">${r.recurrence > 1 ? `<span class="late">${t('rem.periodsN', { n: r.recurrence })}</span>` : t('rem.new')}</td><td class="num">${r.age ? t('rem.daysN', { n: r.age }) : '—'}</td>
            <td><span class="rem-progress"><span style="width:${Math.round((r.records - r.open) / r.records * 100)}%"></span></span><span class="cell-sub">${t('rem.fixedOf', { a: r.records - r.open, b: r.records })}</span></td></tr>`).join('') || `<tr><td colspan="10"><div class="empty empty--inline"><div class="empty__title">${t('status.none')}</div></div></td></tr>`}
        </tbody></table></div>
      </section>`;
    host.addEventListener('click', e => {
      const o = e.target.closest('[data-open]'); if (o) { openDataset(o.dataset.open); return; }
      const k = e.target.closest('[data-kind]'); if (k) { reportFilter.kind = reportFilter.kind === k.dataset.kind ? 'all' : k.dataset.kind; render(); }
    });
    $('#rfSrc').addEventListener('change', e => { reportFilter.src = e.target.value; render(); });
    $('#rfSev').addEventListener('change', e => { reportFilter.sev = e.target.value; render(); });
    $('#rfQ').addEventListener('input', e => { reportFilter.q = e.target.value.trim().toLowerCase(); const v = e.target.value; render(); const q = $('#rfQ'); q.focus(); q.value = v; });
  }
  function openDataset(s) { sheet = s; view = 'work'; hideTip(); history.replaceState(null, '', 'reconciliation.html?sheet=' + encodeURIComponent(sheet)); render(); window.scrollTo({ top: 0 }); }
  function exportReport(list) {
    const per = M.period();
    const grid = [[t('status.h.dataset'), 'Code', t('recon.h.returnedBy'), 'Rule', t('rem.h.rule'), 'Kind', t('rem.h.severity'), t('status.h.records'), 'Open', t('rem.h.fields'), t('rem.h.sample'), t('recon.h.fix'), t('rem.h.recurrence'), t('rem.h.age')]];
    reportRows(list).forEach(r => grid.push([r.dataset, r.code, srcLabel(r.src), r.rule.id, r.rule.text, r.kind, r.sev, r.records, r.open, r.fields.join(' '), r.sample, r.rule.fix, r.recurrence, r.age]));
    U.download(`KHDA-reconciliation-report-${M.INSTITUTION.short}-${per.id}.csv`, U.csv(grid), 'text/csv');
    U.toast('success', t('rem.downloadReport'), t('rem.reportExported', { n: grid.length - 1, x: per.label }));
  }

  // ================= Analytics =================
  const tip = $('#vizTip');
  function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; moveTip(e); }
  function moveTip(e) { const z = parseFloat(document.body.style.zoom) || 1; tip.style.left = (e.clientX / z + 14) + 'px'; tip.style.top = (e.clientY / z + 14) + 'px'; }
  function hideTip() { if (tip) tip.hidden = true; }

  // horizontal bars with labels, values, an optional fixed overlay and an average line
  function hbars(rows, opts) {
    const max = Math.max(1, ...rows.map(r => r.v)); const W = opts.W || 640, LW = 220, BH = 26, GAP = 10, H = rows.length * (BH + GAP) + (opts.bench != null ? 20 : 0);
    const bw = W - LW - 60, bench = opts.bench != null ? LW + bw * opts.bench / max : null;
    return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">
      ${rows.map((r, i) => { const y = i * (BH + GAP), w = Math.max(2, bw * r.v / max); return `<g class="viz__bar" data-i="${i}" tabindex="0"><rect x="0" y="${y - 2}" width="${W}" height="${BH + 4}" fill="transparent"/><text x="${LW - 12}" y="${y + BH / 2 + 5}" text-anchor="end" class="viz__lbl">${esc(r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label)}</text><rect x="${LW}" y="${y}" width="${w}" height="${BH}" rx="6" fill="${r.colour || 'var(--primary)'}"/>${r.v2 ? `<rect x="${LW}" y="${y}" width="${Math.max(0, bw * r.v2 / max)}" height="${BH}" rx="6" fill="var(--success)"/>` : ''}<text x="${LW + w + 8}" y="${y + BH / 2 + 5}" class="viz__val">${esc(r.text || String(r.v))}</text></g>`; }).join('')}
      ${bench != null ? `<line x1="${bench}" x2="${bench}" y1="-4" y2="${H - 18}" stroke="var(--on-surface-muted)" stroke-dasharray="4 4"/><text x="${bench}" y="${H - 4}" text-anchor="middle" class="viz__lbl">${esc(opts.benchLabel)}</text>` : ''}
    </svg>`;
  }
  // donut with hover segments and a clickable legend
  function donut(parts, total, centre) {
    const R = 70, r = 46, cx = 90, cy = 90; let a = -Math.PI / 2;
    const segs = parts.map((p, i) => { const sweep = 2 * Math.PI * p.v / Math.max(1, total); const x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a), xi1 = cx + r * Math.cos(a), yi1 = cy + r * Math.sin(a); a += sweep - 0.0001; const x2 = cx + R * Math.cos(a), y2 = cy + R * Math.sin(a), xi2 = cx + r * Math.cos(a), yi2 = cy + r * Math.sin(a); a += 0.0001; const big = sweep > Math.PI ? 1 : 0; return p.v ? `<path class="viz__seg" data-i="${i}" tabindex="0" d="M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${big} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${xi2.toFixed(2)} ${yi2.toFixed(2)} A${r} ${r} 0 ${big} 0 ${xi1.toFixed(2)} ${yi1.toFixed(2)} Z" fill="${p.colour}"/>` : ''; }).join('');
    return `<div class="viz-donut"><svg class="viz viz--donut" viewBox="0 0 180 180" role="img" aria-label="${esc(centre.label)}">${segs || `<circle cx="90" cy="90" r="58" fill="none" stroke="var(--outline)" stroke-width="24"/>`}<text x="90" y="86" text-anchor="middle" class="viz__big">${esc(String(centre.value))}</text><text x="90" y="106" text-anchor="middle" class="viz__lbl">${esc(centre.label)}</text></svg>
      <div class="legend legend--wrap viz-legend">${parts.map((p, i) => `<button type="button" class="legend__item viz-legend__item" data-i="${i}"><span class="legend__dot" style="background:${p.colour}"></span><span class="legend__value">${p.v}</span><span class="legend__label">${esc(p.label)}</span></button>`).join('')}</div></div>`;
  }
  // stacked columns per period with a rate line
  function columns(cols, series, line, W) {
    W = W || 640; const H = 220, L = 44, B = 36, T = 20; const raw = Math.max(1, ...cols.map(c => series.reduce((n, s) => n + c[s.key], 0))), max = raw * 1.45; /* headroom: the rate line rides in its own band above the columns */ const cw = (W - L - 16) / cols.length, bw = Math.min(64, cw * 0.5);
    const y = v => T + (H - T - B) * (1 - v / max);
    const grid = [0, 0.5, 1].map(f => `<line x1="${L}" x2="${W - 8}" y1="${y(raw * f)}" y2="${y(raw * f)}" stroke="var(--outline)"/><text x="${L - 6}" y="${y(raw * f) + 4}" text-anchor="end" class="viz__lbl">${Math.round(raw * f)}</text>`).join('');
    const bars = cols.map((c, i) => { let acc = 0; const x = L + cw * i + (cw - bw) / 2; return `<g class="viz__col" data-i="${i}" tabindex="0"><rect x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T - B}" fill="transparent"/>${series.map(s => { const v = c[s.key]; const yTop = y(acc + v), h = y(acc) - yTop; acc += v; return v ? `<rect x="${x}" y="${yTop}" width="${bw}" height="${h}" fill="${s.colour}" rx="3"/>` : ''; }).join('')}<text x="${x + bw / 2}" y="${y(acc) - 6}" text-anchor="middle" class="viz__val">${acc}</text><text x="${x + bw / 2}" y="${H - 12}" text-anchor="middle" class="viz__lbl">${esc(c.label)}</text></g>`; }).join('');
    const lvals = cols.map(c => c[line.key]), lmax = Math.max(1, ...lvals), lmin = Math.min(...lvals), band = [T + 8, T + 30]; const pts = cols.map((c, i) => [L + cw * i + cw / 2, lmax === lmin ? (band[0] + band[1]) / 2 : band[1] - (band[1] - band[0]) * (c[line.key] - lmin) / (lmax - lmin)]);
    const path = `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${line.colour}" stroke-width="2" pointer-events="none"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${line.colour}" pointer-events="none"/><text x="${p[0]}" y="${p[1] - 8}" text-anchor="middle" class="viz__lbl" fill="${line.colour}" pointer-events="none">${cols[i][line.key]}%</text>`).join('')}`;
    return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img">${grid}${bars}${path}</svg>
      <div class="legend legend--wrap">${series.map(s => `<span class="legend__item"><span class="legend__dot" style="background:${s.colour}"></span><span class="legend__label">${esc(s.label)}</span></span>`).join('')}<span class="legend__item"><span class="legend__dot" style="background:${line.colour}"></span><span class="legend__label">${esc(line.label)}</span></span></div>`;
  }

  let analyticsMetric = 'records';
  function renderAnalytics(host, list) {
    const byDs = list.map(i => ({ label: i.title, v: analyticsMetric === 'records' ? i.records.length : i.rules.length, v2: analyticsMetric === 'records' ? i.fixed : 0, colour: i.src === 'draft' ? 'var(--info)' : i.src === 'returned_q' ? 'var(--warning)' : 'var(--error)', sheet: i.sheet, item: i })).sort((a, b) => b.v - a.v);
    const avg = byDs.length ? Math.round(byDs.reduce((n, r) => n + r.v, 0) / byDs.length * 10) / 10 : 0;
    const kinds = {}; list.forEach(i => i.records.forEach(r => { kinds[r.rule.kind] = (kinds[r.rule.kind] || 0) + 1; }));
    const kindParts = Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: kindLabel(k), v, colour: KIND_COLOUR[k], kind: k }));
    const totalRec = list.reduce((n, i) => n + i.records.length, 0);
    const trend = M.PERIODS.map(p => { const sm = M.summary(p); const subs = sm.all.filter(M.RETURNED); return { label: p.label, v: subs.filter(s => s.status === 'returned_v').reduce((n, s) => n + s.returnedCount, 0), q: subs.filter(s => s.status === 'returned_q').reduce((n, s) => n + s.returnedCount, 0), rate: sm.rows ? Math.round(sm.returnedRows / sm.rows * 1000) / 10 : 0, datasets: subs.length, period: p }; });
    const sev = { error: list.reduce((n, i) => n + i.records.filter(r => r.sev === 'error' && !r.fixed).length, 0), warning: list.reduce((n, i) => n + i.records.filter(r => r.sev === 'warning' && !r.fixed).length, 0) };
    const fixedN = list.reduce((n, i) => n + i.fixed, 0);
    const sevParts = [{ label: t('rem.sev.error'), v: sev.error, colour: 'var(--error)' }, { label: t('rem.sev.warning'), v: sev.warning, colour: 'var(--warning)' }, { label: t('recon.f.fixed'), v: fixedN, colour: 'var(--success)' }];
    const recurring = list.flatMap(i => i.rules.filter(g => g.recurrence > 1).map(g => ({ label: i.title + ' · ' + g.rule.id, v: g.recurrence, text: t('rem.periodsN', { n: g.recurrence }), colour: 'var(--primary)', sheet: i.sheet, rule: g.rule }))).sort((a, b) => b.v - a.v).slice(0, 6);

    host.innerHTML = `<section class="report-block"><div class="chart-grid">
      <div class="chart chart--wide"><div class="chart__head"><h3 class="chart__title">${t('rem.c.byDataset')}</h3><span class="chart__count">${t('rem.c.clickHint')}</span><div class="segmented segmented--pill" role="group" id="vzMetric"><button type="button" data-m="records" aria-pressed="${analyticsMetric === 'records'}">${t('status.h.records')}</button><button type="button" data-m="rules" aria-pressed="${analyticsMetric === 'rules'}">${t('rem.h.rules')}</button></div></div>
        <div class="viz-body" id="vzDs"></div>
        <div class="legend legend--wrap"><span class="legend__item"><span class="legend__dot" style="background:var(--error)"></span><span class="legend__label">${t('recon.byValidation')}</span></span><span class="legend__item"><span class="legend__dot" style="background:var(--warning)"></span><span class="legend__label">${t('recon.byReview')}</span></span><span class="legend__item"><span class="legend__dot" style="background:var(--info)"></span><span class="legend__label">${t('rem.src.draft')}</span></span>${analyticsMetric === 'records' ? `<span class="legend__item"><span class="legend__dot" style="background:var(--success)"></span><span class="legend__label">${t('recon.f.fixed')}</span></span>` : ''}</div></div>
      <div class="chart"><div class="chart__head"><h3 class="chart__title">${t('rem.c.byKind')}</h3><span class="chart__count">${t('rem.c.legendHint')}</span></div><div class="viz-body" id="vzKind">${donut(kindParts, totalRec, { value: totalRec, label: t('rem.c.recordsLabel') })}</div></div>
      <div class="chart"><div class="chart__head"><h3 class="chart__title">${t('rem.c.severity')}</h3></div><div class="viz-body" id="vzSev">${donut(sevParts, sev.error + sev.warning + fixedN, { value: totalRec ? Math.round(fixedN / totalRec * 100) + '%' : '0%', label: t('recon.f.fixed') })}</div></div>
      <div class="chart chart--wide"><div class="chart__head"><h3 class="chart__title">${t('rem.c.trend')}</h3><span class="chart__count">${t('rem.c.trendHint')}</span></div><div class="viz-body" id="vzTrend"></div></div>
      ${recurring.length ? `<div class="chart chart--wide"><div class="chart__head"><h3 class="chart__title">${t('rem.c.recurring')}</h3><span class="chart__count">${t('rem.c.recurringHint')}</span></div><div class="viz-body" id="vzRec"></div></div>` : ''}
    </div></section>`;

    // the wide charts are drawn at the card's real width so bars and labels stay at design size
    const w = id => { const el = $(id); return el ? Math.max(480, Math.round(el.clientWidth)) : 640; };
    $('#vzDs').innerHTML = hbars(byDs, { label: t('rem.c.byDataset'), bench: avg, benchLabel: t('rem.c.avg', { n: avg }), W: w('#vzDs') });
    $('#vzTrend').innerHTML = columns(trend, [{ key: 'v', label: t('recon.byValidation'), colour: 'var(--error)' }, { key: 'q', label: t('recon.byReview'), colour: 'var(--warning)' }], { key: 'rate', label: t('rem.c.rate'), colour: 'var(--info)' }, w('#vzTrend'));
    if ($('#vzRec')) $('#vzRec').innerHTML = hbars(recurring, { label: t('rem.c.recurring'), W: w('#vzRec') });

    // ---- interactions: tooltips, drill-down, metric toggle ----
    const bind = (id, rows, html, onClick) => { const el = $(id); if (!el) return; el.querySelectorAll('[data-i]').forEach(g => { const r = rows[+g.dataset.i]; g.addEventListener('mousemove', e => showTip(e, html(r))); g.addEventListener('mouseleave', hideTip); if (onClick) { g.classList.add('is-link'); g.addEventListener('click', () => onClick(r)); g.addEventListener('keydown', e => { if (e.key === 'Enter') onClick(r); }); } }); };
    bind('#vzDs', byDs, r => `<b>${esc(r.label)}</b><br>${esc(srcLabel(r.item.src))}<br>${r.item.records.length} ${t('rem.c.recordsLabel')} · ${t('rem.rulesN', { n: r.item.rules.length })} · ${r.item.fixed} ${t('recon.f.fixed').toLowerCase()}<br><span class="muted">${t('rem.c.clickOpen')}</span>`, r => openDataset(r.sheet));
    bind('#vzKind', kindParts, p => `<b>${esc(p.label)}</b><br>${p.v} ${t('rem.c.recordsLabel')} · ${Math.round(p.v / Math.max(1, totalRec) * 100)}%<br>${t(SEV[p.kind] === 'error' ? 'rem.sev.error' : 'rem.sev.warning')}<br><span class="muted">${t('rem.c.clickReport')}</span>`, p => { reportFilter = { src: 'all', sev: 'all', kind: p.kind, q: '' }; view = 'report'; hideTip(); render(); window.scrollTo({ top: 0 }); });
    bind('#vzSev', sevParts, p => `<b>${esc(p.label)}</b><br>${p.v} ${t('rem.c.recordsLabel')}`);
    bind('#vzTrend', trend, c => `<b>${esc(c.label)}</b><br>${t('recon.byValidation')}: ${c.v}<br>${t('recon.byReview')}: ${c.q}<br>${t('rem.datasetsN', { n: c.datasets })} · ${t('rem.c.rate')} ${c.rate}%<br><span class="muted">${t('rem.c.clickPeriod')}</span>`, c => { M.setPeriod(c.period.id); sheet = ''; hideTip(); render(); });
    bind('#vzRec', recurring, r => `<b>${esc(r.label)}</b><br>${esc(r.rule.text)}<br>${esc(r.text)}<br><span class="muted">${t('rem.c.clickOpen')}</span>`, r => openDataset(r.sheet));
    const vm = $('#vzMetric'); if (vm) vm.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { analyticsMetric = b.dataset.m; render(); } });
  }

  // ---------- wiring ----------
  $('#rmTabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; view = b.dataset.view; hideTip(); render(); });
  document.addEventListener('khda:refresh', render);
  document.addEventListener('scroll', hideTip, { passive: true });
  render();
})();
