/* Remediation report (plan D-8 / T-8) — per institution × dataset × period with roll-ups: failing rule, severity,
   rows, sample values, suggested fix, recurrence, owner, SLA age. KHDA IT sees the technical view (pipeline failures).
   Institutions see their own report; it feeds the remediation workbench. */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES, J = window.KHDA_JOURNEY;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const per = K.period();
  const params = new URLSearchParams(location.search);
  const role = R.role();
  let inst = role.team === 'inst' ? K.own() : (K.INSTITUTIONS.find(i => i.id === params.get('inst')) || null);
  let sheet = params.get('sheet') || '';
  let technical = role.team === 'it' || params.get('view') === 'technical';
  let severity = 'all', openKey = sheet ? (inst ? inst.id : '') + '|' + sheet : null;

  // technical failures for KHDA IT: derived from dispatched/in-validation submissions and API-channel institutions
  function techIssues(sub) {
    const r = K.hash(sub.inst.id + sub.dataset.sheet + 'tech') % 5;
    if (sub.status === 'dispatched') return [{ id: 'T-401', kind: 'auth', severity: 'Error', rule: 'Token validation failed at API Hub', rows: 1, sample: 'HTTP 401 · expired client secret', fix: 'Rotate the client secret; institution must reissue the token', recurring: r === 0 }];
    if (sub.status === 'in_validation' && r < 2) return [{ id: 'T-415', kind: 'schema', severity: 'Warning', rule: 'Payload schema differs from Dictionary 2026', rows: 1, sample: 'unknown field "Emp_Grade_Old"', fix: 'Regenerate the payload from the published schema version', recurring: false }];
    if (sub.status === 'needs_correction' && r === 3) return [{ id: 'T-500', kind: 'adapter', severity: 'Error', rule: 'Adapter persist retry exhausted', rows: 1, sample: 'corr-' + (K.hash(sub.dataset.sheet) % 0xfffff).toString(16), fix: 'Replay from the API Hub dead-letter queue', recurring: false }];
    return [];
  }

  function entries() {
    const insts = inst ? [inst] : K.INSTITUTIONS;
    const out = [];
    insts.forEach(i => K.subsOf(i, per).forEach(s => {
      if (sheet && s.dataset.sheet !== sheet) return;
      const issues = technical ? techIssues(s) : s.issues;
      if (!issues.length) return;
      const filtered = severity === 'all' ? issues : issues.filter(x => x.severity === severity);
      if (!filtered.length) return;
      out.push({ sub: s, issues: filtered, key: i.id + '|' + s.dataset.sheet, age: s.receivedAt ? K.daysBetween(K.TODAY, s.receivedAt) : 0 });
    }));
    return out.sort((a, b) => b.issues.reduce((n, x) => n + x.rows, 0) - a.issues.reduce((n, x) => n + x.rows, 0));
  }

  function render() {
    const list = entries();
    const rows = list.reduce((n, e) => n + e.issues.reduce((m, x) => m + x.rows, 0), 0);
    const ruleHits = {};
    list.forEach(e => e.issues.forEach(x => { ruleHits[x.id] = ruleHits[x.id] || { ...x, count: 0, rows: 0 }; ruleHits[x.id].count++; ruleHits[x.id].rows += x.rows; }));
    const top = Object.values(ruleHits).sort((a, b) => b.rows - a.rows).slice(0, 6);
    const scopeLabel = inst ? inst.name : 'Whole sector';
    $('#main').innerHTML = `
      <div class="page-head"><div><div class="page-head__eyebrow">${technical ? 'KHDA IT · Technical view' : role.team === 'inst' ? 'Institution · Remediation' : 'KHDA Data · Remediation'}</div><h1 class="page-head__title">Remediation report</h1><p class="page-head__sub">${esc(scopeLabel)}${sheet ? ' · ' + esc(K.titleOf(K.subsOf(K.INSTITUTIONS[0], per).find(s => s.dataset.sheet === sheet).dataset)) : ''} · ${esc(per.label)} — every failing ${technical ? 'pipeline stage' : 'rule'} with rows, sample values and a suggested fix.</p></div>
        <div class="page-head__actions">${role.team === 'inst' ? '' : `<select class="control control--sm" id="instPick" aria-label="Institution"><option value="">Whole sector</option>${K.INSTITUTIONS.map(i => `<option value="${i.id}"${inst && inst.id === i.id ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</select>`}
          <div class="segmented segmented--pill" role="group" id="viewSeg"><button type="button" data-tech="0" aria-pressed="${!technical}">Data rules</button><button type="button" data-tech="1" aria-pressed="${technical}">Technical</button></div>
          <button class="btn btn--outline" type="button" id="exportX">Export XLSX</button><button class="btn btn--outline" type="button" id="exportP">Export PDF</button>${role.team === 'data' ? `<button class="btn btn--primary" type="button" id="attach" data-tier="supervisor" ${inst ? '' : 'disabled'}>✉ Send with follow-up</button>` : ''}</div></div>
      <div class="kpi-grid">
        <div class="kpi kpi--primary"><div class="kpi__label">${technical ? 'Submissions with pipeline failures' : 'Dataset submissions needing correction'}</div><div class="kpi__value">${list.length}</div><div class="kpi__note">${inst ? 'for ' + esc(inst.short) : 'across ' + K.INSTITUTIONS.length + ' institutions'}</div></div>
        <div class="kpi kpi--error"><div class="kpi__label">${technical ? 'Failed calls' : 'Rows to fix'}</div><div class="kpi__value">${rows.toLocaleString()}</div><div class="kpi__note">${technical ? 'auth, schema and adapter failures' : 'rejected by validation in the Qlik DQ layer'}</div></div>
        <div class="kpi kpi--warning"><div class="kpi__label">Distinct rules hit</div><div class="kpi__value">${Object.keys(ruleHits).length}</div><div class="kpi__note">${top[0] ? 'Top: ' + esc(top[0].id) + ' · ' + top[0].rows.toLocaleString() + ' rows' : '—'}</div></div>
        <div class="kpi kpi--info"><div class="kpi__label">Recurring</div><div class="kpi__value">${list.filter(e => e.issues.some(x => x.recurring)).length}</div><div class="kpi__note">also failed in an earlier period</div></div>
      </div>
      <div class="grid-main-side">
        <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Findings</h2><p class="panel__sub">Grouped by submission; open one for its rules, rows and journey. Owner and SLA age drive the follow-up queue.</p></div>
          <div class="panel__tools"><div class="segmented segmented--pill" role="group" id="sevSeg"><button type="button" data-sev="all" aria-pressed="${severity === 'all'}">All</button><button type="button" data-sev="Error" aria-pressed="${severity === 'Error'}">Errors</button><button type="button" data-sev="Warning" aria-pressed="${severity === 'Warning'}">Warnings</button></div>${sheet ? `<a class="chip chip--outline" href="remediation.html${inst ? '?inst=' + inst.id : ''}">✕ Clear dataset filter</a>` : ''}</div></div>
          ${list.length ? `<div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Submission</th><th>Rules</th><th class="num">Rows</th><th>Owner · SLA</th><th></th></tr></thead><tbody>
            ${list.slice(0, 40).map(e => `<tr class="${openKey === e.key ? 'is-selected' : ''}"><td><div class="cell-title">${inst ? '' : esc(e.sub.inst.short) + ' · '}${esc(K.titleOf(e.sub.dataset))}</div><div class="cell-sub">v${e.sub.version} · ${esc(K.freshness(e.sub))}${e.issues.some(x => x.recurring) ? ' · <span class="cell-late">recurring</span>' : ''}</div></td>
              <td><div style="display:flex;gap:6px;flex-wrap:wrap">${e.issues.map(x => `<span class="chip ${x.severity === 'Error' ? 'chip--error' : 'chip--warning'}" title="${esc(x.rule)}">${esc(x.id)}</span>`).join('')}</div></td>
              <td class="num">${e.issues.reduce((n, x) => n + x.rows, 0).toLocaleString()}</td>
              <td><div class="cell-sub">${esc(e.sub.inst.liaison)}</div><div class="${e.age > 14 ? 'cell-late' : 'cell-muted'}">${e.age} d open</div></td>
              <td class="actions"><button class="icon-btn" type="button" data-open="${esc(e.key)}" aria-expanded="${openKey === e.key}" aria-label="Details"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button></td></tr>
              ${openKey === e.key ? `<tr><td colspan="5" style="padding:0;background:var(--surface-bright)"><div style="padding:16px 24px 8px" class="cell-title">Submission journey</div><div style="padding:0 24px">${J.render(e.sub, { fix: false })}</div><div style="padding:8px 24px" class="cell-title">Failing ${technical ? 'stages' : 'rules'}</div>
                ${e.issues.map(x => `<div class="issue"><div><div class="issue__id">${esc(x.id)}</div><span class="chip ${x.severity === 'Error' ? 'chip--error' : 'chip--warning'}">${x.severity}</span></div><div><div class="issue__rule">${esc(x.rule)}</div><div class="issue__fix">Fix: ${esc(x.fix)}${x.recurring ? ' · <span class="cell-late">recurring across periods</span>' : ''}</div></div><div class="issue__rows">${x.rows.toLocaleString()}<small>${technical ? 'calls' : 'rows'}</small></div><div><div class="cell-muted">Sample</div><code class="formula" style="padding:2px 8px">${esc(x.sample)}</code></div><div style="display:flex;flex-direction:column;gap:6px">${technical ? `<a class="btn btn--outline btn--sm" href="credentials.html?inst=${e.sub.inst.id}">Credentials →</a>` : `<a class="btn btn--outline btn--sm" href="rules.html?sheet=${encodeURIComponent(e.sub.dataset.sheet)}&rule=${esc(x.id)}">Rule →</a>`}${role.team === 'inst' ? `<a class="btn btn--primary btn--sm" href="index.html?sheet=${encodeURIComponent(e.sub.dataset.sheet)}&mode=form&fix=${esc(x.db)}">Fix in place →</a>` : ''}</div></div>`).join('')}
                <div style="display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap">${role.team === 'inst' ? `<a class="btn btn--primary btn--md" href="index.html?sheet=${encodeURIComponent(e.sub.dataset.sheet)}&mode=bulk" data-role="inst_admin,steward">Open workbench · resubmit as v${e.sub.version + 1}</a><button class="btn btn--outline btn--md" type="button" data-dl="${esc(e.key)}">Download error report</button>` : `<button class="btn btn--outline btn--md" type="button" data-tier="supervisor" data-return="${esc(e.key)}">Return with this report</button><a class="btn btn--outline btn--md" href="monitor.html?inst=${e.sub.inst.id}&sheet=${encodeURIComponent(e.sub.dataset.sheet)}">Open in monitor →</a>`}</div></td></tr>` : ''}`).join('')}
          </tbody></table></div>${list.length > 40 ? `<div class="panel__foot"><span>Showing 40 of ${list.length} — export for the full report.</span></div>` : ''}` : `<div class="empty empty--inline"><div class="empty__title">Nothing to remediate</div><div class="empty__text">No ${technical ? 'pipeline failures' : 'validation issues'} for this scope in ${esc(per.label)}.</div></div>`}
        </section>
        <div style="display:flex;flex-direction:column;gap:24px">
          <section class="panel"><div class="panel__head"><h2 class="panel__title">Top failing ${technical ? 'stages' : 'rules'}</h2></div>${top.map(x => `<div class="bar"><span class="bar__label" title="${esc(x.rule)}"><span class="mono">${esc(x.id)}</span> ${esc(x.rule)}</span><span class="bar__track"><span class="bar__fill${x.severity === 'Warning' ? ' bar__fill--3' : ''}" style="width:${x.rows / Math.max(1, top[0].rows) * 100}%"></span></span><span class="bar__value">${x.rows.toLocaleString()}<span class="bar__note">${x.count}×</span></span></div>`).join('') || '<div class="cell-muted">—</div>'}<a class="btn btn--text btn--sm" href="rules.html">Open the rule library →</a></section>
          <section class="panel"><div class="panel__head"><h2 class="panel__title">How this report is used</h2></div><ul class="spec-rules"><li>Institutions open it as the <strong>remediation workbench</strong> — fix in place, then resubmit as a new version.</li><li>KHDA Data <strong>attaches it to follow-up emails</strong> (Supervisor sends).</li><li>KHDA IT filters the same report to <strong>technical failures</strong> — auth, IP, schema, adapter.</li><li>Rule hit-rates feed the <strong>rule library</strong> and the DQ analytics.</li></ul></section>
        </div>
      </div>`;
    $('#main').removeAttribute('aria-busy');
    const pick = $('#instPick'); if (pick) pick.addEventListener('change', e => { inst = K.INSTITUTIONS.find(i => i.id === e.target.value) || null; openKey = null; render(); });
    $('#viewSeg').addEventListener('click', e => { const b = e.target.closest('[data-tech]'); if (b) { technical = b.dataset.tech === '1'; openKey = null; render(); } });
    $('#sevSeg').addEventListener('click', e => { const b = e.target.closest('[data-sev]'); if (b) { severity = b.dataset.sev; render(); } });
    $('#main').querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { openKey = openKey === b.dataset.open ? null : b.dataset.open; render(); }));
    $('#main').querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => window.khdaToast('success', 'Error report downloaded', 'errors-' + b.dataset.dl.split('|')[1].replace(/\W+/g, '_') + '.xlsx · one row per failing record')));
    $('#main').querySelectorAll('[data-return]').forEach(b => b.addEventListener('click', () => { if (!R.can('supervisor')) { window.khdaToast('error', 'Supervisor tier required', 'Returning a submission is a Supervisor decision.'); return; } window.khdaToast('success', 'Returned to institution', 'Report attached · logged in the audit trail'); }));
    $('#exportX').addEventListener('click', () => window.khdaToast('success', 'Exported', 'remediation-' + (inst ? inst.short : 'sector') + '-' + per.id + '.xlsx'));
    $('#exportP').addEventListener('click', () => window.khdaToast('success', 'Exported', 'remediation-' + (inst ? inst.short : 'sector') + '-' + per.id + '.pdf'));
    const at = $('#attach'); if (at) at.addEventListener('click', () => { if (!R.can('supervisor')) { window.khdaToast('error', 'Supervisor tier required', 'Sending is a Supervisor action; you can save a draft from the monitor.'); return; } location.href = 'monitor.html?inst=' + inst.id + '&email=1'; });
    R.gate();
  }
  render();
})();
