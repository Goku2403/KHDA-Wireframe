/* Submissions catalogue — card list of the HEDB datasets with search, favourites, sort and paging.
   Layout follows Figma "Portal Delivery" › Services (3578:78576). */
(function () {
  'use strict';

  const DATA = window.KHDA_DATASETS || [];
  const FAV_KEY = 'khda.submissions.favourites';
  const PER_PAGE = 8;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let favourites = load();
  const K = window.KHDA_SECTOR, J = window.KHDA_JOURNEY;
  const PARAMS = new URLSearchParams(location.search);
  let scope = 'all', query = '', sort = 'az', page = 1;
  let view = PARAMS.get('view') === 'table' ? 'table' : 'cards', groupBy = 'area', statusFilter = PARAMS.get('status') || 'all';
  const OWN = K ? K.own() : null, PER = K ? K.period() : null;
  // requirement + receipt for this institution, merged with the draft saved in this browser
  function subOf(d) {
    if (!K) return null;
    const sub = K.subsOf(OWN, PER)[DATA.indexOf(d)];
    let draft = {}; try { draft = JSON.parse(localStorage.getItem('khda.hedb.' + d.sheet.replace(/[^A-Za-z0-9]+/g, '_') + '.v1') || '{}'); } catch { /* ignore */ }
    if (draft.submittedAt && !K.RECEIVED(sub)) return { ...sub, status: 'in_validation', receivedAt: new Date(draft.submittedAt), channel: 'portal', issues: [], version: 1 };
    if ((draft.records || []).length && sub.status === 'not_started') return { ...sub, status: 'draft' };
    return sub;
  }
  const inPipeline = st => st === 'dispatched' || st === 'in_validation';

  const ICONS = [
    [/applicant/i, '📥'], [/course/i, '📚'], [/employee|staff/i, '🧑‍🏫'], [/graduate/i, '🎓'],
    [/student/i, '🧑‍🎓'], [/licensure/i, '🪪'], [/scholarship|funding|financ/i, '💰'],
    [/internship/i, '🧰'], [/research|r&d|patent|publication|ip\b/i, '🔬'], [/skill|outcome|clo|plo/i, '🧠'],
    [/event/i, '📅'], [/program|operation|overview|leadership|partnership|employer|survey|startup/i, '🏛️'],
    [/micro/i, '🏅'], [/transaction|lifecycle|profile|background/i, '🔄'], [/determination|sod/i, '♿'], [/attrition/i, '📉'], [/enrol/i, '📈'],
  ];
  function iconFor(title) {
    for (const [re, ic] of ICONS) if (re.test(title)) return ic;
    return '📄';
  }
  function descFor(d) {
    return d.desc || `Submit the ${d.title} dataset for the selected academic period.`;
  }

  // ---------- state ----------
  function load() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); } }
  function persist() { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favourites])); } catch { /* ignore */ } }

  function visible() {
    let list = DATA.slice();
    if (scope === 'fav') list = list.filter(d => favourites.has(d.sheet));
    if (statusFilter !== 'all' && K) list = list.filter(d => { const x = subOf(d); return statusFilter === 'overdue' ? (x.req.due && x.req.due < K.TODAY && !K.RECEIVED(x)) : statusFilter === 'in_pipeline' ? inPipeline(x.status) : statusFilter === 'accepted' ? K.ACCEPTED(x) : x.status === statusFilter; });
    if (query) {
      const words = query.split(/\s+/).filter(Boolean);
      list = list.filter(d => {
        const hay = [d.title, d.desc, d.group, d.kind || '', d.sheet, d.fields.map(f => f.n).join(' ')].join(' ').toLowerCase();
        return words.every(w => hay.includes(w));
      });
    }
    list.sort((a, b) => sort === 'fields' ? b.fields.length - a.fields.length : (sort === 'za' ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title)));
    return list;
  }

  // ---------- render ----------
  function render() {
    const list = visible();
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    if (page > pages) page = pages;
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    $('#catCount').textContent = total === 1 ? t('cat.showingOne') : t('cat.showing', { n: total });
    if (view === 'table') {
      $('#catGrid').hidden = true; $('#catTable').hidden = total === 0; $('#catFoot').hidden = true; $('#catEmpty').hidden = total !== 0;
      $('#catTable').innerHTML = tableHtml(list);
      return;
    }
    $('#catTable').hidden = true;
    $('#catGrid').innerHTML = slice.map(cardHtml).join('');
    $('#catGrid').hidden = total === 0;
    $('#catEmpty').hidden = total !== 0;
    $('#catFoot').hidden = total === 0;

    const from = total ? (page - 1) * PER_PAGE + 1 : 0, to = Math.min(page * PER_PAGE, total);
    $('#catInfo').textContent = t('cat.results', { a: from, b: to, c: total });

    const pager = $('#catPager');
    pager.innerHTML = '';
    const arrow = (dir, p, disabled) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pager__arrow'; b.disabled = disabled;
      b.setAttribute('aria-label', dir === -1 ? t('common.prevPage') : t('common.nextPage'));
      b.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${dir === -1 ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}"/></svg>`;
      b.addEventListener('click', () => { page = p; render(); scrollToResults(); });
      pager.append(b);
    };
    arrow(-1, page - 1, page === 1);
    for (let p = 1; p <= pages; p++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pager__page'; b.textContent = p;
      if (p === page) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', () => { page = p; render(); scrollToResults(); });
      pager.append(b);
    }
    arrow(1, page + 1, page === pages);
  }

  function cardHtml(d) {
    const fav = favourites.has(d.sheet);
    return `<article class="ds-card" data-sheet="${esc(d.sheet)}">
      <div class="ds-card__head">
        <span class="ds-card__icon" aria-hidden="true">${iconFor(d.title)}</span>
        <span class="ds-card__actions">
        <button class="bookmark" type="button" data-report="${esc(d.sheet)}" title="${esc(t('cat.report'))}" aria-label="${esc(t('cat.report'))}: ${esc(d.title)}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>
        </button>
        <button class="bookmark${fav ? ' is-on' : ''}" type="button" data-fav="${esc(d.sheet)}"
          aria-pressed="${fav}" aria-label="${esc(t(fav ? 'cat.removeFav' : 'cat.addFav'))}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>
        </button>
        </span>
      </div>
      <h3 class="ds-card__title">${esc(d.title)}</h3>
      <p class="ds-card__desc">${esc(descFor(d))}</p>
      <div class="ds-card__meta">
        <span class="chip chip--${d.kind === 'Real-time' ? 'pending' : 'neutral'}">${esc(t('group.' + d.group))}</span>
        <span class="chip chip--outline">${esc(t('cat.fields', { n: d.fields.length }))}</span>
        ${K ? K.chip(subOf(d).status) : ''}${K && subOf(d).req.due && !K.RECEIVED(subOf(d)) ? `<span class="chip chip--outline" style="${/overdue/.test(K.dueText(subOf(d))) ? 'color:var(--error);border-color:var(--error)' : ''}">${esc(K.dueText(subOf(d)))}</span>` : ''}
      </div>
      <div class="ds-card__foot">
        <button class="btn btn--outline btn--card" type="button" data-details="${esc(d.sheet)}">${esc(t('cat.viewDetails'))}</button>
        <button class="btn btn--primary btn--card" type="button" data-start="${esc(d.sheet)}">${esc(t('cat.start'))}</button>
      </div>
    </article>`;
  }

  // ---------- table view (plan I-2): grouped by subject area / frequency, DS table columns ----------
  const AREA_ICON = { 'Students & applicants': '🧑‍🎓', 'Employees': '🧑‍🏫', 'Graduates': '🎓', 'Institution': '🏛️', 'Programs & courses': '📚', 'Research & innovation': '🔬' };
  function tableHtml(list) {
    const key = d => groupBy === 'area' ? K.areaOf(d) : groupBy === 'frequency' ? K.frequencyOf(d) : 'All datasets';
    const groups = {}; list.forEach(d => { (groups[key(d)] = groups[key(d)] || []).push(d); });
    const order = groupBy === 'area' ? K.AREAS : Object.keys(groups).sort();
    return order.filter(g => groups[g]).map((g, gi) => {
      const ds = groups[g]; const subs = ds.map(subOf);
      const accepted = subs.filter(K.ACCEPTED).length, attention = subs.filter(x => x.status === 'needs_correction' || (x.req.due && x.req.due < K.TODAY && !K.RECEIVED(x))).length;
      return `<details class="cat-group" ${gi === 0 || groupBy === 'none' || ds.length <= 4 ? 'open' : ''}>
        <summary class="cat-group__head"><span class="cat-group__icon" aria-hidden="true">${AREA_ICON[g] || '📁'}</span><span><span class="cat-group__name">${esc(g)}</span><br><span class="cat-group__meta">${ds.length} dataset${ds.length === 1 ? '' : 's'} · ${accepted} accepted</span></span><span class="mini-track" style="width:160px"><span style="width:${accepted / ds.length * 100}%"></span></span><span>${attention ? `<span class="chip chip--error">${attention} need attention</span>` : '<span class="chip chip--complete">On track</span>'}</span><svg class="cat-group__chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="cat-group__body"><table class="data-table data-table--compact" style="min-width:1000px"><thead><tr><th>Dataset</th><th>Frequency</th><th>Due</th><th>Submission status</th><th>Freshness</th><th>Remediation</th><th>Details</th></tr></thead><tbody>
          ${ds.map((d, i) => { const x = subs[i]; const late = /overdue|late/.test(K.dueText(x)); return `<tr><td><div class="cell-title">${esc(K.titleOf(d))}</div><div class="cell-code">${x.channel === 'api' ? '🔌' : '✓'} ${esc(K.codeOf(d))} · ${d.fields.length} fields</div></td><td>${esc(K.frequencyOf(d))}</td><td><div>${x.req.due ? K.fmtDate(x.req.due) : '—'}</div><div class="${late ? 'cell-late' : 'cell-muted'}">${esc(K.dueText(x))}</div></td><td>${K.chip(x.status)}</td><td><div>${x.receivedAt ? esc(K.freshness(x).split(' · ')[0]) : 'No receipt yet'}</div><div class="cell-muted">${x.receivedAt ? esc(K.freshness(x).split(' · ')[1]) + ' · v' + x.version : ''}</div></td><td>${x.status === 'needs_correction' ? `<a class="btn btn--outline btn--sm" href="remediation.html?sheet=${encodeURIComponent(d.sheet)}">🔧 ${x.issues.length} open rule${x.issues.length === 1 ? '' : 's'}</a>` : '<span class="cell-muted">No open issues</span>'}</td><td class="actions"><button class="btn btn--outline btn--sm" type="button" data-details="${esc(d.sheet)}">View details →</button> <button class="btn btn--primary btn--sm" type="button" data-start="${esc(d.sheet)}">${K.ACCEPTED(x) ? 'Resubmit' : x.status === 'draft' ? 'Continue' : 'Start'}</button></td></tr>`; }).join('')}
        </tbody></table></div></details>`;
    }).join('') + `<p class="results__info">${list.length} of ${DATA.length} datasets · Freshness shows when a submission was received and through which channel.</p>`;
  }

  function scrollToResults() {
    const y = $('.results').getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  // ---------- actions ----------
  // Start submission goes to a screen that asks how the institution wants to work,
  // then that screen opens the dataset in the chosen mode.
  function start(sheet) {
    window.KHDA_CHOOSE.open(sheet);
  }

  let detailsTab = PARAMS.get('tab') || 'spec';
  function openDetails(sheet, tab) {
    const d = DATA.find(x => x.sheet === sheet); if (!d) return;
    if (tab) detailsTab = tab;
    const x = K ? subOf(d) : null;
    const sc = window.KHDA_SCHEMA.get(d.sheet);
    $('#detailsTitle').textContent = K ? K.titleOf(d) : d.title;
    $('#detailsSub').textContent = K ? `${OWN.short} · ${K.codeOf(d)} · ${PER.label}` : d.sheet;
    $('#detailsMeta').innerHTML = K ? `${K.chip(x.status)}<span class="chip chip--neutral">${esc(K.frequencyOf(d))}</span><span class="chip chip--outline">${d.fields.length} fields</span>${x.req.due ? `<span class="chip chip--outline">Due ${esc(K.fmtDate(x.req.due))}</span>` : ''}<span class="chip chip--outline">${esc(K.areaOf(d))}</span>` : '';
    $('#detailsIssueCount').textContent = x ? x.issues.length : 0;
    document.querySelectorAll('#detailsTabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === detailsTab)));
    const ruleLines = f => {
      const out = [];
      if (f.required) out.push('Required field.');
      if (f.maxLen) out.push(`Maximum ${f.maxLen} characters.`);
      if (f.control === 'number') out.push(`${f.integer ? 'Whole' : 'Decimal'} number${f.min != null ? ' ≥ ' + f.min : ''}.`);
      if (f.control === 'date') out.push('Date in YYYY-MM-DD, not in the future.');
      if (f.listName) out.push(`Use the <a href="#">${esc(f.listName)}</a> reference list.`);
      if (f.desc) out.push(esc(f.desc));
      if (f.keyText) out.push(esc(f.keyText));
      if (f.email) out.push('Email format.');
      return out;
    };
    let html = '';
    if (detailsTab === 'spec') html = `<p class="cell-muted">Field definitions and rules for this dataset. Cross-dataset and reference checks appear with the field they apply to. <a href="rules.html?sheet=${encodeURIComponent(d.sheet)}">Open in the rule library →</a></p><table class="data-table data-table--plain data-table--compact"><thead><tr><th>Field</th><th>Type</th><th>Rule</th></tr></thead><tbody>${sc.fields.map((f, i) => `<tr><td><div class="cell-title">${esc(f.db)}</div><div class="cell-sub">${esc(f.label)}</div><div class="cell-code">Dictionary: ${esc(d.sheet)}, row ${i + 2}${f.required ? ' · required' : ''}</div></td><td class="mono">${esc(f.type || '—')}</td><td><ul class="spec-rules">${ruleLines(f).map(r => `<li>${r}</li>`).join('')}</ul></td></tr>`).join('')}</tbody></table>`;
    else if (detailsTab === 'subs') {
      const hist = K.PERIODS.map(p => ({ p, s: K.subsOf(OWN, p)[DATA.indexOf(d)] })).reverse();
      html = `<p class="cell-muted">Every receipt for this dataset, newest first. Resubmissions keep earlier versions.</p>` + hist.map(({ p, s }) => `<div class="receipt"><span class="receipt__v">${s.receivedAt ? 'v' + s.version : '—'}</span><div><div class="cell-title">${esc(p.label)}</div><div class="receipt__text">${s.receivedAt ? esc(K.fmtDateTime(s.receivedAt)) + ' · ' + (s.channel === 'api' ? 'API' : 'Portal') + ' · ' + (s.rowsAccepted + s.rowsRejected) + ' rows' : esc(K.STATUS[s.status][0])}</div></div>${K.chip(s.status)}</div>`).join('');
    } else if (detailsTab === 'issues') {
      html = x.issues.length ? `<p class="cell-muted">${x.rowsRejected} of ${x.rowsAccepted + x.rowsRejected} rows failed ${x.issues.length} rule${x.issues.length === 1 ? '' : 's'} on ${esc(K.fmtDate(x.receivedAt))}.</p>` + x.issues.map(i => `<div class="issue" style="padding:12px 0;grid-template-columns:80px minmax(0,1fr) 80px auto"><div><div class="issue__id">${esc(i.id)}</div><span class="chip ${i.severity === 'Error' ? 'chip--error' : 'chip--warning'}">${i.severity}</span></div><div><div class="issue__rule">${esc(i.rule)}</div><div class="issue__fix">Fix: ${esc(i.fix)}</div></div><div class="issue__rows">${i.rows}<small>rows</small></div><a class="btn btn--primary btn--sm" href="index.html?sheet=${encodeURIComponent(d.sheet)}&mode=form">Fix →</a></div>`).join('') + `<a class="btn btn--outline btn--md" href="remediation.html?sheet=${encodeURIComponent(d.sheet)}" style="align-self:flex-start">Full remediation report →</a>`
        : '<div class="empty empty--inline"><div class="empty__title">No open issues</div><div class="empty__text">Validation passed, or nothing has been received yet.</div></div>';
    } else html = `<p class="cell-muted">Where this submission is in the R1 pipeline: iPaaS → Azure API Hub → adapter → Qlik DQ validation → profiling → processing → Qlik Portal.</p>${J.render(x)}`;
    $('#detailsFields').innerHTML = html;
    const startBtn = $('#detailsStart');
    startBtn.textContent = x && K.ACCEPTED(x) ? 'Resubmit new version' : t('cat.start');
    startBtn.disabled = false;
    startBtn.onclick = () => { closeDetails(); start(d.sheet); };
    $('#detailsReport').onclick = () => { window.location.href = 'report.html?sheet=' + encodeURIComponent(d.sheet); };
    $('#detailsModal').hidden = false;
    document.body.classList.add('is-sheeting');
    if (!tab) $('#detailsClose').focus();
    $('#detailsTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) openDetails(sheet, b.dataset.tab); };
  }
  function closeDetails() {
    $('#detailsModal').hidden = true;
    document.body.classList.remove('is-sheeting');
  }

  // ---------- events ----------
  $('#catSearch').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); page = 1; render(); });
  $('#catSort').addEventListener('change', e => { sort = e.target.value; page = 1; render(); });
  $$('.pill').forEach(p => p.addEventListener('click', () => {
    $$('.pill').forEach(x => { x.setAttribute('aria-pressed', 'false'); x.classList.remove('pill--on'); });
    p.setAttribute('aria-pressed', 'true'); p.classList.add('pill--on');
    scope = p.dataset.scope; page = 1; render();
  }));
  $('#catGrid').addEventListener('click', e => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const s = fav.dataset.fav;
      if (favourites.has(s)) favourites.delete(s); else favourites.add(s);
      persist(); render();
      return;
    }
    const rep = e.target.closest('[data-report]'); if (rep) { window.location.href = 'report.html?sheet=' + encodeURIComponent(rep.dataset.report); return; }
    const det = e.target.closest('[data-details]'); if (det) { openDetails(det.dataset.details); return; }
    const st = e.target.closest('[data-start]'); if (st) start(st.dataset.start);
  });
  $('#catView').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    view = b.dataset.view;
    document.querySelectorAll('#catView button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === view)));
    $('#catGroupWrap').hidden = view !== 'table'; $('#catStatusWrap').hidden = view !== 'table';
    history.replaceState(null, '', 'submissions.html' + (view === 'table' ? '?view=table' : ''));
    render();
  });
  $('#catGroup').addEventListener('change', e => { groupBy = e.target.value; render(); });
  $('#catStatus').addEventListener('change', e => { statusFilter = e.target.value; page = 1; render(); });
  $('#catTable').addEventListener('click', e => {
    const det = e.target.closest('[data-details]'); if (det) { openDetails(det.dataset.details); return; }
    const st = e.target.closest('[data-start]'); if (st) start(st.dataset.start);
  });
  if (view === 'table') { document.querySelectorAll('#catView button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === 'table'))); $('#catGroupWrap').hidden = false; $('#catStatusWrap').hidden = false; $('#catStatus').value = statusFilter; }
  $('#detailsClose').addEventListener('click', closeDetails);
  $('#detailsModal').addEventListener('mousedown', e => { if (e.target.id === 'detailsModal') closeDetails(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetails(); });

  // ---------- toast ----------
  function toast(kind, title, text) { window.khdaToast(kind, title, text); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  render();
  if (PARAMS.get('details')) openDetails(PARAMS.get('details'), PARAMS.get('tab') || 'spec');
})();
