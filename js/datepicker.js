/* KHDA date picker — replaces the native browser calendar.
   Usage: <div class="datefield"><input class="control" type="text" data-datepicker placeholder="YYYY-MM-DD"></div>
   Value format is always YYYY-MM-DD (HEDB Last_Updated). Dispatches a "change" event on selection. */
(function () {
  'use strict';

  const LOCALE = () => (window.KHDA_I18N && window.KHDA_I18N.lang === 'ar' ? 'ar-AE' : 'en-GB');
  const MONTHS = () => Array.from({ length: 12 }, (_, m) =>
    new Date(2020, m, 1).toLocaleDateString(LOCALE(), { month: 'long' }));
  const DAY_NAMES = {
    en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    ar: ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'],
  };
  const DAYS = () => DAY_NAMES[(window.KHDA_I18N && window.KHDA_I18N.lang) === 'ar' ? 'ar' : 'en'];
  const dpT = k => (window.t ? window.t(k) : k);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) || iso(d) !== s ? null : d; };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  let open = null; // { wrap, input, pop, view }

  function build(input) {
    const wrap = input.closest('.datefield') || input.parentElement;
    wrap.classList.add('datefield');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('maxlength', '10');
    if (!input.placeholder) input.placeholder = 'YYYY-MM-DD';

    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'datefield__btn'; btn.setAttribute('aria-label', 'Open calendar');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>';
    wrap.append(btn);

    const pop = document.createElement('div');
    pop.className = 'datepicker'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose date');
    wrap.append(pop);

    const state = { wrap, input, pop, view: null, max: input.dataset.max === 'today' ? today() : null };

    btn.addEventListener('click', () => (pop.hidden ? show(state) : hide()));
    input.addEventListener('focus', () => show(state));
    input.addEventListener('input', () => {
      // auto-insert dashes while typing digits
      const digits = input.value.replace(/\D/g, '').slice(0, 8);
      let v = digits;
      if (digits.length > 4) v = digits.slice(0, 4) + '-' + digits.slice(4);
      if (digits.length > 6) v = v.slice(0, 7) + '-' + digits.slice(6);
      if (v !== input.value) input.value = v;
      const d = parse(input.value);
      if (d) { state.view = new Date(d.getFullYear(), d.getMonth(), 1); if (!pop.hidden) render(state); }
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); if (e.key === 'Enter') { e.preventDefault(); hide(); } });

    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.nav) { state.view.setMonth(state.view.getMonth() + Number(b.dataset.nav)); render(state); return; }
      if (b.dataset.day) { set(state, b.dataset.day); hide(); return; }
      if (b.dataset.action === 'clear') { set(state, ''); hide(); return; }
      if (b.dataset.action === 'today') { set(state, iso(today())); hide(); return; }
    });
  }

  function set(state, value) {
    state.input.value = value;
    state.input.dispatchEvent(new Event('input', { bubbles: true }));
    state.input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function show(state) {
    if (open && open !== state) hide();
    const d = parse(state.input.value) || today();
    state.view = new Date(d.getFullYear(), d.getMonth(), 1);
    render(state);
    state.pop.hidden = false;
    open = state;
  }

  function hide() {
    if (!open) return;
    open.pop.hidden = true;
    open = null;
  }

  function render(state) {
    const { view, pop, input, max } = state;
    const sel = parse(input.value);
    const t = today();
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const other = d.getMonth() !== view.getMonth();
      const disabled = max && d > max;
      const cls = ['datepicker__day', other ? 'is-other' : '', sel && iso(d) === iso(sel) ? 'is-selected' : '', iso(d) === iso(t) ? 'is-today' : ''].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${cls}" data-day="${iso(d)}" ${disabled ? 'disabled' : ''} aria-label="${iso(d)}">${d.getDate()}</button>`);
    }
    pop.innerHTML = `
      <div class="datepicker__head">
        <span class="datepicker__title">${MONTHS()[view.getMonth()]} ${view.getFullYear()}</span>
        <span class="datepicker__nav">
          <button type="button" class="datepicker__navbtn" data-nav="-1" aria-label="${dpT('date.prevMonth')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
          <button type="button" class="datepicker__navbtn" data-nav="1" aria-label="${dpT('date.nextMonth')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg></button>
        </span>
      </div>
      <div class="datepicker__grid" role="grid">
        ${DAYS().map(d => `<span class="datepicker__dow">${d}</span>`).join('')}
        ${cells.join('')}
      </div>
      <div class="datepicker__foot">
        <button type="button" class="datepicker__link" data-action="clear">${dpT('date.clear')}</button>
        <button type="button" class="datepicker__link" data-action="today">${dpT('date.today')}</button>
      </div>`;
  }

  document.addEventListener('mousedown', e => { if (open && !open.wrap.contains(e.target)) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  document.querySelectorAll('input[data-datepicker]').forEach(build);
  window.KHDADatePicker = { build };
})();
