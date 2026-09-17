/* Assistant — scripted, source-citing chatbot over the dictionary, the rule library, the sector model
   and the submission history (plan X-1). Institution users are scoped to their own institution; KHDA
   staff see the sector. Every answer names its source and deep-links to the page that holds it.
   No free-text generation: answers are composed from structured data only. */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES, S = window.KHDA_SCHEMA;
  const DATA = window.KHDA_DATASETS || [];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (!K || !R) return;

  const HOST_ID = 'chatbotHost';
  let open = false, log = [];

  function scopeInst() { return R.role().team === 'inst' ? K.own() : null; }
  function per() { return K.period(); }

  function findDataset(q) {
    const s = q.toLowerCase();
    return DATA.map(d => ({ d, score: [K.titleOf(d), d.sheet, K.codeOf(d)].reduce((n, x) => n + (s.includes(x.toLowerCase()) ? x.length : 0), 0) }))
      .filter(x => x.score).sort((a, b) => b.score - a.score).map(x => x.d)[0]
      || DATA.find(d => { const w = K.titleOf(d).toLowerCase().split(/\W+/).filter(x => x.length > 4); return w.length && w.every(x => s.includes(x)); });
  }
  function findInst(q) {
    if (scopeInst()) return null; // institution users only ever see their own institution
    const s = q.toLowerCase();
    // whole-word match on the short name, so "overdue" never matches "UE" and "graduates" never matches "ADU"
    const words = s.split(/[^a-z0-9-]+/);
    return K.INSTITUTIONS.find(i => words.includes(i.short.toLowerCase()) || s.includes(i.name.toLowerCase()));
  }
  const src = (label, href) => `<a class="bot__src" href="${href}">${esc(label)}</a>`;
  const li = items => `<ul class="bot__list">${items.map(x => `<li>${x}</li>`).join('')}</ul>`;

  function answer(q) {
    const s = q.toLowerCase();
    const inst = findInst(q) || scopeInst();
    const scoped = scopeInst();
    const p = per();
    const ds = findDataset(q);

    if (/why|reject|fail|correction|issue|wrong/.test(s) && (ds || inst)) {
      const i = inst || K.INSTITUTIONS[0];
      const subs = K.subsOf(i, p).filter(x => x.status === 'needs_correction' && (!ds || x.dataset === ds));
      if (!subs.length) return { html: `<p>${esc(i.short)} has no dataset needing correction${ds ? ' for ' + esc(K.titleOf(ds)) : ''} in ${esc(p.label)}.</p>`, sources: [src('Sector model · ' + p.label, 'khda-monitor.html')] };
      const x = subs[0];
      return {
        html: `<p><strong>${esc(K.titleOf(x.dataset))}</strong> for ${esc(i.short)} was returned on ${esc(K.fmtDate(x.receivedAt))}: ${x.rowsRejected} of ${x.rowsAccepted + x.rowsRejected} rows failed ${x.issues.length} rule${x.issues.length === 1 ? '' : 's'}.</p>` +
          li(x.issues.map(is => `<span class="mono">${esc(is.id)}</span> ${esc(is.rule)} — ${is.rows} row${is.rows === 1 ? '' : 's'} · <em>${esc(is.fix)}</em>`)) +
          (subs.length > 1 ? `<p>${subs.length - 1} more dataset${subs.length === 2 ? '' : 's'} need correction.</p>` : ''),
        sources: [src('Remediation report', `remediation.html?inst=${i.id}&sheet=${encodeURIComponent(x.dataset.sheet)}`), src('Rule configuration', 'configuration.html?sheet=' + encodeURIComponent(x.dataset.sheet)), src('Dictionary · ' + x.dataset.sheet, 'submissions.html?details=' + encodeURIComponent(x.dataset.sheet))],
      };
    }
    if (/overdue|late|deadline|due/.test(s)) {
      if (scoped || inst) {
        const i = inst || scoped;
        const list = K.subsOf(i, p).filter(x => K.REQUIRED(x) && x.req.due && x.req.due < K.TODAY && !K.RECEIVED(x)).sort((a, b) => a.req.due - b.req.due);
        return { html: `<p>${esc(i.short)} has <strong>${list.length}</strong> overdue dataset${list.length === 1 ? '' : 's'} in ${esc(p.label)}.</p>` + li(list.slice(0, 6).map(x => `${esc(K.titleOf(x.dataset))} — ${esc(K.dueText(x))} (due ${esc(K.fmtDate(x.req.due))})`)), sources: [src('Requirement table · ' + p.label, scoped ? 'dashboard.html' : 'khda-monitor.html?inst=' + i.id)] };
      }
      const sec = K.sector(p.id).institutions.filter(x => x.overdue).sort((a, b) => b.overdue - a.overdue);
      return { html: `<p>${sec.length} institutions have overdue datasets${ds ? '' : ''}. Most overdue:</p>` + li(sec.slice(0, 6).map(x => `${esc(x.inst.short)} — ${x.overdue} overdue · ${esc(x.reason)}`)), sources: [src('Sector home', 'sector.html'), src('Requirement table', 'khda-compliance.html')] };
    }
    if (/rank|score|leaderboard|position|points/.test(s)) {
      const i = inst || K.INSTITUTIONS[0];
      const r = K.ranking(p.id).find(x => x.inst.id === i.id);
      return { html: `<p><strong>${esc(i.short)}</strong> is ranked <strong>#${r.rank}</strong> of ${K.INSTITUTIONS.length} with ${r.total} / 1,000 points in ${esc(p.label)}${r.movement ? ` (${r.movement > 0 ? '▲' : '▼'} ${Math.abs(r.movement)} since last period)` : ''}.</p>` + li([`Coverage ${r.coverage} / 400 — ${esc(r.detail.coverage)}`, `Data quality ${r.dq} / 250 — ${esc(r.detail.dq)}`, `Timeliness ${r.timeliness} / 200 — ${esc(r.detail.timeliness)}`, `Automation ${r.automation} / 150 — ${esc(r.detail.automation)}`]), sources: [src('Leaderboard · how scores are calculated', 'khda-leaderboard.html#how')] };
    }
    if (/compliant|follow.?up|at risk|sector|how many institutions/.test(s)) {
      const sec = K.sector(p.id);
      return { html: `<p>In ${esc(p.label)}: <strong>${sec.compliant}</strong> compliant, <strong>${sec.needsFollowUp}</strong> need follow-up (${sec.atRisk} at risk or blocked). ${sec.accepted.toLocaleString()} of ${sec.required.toLocaleString()} required datasets accepted; ${sec.rowsRejected.toLocaleString()} rows await correction.</p>`, sources: [src('Sector home', 'sector.html'), src('Monitor · matrix', 'khda-monitor.html?view=matrix')] };
    }
    if (/email|draft|remind|follow up with/.test(s) && inst) {
      const sm = K.summary(inst, p);
      return { html: `<p>Draft for ${esc(inst.short)}:</p><blockquote class="bot__quote">Dear ${esc(inst.short)} team,<br>We are following up on your ${esc(p.label)} submissions: ${sm.notSubmitted} not submitted, ${sm.needsCorrection} need correction, ${sm.processing} processing. ${sm.accepted} of ${sm.required} datasets are accepted. Please review the attached remediation report.<br>KHDA Data</blockquote>`, sources: [src('Open composer', 'khda-monitor.html?inst=' + inst.id + '&email=1'), src('Remediation report', 'remediation.html?inst=' + inst.id)] };
    }
    if (/dictionary|changed|2027|version/.test(s)) {
      return { html: `<p>The portal runs HEDB Data Dictionary <strong>2026</strong> (46 datasets, ${DATA.reduce((n, d) => n + d.fields.length, 0).toLocaleString()} fields). Dictionary 2027 is a data change, not a code change: forms, templates, validation and this assistant regenerate from the new file, and the rule library keeps both versions with effective periods.</p>`, sources: [src('Rule library · versions', 'configuration.html'), src('Submissions catalogue', 'submissions.html')] };
    }
    if (/api|credential|client id|secret|whitelist|allowlist|sandbox/.test(s)) {
      return { html: `<p>Institutions submit through iPaaS → Azure API Hub → adapter → Qlik DQ layer. Each institution holds one client ID per environment (sandbox, production), a secret shown once, a registered public key and an IP allowlist. KHDA IT issues and rotates them; institutions see status and last-used.</p>`, sources: [src('Credentials', 'credentials.html'), src('Onboarding board', 'onboarding.html')] };
    }
    if (/rule|mandatory|validation/.test(s) && ds) {
      const sc = S.get(ds.sheet);
      const mand = sc.fields.filter(f => f.required).length, coded = sc.fields.filter(f => f.listName || (f.opts && f.opts.length)).length; const pk = sc.pk.map(k => (sc.fields.find(f => f.key === k) || {}).label || k);
      return { html: `<p><strong>${esc(K.titleOf(ds))}</strong> has ${sc.fields.length} fields: ${mand} mandatory, ${coded} coded (must match a reference list)${pk.length ? `, primary key ${esc(pk.join(' + '))}` : ''}. Rules apply identically in the form, the Excel template, API validation and the remediation report.</p>`, sources: [src('Rule library · ' + ds.sheet, 'configuration.html?sheet=' + encodeURIComponent(ds.sheet)), src('Specification', 'submissions.html?details=' + encodeURIComponent(ds.sheet))] };
    }
    if (ds) {
      const i = inst || K.INSTITUTIONS[0];
      const x = K.subsOf(i, p).find(y => y.dataset === ds);
      return { html: `<p><strong>${esc(K.titleOf(ds))}</strong> (${esc(K.codeOf(ds))}) — ${esc(K.frequencyOf(ds))}, ${ds.fields.length} fields, subject area ${esc(K.areaOf(ds))}. For ${esc(i.short)} in ${esc(p.label)}: ${K.STATUS[x.status][0]} · ${esc(K.dueText(x))} · ${esc(K.freshness(x))}.</p>`, sources: [src('Specification', 'submissions.html?details=' + encodeURIComponent(ds.sheet)), src('Journey', (scoped ? 'submissions.html?details=' : 'khda-monitor.html?inst=' + i.id + '&sheet=') + encodeURIComponent(ds.sheet))] };
    }
    if (inst && !scoped) {
      const sm = K.summary(inst, p);
      return { html: `<p><strong>${esc(inst.name)}</strong> (${esc(inst.waveLabel)}, ${esc(inst.location)}) — ${K.INST_STATE[sm.state][0]}: ${sm.accepted} of ${sm.required} accepted, ${sm.needsCorrection} need correction, ${sm.overdue} overdue, DQ ${sm.dq == null ? '—' : sm.dq + '%'}. Owner: ${esc(inst.owner)} · liaison ${esc(inst.liaison)}.</p>`, sources: [src('Institution monitor', 'khda-monitor.html?inst=' + inst.id), src('Compliance history', 'khda-compliance.html?inst=' + inst.id)] };
    }
    return { html: `<p>I can answer from the dictionary, the rule library, the requirement table and the submission history. Try one of the suggestions below.</p>`, sources: [] };
  }

  function suggestions() {
    const scoped = scopeInst();
    return scoped
      ? ['Which datasets are overdue?', 'Why was Graduates rejected?', 'What is my rank?', 'Rules for Employee - Basic Details', 'What changed in Dictionary 2027?', 'How do API credentials work?']
      : ['Which institutions need follow-up?', 'Which datasets are overdue for BITS?', 'Why was Graduates rejected for AUE?', 'Draft an email to Curtin', 'What is the rank of Hult?', 'Rules for Students - Enrollments'];
  }

  function render() {
    let host = document.getElementById(HOST_ID);
    if (!host) { host = document.createElement('div'); host.id = HOST_ID; document.body.append(host); }
    const scoped = scopeInst();
    host.innerHTML = `<aside class="bot${open ? ' is-open' : ''}" role="dialog" aria-label="Assistant" ${open ? '' : 'hidden'}>
      <div class="bot__head">
        <span class="bot__avatar" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 13h.01M15 13h.01"/></svg></span>
        <div><div class="bot__title">KHDA Assistant</div><div class="bot__scope">${scoped ? 'Scoped to ' + esc(scoped.short) : 'Sector view · ' + esc(R.role().label)} · ${esc(per().label)}</div></div>
        <button class="icon-btn" type="button" id="botClose" aria-label="Close"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="bot__log" id="botLog">
        ${log.length ? log.map(m => `<div class="bot__msg bot__msg--${m.who}">${m.who === 'user' ? esc(m.text) : m.html}${m.sources && m.sources.length ? `<div class="bot__sources">Sources: ${m.sources.join(' · ')}</div>` : ''}</div>`).join('')
          : `<div class="bot__msg bot__msg--bot"><p>Ask about datasets, rules, deadlines, rankings or institutions. Answers cite their source.</p></div>`}
      </div>
      <div class="bot__chips">${suggestions().map(q => `<button type="button" class="chip chip--outline" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="bot__form" id="botForm"><input class="control" id="botInput" placeholder="Ask the assistant…" autocomplete="off" aria-label="Ask the assistant"><button class="btn btn--primary btn--md" type="submit">Ask</button></form>
    </aside>`;
    if (open) {
      host.querySelector('#botClose').addEventListener('click', toggle);
      host.querySelector('#botForm').addEventListener('submit', e => { e.preventDefault(); ask(host.querySelector('#botInput').value); });
      host.querySelector('.bot__chips').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });
      const l = host.querySelector('#botLog'); l.scrollTop = l.scrollHeight;
      host.querySelector('#botInput').focus();
    }
  }
  function ask(q) {
    q = (q || '').trim(); if (!q) return;
    log.push({ who: 'user', text: q });
    const a = answer(q);
    log.push({ who: 'bot', html: a.html, sources: a.sources });
    render();
  }
  function toggle() { open = !open; render(); const b = document.getElementById('chatbotToggle'); if (b) b.setAttribute('aria-expanded', String(open)); }

  document.addEventListener('click', e => { if (e.target.closest('#chatbotToggle')) toggle(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(); });
  render();
  window.KHDA_BOT = { ask, toggle };
})();
