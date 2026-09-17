/* Monitor (plan D-2 + D-3) — sector KPI strip, Cards ⇄ Matrix (37 × 46 heat-map), and the institution
   monitor with dataset agenda, per-row submission journey and a working email composer (delivery log). */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES, J = window.KHDA_JOURNEY;
  const DATA = window.KHDA_DATASETS || [];
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const per = K.period();
  const sec = K.sector(per.id);
  const params = new URLSearchParams(location.search);
  let view = params.get('view') === 'matrix' ? 'matrix' : 'cards', q = '', sort = 'least', groupBy = 'wave', filterState = 'all';
  let inst = K.INSTITUTIONS.find(i => i.id === params.get('inst')) || null;
  let openSheet = params.get('sheet') || null;
  const LOG_KEY = 'khda.comms.v1';
  const log = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } };

  // ---------- sector list ----------
  function listInst() {
    let l = sec.institutions.slice();
    if (q) l = l.filter(s => (s.inst.name + s.inst.short + s.inst.location).toLowerCase().includes(q));
    if (filterState !== 'all') l = l.filter(s => s.state === filterState);
    l.sort((a, b) => sort === 'least' ? a.pct - b.pct : sort === 'most' ? b.pct - a.pct : a.inst.name.localeCompare(b.inst.name));
    return l;
  }
  const stateLabel = s => K.INST_STATE[s.state][0];
  function cards(l) {
    const groups = groupBy === 'wave' ? [1, 2, 3, 4].map(w => [w === 1 ? 'Pilot Wave 1' : 'Wave ' + w, l.filter(s => s.inst.wave === w)]) : groupBy === 'state' ? Object.keys(K.INST_STATE).map(k => [K.INST_STATE[k][0], l.filter(s => s.state === k)]) : [['All institutions', l]];
    return groups.filter(([, g]) => g.length).map(([name, g]) => `<div class="group-title">${esc(name)} <span class="count-badge">${g.length}</span></div><div class="inst-grid">${g.map(s => `<a class="inst-card" href="khda-monitor.html?inst=${s.inst.id}">
      <div style="display:flex;justify-content:space-between;gap:8px"><div><div class="inst-card__name">${esc(s.inst.short)}</div><div class="inst-card__loc">${esc(s.inst.location)}</div></div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></div>
      <div class="inst-card__pct">${s.pct}%<small>accepted · ${s.accepted} / ${s.required}</small></div><div class="mini-track" style="width:100%"><span style="width:${s.pct}%"></span></div>
      <div class="inst-card__row"><span><b style="font-weight:400;color:var(--on-surface)">${s.needsCorrection}</b> need correction</span><span><b style="font-weight:400;color:var(--on-surface)">${s.notSubmitted}</b> not submitted</span></div>
      <div class="inst-card__foot">${K.stateChip(s.state)}<span>${s.lastReceivedAt ? K.daysBetween(K.TODAY, s.lastReceivedAt) + 'd since last receipt' : 'no receipt this period'}</span></div></a>`).join('')}</div>`).join('');
  }
  function matrix(l) {
    const cols = DATA;
    const perDs = cols.map(d => l.filter(s => K.ACCEPTED(s.subs[DATA.indexOf(d)])).length);
    return `<div class="legend legend--wrap"><span class="legend__item"><i class="cell cell--accepted" style="cursor:default"></i><span class="legend__label">Accepted</span></span><span class="legend__item"><i class="cell cell--in_validation" style="cursor:default"></i><span class="legend__label">In pipeline</span></span><span class="legend__item"><i class="cell cell--needs_correction" style="cursor:default"></i><span class="legend__label">Needs correction</span></span><span class="legend__item"><i class="cell cell--draft" style="cursor:default"></i><span class="legend__label">Draft / awaiting approval</span></span><span class="legend__item"><i class="cell" style="cursor:default"></i><span class="legend__label">Not submitted</span></span><span class="legend__item"><i class="cell cell--waived" style="cursor:default"></i><span class="legend__label">Waived / n/a</span></span><span style="flex:1"></span><label class="cell-muted">Jump to dataset <select class="control control--sm" id="jump"><option value="">Choose a dataset</option>${cols.map((d, i) => `<option value="${i}">${esc(K.titleOf(d))}</option>`).join('')}</select></label></div>
    <div class="matrix-wrap"><table class="matrix"><thead><tr><th class="matrix__inst" style="height:auto">Institution</th>${cols.map((d, i) => `<th id="col-${i}"><span>${esc(K.titleOf(d))}</span></th>`).join('')}<th></th></tr></thead>
      <tbody>${l.map(s => `<tr><th class="matrix__inst"><a href="khda-monitor.html?inst=${s.inst.id}">${esc(s.inst.short)}</a><small>${esc(s.inst.waveLabel)} · ${stateLabel(s)}</small></th>${s.subs.map(x => `<td><button class="cell cell--${x.status}" type="button" data-cell="${s.inst.id}|${esc(x.dataset.sheet)}" title="${esc(s.inst.short)} · ${esc(K.titleOf(x.dataset))} · ${K.STATUS[x.status][0]} · ${esc(K.dueText(x))}" aria-label="${esc(s.inst.short)} ${esc(K.titleOf(x.dataset))}: ${K.STATUS[x.status][0]}"></button></td>`).join('')}<td class="matrix__pct">${s.pct}%<small>${s.accepted} / ${s.required}</small></td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Accepted · of ${l.length} shown</th>${perDs.map(n => `<td>${n}</td>`).join('')}<td class="matrix__pct" style="background:var(--surface-bright)">${Math.round(l.reduce((n, s) => n + s.accepted, 0) / Math.max(1, l.reduce((n, s) => n + s.required, 0)) * 100)}%</td></tr></tfoot></table></div>
    <p class="cell-muted">Hover a square for its status; click it to open that submission's journey. One square per institution × dataset (${l.length} × ${cols.length}). Scroll sideways if needed.</p>`;
  }

  function renderSector() {
    const l = listInst();
    $('#main').innerHTML = `
      <div class="page-head"><div><div class="page-head__eyebrow">KHDA Data · Monitor</div><h1 class="page-head__title">Institution monitor</h1><p class="page-head__sub">Every institution against every dataset · ${esc(per.label)}</p></div>
        </div>
      <div class="kpi-grid">
        <div class="kpi kpi--success"><div class="kpi__label">Accepted datasets</div><div class="kpi__value">${Math.round(sec.accepted / Math.max(1, sec.required) * 100)}%</div><div class="kpi__note">${sec.accepted.toLocaleString()} of ${sec.required.toLocaleString()} required across the sector</div></div>
        <div class="kpi kpi--primary"><div class="kpi__label">Needs correction</div><div class="kpi__value">${sec.needsCorrection}</div><div class="kpi__note">dataset submissions</div></div>
        <div class="kpi kpi--error"><div class="kpi__label">Rows to fix</div><div class="kpi__value">${sec.rowsRejected.toLocaleString()}</div><div class="kpi__note">awaiting correction</div></div>
        <div class="kpi kpi--info"><div class="kpi__label">Automated</div><div class="kpi__value">${sec.api}</div><div class="kpi__note">datasets received via API · ${Math.round(sec.api / Math.max(1, sec.received) * 100)}% of receipts</div></div>
        <div class="kpi kpi--warning"><div class="kpi__label">Needs follow-up</div><div class="kpi__value">${sec.needsFollowUp}</div><div class="kpi__note">of ${sec.total} institutions</div></div>
      </div>
      <section class="panel">
        <div class="filter-row"><div class="view-toggle" role="group" aria-label="View"><button type="button" data-view="cards" aria-pressed="${view === 'cards'}">▦ Cards</button><button type="button" data-view="matrix" aria-pressed="${view === 'matrix'}">▩ Matrix</button></div>
          <input class="control control--sm" id="q" placeholder="Find an institution…" aria-label="Find an institution" value="${esc(q)}" style="min-width:240px">
          <label class="cell-muted">Sort <select class="control control--sm" id="sort"><option value="least"${sort === 'least' ? ' selected' : ''}>Least progress first</option><option value="most"${sort === 'most' ? ' selected' : ''}>Most progress first</option><option value="az"${sort === 'az' ? ' selected' : ''}>A–Z</option></select></label>
          <label class="cell-muted">Status <select class="control control--sm" id="state"><option value="all">All</option>${Object.keys(K.INST_STATE).map(k => `<option value="${k}"${filterState === k ? ' selected' : ''}>${K.INST_STATE[k][0]}</option>`).join('')}</select></label>
          ${view === 'cards' ? `<label class="cell-muted">Group by <select class="control control--sm" id="group"><option value="wave"${groupBy === 'wave' ? ' selected' : ''}>Wave</option><option value="state"${groupBy === 'state' ? ' selected' : ''}>Status</option><option value="none"${groupBy === 'none' ? ' selected' : ''}>None</option></select></label>` : ''}
          <span style="flex:1"></span><span class="cell-muted">${l.length} of ${sec.total} institutions</span><a class="btn btn--outline btn--md" href="sector.html">Follow-up queue <span class="count-badge">${sec.needsFollowUp}</span></a><button class="btn btn--outline btn--md" type="button" id="exportView">Export ${view === 'matrix' ? 'matrix' : 'list'}</button></div>
        ${view === 'cards' ? cards(l) : matrix(l)}
      </section>`;
    $('#main').removeAttribute('aria-busy');
    $('#main').querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; history.replaceState(null, '', 'khda-monitor.html?view=' + view); renderSector(); }));
    $('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); renderSector(); const el = $('#q'); el.focus(); el.setSelectionRange(q.length, q.length); });
    $('#sort').addEventListener('change', e => { sort = e.target.value; renderSector(); });
    $('#state').addEventListener('change', e => { filterState = e.target.value; renderSector(); });
    const g = $('#group'); if (g) g.addEventListener('change', e => { groupBy = e.target.value; renderSector(); });
    const jump = $('#jump'); if (jump) jump.addEventListener('change', e => { const th = document.getElementById('col-' + e.target.value); if (th) th.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); });
    $('#main').querySelectorAll('[data-cell]').forEach(c => c.addEventListener('click', () => { const [id, sheet] = c.dataset.cell.split('|'); location.href = `khda-monitor.html?inst=${id}&sheet=${encodeURIComponent(sheet)}`; }));
    $('#exportView').addEventListener('click', () => window.khdaToast('success', 'Exported', (view === 'matrix' ? 'compliance-matrix' : 'institutions') + '-' + per.id + '.xlsx downloaded'));
  }

  // ---------- institution monitor ----------
  let agendaTab = 'all';
  function renderInst() {
    const sm = K.summary(inst, per);
    const subs = sm.subs.filter(K.REQUIRED);
    const agenda = subs.filter(s => agendaTab === 'all' ? true : agendaTab === 'overdue' ? (s.req.due && s.req.due < K.TODAY && !K.RECEIVED(s)) : agendaTab === 'correction' ? s.status === 'needs_correction' : agendaTab === 'upcoming' ? (s.req.due && s.req.due >= K.TODAY && !K.RECEIVED(s)) : s.req.realtime)
      .sort((a, b) => (a.req.due || 0) - (b.req.due || 0));
    const tp = K.hash(inst.id) % 6;
    const comms = log().filter(c => c.inst === inst.id);
    $('#main').innerHTML = `
      <div class="page-head"><div><div class="page-head__eyebrow">Institution monitor · ${esc(inst.waveLabel)}</div><h1 class="page-head__title">${esc(inst.name)}</h1><p class="page-head__sub">${esc(inst.location)} · Follow submissions and resolve outstanding work · ${esc(per.label)}</p></div>
        <div class="page-head__actions"><a class="btn btn--outline" href="khda-monitor.html">← All institutions</a><a class="btn btn--outline" href="khda-compliance.html?inst=${inst.id}">Compliance history</a><a class="btn btn--outline" href="remediation.html?inst=${inst.id}">Reconciliation report</a><button class="btn btn--primary" type="button" id="openEmail">✉ Send email</button></div></div>
      <div class="kpi-grid">
        <div class="kpi ${sm.compliant ? 'kpi--success' : 'kpi--error'}"><div class="kpi__label">Status</div><div class="kpi__value" style="font-size:28px;line-height:48px">${K.INST_STATE[sm.state][0]}</div><div class="kpi__note">${esc(sm.reason)}</div></div>
        <div class="kpi kpi--success"><div class="kpi__label">Accepted</div><div class="kpi__value">${sm.accepted} <small style="font-size:20px;color:var(--on-surface-muted)">/ ${sm.required}</small></div><div class="kpi__note">${sm.pct}% of required datasets</div></div>
        <div class="kpi kpi--primary"><div class="kpi__label">Needs correction</div><div class="kpi__value">${sm.needsCorrection}</div><div class="kpi__note">${sm.rowsRejected.toLocaleString()} rows · ${sm.openIssues} open rules</div></div>
        <div class="kpi kpi--warning"><div class="kpi__label">Overdue</div><div class="kpi__value">${sm.overdue}</div><div class="kpi__note">${sm.late} received late this period</div></div>
        <div class="kpi kpi--info"><div class="kpi__label">DQ score</div><div class="kpi__value">${sm.dq == null ? '—' : sm.dq + '%'}</div><div class="kpi__note">${sm.apiCount} of ${sm.received} receipts via API</div></div>
      </div>
      <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Onboarding journey</h2><p class="panel__sub">Owner ${esc(inst.owner)} · liaison ${esc(inst.liaison)} · complexity ${esc(inst.complexity)} · commitment ${esc(inst.commitment)}</p></div><a class="btn btn--outline btn--md" href="onboarding.html?inst=${inst.id}">Open onboarding board →</a></div>
        <div class="touchpoints">${['Kick-off', 'Data mapping', 'Credentials issued', 'Sandbox test', 'Go-live gate', 'Production'].map((n, i) => `<div class="tp ${i < tp ? 'tp--done' : i === tp ? 'tp--current' : ''}"><div class="tp__n">Touch point ${i + 1}</div><div class="tp__name">${n}</div><div class="tp__meta">${i < tp ? 'Done · ' + K.fmtDate(new Date(per.start.getTime() - (6 - i) * 21 * 86400000)) : i === tp ? 'In progress · owner ' + esc(inst.owner) : 'Planned · due ' + K.fmtDate(new Date(K.TODAY.getTime() + (i - tp) * 21 * 86400000))}</div></div>`).join('')}</div></section>
      <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Dataset agenda</h2><p class="panel__sub">Due dates from the requirement table; receipts with channel and timestamp; open a row for its journey.</p></div>
        <div class="tabs" id="agendaTabs">${[['all', 'All', subs.length], ['overdue', 'Overdue', sm.overdue], ['correction', 'Needs correction', sm.needsCorrection], ['upcoming', 'Upcoming', subs.filter(s => s.req.due && s.req.due >= K.TODAY && !K.RECEIVED(s)).length], ['realtime', 'Real-time', subs.filter(s => s.req.realtime).length]].map(([k, l, n]) => `<button type="button" role="tab" aria-selected="${agendaTab === k}" data-agenda="${k}">${l} <span class="count-badge">${n}</span></button>`).join('')}</div></div>
        <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Dataset</th><th>Due date</th><th>Last submission</th><th>Submission status</th><th>Next step</th><th></th></tr></thead><tbody>
          ${agenda.map(s => `<tr class="${openSheet === s.dataset.sheet ? 'is-selected' : ''}"><td><div class="cell-title">${esc(K.titleOf(s.dataset))}</div><div class="cell-code">${s.channel === 'api' ? '🔌' : '✓'} ${esc(K.codeOf(s.dataset))} · ${esc(K.frequencyOf(s.dataset))}</div></td>
            <td><div>${K.fmtDate(s.req.due)}</div><div class="${/overdue|late/.test(K.dueText(s)) ? 'cell-late' : 'cell-muted'}">${esc(K.dueText(s))}</div></td>
            <td>${s.receivedAt ? `<div>${esc(K.fmtDateTime(s.receivedAt))}</div><div class="cell-muted">${s.channel === 'api' ? 'API' : 'Portal'} submission · v${s.version}</div>` : '<div class="cell-muted">No receipt</div>'}</td>
            <td>${K.chip(s.status)}</td>
            <td>${s.status === 'needs_correction' ? `<a class="btn btn--outline btn--sm" href="remediation.html?inst=${inst.id}&sheet=${encodeURIComponent(s.dataset.sheet)}">Reconciliation →</a>` : s.status === 'in_validation' || s.status === 'dispatched' ? '<span class="cell-muted">In pipeline</span>' : s.status === 'accepted' || s.status === 'late_accepted' ? (R.can('supervisor') ? '<span class="cell-muted">Accepted</span>' : '<span class="cell-muted">Accepted</span>') : s.status === 'awaiting_approval' ? '<span class="cell-muted">With institution Approver</span>' : '<span class="cell-muted">Awaiting submission</span>'}</td>
            <td class="actions"><button class="icon-btn" type="button" data-journey="${esc(s.dataset.sheet)}" aria-expanded="${openSheet === s.dataset.sheet}" aria-label="Journey"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button></td></tr>
            ${openSheet === s.dataset.sheet ? `<tr><td colspan="6" style="padding:8px 24px 20px;background:var(--surface-bright)"><div class="cell-title" style="margin-bottom:8px">Submission journey · ${esc(K.titleOf(s.dataset))} · v${s.version}</div>${J.render(s)}${s.status === 'needs_correction' || s.status === 'in_validation' ? `<div style="display:flex;gap:12px;margin-top:12px"><button class="btn btn--outline btn--md" type="button" data-tier="supervisor" data-accept="${esc(s.dataset.sheet)}">Accept with note</button><button class="btn btn--outline btn--md" type="button" data-tier="supervisor" data-return="${esc(s.dataset.sheet)}">Return to institution</button><button class="btn btn--outline btn--md" type="button" data-tier="supervisor" data-waive="${esc(s.dataset.sheet)}">Waive requirement</button></div>` : ''}</td></tr>` : ''}`).join('')}
        </tbody></table></div>
        ${agenda.length ? '' : '<div class="empty empty--inline"><div class="empty__title">Nothing in this view</div></div>'}
      </section>
      <div class="grid-2">
        <section class="panel"><div class="panel__head"><h2 class="panel__title">Communications</h2><span class="tier-chip">${comms.length} sent</span></div>${comms.length ? comms.slice().reverse().slice(0, 6).map(c => `<div class="receipt"><span class="receipt__v" style="font-size:16px">${esc(c.at)}</span><div><div class="cell-title">${esc(c.subject)}</div><div class="receipt__text">To ${esc(c.to)} · by ${esc(c.by)} · ${c.attach ? 'reconciliation report attached' : 'no attachment'}</div></div>${K.chip('accepted').replace('Accepted', 'Delivered')}</div>`).join('') : '<div class="empty empty--inline"><div class="empty__title">No emails sent yet</div><div class="empty__text">Every send is logged here with who sent it and what was attached.</div></div>'}</section>
        <section class="panel"><div class="panel__head"><h2 class="panel__title">Upcoming semesters</h2></div>${K.PERIODS.slice(-2).map((p, i) => `<div class="receipt"><span class="receipt__v" style="font-size:16px">${p.current ? '<span class="chip chip--complete">Current</span>' : '<span class="chip chip--neutral">Next</span>'}</span><div><div class="cell-title">${esc(p.label)}</div><div class="receipt__text">${i === 0 ? sm.notSubmitted + ' datasets outstanding in the catalogue' : 'Requirement table opens 1 Jan 2027 · due dates published 30 days ahead'}</div></div></div>`).join('')}<div class="receipt"><span class="receipt__v" style="font-size:16px"><span class="chip chip--neutral">Next</span></span><div><div class="cell-title">Winter · 2026–2027</div><div class="receipt__text">Requirement table opens 1 Jan 2027 · due dates published 30 days ahead</div></div></div></section>
      </div>
      <div class="modal-backdrop sheet-backdrop" id="emailModal" hidden></div>`;
    $('#main').removeAttribute('aria-busy');
    $('#agendaTabs').addEventListener('click', e => { const b = e.target.closest('[data-agenda]'); if (b) { agendaTab = b.dataset.agenda; renderInst(); } });
    $('#main').querySelectorAll('[data-journey]').forEach(b => b.addEventListener('click', () => { openSheet = openSheet === b.dataset.journey ? null : b.dataset.journey; renderInst(); }));
    $('#main').querySelectorAll('[data-accept],[data-return],[data-waive]').forEach(b => b.addEventListener('click', () => {
      if (!R.can('supervisor')) { window.khdaToast('error', 'KHDA staff only', 'Acceptance decisions and waivers are made by a Supervisor or Administrator.'); return; }
      window.khdaToast('success', b.dataset.accept ? 'Accepted with note' : b.dataset.return ? 'Returned to institution' : 'Requirement waived', 'Recorded in the audit log · ' + R.role().name);
    }));
    $('#openEmail').addEventListener('click', openEmail);
    R.gate();
    if (params.get('email')) { params.delete('email'); openEmail(); }
    if (openSheet) { const r = $('#main .is-selected'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  function openEmail() {
    const sm = K.summary(inst, per);
    const bulk = Number(params.get('bulk') || 0);
    const prio = sm.subs.filter(s => K.REQUIRED(s) && (s.status === 'needs_correction' || (s.req.due && s.req.due < K.TODAY && !K.RECEIVED(s)))).slice(0, 5);
    const subject = `Data submission follow-up | ${inst.short} | ${per.label}`;
    const m = $('#emailModal');
    m.innerHTML = `<aside class="sheet sheet--wide" role="dialog" aria-modal="true" aria-labelledby="emailTitle"><div class="sheet__body">
      <div class="sheet__head"><div style="flex:1"><h3 class="sheet__title" id="emailTitle" style="font-size:32px;line-height:40px">Send email</h3><p class="sheet__sub">${bulk ? `Bulk send to ${bulk} institutions — this preview shows ${esc(inst.short)}` : esc(inst.name)}</p></div><button class="icon-btn sheet__close" type="button" id="emailClose" aria-label="Close"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <div class="field-row"><label for="emTo">To</label><input class="control" id="emTo" value="${esc(inst.liaison.toLowerCase().replace(/ /g, '.'))}@${esc(inst.short.toLowerCase().replace(/[^a-z]/g, ''))}.ac.ae"></div>
      <div class="field-row"><label for="emCc">CC</label><input class="control" id="emCc" value="${esc(inst.owner.toLowerCase().replace(/ /g, '.'))}@khda.gov.ae"></div>
      <div class="field-row"><label for="emSub">Subject</label><input class="control" id="emSub" value="${esc(subject)}"></div>
      <div class="field-row"><label for="emTpl">Template</label><select class="control control--select" id="emTpl"><option>Follow-up · outstanding submissions</option><option>Reminder · due in 7 days</option><option>Return · needs correction</option><option>Confirmation · accepted</option></select></div>
      <div class="field-row"><label>Attach</label><label style="display:flex;gap:8px;align-items:center;font:400 16px/24px var(--font)"><input type="checkbox" id="emAttach" checked> Reconciliation report (${sm.needsCorrection} datasets · ${sm.rowsRejected.toLocaleString()} rows) as XLSX</label></div>
      <div class="segmented segmented--pill" role="group" id="emMode"><button type="button" data-mode="preview" aria-pressed="true">👁 Preview</button><button type="button" data-mode="edit" aria-pressed="false">✎ Edit message</button></div>
      <div id="emPreview" class="email"><div class="email__brand"><b>KHDA</b><span>Knowledge and Human<br>Development Authority</span></div><div class="email__body">
        <div class="page-head__eyebrow" style="margin:0">${esc(per.label)}</div><h3>Data submission follow-up</h3><p>Dear ${esc(inst.short)} team,</p><p>We are following up on your institution's data submissions. Please review the summary and the priority items below; the attached reconciliation report lists every failing rule with a suggested fix.</p>
        <div class="email__kpis"><div><b>${sm.notSubmitted}</b><span>Not submitted</span></div><div><b>${sm.needsCorrection}</b><span>Need correction</span></div><div><b>${sm.processing}</b><span>Processing</span></div></div><p class="cell-muted">${sm.accepted} of ${sm.required} required datasets accepted.</p>
        <div class="cell-title">Priority datasets</div><table class="data-table data-table--compact data-table--plain"><thead><tr><th>Dataset</th><th>Status</th><th>Due date</th></tr></thead><tbody>${prio.map(s => `<tr><td>${esc(K.titleOf(s.dataset))}</td><td>${K.chip(s.status)}</td><td>${K.fmtDate(s.req.due)}<div class="cell-late">${esc(K.dueText(s))}</div></td></tr>`).join('')}</tbody></table>
        <p>Kind regards,<br>${esc(R.role().name)} · KHDA Data</p></div></div>
      <textarea id="emEdit" class="control control--area" hidden>Dear ${esc(inst.short)} team,\n\nWe are following up on your institution's data submissions for ${per.label}: ${sm.notSubmitted} not submitted, ${sm.needsCorrection} need correction, ${sm.processing} processing. ${sm.accepted} of ${sm.required} required datasets are accepted.\n\nPriority datasets:\n${prio.map(s => `- ${K.titleOf(s.dataset)} — ${K.STATUS[s.status][0]} — due ${K.fmtDate(s.req.due)} (${K.dueText(s)})`).join('\n')}\n\nKind regards,\n${R.role().name} · KHDA Data</textarea>
    </div><div class="sheet__actions"><span class="email__log">${R.can('supervisor') ? 'Sending is logged with sender, recipients and attachments.' : 'Drafts save; sending requires Supervisor tier.'}</span><div class="sheet__actions-right"><button class="btn btn--outline" type="button" id="emDraft">Save draft</button><button class="btn btn--primary" type="button" id="emSend" data-tier="supervisor">Send${bulk ? ' to ' + bulk : ''}</button></div></div></aside>`;
    m.hidden = false; document.body.classList.add('is-sheeting');
    const close = () => { m.hidden = true; document.body.classList.remove('is-sheeting'); };
    $('#emailClose').addEventListener('click', close);
    m.addEventListener('mousedown', e => { if (e.target === m) close(); });
    $('#emMode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; $('#emMode').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#emPreview').hidden = b.dataset.mode === 'edit'; $('#emEdit').hidden = b.dataset.mode !== 'edit'; });
    $('#emDraft').addEventListener('click', () => { window.khdaToast('info', 'Draft saved', subject); close(); });
    $('#emSend').addEventListener('click', () => {
      if (!R.can('supervisor')) { window.khdaToast('error', 'KHDA staff only', 'Ask a Supervisor to send, or save as draft.'); return; }
      const entry = { inst: inst.id, to: $('#emTo').value, subject: $('#emSub').value, by: R.role().name, attach: $('#emAttach').checked, at: K.fmtDate(K.TODAY) };
      const l = log(); if (bulk) { K.INSTITUTIONS.slice(0, bulk).forEach(i => l.push({ ...entry, inst: i.id })); } else l.push(entry);
      try { localStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch { /* ignore */ }
      window.khdaToast('success', bulk ? `Sent to ${bulk} institutions` : 'Email sent', 'Delivery logged · ' + entry.to);
      close(); renderInst();
    });
    R.gate(m);
  }

  if (inst) renderInst(); else renderSector();
})();
