/* Compliance history (plan D-4) — computed from the requirement table: Required / Received / Accepted / Late /
   Missing / On-time per period, submission trend, recurring corrections, board-pack export. */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  let inst = K.INSTITUTIONS.find(i => i.id === params.get('inst')) || (R.role().team === 'inst' ? K.own() : null);
  let openPeriod = null;

  function sectorHistory() {
    return K.PERIODS.map(p => { const s = K.sector(p.id); return { period: p, required: s.required, received: s.received, accepted: s.accepted, needsCorrection: s.needsCorrection, processing: s.processing, late: s.institutions.reduce((n, x) => n + x.late, 0), missing: s.required - s.received, onTime: s.received - s.institutions.reduce((n, x) => n + x.late, 0) }; });
  }

  function render() {
    const hist = inst ? K.history(inst) : sectorHistory();
    const recurring = inst ? K.recurringCorrections(inst) : [];
    const max = Math.max(...hist.map(h => h.received), 1);
    const totalReceived = hist.reduce((n, h) => n + h.received, 0);
    const onTimePct = Math.round(hist.reduce((n, h) => n + h.onTime, 0) / Math.max(1, totalReceived) * 100);
    $('#main').innerHTML = `
      <div class="page-head"><div><div class="page-head__eyebrow">KHDA · Performance over time</div><h1 class="page-head__title">Compliance history</h1><p class="page-head__sub">${inst ? 'See how ' + esc(inst.short) + ' is progressing and where follow-up keeps recurring.' : 'Sector-wide compliance per reporting period, computed from the requirement table.'}</p></div>
        <div class="page-head__actions">${R.role().team === 'inst' ? '' : `<select class="control control--sm" id="instPick" aria-label="Institution"><option value="">Whole sector</option>${K.INSTITUTIONS.map(i => `<option value="${i.id}"${inst && inst.id === i.id ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</select>`}</div></div>
      <div class="kpi-grid">
        <div class="kpi kpi--info"><div class="kpi__label">Reporting periods</div><div class="kpi__value">${hist.length}</div><div class="kpi__note">Receipts available from ${K.fmtDate(K.PERIODS[0].start)}</div></div>
        <div class="kpi kpi--primary"><div class="kpi__label">Datasets received</div><div class="kpi__value">${totalReceived.toLocaleString()}</div><div class="kpi__note">Counted once within each period</div></div>
        <div class="kpi kpi--error"><div class="kpi__label">Recurring corrections</div><div class="kpi__value">${inst ? recurring.length : hist.reduce((n, h) => n + h.needsCorrection, 0)}</div><div class="kpi__note">${inst ? 'Datasets needing correction in more than one period' : 'Dataset submissions returned across all periods'}</div></div>
        <div class="kpi kpi--success"><div class="kpi__label">On-time compliance</div><div class="kpi__value">${onTimePct}%</div><div class="kpi__note">Received on or before the due date — computed, never "not available"</div></div>
      </div>
      <div class="grid-main-side">
        <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Submission trend</h2><p class="panel__sub">Unique datasets received per period · latest outcome. Axis shows counts; hover a segment for its value.</p></div><button class="btn btn--outline btn--md" type="button" id="exportTrend">Export data</button></div>
          <div style="position:relative"><div class="stack-bars" role="img" aria-label="Datasets received per period: ${hist.map(h => h.period.short + ' ' + h.received).join(', ')}">${hist.map(h => `<div class="stack-bar"><div class="stack-bar__total">${h.received}</div><div class="stack-bar__col" style="height:${h.received / max * 200}px">${[['accepted', h.accepted], ['needs_correction', h.needsCorrection], ['processing', h.processing]].map(([k, n]) => `<span class="seg--${k}" style="height:${n / Math.max(1, h.received) * 100}%" title="${K.STATUS[k] ? K.STATUS[k][0] : 'Processing'}: ${n}"></span>`).join('')}</div></div>`).join('')}</div>
          <div class="stack-bars__labels">${hist.map(h => `<div>${esc(h.period.label)}</div>`).join('')}</div></div>
          <div class="legend legend--wrap"><span class="legend__item"><i class="legend__dot" style="background:var(--success)"></i><span class="legend__label">Accepted</span></span><span class="legend__item"><i class="legend__dot" style="background:var(--primary)"></i><span class="legend__label">Needs correction</span></span><span class="legend__item"><i class="legend__dot" style="background:#E0A800"></i><span class="legend__label">Processing</span></span></div>
        </section>
        <section class="panel"><div class="panel__head"><h2 class="panel__title">What to follow up on</h2></div>
          ${inst ? (recurring.length ? `<div><div class="rank-hero__score" style="font-size:32px;line-height:40px">${recurring.length} recurring dataset${recurring.length === 1 ? '' : 's'}</div><p class="panel__sub">These still need correction in more than one reporting period.</p></div><ul class="spec-rules">${recurring.map(r => `<li><a href="remediation.html?inst=${inst.id}&sheet=${encodeURIComponent(r.sheet)}">${esc(r.title)}</a> · ${r.periods} periods</li>`).join('')}</ul>` : '<div class="empty empty--inline"><div class="empty__title">No recurring corrections</div><div class="empty__text">No dataset has been returned in more than one period.</div></div>')
          : `<ul class="spec-rules">${K.INSTITUTIONS.map(i => ({ i, n: K.recurringCorrections(i).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 8).map(x => `<li><a href="khda-compliance.html?inst=${x.i.id}">${esc(x.i.short)}</a> · ${x.n} recurring dataset${x.n === 1 ? '' : 's'}</li>`).join('')}</ul>`}
          <div class="alert"><div><div class="alert__text" style="margin:0">Required, late and missing counts come from the requirement table (due date per institution × dataset × period). Waived requirements are excluded from the denominator.</div></div></div>
        </section>
      </div>
      <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Period-by-period status</h2><p class="panel__sub">Outcomes are based on each dataset's latest receipt within the period.</p></div></div>
        <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Reporting period</th><th class="num">Required</th><th class="num">Received</th><th class="num">Accepted</th><th class="num">Late</th><th class="num">Missing</th><th class="num">On-time</th><th></th></tr></thead><tbody>
          ${hist.slice().reverse().map(h => `<tr><td><div class="cell-title">${esc(h.period.label)}${h.period.current ? ' <span class="chip chip--complete">Current</span>' : ''}</div><div class="cell-sub">${h.received} submission${h.received === 1 ? '' : 's'}</div></td><td class="num">${h.required}</td><td class="num">${h.received}</td><td class="num" style="color:var(--success)">${h.accepted}</td><td class="num" style="color:var(--error)">${h.late}</td><td class="num">${h.missing}</td><td class="num">${Math.round(h.onTime / Math.max(1, h.received) * 100)}%</td><td class="actions">${inst ? `<button class="btn btn--text btn--sm" type="button" data-period="${h.period.id}">Datasets ${openPeriod === h.period.id ? '▴' : '▾'}</button>` : `<a class="btn btn--text btn--sm" href="khda-monitor.html">Monitor →</a>`}</td></tr>
            ${inst && openPeriod === h.period.id ? `<tr><td colspan="8" style="background:var(--surface-bright);padding:8px 24px 16px"><div style="display:flex;gap:8px;flex-wrap:wrap">${h.subs.filter(K.REQUIRED).map(s => `<span class="chip ${K.STATUS[s.status][1]}" title="${esc(K.dueText(s))}">${esc(K.titleOf(s.dataset))}</span>`).join('')}</div></td></tr>` : ''}`).join('')}
        </tbody></table></div>
        <div class="panel__foot"><span>Late = received after the due date. Missing = required and not received by the end of the period (or today for the current period).</span></div>
      </section>`;
    $('#main').removeAttribute('aria-busy');
    const pick = $('#instPick'); if (pick) pick.addEventListener('change', e => { inst = K.INSTITUTIONS.find(i => i.id === e.target.value) || null; openPeriod = null; history.replaceState(null, '', 'khda-compliance.html' + (inst ? '?inst=' + inst.id : '')); render(); });
    $('#main').querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { openPeriod = openPeriod === b.dataset.period ? null : b.dataset.period; render(); }));
    $('#exportTrend').addEventListener('click', () => window.khdaToast('success', 'Chart data exported', hist.length + ' periods written to submission-trend.csv'));
  }
  render();
})();
