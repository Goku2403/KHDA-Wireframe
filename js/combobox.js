/* Searchable dropdown — progressive enhancement over a native <select>. The select stays in the DOM as
   the value source (so `el.value`, form reads and validation are untouched); a text control in front of it
   filters the code list as you type, with arrow keys / Enter / Escape and click-to-pick. Only long lists
   are enhanced; short ones keep the native menu. */
(function () {
  'use strict';
  const MIN_OPTIONS = 8, MAX_SHOWN = 200;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let openCombo = null;

  function enhance(sel) {
    if (sel.dataset.combo || sel.options.length - 1 < MIN_OPTIONS) return;
    sel.dataset.combo = '1';
    const opts = [...sel.options].filter(o => o.value !== '').map(o => ({ v: o.value, l: o.textContent, k: (o.value + ' ' + o.textContent).toLowerCase() }));
    const wrap = document.createElement('div'); wrap.className = 'combo';
    sel.parentNode.insertBefore(wrap, sel); wrap.append(sel);
    sel.classList.add('combo__native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'control control--select combo__input'; input.autocomplete = 'off'; input.spellcheck = false;
    input.id = sel.id + '-combo'; input.placeholder = sel.options[0] && sel.options[0].value === '' ? sel.options[0].textContent : '';
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-haspopup', 'listbox');
    const list = document.createElement('div'); list.className = 'combo__list'; list.id = input.id + '-list'; list.setAttribute('role', 'listbox'); list.hidden = true;
    input.setAttribute('aria-controls', list.id);
    wrap.append(input, list);
    // the field label keeps pointing at something focusable
    const label = sel.id && document.querySelector(`label[for="${sel.id}"]`); if (label) label.htmlFor = input.id;
    sel.addEventListener('focus', () => input.focus());   // error handling focuses the select; hand it on

    let active = -1, shown = [];
    const labelOf = v => { const o = opts.find(x => x.v === String(v)); return o ? o.l : ''; };
    function sync() { input.value = sel.value ? labelOf(sel.value) : ''; }
    function close(restore) {
      if (list.hidden) return;
      list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1;
      if (restore) sync();
      if (openCombo === close) openCombo = null;
    }
    function choose(o) {
      sel.value = o ? o.v : '';
      sync();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      close(false);
    }
    function render(q) {
      const s = q.trim().toLowerCase();
      shown = s ? opts.filter(o => o.k.includes(s)) : opts;
      const more = shown.length - MAX_SHOWN;
      list.innerHTML = (shown.slice(0, MAX_SHOWN).map((o, i) => `<div class="combo__opt${o.v === sel.value ? ' is-selected' : ''}" role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="${o.v === sel.value}">${esc(o.l)}</div>`).join('')
        || `<div class="combo__empty">${esc(window.t ? window.t('combo.noMatch') : 'No matches')}</div>`)
        + (more > 0 ? `<div class="combo__more">${esc(window.t ? window.t('combo.more', { n: more }) : `${more} more — keep typing`)}</div>` : '');
      active = -1;
      if (list.hidden) {
        if (openCombo && openCombo !== close) openCombo(true);
        list.hidden = false; input.setAttribute('aria-expanded', 'true'); openCombo = close;
      }
    }
    function setActive(i) {
      const items = list.querySelectorAll('.combo__opt'); if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach((el, k) => el.classList.toggle('is-active', k === active));
      input.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('focus', () => { input.select(); });
    input.addEventListener('click', () => { if (list.hidden) render(''); });
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(''); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) render(''); setActive(active - 1); }
      else if (e.key === 'Enter') { if (list.hidden) return; e.preventDefault(); if (active >= 0) choose(shown[active]); else if (shown.length === 1) choose(shown[0]); }
      else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); close(true); } }
      else if (e.key === 'Tab') close(true);
    });
    input.addEventListener('blur', () => setTimeout(() => {
      if (wrap.contains(document.activeElement)) return;
      // typed text that no longer names an option clears the value; an exact label match keeps it
      const hit = opts.find(o => o.l.toLowerCase() === input.value.trim().toLowerCase());
      if (!input.value.trim()) { if (sel.value) choose(null); else close(false); }
      else if (hit && hit.v !== sel.value) choose(hit);
      else close(true);
    }, 120));
    list.addEventListener('mousedown', e => e.preventDefault());   // keep focus on the input
    list.addEventListener('click', e => { const o = e.target.closest('.combo__opt'); if (o) choose(shown[+o.dataset.i]); });
    sel.addEventListener('change', sync);
    sel.khdaComboSync = sync;
    sync();
  }

  function enhanceAll(root) { (root || document).querySelectorAll('select.control--select:not([data-combo])').forEach(enhance); }
  function syncAll(root) { (root || document).querySelectorAll('select[data-combo]').forEach(s => s.khdaComboSync && s.khdaComboSync()); }
  document.addEventListener('mousedown', e => { if (openCombo && !e.target.closest('.combo')) openCombo(true); });

  window.khdaCombobox = { enhance, enhanceAll, syncAll };
})();
