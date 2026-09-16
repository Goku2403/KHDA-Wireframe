/* The Figma frames are drawn on a 1600px canvas, so their 1:1 sizes read oversized on a normal screen.
   Scale the whole page to the viewport instead, keeping every proportion exactly as designed. */
(function () {
  'use strict';
  function fit() {
    const w = window.innerWidth;
    const base = w >= 992 ? Math.min(1, Math.max(0.8, w / 1600)) : 1;
    // the accessibility panel can scale the page up on top of the canvas fit
    const chosen = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--a11y-zoom')) || 1;
    document.body.style.zoom = base * chosen;
  }
  window.khdaFit = fit;
  if (document.body) fit();
  else document.addEventListener('DOMContentLoaded', fit);
  window.addEventListener('resize', fit);
})();
