/* Onboarding board (plan T-1) — waves as managed objects; named touch points with dates, owners, evidence and
   go-live gates; per-institution journey. KHDA IT owns it; Supervisor signs off gates. */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const per = K.period();
  const params = new URLSearchParams(location.search);
  let inst = K.INSTITUTIONS.find(i => i.id === params.get('inst')) || null, wave = 0;
  const TP = ['Kick-off', 'Data mapping', 'Credentials issued', 'Sandbox test', 'Go-live gate', 'Production'];
  const stageOf = i => Math.min(6, Math.max(0, 6 - (i.wave - 1) * 2 + (K.hash(i.id + 'tp') % 3) - 1));
  const gateStatus = i => { const s = stageOf(i); return s >= 6 ? 'live' : s === 5 ? 'gate' : s >= 3 ? 'sandbox' : 'setup'; };
  const GATE = { live: ['Production', 'chip--complete'], gate: ['At go-live gate', 'chip--current'], sandbox: ['Sandbox', 'chip--pending'], setup: ['Setup', 'chip--neutral'] };

  function tpDate(i, n) { const s = stageOf(i); return n < s ? K.fmtDate(new Date(per.start.getTime() - (s - n) * 18 * 86400000)) : K.fmtDate(new Date(K.TODAY.getTime() + (n - s + 1) * 21 * 86400000)); }

  function renderBoard() {
    const list = K.INSTITUTIONS.filter(i => !wave || i.wave === wave);
    const byGate = k => K.INSTITUTIONS.filter(i => gateStatus(i) === k).length;
    $('#main').innerHTML = `
      <div class="page-head"><div><div class="page-head__eyebrow">KHDA IT · Onboarding</div><h1 class="page-head__title">Onboarding board</h1><p class="page-head__sub">${K.INSTITUTIONS.length} institutions in 4 waves · six named touch points from kick-off to production</p></div>
        <div class="page-head__actions"><button class="btn btn--outline" type="button" id="exportB">Export board</button><button class="btn btn--primary" type="button" id="newWave" data-tier="administrator">＋ Allocate wave</button></div></div>
      <div class="kpi-grid"><div class="kpi kpi--success"><div class="kpi__label">In production</div><div class="kpi__value">${byGate('live')}</div><div class="kpi__note">API live, credentials active</div></div><div class="kpi kpi--primary"><div class="kpi__label">At go-live gate</div><div class="kpi__value">${byGate('gate')}</div><div class="kpi__note">awaiting Supervisor sign-off</div></div><div class="kpi kpi--info"><div class="kpi__label">In sandbox</div><div class="kpi__value">${byGate('sandbox')}</div><div class="kpi__note">testing against Dictionary 2026</div></div><div class="kpi kpi--warning"><div class="kpi__label">Setup</div><div class="kpi__value">${byGate('setup')}</div><div class="kpi__note">kick-off or data mapping</div></div></div>
      <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Institutions by wave</h2><p class="panel__sub">Owner, commitment, current touch point and blocker. Open a row for the full journey.</p></div><div class="panel__tools">${[0, 1, 2, 3, 4].map(w => `<button class="chip-toggle" type="button" data-wave="${w}" aria-pressed="${wave === w}">${w ? (w === 1 ? 'Pilot Wave 1' : 'Wave ' + w) : 'All'} <span class="count-badge">${w ? K.INSTITUTIONS.filter(i => i.wave === w).length : K.INSTITUTIONS.length}</span></button>`).join('')}</div></div>
        <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Institution</th><th>Wave</th><th>KHDA owner</th><th>Commitment</th><th>Touch point</th><th>Gate</th><th>Blocker</th><th></th></tr></thead><tbody>
          ${list.map(i => { const s = stageOf(i), sm = K.summary(i, per); return `<tr><td><div class="cell-title">${esc(i.name)}</div><div class="cell-sub">${esc(i.location)} · ${esc(i.complexity)}</div></td><td>${esc(i.waveLabel)}</td><td>${esc(i.owner)}</td><td><span class="chip ${i.commitment === 'Confirmed' ? 'chip--complete' : 'chip--warning'}">${i.commitment}</span></td><td><div>${s >= 6 ? '6 · Production' : (s + 1) + ' · ' + TP[s]}</div><div class="mini-track"><span style="width:${s / 6 * 100}%"></span></div></td><td><span class="chip ${GATE[gateStatus(i)][1]}">${GATE[gateStatus(i)][0]}</span></td><td>${sm.needsCorrection > 3 ? '<span class="cell-late">Data corrections</span>' : i.commitment !== 'Confirmed' ? '<span class="cell-late">Commitment pending</span>' : '<span class="cell-muted">None recorded</span>'}</td><td class="actions"><a class="btn btn--text btn--sm" href="onboarding.html?inst=${i.id}">View journey →</a></td></tr>`; }).join('')}
        </tbody></table></div></section>`;
    $('#main').removeAttribute('aria-busy');
    $('#main').querySelectorAll('[data-wave]').forEach(b => b.addEventListener('click', () => { wave = Number(b.dataset.wave); renderBoard(); }));
    $('#exportB').addEventListener('click', () => window.khdaToast('success', 'Exported', 'onboarding-board.xlsx'));
    $('#newWave').addEventListener('click', () => { if (!R.can('administrator')) return window.khdaToast('error', 'Administrator tier required', 'Wave allocation is an Administrator action.'); window.khdaToast('info', 'Wave allocation', 'Opens the wave editor (not in this wireframe).'); });
    R.gate();
  }

  function renderInst() {
    const s = stageOf(inst), sm = K.summary(inst, per);
    const ACT = [['Kick-off call held', 'Yousef Karim', -60], ['Data mapping workbook received', inst.liaison, -41], ['Sandbox client ID issued', 'Ahmed Al Suwaidi', -30], ['IP allowlist request approved', 'Fatima Al Zaabi', -28], ['First sandbox submission validated', 'system', -12], ['Go-live checklist sent', 'Yousef Karim', -3]].slice(0, s + 1);
    $('#main').innerHTML = `
      <div class="page-head"><div><div class="page-head__eyebrow">Onboarding journey · ${esc(inst.waveLabel)}</div><h1 class="page-head__title">${esc(inst.name)}</h1><p class="page-head__sub">${esc(inst.location)} · ${esc(inst.complexity)} integration · owner ${esc(inst.owner)}</p></div>
        <div class="page-head__actions"><a class="btn btn--outline" href="onboarding.html">← Board</a><a class="btn btn--outline" href="credentials.html?inst=${inst.id}">Credentials</a><a class="btn btn--outline" href="monitor.html?inst=${inst.id}">Monitor</a><button class="btn btn--primary" type="button" id="signGate" data-tier="supervisor" ${s === 4 ? '' : 'disabled'}>Sign off go-live gate</button></div></div>
      <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Touch points</h2><p class="panel__sub">Each carries an owner, a date and evidence. Submission status never substitutes for a milestone.</p></div><span class="chip ${GATE[gateStatus(inst)][1]}">${GATE[gateStatus(inst)][0]}</span></div>
        <div class="touchpoints">${TP.map((n, i) => `<div class="tp ${i < s ? 'tp--done' : i === s ? 'tp--current' : ''}"><div class="tp__n">Touch point ${i + 1}</div><div class="tp__name">${n}</div><div class="tp__meta">${i < s ? '✓ Done · ' + tpDate(inst, i) : i === s ? 'In progress · due ' + tpDate(inst, i) : 'Planned · ' + tpDate(inst, i)}</div><div class="tp__meta">${['KHDA IT', 'Institution', 'KHDA IT', 'Institution', 'KHDA IT Supervisor', 'KHDA IT'][i]}</div>${i < s ? '<a class="btn btn--text btn--sm" href="#">Evidence →</a>' : ''}</div>`).join('')}</div>
        <dl class="kv"><div><dt>Group</dt><dd>${esc(inst.waveLabel)}</dd></div><div><dt>Owner</dt><dd>${esc(inst.owner)}</dd></div><div><dt>Liaison</dt><dd>${esc(inst.liaison)}</dd></div><div><dt>Commitment</dt><dd>${esc(inst.commitment)}</dd></div><div><dt>Complexity</dt><dd>${esc(inst.complexity)}</dd></div><div><dt>Default channel</dt><dd>${inst.channel === 'api' ? 'API' : 'Portal upload (exception)'}</dd></div><div><dt>Environments</dt><dd>${s >= 2 ? 'Sandbox' : '—'}${s >= 6 ? ' · Production' : ''}</dd></div></dl></section>
      <div class="grid-2">
        <section class="panel"><div class="panel__head"><h2 class="panel__title">Activity log</h2></div>${ACT.reverse().map(([what, who, d]) => `<div class="receipt"><span class="receipt__v" style="font-size:14px">${K.fmtDate(new Date(K.TODAY.getTime() + d * 86400000))}</span><div><div class="cell-title">${esc(what)}</div><div class="receipt__text">by ${esc(who)}</div></div></div>`).join('')}<div class="field-row" style="margin-top:8px"><label for="note">Note</label><input class="control" id="note" placeholder="Add a note to the journey…"></div><button class="btn btn--outline btn--md" type="button" id="addNote" style="align-self:flex-start">Add note</button></section>
        <section class="panel"><div class="panel__head"><h2 class="panel__title">Go-live gate checklist</h2></div>${[['Sandbox submission accepted for 3 datasets', s >= 4], ['Production client ID issued', s >= 5], ['IP allowlist applied in production', s >= 5], ['Institution Approver assigned', sm.received > 0], ['Dictionary 2026 schema acknowledged', s >= 2]].map(([t, ok]) => `<div class="receipt"><span>${ok ? '<span class="chip chip--complete">Done</span>' : '<span class="chip chip--neutral">Open</span>'}</span><div class="cell-title">${t}</div></div>`).join('')}</section>
      </div>`;
    $('#main').removeAttribute('aria-busy');
    $('#signGate').addEventListener('click', () => { if (!R.can('supervisor')) return window.khdaToast('error', 'Supervisor tier required', 'Gates are signed off by a KHDA IT Supervisor.'); window.khdaToast('success', 'Go-live gate signed', inst.short + ' moves to production · audit logged'); });
    $('#addNote').addEventListener('click', () => { const v = $('#note').value.trim(); if (v) { window.khdaToast('success', 'Note added', v); $('#note').value = ''; } });
    R.gate();
  }
  if (inst) renderInst(); else renderBoard();
})();
