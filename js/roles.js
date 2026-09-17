/* Roles — one header for every page. Four roles, no sub-roles or tiers: Institution · KHDA · KHDA Data · KHDA IT.
   The role lives in localStorage (khda.role); the sign-in pages and the account menu set it. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const t = (k, v) => (window.t ? window.t(k, v) : k);
  const KEY = 'khda.role';

  // Four roles, no sub-roles or tiers: Institution · KHDA (whole authority) · KHDA Data · KHDA IT
  const ROLES = {
    inst: { team: 'inst', label: 'Institution', name: 'Noura Al Khatib', home: 'dashboard.html' },
    khda: { team: 'khda', label: 'KHDA', name: 'Hessa Al Marri', home: 'sector.html' },
    data: { team: 'data', label: 'KHDA Data', name: 'Mariam Saeed', home: 'sector.html' },
    it: { team: 'it', label: 'KHDA IT', name: 'Yousef Karim', home: 'onboarding.html' },
  };
  const NAV = {
    inst: [['dashboard.html', 'nav.dashboard', 'Dashboard'], ['submissions.html', 'nav.submissions', 'Submissions']],
    khda: [['sector.html', 'nav.sector', 'Sector home'], ['khda-monitor.html', 'nav.khdaMonitor', 'Monitor'], ['khda-compliance.html', 'nav.khdaCompliance', 'Compliance history'], ['remediation.html', 'nav.remediation', 'Remediation report'], ['khda-leaderboard.html', 'nav.leaderboard', 'Leaderboard'], ['rules.html', 'nav.rules', 'Rule library'], ['onboarding.html', 'nav.onboarding', 'Onboarding'], ['credentials.html', 'nav.credentials', 'Credentials']],
    it: [['onboarding.html', 'nav.onboarding', 'Onboarding'], ['credentials.html', 'nav.credentials', 'Credentials'], ['rules.html', 'nav.rules', 'Rule library'], ['remediation.html', 'nav.remediation', 'Remediation report'], ['khda-monitor.html', 'nav.khdaMonitor', 'Monitor'], ['governance.html', 'nav.governance', 'Data Governance Policies'], ['api-integration.html', 'nav.apiIntegration', 'API Integration']],
  };
  const TEAM_LABEL = { inst: 'Institution', khda: 'KHDA', data: 'KHDA Data', it: 'KHDA IT' };

  function current() { let id = null; try { id = localStorage.getItem(KEY); } catch { /* ignore */ } return ROLES[id] ? id : 'inst'; }
  function set(id) { if (ROLES[id]) { try { localStorage.setItem(KEY, id); } catch { /* ignore */ } } }
  function role() { return { id: current(), ...ROLES[current()] }; }
  // no tiers: every KHDA role can do everything on the KHDA side; institution controls are open to the institution
  function can() { return role().team !== 'inst'; }
  function canRole() { return true; }
  const page = location.pathname.split('/').pop() || 'dashboard.html';

  // a page that belongs to a KHDA team is viewed with a role of that team (tier kept), so demos never dead-end
  function reconcile() {
    const need = document.body.dataset.team;
    const r = role();
    if (!need || need === r.team || r.team === 'khda' && need !== 'inst') return;
    if (need === 'khda') { if (r.team === 'inst') set('khda'); return; } // any KHDA role may view
    set(need === 'inst' ? 'inst' : need);
  }

  function renderHeader() {
    const r = role();
    const nav = $('.portal-nav');
    if (nav) {
      nav.innerHTML = NAV[r.team].map(([href, key, label]) =>
        `<a href="${href}"${page === href ? ' aria-current="page"' : ''} data-i18n="${key}">${label}</a>`).join('');
      if (window.KHDA_I18N && window.KHDA_I18N.apply) window.KHDA_I18N.apply(nav);
    }
    const roleEl = $('.tool-user__role'), nameEl = $('.tool-user__name');
    if (roleEl) { roleEl.removeAttribute('data-i18n'); roleEl.textContent = r.label; }
    if (nameEl) { nameEl.removeAttribute('data-i18n'); nameEl.textContent = r.name; }

    // assistant button sits before the accessibility control
    const tools = $('.portal-tools');
    const anchor = tools && tools.querySelector('.tool-pill--icon');
    if (tools && anchor && window.KHDA_SECTOR) {
      // KHDA-staff pages (v2) pick the reporting period here; institution pages have it in their title bars
      const team = document.body.dataset.team;
      if (team && team !== 'inst') {
        const per = document.createElement('label');
        per.className = 'tool-pill tool-pill--period';
        per.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
        <span class="sr-only">Reporting period</span>
        <select id="periodSelect" aria-label="Reporting period">${window.KHDA_SECTOR.PERIODS.map(p => `<option value="${p.id}"${p.id === window.KHDA_SECTOR.currentPeriod() ? ' selected' : ''}>${p.label}</option>`).join('')}</select>`;
        per.querySelector('select').addEventListener('change', e => { window.KHDA_SECTOR.setPeriod(e.target.value); location.reload(); });
        tools.insertBefore(per, anchor);
      }
      const bot = document.createElement('button');
      bot.type = 'button'; bot.className = 'tool-pill tool-pill--icon'; bot.id = 'chatbotToggle';
      bot.setAttribute('aria-label', 'Assistant'); bot.title = 'Assistant';
      bot.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>';
      tools.insertBefore(bot, anchor);
    }

    // account menu: role switcher (demo) above log out
    const menu = $('#userMenu');
    if (menu && !menu.querySelector('.user-menu__roles')) {
      const box = document.createElement('div');
      box.className = 'user-menu__roles';
      box.innerHTML = `<div class="user-menu__label">Switch role</div>` + Object.entries(ROLES).map(([id, x]) =>
        `<button type="button" role="menuitemradio" aria-checked="${id === r.id}" data-role-id="${id}">${x.label}</button>`).join('');
      menu.insertBefore(box, menu.firstChild);
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-role-id]'); if (!b) return;
        set(b.dataset.roleId);
        location.href = ROLES[b.dataset.roleId].home;
      });
    }
    const logout = $('#btnLogout');
    if (logout) logout.addEventListener('click', () => { location.href = 'login.html'; });
  }

  function gate(root) {
    const r = role();
    (root || document).querySelectorAll('[data-tier]').forEach(el => {
      const need = el.dataset.tier;
      const ok = can(need);
      el.classList.toggle('is-gated', !ok);
      if ('disabled' in el) el.disabled = !ok;
      el.setAttribute('aria-disabled', String(!ok));
      if (!ok) el.title = `Available to KHDA staff — you are ${r.label}`;
    });
    (root || document).querySelectorAll('[data-role]').forEach(el => {
      const ok = canRole(el.dataset.role);
      el.classList.toggle('is-gated', !ok);
      if ('disabled' in el) el.disabled = !ok;
      if (!ok) el.title = `Not available to ${r.label}`;
    });
  }

  reconcile();
  renderHeader();
  gate();

  window.KHDA_ROLES = { ROLES, NAV, role, set, can, canRole, gate, TEAM_LABEL };
})();
