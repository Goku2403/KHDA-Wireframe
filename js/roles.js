/* Roles and tiers — one header for every page.
   Institution: Institution Admin · Data Steward · Approver · Read-only.
   KHDA: team (Data | IT) × tier (Analyst < Supervisor < Administrator).
   The role lives in localStorage (khda.role); the sign-in page and the account menu set it.
   Controls gated by tier carry data-tier="supervisor|administrator" (KHDA) or data-role="steward,approver" (institution);
   a user below the tier sees the control disabled with the reason, never hidden — plan §5 "honest actions". */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const t = (k, v) => (window.t ? window.t(k, v) : k);
  const KEY = 'khda.role';

  const TIER = { analyst: 1, supervisor: 2, administrator: 3 };
  const ROLES = {
    inst_admin: { team: 'inst', label: 'Institution Admin', name: 'Noura Al Khatib', home: 'dashboard.html' },
    steward: { team: 'inst', label: 'Data Steward', name: 'Omar Haddad', home: 'dashboard.html' },
    approver: { team: 'inst', label: 'Approver', name: 'Layla Rashid', home: 'dashboard.html' },
    readonly: { team: 'inst', label: 'Read-only', name: 'Sami Farouk', home: 'dashboard.html' },
    data_analyst: { team: 'data', tier: 'analyst', label: 'KHDA Data · Analyst', name: 'Mariam Saeed', home: 'sector.html' },
    data_supervisor: { team: 'data', tier: 'supervisor', label: 'KHDA Data · Supervisor', name: 'Khalid Al Mansoori', home: 'sector.html' },
    data_admin: { team: 'data', tier: 'administrator', label: 'KHDA Data · Administrator', name: 'Hessa Al Marri', home: 'sector.html' },
    it_analyst: { team: 'it', tier: 'analyst', label: 'KHDA IT · Analyst', name: 'Yousef Karim', home: 'onboarding.html' },
    it_supervisor: { team: 'it', tier: 'supervisor', label: 'KHDA IT · Supervisor', name: 'Fatima Al Zaabi', home: 'onboarding.html' },
    it_admin: { team: 'it', tier: 'administrator', label: 'KHDA IT · Administrator', name: 'Ahmed Al Suwaidi', home: 'onboarding.html' },
  };
  const NAV = {
    inst: [['dashboard.html', 'nav.dashboard', 'Dashboard'], ['submissions.html', 'nav.submissions', 'Submissions'], ['status.html', 'nav.status', 'Submission status'], ['monitor.html', 'nav.monitor', 'Data monitor'], ['reconciliation.html', 'nav.reconciliation', 'Remediation'], ['khda-compliance.html', 'nav.khdaCompliance', 'Compliance history'], ['leaderboard.html', 'nav.leaderboard', 'Leaderboard'], ['api.html', 'nav.api', 'REST API'], ['credentials.html', 'nav.integration', 'Integration']],
    data: [['sector.html', 'nav.sector', 'Sector home'], ['khda-monitor.html', 'nav.khdaMonitor', 'Monitor'], ['khda-compliance.html', 'nav.khdaCompliance', 'Compliance history'], ['remediation.html', 'nav.remediation', 'Remediation report'], ['khda-leaderboard.html', 'nav.leaderboard', 'Leaderboard'], ['rules.html', 'nav.rules', 'Rule library']],
    it: [['onboarding.html', 'nav.onboarding', 'Onboarding'], ['credentials.html', 'nav.credentials', 'Credentials'], ['rules.html', 'nav.rules', 'Rule library'], ['remediation.html', 'nav.remediation', 'Remediation report'], ['khda-monitor.html', 'nav.khdaMonitor', 'Monitor']],
  };
  const TEAM_LABEL = { inst: 'Institution', data: 'KHDA Data', it: 'KHDA IT' };

  function current() { let id = null; try { id = localStorage.getItem(KEY); } catch { /* ignore */ } return ROLES[id] ? id : 'inst_admin'; }
  function set(id) { if (ROLES[id]) { try { localStorage.setItem(KEY, id); } catch { /* ignore */ } } }
  function role() { return { id: current(), ...ROLES[current()] }; }
  function can(tier) { const r = role(); return r.team === 'inst' ? false : TIER[r.tier] >= TIER[tier]; }
  function canRole(list) { const r = role(); return r.team !== 'inst' || list.split(',').includes(r.id); }
  const page = location.pathname.split('/').pop() || 'dashboard.html';

  // a page that belongs to a KHDA team is viewed with a role of that team (tier kept), so demos never dead-end
  function reconcile() {
    const need = document.body.dataset.team;
    const r = role();
    if (!need || need === r.team) return;
    if (need === 'khda') { if (r.team === 'inst') set('data_analyst'); return; } // any KHDA team may view
    if (need === 'inst') { set('inst_admin'); return; }
    const tier = r.tier || 'analyst';
    set(need + '_' + (tier === 'administrator' ? 'admin' : tier));
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

    // reporting-period selector + assistant button sit before the accessibility control
    const tools = $('.portal-tools');
    const anchor = tools && tools.querySelector('.tool-pill--icon');
    if (tools && anchor && window.KHDA_SECTOR) {
      const per = document.createElement('label');
      per.className = 'tool-pill tool-pill--period';
      per.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
        <span class="sr-only">Reporting period</span>
        <select id="periodSelect" aria-label="Reporting period">${window.KHDA_SECTOR.PERIODS.map(p => `<option value="${p.id}"${p.id === window.KHDA_SECTOR.currentPeriod() ? ' selected' : ''}>${p.label}</option>`).join('')}</select>`;
      per.querySelector('select').addEventListener('change', e => { window.KHDA_SECTOR.setPeriod(e.target.value); location.reload(); });
      tools.insertBefore(per, anchor);
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
      box.innerHTML = `<div class="user-menu__label">Switch role</div>` + ['inst', 'data', 'it'].map(team => `
        <div class="user-menu__group">${TEAM_LABEL[team]}</div>
        ${Object.entries(ROLES).filter(([, x]) => x.team === team).map(([id, x]) =>
          `<button type="button" role="menuitemradio" aria-checked="${id === r.id}" data-role-id="${id}">${x.label.replace(/^KHDA (Data|IT) · /, '')}</button>`).join('')}`).join('');
      menu.insertBefore(box, menu.firstChild);
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-role-id]'); if (!b) return;
        set(b.dataset.roleId);
        location.href = ROLES[b.dataset.roleId].home;
      });
    }
    if (menu && !menu.querySelector('.theme-row')) {
      const row = document.createElement('div');
      row.className = 'theme-row';
      const on = document.documentElement.dataset.theme === 'dark';
      row.innerHTML = `<span>Dark theme</span><button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="Dark theme"></button>`;
      row.querySelector('.switch').addEventListener('click', e => {
        const next = e.currentTarget.getAttribute('aria-checked') !== 'true';
        e.currentTarget.setAttribute('aria-checked', String(next));
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
        try { localStorage.setItem('khda.theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
      });
      menu.insertBefore(row, menu.querySelector('.user-menu__logout'));
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
      if (!ok) el.title = `Requires ${need.charAt(0).toUpperCase() + need.slice(1)} tier — you are ${r.label}`;
    });
    (root || document).querySelectorAll('[data-role]').forEach(el => {
      const ok = canRole(el.dataset.role);
      el.classList.toggle('is-gated', !ok);
      if ('disabled' in el) el.disabled = !ok;
      if (!ok) el.title = `Available to ${el.dataset.role.split(',').map(id => ROLES[id] ? ROLES[id].label : id).join(' or ')} — you are ${r.label}`;
    });
  }

  try { document.documentElement.dataset.theme = localStorage.getItem('khda.theme') === 'dark' ? 'dark' : 'light'; } catch { /* ignore */ }
  reconcile();
  renderHeader();
  gate();

  window.KHDA_ROLES = { ROLES, TIER, NAV, role, set, can, canRole, gate, TEAM_LABEL };
})();
