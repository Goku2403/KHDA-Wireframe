/* KHDA Data · Sector home (plan D-1) — KPI tiles, sector gauge, follow-up queue with reason codes and SLA age,
   onboarding overview by wave. KHDA-only actions (bulk send) are gated for institutions, not hidden. */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const per = K.period();
  const sec = K.sector(per.id);
  let tab = 'follow', wave = 0, q = '', selected = new Set();

  function gauge() {
    const total = sec.required, parts = [['accepted', sec.accepted, 'var(--success)'], ['processing', sec.processing, '#E0A800'], ['needs', sec.needsCorrection, 'var(--primary)'], ['none', sec.notSubmitted, 'var(--surface-dim)']];
    let a = Math.PI; const R0 = 100, cx = 120, cy = 120;
    const arcs = parts.map(([k, n, c]) => { const sweep = Math.PI * n / Math.max(1, total); const x1 = cx + R0 * Math.cos(a), y1 = cy + R0 * Math.sin(a); a += sweep; const x2 = cx + R0 * Math.cos(a), y2 = cy + R0 * Math.sin(a); return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${R0} ${R0} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${c}"/>`; }).join('');
    return `<div class="gauge"><svg viewBox="0 0 240 140" role="img" aria-label="${sec.received} of ${total} datasets received"><g fill="none" stroke-linecap="butt" stroke-width="18">${arcs}</g></svg><div class="gauge__value"><span class="gauge__number">${sec.received.toLocaleString()}</span><span class="gauge__caption">/ ${total.toLocaleString()} datasets received</span></div></div>
      <div class="legend legend--wrap"><span class="legend__item"><i class="legend__dot" style="background:var(--success)"></i><span class="legend__value">${sec.accepted}</span><span class="legend__label">Accepted</span></span><span class="legend__item"><i class="legend__dot" style="background:#E0A800"></i><span class="legend__value">${sec.processing}</span><span class="legend__label">Processing</span></span><span class="legend__item"><i class="legend__dot" style="background:var(--primary)"></i><span class="legend__value">${sec.needsCorrection}</span><span class="legend__label">Needs correction</span></span><span class="legend__item"><i class="legend__dot" style="background:var(--outline-variant)"></i><span class="legend__value">${sec.notSubmitted}</span><span class="legend__label">Not submitted</span></span></div>`;
  }

  function rows() {
    let list = sec.institutions.slice();
    if (tab === 'follow') list = list.filter(s => !s.compliant); else if (tab === 'compliant') list = list.filter(s => s.compliant);
    if (q) list = list.filter(s => (s.inst.name + s.inst.short + s.inst.owner + s.inst.liaison).toLowerCase().includes(q));
    return list.sort((a, b) => (b.overdue + b.needsCorrection) - (a.overdue + a.needsCorrection));
  }
  const slaAge = s => { const d = s.lastReceivedAt ? K.daysBetween(K.TODAY, s.lastReceivedAt) : 30; return d > 14 ? `<span class="cell-late">${d} d without update</span>` : `<span class="cell-muted">${d === 0 ? 'updated today' : d + ' d since update'}</span>`; };

  function render() {
    const list = rows();
    const waves = [0, 1, 2, 3, 4];
    const onb = K.INSTITUTIONS.filter(i => !wave || i.wave === wave).map(i => ({ i, s: sec.institutions.find(x => x.inst.id === i.id) }));
    $('#main').innerHTML = `
      <div class="page-head"><div><div class="page-head__eyebrow">KHDA Data · ${esc(R.role().label)}</div><h1 class="page-head__title">Sector overview</h1><p class="page-head__sub">Submission progress and follow-up priorities · ${esc(per.label)}</p></div>
        </div>
      <div class="kpi-grid">
        <a class="kpi kpi--info" href="khda-monitor.html"><div class="kpi__label">Total HEIs</div><div class="kpi__value">${sec.total}</div><div class="kpi__note">Institutions in scope · 4 onboarding waves</div><span class="kpi__link">Open monitor →</span></a>
        <button class="kpi kpi--success${tab === 'compliant' ? ' is-selected' : ''}" type="button" data-tab="compliant" style="text-align:left;cursor:pointer"><div class="kpi__label">Compliant</div><div class="kpi__value">${sec.compliant}</div><div class="kpi__note">No overdue work or open corrections</div><span class="kpi__link">Show →</span></button>
        <button class="kpi kpi--error${tab === 'follow' ? ' is-selected' : ''}" type="button" data-tab="follow" style="text-align:left;cursor:pointer"><div class="kpi__label">Needs follow-up</div><div class="kpi__value">${sec.needsFollowUp}</div><div class="kpi__note">Missing submissions, corrections or blockers · ${sec.atRisk} at risk</div><span class="kpi__link">Show →</span></button>
        <a class="kpi kpi--primary" href="remediation.html"><div class="kpi__label">Rows to fix</div><div class="kpi__value">${sec.rowsRejected.toLocaleString()}</div><div class="kpi__note">Across ${sec.needsCorrection} dataset submissions needing correction</div><span class="kpi__link">Reconciliation report →</span></a>
      </div>
      <div class="grid-main-side">
        <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Entity submissions</h2><p class="panel__sub">See who needs follow-up and open their dataset agenda. Reason codes come from the requirement table; SLA age from the last receipt.</p></div>
          <div class="panel__tools"><div class="segmented segmented--pill" role="group" id="tabs"><button type="button" data-tab="follow" aria-pressed="${tab === 'follow'}">Needs follow-up <span class="count-badge">${sec.needsFollowUp}</span></button><button type="button" data-tab="compliant" aria-pressed="${tab === 'compliant'}">Compliant <span class="count-badge">${sec.compliant}</span></button><button type="button" data-tab="all" aria-pressed="${tab === 'all'}">All entities</button></div><input class="control control--sm" id="q" placeholder="Find an entity or owner…" aria-label="Find an entity or owner" value="${esc(q)}"></div></div>
          <div class="filter-row"><label class="checkbox" style="display:inline-flex;gap:8px;align-items:center;font:400 14px/20px var(--font)"><input type="checkbox" id="selAll"${selected.size && selected.size === list.length ? ' checked' : ''}> Select all ${list.length} shown</label><span class="cell-muted">${selected.size ? selected.size + ' selected' : 'Select institutions to email'}</span><span style="flex:1"></span><button class="btn btn--outline btn--md" type="button" id="bulkSend" data-tier="supervisor" ${selected.size ? '' : 'disabled'}>✉ Bulk send (${selected.size})</button><button class="btn btn--outline btn--md" type="button" id="exportQueue">Export queue</button></div>
          <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th></th><th>Entity</th><th>Outstanding</th><th>DQ score</th><th>Submissions missed</th><th>Contact &amp; next step</th></tr></thead><tbody>
            ${list.map(s => `<tr><td><input type="checkbox" data-sel="${s.inst.id}" aria-label="Select ${esc(s.inst.short)}"${selected.has(s.inst.id) ? ' checked' : ''}></td>
              <td><div class="cell-title"><a href="khda-monitor.html?inst=${s.inst.id}">${esc(s.inst.name)}</a></div><div class="cell-sub" style="display:flex;gap:8px;align-items:center;margin-top:4px">${K.stateChip(s.state)}<span>${esc(s.reason)}</span></div><div class="cell-sub">${esc(s.inst.waveLabel)} · ${slaAge(s)}</div></td>
              <td><div>${s.required - s.accepted} <span class="cell-muted">/ ${s.required}</span></div><div class="cell-sub">${s.notSubmitted} not submitted · ${s.needsCorrection} need correction</div></td>
              <td><div>${s.dq == null ? '—' : s.dq + '%'}</div><div class="cell-sub">${s.rowsRejected ? s.rowsRejected.toLocaleString() + ' rows rejected' : 'Row validation'}</div></td>
              <td><div>${s.overdue ? Math.round(s.overdue / Math.max(1, s.subs.filter(x => K.REQUIRED(x) && x.req.due && x.req.due < K.TODAY).length) * 100) + '%' : '0%'}</div><div class="cell-sub">${s.overdue} of ${s.subs.filter(x => K.REQUIRED(x) && x.req.due && x.req.due < K.TODAY).length} past-due datasets</div></td>
              <td><div class="cell-sub">👤 ${esc(s.inst.liaison)} · Owner: ${esc(s.inst.owner)}</div><div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap"><a class="btn btn--outline btn--sm" href="khda-monitor.html?inst=${s.inst.id}">View datasets →</a><a class="btn btn--outline btn--sm" href="khda-monitor.html?inst=${s.inst.id}&email=1">✉ Send email</a><a class="btn btn--text btn--sm" href="khda-compliance.html?inst=${s.inst.id}">⟲ History</a></div></td></tr>`).join('')}
          </tbody></table></div>
          ${list.length ? '' : '<div class="empty empty--inline"><div class="empty__title">No entities match</div></div>'}
        </section>
        <div style="display:flex;flex-direction:column;gap:24px">
          <section class="panel"><div class="panel__head"><h2 class="panel__title">Submission progress</h2><span class="tier-chip">${Math.round(sec.received / Math.max(1, sec.required) * 100)}% received</span></div>${gauge()}<p class="cell-muted">${sec.accepted.toLocaleString()} accepted of ${sec.required.toLocaleString()} required datasets across ${sec.total} entities. Denominator excludes waived and not-applicable datasets.</p></section>
          <section class="panel"><h2 class="panel__title">Follow-up queue · SLA</h2>${sec.institutions.filter(s => !s.compliant).sort((a, b) => (b.lastReceivedAt ? 0 : 1) - (a.lastReceivedAt ? 0 : 1) || (a.lastReceivedAt || 0) - (b.lastReceivedAt || 0)).slice(0, 5).map(s => `<div class="next-move"><span class="next-move__n">!</span><div><div class="next-move__title"><a href="khda-monitor.html?inst=${s.inst.id}">${esc(s.inst.short)}</a> · ${esc(s.reason)}</div><div class="next-move__text">${slaAge(s)} · escalate to Supervisor after 14 days</div></div></div>`).join('')}</section>
        </div>
      </div>
      <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Onboarding overview</h2><p class="panel__sub">Groups, owners, commitments and blockers — waves are managed objects, not a PDF. <a href="onboarding.html">Open the onboarding board →</a></p></div>
        <div class="panel__tools">${waves.map(w => `<button class="chip-toggle" type="button" data-wave="${w}" aria-pressed="${wave === w}">${w ? (w === 1 ? 'Pilot Wave 1' : 'Wave ' + w) : 'All groups'} <span class="count-badge">${w ? K.INSTITUTIONS.filter(i => i.wave === w).length : K.INSTITUTIONS.length}</span></button>`).join('')}</div></div>
        <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Institution</th><th>Group</th><th>KHDA owner</th><th>Commitment</th><th>Blocker</th><th>Complexity</th><th></th></tr></thead><tbody>
          ${onb.slice(0, wave ? 40 : 8).map(({ i, s }) => `<tr><td class="cell-title">${esc(i.name)}</td><td>${esc(i.waveLabel)}</td><td>${esc(i.owner)}</td><td><span class="chip ${i.commitment === 'Confirmed' ? 'chip--complete' : 'chip--warning'}">${i.commitment}</span></td><td>${s.needsCorrection ? '<span class="cell-late">Data corrections</span>' : s.overdue ? '<span class="cell-late">Missing submissions</span>' : '<span class="cell-muted">None recorded</span>'}</td><td>${esc(i.complexity)}</td><td class="actions"><a class="btn btn--text btn--sm" href="onboarding.html?inst=${i.id}">View journey →</a></td></tr>`).join('')}
        </tbody></table></div>
        <div class="panel__foot"><span>${wave ? onb.length : Math.min(8, onb.length)} of ${K.INSTITUTIONS.length} institutions${wave ? '' : ' — pick a wave to see all of it'}</span>${wave ? '<button class="btn btn--text btn--sm" type="button" data-wave="0">Clear filters</button>' : ''}</div>
      </section>`;
    $('#main').removeAttribute('aria-busy');
    $('#main').querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; selected.clear(); render(); }));
    $('#main').querySelectorAll('[data-wave]').forEach(b => b.addEventListener('click', () => { wave = Number(b.dataset.wave); render(); }));
    $('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); const el = $('#q'); el.focus(); el.setSelectionRange(q.length, q.length); });
    $('#selAll').addEventListener('change', e => { selected = new Set(e.target.checked ? list.map(s => s.inst.id) : []); render(); });
    $('#main').querySelectorAll('[data-sel]').forEach(c => c.addEventListener('change', () => { if (c.checked) selected.add(c.dataset.sel); else selected.delete(c.dataset.sel); render(); }));
    $('#bulkSend').addEventListener('click', () => { if (!R.can('supervisor')) { window.khdaToast('error', 'KHDA staff only', 'Bulk communications are sent by a Supervisor or Administrator.'); return; } location.href = 'khda-monitor.html?inst=' + [...selected][0] + '&email=1&bulk=' + selected.size; });
    $('#exportQueue').addEventListener('click', () => window.khdaToast('success', 'Queue exported', list.length + ' institutions written to follow-up-queue.xlsx'));
    R.gate();
  }
  render();
})();
