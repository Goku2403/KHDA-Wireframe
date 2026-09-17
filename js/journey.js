/* Submission journey — the R1 pipeline drawn as a horizontal stepper for one submission.
   Source → iPaaS → API Hub → Adapter → Validation → Profiling → Processing → Published.
   Reused on the dashboard, the dataset drawer, the monitor and the remediation report (plan X-2). */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICON = {
    done: '<path d="M20 6 9 17l-5-5"/>',
    failed: '<path d="M18 6 6 18M6 6l12 12"/>',
    current: '<circle cx="12" cy="12" r="4"/>',
    pending: '',
  };

  function render(sub, opts) {
    const o = Object.assign({ compact: false, fix: true }, opts);
    const stages = K.journey(sub);
    const label = sub.status === 'not_started' ? 'No submission received for this period yet.'
      : sub.status === 'waived' ? 'Requirement waived for this period.' : sub.status === 'not_applicable' ? 'Not required in this period.' : '';
    const failed = stages.find(s => s.state === 'failed');
    return `<div class="journey${o.compact ? ' journey--compact' : ''}" role="list" aria-label="Submission journey">
      ${stages.map((s, i) => `<div class="journey__step journey__step--${s.state}" role="listitem">
        <span class="journey__dot" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${ICON[s.state]}</svg></span>
        ${i < stages.length - 1 ? '<span class="journey__line" aria-hidden="true"></span>' : ''}
        <span class="journey__name">${esc(s.name)}</span>
        ${o.compact ? '' : `<span class="journey__meta">${s.at ? esc(K.fmtDateTime(s.at).replace(' (Dubai time)', '')) : (s.sla ? 'SLA ' + s.sla : '')}</span>
        ${s.ref ? `<span class="journey__ref mono">${esc(s.ref)}</span>` : ''}
        ${s.note ? `<span class="journey__note">${esc(s.note)}</span>` : ''}`}
      </div>`).join('')}
    </div>
    ${label ? `<p class="journey__empty">${esc(label)}</p>` : ''}
    ${!o.compact && failed && o.fix ? `<div class="journey__fix"><span>${esc(failed.note)}</span><a class="btn btn--primary btn--md" href="remediation.html?inst=${encodeURIComponent(sub.inst.id)}&sheet=${encodeURIComponent(sub.dataset.sheet)}">Fix it →</a></div>` : ''}`;
  }

  window.KHDA_JOURNEY = { render };
})();
