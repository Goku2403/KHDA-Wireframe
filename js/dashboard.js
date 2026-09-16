/* HEDB dashboard — layout follows the Portal Delivery dashboard frame (24570:127550).
   Every figure is read from the datasets in the data dictionary and from the drafts the
   institution has saved in this browser, so the page reflects real submission state. */
(function () {
  'use strict';

  const S = window.KHDA_SCHEMA;
  const DATA = window.KHDA_DATASETS || [];
  const $ = s => document.querySelector(s);
  const t = (k, v) => (window.t ? window.t(k, v) : k);

  // the export module owns these, so the chart and the workbook can never disagree
  const CYCLE = (window.KHDA_EXPORT && window.KHDA_EXPORT.CYCLE) || '2025 – 26';

  // ---------- read what the institution has entered ----------
  function draftOf(sheet) {
    try { return JSON.parse(localStorage.getItem('khda.hedb.' + sheet.replace(/[^A-Za-z0-9]+/g, '_') + '.v1') || '{}'); }
    catch { return {}; }
  }

  const rows = DATA.map((d, i) => {
    const schema = S.get(d.sheet);
    const draft = draftOf(d.sheet);
    const records = draft.records || [];
    const errors = records.filter(r => Object.keys(S.validate(r, records, schema)).length).length;
    const status = draft.submittedAt ? 'submitted' : errors ? 'errors' : records.length ? 'progress' : 'new';
    return {
      idx: i, sheet: d.sheet, title: d.title, group: d.group, kind: d.kind,
      fields: d.fields.length, records: records.length, errors, status,
      submittedAt: draft.submittedAt || null,
      ref: 'HEDB-2026-' + String(i + 1).padStart(3, '0'),
      realtime: d.kind === 'Real-time',
    };
  });

  // requirement + receipt per dataset from the sector model (own institution, selected period);
  // local drafts override: a draft submitted here shows as "in validation" until the pipeline reports
  const K = window.KHDA_SECTOR;
  const OWN = K ? K.own() : null;
  const PER = K ? K.period() : null;
  rows.forEach(r => {
    const sub = K ? K.subsOf(OWN, PER)[r.idx] : null;
    r.sub = sub;
    r.due = sub && sub.req.due;
    r.dueText = sub ? K.dueText(sub) : '';
    r.overdue = !!(sub && sub.req.due && sub.req.due < K.TODAY && !K.RECEIVED(sub) && r.status !== 'submitted');
    r.upcoming = !!(sub && sub.req.due && sub.req.due >= K.TODAY && !K.RECEIVED(sub) && r.status !== 'submitted');
    r.pipeline = r.status === 'submitted' ? { ...sub, status: 'in_validation', receivedAt: new Date(r.submittedAt), channel: 'portal', issues: [] } : (sub && K.RECEIVED(sub) ? sub : null);
  });

  const totals = {
    datasets: rows.length,
    started: rows.filter(r => r.records > 0).length,
    submitted: rows.filter(r => r.status === 'submitted').length,
    errors: rows.reduce((n, r) => n + r.errors, 0),
    records: rows.reduce((n, r) => n + r.records, 0),
    fields: rows.reduce((n, r) => n + r.fields, 0),
  };

  const fmt = n => Number(n || 0).toLocaleString(window.KHDA_I18N && window.KHDA_I18N.lang === 'ar' ? 'ar-AE' : 'en-US');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const entryHref = sheet => 'index.html?sheet=' + encodeURIComponent(sheet);

  // ---------- highlights carousel ----------
  const SLIDES = [
    { key: 'cycle', theme: 'a' },
    { key: 'template', theme: 'b' },
    { key: 'realtime', theme: 'c' },
  ];
  let slide = 0, timer = null;

  function renderHero() {
    $('#heroSlides').innerHTML = SLIDES.map((s, i) => `
      <article class="hero-slide hero-slide--${s.theme}${i === 0 ? ' is-on' : ''}" data-slide="${i}" ${i === 0 ? '' : 'aria-hidden="true"'}>
        <h2 class="hero-slide__title">${esc(t('dash.slide.' + s.key + '.title'))}</h2>
        <p class="hero-slide__text">${esc(t('dash.slide.' + s.key + '.text', { n: totals.datasets, r: rows.filter(r => r.realtime).length }))}</p>
        <a class="btn btn--light btn--sm" href="submissions.html">${esc(t('dash.slide.cta'))}</a>
      </article>`).join('');
    $('#heroDots').innerHTML = SLIDES.map((s, i) =>
      `<button type="button" role="tab" class="hero-dot${i === 0 ? ' is-on' : ''}" data-dot="${i}"
        aria-selected="${i === 0}" aria-label="${esc(t('dash.slideN', { n: i + 1 }))}"></button>`).join('');

    const show = i => {
      slide = (i + SLIDES.length) % SLIDES.length;
      document.querySelectorAll('.hero-slide').forEach((el, n) => {
        el.classList.toggle('is-on', n === slide);
        if (n === slide) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
      });
      document.querySelectorAll('.hero-dot').forEach((el, n) => {
        el.classList.toggle('is-on', n === slide);
        el.setAttribute('aria-selected', String(n === slide));
      });
    };
    $('#heroDots').addEventListener('click', e => {
      const b = e.target.closest('[data-dot]');
      if (!b) return;
      show(Number(b.dataset.dot));
      restart();
    });
    function restart() {
      clearInterval(timer);
      timer = setInterval(() => show(slide + 1), 7000);
    }
    const card = document.querySelector('.dash-card--hero');
    card.addEventListener('mouseenter', () => clearInterval(timer));
    card.addEventListener('mouseleave', restart);
    restart();
  }

  // ---------- remediation queue ----------
  const RANK = { errors: 0, progress: 1, new: 2, submitted: 3 };
  const CHIP = { errors: 'error', progress: 'current', new: 'neutral', submitted: 'complete' };

  const TASK_PAGE = 5;
  let taskFilter = 'attention';
  let taskExpanded = false;

  const MATCHES = {
    attention: r => r.status === 'errors' || r.status === 'progress',
    progress: r => r.status === 'progress',
    new: r => r.status === 'new',
    overdue: r => r.overdue,
    upcoming: r => r.upcoming,
    all: () => true,
  };

  function renderTasks() {
    const matching = rows.slice()
      .sort((a, b) => (taskFilter === 'overdue' || taskFilter === 'upcoming') && a.due && b.due ? a.due - b.due : (RANK[a.status] - RANK[b.status]) || (b.records - a.records) || (a.idx - b.idx))
      .filter(r => taskFilter === 'all' ? true : MATCHES[taskFilter](r));
    const list = taskExpanded ? matching : matching.slice(0, TASK_PAGE);

    const more = $('#taskMore');
    more.hidden = matching.length <= TASK_PAGE;
    more.textContent = taskExpanded
      ? t('dash.showFewer')
      : t('dash.showAllTasks', { n: matching.length });

    $('#taskEmpty').hidden = list.length > 0;
    $('#taskList').hidden = list.length === 0;
    if (!list.length) {
      // say why the list is empty, which depends on what is being filtered for
      const custom = { overdue: ['Nothing overdue', 'Every dated dataset is in before its due date.'], upcoming: ['Nothing due soon', 'No dated dataset is still waiting for a submission.'] }[taskFilter];
      $('#taskEmpty').querySelector('.empty__title').textContent = custom ? custom[0] : t('dash.empty.' + taskFilter + '.title');
      $('#taskEmpty').querySelector('.empty__text').textContent = custom ? custom[1] : t('dash.empty.' + taskFilter + '.text');
    }
    $('#taskList').innerHTML = list.map(r => {
      const detail = r.status === 'errors' ? t('dash.task.errors', { n: r.errors })
        : r.status === 'progress' ? t('dash.task.ready')
          : t('dash.task.notStarted');
      const count = r.records ? t('dash.task.records', { n: fmt(r.records) }) : t('dash.task.noRecords');
      return `<li class="task">
        <span class="task__ref">${esc(r.ref)}</span>
        <span class="task__main">
          <span class="task__name">${esc(r.title)}</span>
          <span class="task__sub">${esc(t('dash.task.sub', { g: t('group.' + r.group), n: r.fields }))}${r.due ? ` · <span class="${r.overdue ? 'is-late' : ''}" style="${r.overdue ? 'color:var(--error)' : ''}">${esc(r.dueText)}</span>` : ''}</span>
        </span>
        <span class="task__count">
          <span class="task__countValue">${esc(count)}</span>
          <span class="task__sub">${esc(detail)}</span>
        </span>
        <span class="chip chip--${CHIP[r.status]}">${esc(t('dash.status.' + r.status))}</span>
        <a class="task__go" href="${entryHref(r.sheet)}" aria-label="${esc(t('dash.openDataset', { x: r.title }))}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
        </a>
      </li>`;
    }).join('');
  }

  function bindTasks() {
    $('#taskFilter').addEventListener('click', e => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      taskFilter = b.dataset.filter;
      taskExpanded = false;
      document.querySelectorAll('#taskFilter button').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.filter === taskFilter)));
      renderTasks();
    });
    $('#taskMore').addEventListener('click', () => {
      taskExpanded = !taskExpanded;
      renderTasks();
    });
  }

  // ---------- recent activity ----------
  const ACTIVITY_ICONS = {
    added: '<path d="M12 5v14m-7-7h14"/>',
    updated: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    deleted: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
    imported: '<path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v4h16v-4"/>',
    submitted: '<path d="M20 6 9 17l-5-5"/>',
  };
  const ACTIVITY_TONE = {
    added: 'ok', updated: 'info', deleted: 'warn', imported: 'info', submitted: 'ok',
  };

  function whenText(ms) {
    const secs = Math.round((ms - Date.now()) / 1000);
    const locale = window.KHDA_I18N && window.KHDA_I18N.lang === 'ar' ? 'ar-AE' : 'en-GB';
    if (Math.abs(secs) < 60) return t('dash.justNow');
    let rtf;
    try { rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }); } catch { rtf = null; }
    const steps = [['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800], ['month', 2629800]];
    let unit = 'minute', value = Math.round(secs / 60);
    for (const [name, size] of steps) {
      if (Math.abs(secs) >= size) { unit = name; value = Math.round(secs / size); }
    }
    return rtf ? rtf.format(value, unit) : new Date(ms).toLocaleDateString(locale);
  }

  function renderActivity() {
    const log = window.KHDA_ACTIVITY ? window.KHDA_ACTIVITY.recent(8) : [];
    $('#activityEmpty').hidden = log.length > 0;
    $('#activityFeed').hidden = log.length === 0;
    const total = window.KHDA_ACTIVITY ? window.KHDA_ACTIVITY.all().length : 0;
    const chip = $('#activityCount');
    chip.hidden = !total;
    chip.textContent = t('dash.activityCount', { n: total });

    const titleOf = sheet => {
      const hit = rows.find(r => r.sheet === sheet);
      return hit ? hit.title : sheet;
    };

    $('#activityFeed').innerHTML = log.map(e => `
      <li class="feed__item">
        <span class="feed__dot feed__dot--${ACTIVITY_TONE[e.type] || 'info'}" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ACTIVITY_ICONS[e.type] || ACTIVITY_ICONS.updated}</svg>
        </span>
        <span class="feed__body">
          <a class="feed__what" href="${entryHref(e.sheet)}">${esc(t('dash.event.' + e.type, { n: fmt(e.n) }))}</a>
          <span class="feed__where">${esc(titleOf(e.sheet))}</span>
        </span>
        <time class="feed__when" datetime="${new Date(e.t).toISOString()}">${esc(whenText(e.t))}</time>
      </li>`).join('');
  }

  // ---------- institution ----------
  function institution() {
    // the code entered most often across all drafts names the institution this account files for
    const tally = new Map();
    for (const d of DATA) {
      const schema = S.get(d.sheet);
      const f = schema.fields.find(x => /institution\s*name/i.test(x.label) && x.derivedFrom)
        || schema.fields.find(x => /institution\s*name/i.test(x.label));
      if (!f) continue;
      for (const r of (draftOf(d.sheet).records || [])) {
        const v = String(r[f.key] || '').trim();
        if (v) tally.set(v, (tally.get(v) || 0) + 1);
      }
    }
    const best = [...tally].sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : (OWN ? OWN.name : t('dash.institutionFallback'));
  }

  // The institution code this account files under, read from the data rather than invented.
  function institutionCode() {
    const tally = new Map();
    for (const r of rows) {
      if (!r.records) continue;
      const schema = S.get(r.sheet);
      const f = schema.fields.find(x => /institution\s*code/i.test(x.label) && x.opts);
      if (!f) continue;
      for (const rec of (draftOf(r.sheet).records || [])) {
        const v = String(rec[f.key] || '').trim();
        if (v) tally.set(v, (tally.get(v) || 0) + 1);
      }
    }
    const best = [...tally].sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }

  function renderProfile() {
    const name = institution();
    $('#profileName').textContent = name;
    $('#profileCrest').textContent = (name.match(/\b[A-Za-z؀-ۿ]/g) || ['K']).slice(0, 2).join('').toUpperCase();
    $('#profileCycle').textContent = t('dash.licensed', { y: CYCLE });

    const code = institutionCode();
    const lastAt = rows.map(r => r.submittedAt).filter(Boolean).sort().pop();

    // Everything here is something this submission actually knows, rather than placeholder
    // contact details the portal has no source for.
    const facts = [
      ['id', t('dash.fact.code'), code || t('dash.fact.none')],
      ['grid', t('dash.fact.datasets'), t('dash.fact.ofTotal', { a: fmt(totals.submitted), b: fmt(totals.datasets) })],
      ['rows', t('dash.fact.records'), fmt(totals.records)],
      ['alert', t('dash.meter.attention'), fmt(totals.errors)],
      ['clock', t('dash.fact.lastSubmission'), lastAt ? whenText(new Date(lastAt).getTime()) : t('dash.fact.never')],
    ];
    const ICONS = {
      id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 14h4M5 17c1-2 5-2 6 0"/>',
      grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
      rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
      alert: '<path d="M12 9v5m0 3h.01"/><path d="M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    };
    $('#profileFacts').innerHTML = facts.map(([icon, label, value]) => `
      <div class="fact">
        <dt class="fact__label">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[icon]}</svg>
          <span>${esc(label)}</span>
        </dt>
        <dd class="fact__value">${esc(value)}</dd>
      </div>`).join('');
  }

  // ---------- quick actions ----------
  function renderQuick() {
    const firstOpen = rows.find(r => r.status !== 'submitted') || rows[0];
    const firstWithData = rows.find(r => r.records > 0) || rows[0];
    const items = [
      { icon: '<path d="M12 5v14m-7-7h14"/>', label: t('dash.quick.start'), href: 'submissions.html' },
      { icon: '<path d="M14 3v5h5M7 3h7l5 5v13H7z"/><path d="M12 11v6m-2.5-2.5L12 17l2.5-2.5"/>', label: t('dash.quick.continue'), href: entryHref(firstOpen.sheet) },
      { icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', label: t('dash.quick.report'), href: 'report.html?sheet=' + encodeURIComponent(firstWithData.sheet) },
    ];
    $('#quickList').innerHTML = items.map(i => `
      <li><a class="quick" href="${i.href}">
        <span class="quick__icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${i.icon}</svg></span>
        <span class="quick__label">${esc(i.label)}</span>
        <svg class="quick__go" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
      </a></li>`).join('');
  }

  // ---------- progress gauge ----------
  const STATE_COLOUR = { submitted: 'var(--success)', progress: 'var(--warning)', new: 'var(--outline-variant)' };
  let scope = 'periodic';

  function renderProgress() {
    const set = rows.filter(r => (scope === 'realtime') === r.realtime);
    const counts = {
      submitted: set.filter(r => r.status === 'submitted').length,
      progress: set.filter(r => r.status === 'progress' || r.status === 'errors').length,
      new: set.filter(r => r.status === 'new').length,
    };
    const total = set.length || 1;

    $('#progressLegend').innerHTML = ['submitted', 'progress', 'new'].map(k => `
      <span class="legend__item">
        <span class="legend__dot" style="background:${STATE_COLOUR[k]}"></span>
        <span class="legend__value">${fmt(counts[k])}</span>
        <span class="legend__label">${esc(t('dash.state.' + k))}</span>
      </span>`).join('');

    // half ring from 180deg to 360deg, one arc per state
    const R = 92, CX = 120, CY = 120;
    const pt = a => [CX + R * Math.cos(Math.PI * a), CY + R * Math.sin(Math.PI * a)];
    let at = 1;
    const arcs = ['submitted', 'progress', 'new'].map(k => {
      const share = counts[k] / total;
      if (share <= 0) return '';
      const to = at + share;
      const [x1, y1] = pt(at), [x2, y2] = pt(Math.min(to, 2));
      at = to;
      // each slice is a fraction of a half turn, so it can never exceed 180 degrees
      return `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${STATE_COLOUR[k]}"/>`;
    }).join('');
    $('#gaugeArcs').innerHTML = arcs ||
      `<path d="M 28 120 A ${R} ${R} 0 1 1 212 120" stroke="var(--outline)"/>`;

    $('#gaugeNumber').textContent = fmt(counts.submitted);
    $('#gaugeCaption').textContent = t('dash.gaugeCaption', { n: fmt(set.length) });
  }

  function bindProgress() {
    $('#progressScope').addEventListener('click', e => {
      const b = e.target.closest('[data-scope]');
      if (!b) return;
      scope = b.dataset.scope;
      document.querySelectorAll('#progressScope button').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.scope === scope)));
      renderProgress();
    });
  }

  // ---------- submission calendar ----------
  // Cadence decides the window a dataset falls in: semester datasets are collected twice a
  // year, annual ones once, and real-time feeds stay open throughout.
  const WINDOWS = (window.KHDA_EXPORT && window.KHDA_EXPORT.WINDOWS) || [];
  const GROUP_COLOUR = { Semester: 'var(--primary)', Annual: 'var(--info)', 'Real-time': '#7C3AED' };

  function renderCalendar() {
    const perGroup = {};
    for (const g of ['Semester', 'Annual', 'Real-time']) perGroup[g] = rows.filter(r => r.group === g).length;

    const bars = WINDOWS.map(w => {
      const parts = ['Semester', 'Annual', 'Real-time']
        .map(g => ({ g, n: w.groups[g] ? perGroup[g] : 0 }))
        .filter(p => p.n > 0);
      return { month: w.month, parts, total: parts.reduce((n, p) => n + p.n, 0) };
    });
    const max = Math.max(1, ...bars.map(b => b.total));

    $('#months').innerHTML = bars.map(b => `
      <div class="month">
        <span class="month__total">${fmt(b.total)}</span>
        <div class="month__stack" style="height:${Math.round(b.total / max * 100)}%">
          ${b.parts.map(p => `<span class="month__part" style="flex:${p.n};background:${GROUP_COLOUR[p.g]}"
             title="${esc(t('group.' + p.g))}: ${fmt(p.n)}"></span>`).join('')}
        </div>
        <span class="month__label">${esc(t('dash.month.' + b.month))}</span>
      </div>`).join('');

    $('#calendarLegend').innerHTML = ['Semester', 'Annual', 'Real-time'].map(g => `
      <span class="legend__item">
        <span class="legend__dot" style="background:${GROUP_COLOUR[g]}"></span>
        <span class="legend__label">${esc(t('group.' + g))}</span>
      </span>`).join('');
  }

  // ---------- analytics meters ----------
  function renderMeters() {
    const items = [
      { label: t('dash.meter.started'), value: t('dash.fact.ofTotal', { a: fmt(totals.started), b: fmt(totals.datasets) }), pct: totals.started / totals.datasets, colour: 'var(--success)' },
      { label: t('dash.meter.records'), value: fmt(totals.records), pct: Math.min(1, totals.records / 200), colour: 'var(--info)' },
      { label: t('dash.meter.attention'), value: fmt(totals.errors), pct: totals.records ? totals.errors / totals.records : 0, colour: totals.errors ? 'var(--error)' : 'var(--outline-variant)' },
    ];
    $('#meters').innerHTML = items.map(i => `
      <div class="meter">
        <div class="meter__row">
          <span class="meter__label">${esc(i.label)}</span>
          <span class="meter__value">${esc(i.value)}</span>
        </div>
        <span class="meter__track"><span class="meter__fill" style="width:${Math.max(3, Math.round(i.pct * 100))}%;background:${i.colour}"></span></span>
      </div>`).join('');
  }


  // ---------- KPI tiles (plan I-1) ----------
  function renderKpis() {
    const host = $('#kpis'); if (!host || !K) return;
    const sm = K.summary(OWN, PER);
    const submitted = rows.filter(r => r.status === 'submitted').length + sm.received;
    const accepted = sm.accepted, needs = sm.needsCorrection, overdue = rows.filter(r => r.overdue).length;
    host.innerHTML = `
      <a class="kpi kpi--primary" href="submissions.html"><div class="kpi__label">Total datasets</div><div class="kpi__value">${totals.datasets}</div><div class="kpi__note">in the catalogue · ${sm.required} required this period</div><span class="kpi__link">View all datasets →</span></a>
      <a class="kpi kpi--success" href="submissions.html?view=table&status=accepted"><div class="kpi__label">Accepted</div><div class="kpi__value">${accepted}</div><div class="kpi__note">${Math.round(accepted / Math.max(1, sm.required) * 100)}% of required · ${Math.min(submitted, sm.required)} received</div><span class="kpi__link">${esc(PER.label)} →</span></a>
      <a class="kpi kpi--error" href="remediation.html"><div class="kpi__label">Needs correction</div><div class="kpi__value">${needs + rows.filter(r => r.status === 'errors').length}</div><div class="kpi__note">${sm.rowsRejected.toLocaleString()} rows rejected · ${sm.openIssues} open rules</div><span class="kpi__link">Remediation report →</span></a>
      <button class="kpi kpi--warning" type="button" id="kpiOverdue" style="text-align:left;cursor:pointer"><div class="kpi__label">Overdue</div><div class="kpi__value">${overdue}</div><div class="kpi__note">past their due date with no receipt</div><span class="kpi__link">Show overdue →</span></button>
      <a class="kpi kpi--info" href="leaderboard.html"><div class="kpi__label">Readiness rank</div><div class="kpi__value">#${K.ranking(PER.id).find(x => x.inst.id === OWN.id).rank}<small style="font:400 16px/24px var(--font);color:var(--on-surface-muted)"> of ${K.INSTITUTIONS.length}</small></div><div class="kpi__note">${K.ranking(PER.id).find(x => x.inst.id === OWN.id).total} / 1,000 points</div><span class="kpi__link">Leaderboard →</span></a>`;
    $('#kpiOverdue').addEventListener('click', () => { document.querySelector('#taskFilter [data-filter="overdue"]').click(); document.querySelector('.dash-card--tasks').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  // ---------- in-flight journeys (plan X-2) ----------
  function renderJourneys() {
    const host = $('#journeys'); if (!host || !K || !window.KHDA_JOURNEY) return;
    const live = rows.filter(r => r.pipeline && ['in_validation', 'dispatched', 'needs_correction'].includes(r.pipeline.status)).slice(0, 4);
    if (!live.length) { host.innerHTML = '<div class="empty empty--inline"><div class="empty__title">Nothing in the pipeline</div><div class="empty__text">Submit a dataset and its journey through iPaaS, the API Hub and the Qlik DQ layer appears here.</div></div>'; return; }
    host.innerHTML = live.map(r => `<div class="journey-row"><div><div class="task__name">${esc(r.title)}</div><div class="task__sub">${K.STATUS[r.pipeline.status][0]} · v${r.pipeline.version || 1} · ${r.pipeline.channel === 'api' ? 'API' : 'Portal'} · <a href="submissions.html?details=${encodeURIComponent(r.sheet)}&tab=journey">Full journey →</a></div></div>${window.KHDA_JOURNEY.render(r.pipeline, { compact: true })}</div>`).join('');
  }

  // ---------- boot ----------
  renderKpis();
  renderJourneys();
  renderHero();
  renderTasks();
  bindTasks();
  renderActivity();
  renderProfile();
  renderQuick();
  bindProgress();
  renderProgress();
  renderCalendar();
  renderMeters();
})();
