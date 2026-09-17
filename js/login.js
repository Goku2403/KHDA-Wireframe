/* Sign-in — UAE PASS for institution users. The institution comes from the signed-in profile, so the demo
   continues straight to the dashboard. */
(function () {
  'use strict';
  const t = (k, v) => (window.t ? window.t(k, v) : k);
  // The page is laid out at the Figma frame size (1536 × 1134) and the whole frame is scaled to fit the
  // viewport — width and height — so it keeps its proportions on any screen and never scrolls.
  function fit() {
    const z = Math.min(1, window.innerWidth / 1536, window.innerHeight / 1134);
    document.body.style.zoom = z;
    document.body.style.width = Math.max(1536, Math.floor(window.innerWidth / z)) + 'px';
  }
  fit();
  window.addEventListener('resize', fit);
  const btn = document.getElementById('signIn');
  if (!btn) return;
  // role chosen on the card: Institution (default) · KHDA · KHDA Data · KHDA IT
  let role = 'inst';
  const roles = document.getElementById('loginRoles');
  if (roles) roles.addEventListener('click', e => { const b = e.target.closest('[data-role]'); if (!b) return; role = b.dataset.role; roles.querySelectorAll('[data-role]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.querySelector('span').textContent = t('login.connecting');
    window.dispatchEvent(new Event('khda:hero-celebrate'));
    if (window.khdaToast) window.khdaToast('info', t('login.toast'), t('login.toastText'));
    const R = window.KHDA_ROLES; if (R) R.set(role);
    setTimeout(() => { location.href = R && R.ROLES[role] ? R.ROLES[role].home : 'dashboard.html'; }, 900);
  });
})();
