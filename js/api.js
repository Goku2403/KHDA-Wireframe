/* KHDA — API Integration Overview.

   The KHDA-admin view of who is actually calling the API. Telemetry comes from
   KHDA_API, which derives it from the dictionary roster and the 46 datasets; this file
   only draws it and records what the admin does about it.

   The one piece of durable state is the follow-up trail: which institutions have been
   emailed, and the admin's own filter and sort. Numbers are never persisted, so the
   table and the charts cannot drift apart from each other. */
(function () {
  'use strict';

  const A = window.KHDA_API;
  if (!A) return;

  const $ = s => document.querySelector(s);
  const t = (k, v) => (window.t ? window.t(k, v) : k);
  const fmt = n => Number(n || 0).toLocaleString();
  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DAY = 86400000;

  // The cycle this screen reports on. One constant rather than a date scattered through the
  // markup, so the period label, the deadline and the email all name the same window.
  const CYCLE = { label: 'Fall · 2026–2027', due: new Date('2026-09-08T00:00:00Z') };

  const STATUS_COLOUR = {
    accepted: 'var(--chip-done)',
    processing: 'var(--chip-progress)',
    'needs-correction': 'var(--chip-late)',
    'non-submitted': 'var(--surface-dim)',
  };
  const TIER_COLOUR = {
    active: 'var(--success)',
    dormant: 'var(--warning)',
    'not-integrated': 'var(--outline-variant)',
  };
  const STATUS_CHIP = {
    accepted: 'chip--complete',
    processing: 'chip--current',
    'needs-correction': 'chip--error',
    'non-submitted': 'chip--neutral',
  };

  // ---------- durable state: the follow-up trail, not the telemetry ----------

  const KEY = 'khda.api.v1';
  const store = (() => {
    let s = { notified: {}, filter: 'all', sort: 'accepted', dir: 'desc' };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') s = Object.assign(s, raw, { notified: raw.notified || {} });
    } catch { /* a corrupt key just means the defaults */ }
    return s;
  })();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ }
  }

  // A key written before the rating column was dropped can still name it, which would
  // leave the table sorted by something no header shows and no indicator explains.
  const SORTABLE = ['name', 'channel', 'accepted', 'errors', 'last'];
  if (!SORTABLE.includes(store.sort)) { store.sort = 'accepted'; store.dir = 'desc'; }

  // ---------- small formatters ----------

  function sinceLabel(days) {
    if (days == null) return t('api.never');
    if (days === 0) return t('api.today');
    return t('api.daysAgo', { n: days });
  }

  function dateLabel(d) {
    return d.toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-AE' : 'en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Real-time datasets are event-based and have no cycle deadline; everything else is due
  // on the cycle date, so "overdue" is a fact about the calendar rather than a guess.
  function dueOf(row) {
    return row.group === 'Real-time' ? null : CYCLE.due;
  }
  function overdueDays(row) {
    const due = dueOf(row);
    if (!due) return 0;
    return Math.max(0, Math.floor((Date.now() - due.getTime()) / DAY));
  }

  // Row actions carry their icon: the arrow leads on to the ledger, the envelope opens the
  // composer. The arrow is marked so RTL can turn it round with the rest of the layout.
  const ARROW = '<svg class="api-actions__arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  const ENVELOPE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" aria-hidden="true"><path d="M3 7h18v12H3z"/><path d="m3 7 9 7 9-7"/></svg>';

  // ---------- sector totals ----------

  const sum = A.summary();

  // Each tile is a measurement: a figure, the share of the whole it represents, and the
  // meter for that share. Tone comes from the palette the chips already use, handed to the
  // card as custom properties so no colour is written into the markup.
  const STAT_ICONS = {
    heis: '<path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-6h4v6"/>',
    consuming: '<path d="M22 12h-5l-3 8-4-16-3 8H2"/>',
    silent: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    accepted: '<circle cx="12" cy="12" r="9"/><path d="m8.2 12.2 2.6 2.6 5-5.6"/>',
    errors: '<path d="M10.3 3.3 1.8 18A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5m0 3.5h.01"/>',
    rating: '<path d="m12 3.5 2.7 5.5 6 .9-4.35 4.25 1 6-5.35-2.8-5.35 2.8 1-6L3.3 9.9l6-.9Z"/>',
  };

  function renderStats() {
    const rows46 = sum.rows || 1;
    const heis = sum.institutions || 1;

    const tiles = [
      { k: 'heis', label: 'api.statHeis', value: fmt(sum.institutions), share: 1,
        note: t('api.statHeisNote'), tone: 'var(--primary)', soft: 'var(--primary-container)' },
      { k: 'consuming', label: 'api.statConsuming', value: fmt(sum.consuming), share: sum.consuming / heis,
        note: t('api.statConsumingNote', { n: sum.tiers.active }), tone: 'var(--success)', soft: 'var(--chip-done)' },
      { k: 'silent', label: 'api.statSilent', value: fmt(sum.notConsuming), share: sum.notConsuming / heis,
        note: t('api.statSilentNote'), tone: 'var(--error)', soft: 'var(--chip-late)' },
      { k: 'accepted', label: 'api.statAccepted', value: fmt(sum.counts.accepted), share: sum.counts.accepted / rows46,
        note: t('api.statAcceptedNote', { n: fmt(sum.rows) }), tone: 'var(--success)', soft: 'var(--chip-done)' },
      { k: 'errors', label: 'api.statErrors', value: fmt(sum.errorRows), share: sum.errorRows / rows46,
        note: t('api.statErrorsNote'), tone: 'var(--warning)', soft: 'var(--chip-todo)' },
      { k: 'rating', label: 'api.statRating', value: sum.avgScore + ' / 100', share: sum.avgScore / 100,
        note: t('api.statRatingNote'), tone: 'var(--primary)', soft: 'var(--primary-container)' },
    ];

    $('#apiStats').innerHTML = tiles.map(x => {
      const pct = Math.round(x.share * 100);
      return `
      <article class="api-stat" style="--tone:${x.tone};--tone-soft:${x.soft}">
        <div class="api-stat__top">
          <span class="api-stat__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${STAT_ICONS[x.k]}</svg>
          </span>
          <span class="api-stat__share">${esc(t('api.pctOnly', { p: pct }))}</span>
        </div>
        <span class="api-stat__value">${x.value}</span>
        <span class="api-stat__label">${esc(t(x.label))}</span>
        <span class="api-stat__meter"><span class="api-stat__fill" style="width:${pct}%"></span></span>
        <span class="api-stat__note">${esc(x.note)}</span>
      </article>`;
    }).join('');
  }

  // ---------- shared: the breakdown list under a plot ----------

  function breakdown(items, total) {
    const whole = total || 1;
    return items.map(x => {
      const pct = (x.value / whole) * 100;
      return `
      <li class="api-breakdown__item">
        <span class="api-breakdown__dot" style="background:${x.colour}"></span>
        <span class="api-breakdown__label">${esc(x.label)}</span>
        <span class="api-breakdown__value">${fmt(x.value)}</span>
        <span class="api-breakdown__meter"><span class="api-breakdown__fill" style="width:${pct.toFixed(1)}%;background:${x.colour}"></span></span>
      </li>`;
    }).join('');
  }

  // ---------- chart: adoption ring ----------

  // A full ring rather than the half gauge: three tiers of one population read as parts of
  // a whole, and the ring leaves room beside it for the tiers to be named and counted.
  function renderAdoption() {
    const tiers = ['active', 'dormant', 'not-integrated'];
    const total = sum.institutions || 1;

    const R = 70, CX = 90, CY = 90;
    const pt = a => [CX + R * Math.sin(a), CY - R * Math.cos(a)];
    let at = 0;
    const arcs = tiers.map(k => {
      const share = sum.tiers[k] / total;
      if (share <= 0) return '';
      const to = at + share * Math.PI * 2;
      const [x1, y1] = pt(at), [x2, y2] = pt(Math.min(to, Math.PI * 2 - 0.0001));
      const large = share > 0.5 ? 1 : 0;
      at = to;
      return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" stroke="${TIER_COLOUR[k]}"/>`;
    }).join('');
    $('#adoptArcs').innerHTML = arcs;

    $('#adoptNumber').textContent = fmt(sum.consuming);
    $('#adoptCaption').textContent = t('api.adoptCaption', { n: fmt(sum.institutions) });
    $('#adoptNote').textContent = t('api.adoptNote', { p: Math.round((sum.consuming / total) * 100) });

    $('#adoptLegend').innerHTML = breakdown(
      tiers.map(k => ({ label: t('api.tier.' + k), value: sum.tiers[k], colour: TIER_COLOUR[k] })), total);
  }

  // ---------- chart: dataset outcomes ----------

  function renderOutcomes() {
    const total = sum.rows || 1;
    $('#outcomeStack').innerHTML = A.STATUSES.map(k => {
      const share = (sum.counts[k] / total) * 100;
      if (share <= 0) return '';
      return `<span class="api-stack__part" style="width:${share.toFixed(2)}%;background:${STATUS_COLOUR[k]}" title="${esc(t('api.st.' + k))} — ${fmt(sum.counts[k])}"></span>`;
    }).join('');

    $('#outcomeLegend').innerHTML = breakdown(
      A.STATUSES.map(k => ({ label: t('api.st.' + k), value: sum.counts[k], colour: STATUS_COLOUR[k] })), total);

    $('#outcomeNote').textContent = t('api.outcomeNote', { n: fmt(sum.rows) });
  }

  // ---------- chart: call volume ----------

  // An area with a line over it, rather than twelve separate columns: the question this
  // card answers is whether traffic is holding up, which is a shape, not twelve readings.
  // The axes stay — a shape without a scale beside it is decoration.
  function renderVolume() {
    const data = A.volume();
    const W = 520, H = 220, padL = 52, padR = 12, padT = 12, padB = 32;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    const peak = Math.max(1, ...data);
    const step = Math.pow(10, Math.floor(Math.log10(peak / 4)));
    const tick = Math.ceil(peak / 4 / step) * step;
    const top = tick * 4;

    const y = v => padT + plotH - (v / top) * plotH;
    const x = i => padL + (data.length === 1 ? plotW / 2 : (plotW * i) / (data.length - 1));

    const grid = [0, 1, 2, 3, 4].map(i => {
      const v = tick * i, yy = y(v);
      return `<line class="api-plot__grid" x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>` +
        `<text class="api-plot__tick" x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`;
    }).join('');

    const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `<polygon class="api-plot__area" points="${padL},${padT + plotH} ${points} ${W - padR},${padT + plotH}"/>`;
    const line = `<polyline class="api-plot__line" points="${points}"/>`;

    const dots = data.map((v, i) =>
      `<circle class="api-plot__hit" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="14"><title>${esc(t('api.weekTip', { w: data.length - i, n: fmt(v) }))}</title></circle>` +
      `<circle class="api-plot__dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5"/>`).join('');

    const labels = data.map((_, i) => {
      const back = data.length - 1 - i;
      // Four labels, anchored at both ends. Every third week fitted in English but collided
      // in Arabic, where the same label is three times as wide.
      if (i !== 0 && i !== data.length - 1 && i % 4 !== 0) return '';
      const label = back === 0 ? t('api.weekNow') : t('api.weeksBack', { n: back });
      const anchor = i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle';
      return `<text class="api-plot__tick" x="${x(i).toFixed(1)}" y="${H - padB + 20}" text-anchor="${anchor}">${esc(label)}</text>`;
    }).join('');

    const axes = `<line class="api-plot__axis" x1="${padL}" x2="${padL}" y1="${padT}" y2="${padT + plotH}"/>` +
      `<line class="api-plot__axis" x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}"/>`;

    // the gradient is the primary at two opacities, so it stays a token rather than a colour
    const defs = '<defs><linearGradient id="apiVolFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.28"/>' +
      '<stop offset="100%" stop-color="var(--primary)" stop-opacity="0.02"/>' +
      '</linearGradient></defs>';

    const svg = $('#volumePlot');
    const title = svg.querySelector('title');
    svg.innerHTML = '';
    if (title) svg.append(title);
    svg.insertAdjacentHTML('beforeend', defs + grid + axes + area + line + dots + labels);

    const totalCalls = data.reduce((n, v) => n + v, 0);
    $('#volumeFigures').innerHTML = [
      { v: fmt(totalCalls), l: t('api.volTotal') },
      { v: fmt(data[data.length - 1]), l: t('api.volLatest') },
      { v: fmt(peak), l: t('api.volPeak') },
    ].map(f => `
      <div class="api-figure">
        <span class="api-figure__value">${f.v}</span>
        <span class="api-figure__label">${esc(f.l)}</span>
      </div>`).join('');
  }

  // ---------- chart: adoption by onboarding wave ----------

  function renderWaves() {
    $('#waveChart').innerHTML = A.byWave().map(w => {
      const pct = w.total ? (w.consuming / w.total) * 100 : 0;
      return `
        <li class="api-wave${w.consuming ? '' : ' is-none'}">
          <span class="api-wave__label">${esc(t('api.wave', { n: w.wave }))}</span>
          <span class="api-wave__value">${w.consuming} / ${w.total} · ${esc(t('api.pctOnly', { p: Math.round(pct) }))}</span>
          <span class="api-wave__track"><span class="api-wave__fill" style="width:${pct.toFixed(1)}%"></span></span>
        </li>`;
    }).join('');
  }

  // ---------- the roster table ----------

  // Each row is the institution plus the figures the table sorts on, worked out once so a
  // re-sort does not recompute 37 scores against 46 datasets every keystroke.
  const rows = A.roster.map(inst => {
    const s = A.score(inst);
    return {
      inst,
      score: s,
      accepted: s.accepted,
      errors: s.errored,
      last: inst.lastCallDays == null ? Infinity : inst.lastCallDays,
      consuming: A.consuming(inst),
    };
  });

  function visible() {
    const q = ($('#apiSearch').value || '').trim().toLowerCase();
    let set = rows;
    if (store.filter === 'consuming') set = set.filter(r => r.consuming);
    else if (store.filter === 'silent') set = set.filter(r => !r.consuming);
    else if (store.filter === 'errors') set = set.filter(r => r.errors > 0);
    if (q) set = set.filter(r => r.inst.name.toLowerCase().includes(q) || String(r.inst.code).includes(q));

    const dir = store.dir === 'asc' ? 1 : -1;
    const key = store.sort;
    return set.slice().sort((a, b) => {
      let d;
      if (key === 'name') d = a.inst.name.localeCompare(b.inst.name);
      else if (key === 'channel') d = a.inst.channel.localeCompare(b.inst.channel);
      else if (key === 'accepted') d = a.accepted - b.accepted;
      else if (key === 'errors') d = a.errors - b.errors;
      else if (key === 'last') d = a.last - b.last;
      else d = 0;
      // a stable tie-break on name, so two institutions on the same score never swap places
      return d !== 0 ? d * dir : a.inst.name.localeCompare(b.inst.name);
    });
  }

  function channelChip(inst) {
    const cls = inst.channel === 'api' ? 'chip--complete'
      : inst.channel === 'portal' ? 'chip--warning' : 'chip--error';
    return `<span class="chip ${cls}">${esc(t('api.chan.' + inst.channel))}</span>`;
  }

  let page = 1, pageSize = 10;

  function renderTable() {
    const set = visible();
    const body = $('#apiBody');

    const total = set.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    const slice = set.slice((page - 1) * pageSize, page * pageSize);

    body.innerHTML = slice.map(r => {
      const inst = r.inst;
      const pct = (r.accepted / r.score.required) * 100;
      const notified = store.notified[inst.code];
      return `
      <tr data-code="${inst.code}"${r.consuming ? '' : ' class="is-silent"'}>
        <td>
          <span class="api-cell__name">${esc(inst.name)}</span>
          <span class="api-cell__sub">${esc(t('api.codeWave', { code: inst.code, wave: inst.wave }))}${notified ? ' · ' + esc(t('api.notifiedOn', { d: dateLabel(new Date(notified)) })) : ''}</span>
        </td>
        <td>${channelChip(inst)}</td>
        <td>
          <span class="api-cover">
            <span class="api-cover__value">${r.accepted} / ${r.score.required}</span>
            <span class="api-cover__track"><span class="api-cover__fill" style="width:${pct.toFixed(1)}%"></span></span>
          </span>
        </td>
        <td class="num">${r.errors ? `<span class="chip chip--error">${r.errors}</span>` : '0'}</td>
        <td>${esc(sinceLabel(inst.lastCallDays))}</td>
        <td class="actions">
          <span class="api-actions">
            <button class="btn btn--outline btn--sm" type="button" data-view="${inst.code}">
              <span>${esc(t('api.viewDatasets'))}</span>${ARROW}
            </button>
            <button class="btn btn--outline btn--sm" type="button" data-mail="${inst.code}">
              ${ENVELOPE}<span>${esc(t('api.sendEmail'))}</span>
            </button>
          </span>
        </td>
      </tr>`;
    }).join('');

    $('#apiTable').hidden = total === 0;
    $('#apiEmpty').hidden = total > 0;
    $('#rosterCount').textContent = total === rows.length ? fmt(total) : t('api.showing', { n: total, total: rows.length });

    // the same indicator the entry grid uses: neutral until a column is the sort
    document.querySelectorAll('#apiTable th.sortable').forEach(th => {
      const on = th.dataset.sort === store.sort;
      th.classList.toggle('is-sorted', on);
      th.setAttribute('aria-sort', on ? (store.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      th.querySelector('.sort-ind').textContent = on ? (store.dir === 'asc' ? '↑' : '↓') : '⇅';
    });

    renderPager(total, pages);
  }

  function renderPager(total, pages) {
    $('#apiPagination').hidden = total === 0;
    const from = total ? (page - 1) * pageSize + 1 : 0;
    const to = Math.min(page * pageSize, total);
    $('#apiPageInfo').textContent = t('entry.showing', { a: from, b: to, c: fmt(total) });

    const pb = $('#apiPageButtons');
    pb.innerHTML = '';
    const arrow = d => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="' +
      (d < 0 ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6') + '"/></svg>';
    const mk = (label, p, o = {}) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'page-btn';
      b.innerHTML = label;
      if (o.current) b.setAttribute('aria-current', 'page');
      if (o.aria) b.setAttribute('aria-label', o.aria);
      b.disabled = !!o.disabled;
      b.addEventListener('click', () => { page = p; renderTable(); });
      pb.append(b);
    };

    mk(arrow(-1), page - 1, { disabled: page === 1, aria: t('common.previous') });
    for (let p = 1; p <= pages; p++) {
      // long runs collapse to first, last and the neighbours of the current page
      if (pages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== pages) {
        if (p === 2 || p === pages - 1) {
          const s = document.createElement('span');
          s.className = 'page-btn';
          s.textContent = '…';
          pb.append(s);
        }
        continue;
      }
      mk(String(p), p, { current: p === page });
    }
    mk(arrow(1), page + 1, { disabled: page === pages, aria: t('common.next') });
  }

  // ---------- drawers ----------

  let lastFocus = null;

  // The page keeps its own scrollbar while a drawer is open, which put two bars side by
  // side; the class parks the page so the only thing that scrolls is the drawer body.
  function openDrawer(drawer, scrim, focusTarget) {
    lastFocus = document.activeElement;
    scrim.hidden = false;
    drawer.hidden = false;
    document.documentElement.classList.add('has-drawer');
    drawer.querySelector('.cfg-drawer__body').scrollTop = 0;
    (focusTarget || drawer.querySelector('button')).focus();
  }
  function closeDrawer(drawer, scrim) {
    drawer.hidden = true;
    scrim.hidden = true;
    // the other drawer may still be up — the ledger hands straight over to the composer
    if ($('#dsDrawer').hidden && $('#mailDrawer').hidden) {
      document.documentElement.classList.remove('has-drawer');
    }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  // ---------- drawer: the 46-dataset ledger ----------

  let ledgerInst = null;
  let ledgerScope = 'all';

  function scoreBreak(s) {
    const parts = [
      { k: 'api.coverage', got: s.coverage, max: 50, note: t('api.coverageNote', { a: s.accepted, n: s.required }) },
      { k: 'api.accuracy', got: s.accuracy, max: 30, note: t('api.accuracyNote', { e: s.errored, n: s.attempted }) },
      { k: 'api.freshness', got: s.freshness, max: 20, note: sinceLabel(ledgerInst ? ledgerInst.lastCallDays : null) },
    ];
    return parts.map(p => `
      <div class="score-break__row">
        <span class="score-break__label">${esc(t(p.k))}</span>
        <span class="score-break__track"><span class="score-break__fill" style="width:${((p.got / p.max) * 100).toFixed(1)}%"></span></span>
        <span class="score-break__value">${p.got} / ${p.max}</span>
      </div>
      <p class="score-break__note">${esc(p.note)}</p>`).join('');
  }

  function renderLedger() {
    const inst = ledgerInst;
    if (!inst) return;
    const s = A.score(inst);

    $('#dsDrawerTitle').textContent = inst.name;
    $('#dsDrawerLede').textContent = t('api.ledgerLede',
      { total: s.total, code: inst.code, wave: inst.wave, tier: t('api.tier.' + inst.tier) });
    $('#dsScore').innerHTML = scoreBreak(s);

    const set = ledgerScope === 'errors'
      ? inst.ledger.filter(r => r.status === 'needs-correction')
      : inst.ledger;

    const groups = [];
    for (const row of set) {
      let g = groups.find(x => x.name === row.group);
      if (!g) groups.push(g = { name: row.group, rows: [] });
      g.rows.push(row);
    }

    $('#dsLedger').innerHTML = groups.length ? groups.map(g => `
      <section class="api-ledger__group">
        <h3 class="api-ledger__groupTitle">${esc(g.name)} · ${g.rows.length}</h3>
        ${g.rows.map(row => `
          <article class="api-row${row.status === 'needs-correction' ? ' is-error' : ''}">
            <span class="api-row__title">${esc(row.title)}</span>
            <span class="chip ${STATUS_CHIP[row.status]}">${esc(t('api.st.' + row.status))}</span>
            <span class="api-row__meta">${esc(ledgerMeta(row))}</span>
            ${row.topError ? `<span class="api-row__err">${esc(t(row.topError))} · ${esc(t('api.errCount', { n: row.errorCount }))}</span>` : ''}
          </article>`).join('')}
      </section>`).join('')
      : `<p class="api-empty">${esc(t('api.noErrors'))}</p>`;

    const errs = inst.ledger.filter(r => r.status === 'needs-correction').length;
    $('#dsNotify').disabled = errs === 0;
    $('#dsNotify').textContent = errs
      ? t('api.notifyErrorsN', { n: errs })
      : t('api.notifyErrors');
  }

  function ledgerMeta(row) {
    const bits = [];
    if (row.channel) bits.push(t('api.chan.' + row.channel));
    bits.push(row.lastDays == null ? t('api.neverReceived') : t('api.received', { when: sinceLabel(row.lastDays) }));
    const od = row.status === 'non-submitted' ? overdueDays(row) : 0;
    if (od > 0) bits.push(t('api.overdue', { n: od }));
    else if (!dueOf(row)) bits.push(t('api.continuous'));
    return bits.join(' · ');
  }

  function openLedger(code) {
    ledgerInst = A.get(code);
    ledgerScope = 'all';
    document.querySelectorAll('#dsScope button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.scope === 'all')));
    renderLedger();
    openDrawer($('#dsDrawer'), $('#dsScrim'), $('#dsDrawerClose'));
  }

  // ---------- drawer: the email composer ----------

  let mailInst = null;         // the institution this send will reach
  let mailMode = 'preview';

  // Priority is what the admin would actually chase first: broken submissions before
  // missing ones, and the oldest deadline before the newest.
  function priorityRows(inst) {
    const rank = { 'needs-correction': 0, 'non-submitted': 1, processing: 2, accepted: 3 };
    return inst.ledger
      .filter(r => r.status !== 'accepted')
      .sort((a, b) => (rank[a.status] - rank[b.status]) || a.title.localeCompare(b.title))
      .slice(0, 5);
  }

  function counts(inst) {
    const c = { accepted: 0, processing: 0, 'needs-correction': 0, 'non-submitted': 0 };
    for (const r of inst.ledger) c[r.status]++;
    return c;
  }

  function defaultSubject(inst) {
    return t('api.mailSubject', { name: shortName(inst), period: CYCLE.label });
  }

  // "American University In The Emirates" becomes "AUE" — the initials an email would use.
  function shortName(inst) {
    const skip = /^(in|the|of|and|for|at)$/i;
    const initials = inst.name.split(/\s+/).filter(w => !skip.test(w)).map(w => w[0]).join('');
    return initials.length >= 2 && initials.length <= 5 ? initials.toUpperCase() : inst.name;
  }

  function defaultBody(inst, focusSheets) {
    const lines = [t('api.mailGreeting', { name: shortName(inst) }), '', t('api.mailIntro')];
    if (focusSheets && focusSheets.length) {
      lines.push('', t('api.mailErrorsLede', { n: focusSheets.length }));
    }
    if (!A.consuming(inst)) lines.push('', t('api.mailNotConsuming'));
    else if (inst.tier === 'dormant') lines.push('', t('api.mailDormant', { when: sinceLabel(inst.lastCallDays) }));
    lines.push('', t('api.mailClose'));
    return lines.join('\n');
  }

  function renderMailPreview() {
    const inst = mailInst;
    if (!inst) return;
    const c = counts(inst);
    const pri = priorityRows(inst);

    $('#mailPreview').innerHTML = `
      <div class="mailprev__rule"></div>
      <div class="mailprev__inner">
        <div class="mailprev__brand">
          <span class="mailprev__logo">KHDA</span>
          <span class="mailprev__org">${esc(t('api.mailOrg'))}</span>
        </div>
        <span class="mailprev__period">${esc(CYCLE.label)}</span>
        <h3 class="mailprev__head">${esc(t('api.mailHeadline'))}</h3>
        <p class="mailprev__body">${esc($('#mailBody').value)}</p>
        <div class="mailprev__counts">
          ${['non-submitted', 'needs-correction', 'processing'].map(k => `
            <div class="mailprev__count">
              <div class="mailprev__countValue">${c[k]}</div>
              <div class="mailprev__countLabel">${esc(t('api.st.' + k))}</div>
            </div>`).join('')}
        </div>
        <p class="mailprev__accepted">${esc(t('api.mailAccepted', { a: c.accepted, n: inst.ledger.length }))}</p>
        ${pri.length ? `
          <div class="mailprev__subTitle">${esc(t('api.mailPriority'))}</div>
          <table class="mailprev__table">
            <thead><tr>
              <th>${esc(t('api.mailColDataset'))}</th>
              <th>${esc(t('api.mailColStatus'))}</th>
              <th>${esc(t('api.mailColDue'))}</th>
            </tr></thead>
            <tbody>${pri.map(r => {
              const due = dueOf(r);
              const od = overdueDays(r);
              return `<tr>
                <td>${esc(r.title)}</td>
                <td>${esc(t('api.st.' + r.status))}</td>
                <td>${due ? esc(dateLabel(due)) : esc(t('api.continuous'))}
                  ${due && od > 0 ? `<span class="mailprev__overdue">${esc(t('api.overdue', { n: od }))}</span>` : ''}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>` : ''}
        <p class="mailprev__foot">${esc(t('api.mailFoot'))}</p>
      </div>`;
  }

  function openMail(code, focusSheets) {
    mailInst = A.get(code);
    if (!mailInst) return;
    mailMode = 'preview';

    $('#mailSubject').value = defaultSubject(mailInst);
    $('#mailBody').value = defaultBody(mailInst, focusSheets);
    $('#mailTo').textContent = t('api.mailTo', { name: mailInst.name, email: mailInst.contact.email });
    $('#mailDrawerTitle').textContent = t('api.sendEmail');

    setMailMode('preview');
    renderMailPreview();
    openDrawer($('#mailDrawer'), $('#mailScrim'), $('#mailSubject'));
  }

  function setMailMode(mode) {
    mailMode = mode;
    document.querySelectorAll('#mailMode button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('#mailPreview').hidden = mode !== 'preview';
    $('#mailEditWrap').hidden = mode !== 'edit';
    if (mode === 'preview') renderMailPreview();
  }

  /* The competitor's build renders the same email and then greys out Send. Here the send
     completes: it stamps the follow-up trail and the row shows when the institution was
     last chased. Nothing leaves the browser — there is no mail server behind a wireframe —
     but the record is real and survives a reload.

     It deliberately does not write to KHDA_ACTIVITY: that log feeds the institution's own
     dashboard, where each entry links to a dataset the institution can open. A KHDA-side
     follow-up belongs to the admin, so it lives in this page's own key. */
  function send() {
    if (!mailInst) return;
    store.notified[mailInst.code] = new Date().toISOString();
    save();

    if (window.khdaToast) {
      window.khdaToast('success', t('api.sentTitle'), t('api.sentText', { name: mailInst.name }));
    }

    closeDrawer($('#mailDrawer'), $('#mailScrim'));
    renderTable();
  }

  // ---------- wiring ----------

  function bind() {
    $('#apiFilter').addEventListener('click', e => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      store.filter = b.dataset.filter;
      save();
      page = 1;
      document.querySelectorAll('#apiFilter button').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.filter === store.filter)));
      renderTable();
    });

    // any change to what the table shows returns to the first page, so the footer never
    // reports "showing 21 to 30" of a set that now holds four rows
    $('#apiSearch').addEventListener('input', () => { page = 1; renderTable(); });

    $('#apiPageSize').addEventListener('change', e => {
      pageSize = Number(e.target.value) || 10;
      page = 1;
      renderTable();
    });

    document.querySelectorAll('#apiTable th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (store.sort === key) store.dir = store.dir === 'asc' ? 'desc' : 'asc';
        // text sorts read best A–Z, figures best worst-first, so each column opens the way
        // an admin would want to read it
        else { store.sort = key; store.dir = (key === 'name' || key === 'channel') ? 'asc' : 'desc'; }
        save();
        renderTable();
      });
    });

    $('#apiBody').addEventListener('click', e => {
      const view = e.target.closest('[data-view]');
      if (view) return openLedger(Number(view.dataset.view));
      const mail = e.target.closest('[data-mail]');
      if (mail) return openMail(Number(mail.dataset.mail));
    });

    $('#dsScope').addEventListener('click', e => {
      const b = e.target.closest('[data-scope]');
      if (!b) return;
      ledgerScope = b.dataset.scope;
      document.querySelectorAll('#dsScope button').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.scope === ledgerScope)));
      renderLedger();
    });

    $('#dsNotify').addEventListener('click', () => {
      const inst = ledgerInst;
      if (!inst) return;
      const errs = inst.ledger.filter(r => r.status === 'needs-correction').map(r => r.sheet);
      closeDrawer($('#dsDrawer'), $('#dsScrim'));
      openMail(inst.code, errs);
    });

    $('#dsDrawerClose').addEventListener('click', () => closeDrawer($('#dsDrawer'), $('#dsScrim')));
    $('#dsScrim').addEventListener('click', () => closeDrawer($('#dsDrawer'), $('#dsScrim')));

    $('#mailMode').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (b) setMailMode(b.dataset.mode);
    });
    $('#mailClose').addEventListener('click', () => closeDrawer($('#mailDrawer'), $('#mailScrim')));
    $('#mailCancel').addEventListener('click', () => closeDrawer($('#mailDrawer'), $('#mailScrim')));
    $('#mailScrim').addEventListener('click', () => closeDrawer($('#mailDrawer'), $('#mailScrim')));
    $('#mailSend').addEventListener('click', send);

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#mailDrawer').hidden) closeDrawer($('#mailDrawer'), $('#mailScrim'));
      else if (!$('#dsDrawer').hidden) closeDrawer($('#dsDrawer'), $('#dsScrim'));
    });
  }

  function boot() {
    document.querySelectorAll('#apiFilter button').forEach(x =>
      x.setAttribute('aria-pressed', String(x.dataset.filter === store.filter)));
    renderStats();
    renderAdoption();
    renderOutcomes();
    renderVolume();
    renderWaves();
    renderTable();
    bind();
  }

  // i18n.js reloads the page on a language switch, so one pass is enough
  boot();
})();
