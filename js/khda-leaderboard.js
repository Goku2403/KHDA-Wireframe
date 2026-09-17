/* Institution leaderboard (plan I-9) — corrected readiness score, podium, full rankings with
   per-row breakdown, "your next move", ranking over time, and the formula panel. */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const per = K.period();
  const list = K.ranking(per.id);
  const params = new URLSearchParams(location.search);
  const mine = R.role().team === 'inst' ? K.own() : (K.INSTITUTIONS.find(i => i.id === params.get('inst')) || null);
  const me = mine ? list.find(x => x.inst.id === mine.id) : null;
  const PAGE = 10;
  let page = 1, query = '', openRow = null;

  const bar = s => `<div class="score-bar" aria-hidden="true"><span class="score-bar__cov" style="width:${s.coverage / 10}%"></span><span class="score-bar__dq" style="width:${s.dq / 10}%"></span><span class="score-bar__time" style="width:${s.timeliness / 10}%"></span><span class="score-bar__auto" style="width:${s.automation / 10}%"></span></div>`;
  const move = s => s.movement > 0 ? `<span class="move-up">▲ ${s.movement} place${s.movement === 1 ? '' : 's'}</span>` : s.movement < 0 ? `<span class="move-down">▼ ${-s.movement} place${s.movement === -1 ? '' : 's'}</span>` : `<span class="move-flat">— no change</span>`;
  function spark(inst, primary) {
    const tr = K.trend(inst); const max = 1000;
    const pts = tr.map((p, i) => `${(i / (tr.length - 1)) * 116 + 2},${30 - (p.total / max) * 28}`);
    return `<svg class="spark${primary ? ' spark--primary' : ''}" viewBox="0 0 120 32" role="img" aria-label="Score trend ${tr.map(p => p.total).join(', ')}"><path d="M${pts.join(' L')}"/></svg>`;
  }
  const tiles = s => `<div class="score-tiles">
    <div class="score-tile"><b>${s.coverage}</b><span><i class="legend__dot" style="background:var(--primary)"></i>Coverage</span></div>
    <div class="score-tile"><b>${s.dq}</b><span><i class="legend__dot" style="background:var(--success)"></i>Data quality</span></div>
    <div class="score-tile"><b>${s.timeliness}</b><span><i class="legend__dot" style="background:var(--info)"></i>Timeliness</span></div>
    <div class="score-tile"><b>${s.automation}</b><span><i class="legend__dot" style="background:#7B61FF"></i>Automation</span></div></div>`;
  const breakdown = s => `<div class="breakdown">
    ${[['Coverage', 'coverage', 400], ['Data quality', 'dq', 250], ['Timeliness', 'timeliness', 200], ['Automation', 'automation', 150]].map(([l, k, m]) =>
      `<div class="breakdown__card"><div class="breakdown__head"><b>${l}</b><span>${s[k]} <small>/ ${m}</small></span></div><div class="mini-track" style="width:100%"><span style="width:${s[k] / m * 100}%;background:${k === 'coverage' ? 'var(--primary)' : k === 'dq' ? 'var(--success)' : k === 'timeliness' ? 'var(--info)' : '#7B61FF'}"></span></div><div class="breakdown__text">${esc(s.detail[k])}</div><code class="formula">${esc(s.detail[k + 'F'])}</code></div>`).join('')}
  </div><p class="cell-muted">${s.summary.received} datasets received · ${s.summary.rowsAccepted.toLocaleString()} rows accepted · ${s.summary.rowsRejected.toLocaleString()} rows rejected${s.prevRank ? ` · Previous recorded rank: #${s.prevRank}` : ''}</p>`;

  function rankChart(inst) {
    const tr = K.trend(inst); const W = 760, H = 240, L = 48, Rr = 24, T = 24, B = 40;
    const y = r => T + ((r - 1) / (K.INSTITUTIONS.length - 1)) * (H - T - B);
    const x = i => L + (i / (tr.length - 1)) * (W - L - Rr);
    const bench = K.INSTITUTIONS.length / 2;
    return `<svg class="chart-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rank per reporting period: ${tr.map(p => '#' + p.rank).join(', ')}">
      ${[1, 10, 19, 28, 37].map(r => `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${y(r)}" y2="${y(r)}"/><text class="lbl" x="${L - 8}" y="${y(r) + 4}" text-anchor="end">#${r}</text>`).join('')}
      <line class="axis" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/><line class="axis" x1="${L}" x2="${W - Rr}" y1="${H - B}" y2="${H - B}"/>
      <line class="line line--bench" x1="${L}" x2="${W - Rr}" y1="${y(bench)}" y2="${y(bench)}"/><text class="lbl" x="${W - Rr}" y="${y(bench) - 6}" text-anchor="end">sector median #${Math.round(bench)}</text>
      <path class="line" d="M${tr.map((p, i) => `${x(i)},${y(p.rank)}`).join(' L')}"/>
      ${tr.map((p, i) => `<circle class="pt" cx="${x(i)}" cy="${y(p.rank)}" r="5"/><text class="pt-lbl" x="${x(i)}" y="${y(p.rank) - 12}" text-anchor="middle">#${p.rank}</text><text class="lbl" x="${x(i)}" y="${H - B + 20}" text-anchor="middle">${esc(p.period.short)}</text>`).join('')}
    </svg>`;
  }

  function nextMoves(s) {
    const sm = s.summary;
    const items = [];
    if (sm.notSubmitted) items.push([`${sm.notSubmitted} required dataset${sm.notSubmitted === 1 ? '' : 's'} have no submission`, 'Start with the overdue ones in your agenda — coverage is worth 400 points.']);
    if (sm.rowsRejected) items.push([`${sm.rowsRejected.toLocaleString()} rows need correction`, 'Open the remediation report, fix in place and resubmit as a new version.']);
    if (sm.processing) items.push([`${sm.processing} submitted dataset${sm.processing === 1 ? '' : 's'} still in the pipeline`, 'Track them on the journey; no action until validation completes.']);
    if (sm.late) items.push([`${sm.late} dataset${sm.late === 1 ? '' : 's'} arrived late`, 'Each late day deducts a timeliness point — dispatch before the due date next period.']);
    if (sm.required - sm.apiCount > 0) items.push([`${sm.required - sm.apiCount} dataset${sm.required - sm.apiCount === 1 ? '' : 's'} not received via API`, 'Automation counts API receipts against required datasets — switch the remaining feeds.']);
    return items.slice(0, 4).map(([a, b], i) => `<div class="next-move"><span class="next-move__n">${i + 1}</span><div><div class="next-move__title">${esc(a)}</div><div class="next-move__text">${esc(b)}</div></div></div>`).join('');
  }

  function render() {
    const filtered = query ? list.filter(s => (s.inst.name + ' ' + s.inst.short).toLowerCase().includes(query)) : list;
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE)); if (page > pages) page = pages;
    const slice = filtered.slice((page - 1) * PAGE, page * PAGE);
    const top = list.slice(0, 3);
    $('#main').innerHTML = `
      <div class="page-head">
        <div><div class="page-head__eyebrow">KHDA · Data readiness</div><h1 class="page-head__title">Institution leaderboard</h1><p class="page-head__sub">Compare submission coverage, data quality, timeliness and automation across ${K.INSTITUTIONS.length} institutions · ${esc(per.label)}</p></div>
        <div class="page-head__actions"><a class="btn btn--outline" href="#how">How scores are calculated</a><span class="tier-chip">🏆 ${K.INSTITUTIONS.length} institutions ranked</span></div>
      </div>
      ${me ? `<section class="rank-hero" aria-label="Your rank">
        <div><div class="rank-hero__label">Your rank · ${esc(me.inst.short)}</div><div class="rank-hero__big">#${me.rank}<small>of ${K.INSTITUTIONS.length}</small></div><div>${move(me)}</div></div>
        <div><div class="rank-hero__label">Readiness score</div><div class="rank-hero__score">${me.total} <small>/ 1,000</small></div>${bar(me)}<div class="cell-muted" style="margin-top:8px">${esc(me.detail.coverage)}</div></div>
        <div><div class="rank-hero__label">Why this position?</div><p style="font:400 16px/24px var(--font);margin:4px 0 12px">${me.summary.required - me.summary.accepted} required datasets are not yet accepted. ${me.summary.dq == null ? 'No rows validated yet.' : me.summary.dq + '% of validated rows passed.'} ${me.summary.late ? me.summary.late + ' arrived late.' : 'None arrived late.'}</p><a class="btn btn--outline btn--md" href="${R.role().team === 'inst' ? 'submissions.html?view=table' : 'khda-monitor.html?inst=' + me.inst.id}">Review ${R.role().team === 'inst' ? 'my' : 'their'} datasets →</a></div>
      </section>` : ''}
      <section class="panel"><div class="panel__head"><div><h2 class="panel__title">🏆 Leading the way</h2><p class="panel__sub">Current standings · 1,000 points available</p></div></div>
        <div class="podium">${[top[1], top[0], top[2]].map((s, i) => `<article class="podium__card${i === 1 ? ' podium__card--first' : ''}">
          <div class="podium__place"><span>${['2nd place', '1st place', '3rd place'][i]}</span>${move(s)}</div>
          <div class="podium__who"><span class="podium__num">${s.rank}</span><div><div class="podium__name">${esc(s.inst.name)}</div><div class="podium__loc">${esc(s.inst.location)}</div></div><div class="podium__pts">${s.total}<small>points</small></div></div>
          ${bar(s)}${tiles(s)}
          <div class="inst-card__row"><span>Score trend · ${K.PERIODS.length} recorded periods</span>${spark(s.inst, i === 1)}</div>
        </article>`).join('')}</div>
      </section>
      <div class="grid-main-side">
        <section class="panel"><div class="panel__head"><div><h2 class="panel__title">Full rankings</h2><p class="panel__sub">${K.INSTITUTIONS.length} institutions · ${PAGE} per page</p></div>
          <div class="panel__tools">${me ? `<button class="btn btn--outline btn--md" type="button" id="findMe">◎ Find my position</button>` : ''}<label class="find" style="margin:0"><input class="control control--sm" id="rankSearch" placeholder="Find an institution…" aria-label="Find an institution" value="${esc(query)}"></label></div></div>
          <div class="legend legend--wrap"><span class="legend__item"><i class="legend__dot" style="background:var(--primary)"></i><span class="legend__label">Coverage 400</span></span><span class="legend__item"><i class="legend__dot" style="background:var(--success)"></i><span class="legend__label">Data quality 250</span></span><span class="legend__item"><i class="legend__dot" style="background:var(--info)"></i><span class="legend__label">Timeliness 200</span></span><span class="legend__item"><i class="legend__dot" style="background:#7B61FF"></i><span class="legend__label">Automation 150</span></span></div>
          <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Rank</th><th>Institution</th><th>Points</th><th>Accepted</th><th>Score trend</th><th>Movement</th><th></th></tr></thead>
          <tbody>${slice.map(s => `<tr class="${me && s.inst.id === me.inst.id ? 'is-selected' : ''}" id="row-${s.inst.id}"><td>${s.rank <= 3 ? '🏅 ' : ''}${s.rank}</td><td><div class="cell-title">${esc(s.inst.name)}${me && s.inst.id === me.inst.id ? ' <span class="chip chip--current">You</span>' : ''}</div><div class="cell-sub">${esc(s.inst.location)} · ${esc(s.inst.waveLabel)}</div></td><td><div>${s.total}</div>${bar(s)}</td><td>${s.summary.accepted} / ${s.summary.required}</td><td>${spark(s.inst)}</td><td>${move(s)}</td><td class="actions"><button class="icon-btn" type="button" data-open="${s.inst.id}" aria-expanded="${openRow === s.inst.id}" aria-label="Score breakdown"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button></td></tr>
            ${openRow === s.inst.id ? `<tr class="row-note" style="background:var(--surface)"><td colspan="7" style="background:var(--surface);box-shadow:none;padding:8px 24px 16px"><div class="cell-title" style="margin-bottom:4px">${esc(s.inst.name)} · score breakdown</div>${breakdown(s)}</td></tr>` : ''}`).join('')}</tbody></table></div>
          <div class="pagination"><span class="pagination__info">Showing ${(page - 1) * PAGE + 1} to ${Math.min(page * PAGE, filtered.length)} of ${filtered.length} institutions</span><div class="pagination__pages" id="rankPager">${Array.from({ length: pages }, (_, i) => `<button class="page-btn" type="button" data-page="${i + 1}"${i + 1 === page ? ' aria-current="page"' : ''}>${i + 1}</button>`).join('')}</div></div>
          <div class="panel__foot"><span>Open a row's breakdown to see where its points come from. Ties are ordered by coverage, then timeliness, then data quality.</span></div>
        </section>
        <div style="display:flex;flex-direction:column;gap:24px">
          ${me ? `<section class="panel panel--accent"><div><div class="page-head__eyebrow">Your next move</div><h2 class="panel__title">Climb the rankings</h2><p class="panel__sub">Focus on the gaps in ${esc(me.inst.short)}'s data.</p></div>${nextMoves(me)}<a class="btn btn--outline" href="${R.role().team === 'inst' ? 'submissions.html?view=table' : 'remediation.html?inst=' + me.inst.id}">Open ${R.role().team === 'inst' ? 'my' : 'the'} datasets →</a><p class="cell-muted">Your next steps improve readiness. Rank also depends on other institutions' scores.</p></section>
          <section class="panel"><h2 class="panel__title">Your score breakdown</h2><p class="panel__sub" style="margin-top:-12px">1,000 points available</p>${[['Coverage', 'coverage', 400, 'var(--primary)'], ['Data quality', 'dq', 250, 'var(--success)'], ['Timeliness', 'timeliness', 200, 'var(--info)'], ['Automation', 'automation', 150, '#7B61FF']].map(([l, k, m, c]) => `<div><div class="breakdown__head"><b>${l}</b><span>${me[k]} <small>/ ${m}</small></span></div><div class="mini-track" style="width:100%"><span style="width:${me[k] / m * 100}%;background:${c}"></span></div><div class="breakdown__text" style="margin-top:4px">${esc(me.detail[k])}</div><code class="formula" style="margin-top:6px">${esc(me.detail[k + 'F'])}</code></div>`).join('')}</section>` : ''}
        </div>
      </div>
      ${me ? `<section class="panel"><div class="panel__head"><div><h2 class="panel__title">📈 Ranking over time</h2><p class="panel__sub">Your position across reporting periods. Rank 1 is the highest; the dashed line is the sector median.</p></div><div class="panel__tools"><span class="tier-chip">Latest recorded rank #${me.rank}</span></div></div>${rankChart(me.inst)}</section>` : ''}
      <section class="panel" id="how"><div class="panel__head"><div><h2 class="panel__title">🧮 How the ranking is calculated</h2><p class="panel__sub">Each ratio is multiplied by its maximum points and rounded; lateness is deducted; the four scores are added. Denominators are <strong>required</strong> datasets, never "what was submitted".</p></div><span class="tier-chip">1,000 points available</span></div>
        <div class="table-wrap" style="border-radius:12px"><table class="data-table data-table--compact"><thead><tr><th>Measure</th><th>Formula and what counts</th><th>${esc(me ? me.inst.short : 'Top institution')} · calculation</th><th class="num">Points</th></tr></thead><tbody>
          ${[['Coverage', 400, 'Accepted ÷ required datasets × 400', 'Only datasets whose latest receipt is accepted count. Waived and not-applicable datasets leave the denominator.', 'coverage'],
            ['Data quality', 250, 'Accepted rows ÷ validated rows × 250', 'Summed across datasets, so a large dataset weighs more than a small one. Rows without a validation result do not count.', 'dq'],
            ['Timeliness', 200, 'On-time ÷ dated datasets × 200 − late days', 'On time = received on or before the due date. Every late day deducts one point (floor 0). Event-based datasets have no due date and are excluded.', 'timeliness'],
            ['Automation', 150, 'API receipts ÷ required datasets × 150', 'Counts against required datasets — an institution cannot score full automation by submitting only two datasets via API.', 'automation']].map(([l, m, f, note, k]) => { const s = me || top[0]; return `<tr><td><div class="cell-title">${l}</div><div class="cell-sub">Maximum ${m}</div></td><td><div>${esc(f)}</div><div class="cell-muted">${esc(note)}</div></td><td><code class="formula">${esc(s.detail[k + 'F'])}</code></td><td class="num">${s[k]} <span class="cell-muted">/ ${m}</span></td></tr>`; }).join('')}
        </tbody></table></div>
        ${(me || top[0]) ? `<div class="alert" style="background:var(--primary-container);color:var(--on-primary-container)"><div><div class="alert__title">${esc((me || top[0]).inst.short)} · total score: ${(me || top[0]).coverage} + ${(me || top[0]).dq} + ${(me || top[0]).timeliness} + ${(me || top[0]).automation} = <strong>${(me || top[0]).total}</strong> / 1,000</div><div class="alert__text">Current rank #${(me || top[0]).rank} of ${K.INSTITUTIONS.length} · Weights v1.0, effective ${esc(K.PERIODS[0].label)} — changes are versioned with an effective date by a KHDA Data Administrator.</div></div></div>` : ''}
        <div class="grid-3"><div><b style="font-weight:400">Rounding and missing data</b><p class="breakdown__text">Original counts are used; each measure rounds to the nearest whole point, half to even. A zero denominator scores 0.</p></div><div><b style="font-weight:400">Which receipts are included?</b><p class="breakdown__text">Standings use ${esc(per.label)}, latest receipt per dataset. Resubmissions replace earlier receipts; every version stays in the history.</p></div><div><b style="font-weight:400">From points to rank</b><p class="breakdown__text">Highest total first. Equal totals are ordered by coverage, then timeliness, then data quality — never by institution code.</p></div></div>
      </section>`;
    $('#main').removeAttribute('aria-busy');
    $('#rankSearch').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); page = 1; render(); $('#rankSearch').focus(); $('#rankSearch').setSelectionRange(query.length, query.length); });
    $('#rankPager').addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) { page = Number(b.dataset.page); render(); } });
    $('#main').querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { openRow = openRow === b.dataset.open ? null : b.dataset.open; render(); }));
    const fm = $('#findMe'); if (fm) fm.addEventListener('click', () => { query = ''; page = Math.ceil(me.rank / PAGE); openRow = me.inst.id; render(); const row = document.getElementById('row-' + me.inst.id); if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    if (window.KHDA_ROLES) window.KHDA_ROLES.gate();
  }
  render();
})();
