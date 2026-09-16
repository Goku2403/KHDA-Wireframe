/* KHDA — configuration page: pick a dataset, walk its fields, author validation rules. */
(function () {
  'use strict';

  const R = window.KHDA_RULES, S = window.KHDA_SCHEMA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const t = (k, v) => (window.t ? window.t(k, v) : k);

  const rail = $('#fieldRail'), pane = $('#rulePane');
  const dsButton = $('#dsButton'), dsPanel = $('#dsPanel'), dsList = $('#dsList'), dsValue = $('#dsValue');
  if (!rail || !pane || !dsButton) return;

  const DATA = window.KHDA_DATASETS || [];
  const state = { sheet: null, schema: null, doc: null, selectedKey: null, query: '', filter: 'all' };

  // KHDA_SCHEMA.get() falls back to the first dataset for an unknown sheet rather than
  // returning null, so the sheet is checked here before it is trusted.
  function validSheet(sheet) {
    return DATA.some(d => d.sheet === sheet) ? sheet : (DATA[0] && DATA[0].sheet);
  }

  function setDataset(sheet) {
    state.sheet = validSheet(sheet);
    state.schema = S.get(state.sheet);
    state.doc = R.load(state.sheet);
    state.selectedKey = null;
    dsValue.textContent = state.schema.title;
    const url = new URL(location.href);
    url.searchParams.set('sheet', state.sheet);
    history.replaceState(null, '', url);
    renderApiCode();
    renderRail();
    renderPane();
    paintSubmitted();
  }

  const rulesOf = key => (state.doc.byField[key] || []);
  const activeCount = key => rulesOf(key).filter(r => r.enabled).length;

  function visibleFields() {
    const q = state.query.trim().toLowerCase();
    return state.schema.fields.filter(f => {
      const n = activeCount(f.key);
      if (state.filter === 'has' && !n) return false;
      if (state.filter === 'none' && n) return false;
      if (!q) return true;
      return (f.label + ' ' + f.db).toLowerCase().includes(q);
    });
  }

  const CHEVRON = '<svg class="cfg-field__go" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  function renderRail() {
    rail.innerHTML = '';
    const shown = visibleFields();
    for (const f of shown) {
      const n = activeCount(f.key);
      const hasCustom = rulesOf(f.key).some(r => r.origin === 'custom' && r.enabled);
      const li = document.createElement('li');
      li.className = 'cfg-field' + (f.key === state.selectedKey ? ' is-selected' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(f.key === state.selectedKey));
      li.dataset.key = f.key;
      li.innerHTML =
        '<span class="cfg-field__dot' + (hasCustom ? ' is-custom' : '') + '" aria-hidden="true"></span>' +
        '<span class="cfg-field__text"><span class="cfg-field__name"></span>' +
        '<span class="cfg-field__db"></span></span>' +
        '<span class="cfg-field__count chip chip--neutral">' + n + '</span>' + CHEVRON;
      li.querySelector('.cfg-field__name').textContent = f.label;   // field names stay English
      li.querySelector('.cfg-field__db').textContent = f.db;
      li.addEventListener('click', () => selectField(f.key));
      rail.appendChild(li);
    }
    const count = $('#fieldCount');
    if (count) count.textContent = String(shown.length);
    renderStats();
  }

  // The header answers "what shape is this dataset in" without opening a single field:
  // four counters, then coverage and a rule-type breakdown drawn with the dashboard's bars.
  function renderStats() {
    const tiles = $('#cfgTiles'), charts = $('#cfgCharts');
    if (!tiles || !charts) return;
    const fields = state.schema.fields;
    const active = fields.reduce((a, f) => a.concat(rulesOf(f.key).filter(r => r.enabled)), []);
    const covered = fields.filter(f => activeCount(f.key) > 0).length;
    const custom = active.filter(r => r.origin === 'custom').length;
    const pct = fields.length ? Math.round((covered / fields.length) * 100) : 0;

    tiles.innerHTML = '';
    const tile = (value, label, sub) => {
      const el = document.createElement('div');
      el.className = 'cfg-tile';
      const v = document.createElement('span');
      v.className = 'cfg-tile__value';
      v.textContent = value;
      const l = document.createElement('span');
      l.className = 'cfg-tile__label';
      l.textContent = label;
      el.appendChild(v); el.appendChild(l);
      if (sub) {
        const s = document.createElement('span');
        s.className = 'cfg-tile__sub';
        s.textContent = sub;
        el.appendChild(s);
      }
      tiles.appendChild(el);
    };
    tile(fields.length, t('cfg.fields'));
    tile(active.length, t('cfg.statRules'));
    tile(custom, t('cfg.statCustom'));
    tile(pct + '%', t('cfg.statCoverage'), t('cfg.ofFields', { n: covered, total: fields.length }));

    charts.innerHTML = '';
    renderCoverage(charts);
  }

  // Rule counts per type, one series — identity comes from the row labels, not colour,
  // and every row is direct-labelled, so no legend is needed.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (name, attrs) => {
    const el = document.createElementNS(SVG_NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  // a step that divides evenly, so every gridline is a whole number of rules — never 3.5 of one
  function axisFor(n) {
    for (const step of [1, 2, 5, 10, 20, 25, 50, 100]) {
      if (Math.ceil(n / step) <= 5) return { step, max: Math.max(step, Math.ceil(n / step) * step) };
    }
    return { step: 200, max: Math.ceil(n / 200) * 200 };
  }

  // Six fixed validation dimensions. A radar is only honest when every axis shares one scale,
  // so each is a percentage of fields carrying that kind of check — not a raw rule count.
  const DIMENSIONS = [
    { key: 'presence',  types: ['REQUIRED', 'CONDITIONAL_REQUIRED'] },
    { key: 'type',      types: ['DATA_TYPE'] },
    { key: 'length',    types: ['MIN_LENGTH', 'MAX_LENGTH'] },
    { key: 'format',    types: ['EMAIL_FORMAT', 'PHONE_FORMAT', 'DATE_FORMAT'] },
    { key: 'allowed',   types: ['ALLOWED_VALUE'] },
    { key: 'reference', types: ['REFERENCE_EXISTS', 'REFERENCE_MATCH', 'CUSTOM_BUSINESS_RULE'] },
  ];

  function coverageByDimension() {
    const fields = state.schema.fields;
    return DIMENSIONS.map(d => {
      const hit = fields.filter(f => rulesOf(f.key).some(r => r.enabled && d.types.includes(r.type))).length;
      return {
        key: d.key,
        label: t('cfg.dim.' + d.key),
        pct: fields.length ? Math.round((hit / fields.length) * 100) : 0,
      };
    });
  }

  function coverageRadar(dims, size) {
    const S = size, CX = S / 2, CY = S / 2, R = S / 2 - 46;   // room for the vertex labels
    const n = dims.length;
    // start at twelve o'clock and go clockwise, so the first dimension reads first
    const point = (i, frac) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      return [CX + Math.cos(a) * R * frac, CY + Math.sin(a) * R * frac];
    };
    const poly = frac => dims.map((_, i) => point(i, frac).map(v => v.toFixed(1)).join(',')).join(' ');

    const svg = svgEl('svg', {
      viewBox: '0 0 ' + S + ' ' + S, class: 'cfg-radar__svg',
      role: 'img', 'aria-label': t('cfg.coverageTitle'),
    });

    // the web: four rings at 25 / 50 / 75 / 100 per cent
    [0.25, 0.5, 0.75, 1].forEach(frac => {
      svg.appendChild(svgEl('polygon', { points: poly(frac), class: 'cfg-radar__ring' }));
    });
    dims.forEach((_, i) => {
      const [x, y] = point(i, 1);
      svg.appendChild(svgEl('line', { x1: CX, y1: CY, x2: x, y2: y, class: 'cfg-radar__spoke' }));
    });

    // the dataset's shape
    const shape = dims.map((d, i) => point(i, Math.max(d.pct, 0) / 100).map(v => v.toFixed(1)).join(',')).join(' ');
    svg.appendChild(svgEl('polygon', { points: shape, class: 'cfg-radar__area' }));

    dims.forEach((d, i) => {
      const [x, y] = point(i, Math.max(d.pct, 0) / 100);
      const dot = svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 4, class: 'cfg-radar__dot' });
      const title = svgEl('title');
      title.textContent = d.label + ': ' + d.pct + '%';
      dot.appendChild(title);
      svg.appendChild(dot);

      // the label sits just outside its own vertex, anchored away from the centre
      const [lx, ly] = point(i, 1.18);
      const anchor = Math.abs(lx - CX) < 4 ? 'middle' : (lx > CX ? 'start' : 'end');
      const lab = svgEl('text', { x: lx.toFixed(1), y: (ly + 4).toFixed(1), 'text-anchor': anchor, class: 'cfg-radar__label' });
      lab.textContent = d.label;
      svg.appendChild(lab);
    });
    return svg;
  }

  function renderCoverage(host) {
    const dims = coverageByDimension();
    const overall = Math.round(dims.reduce((a, d) => a + d.pct, 0) / dims.length);

    const card = document.createElement('div');
    card.className = 'cfg-radar';

    const head = document.createElement('div');
    head.className = 'cfg-radar__head';
    const titles = document.createElement('div');
    const h = document.createElement('p');
    h.className = 'cfg-radar__title';
    h.textContent = t('cfg.coverageTitle');
    const sub = document.createElement('p');
    sub.className = 'cfg-radar__sub';
    sub.textContent = t('cfg.coverageSub');
    titles.appendChild(h); titles.appendChild(sub);
    const score = document.createElement('div');
    score.className = 'cfg-radar__score';
    const num = document.createElement('span');
    num.className = 'cfg-radar__number';
    num.textContent = overall + '%';
    const cap = document.createElement('span');
    cap.className = 'cfg-radar__caption';
    cap.textContent = t('cfg.dimCount');
    score.appendChild(num); score.appendChild(cap);
    head.appendChild(titles); head.appendChild(score);
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'cfg-radar__body';
    body.appendChild(coverageRadar(dims, 260));

    // the plot carries the shape; the list carries the exact numbers
    const list = document.createElement('dl');
    list.className = 'cfg-radar__list';
    dims.forEach(d => {
      const dt = document.createElement('dt');
      dt.textContent = d.label;
      const dd = document.createElement('dd');
      const dot = document.createElement('span');
      dot.className = 'cfg-radar__key';
      dot.setAttribute('aria-hidden', 'true');
      const val = document.createElement('span');
      val.textContent = d.pct + '%';
      dd.appendChild(dot); dd.appendChild(val);
      list.appendChild(dt); list.appendChild(dd);
    });
    body.appendChild(list);
    card.appendChild(body);
    host.appendChild(card);
  }

  function selectField(key) {
    state.selectedKey = key;
    renderRail();
    renderPane();
  }

  // A rule's value has a different shape per type; this is the one place that flattens it.
  function describe(rule) {
    const v = rule.value;
    if (v == null || v === '') return t('cfg.noValue');
    if (Array.isArray(v)) {
      // both carry field keys, so both read as labels rather than f0, f2, f3
      if (rule.type === 'REFERENCE_MATCH' || rule.type === 'UNIQUE_KEY') {
        return v.map(k => (state.schema.field(k) || {}).label || k).join(' + ');
      }
      return v.length > 8 ? v.slice(0, 8).join(', ') + ' … (' + v.length + ')' : v.join(', ');
    }
    if (typeof v === 'object') {
      if (rule.type === 'REFERENCE_EXISTS') return v.table + '.' + v.column;
      if (rule.type === 'CONDITIONAL_REQUIRED') {
        const f = state.schema.field(v.field);
        return (f ? f.label : v.field) + ' ' + v.op + (v.value ? ' ' + v.value : '');
      }
      if (rule.type === 'CUSTOM_BUSINESS_RULE') return v.handler;
      return JSON.stringify(v);
    }
    return String(v);
  }

  function ruleCard(rule) {
    const li = document.createElement('li');
    li.className = 'cfg-rule' + (rule.enabled ? '' : ' is-off');
    li.dataset.id = rule.id;

    const head = document.createElement('div');
    head.className = 'cfg-rule__head';
    const name = document.createElement('code');
    name.className = 'cfg-rule__type';
    name.textContent = rule.type;                       // rule ids stay English
    const origin = document.createElement('span');
    origin.className = 'chip ' + (rule.origin === 'derived' ? 'chip--neutral' : 'chip--current');
    origin.textContent = t(rule.origin === 'derived' ? 'cfg.derived' : 'cfg.custom');
    head.appendChild(name);
    head.appendChild(origin);
    if (!rule.enabled) {
      const off = document.createElement('span');
      off.className = 'chip chip--error';
      off.textContent = t('cfg.disabled');
      head.appendChild(off);
    }

    const val = document.createElement('p');
    val.className = 'cfg-rule__value';
    val.textContent = describe(rule);

    // one row-action button per card, matching the data tables, instead of three loose links
    const actions = document.createElement('button');
    actions.type = 'button';
    actions.className = 'btn-actions cfg-rule__menu';
    actions.setAttribute('aria-haspopup', 'menu');
    actions.setAttribute('aria-expanded', 'false');
    actions.innerHTML = '<span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
    actions.querySelector('span').textContent = t('common.actions');

    // any change invalidates a previous submission — the rules no longer match what was sent
    const reload = () => {
      state.doc = R.load(state.sheet);
      clearSubmitted(state.sheet);
      renderRail(); renderPane(); paintSubmitted();
    };
    actions.addEventListener('click', () => {
      const items = [{
        label: t('cfg.view'),
        onChoose: () => openViewer(rule),
      }, {
        label: t(rule.enabled ? 'cfg.disable' : 'cfg.enable'),
        onChoose: () => { R.setEnabled(state.sheet, rule.id, !rule.enabled); reload(); },
      }];
      // A derived rule cannot be edited in place — it is rebuilt from the dictionary on every
      // load — so editing one forks it: the composer opens pre-filled, and saving writes a
      // custom rule and disables the derived original. Only a custom rule can be deleted.
      items.push({
        label: t(rule.origin === 'custom' ? 'cfg.edit' : 'cfg.override'),
        onChoose: () => openComposer(rule),
      });
      if (rule.origin === 'custom') {
        items.push({
          label: t('cfg.remove'), danger: true,
          onChoose: () => { R.removeCustom(state.sheet, rule.id); reload(); },
        });
      }
      window.khdaRowMenu(actions, items);
    });

    head.appendChild(actions);
    li.appendChild(head); li.appendChild(val);
    return li;
  }

  // The validation pipeline. Execution_Order is otherwise an invisible number, so the field's
  // active rules are drawn as the stages they run in, cheapest check first.
  function ruleFlow(rules) {
    const box = document.createElement('section');
    box.className = 'cfg-flow';
    const head = document.createElement('div');
    head.className = 'cfg-flow__head';
    const h = document.createElement('h3');
    h.className = 'cfg-flow__title';
    h.textContent = t('cfg.flow');
    const hint = document.createElement('p');
    hint.className = 'cfg-flow__hint';
    hint.textContent = t('cfg.flowHint');
    head.appendChild(h); head.appendChild(hint);
    box.appendChild(head);

    const active = rules.filter(r => r.enabled).slice().sort((a, b) => a.order - b.order);
    if (!active.length) {
      const p = document.createElement('p');
      p.className = 'cfg-empty';
      p.textContent = t('cfg.flowEmpty');
      box.appendChild(p);
      return box;
    }

    const track = document.createElement('ol');
    track.className = 'cfg-flow__track';
    active.forEach(r => {
      const li = document.createElement('li');
      li.className = 'cfg-flow__step' + (r.origin === 'custom' ? ' is-custom' : '');
      const code = document.createElement('code');
      code.className = 'cfg-flow__type';
      code.textContent = r.type;                       // rule ids stay English
      const ord = document.createElement('span');
      ord.className = 'cfg-flow__order';
      ord.textContent = r.order;
      li.appendChild(ord); li.appendChild(code);
      track.appendChild(li);
    });
    box.appendChild(track);
    return box;
  }

  // Each editor mounts its own controls and knows how to read a value back out.
  // Tasks 8-11 register the remaining editors against the same contract.
  const EDITORS = {};

  EDITORS.none = {
    mount(host) {
      const p = document.createElement('p');
      p.className = 'cfg-empty';
      p.textContent = t('cfg.noValue');
      host.appendChild(p);
    },
    read() { return null; },
  };

  EDITORS.select = {
    mount(host, field, onChange, descriptor, initial) {
      const s = document.createElement('select');
      s.className = 'control control--select';
      s.id = 'cfgValue';
      for (const o of descriptor.options) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        s.appendChild(opt);
      }
      if (initial != null) s.value = initial;
      s.addEventListener('change', onChange);
      host.appendChild(s);
    },
    read() { return $('#cfgValue').value; },
  };

  EDITORS.number = {
    mount(host, field, onChange, descriptor, initial) {
      const i = document.createElement('input');
      i.type = 'number'; i.className = 'control'; i.id = 'cfgValue';
      // the descriptor carries the floor: 1 for the length types, none for MIN_VALUE
      const floor = descriptor && 'min' in descriptor ? descriptor.min : 1;
      if (floor != null) i.min = String(floor);
      i.dataset.floor = floor == null ? '' : String(floor);
      if (initial != null) i.value = initial;
      i.addEventListener('input', onChange);
      host.appendChild(i);
    },
    read() {
      const el = $('#cfgValue');
      if (!el || el.value.trim() === '') return null;
      const n = Number(el.value);
      if (!Number.isFinite(n)) return null;
      const floor = el.dataset.floor === '' ? null : Number(el.dataset.floor);
      return floor == null || n >= floor ? n : null;
    },
  };

  // PHONE_FORMAT stores the pattern that validates a number, not an example of one, so the
  // value is authored as a regular expression. The sample box is a bench for trying it out;
  // it is never saved. UAE mobiles are 05x xxx xxxx, optionally in +971 form.
  const DEFAULT_PATTERN = '^(\\+?971|0)?5[0-9]{8}$';

  EDITORS.pattern = {
    mount(host, field, onChange, descriptor, initial) {
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'control'; input.id = 'cfgValue';
      input.spellcheck = false;
      input.value = initial != null ? String(initial) : DEFAULT_PATTERN;
      input.setAttribute('aria-describedby', 'cfgReNote');

      const hint = document.createElement('p');
      hint.className = 'cfg-detail__subtitle';
      hint.textContent = t('cfg.regexHint');

      const note = document.createElement('p');
      note.className = 'cfg-preview';
      note.id = 'cfgReNote';

      const testLabel = document.createElement('label');
      testLabel.className = 'cfg-label cfg-regex__test';
      testLabel.appendChild(document.createTextNode(t('cfg.testValue')));
      const test = document.createElement('input');
      test.type = 'text'; test.className = 'control'; test.id = 'cfgReTest';
      test.value = '0501234567';
      testLabel.appendChild(test);

      const result = document.createElement('p');
      result.className = 'cfg-preview';
      result.setAttribute('aria-live', 'polite');

      function compile() {
        const src = input.value.trim();
        if (!src) return { ok: false, msg: t('cfg.regexEmpty') };
        try { return { ok: true, re: new RegExp(src) }; }
        catch (e) { return { ok: false, msg: t('cfg.regexInvalid', { m: e.message }) }; }
      }

      function redraw() {
        const c = compile();
        note.textContent = (c.ok ? '✓ ' : '✕ ') + (c.ok ? t('cfg.regexValid') : c.msg);
        note.className = 'cfg-preview ' + (c.ok ? 'is-ok' : 'is-bad');
        if (!c.ok) { result.textContent = ''; result.className = 'cfg-preview'; return; }
        const v = test.value;
        if (!v) { result.textContent = ''; result.className = 'cfg-preview'; return; }
        const hit = c.re.test(v);
        result.textContent = (hit ? '✓ ' : '✕ ') + v + ' ' + t(hit ? 'cfg.testMatch' : 'cfg.testNoMatch');
        result.className = 'cfg-preview ' + (hit ? 'is-ok' : 'is-bad');
      }

      input.addEventListener('input', redraw);
      test.addEventListener('input', redraw);
      host.appendChild(input); host.appendChild(hint); host.appendChild(note);
      host.appendChild(testLabel); host.appendChild(result);
      redraw();
    },
    read() {
      const v = $('#cfgValue').value.trim();
      if (!v) return null;
      try { new RegExp(v); } catch (e) { return null; }   // never store a pattern that cannot compile
      return v;
    },
  };

  EDITORS.format = {
    mount(host, field, onChange, descriptor, initial) {
      const s = document.createElement('select');
      s.className = 'control control--select'; s.id = 'cfgValue';
      for (const o of ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DDTHH:mm:ss']) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        s.appendChild(opt);
      }
      const p = document.createElement('p');
      p.className = 'cfg-preview is-ok';
      const redraw = () => {
        const d = new Date('2026-09-16T00:00:00');
        const pad = n => String(n).padStart(2, '0');
        const map = {
          'YYYY-MM-DD': '2026-09-16', 'DD/MM/YYYY': '16/09/2026',
          'MM/DD/YYYY': '09/16/2026', 'YYYY-MM-DDTHH:mm:ss': '2026-09-16T00:00:00',
        };
        p.textContent = '✓ ' + (map[s.value] || pad(d.getDate()));
      };
      if (initial != null) s.value = initial;
      s.addEventListener('change', redraw);
      host.appendChild(s); host.appendChild(p); redraw();
    },
    read() { return $('#cfgValue').value; },
  };

  EDITORS.chips = {
    mount(host, field, onChange, descriptor, initial) {
      const values = Array.isArray(initial) ? initial.slice() : [];
      const wrap = document.createElement('div');
      wrap.className = 'cfg-chips';
      const live = document.createElement('span');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'cfg-chips__input'; input.id = 'cfgValue';

      function redraw() {
        Array.from(wrap.querySelectorAll('.cfg-chip')).forEach(c => c.remove());
        values.forEach((v, i) => {
          const c = document.createElement('span');
          c.className = 'cfg-chip';
          c.textContent = v;
          const x = document.createElement('button');
          x.type = 'button'; x.className = 'cfg-chip__x';
          x.setAttribute('aria-label', t('cfg.chipRemove', { v }));
          x.textContent = '×';
          x.addEventListener('click', () => {
            values.splice(i, 1);
            live.textContent = t('cfg.chipRemoved', { v });
            redraw();
          });
          c.appendChild(x);
          wrap.insertBefore(c, input);
        });
      }

      function add(raw) {
        // pasting "PR,BOT,BOG" becomes three chips rather than one long value
        for (const piece of String(raw).split(',')) {
          const v = piece.trim();
          if (v && !values.includes(v)) values.push(v);
        }
        live.textContent = t('cfg.chipCount', { n: values.length });
        input.value = '';
        redraw();
      }

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); add(input.value); }
        else if (e.key === 'Backspace' && !input.value && values.length) { values.pop(); redraw(); }
      });
      input.addEventListener('paste', e => {
        const txt = (e.clipboardData || window.clipboardData).getData('text');
        if (txt.includes(',')) { e.preventDefault(); add(txt); }
      });
      // a value typed but not committed must not be lost on save
      input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); });

      wrap.appendChild(input);
      host.appendChild(wrap);
      host.appendChild(live);
      host._values = values;
      redraw();
    },
    read() {
      const host = $('.cfg-valuehost');
      return host._values && host._values.length ? host._values.slice() : null;
    },
  };

  EDITORS.reference = {
    mount(host, field, onChange, descriptor, initial) {
      const tableSel = document.createElement('select');
      tableSel.className = 'control control--select'; tableSel.id = 'cfgRefTable';
      // grounded in the 44 real code lists rather than free text
      for (const name of Object.keys(window.KHDA_LISTS || {}).sort()) {
        const o = document.createElement('option');
        o.value = 'MST_' + name.trim().replace(/[^A-Za-z0-9]+/g, '_');
        o.textContent = o.value;
        tableSel.appendChild(o);
      }
      const colSel = document.createElement('select');
      colSel.className = 'control control--select'; colSel.id = 'cfgRefCol';
      for (const f of state.schema.fields) {
        const o = document.createElement('option');
        o.value = f.db; o.textContent = f.db;
        if (f.key === field.key) o.selected = true;
        colSel.appendChild(o);
      }
      if (initial) {
        if (initial.table) tableSel.value = initial.table;
        if (initial.column) colSel.value = initial.column;
      }
      const row = document.createElement('div');
      row.className = 'cfg-row';
      row.appendChild(tableSel); row.appendChild(colSel);
      host.appendChild(row);
    },
    read() {
      return { table: $('#cfgRefTable').value, column: $('#cfgRefCol').value };
    },
  };

  EDITORS.fields = {
    mount(host, field, onChange, descriptor, initial) {
      const box = document.createElement('div');
      box.className = 'cfg-checks';
      for (const f of state.schema.fields) {
        const l = document.createElement('label');
        l.className = 'cfg-check';
        const c = document.createElement('input');
        c.type = 'checkbox'; c.value = f.key;
        if (Array.isArray(initial) && initial.includes(f.key)) c.checked = true;
        if (f.key === field.key) { c.checked = true; c.disabled = true; }  // the field itself is always part of the match
        const s = document.createElement('span');
        s.textContent = f.label;
        l.appendChild(c); l.appendChild(s);
        box.appendChild(l);
      }
      box.id = 'cfgFields';
      host.appendChild(box);
    },
    read() {
      const picked = Array.from($('#cfgFields').querySelectorAll('input:checked')).map(c => c.value);
      return picked.length >= 2 ? picked : null;   // a match needs at least two fields
    },
  };

  // ---------- searchable select ----------
  // The same listbox the dataset picker uses, packaged for anywhere a <select> would carry
  // dozens of options: a sheet has ~40 fields and a code list can run to 250 values, and the
  // native popup neither filters nor chooses which way to open. It exposes `.value` and fires
  // `change`, so callers keep treating it as the select it replaced.
  const CHEV = '<svg class="cfg-picker__chev" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
  const MAGNIFIER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';

  function searchSelect(items, options) {
    const opt = options || {};
    const wrap = document.createElement('div');
    wrap.className = 'cfg-picker cfg-picker--inline';
    if (opt.id) wrap.id = opt.id;

    const btn = document.createElement('button');
    btn.type = 'button';                        // never submits the composer it sits in
    btn.className = 'cfg-picker__btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const shown = document.createElement('span');
    shown.className = 'cfg-picker__value';
    btn.appendChild(shown);
    btn.insertAdjacentHTML('beforeend', CHEV);

    const panel = document.createElement('div');
    panel.className = 'cfg-picker__panel';
    panel.hidden = true;
    const search = document.createElement('label');
    search.className = 'search cfg-picker__search';
    search.innerHTML = MAGNIFIER;
    const query = document.createElement('input');
    query.type = 'search';
    query.placeholder = opt.placeholder || t('cfg.searchOptions');
    search.appendChild(query);
    const list = document.createElement('ul');
    list.className = 'cfg-picker__list';
    list.setAttribute('role', 'listbox');
    panel.appendChild(search); panel.appendChild(list);

    let current = items.length ? String(items[0].value) : '';

    const labelOf = v => {
      const hit = items.find(i => String(i.value) === String(v));
      return hit ? hit.label : '';
    };
    const paint = () => { shown.textContent = labelOf(current) || t('cfg.pickOne'); };

    function renderList() {
      const q = query.value.trim().toLowerCase();
      const hits = items.filter(i => !q || i.label.toLowerCase().includes(q)
        || String(i.value).toLowerCase().includes(q));
      list.innerHTML = '';
      if (!hits.length) {
        const li = document.createElement('li');
        li.className = 'cfg-picker__empty';
        li.textContent = t('cfg.noMatch');
        list.appendChild(li);
        return;
      }
      for (const i of hits) {
        const li = document.createElement('li');
        const isSel = String(i.value) === current;
        li.className = 'cfg-picker__opt' + (isSel ? ' is-selected' : '');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(isSel));
        li.tabIndex = -1;
        li.dataset.value = i.value;
        li.textContent = i.label;
        li.addEventListener('click', () => pick(i.value));
        list.appendChild(li);
      }
    }

    function pick(v) {
      current = String(v);
      paint();
      close(true);
      wrap.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function open() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      query.value = '';
      renderList();
      // fit.js scales the page, so the room measured in screen pixels is divided back into the
      // layout pixels the max-height is written in.
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
      const below = (window.innerHeight - btn.getBoundingClientRect().bottom) / zoom;
      list.style.maxHeight = Math.max(160, below - 96) + 'px';
      query.focus();
      const sel = list.querySelector('.is-selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    function close(refocus) {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    }

    btn.addEventListener('click', () => (panel.hidden ? open() : close(true)));
    // The composer wraps each control in a <label>, and a click on an <li> — which is not
    // interactive content — is forwarded by the label to the first control inside it: the
    // button that had just closed this panel, which reopened it. Cancelling the default
    // action cancels that forwarding; focus and caret still come from mousedown.
    panel.addEventListener('click', e => e.preventDefault());
    query.addEventListener('input', renderList);
    panel.addEventListener('keydown', e => {
      const opts = Array.from(list.querySelectorAll('.cfg-picker__opt'));
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'Enter') {
        e.preventDefault();                     // Enter picks; it must not submit the composer
        const target = document.activeElement.classList.contains('cfg-picker__opt')
          ? document.activeElement : opts[0];
        if (target) pick(target.dataset.value);
        return;
      }
      if (!['ArrowDown', 'ArrowUp'].includes(e.key) || !opts.length) return;
      e.preventDefault();
      const here = opts.indexOf(document.activeElement);
      const step = e.key === 'ArrowDown' ? 1 : opts.length - 1;
      opts[(here < 0 ? (e.key === 'ArrowDown' ? -1 : 0) + opts.length : here + step) % opts.length].focus();
    });
    const away = e => { if (!wrap.contains(e.target)) close(false); };
    document.addEventListener('mousedown', away);

    Object.defineProperty(wrap, 'value', {
      get: () => current,
      set: v => { current = v == null ? '' : String(v); paint(); },
    });

    wrap.appendChild(btn); wrap.appendChild(panel);
    paint();
    return wrap;
  }

  EDITORS.condition = {
    mount(host, field, onChange, descriptor, initial) {
      const row = document.createElement('div');
      row.className = 'cfg-row cfg-row--3';

      // a field cannot be conditional on itself, so it drops out of its own list
      const fieldSel = searchSelect(
        state.schema.fields.filter(f => f.key !== field.key).map(f => ({ value: f.key, label: f.label })),
        { id: 'cfgCondField', placeholder: t('cfg.searchFields') });

      const opSel = document.createElement('select');
      opSel.className = 'control control--select'; opSel.id = 'cfgCondOp';
      for (const op of ['=', '≠', 'in', 'is empty', 'is not empty']) {
        const o = document.createElement('option');
        o.value = op; o.textContent = op;
        opSel.appendChild(o);
      }

      if (initial) {
        if (initial.field) fieldSel.value = initial.field;
        if (initial.op) opSel.value = initial.op;
      }

      const valHost = document.createElement('div');
      valHost.id = 'cfgCondValueHost';

      // when the chosen field is coded, the value becomes a picker of that list
      function redrawValue(seed) {
        valHost.innerHTML = '';
        const needsValue = ['=', '≠', 'in'].includes(opSel.value);
        if (!needsValue) return;
        const f = state.schema.field(fieldSel.value);
        const coded = f && f.opts && f.opts.length;
        const many = opSel.value === 'in';
        let el;
        if (many && coded) {
          // "in" holds a list, so a coded field offers all of its values at once
          el = document.createElement('select');
          el.multiple = true;
          el.size = Math.min(8, f.opts.length);
          for (const o of f.opts) {
            const opt = document.createElement('option');
            opt.value = o.v; opt.textContent = o.l;
            el.appendChild(opt);
          }
        } else if (many) {
          el = document.createElement('input');
          el.type = 'text';
          el.placeholder = 'FD, CR, DP';
        } else if (coded) {
          el = searchSelect(f.opts.map(o => ({ value: o.v, label: o.l })));
        } else {
          el = document.createElement('input');
          el.type = 'text';
        }
        if (!el.classList.contains('cfg-picker')) {
          el.className = 'control' + (el.multiple ? ' cfg-cond__multi' : '');
        }
        el.id = 'cfgCondValue';
        if (seed != null && seed !== '') {
          const wanted = Array.isArray(seed) ? seed.map(String) : [String(seed)];
          if (el.multiple) Array.from(el.options).forEach(o => { o.selected = wanted.includes(o.value); });
          else el.value = wanted[0];
        }
        valHost.appendChild(el);
      }
      // the condition reads as a sentence with three dropdowns; the diagram says it back
      const diagHost = document.createElement('div');
      function redrawDiagram() {
        const el = $('#cfgCondValue');
        // a multi-select holds every chosen code, not just the first
        const value = !el ? ''
          : el.multiple ? Array.from(el.selectedOptions).map(o => o.value)
            : el.value;
        diagHost.innerHTML = '';
        diagHost.appendChild(conditionDiagram({ field: fieldSel.value, op: opSel.value, value }, field, redrawDiagram));
      }
      function onAnyChange() { redrawValue(); redrawDiagram(); }
      fieldSel.addEventListener('change', onAnyChange);
      opSel.addEventListener('change', onAnyChange);
      valHost.addEventListener('input', redrawDiagram);
      valHost.addEventListener('change', redrawDiagram);

      row.appendChild(fieldSel); row.appendChild(opSel); row.appendChild(valHost);
      host.appendChild(row);
      host.appendChild(diagHost);
      redrawValue(initial && initial.value);
      redrawDiagram();
    },
    read() {
      const op = $('#cfgCondOp').value;
      const needsValue = ['=', '≠', 'in'].includes(op);
      const el = $('#cfgCondValue');
      // an "in" condition carries a list: several selected options, or a typed comma list
      if (op === 'in') {
        const list = el && el.multiple
          ? Array.from(el.selectedOptions).map(o => o.value)
          : String(el ? el.value : '').split(',').map(x => x.trim()).filter(Boolean);
        if (!list.length) return null;
        return { field: $('#cfgCondField').value, op, value: list };
      }
      const raw = needsValue ? (el ? String(el.value).trim() : '') : '';
      if (needsValue && !raw) return null;
      const value = raw;
      return { field: $('#cfgCondField').value, op, value };
    },
  };

  EDITORS.sql = {
    mount(host, field, onChange, descriptor, initial) {
      // both controls live under one "Rule value" label, so each states what it is rather
      // than relying on placeholder text that disappears as soon as you type
      const handlerLabel = document.createElement('label');
      handlerLabel.className = 'cfg-label';
      handlerLabel.appendChild(document.createTextNode(t('cfg.handler')));
      const handler = document.createElement('input');
      handler.type = 'text'; handler.className = 'control'; handler.id = 'cfgHandler';
      handler.placeholder = 'CrossFieldLimit';
      if (initial && initial.handler) handler.value = initial.handler;
      handlerLabel.appendChild(handler);

      const sqlLabel = document.createElement('p');
      sqlLabel.className = 'cfg-label cfg-label--plain';
      sqlLabel.textContent = t('cfg.sqlExpr');

      const wrap = document.createElement('div');
      wrap.className = 'cfg-sql';
      const gutter = document.createElement('div');
      gutter.className = 'cfg-sql__gutter'; gutter.setAttribute('aria-hidden', 'true');
      const ta = document.createElement('textarea');
      ta.className = 'cfg-sql__area'; ta.id = 'cfgSql'; ta.rows = 6; ta.spellcheck = false;
      ta.value = (initial && initial.sql)
        || 'SELECT CASE WHEN ' + field.db + ' IS NOT NULL THEN 1 ELSE 0 END';

      const note = document.createElement('p');
      note.className = 'cfg-preview';

      // the branch the statement describes, redrawn as it is typed
      const diagHost = document.createElement('div');
      diagHost.className = 'cfg-sqldiag';
      function diagRedraw() {
        diagHost.innerHTML = '';
        diagHost.appendChild(sqlDiagram(ta.value));
      }

      function gutterRedraw() {
        const n = ta.value.split('\n').length;
        gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
      }
      // shape check only: there is no database here, so this must not imply execution
      function check() {
        const v = ta.value.trim();
        const ok = /^select\b/i.test(v) && !v.slice(0, -1).includes(';');
        note.textContent = t(ok ? 'cfg.sqlOk' : 'cfg.sqlBad');
        note.className = 'cfg-preview ' + (ok ? 'is-ok' : 'is-bad');
        return ok;
      }
      ta.addEventListener('input', () => { gutterRedraw(); check(); diagRedraw(); });
      ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });

      const validate = document.createElement('button');
      validate.type = 'button'; validate.className = 'btn btn--outline btn--sm';
      validate.textContent = t('cfg.validate');
      validate.addEventListener('click', check);

      wrap.appendChild(gutter); wrap.appendChild(ta);
      host.appendChild(handlerLabel); host.appendChild(sqlLabel);
      host.appendChild(wrap); host.appendChild(note); host.appendChild(validate);
      host.appendChild(diagHost);
      gutterRedraw(); check(); diagRedraw();
    },
    read() {
      const sql = $('#cfgSql').value.trim();
      const handler = $('#cfgHandler').value.trim();
      if (!sql || !/^select\b/i.test(sql)) return null;
      return { handler: handler || 'CustomRule', sql };
    },
  };

  // ---------- the "otherwise" branch ----------
  // When no condition demands a value, the dictionary says either "leave it blank" or "use
  // 999". That is guidance, not a rule, so it lives on the field — but an author can change
  // which it is, and what the value should be.
  const otherwiseOf = key => (state.doc.otherwise || {})[key] || null;

  function otherwiseText(choice) {
    if (!choice) return null;
    return choice.mode === 'blank'
      ? t('cfg.allowBlank')
      : t('cfg.placeholder', { v: choice.value });
  }

  function otherwiseRow(field) {
    const row = document.createElement('div');
    row.className = 'cfg-otherwise';

    function show() {
      row.innerHTML = '';
      const choice = otherwiseOf(field.key);
      const p = document.createElement('p');
      p.className = 'cfg-pane__hint';
      p.textContent = t('cfg.otherwise') + ': ' + (otherwiseText(choice) || t('cfg.allowBlank'));
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn--text btn--sm cfg-otherwise__edit';
      edit.textContent = t('cfg.otherwiseEdit');
      edit.addEventListener('click', form);
      row.appendChild(p); row.appendChild(edit);
    }

    function form() {
      const choice = otherwiseOf(field.key) || { mode: 'blank', value: '' };
      row.innerHTML = '';
      const box = document.createElement('form');
      box.className = 'cfg-otherwise__form';

      const name = 'cfgOtherwise';
      const mk = (mode, labelKey) => {
        const l = document.createElement('label');
        l.className = 'cfg-check';
        const r = document.createElement('input');
        r.type = 'radio'; r.name = name; r.value = mode;
        r.checked = choice.mode === mode;
        const s = document.createElement('span');
        s.textContent = t(labelKey);
        l.appendChild(r); l.appendChild(s);
        return { label: l, radio: r };
      };
      const blank = mk('blank', 'cfg.allowBlank');
      const value = mk('value', 'cfg.useValue');

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'control cfg-otherwise__value';
      input.value = choice.mode === 'value' ? choice.value : (field.placeholder || '');
      input.disabled = choice.mode !== 'value';
      const sync = () => { input.disabled = !value.radio.checked; };
      blank.radio.addEventListener('change', sync);
      value.radio.addEventListener('change', () => { sync(); input.focus(); });

      const actions = document.createElement('div');
      actions.className = 'cfg-otherwise__actions';
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'btn btn--primary btn--sm';
      save.textContent = t('cfg.otherwiseSave');
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn--text btn--sm';
      cancel.textContent = t('cfg.cancel');
      cancel.addEventListener('click', show);
      actions.appendChild(save); actions.appendChild(cancel);

      box.addEventListener('submit', e => {
        e.preventDefault();
        const mode = value.radio.checked ? 'value' : 'blank';
        if (mode === 'value' && !input.value.trim()) { input.focus(); return; }
        R.setOtherwise(state.sheet, field.key, { mode, value: input.value.trim() });
        state.doc = R.load(state.sheet);
        clearSubmitted(state.sheet);
        renderRail(); renderPane(); paintSubmitted();
        if (window.khdaToast) window.khdaToast('success', t('cfg.otherwiseSaved'), otherwiseText(otherwiseOf(field.key)));
      });

      const legend = document.createElement("span");
      legend.className = "cfg-pane__hint";
      legend.textContent = t('cfg.otherwise');
      box.appendChild(legend);
      box.appendChild(blank.label);
      box.appendChild(value.label);
      box.appendChild(input);
      box.appendChild(actions);
      row.appendChild(box);
      blank.radio.focus();
    }

    show();
    return row;
  }

  // ---------- rule diagrams ----------
  // CONDITIONAL_REQUIRED and CUSTOM_BUSINESS_RULE are the two types whose value is a small
  // piece of logic rather than a literal, so each gets drawn as the branch it describes.

  function diagNode(text, kind) {
    const el = document.createElement('span');
    el.className = 'cfg-diag__node' + (kind ? ' is-' + kind : '');
    el.textContent = text;
    return el;
  }

  function diagArrow() {
    const el = document.createElement('span');
    el.className = 'cfg-diag__arrow';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg width="24" height="12" viewBox="0 0 24 12" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5"><path d="M0 6h20m-4-4 4 4-4 4"/></svg>';
    return el;
  }

  function diagLabel(text) {
    const el = document.createElement('span');
    el.className = 'cfg-diag__label';
    el.textContent = text;
    return el;
  }

  // The OTHERWISE branch inside a diagram. Read-only in the rule viewer; in the composer it
  // is a button that swaps to a two-choice control — leave it blank, or state a value.
  function otherwiseDiagNode(field, onEdit) {
    const fallback = otherwiseOf(field.key);
    const label = () => {
      const f = otherwiseOf(field.key);
      return !f || f.mode === 'blank' ? t('cfg.allowBlank') : t('cfg.diagUse', { v: f.value });
    };
    if (!onEdit) return fallback ? diagNode(label(), 'else') : null;

    const wrap = document.createElement('span');
    wrap.className = 'cfg-diag__else';

    function show() {
      wrap.innerHTML = '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cfg-diag__node is-else is-editable';
      btn.textContent = label();
      btn.title = t('cfg.otherwiseEdit');
      btn.addEventListener('click', edit);
      wrap.appendChild(btn);
    }

    function edit() {
      const choice = otherwiseOf(field.key) || { mode: 'blank', value: '' };
      wrap.innerHTML = '';

      const mode = document.createElement('select');
      mode.className = 'control control--select cfg-diag__else-mode';
      for (const m of [['blank', 'cfg.allowBlank'], ['value', 'cfg.useValue']]) {
        const o = document.createElement('option');
        o.value = m[0]; o.textContent = t(m[1]);
        mode.appendChild(o);
      }
      mode.value = choice.mode;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'control cfg-diag__else-value';
      input.value = choice.mode === 'value' ? choice.value : (field.placeholder || '');
      input.hidden = choice.mode !== 'value';
      mode.addEventListener('change', () => {
        input.hidden = mode.value !== 'value';
        if (!input.hidden) input.focus();
      });

      const ok = document.createElement('button');
      ok.type = 'button';                      // inside the composer form: must not submit it
      ok.className = 'btn btn--primary btn--sm cfg-diag__else-ok';
      ok.textContent = t('cfg.otherwiseSave');
      ok.addEventListener('click', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); show(); }
      });

      function commit() {
        if (mode.value === 'value' && !input.value.trim()) { input.focus(); return; }
        R.setOtherwise(state.sheet, field.key, { mode: mode.value, value: input.value.trim() });
        state.doc = R.load(state.sheet);
        clearSubmitted(state.sheet);
        onEdit();                              // the caller redraws whatever holds the diagram
      }

      wrap.appendChild(mode); wrap.appendChild(input); wrap.appendChild(ok);
      mode.focus();
    }

    show();
    return wrap;
  }

  // IF <field> <op> <value>  THEN  <this field> is required
  function conditionDiagram(value, field, onEdit) {
    const box = document.createElement('div');
    box.className = 'cfg-diag';
    if (!value || !value.field || !value.op) {
      box.appendChild(diagLabel(t('cfg.diagEmpty')));
      return box;
    }
    const other = state.schema.field(value.field);
    box.appendChild(diagLabel(t('cfg.diagIf')));
    box.appendChild(diagNode(other ? other.label : value.field, 'field'));
    box.appendChild(diagNode(value.op, 'op'));
    // "is empty" and "is not empty" carry no operand, so no empty box is drawn for them
    if (['=', '≠', 'in'].includes(value.op)) {
      const shown = Array.isArray(value.value) ? value.value.join(', ') : value.value;
      box.appendChild(diagNode(shown === '' || shown == null ? '…' : String(shown), 'value'));
    }
    box.appendChild(diagArrow());
    box.appendChild(diagLabel(t('cfg.diagThen')));
    box.appendChild(diagNode(t('cfg.diagRequired', { f: field.label }), 'result'));
    // The dictionary states these as a pair — "If not available use '999'. If Nationality is
    // United Arab Emirates then cannot be NULL" — so the placeholder is drawn as the other
    // branch. It is guidance, not a second rule: nothing can fail it.
    const branch = otherwiseDiagNode(field, onEdit);
    if (branch) {
      box.appendChild(diagLabel(t('cfg.diagElse')));
      box.appendChild(branch);
    }
    return box;
  }

  // WHEN <expression> -> 1 passes / 0 fails, for the CASE shape the engine generates
  const CASE_SHAPE = /^\s*select\s+case\s+when\s+([\s\S]+?)\s+then\s+1\s+else\s+0\s+end\s*;?\s*$/i;

  function sqlDiagram(sql) {
    const box = document.createElement('div');
    box.className = 'cfg-diag cfg-diag--branch';
    const m = CASE_SHAPE.exec(String(sql || ''));
    if (!m) {
      // an arbitrary statement is not diagrammed — showing a fake branch would misrepresent it
      const note = document.createElement('p');
      note.className = 'cfg-diag__note';
      note.textContent = t('cfg.diagShape');
      const pre = document.createElement('pre');
      pre.className = 'cfg-detail__sql';
      pre.textContent = String(sql || '');
      box.appendChild(note); box.appendChild(pre);
      return box;
    }
    const cond = document.createElement('div');
    cond.className = 'cfg-diag__row';
    cond.appendChild(diagLabel(t('cfg.diagWhen')));
    cond.appendChild(diagNode(m[1].trim(), 'expr'));
    box.appendChild(cond);

    const branches = document.createElement('div');
    branches.className = 'cfg-diag__branches';
    const branch = (symbol, num, word, kind) => {
      const b = document.createElement('div');
      b.className = 'cfg-diag__branch is-' + kind;
      b.appendChild(diagNode(symbol + ' ' + num, kind === 'pass' ? 'pass' : 'fail'));
      b.appendChild(diagLabel(word));
      return b;
    };
    branches.appendChild(branch('✓', '1', t('cfg.diagPass'), 'pass'));
    branches.appendChild(branch('✕', '0', t('cfg.diagFail'), 'fail'));
    box.appendChild(branches);
    return box;
  }

  // Read-only detail. The card truncates a long value ("… (136)") and never shows the SQL or
  // the string that actually reaches Rule_Value, so the viewer shows all three in full.
  function openViewer(rule) {
    const existing = $('.cfg-composer') || $('.cfg-detail');
    if (existing) existing.remove();
    const field = state.schema.field(state.selectedKey);

    const box = document.createElement('section');
    box.className = 'cfg-detail';
    box.setAttribute('tabindex', '-1');

    const head = document.createElement('div');
    head.className = 'cfg-detail__head';
    const code = document.createElement('code');
    code.className = 'cfg-rule__type';
    code.textContent = rule.type;                        // rule ids stay English
    const origin = document.createElement('span');
    origin.className = 'chip ' + (rule.origin === 'derived' ? 'chip--neutral' : 'chip--current');
    origin.textContent = t(rule.origin === 'derived' ? 'cfg.derived' : 'cfg.custom');
    head.appendChild(code); head.appendChild(origin);
    if (!rule.enabled) {
      const off = document.createElement('span');
      off.className = 'chip chip--error';
      off.textContent = t('cfg.disabled');
      head.appendChild(off);
    }
    box.appendChild(head);

    const dl = document.createElement('dl');
    dl.className = 'cfg-detail__list';
    const row = (label, value, mono) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      if (mono) dd.className = 'is-mono';
      dd.textContent = value;
      dl.appendChild(dt); dl.appendChild(dd);
    };

    row(t('cfg.fields'), field.label + ' · ' + field.db, false);
    row(t('cfg.status'), t(rule.enabled ? 'cfg.statusOn' : 'cfg.statusOff'), false);
    row(t('cfg.execOrder'), String(rule.order), false);
    row(t('cfg.errorCode'), rule.errorCode, true);
    row(t('cfg.errorMessage'), rule.errorMessage, false);
    box.appendChild(dl);

    // the value in full, shaped to its type rather than truncated
    const valWrap = document.createElement('div');
    valWrap.className = 'cfg-detail__value';
    const valTitle = document.createElement('h4');
    valTitle.className = 'cfg-detail__subtitle';
    valTitle.textContent = t('cfg.ruleValue');
    valWrap.appendChild(valTitle);

    const v = rule.value;
    if (rule.type === 'CONDITIONAL_REQUIRED' && v && v.field) {
      valWrap.appendChild(conditionDiagram(v, field));
    } else if (rule.type === 'CUSTOM_BUSINESS_RULE' && v && v.sql) {
      valWrap.appendChild(sqlDiagram(v.sql));
      const pre = document.createElement('pre');
      pre.className = 'cfg-detail__sql';
      pre.textContent = v.sql;
      valWrap.appendChild(pre);
    } else if (Array.isArray(v) && v.length) {
      const count = document.createElement('p');
      count.className = 'cfg-detail__count';
      count.textContent = t('cfg.valueCount', { n: v.length });
      const list = document.createElement('div');
      list.className = 'cfg-detail__chips';
      const labels = (rule.type === 'REFERENCE_MATCH' || rule.type === 'UNIQUE_KEY')
        ? v.map(k => (state.schema.field(k) || {}).label || k)
        : v;
      for (const item of labels) {
        const c = document.createElement('span');
        c.className = 'cfg-chip';
        c.textContent = item;
        list.appendChild(c);
      }
      valWrap.appendChild(count); valWrap.appendChild(list);
    } else {
      const p = document.createElement('p');
      p.className = 'cfg-detail__plain';
      p.textContent = describe(rule);
      valWrap.appendChild(p);
    }
    box.appendChild(valWrap);

    // what the database actually receives
    const exported = R.serialize(rule.type, rule.value, state.schema);
    const expWrap = document.createElement('div');
    expWrap.className = 'cfg-detail__value';
    const expTitle = document.createElement('h4');
    expTitle.className = 'cfg-detail__subtitle';
    expTitle.textContent = t('cfg.exportedValue');
    const expVal = document.createElement('pre');
    expVal.className = 'cfg-detail__sql';
    expVal.textContent = exported == null ? 'NULL' : exported;
    expWrap.appendChild(expTitle); expWrap.appendChild(expVal);
    box.appendChild(expWrap);

    const actions = document.createElement('div');
    actions.className = 'cfg-composer__actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--outline btn--sm';
    close.textContent = t('cfg.close');
    close.addEventListener('click', () => {
      box.remove();
      const a = $('#addRule');
      if (a) { a.hidden = false; a.focus(); }
    });
    actions.appendChild(close);
    box.appendChild(actions);

    pane.appendChild(box);
    const addBtn = $('#addRule');
    if (addBtn) addBtn.hidden = true;
    box.focus();
    box.scrollIntoView({ block: 'nearest' });
  }

  // Called with no argument to author a new rule, or with a custom rule to edit it in place.
  // Derived rules are not editable — they are regenerated from the dictionary on every load.
  function openComposer(editing) {
    const existing = $('.cfg-composer') || $('.cfg-detail');
    if (existing) existing.remove();
    const field = state.schema.field(state.selectedKey);
    // editing a derived rule forks it into a custom one rather than pretending to change it
    const overriding = !!editing && editing.origin === 'derived';

    const box = document.createElement('form');
    box.className = 'cfg-composer';

    if (overriding) {
      const note = document.createElement('p');
      note.className = 'cfg-note';
      note.textContent = t('cfg.overrideNote');
      box.appendChild(note);
    }

    const typeLabel = document.createElement('label');
    typeLabel.className = 'cfg-label';
    typeLabel.textContent = t('cfg.ruleType');
    // A type already on this field drops out of the list, so the same rule cannot be added
    // twice. Repeatable types stay, and an edit always keeps its own type available.
    const used = new Set(rulesOf(state.selectedKey).map(r => r.type));
    const typeItems = R.TYPES
      .filter(ty => !(used.has(ty.id) && !ty.repeatable && !(editing && editing.type === ty.id)))
      .map(ty => ({ value: ty.id, label: ty.id }));    // rule ids stay English
    if (!typeItems.length) {
      // nothing left to add: say so rather than opening an empty composer
      if (window.khdaToast) window.khdaToast('info', t('cfg.allTypesUsed'), t('cfg.allTypesUsedText'));
      return;
    }
    // The native popup drew itself in the operating system's own colours — a blue highlight
    // bar in the middle of a maroon page — and chose its own direction to open. This is the
    // listbox the dataset and field pickers already use, so every picker on the page matches.
    const typeSel = searchSelect(typeItems, { id: 'cfgType' });
    if (editing) typeSel.value = editing.type;
    typeLabel.appendChild(typeSel);

    const valLabel = document.createElement('label');
    valLabel.className = 'cfg-label';
    valLabel.textContent = t('cfg.ruleValue');
    const valHost = document.createElement('div');
    valHost.className = 'cfg-valuehost';
    valLabel.appendChild(valHost);

    const actions = document.createElement('div');
    actions.className = 'cfg-composer__actions';
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'btn btn--primary btn--sm';
    save.textContent = t(editing && !overriding ? 'cfg.update' : 'cfg.save');
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn--text btn--sm';
    cancel.textContent = t('cfg.cancel');
    cancel.addEventListener('click', () => {
      box.remove();
      const a = $('#addRule');
      if (a) { a.hidden = false; a.focus(); }
    });
    actions.appendChild(save); actions.appendChild(cancel);

    let current = null, firstMount = true;
    function mountEditor() {
      valHost.innerHTML = '';
      valHost.classList.remove('is-invalid');
      valHost.removeAttribute('data-error');
      const descriptor = R.type(typeSel.value);
      current = EDITORS[descriptor.value] || EDITORS.none;
      // the existing value only fits the type it was authored for, so it seeds the first
      // mount only — switching type afterwards starts that editor empty
      const initial = (firstMount && editing && editing.type === typeSel.value) ? editing.value : undefined;
      firstMount = false;
      current.mount(valHost, field, () => {}, descriptor, initial);
      // moving focus to the new control keeps a keyboard user oriented after the swap
      const first = valHost.querySelector('input, select, textarea, button');
      if (first) first.focus();
    }
    typeSel.addEventListener('change', mountEditor);

    // Error_Code and Error_Message are NOT NULL in the target table, so they are generated
    // from the chosen type and kept editable. Execution_Order defaults to the type's rank.
    const metaRow = document.createElement('div');
    metaRow.className = 'cfg-row cfg-row--meta';
    const mkMeta = (id, labelKey, maxLen) => {
      const l = document.createElement('label');
      l.className = 'cfg-label';
      l.textContent = t(labelKey);
      const i = document.createElement('input');
      i.type = 'text'; i.className = 'control'; i.id = id; i.maxLength = maxLen;
      l.appendChild(i);
      metaRow.appendChild(l);
      return i;
    };
    const codeIn = mkMeta('cfgErrCode', 'cfg.errorCode', R.MAX_ERROR_CODE);
    const msgIn  = mkMeta('cfgErrMsg',  'cfg.errorMessage', R.MAX_ERROR_MSG);
    const orderLabel = document.createElement('label');
    orderLabel.className = 'cfg-label';
    orderLabel.textContent = t('cfg.execOrder');
    const orderIn = document.createElement('input');
    orderIn.type = 'number'; orderIn.className = 'control'; orderIn.id = 'cfgOrder'; orderIn.min = '1';
    orderLabel.appendChild(orderIn);
    metaRow.appendChild(orderLabel);

    // regenerate the defaults whenever the type changes, unless the user has edited them
    // an edit keeps whatever the rule already carries, so its meta counts as already authored
    let codeTouched = !!editing, msgTouched = !!editing;
    if (editing) {
      codeIn.value = editing.errorCode;
      msgIn.value = editing.errorMessage;
    }
    codeIn.addEventListener('input', () => { codeTouched = true; });
    msgIn.addEventListener('input', () => { msgTouched = true; });
    function refreshMeta(isInitial) {
      // opening an edit keeps the rule's own order; a later type change adopts the new type's rank
      if (isInitial && editing) { orderIn.value = String(editing.order); return; }
      const probe = R.derive(state.schema);   // reuse the same generator the derived rules use
      const sample = (probe[state.selectedKey] || [])[0];
      // strip only the sample's own type suffix — a greedy /_[A-Z_]+$/ would eat the whole
      // ERR_<API_CODE>_<FIELD> prefix and collide every custom code on "ERR_<TYPE>"
      const prefix = sample ? sample.errorCode.slice(0, -(sample.type.length + 1)) : 'ERR';
      if (!codeTouched) codeIn.value = (prefix + '_' + typeSel.value).slice(0, R.MAX_ERROR_CODE);
      if (!msgTouched) msgIn.value = (field.label + ' failed ' + typeSel.value + '.').slice(0, R.MAX_ERROR_MSG);
      orderIn.value = String((R.ORDER && R.ORDER[typeSel.value]) || 100);
    }
    typeSel.addEventListener('change', refreshMeta);

    box.addEventListener('submit', e => {
      e.preventDefault();
      const value = current.read();
      const descriptor = R.type(typeSel.value);
      if (descriptor.value !== 'none' && (value == null || (Array.isArray(value) && !value.length))) {
        valHost.classList.add('is-invalid');
        return;
      }
      // Rule_Value is nvarchar(1000); refuse rather than let the database truncate
      const serialized = R.serialize(typeSel.value, value, state.schema);
      if (serialized != null && serialized.length > R.MAX_RULE_VALUE) {
        valHost.classList.add('is-invalid');
        valHost.setAttribute('data-error',
          t('cfg.tooLong', { n: serialized.length, max: R.MAX_RULE_VALUE }));
        return;
      }
      if (!codeIn.value.trim() || !msgIn.value.trim()) return;   // both are NOT NULL
      const payload = {
        type: typeSel.value, value,
        errorCode: codeIn.value.trim(),
        errorMessage: msgIn.value.trim(),
        order: Number(orderIn.value) || 100,
      };
      if (overriding) {
        // the fork replaces the derived rule: add the custom one, switch the original off
        R.addCustom(state.sheet, state.selectedKey, payload);
        R.setEnabled(state.sheet, editing.id, false);
      } else if (editing) {
        R.updateCustom(state.sheet, editing.id, payload);
      } else {
        R.addCustom(state.sheet, state.selectedKey, payload);
      }
      state.doc = R.load(state.sheet);
      clearSubmitted(state.sheet);
      renderRail(); renderPane(); paintSubmitted();
      $('#addRule').focus();
    });

    box.appendChild(typeLabel); box.appendChild(valLabel);
    box.appendChild(metaRow); box.appendChild(actions);
    pane.appendChild(box);
    // the composer replaces the button that opened it rather than stacking beneath it
    const addBtn = $('#addRule');
    if (addBtn) addBtn.hidden = true;
    mountEditor();
    refreshMeta(true);
    // the picker is a div wrapping a button, so the focus goes to the control itself
    typeSel.querySelector('.cfg-picker__btn').focus();
    box.scrollIntoView({ block: 'nearest' });
  }

  function renderPane() {
    pane.innerHTML = '';
    if (!state.selectedKey) {
      const p = document.createElement('p');
      p.className = 'cfg-empty';
      p.textContent = t('cfg.pickField');
      pane.appendChild(p);
      return;
    }
    const f = state.schema.field(state.selectedKey);

    // house card header: title on the left, the primary action on the right
    const head = document.createElement('header');
    head.className = 'dash-card__head cfg-pane__head';
    const titles = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.className = 'dash-card__title';
    h2.textContent = f.label;                            // field names stay English
    const meta = document.createElement('p');
    meta.className = 'cfg-pane__meta';
    meta.textContent = f.type + ' · ' + f.db;
    titles.appendChild(h2); titles.appendChild(meta);
    // What happens when no condition demands a value: blank, or a stated placeholder. It is
    // guidance rather than a rule — nothing can fail it — but the author can change it.
    titles.appendChild(otherwiseRow(f));

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn--outline btn--sm cfg-add';
    add.id = 'addRule';
    add.textContent = '+ ' + t('cfg.addRule');
    // wrapped: passing openComposer directly would hand it the click event as the rule to edit
    add.addEventListener('click', () => openComposer());

    head.appendChild(titles); head.appendChild(add);
    pane.appendChild(head);

    const rules = rulesOf(f.key);
    if (!rules.length) {
      const p = document.createElement('p');
      p.className = 'cfg-empty';
      p.textContent = t('cfg.noRules');
      pane.appendChild(p);
      return;
    }

    pane.appendChild(ruleFlow(rules));

    const list = document.createElement('ul');
    list.className = 'cfg-rules';
    rules.forEach(r => list.appendChild(ruleCard(r)));
    pane.appendChild(list);
  }

  // ---------- dataset picker ----------
  // A listbox rather than a <select>: 46 options made the native popup open upward and run off
  // the top of the window, and the browser owns that direction. This panel is anchored below.
  const dsFilter = $('#dsFilter');

  function renderDatasetList() {
    const q = dsFilter.value.trim().toLowerCase();
    const hits = DATA.filter(d => !q || d.title.toLowerCase().includes(q));
    dsList.innerHTML = '';
    if (!hits.length) {
      const li = document.createElement('li');
      li.className = 'cfg-picker__empty';
      li.textContent = t('cfg.noMatch');
      dsList.appendChild(li);
      return;
    }
    for (const d of hits) {
      const li = document.createElement('li');
      li.className = 'cfg-picker__opt' + (d.sheet === state.sheet ? ' is-selected' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(d.sheet === state.sheet));
      li.tabIndex = -1;
      li.dataset.sheet = d.sheet;
      li.textContent = d.title;                          // dataset names stay English
      li.addEventListener('click', () => { setDataset(d.sheet); closePicker(true); });
      dsList.appendChild(li);
    }
  }

  function openPicker() {
    dsPanel.hidden = false;
    dsButton.setAttribute('aria-expanded', 'true');
    dsFilter.value = '';
    renderDatasetList();
    // the panel always opens downward, so the list is capped to the room actually left below
    // it. fit.js scales the page, and getBoundingClientRect reports screen pixels, so the
    // measurement is divided back into the layout pixels the style is written in.
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const below = (window.innerHeight - dsButton.getBoundingClientRect().bottom) / zoom;
    dsList.style.maxHeight = Math.max(180, below - 88) + 'px';
    dsFilter.focus();
    const sel = dsList.querySelector('.is-selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function closePicker(refocus) {
    if (dsPanel.hidden) return;
    dsPanel.hidden = true;
    dsButton.setAttribute('aria-expanded', 'false');
    if (refocus) dsButton.focus();
  }

  dsButton.addEventListener('click', () => (dsPanel.hidden ? openPicker() : closePicker(true)));
  dsFilter.addEventListener('input', renderDatasetList);

  dsPanel.addEventListener('keydown', e => {
    const opts = $$('.cfg-picker__opt', dsList);
    if (e.key === 'Escape') { e.preventDefault(); closePicker(true); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = document.activeElement.classList.contains('cfg-picker__opt')
        ? document.activeElement : opts[0];
      if (target) { setDataset(target.dataset.sheet); closePicker(true); }
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || !opts.length) return;
    e.preventDefault();
    const here = opts.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : opts.length - 1;
    opts[(here < 0 ? (e.key === 'ArrowDown' ? -1 : 0) + opts.length : here + step) % opts.length].focus();
  });

  document.addEventListener('mousedown', e => {
    if (!dsPanel.hidden && !dsPanel.contains(e.target) && !dsButton.contains(e.target)) closePicker(false);
  });

  // the chart's viewBox is measured from its container, so it is redrawn when that width changes
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state.schema) renderStats(); }, 150);
  });

  // ---------- wiring ----------
  $('#fieldSearch').addEventListener('input', e => { state.query = e.target.value; renderRail(); });

  $$('#fieldFilter button').forEach(b => b.addEventListener('click', () => {
    state.filter = b.dataset.f;
    $$('#fieldFilter button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderRail();
  }));

  // roving focus: arrow keys walk the rail, Enter opens the field
  rail.addEventListener('keydown', e => {
    const items = $$('.cfg-field', rail);
    if (!items.length) return;
    let i = items.findIndex(x => x.dataset.key === state.selectedKey);
    if (e.key === 'ArrowDown') { i = Math.min(items.length - 1, i + 1); }
    else if (e.key === 'ArrowUp') { i = Math.max(0, i - 1); }
    else return;
    e.preventDefault();
    selectField(items[i].dataset.key);
    items[i].scrollIntoView({ block: 'nearest' });
  });

  // Three export formats, all rendering the same rows() against the real target table.
  const FORMATS = {
    json: { fn: s => R.exportJson(s), ext: 'json', mime: 'application/json' },
    sql:  { fn: s => R.exportSql(s),  ext: 'sql',  mime: 'text/plain' },
    csv:  { fn: s => R.exportCsv(s),  ext: 'csv',  mime: 'text/csv' },
  };

  function download(kind) {
    const spec = FORMATS[kind];
    const text = spec.fn(state.sheet);
    const blob = new Blob([text], { type: spec.mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.sheet.replace(/[^A-Za-z0-9]+/g, '_') + '_Rules.' + spec.ext;
    a.click();
    URL.revokeObjectURL(a.href);
    if (window.khdaToast) {
      window.khdaToast('success', t('cfg.exported'),
        t('cfg.exportedText', { n: R.rows(state.sheet).length, ds: state.schema.title }));
    }
  }

  // the three formats collapse into one row menu, as the data tables do for row actions
  $('#exportBtn').addEventListener('click', () => {
    window.khdaRowMenu($('#exportBtn'), [
      { label: t('cfg.exportSql'), onChoose: () => download('sql') },
      { label: t('cfg.exportJson'), onChoose: () => download('json') },
      { label: t('cfg.exportCsv'), onChoose: () => download('csv') },
    ]);
  });

  // API_Code is a NOT NULL join key. When it was only derived from the dataset name it may not
  // match KHDA's API registry, so it is shown, flagged and editable rather than silently assumed.
  const apiInput = $('#apiCode');
  function renderApiCode() {
    apiInput.value = state.doc.apiCode;
    $('#apiCodeFlag').hidden = state.doc.verified;
  }
  apiInput.addEventListener('change', () => {
    R.setApiCode(state.sheet, apiInput.value);
    state.doc = R.load(state.sheet);
    renderApiCode();
  });

  // ---------- dataset overview drawer ----------
  // The summary used to sit above the authoring view and cost ~480px of height. It now opens
  // from the right on demand, so the page starts where the work is.
  const drawer = $('#cfgDrawer'), scrim = $('#cfgScrim'), detailsBtn = $('#detailsBtn');

  // Holding the page still while the drawer is open leaves one scrollbar, not two. The lost
  // scrollbar width is paid back as padding so the layout does not jump sideways.
  function lockPage(on) {
    const de = document.documentElement;
    if (on) {
      const bar = window.innerWidth - de.clientWidth;
      de.style.overflow = 'hidden';
      if (bar > 0) de.style.paddingInlineEnd = bar + 'px';
    } else {
      de.style.overflow = '';
      de.style.paddingInlineEnd = '';
    }
  }

  function openDrawer() {
    drawer.hidden = false; scrim.hidden = false;
    lockPage(true);
    detailsBtn.setAttribute('aria-expanded', 'true');
    renderStats();                       // the plot measures its container, so draw it once visible
    const close = $('#cfgDrawerClose');
    if (close) close.focus();
  }

  function closeDrawer(refocus) {
    if (drawer.hidden) return;
    drawer.hidden = true; scrim.hidden = true;
    lockPage(false);
    detailsBtn.setAttribute('aria-expanded', 'false');
    if (refocus) detailsBtn.focus();
  }

  if (detailsBtn) {
    detailsBtn.addEventListener('click', () => (drawer.hidden ? openDrawer() : closeDrawer(true)));
    $('#cfgDrawerClose').addEventListener('click', () => closeDrawer(true));
    scrim.addEventListener('click', () => closeDrawer(true));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(true); });
  }

  // ---------- submitted state ----------
  // There is no backend, so submitting stamps the rule set the way app.js stamps a dataset
  // draft. Any later edit clears the stamp, because the rules no longer match what was sent.
  const submitKey = sheet => 'khda.rules.submitted.' + String(sheet).replace(/[^A-Za-z0-9]+/g, '_');

  function submittedAt(sheet) {
    try { return localStorage.getItem(submitKey(sheet)); } catch (e) { return null; }
  }
  function markSubmitted(sheet) {
    try { localStorage.setItem(submitKey(sheet), new Date().toISOString()); } catch (e) { /* ignore */ }
  }
  function clearSubmitted(sheet) {
    try { localStorage.removeItem(submitKey(sheet)); } catch (e) { /* ignore */ }
  }
  function paintSubmitted() {
    const chip = $('#submittedChip');
    if (chip) chip.hidden = !submittedAt(state.sheet);
  }

  // ---------- review before submitting ----------
  const review = $('#cfgReview');

  function openReview() {
    const fields = state.schema.fields;
    const uncovered = fields.filter(f => activeCount(f.key) === 0).length;

    review.innerHTML = '';
    review.hidden = false;
    $('.cfg-bar').hidden = true;
    $('.cfg-grid').hidden = true;
    $('.cfg-foot').hidden = true;
    closeDrawer(false);

    const head = document.createElement('header');
    head.className = 'cfg-review__head';
    const titles = document.createElement('div');
    const h = document.createElement('h2');
    h.className = 'cfg-review__title';
    h.textContent = t('cfg.reviewTitle');
    const lede = document.createElement('p');
    lede.className = 'cfg-review__lede';
    lede.textContent = t('cfg.reviewLede');
    const ds = document.createElement('p');
    ds.className = 'cfg-review__ds';
    ds.textContent = state.schema.title;          // dataset names stay English
    titles.appendChild(ds); titles.appendChild(h); titles.appendChild(lede);

    const actions = document.createElement('div');
    actions.className = 'cfg-review__actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn btn--outline btn--sm';
    back.textContent = t('cfg.backToEdit');
    back.addEventListener('click', () => closeReview());
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'btn btn--primary btn--sm';
    submit.textContent = t('cfg.submit');
    submit.addEventListener('click', () => {
      markSubmitted(state.sheet);
      // the dashboard feed renders dash.event.<type>, and 'rules' has its own label there
      if (window.KHDA_ACTIVITY) {
        window.KHDA_ACTIVITY.log('rules', state.sheet, R.rows(state.sheet).length);
      }
      if (window.khdaToast) {
        window.khdaToast('success', t('cfg.submitted'),
          t('cfg.submittedText', { n: R.rows(state.sheet).length, ds: state.schema.title }));
      }
      closeReview();
    });
    actions.appendChild(back); actions.appendChild(submit);
    head.appendChild(titles); head.appendChild(actions);
    review.appendChild(head);

    // an uncovered field is not a blocker, but it is worth saying out loud before submitting
    const note = document.createElement('p');
    note.className = 'cfg-review__note' + (uncovered ? ' is-warn' : ' is-ok');
    note.textContent = uncovered ? t('cfg.uncovered', { n: uncovered }) : t('cfg.allCovered');
    review.appendChild(note);

    const table = document.createElement('table');
    table.className = 'data-table cfg-review__table';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const key of ['cfg.colField', 'cfg.colDesc']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = t(key);
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const f of fields) {
      const rules = rulesOf(f.key).filter(r => r.enabled).slice().sort((a, b) => a.order - b.order);
      const tr = document.createElement('tr');
      if (!rules.length) tr.className = 'is-uncovered';

      const name = document.createElement('td');
      const nb = document.createElement('span');
      nb.className = 'cfg-review__field';
      nb.textContent = f.label;                   // field names stay English
      const db = document.createElement('span');
      db.className = 'cfg-review__db';
      db.textContent = f.db;
      name.appendChild(nb); name.appendChild(db);

      // straight from the HEDB data dictionary, via the generated metadata
      const desc = document.createElement('td');
      desc.className = 'cfg-review__desc';
      desc.textContent = f.desc || '—';
      // the otherwise branch as the author left it, not as the dictionary stated it
      const fallback = otherwiseOf(f.key);
      if (fallback && (f.placeholder || fallback.mode === 'value')) {
        const ph = document.createElement('span');
        ph.className = 'cfg-review__hint';
        ph.textContent = otherwiseText(fallback);
        desc.appendChild(ph);
      }

      tr.appendChild(name); tr.appendChild(desc);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    review.appendChild(table);

    const foot = document.createElement('div');
    foot.className = 'cfg-review__foot';
    const back2 = document.createElement('button');
    back2.type = 'button';
    back2.className = 'btn btn--outline btn--sm';
    back2.textContent = t('cfg.backToEdit');
    back2.addEventListener('click', () => closeReview());
    const submit2 = document.createElement('button');
    submit2.type = 'button';
    submit2.className = 'btn btn--primary btn--sm';
    submit2.textContent = t('cfg.submit');
    submit2.addEventListener('click', () => submit.click());
    foot.appendChild(back2); foot.appendChild(submit2);
    review.appendChild(foot);

    window.scrollTo(0, 0);
    review.focus();
  }

  function closeReview() {
    review.hidden = true;
    review.innerHTML = '';
    $('.cfg-bar').hidden = false;
    $('.cfg-grid').hidden = false;
    $('.cfg-foot').hidden = false;
    paintSubmitted();
    const btn = $('#previewBtn');
    if (btn) btn.focus();
  }

  if ($('#previewBtn')) $('#previewBtn').addEventListener('click', openReview);

  setDataset(new URLSearchParams(location.search).get('sheet') || (DATA[0] && DATA[0].sheet));
})();
