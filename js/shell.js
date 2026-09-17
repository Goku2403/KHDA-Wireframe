/* Portal shell additions on every page: light / dark theme toggle, global search (datasets, receipts, pages),
   the notifications bell (returned datasets, overdue, recent acceptances — from the submission model when it is
   loaded), and sign-out to the sign-in page. Everything is injected into the existing header tools. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const t = (k, v) => (window.t ? window.t(k, v) : k);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

  // ---------- theme ----------
  const THEME = 'khda.theme';
  function applyTheme(mode) { if (mode === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme'); }
  applyTheme(ls.get(THEME));

  const tools = $('.portal-tools'), anchor = tools && tools.querySelector('.tool-pill--icon');
  if (!tools || !anchor) return;
  const svg = p => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICON = { moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', bell: '<path d="M6 8a6 6 0 0 1 12 0v5l2 3H4l2-3z"/><path d="M10 19a2 2 0 0 0 4 0"/>' };

  // search pill
  const search = document.createElement('button'); search.type = 'button'; search.className = 'tool-pill tool-pill--search'; search.id = 'shellSearch'; search.setAttribute('aria-haspopup', 'dialog');
  search.innerHTML = svg(ICON.search) + `<span>${esc(t('shell.search'))}</span>`;
  // notifications bell
  const bell = document.createElement('button'); bell.type = 'button'; bell.className = 'tool-pill tool-pill--round'; bell.id = 'shellBell'; bell.setAttribute('aria-label', t('shell.notifications')); bell.innerHTML = svg(ICON.bell);
  // theme toggle
  const theme = document.createElement('button'); theme.type = 'button'; theme.className = 'tool-pill tool-pill--round'; theme.id = 'shellTheme';
  const paintTheme = () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark'; theme.innerHTML = svg(dark ? ICON.sun : ICON.moon); theme.setAttribute('aria-label', t(dark ? 'shell.light' : 'shell.dark')); theme.setAttribute('aria-pressed', String(dark)); };
  paintTheme();
  theme.addEventListener('click', () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark'; applyTheme(dark ? 'light' : 'dark'); ls.set(THEME, dark ? 'light' : 'dark'); paintTheme(); });
  tools.insertBefore(search, anchor); tools.insertBefore(bell, anchor); tools.insertBefore(theme, anchor);

  // ---------- popovers ----------
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } document.querySelectorAll('#shellSearch,#shellBell').forEach(b => b.setAttribute('aria-expanded', 'false')); }
  function openPop(button, html, cls) {
    const same = pop && pop.dataset.for === button.id; closePop(); if (same) return;
    pop = document.createElement('div'); pop.className = 'shellpop ' + (cls || ''); pop.dataset.for = button.id; pop.innerHTML = html;
    document.body.append(pop);
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1; const b = button.getBoundingClientRect(); const w = pop.offsetWidth;
    const rtl = document.documentElement.dir === 'rtl';
    let left = rtl ? b.left / zoom : b.right / zoom - w; left = Math.max(8, Math.min(left, window.innerWidth / zoom - w - 8));
    pop.style.left = left + 'px'; pop.style.top = (b.bottom / zoom + 8) + 'px';
    button.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('mousedown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('#shellSearch,#shellBell')) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });

  // ---------- global search ----------
  const M = () => window.KHDA_MODEL;
  const DATA = () => window.KHDA_DATASETS || [];
  const titleOf = d => (M() ? M().titleOf(d) : d.title);
  const PAGES = [['dashboard.html', 'nav.dashboard'], ['submissions.html', 'nav.submissions'], ['status.html', 'nav.status'], ['monitor.html', 'nav.monitor'], ['reconciliation.html', 'nav.reconciliation'], ['compliance.html', 'nav.compliance'], ['leaderboard.html', 'nav.leaderboard'], ['api.html', 'nav.api']];
  function results(q) {
    q = q.trim().toLowerCase(); if (!q) return '';
    const subs = M() ? M().subs() : null;
    const ds = DATA().map(d => ({ d, s: subs ? subs.find(x => x.dataset === d) : null })).filter(({ d, s }) => (titleOf(d) + ' ' + d.sheet + ' ' + (s && s.receipt ? s.receipt.id : '')).toLowerCase().includes(q)).slice(0, 6);
    const pages = PAGES.filter(([, k]) => t(k).toLowerCase().includes(q));
    const row = (href, title, sub, chip) => `<a class="shellpop__item" href="${href}"><span class="shellpop__main"><span class="shellpop__title">${esc(title)}</span><span class="shellpop__sub">${esc(sub)}</span></span>${chip || ''}</a>`;
    return (ds.map(({ d, s }) => row('status.html?track=' + encodeURIComponent(d.sheet), titleOf(d), (s && s.receipt ? s.receipt.id + ' · ' : '') + d.group + ' · ' + d.fields.length + ' ' + t('status.fields'), s && window.KHDA_UI ? window.KHDA_UI.chip(s.status) : '')).join('')
      + pages.map(([href, k]) => row(href, t(k), t('shell.page'))).join('')) || `<div class="shellpop__empty">${esc(t('shell.noResults'))}</div>`;
  }
  search.addEventListener('click', () => {
    openPop(search, `<label class="search shellpop__search">${svg(ICON.search)}<input type="search" id="shellQ" placeholder="${esc(t('shell.searchHint'))}" aria-label="${esc(t('shell.search'))}"></label><div class="shellpop__list" id="shellResults"><div class="shellpop__empty">${esc(t('shell.searchHint'))}</div></div>`, 'shellpop--search');
    if (!pop) return; const inp = $('#shellQ'); inp.focus();
    inp.addEventListener('input', () => { $('#shellResults').innerHTML = results(inp.value) || `<div class="shellpop__empty">${esc(t('shell.searchHint'))}</div>`; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const a = $('#shellResults a'); if (a) location.href = a.href; } });
  });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.click(); } });

  // ---------- notifications ----------
  function feed() {
    const m = M(); if (!m) return [];
    const sm = m.summary(); const out = [];
    sm.all.filter(m.REQ).forEach(s => {
      const title = m.titleOf(s.dataset);
      if (m.RETURNED(s)) out.push({ k: 'error', title: t('shell.n.returned', { x: title, n: s.returnedCount }), text: t(m.SOURCE[s.status]) + ' · ' + t('portal.reconcile'), href: 'reconciliation.html?sheet=' + encodeURIComponent(s.dataset.sheet) });
      else if (s.req.due && !m.RECEIVED(s) && s.req.due < m.TODAY) out.push({ k: 'warning', title: t('shell.n.overdue', { x: title }), text: m.dueText(s), href: 'status.html?track=' + encodeURIComponent(s.dataset.sheet) });
      else if (m.ACCEPTED(s) && m.daysBetween(m.TODAY, s.receivedAt) <= 7) out.push({ k: 'success', title: t('shell.n.accepted', { x: title }), text: s.receipt.id, href: 'status.html?track=' + encodeURIComponent(s.dataset.sheet) });
    });
    return out.slice(0, 12);
  }
  function paintBell() { const n = feed().filter(i => i.k !== 'success').length; const old = bell.querySelector('.tool-pill__badge'); if (old) old.remove(); if (n) bell.insertAdjacentHTML('beforeend', `<span class="tool-pill__badge">${n > 9 ? '9+' : n}</span>`); }
  paintBell();
  document.addEventListener('khda:refresh', paintBell);
  bell.addEventListener('click', () => {
    const f = feed();
    openPop(bell, `<div class="shellpop__head"><b>${esc(t('shell.notifications'))}</b><span class="chip chip--outline">${f.length}</span></div><div class="shellpop__list">${f.map(i => `<a class="shellpop__item shellpop__item--${i.k}" href="${i.href}"><span class="shellpop__dot"></span><span class="shellpop__main"><span class="shellpop__title">${esc(i.title)}</span><span class="shellpop__sub">${esc(i.text)}</span></span></a>`).join('') || `<div class="shellpop__empty">${esc(t('shell.upToDate'))}</div>`}</div>`);
  });

  // ---------- sign out ----------
  const out = $('#btnLogout');
  if (out) out.addEventListener('click', () => { setTimeout(() => { location.href = 'login.html'; }, 500); });
})();
