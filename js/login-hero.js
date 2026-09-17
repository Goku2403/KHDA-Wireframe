/* Sign-in hero — the nine floating icon cards on the stage, ported from the KHDA ATS front end
   (LoginHeroField + HeroPhysicsStage; Figma 102:24234 / Legal Affairs 2854:99141).

   Geometry: each card is an OUTER box (the axis-aligned bounds of the rotated card, placed at x/y in the
   1472 × 870 stage space) holding a float layer and the INNER white card (rotated, radius, padding, shadow)
   with the glyph exported from the Figma frame (assets/hero) drawn at its own viewBox size. The table below is the single source of truth.

   Motion: an idle sine float in CSS (login-hero CSS in khda.css) covers first paint; then a matter-js gravity
   simulation (js/vendor/matter.min.js) takes over (?nophysics keeps the static composition): cards are released
   bottom-first after staggered delays, fall, collide with each other, the stage walls, the floor and the frosted
   sign-in card, settle into a pile, and can be grabbed and thrown with the pointer. */
(function () {
  'use strict';
  const stage = document.querySelector('.login'), box = document.getElementById('heroField');
  if (!stage || !box) return;

  // x, y, outer, rotate°, inner, radius, padding, shadowY, shadowBlur, iconW, iconH, drift, tilt, duration, delay, fallDelay
  const CARDS = [
    { id: 'hero-1', x: 324, y: 635, outer: 174.301, rotate: 16.68, inner: 140, radius: 24, padding: 32, shadowY: 14.649, shadowBlur: 14.649, iconW: 68, iconH: 58, drift: 10, tilt: 1.2, duration: 11, delay: -7.5, fallDelay: 500 },
    { id: 'hero-2', x: 498, y: 66, outer: 95.239, rotate: -12.33, inner: 80, radius: 10.59, padding: 20, shadowY: 3.53, shadowBlur: 5.295, iconW: 39, iconH: 30, drift: 7, tilt: 1.6, duration: 9, delay: -2.4, fallDelay: 1320 },
    { id: 'hero-3', x: 1145, y: -14, outer: 72.068, rotate: -13.14, inner: 60, radius: 16, padding: 16, shadowY: 2.263, shadowBlur: 3.394, iconW: 28, iconH: 24, drift: 6, tilt: 1.4, duration: 8, delay: -4.1, fallDelay: 1460 },
    { id: 'hero-4', x: 249, y: -27, outer: 80.071, rotate: 25.67, inner: 60, radius: 16, padding: 16, shadowY: 2.263, shadowBlur: 3.394, iconW: 31, iconH: 27, drift: 6, tilt: 1.8, duration: 8.5, delay: -1.2, fallDelay: 1600 },
    { id: 'hero-5', x: 909, y: 385, outer: 111.201, rotate: 6.84, inner: 100, radius: 18.703, padding: 24, shadowY: 6.234, shadowBlur: 9.352, iconW: 52, iconH: 45, drift: 8, tilt: 1.1, duration: 10, delay: -5.3, fallDelay: 760 },
    { id: 'hero-6', x: 1259, y: 262, outer: 120.114, rotate: -13.14, inner: 100, radius: 16, padding: 24, shadowY: 3.794, shadowBlur: 5.692, iconW: 47, iconH: 41, drift: 8, tilt: 1.3, duration: 9.5, delay: -3.0, fallDelay: 1040 },
    { id: 'hero-7', x: 110, y: 329, outer: 115.654, rotate: 9.87, inner: 100, radius: 16, padding: 24, shadowY: 6.714, shadowBlur: 10.071, iconW: 43, iconH: 44, drift: 8, tilt: 1.2, duration: 10.5, delay: -6.2, fallDelay: 900 },
    { id: 'hero-8', x: 855, y: 92, outer: 125.614, rotate: 17.65, inner: 100, radius: 16, padding: 24, shadowY: 6.942, shadowBlur: 10.413, iconW: 44, iconH: 50, drift: 8, tilt: 1.5, duration: 9, delay: -1.8, fallDelay: 1180 },
    { id: 'hero-9', x: 1134, y: 762, outer: 171.464, rotate: -15.0, inner: 140, radius: 24, padding: 32, shadowY: 16.326, shadowBlur: 16.326, iconW: 63, iconH: 62, drift: 10, tilt: 1.0, duration: 12, delay: -3.6, fallDelay: 560 },
  ];

  // ---------- render the cards (design positions + idle float) ----------
  box.innerHTML = CARDS.map(c => `<div class="hero-card" data-hero-card="${c.id}" style="left:${c.x}px;top:${c.y}px;width:${c.outer}px;height:${c.outer}px">
      <span class="hero-card__float" style="--hero-drift:${c.drift}px;--hero-tilt:${c.tilt}deg;--hero-duration:${c.duration}s;--hero-delay:${c.delay}s">
        <span class="hero-card__inner" style="width:${c.inner}px;height:${c.inner}px;padding:${c.padding}px;border-radius:${c.radius}px;rotate:${c.rotate}deg;box-shadow:0 ${c.shadowY}px ${c.shadowBlur}px rgba(0,0,0,0.12)">
          <img src="assets/hero/${c.id}.svg" alt="" aria-hidden="true" width="${Math.round(c.iconW)}" height="${Math.round(c.iconH)}" style="width:${c.iconW}px;height:${c.iconH}px">
        </span>
      </span>
    </div>`).join('');

  // ---------- gravity simulation ----------
  const STEP_MS = 1000 / 60, MAX_STEPS = 4, MAX_TOSS = 32;
  function start() {
    const M = window.Matter; if (!M) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = Array.from(box.querySelectorAll('[data-hero-card]')).filter(el => el.offsetParent !== null);
    if (!els.length) return;
    const zoomOf = () => parseFloat(getComputedStyle(document.body).zoom) || 1;

    const engine = M.Engine.create({ enableSleeping: true });
    engine.gravity.y = 0.8;
    const width = box.offsetWidth, height = box.offsetHeight;
    // floor at the stage's bottom edge, walls at its sides, a ceiling far above so a thrown card always comes back
    M.Composite.add(engine.world, [
      M.Bodies.rectangle(width / 2, height + 100, width + 800, 200, { isStatic: true, friction: 0.6 }),
      M.Bodies.rectangle(-100, 0, 200, 6000, { isStatic: true }),
      M.Bodies.rectangle(width + 100, 0, 200, 6000, { isStatic: true }),
      M.Bodies.rectangle(width / 2, -900, width + 800, 200, { isStatic: true }),
    ]);

    // the frosted sign-in card is an obstacle, so the pile forms around the glass (measured live; page zoom removed)
    let obstacles = [];
    const bindings = [];
    function syncObstacles() {
      M.Composite.remove(engine.world, obstacles);
      const z = zoomOf(), boxRect = box.getBoundingClientRect();
      obstacles = Array.from(document.querySelectorAll('[data-hero-obstacle]')).map(el => el.getBoundingClientRect()).filter(r => r.width > 1 && r.height > 1)
        .map(r => M.Bodies.rectangle((r.left - boxRect.left + r.width / 2) / z, (r.top - boxRect.top + r.height / 2) / z, r.width / z, r.height / z, { isStatic: true, chamfer: { radius: 32 } }));
      M.Composite.add(engine.world, obstacles);
      bindings.forEach(b => M.Sleeping.set(b.body, false));
    }

    const byId = Object.fromEntries(CARDS.map(c => [c.id, c]));
    els.forEach(el => {
      const card = byId[el.dataset.heroCard]; if (!card) return;
      const baseX = el.offsetLeft + el.offsetWidth / 2, baseY = el.offsetTop + el.offsetHeight / 2, baseAngle = card.rotate * Math.PI / 180;
      // fold the mid-flight offset of the CSS float into the starting pose, then stop the float — no jump on handoff
      const floatEl = el.firstElementChild; let driftX = 0, driftY = 0, tilt = 0;
      const tr = getComputedStyle(floatEl).transform;
      if (tr && tr !== 'none') { const m = new DOMMatrixReadOnly(tr); driftX = m.m41; driftY = m.m42; tilt = Math.atan2(m.m12, m.m11); }
      floatEl.style.animation = 'none';
      const half = card.inner * (Math.abs(Math.cos(baseAngle + tilt)) + Math.abs(Math.sin(baseAngle + tilt))) / 2;
      const body = M.Bodies.rectangle(baseX + driftX, Math.min(baseY + driftY, height - half), card.inner, card.inner, {
        angle: baseAngle + tilt, restitution: 0.35, friction: 0.35, frictionAir: 0.012, chamfer: { radius: Math.min(card.radius, card.inner / 2 - 1) },
      });
      M.Body.setStatic(body, true);   // released later, bottom cards first
      el.style.willChange = 'transform';
      bindings.push({ el, body, baseX, baseY, baseAngle, settled: false, fallDelay: card.fallDelay });
    });
    M.Composite.add(engine.world, bindings.map(b => b.body));
    syncObstacles();

    const writePose = b => { b.el.style.transform = `translate3d(${b.body.position.x - b.baseX}px, ${b.body.position.y - b.baseY}px, 0) rotate(${b.body.angle - b.baseAngle}rad)`; };
    bindings.forEach(writePose);
    const timers = bindings.map(b => setTimeout(() => { M.Body.setStatic(b.body, false); M.Sleeping.set(b.body, false); }, b.fallDelay));

    // ---- grab and throw ----
    let grab = null;
    const toWorld = (e, boxRect) => { const z = zoomOf(); return { x: (e.clientX - boxRect.left) / z, y: (e.clientY - boxRect.top) / z }; };
    const bodyAt = (e, boxRect) => { const hits = M.Query.point(bindings.map(b => b.body), toWorld(e, boxRect)); return hits.length ? hits[hits.length - 1] : null; };
    const overInteractive = target => target instanceof Element && target.closest('a, button, input, select, textarea, label, [data-hero-obstacle]') !== null;
    const onPointerMove = e => { if (grab) grab.constraint.pointA = toWorld(e, grab.boxRect); };
    const endGrab = () => {
      if (!grab) return;
      const { body, constraint } = grab;
      M.Composite.remove(engine.world, constraint); body.sleepThreshold = 60;
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > MAX_TOSS) { const s = MAX_TOSS / speed; M.Body.setVelocity(body, { x: body.velocity.x * s, y: body.velocity.y * s }); }
      grab = null; stage.style.cursor = '';
      window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', endGrab); window.removeEventListener('pointercancel', endGrab);
    };
    const onPointerDown = e => {
      if (e.button !== 0 || e.pointerType === 'touch' || grab || overInteractive(e.target)) return;
      const boxRect = box.getBoundingClientRect(); const body = bodyAt(e, boxRect);
      if (!body || body.isStatic) return;
      e.preventDefault();
      M.Sleeping.set(body, false); body.sleepThreshold = Infinity;
      const p = toWorld(e, boxRect), cos = Math.cos(-body.angle), sin = Math.sin(-body.angle), dx = p.x - body.position.x, dy = p.y - body.position.y;
      const constraint = M.Constraint.create({ bodyB: body, pointB: { x: dx * cos - dy * sin, y: dx * sin + dy * cos }, pointA: p, stiffness: 0.15, damping: 0.08, length: 0 });
      M.Composite.add(engine.world, constraint);
      grab = { constraint, body, boxRect }; stage.style.cursor = 'grabbing';
      window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', endGrab); window.addEventListener('pointercancel', endGrab);
    };
    const onHover = e => { if (grab || e.pointerType === 'touch') return; stage.style.cursor = !overInteractive(e.target) && bodyAt(e, box.getBoundingClientRect()) ? 'grab' : ''; };
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onHover);
    window.addEventListener('resize', syncObstacles);
    // a small celebratory hop of the pile (same physics), e.g. after a successful sign-in
    window.addEventListener('khda:hero-celebrate', () => bindings.forEach(b => { if (b.body.isStatic || (grab && grab.body === b.body)) return; M.Sleeping.set(b.body, false); M.Body.setVelocity(b.body, { x: b.body.velocity.x + (Math.random() - 0.5) * 3, y: -(5 + Math.random() * 3) }); M.Body.setAngularVelocity(b.body, b.body.angularVelocity + (Math.random() - 0.5) * 0.08); }));

    // fixed-step loop; sleeping bodies stop being written once their rest pose is painted
    let last = performance.now(), acc = 0;
    const frame = now => {
      requestAnimationFrame(frame);
      acc = Math.min(acc + (now - last), STEP_MS * MAX_STEPS); last = now;
      while (acc >= STEP_MS) { M.Engine.update(engine, STEP_MS); acc -= STEP_MS; }
      bindings.forEach(b => { if (b.body.isSleeping && b.settled) return; writePose(b); b.settled = b.body.isSleeping; });
    };
    requestAnimationFrame(frame);
    // debug hook: advance the world by hand (used by tests; harmless otherwise)
    window.KHDA_HERO = { step(ms) { for (let t = 0; t < ms; t += STEP_MS) M.Engine.update(engine, STEP_MS); bindings.forEach(writePose); }, bodies: () => bindings.map(b => ({ id: b.el.dataset.heroCard, x: Math.round(b.body.position.x), y: Math.round(b.body.position.y), sleeping: b.body.isSleeping, static: b.body.isStatic })) };
    return () => timers.forEach(clearTimeout);
  }

  // Gravity is on by default (the reference behaviour); login.html?nophysics keeps the static composition.
  if (new URLSearchParams(location.search).has('nophysics')) return;
  if (window.Matter) start();
  else { const s = document.querySelector('script[data-matter]'); if (s) s.addEventListener('load', start); }
})();
