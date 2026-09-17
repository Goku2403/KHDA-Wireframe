/* Sign-in (plan I-0) — institution picker + UAE PASS for institutions, Active Directory for KHDA staff.
   The side panel is data-bearing: a live sector readiness strip from the sector model, not decoration. */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const per = K.period();
  const sec = K.sector(per.id);
  const top = K.ranking(per.id).slice(0, 6);

  $('#main').innerHTML = `<div class="login">
    <section class="login__card" aria-labelledby="loginTitle">
      <div class="login__eyebrow"><span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg></span>e-portal · KHDA Digital Platform</div>
      <h1 class="login__title" id="loginTitle">Welcome to <b>KHDA Higher-Education Data Portal</b></h1>
      <p class="login__text">Your institution's data, in one place. Sign in to manage submissions, fix issues and track readiness.</p>
      <div class="field"><label class="field__label" for="instSelect">Your institution</label>
        <select class="control control--select" id="instSelect"><option value="">Select your institution</option>${K.INSTITUTIONS.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select>
        <div class="cell-muted" style="margin-top:6px">Choose from ${K.INSTITUTIONS.length} licensed institutions.</div></div>
      <button class="login__btn" type="button" id="btnPass" disabled>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 11a4 4 0 0 1 4 4v6M8 15a4 4 0 0 1 8 0M6 21v-6a6 6 0 0 1 12 0"/></svg>
        <span>Sign in with UAE PASS<small>Institution Admin · Data Steward · Approver · Read-only</small></span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
      <div class="cell-muted" id="passHint">Choose your institution above to continue.</div>
      <div class="login__divider">For KHDA employees</div>
      <button class="login__btn" type="button" id="btnAd">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>
        <span>Sign in with Active Directory<small>KHDA · KHDA Data · KHDA IT</small></span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
      <div class="cell-muted" style="text-align:center">Knowledge and Human Development Authority · Government of Dubai</div>
    </section>
    <aside class="login__side" aria-label="Sector readiness">
      <div><div class="page-head__eyebrow">Dubai's higher-education network · ${esc(per.label)}</div><h2>${sec.accepted.toLocaleString()} of ${sec.required.toLocaleString()} required datasets accepted across ${sec.total} institutions</h2></div>
      <div class="kpi-grid"><div class="kpi kpi--success"><div class="kpi__label">Compliant</div><div class="kpi__value">${sec.compliant}</div><div class="kpi__note">No overdue work or open corrections</div></div><div class="kpi kpi--warning"><div class="kpi__label">Needs follow-up</div><div class="kpi__value">${sec.needsFollowUp}</div><div class="kpi__note">Missing submissions or corrections</div></div><div class="kpi kpi--primary"><div class="kpi__label">Via API</div><div class="kpi__value">${Math.round(sec.api / Math.max(1, sec.received) * 100)}%</div><div class="kpi__note">of received datasets</div></div></div>
      <div><div class="panel__title" style="font-size:20px;line-height:28px;margin-bottom:12px">Leading the way</div><div class="readiness-strip">${top.map(s => `<div class="readiness-strip__row"><span>#${s.rank} ${esc(s.inst.short)}</span><span class="mini-track" style="width:100%"><span style="width:${s.total / 10}%;background:var(--primary)"></span></span><b>${s.total}</b></div>`).join('')}</div></div>
      <p class="cell-muted">Positions are the live readiness ranking (coverage, data quality, timeliness, automation). Sign in to see your own.</p>
    </aside>
  </div>`;
  $('#main').removeAttribute('aria-busy');

  const sel = $('#instSelect'), pass = $('#btnPass');
  sel.addEventListener('change', () => { pass.disabled = !sel.value; $('#passHint').textContent = sel.value ? 'UAE PASS opens in a new window; you return signed in as Institution Admin.' : 'Choose your institution above to continue.'; });
  pass.addEventListener('click', () => { K.setOwn(sel.value); window.KHDA_ROLES.set('inst'); location.href = 'dashboard.html'; });
  $('#btnAd').addEventListener('click', () => { window.KHDA_ROLES.set('khda'); location.href = 'sector.html'; });
})();
