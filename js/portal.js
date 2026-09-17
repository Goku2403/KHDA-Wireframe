/* Shared helpers for the institution pages (status, reconciliation, REST API): status chips, the
   submission journey as a vertical stepper, a period selector, file download, and a ticker that moves
   resubmitted datasets on through validation and quality review so a demo keeps progressing on any page. */
(function () {
  'use strict';
  const M = window.KHDA_MODEL; if (!M) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = (k, v) => (window.t ? window.t(k, v) : k);

  const chip = (st, extra) => { const [, c] = M.STATUS[st] || [st, 'neutral']; return `<span class="chip chip--${c}${extra ? ' ' + extra : ''}">${esc(M.label(st))}</span>`; };
  const channel = ch => `<span class="chip chip--outline">${ch === 'api' ? 'REST API' : t('portal.channelPortal')}</span>`;

  // the journey through KHDA as the wireframe's own stepper (done / current / warning / locked)
  function journey(sub) {
    const steps = M.journey(sub);
    return `<ol class="stepper stepper--journey">${steps.map(st => {
      const mod = st.state === 'done' ? 'stepper__item--done' : st.state === 'failed' ? 'stepper__item--warning stepper__item--returned' : st.state === 'current' ? 'stepper__item--current' : 'stepper__item--locked';
      const icon = st.state === 'done' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>'
        : st.state === 'failed' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>' : '';
      const status = st.state === 'done' ? esc(M.fmtDateTime(st.at)) : st.state === 'failed' ? esc(M.fmtDateTime(st.at)) : st.state === 'current' ? t('portal.inProgress') + (st.sla ? ' · ' + st.sla : '') : t('portal.pending');
      const cls = st.state === 'done' ? 'chip--complete' : st.state === 'failed' ? 'chip--warning' : st.state === 'current' ? 'chip--current' : '';
      return `<li class="stepper__item ${mod}"><div class="stepper__btn"><span class="stepper__rail"><span class="stepper__icon">${icon}</span></span><span class="stepper__body"><span class="chip stepper__status ${cls}">${status}</span><span class="stepper__title">${esc(st.name)}</span><span class="stepper__note">${esc(st.note)}</span></span></div></li>`;
    }).join('')}</ol>`;
  }

  // reporting-period selector for a page title bar
  function periodSelect(id) {
    return `<label class="period"><span class="sr-only">${t('portal.period')}</span><select class="control control--select control--sm" id="${id}">${M.PERIODS.map(p => `<option value="${p.id}"${p.id === M.currentPeriod() ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>`;
  }

  function download(name, text, mime) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' })); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csv = grid => grid.map(r => r.map(v => (/[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v))).join(',')).join('\r\n');
  const toast = (k, a, b) => window.khdaToast && window.khdaToast(k, a, b);

  // the next thing to do with a dataset, as [label, href]
  function nextAction(s) {
    const sheet = encodeURIComponent(s.dataset.sheet);
    if (M.RETURNED(s)) return [t('portal.reconcile'), 'reconciliation.html?sheet=' + sheet];
    if (s.status === 'draft') return [t('portal.continue'), 'index.html?sheet=' + sheet];
    if (M.IN_REVIEW(s) || M.ACCEPTED(s)) return [t('portal.track'), 'status.html?track=' + sheet];
    if (s.status === 'na') return ['', ''];
    return [t('portal.submit'), 'choose.html?sheet=' + sheet];
  }

  // ---------- pending events: a resubmitted dataset moves on while the user browses ----------
  setInterval(() => {
    const p = M.ls.get('khda.sub.pending', []); if (!p.length) return;
    const now = Date.now(), due = p.filter(x => x.at <= now); if (!due.length) return;
    M.ls.set('khda.sub.pending', p.filter(x => x.at > now));
    due.forEach(x => {
      M.record(x.ev);
      const d = (window.KHDA_DATASETS || []).find(y => y.sheet === x.ev.sheet);
      toast(x.ev.status === 'accepted' ? 'success' : M.RETURNED({ status: x.ev.status }) ? 'error' : 'info', M.label(x.ev.status), d ? M.titleOf(d) : x.ev.sheet);
    });
    document.dispatchEvent(new CustomEvent('khda:refresh'));
  }, 1000);

  window.KHDA_UI = { $, esc, t, chip, channel, journey, periodSelect, download, csv, toast, nextAction };
})();
