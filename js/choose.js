/* The step before a dataset opens: bulk upload, or one record at a time.
   It runs over the catalogue — the page behind is blurred and dimmed — and holds nothing
   but the two ways in, from the Figma selector panel (11063:261216). Picking one goes. */
(function () {
  'use strict';

  const DATA = window.KHDA_DATASETS || [];
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const t = (k, v) => (window.t ? window.t(k, v) : k);

  const overlay = $('#chooseOverlay');
  const grid = $('#choiceGrid');
  if (!overlay) return;

  let dataset = null, opener = null;

  function open(sheet) {
    dataset = DATA.find(d => d.sheet === sheet);
    if (!dataset) return;

    opener = document.activeElement;
    $('#chooseSub').textContent = t('mode.sub', { x: dataset.title });

    // the header keeps its own colour above the veil
    const header = document.querySelector('.portal-header');
    const under = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    overlay.style.setProperty('--choose-top', under + 'px');

    overlay.hidden = false;
    document.body.classList.add('is-choosing');
    overlay.scrollTop = 0;
    $$('.choice')[0].focus();
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove('is-choosing');
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  }

  function enter(mode) {
    if (!dataset) return;
    location.href = 'index.html?sheet=' + encodeURIComponent(dataset.sheet) + '&mode=' + mode;
  }

  grid.addEventListener('click', e => {
    const card = e.target.closest('.choice');
    if (card) enter(card.dataset.mode);
  });

  // arrow keys move between the two
  grid.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const cards = $$('.choice');
    const here = cards.indexOf(document.activeElement.closest('.choice') || cards[0]);
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    cards[(here + (back ? cards.length - 1 : 1)) % cards.length].focus();
  });

  // clicking the blurred page behind the panel dismisses it
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

  // Escape closes, and Tab stays inside while the step is up
  document.addEventListener('keydown', e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const stops = $$('#chooseOverlay button').filter(x => !x.disabled && x.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0], last = stops[stops.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, true);

  // an old link to the retired choose page arrives as ?choose=<sheet>
  const asked = new URLSearchParams(location.search).get('choose');
  if (asked) {
    open(asked);
    history.replaceState(null, '', location.pathname);
  }

  window.KHDA_CHOOSE = { open, close };
})();
