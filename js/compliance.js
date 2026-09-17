/* Compliance history — the institution's performance across reporting periods: datasets received, corrections,
   recurring corrections, on-time compliance (computed from due dates and receipts), a submission trend chart and
   the period-by-period table with Required / Received / Accepted / Corrections / Late / Missing. */
(function () {
  'use strict';
  const M = window.KHDA_MODEL, U = window.KHDA_UI;
  if (!M || !U) return;
  const { $, esc, t } = U;
  let range = 'all';

  function periodStats(p) {
    const sm = M.summary(p), req = sm.all.filter(M.REQ);
    const withDue = req.filter(s => s.req.due);
    const onTime = withDue.filter(s => M.RECEIVED(s) && s.receivedAt <= s.req.due).length;
    const late = withDue.filter(s => M.RECEIVED(s) && s.receivedAt > s.req.due).length;
    const ended = p.end < M.TODAY;
    const missing = req.filter(s => !M.RECEIVED(s) && (ended || (s.req.due && s.req.due < M.TODAY))).length;
    return { p, sm, required: sm.required, received: sm.received, accepted: sm.accepted, corrections: sm.returned, processing: sm.inReview, late, missing, api: sm.api, onTime, withDue: withDue.length, onTimePct: withDue.length ? Math.round(onTime / withDue.length * 100) : null, returnedSheets: new Set(req.filter(M.RETURNED).map(s => s.dataset.sheet)) };
  }

  let render = function () {
    const all = M.PERIODS.map(periodStats);
    const rows = range === 'all' ? all : all.slice(-2);
    const cur = M.period();
    const firstReceipt = all.flatMap(r => r.sm.all.filter(M.RECEIVED).map(s => s.receivedAt)).sort((a, b) => a - b)[0];
    // recurring: datasets returned in more than one of the shown periods
    const counts = {}; rows.forEach(r => r.returnedSheets.forEach(sh => { counts[sh] = (counts[sh] || 0) + 1; }));
    const recurring = Object.entries(counts).filter(([, n]) => n > 1).map(([sh, n]) => ({ sheet: sh, n, d: (window.KHDA_DATASETS || []).find(d => d.sheet === sh) })).sort((a, b) => b.n - a.n);
    const received = rows.reduce((n, r) => n + r.received, 0);
    const onTimeAll = rows.reduce((n, r) => n + r.onTime, 0), withDueAll = rows.reduce((n, r) => n + r.withDue, 0);
    const onTimePct = withDueAll ? Math.round(onTimeAll / withDueAll * 100) : 0;

    $('#cmpName').textContent = M.INSTITUTION.name;
    $('#cmpSince').textContent = firstReceipt ? t('cmp.since', { d: M.fmtDate(firstReceipt) }) : '';
    $('#cmpActions').innerHTML = `<label class="period"><span class="small muted">${t('cmp.show')}</span> <select class="control control--select control--sm" id="cmpRange"><option value="all"${range === 'all' ? ' selected' : ''}>${t('cmp.allPeriods')}</option><option value="last2"${range === 'last2' ? ' selected' : ''}>${t('cmp.last2')}</option></select></label><a class="tool-btn" href="monitor.html">${t('cmp.openMonitor')} →</a>`;
    $('#cmpRange').addEventListener('change', e => { range = e.target.value; render(); });

    const stat = (label, value, note, accent) => `<div class="stat${accent ? ' stat--accent' : ''}"><span class="stat__label">${esc(label)}</span><span class="stat__value">${value}</span><span class="stat__note">${esc(note)}</span></div>`;
    $('#cmpStats').innerHTML = [
      stat(t('cmp.s.periods'), rows.length, t('cmp.s.periodsNote'), true),
      stat(t('cmp.s.received'), received, t('cmp.s.receivedNote')),
      stat(t('cmp.s.recurring'), recurring.length, t('cmp.s.recurringNote')),
      stat(t('cmp.h.onTime'), onTimePct + '%', t('cmp.s.onTimeNote', { a: onTimeAll, b: withDueAll })),
    ].join('');

    // ---- submission trend: stacked columns per period ----
    const W = Math.max(480, Math.round(($('#cmpTrend').clientWidth || 700) - 48)), H = 260, L = 8, B = 48, T = 36;
    const max = Math.max(1, ...rows.map(r => r.received));
    const cw = (W - L) / rows.length, bw = Math.min(120, cw * 0.55);
    const y = v => T + (H - T - B) * (1 - v / max);
    const series = [['accepted', 'var(--success)'], ['corrections', 'var(--primary)'], ['processing', 'var(--warning)']];
    const cols = rows.map((r, i) => { let acc = 0; const x = L + cw * i + (cw - bw) / 2; const parts = series.map(([k, c]) => { const v = r[k]; const yTop = y(acc + v), h = y(acc) - yTop; acc += v; return v ? `<rect x="${x}" y="${yTop}" width="${bw}" height="${h}" fill="${c}"><title>${esc(t('cmp.l.' + k))}: ${v}</title></rect>` : ''; }).join(''); return `<g>${parts}<text x="${x + bw / 2}" y="${y(acc) - 10}" text-anchor="middle" class="viz__val" style="font-size:18px">${r.received}</text><text x="${x + bw / 2}" y="${H - 22}" text-anchor="middle" class="viz__lbl">${esc(r.p.label)}${r.p.id === cur.id ? ' ·' : ''}</text><text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="viz__lbl" fill="${r.onTimePct == null ? 'var(--on-surface-muted)' : r.onTimePct >= 80 ? 'var(--success)' : 'var(--error)'}">${r.onTimePct == null ? '—' : t('cmp.onTimeShort', { n: r.onTimePct })}</text></g>`; }).join('');
    $('#cmpTrend').innerHTML = `<div class="dash-card__head"><div><h2 class="dash-card__title">${t('cmp.trend')}</h2><p class="dash-card__sub cmp-sub">${t('cmp.trendSub')}</p></div><a class="tool-btn" href="status.html">${t('nav.status')}</a></div>
      <svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('cmp.trend')}">${[0.5, 1].map(f => `<line x1="${L}" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="var(--outline)"/>`).join('')}${cols}</svg>
      <div class="legend">${series.map(([k, c]) => `<span class="legend__item"><span class="legend__dot" style="background:${c}"></span><span class="legend__label">${t('cmp.l.' + k)}</span></span>`).join('')}<span class="legend__item"><span class="legend__label">${t('cmp.onTimeLegend')}</span></span></div>`;

    // ---- what to follow up on ----
    $('#cmpFollow').innerHTML = `<div class="dash-card__head"><h2 class="dash-card__title">${t('cmp.follow')}</h2></div>
      <div class="cmp-big">${t('cmp.recurringN', { n: recurring.length })}</div><p class="dash-card__sub cmp-sub">${t('cmp.recurringText')}</p>
      <ul class="cmp-list">${recurring.map(r => `<li><span class="legend__dot" style="background:var(--primary)"></span><a href="reconciliation.html?sheet=${encodeURIComponent(r.sheet)}">${esc(r.d ? M.titleOf(r.d) : r.sheet)}</a><span class="muted">${t('cmp.inPeriods', { n: r.n })}</span></li>`).join('') || `<li class="muted">${t('cmp.noRecurring')}</li>`}</ul>
      <div class="alert cmp-note"><div><div class="alert__text">${t('cmp.note', { n: withDueAll })}</div></div></div>`;

    // ---- period table ----
    $('#cmpBody').innerHTML = rows.map(r => `<tr${r.p.id === cur.id ? ' class="is-editing"' : ''}><td><div class="cell-title">${esc(r.p.label)}</div><div class="cell-sub">${esc(M.fmtDate(r.p.start))} – ${esc(M.fmtDate(r.p.end))}${r.p.id === cur.id ? ' · ' + t('mon.currentPeriod') : ''}</div></td><td class="num">${r.required}</td><td class="num">${r.received}</td><td class="num">${r.accepted}</td><td class="num">${r.corrections ? `<span class="late">${r.corrections}</span>` : 0}</td><td class="num">${r.late ? `<span class="late">${r.late}</span>` : 0}</td><td class="num">${r.missing ? `<span class="late">${r.missing}</span>` : 0}</td><td class="num">${r.api}</td><td>${r.onTimePct == null ? '—' : `<span class="cmp-bar"><span style="width:${r.onTimePct}%;background:${r.onTimePct >= 80 ? 'var(--success)' : 'var(--error)'}"></span></span><span class="cell-sub">${t('cmp.onTimeCell', { p: r.onTimePct, a: r.onTime, b: r.withDue })}</span>`}</td></tr>`).join('');
  };

  // ---------- dataset × period matrix ----------
  const CELL = { accepted: ['cmp.m.accepted', 'var(--success)'], review: ['cmp.m.review', '#7FD1A6'], returned: ['cmp.m.returned', 'var(--primary)'], not: ['cmp.m.not', 'var(--outline)'], na: ['cmp.m.na', 'transparent'] };
  const cellOf = s => s.status === 'na' ? 'na' : M.ACCEPTED(s) ? 'accepted' : M.RETURNED(s) ? 'returned' : M.IN_REVIEW(s) ? 'review' : 'not';
  function renderMatrix(rows) {
    const DATA = window.KHDA_DATASETS || [];
    const per = rows.map(r => r.p), subsBy = Object.fromEntries(per.map(p => [p.id, M.subs(p)]));
    $('#cmpLegend').innerHTML = ['accepted', 'review', 'returned', 'not'].map(k => `<span class="legend__item"><span class="matrix__sq matrix__sq--${k}"></span><span class="legend__label">${t(CELL[k][0])}</span></span>`).join('');
    $('#cmpJump').innerHTML = `<option value="">${t('cmp.choose')}</option>` + DATA.map(d => `<option value="${esc(d.sheet)}">${esc(M.titleOf(d))}</option>`).join('');
    const groups = M.AREAS.map(a => [a, DATA.filter(d => M.areaOf(d) === a)]).filter(([, l]) => l.length);
    const totals = per.map(p => subsBy[p.id].filter(M.ACCEPTED).length);
    $('#cmpMatrix').innerHTML = `<thead><tr><th>${t('status.h.dataset')}</th>${per.map(p => `<th class="matrix__ph">${esc(p.label)}</th>`).join('')}<th class="num">${t('cmp.accepted')}</th></tr></thead><tbody>
      ${groups.map(([a, list]) => `<tr class="grp"><td colspan="${per.length + 2}"><div class="grp__btn grp__btn--static"><span class="grp__text"><span class="grp__title">${t('area.' + a)}</span><span class="grp__sub">${t('rem.datasetsN', { n: list.length })}</span></span></div></td></tr>` + list.map(d => { const cells = per.map(p => subsBy[p.id].find(s => s.dataset === d)); const acc = cells.filter(M.ACCEPTED).length; const shown = cells.filter(s => s.status !== 'na').length; return `<tr id="mx-${esc(M.codeOf(d))}"><td><div class="cell-title">${esc(M.titleOf(d))}</div><div class="cell-sub">${esc(M.codeOf(d))}</div></td>${cells.map(s => { const k = cellOf(s); return `<td class="matrix__cell">${k === 'na' ? `<span class="matrix__sq matrix__sq--na" title="${t('cmp.m.na')}"></span>` : `<a class="matrix__sq matrix__sq--${k}" href="status.html?period=${s.period.id}&track=${encodeURIComponent(d.sheet)}" title="${esc(M.titleOf(d))} · ${esc(s.period.label)} · ${t(CELL[k][0])}${s.receipt ? ' · ' + s.receipt.id : ''}${s.returnedCount ? ' · ' + t('status.returnedN', { n: s.returnedCount }) : ''}" aria-label="${esc(M.titleOf(d))} ${esc(s.period.label)} ${t(CELL[k][0])}"></a>`}</td>`; }).join('')}<td class="num"><b>${acc}</b><span class="cell-sub"> / ${shown}</span></td></tr>`; }).join('')).join('')}
      </tbody><tfoot><tr><th>${t('cmp.totals', { n: DATA.length })}</th>${totals.map((n, i) => `<th class="num">${n}<div class="cell-sub">${Math.round(n / Math.max(1, rows[i].required) * 100)}%</div></th>`).join('')}<th class="num">${Math.round(totals.reduce((a, b) => a + b, 0) / Math.max(1, rows.reduce((a, r) => a + r.required, 0)) * 100)}%</th></tr></tfoot>`;
    $('#cmpJump').onchange = e => { const d = DATA.find(x => x.sheet === e.target.value); if (!d) return; const tr = document.getElementById('mx-' + M.codeOf(d)); if (tr) { tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); tr.classList.add('is-editing'); setTimeout(() => tr.classList.remove('is-editing'), 2500); } };
  }
  const _render = render;
  render = function () { _render(); renderMatrix((range === 'all' ? M.PERIODS : M.PERIODS.slice(-2)).map(periodStats)); };
  document.addEventListener('khda:refresh', render);
  render();
})();
