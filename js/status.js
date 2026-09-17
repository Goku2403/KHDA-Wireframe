/* Submission status — the institution's dashboard of every dataset for a reporting period: overview
   tiles, the submission register (channel, receipt, status, records) and a side sheet that tracks one
   submission through KHDA. Deep link: ?track=<sheet>. */
(function () {
  'use strict';
  const M = window.KHDA_MODEL, U = window.KHDA_UI, S = window.KHDA_SCHEMA;
  if (!M || !U) return;
  const { $, esc, t } = U;
  const DATA = window.KHDA_DATASETS || [];
  let filter = 'all', q = '', groupBy = 'area';
  const collapsed = new Set();

  const ICON = {
    list: '<path d="M4 7h16M4 12h16M4 17h10"/>', send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    back: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>', check: '<path d="M20 6 9 17l-5-5"/>', alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5m0 3h.01"/>',
  };
  const icon = k => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const stat = (k, label, value, note, accent) => `<div class="stat${accent ? ' stat--accent' : ''}"><span class="stat__icon">${icon(k)}</span><span class="stat__label">${esc(label)}</span><span class="stat__value">${value}</span>${note ? `<span class="stat__note">${esc(note)}</span>` : ''}</div>`;

  const matches = s => {
    if (filter === 'action' && !(M.RETURNED(s) || s.status === 'draft' || (s.req.due && !M.RECEIVED(s) && s.req.due < M.TODAY))) return false;
    if (filter === 'review' && !M.IN_REVIEW(s)) return false;
    if (filter === 'accepted' && !M.ACCEPTED(s)) return false;
    if (filter === 'not' && (M.RECEIVED(s) || s.status === 'na')) return false;
    if (q && !(M.titleOf(s.dataset) + ' ' + M.codeOf(s.dataset) + ' ' + (s.receipt ? s.receipt.id : '')).toLowerCase().includes(q)) return false;
    return true;
  };

  function render() {
    const per = M.period(), sm = M.summary(per);
    $('#stActions').innerHTML = `${U.periodSelect('stPeriod')}<button class="tool-btn" type="button" id="stExport"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12m0 0-4-4m4 4 4-4M4 16v4h16v-4"/></svg><span>${t('status.export')}</span></button>`;
    $('#stPeriod').addEventListener('change', e => { M.setPeriod(e.target.value); render(); });
    $('#stExport').addEventListener('click', () => {
      const grid = [[t('status.h.dataset'), 'Code', t('status.h.frequency'), t('status.h.due'), t('status.h.channel'), t('status.h.received'), t('status.h.receipt'), t('status.h.status'), t('status.h.records'), 'Returned', 'Version']];
      sm.all.forEach(s => grid.push([M.titleOf(s.dataset), M.codeOf(s.dataset), s.dataset.group, s.req.due ? s.req.due.toISOString().slice(0, 10) : 'event', s.receivedAt ? s.channel : '', s.receivedAt ? s.receivedAt.toISOString() : '', s.receipt ? s.receipt.id : '', M.label(s.status), s.rows, s.returnedCount, s.version]));
      U.download(`KHDA-submission-register-${per.id}.csv`, U.csv(grid), 'text/csv');
      U.toast('success', t('status.export'), t('status.exported', { x: per.label }));
    });

    $('#stStats').innerHTML = [
      stat('list', t('status.s.required'), sm.required, t('status.s.ofCatalogue', { n: sm.all.length }), true),
      stat('send', t('status.s.submitted'), sm.received, t('status.s.viaApi', { n: sm.api })),
      stat('clock', t('status.s.review'), sm.inReview, t('status.s.withKhda')),
      stat('back', t('status.s.returned'), sm.returned, t('status.s.recordsToFix', { n: sm.returnedRows })),
      stat('check', t('status.s.accepted'), sm.accepted, sm.pct + '% ' + t('status.s.ofRequired')),
      stat('alert', t('status.s.overdue'), sm.overdue, t('status.s.dueSoon', { n: sm.dueSoon })),
    ].join('');

    const rows = sm.all.filter(matches);
    $('#stCount').textContent = t('status.count', { n: rows.length, m: sm.all.length });
    const groupKey = s => groupBy === 'area' ? M.areaOf(s.dataset) : groupBy === 'freq' ? (s.req.realtime ? 'event' : s.dataset.group) : '';
    const groupLabel = k => groupBy === 'area' ? t('area.' + k) : k === 'event' ? t('status.eventBased') : t('group.' + k);
    const order = groupBy === 'area' ? M.AREAS : ['Semester', 'Annual', 'event'];
    const groups = groupBy === 'all' ? [['', rows]] : order.map(k => [k, rows.filter(s => groupKey(s) === k)]).filter(([, l]) => l.length);
    const row = s => {
      const [al, ah] = U.nextAction(s);
      const late = s.req.due && !M.RECEIVED(s) && s.req.due < M.TODAY;
      return `<tr>
        <td><div class="cell-title cell-wrap">${s.receivedAt ? `<button class="btn-text" type="button" data-track="${esc(s.dataset.sheet)}">${esc(M.titleOf(s.dataset))}</button>` : esc(M.titleOf(s.dataset))}</div><div class="cell-sub">${esc(M.codeOf(s.dataset))} · ${s.dataset.fields.length} ${t('status.fields')}</div></td>
        <td>${s.req.realtime ? t('status.eventBased') : esc(t('group.' + s.dataset.group))}</td>
        <td><div class="cell-title">${s.req.due ? esc(M.fmtDate(s.req.due)) : '—'}</div><div class="cell-sub${late ? ' is-late' : ''}">${s.status === 'na' ? t('status.notThisPeriod') : esc(M.dueText(s))}</div></td>
        <td>${s.receivedAt ? U.channel(s.channel) : '—'}</td>
        <td>${s.receivedAt ? `<div class="cell-title">${esc(M.freshness ? M.freshness(s) : M.fmtDateTime(s.receivedAt))}</div><div class="cell-sub mono">${esc(s.receipt.id)} · v${s.version}</div>` : `<div class="cell-sub">${t('status.noReceipt')}</div>`}</td>
        <td>${U.chip(s.status)}</td>
        <td class="num">${s.rows ? `<div class="cell-title">${s.rows.toLocaleString()}</div>${s.returnedCount ? `<div class="cell-sub is-late">${t('status.returnedN', { n: s.returnedCount })}</div>` : ''}` : '—'}</td>
        <td>${s.returnedCount ? `<a class="link-icon" href="reconciliation.html?sheet=${encodeURIComponent(s.dataset.sheet)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0 5 5L13 18a2 2 0 0 1-3-3l6.7-6.7zM3 21l4-4"/></svg><span>${t('nav.reconciliation')}</span></a><div class="cell-sub is-late">${t('status.openIssues', { n: s.returnedCount })}</div>` : `<span class="cell-sub">${t('status.noIssues')}</span>`}</td>
        <td class="actions">${al ? (M.IN_REVIEW(s) || M.ACCEPTED(s) ? `<button class="btn btn--outline btn--sm" type="button" data-track="${esc(s.dataset.sheet)}">${t('status.viewDetails')} →</button>` : `<a class="btn btn--${M.RETURNED(s) ? 'primary' : 'outline'} btn--sm" href="${ah}">${esc(al)}</a>`) : ''}</td>
      </tr>`;
    };
    const groupRow = (k, list) => {
      const req = list.filter(M.REQ), submitted = req.filter(M.RECEIVED).length, accepted = req.filter(M.ACCEPTED).length;
      const attention = req.filter(s => M.RETURNED(s) || s.status === 'draft' || (s.req.due && !M.RECEIVED(s) && s.req.due < M.TODAY)).length;
      return `<tr class="grp${collapsed.has(k) ? ' is-collapsed' : ''}" data-grp="${esc(k)}"><td colspan="9"><button type="button" class="grp__btn" aria-expanded="${!collapsed.has(k)}">
        <span class="grp__chev"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></span>
        <span class="grp__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span>
        <span class="grp__text"><span class="grp__title">${esc(groupLabel(k))}</span><span class="grp__sub">${t('status.grp.sub', { a: list.length, b: submitted })}</span></span>
        <span class="grp__bar" title="${accepted} / ${req.length}"><i style="width:${req.length ? Math.round(accepted / req.length * 100) : 0}%"></i></span>
        <span class="grp__acc">${t('status.grp.accepted', { a: accepted, b: req.length })}</span>
        ${attention ? `<span class="chip chip--warning">${t('status.grp.attention', { n: attention })}</span>` : `<span class="chip chip--complete">${t('status.grp.ok')}</span>`}
      </button></td></tr>`;
    };
    $('#stBody').innerHTML = groups.map(([k, list]) => (k ? groupRow(k, list) : '') + (k && collapsed.has(k) ? '' : list.map(row).join(''))).join('');
    $('#stExpand').textContent = t(collapsed.size ? 'status.expandAll' : 'status.collapseAll');
    $('#stExpand').hidden = groupBy === 'all';
    $('#stEmpty').hidden = rows.length > 0;
    $('#stTable').hidden = rows.length === 0;
  }

  // ---------- track one submission ----------
  function openTrack(sheet) {
    const d = DATA.find(x => x.sheet === sheet); if (!d) return;
    const s = M.submission(d, M.period());
    $('#trackTitle').textContent = M.titleOf(d);
    const facts = [[t('status.h.receipt'), s.receipt ? s.receipt.id : '—'], [t('status.g.area'), t('area.' + M.areaOf(d))], [t('status.h.channel'), s.channel === 'api' ? 'REST API' : t('portal.channelPortal')], [t('status.h.received'), M.fmtDateTime(s.receivedAt)], [t('status.h.records'), s.rows.toLocaleString() + (s.returnedCount ? ' · ' + t('status.returnedN', { n: s.returnedCount }) : '')], [t('status.versionLabel'), 'v' + s.version], [t('status.h.status'), '']];
    $('#trackBody').innerHTML = `
      <dl class="profile-facts track-facts">${facts.map(([l, v]) => `<div class="fact"><dt class="fact__label">${esc(l)}</dt><dd class="fact__value">${l === t('status.h.status') ? U.chip(s.status) : esc(v)}</dd></div>`).join('')}</dl>
      ${M.RETURNED(s) ? `<div class="alert alert--error"><div><div class="alert__title">${t('status.returnedTitle', { n: s.returnedCount })}</div><div class="alert__text">${t('status.returnedText', { x: t(M.SOURCE[s.status]) })}</div></div></div>` : ''}
      <h4 class="form-section__title">${t('status.journey')}</h4>
      ${U.journey(s)}`;
    $('#trackActions').innerHTML = `${M.RETURNED(s) ? `<a class="btn btn--primary" href="reconciliation.html?sheet=${encodeURIComponent(sheet)}">${t('portal.reconcile')}</a>` : !s.receivedAt && s.status !== 'na' ? `<a class="btn btn--primary" href="choose.html?sheet=${encodeURIComponent(sheet)}">${t('portal.submit')}</a>` : ''}<a class="btn btn--outline" href="report.html?sheet=${encodeURIComponent(sheet)}">${t('cat.report')}</a><button class="btn btn--outline" type="button" id="trackDone">${t('common.close')}</button>`;
    $('#trackDone').addEventListener('click', closeTrack);
    $('#trackModal').hidden = false;
    $('#trackClose').focus();
  }
  function closeTrack() { $('#trackModal').hidden = true; }

  // ---------- wiring ----------
  $('#stFilter').addEventListener('change', e => { filter = e.target.value; render(); });
  $('#stGroup').addEventListener('click', e => { const b = e.target.closest('button[data-group]'); if (!b) return; groupBy = b.dataset.group; collapsed.clear(); $('#stGroup').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); });
  $('#stExpand').addEventListener('click', () => { if (collapsed.size) collapsed.clear(); else document.querySelectorAll('#stBody tr.grp').forEach(tr => collapsed.add(tr.dataset.grp)); render(); });
  $('#stBody').addEventListener('click', e => { const g = e.target.closest('.grp__btn'); if (!g) return; const k = g.closest('tr').dataset.grp; if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k); render(); });
  $('#stSearch').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });
  $('#stBody').addEventListener('click', e => { const b = e.target.closest('[data-track]'); if (b) openTrack(b.dataset.track); });
  $('#trackClose').addEventListener('click', closeTrack);
  $('#trackModal').addEventListener('mousedown', e => { if (e.target.id === 'trackModal') closeTrack(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#trackModal').hidden) closeTrack(); });
  document.addEventListener('khda:refresh', render);

  render();
  const asked = new URLSearchParams(location.search).get('track');
  if (asked) openTrack(asked);
})();
