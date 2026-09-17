/* Data monitor — the institution's own monitor for the reporting period: onboarding journey with named touch
   points (dates, owner, evidence), next in the agenda (overdue, due soon, returned), upcoming reporting periods
   and the latest receipts. Every figure comes from the submission model. */
(function () {
  'use strict';
  const M = window.KHDA_MODEL, U = window.KHDA_UI;
  if (!M || !U) return;
  const { $, esc, t } = U;
  const DAY = M.DAY;

  // onboarding touch points — the milestones an institution passes to submit by REST API (illustrative dates)
  const TOUCH = [
    { n: 1, key: 'kickoff', at: new Date(2025, 5, 12), owner: 'KHDA', evidence: 'Wave allocation letter' },
    { n: 2, key: 'contract', at: new Date(2025, 6, 3), owner: 'KHDA · UAEU', evidence: 'Data contract v1.2 signed' },
    { n: 3, key: 'credentials', at: new Date(2025, 6, 21), owner: 'KHDA', evidence: 'Client id issued · 2 IP addresses registered' },
    { n: 4, key: 'sandbox', at: new Date(2025, 7, 14), owner: 'UAEU', evidence: '46 / 46 datasets accepted in sandbox' },
    { n: 5, key: 'first', at: new Date(2025, 8, 9), owner: 'UAEU', evidence: 'First production receipt' },
    { n: 6, key: 'golive', at: null, owner: 'KHDA', evidence: null },
  ];
  const NEXT_PERIODS = [
    { id: '2025W', label: 'Winter 2025–26', start: new Date(2026, 0, 1), end: new Date(2026, 3, 30) },
    { id: '2025S', label: 'Spring 2025–26', start: new Date(2026, 4, 1), end: new Date(2026, 7, 31) },
  ];
  const dateBadge = d => d ? `<span class="dbadge"><b>${d.getDate()}</b><small>${d.toLocaleDateString('en-GB', { month: 'short' })}</small></span>` : `<span class="dbadge dbadge--muted"><b>—</b><small>${t('mon.event')}</small></span>`;

  function render() {
    const per = M.period(), sm = M.summary(per), subs = sm.all.filter(M.REQ);
    $('#monName').textContent = M.INSTITUTION.name;
    $('#monActions').innerHTML = `${U.periodSelect('monPeriod')}<a class="tool-btn" href="status.html">${t('nav.status')}</a><a class="tool-btn" href="reconciliation.html">${t('nav.reconciliation')}</a>`;
    $('#monPeriod').addEventListener('change', e => { M.setPeriod(e.target.value); render(); });

    // ---- onboarding journey ----
    const done = TOUCH.filter(x => x.at && x.at <= M.TODAY).length;
    const risk = sm.overdue > 2 || sm.returned > 5 ? 'risk' : sm.overdue || sm.returned ? 'watch' : 'ok';
    $('#monJourney').innerHTML = `
      <div class="dash-card__head"><h2 class="dash-card__title">${t('mon.journey')}</h2><span class="chip ${risk === 'risk' ? 'chip--error' : risk === 'watch' ? 'chip--warning' : 'chip--complete'}">${t('mon.risk.' + risk)}</span></div>
      <dl class="mon-facts">
        ${[[t('mon.f.wave'), 'Wave 2'], [t('mon.f.channel'), 'REST API · ' + t('portal.channelPortal')], [t('mon.f.liaison'), 'Noura Al Khatib'], [t('mon.f.environment'), t('api.production')], [t('mon.f.dictionary'), 'HEDB 2026'], [t('mon.f.progress'), t('mon.f.progressText', { a: done, b: TOUCH.length })]].map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}
      </dl>
      <ol class="touch">
        ${TOUCH.map(x => { const state = x.at && x.at <= M.TODAY ? 'done' : x.n === done + 1 ? 'current' : 'pending'; return `<li class="touch__item touch__item--${state}">
          <span class="touch__bar"></span>
          <span class="touch__n">${t('mon.touch', { n: x.n })}</span>
          <span class="touch__title">${t('mon.tp.' + x.key)}</span>
          <span class="touch__meta">${state === 'done' ? esc(M.fmtDate(x.at)) : state === 'current' ? t('mon.inProgress') : t('mon.notYet')} · ${esc(x.owner)}</span>
          ${x.evidence && state === 'done' ? `<span class="touch__evidence">${esc(x.evidence)}</span>` : state === 'current' ? `<span class="touch__evidence">${t('mon.golivePending', { n: sm.required - sm.accepted })}</span>` : ''}
        </li>`; }).join('')}
      </ol>`;

    // ---- next in your agenda ----
    const overdue = subs.filter(s => s.req.due && !M.RECEIVED(s) && s.req.due < M.TODAY).sort((a, b) => a.req.due - b.req.due);
    const returned = subs.filter(M.RETURNED);
    const soon = subs.filter(s => s.req.due && !M.RECEIVED(s) && s.req.due >= M.TODAY).sort((a, b) => a.req.due - b.req.due);
    const agenda = [...overdue, ...returned, ...soon].slice(0, 6);
    $('#monAgenda').innerHTML = `
      <div class="dash-card__head"><div><div class="small muted">${t('mon.nextSteps')}</div><h2 class="dash-card__title">${t('mon.agenda')}</h2><p class="dash-card__sub mon-sub">${esc(per.label)} · ${t('mon.agendaSub', { a: overdue.length, b: returned.length })}</p></div></div>
      <ul class="agenda">${agenda.map(s => { const [al, ah] = U.nextAction(s); return `<li class="agenda__item">${dateBadge(s.req.due)}<div class="agenda__main"><div class="agenda__title">${esc(M.titleOf(s.dataset))}</div><div class="agenda__sub${/overdue/i.test(M.dueText(s)) ? ' late' : ''}">${esc(M.dueText(s))}${s.returnedCount ? ' · ' + t('status.returnedN', { n: s.returnedCount }) : ''}</div></div>${U.chip(s.status)}<a class="btn btn--outline btn--sm" href="${ah}">${esc(al)} →</a></li>`; }).join('') || `<li class="empty empty--inline"><div class="empty__title">${t('mon.agendaEmpty')}</div></li>`}</ul>
      <div class="mon-foot"><a href="status.html">${t('mon.fullAgenda')}</a><span class="muted">${t('rem.datasetsN', { n: overdue.length + returned.length + soon.length })} →</span></div>`;

    // ---- upcoming periods ----
    const future = NEXT_PERIODS.filter(p => p.start > per.start);
    $('#monPeriods').innerHTML = `
      <div class="dash-card__head"><h2 class="dash-card__title">${t('mon.periods')}</h2><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg></div>
      <span class="chip chip--complete">${t('mon.currentPeriod')}</span>
      <div class="mon-period"><div class="mon-period__name">${esc(per.label)}</div><div class="mon-period__sub">${t('mon.outstanding', { n: sm.required - sm.accepted })}</div><div class="mon-period__sub">${esc(M.fmtDate(per.start))} – ${esc(M.fmtDate(per.end))}</div></div>
      ${future.map(p => `<div class="mon-period mon-period--next"><div><div class="mon-period__name mon-period__name--sm">${esc(p.label)}</div><div class="mon-period__sub">${esc(M.fmtDate(p.start))} – ${esc(M.fmtDate(p.end))} · ${t('mon.opensIn', { n: Math.max(0, M.daysBetween(p.start, M.TODAY)) })}</div></div><span class="muted">→</span></div>`).join('')}`;

    // ---- latest receipts ----
    const recent = subs.filter(M.RECEIVED).sort((a, b) => b.receivedAt - a.receivedAt).slice(0, 8);
    $('#monReceipts').innerHTML = `
      <div class="dash-card__head"><h2 class="dash-card__title">${t('mon.receipts')}</h2><a class="btn btn--outline btn--sm" href="status.html">${t('nav.status')}</a></div>
      <div class="table-wrap"><table class="data-table data-table--fit mon-table"><thead><tr><th>${t('status.h.receipt')}</th><th>${t('status.h.dataset')}</th><th>${t('status.h.channel')}</th><th>${t('status.h.received')}</th><th class="num">${t('status.h.records')}</th><th>${t('status.h.status')}</th><th class="actions"></th></tr></thead><tbody>
        ${recent.map(s => `<tr><td class="mono">${esc(s.receipt.id)}</td><td><div class="cell-title cell-wrap">${esc(M.titleOf(s.dataset))}</div><div class="cell-sub">${t('status.version', { n: s.version })}</div></td><td>${U.channel(s.channel)}</td><td>${esc(M.fmtDateTime(s.receivedAt))}</td><td class="num">${s.rows.toLocaleString()}${s.returnedCount ? `<div class="cell-sub late">${t('status.returnedN', { n: s.returnedCount })}</div>` : ''}</td><td>${U.chip(s.status)}</td><td class="actions"><a class="btn btn--text btn--sm" href="status.html?track=${encodeURIComponent(s.dataset.sheet)}">${t('portal.track')}</a></td></tr>`).join('')}
      </tbody></table></div>`;
  }

  document.addEventListener('khda:refresh', render);
  render();
})();
