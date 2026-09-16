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
  let scope = 'all', query = '', sort = 'az', page = 1;

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
      </div>
      <div class="ds-card__foot">
        <button class="btn btn--outline btn--card" type="button" data-details="${esc(d.sheet)}">${esc(t('cat.viewDetails'))}</button>
        <button class="btn btn--primary btn--card" type="button" data-start="${esc(d.sheet)}">${esc(t('cat.start'))}</button>
      </div>
    </article>`;
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

  function openDetails(sheet) {
    const d = DATA.find(x => x.sheet === sheet); if (!d) return;
    $('#detailsTitle').textContent = d.title;
    $('#detailsFields').innerHTML = `<table class="data-table data-table--plain">
      <thead><tr><th>${esc(t('cat.fieldName'))}</th><th>${esc(t('cat.dataType'))}</th><th>${esc(t('cat.mandatory'))}</th></tr></thead>
      <tbody>${d.fields.map(f => `<tr><td>${esc(f.n)}</td><td class="mono">${esc(f.t || '—')}</td><td>${f.r === 'Yes' ? '<span class="chip chip--error">Yes</span>' : esc(f.r || '—')}</td></tr>`).join('')}</tbody>
    </table>`;
    const startBtn = $('#detailsStart');
    startBtn.textContent = t('cat.start');
    startBtn.disabled = false;
    startBtn.onclick = () => { closeDetails(); start(d.sheet); };
    $('#detailsReport').onclick = () => { window.location.href = 'report.html?sheet=' + encodeURIComponent(d.sheet); };
    $('#detailsModal').hidden = false;
    document.body.classList.add('is-sheeting');
    $('#detailsClose').focus();
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
  $('#detailsClose').addEventListener('click', closeDetails);
  $('#detailsModal').addEventListener('mousedown', e => { if (e.target.id === 'detailsModal') closeDetails(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetails(); });

  // ---------- toast ----------
  function toast(kind, title, text) { window.khdaToast(kind, title, text); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  render();
})();
