/* The row action button from the ATS data table (4056:30768): an outlined button that
   opens a small menu of what can be done to that row. Shared by the records grid and the
   data report. */
(function () {
  'use strict';

  let open = null;   // { menu, button }

  function close() {
    if (!open) return;
    open.button.setAttribute('aria-expanded', 'false');
    open.menu.remove();
    open = null;
  }

  function place(menu, button) {
    // the page is scaled to the Figma canvas (js/fit.js), and a fixed element is laid out in
    // that scaled space while getBoundingClientRect reports screen pixels, so divide it back
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const px = r => ({ left: r.left / zoom, right: r.right / zoom, top: r.top / zoom, bottom: r.bottom / zoom });
    const b = px(button.getBoundingClientRect());
    const m = menu.getBoundingClientRect();
    const mw = m.width / zoom, mh = m.height / zoom;
    const vw = window.innerWidth / zoom, vh = window.innerHeight / zoom;
    const rtl = document.documentElement.dir === 'rtl';

    let left = rtl ? b.left : b.right - mw;
    left = Math.max(8, Math.min(left, vw - mw - 8));
    const below = b.bottom + 4;
    let top = below + mh > vh - 8 ? b.top - mh - 4 : below;
    top = Math.max(8, Math.min(top, vh - mh - 8));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  // items: [{ label, danger, onChoose }]
  function show(button, items) {
    const wasOpen = open && open.button === button;
    close();
    if (wasOpen) return;

    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'row-menu__item' + (it.danger ? ' row-menu__item--danger' : '');
      b.setAttribute('role', 'menuitem');
      b.textContent = it.label;
      b.addEventListener('click', () => { close(); it.onChoose(); });
      menu.append(b);
    });
    document.body.append(menu);
    place(menu, button);
    button.setAttribute('aria-expanded', 'true');
    open = { menu, button };
    menu.querySelector('.row-menu__item').focus();
  }

  // arrow keys walk the menu, Escape gives focus back to the button
  document.addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { const b = open.button; close(); b.focus(); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const items = Array.from(open.menu.querySelectorAll('.row-menu__item'));
    const here = items.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : items.length - 1;
    items[(Math.max(0, here) + step) % items.length].focus();
  });

  document.addEventListener('mousedown', e => {
    if (open && !open.menu.contains(e.target) && !open.button.contains(e.target)) close();
  });
  window.addEventListener('resize', close);
  window.addEventListener('scroll', close, true);

  window.khdaRowMenu = show;
  window.khdaRowMenuClose = close;
})();
