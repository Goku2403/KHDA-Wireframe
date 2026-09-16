/* Accessibility settings behind the portal header's accessibility button.
   Choices are written as attributes on <html> so CSS can react, and kept in localStorage
   so they follow the user across every page of the portal. */
(function () {
  'use strict';

  const KEY = 'khda.a11y.v1';
  const t = (k, v) => (window.t ? window.t(k, v) : k);

  const DEFAULTS = { zoom: 1, contrast: 'normal', motion: 'normal', links: 'default', spacing: 'normal' };

  let prefs = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    prefs = { ...DEFAULTS, ...saved };
  } catch { /* ignore */ }

  // Honour the operating system's own setting the first time, unless the user has chosen.
  try {
    if (!localStorage.getItem(KEY) && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      prefs.motion = 'reduced';
    }
  } catch { /* ignore */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }

  function apply() {
    const root = document.documentElement;
    root.dataset.contrast = prefs.contrast;
    root.dataset.motion = prefs.motion;
    root.dataset.links = prefs.links;
    root.dataset.spacing = prefs.spacing;
    root.style.setProperty('--a11y-zoom', String(prefs.zoom));
    if (typeof window.khdaFit === 'function') window.khdaFit();
  }

  // ---------- panel ----------
  const ZOOMS = [1, 1.15, 1.3];

  function optionRow(group, label, options, current) {
    return `<div class="a11y__row" role="group" aria-label="${esc(label)}">
      <span class="a11y__label">${esc(label)}</span>
      <div class="segmented segmented--pill a11y__choices" data-group="${group}">
        ${options.map(o => `<button type="button" data-value="${esc(o.value)}"
          aria-pressed="${String(o.value) === String(current)}">${esc(o.label)}</button>`).join('')}
      </div>
    </div>`;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function panelHtml() {
    return `
      <div class="a11y__head">
        <h2 class="a11y__title">${esc(t('a11y.title'))}</h2>
        <button class="icon-btn" type="button" id="a11yClose" aria-label="${esc(t('common.close'))}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      ${optionRow('zoom', t('a11y.zoom'), [
        { value: 1, label: t('a11y.zoom100') },
        { value: 1.15, label: t('a11y.zoom115') },
        { value: 1.3, label: t('a11y.zoom130') },
      ], prefs.zoom)}
      ${optionRow('contrast', t('a11y.contrast'), [
        { value: 'normal', label: t('a11y.off') },
        { value: 'high', label: t('a11y.on') },
      ], prefs.contrast)}
      ${optionRow('spacing', t('a11y.spacing'), [
        { value: 'normal', label: t('a11y.off') },
        { value: 'loose', label: t('a11y.on') },
      ], prefs.spacing)}
      ${optionRow('links', t('a11y.links'), [
        { value: 'default', label: t('a11y.off') },
        { value: 'underline', label: t('a11y.on') },
      ], prefs.links)}
      ${optionRow('motion', t('a11y.motion'), [
        { value: 'normal', label: t('a11y.off') },
        { value: 'reduced', label: t('a11y.on') },
      ], prefs.motion)}
      <div class="a11y__foot">
        <button class="btn btn--outline btn--sm" type="button" id="a11yReset">${esc(t('a11y.reset'))}</button>
      </div>`;
  }

  function build() {
    const pill = document.querySelector('.tool-pill--icon');
    if (!pill) return;

    pill.setAttribute('aria-haspopup', 'dialog');
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-controls', 'a11yPanel');

    const wrap = document.createElement('div');
    wrap.className = 'tool-a11y';
    pill.parentNode.insertBefore(wrap, pill);
    wrap.append(pill);

    const panel = document.createElement('div');
    panel.className = 'a11y';
    panel.id = 'a11yPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', t('a11y.title'));
    panel.hidden = true;
    wrap.append(panel);

    function open() {
      panel.innerHTML = panelHtml();
      panel.hidden = false;
      pill.setAttribute('aria-expanded', 'true');
      const first = panel.querySelector('button');
      if (first) first.focus();
    }
    function close(focusPill) {
      if (panel.hidden) return;
      panel.hidden = true;
      pill.setAttribute('aria-expanded', 'false');
      if (focusPill) pill.focus();
    }

    pill.addEventListener('click', e => {
      e.stopPropagation();
      if (panel.hidden) open(); else close();
    });
    panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => close());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close(true);
    });

    panel.addEventListener('click', e => {
      const choice = e.target.closest('[data-value]');
      if (choice) {
        const group = choice.closest('[data-group]').dataset.group;
        const raw = choice.dataset.value;
        prefs[group] = group === 'zoom' ? Number(raw) : raw;
        save(); apply();
        choice.parentNode.querySelectorAll('button').forEach(b =>
          b.setAttribute('aria-pressed', String(b === choice)));
        return;
      }
      if (e.target.closest('#a11yReset')) {
        prefs = { ...DEFAULTS };
        save(); apply(); open();
        if (window.khdaToast) window.khdaToast('info', t('a11y.resetDone'), t('a11y.resetText'));
        return;
      }
      if (e.target.closest('#a11yClose')) close(true);
    });
  }

  // ---------- skip link ----------
  function skipLink() {
    const main = document.querySelector('main');
    if (!main) return;
    if (!main.id) main.id = 'main';
    const a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#' + main.id;
    a.textContent = t('a11y.skip');
    a.addEventListener('click', () => {
      main.setAttribute('tabindex', '-1');
      setTimeout(() => main.focus(), 0);
    });
    document.body.insertBefore(a, document.body.firstChild);
  }

  function boot() { apply(); skipLink(); build(); }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KHDA_A11Y = { get: () => ({ ...prefs }), apply };
})();
