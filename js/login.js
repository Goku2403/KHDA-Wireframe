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
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.querySelector('span').textContent = t('login.connecting');
    window.dispatchEvent(new Event('khda:hero-celebrate'));
    if (window.khdaToast) window.khdaToast('info', t('login.toast'), t('login.toastText'));
    setTimeout(() => { location.href = 'dashboard.html'; }, 900);
  });
})();
