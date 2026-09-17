/* Data report — statistics, analytics and the data grid for any submission dataset.
   Everything is derived from the dataset's field metadata, so one page serves all datasets. */
(function () {
  'use strict';

  const S = window.KHDA_SCHEMA;
  const $ = s => document.querySelector(s);
  const sheet = new URLSearchParams(location.search).get('sheet') || 'Applicants - Basic Details';
  const schema = S.get(sheet);
  const records = loadRecords();

  const CHART_TOP = 8;
  let gridPageSize = 10, gridPage = 1, gridQuery = '';
  const expanded = new Set();

  function loadRecords() {
    try { return (JSON.parse(localStorage.getItem(schema.storageKey) || '{}').records) || []; } catch { return []; }
  }

  const codeFields = schema.fields.filter(f => f.opts).slice(0, 3);
  const numFields = S.measureFields(schema);
  const measure = numFields[0] || null;

  function init() {
    document.title = 'KHDA';
    $('#repTitle').textContent = schema.title;
    $('#repDesc').textContent = schema.desc || t('rep.descFallback', { x: schema.title });
    const repOpen = $('#repOpen'); if (repOpen) repOpen.href = 'index.html?sheet=' + encodeURIComponent(schema.sheet);
    const repExport = $('#repExport'); if (repExport) repExport.hidden = !records.length;

    if (!records.length) {
      $('#repEmpty').hidden = false;
      $('#repEmptyText').textContent = t('rep.emptyText', { x: schema.title, n: schema.fields.length });
      $('#repEmptyCta').href = 'index.html?sheet=' + encodeURIComponent(schema.sheet);
      return;
    }
    $('#repBody').hidden = false;
    renderStats();
    renderCharts();
    renderGrid();
  }

  // ---------- statistics ----------
  const STAT_ICONS = {
    records: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    distinct: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
    period: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    total: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  };
  // Search runs over every field, not only the columns on screen, and includes the
  // description behind a code so "Bachelors" finds a row storing "BA".
  const haystack = new WeakMap();
  function searchText(r) {
    let s = haystack.get(r);
    if (s == null) {
      s = schema.fields.map(f => `${r[f.key] ?? ''} ${S.display(r, f) ?? ''}`).join(' ').toLowerCase();
      haystack.set(r, s);
    }
    return s;
  }
  function matching() {
    if (!gridQuery) return records;
    return records.filter(r => gridQuery.split(/\s+/).every(w => searchText(r).includes(w)));
  }

  function sum(key) { return records.reduce((n, r) => n + (Number(r[key]) || 0), 0); }
  function distinct(key) { return new Set(records.map(r => String(r[key] ?? '').trim()).filter(Boolean)).size; }

  function renderStats() {
    const tiles = [{ icon: 'records', label: t('common.records'), value: records.length }];
    for (const f of codeFields.slice(0, 2)) {
      tiles.push({ icon: /period|semester|year/i.test(f.label) ? 'period' : 'distinct', label: t('rep.distinct', { x: f.label.toLowerCase() }), value: distinct(f.key) });
    }
    for (const f of numFields.slice(0, Math.max(0, 6 - tiles.length))) {
      const lbl = /^total\b/i.test(f.label) ? f.label : t('rep.totalOf', { x: f.label.toLowerCase() });
      tiles.push({ icon: 'total', label: lbl, value: sum(f.key), accent: true });
    }
    if (tiles.length < 3) tiles.push({ icon: 'distinct', label: t('rep.fieldsInDataset'), value: schema.fields.length });
    $('#repStats').innerHTML = tiles.map(tile => `
      <div class="stat${tile.accent ? ' stat--accent' : ''}">
        <span class="stat__icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STAT_ICONS[tile.icon]}</svg></span>
        <span class="stat__label">${esc(trunc(tile.label, 30))}</span>
        <span class="stat__value">${fmt(tile.value)}</span>
      </div>`).join('');
  }

  // ---------- analytics ----------
  function renderCharts() {
    const defs = codeFields.map(f => ({ key: f.key, field: f, title: t('rep.chartTitle', { m: measure ? measure.label : t('common.records'), x: f.label.toLowerCase() }) }));
    let html = defs.map(d => chartHtml(d, group(d.field))).join('');
    if (numFields.length > 1) html += totalsChart();
    $('#repCharts').innerHTML = html ||
      `<section class="chart"><div class="chart__head"><h3 class="chart__title">${esc(t('rep.analytics'))}</h3></div><div class="chart__body"><p class="chart__empty">${esc(t('rep.noChart'))}</p></div></section>`;
  }
  function group(f) {
    const m = new Map();
    for (const r of records) {
      const k = S.display(r, f) || String(r[f.key] ?? '').trim() || '—';
      m.set(k, (m.get(k) || 0) + (measure ? (Number(r[measure.key]) || 0) : 1));
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  }
  function chartHtml(def, all) {
    const open = expanded.has(def.key), total = all.length, overflow = total > CHART_TOP;
    let rows = all, other = null;
    if (!open && overflow) {
      rows = all.slice(0, CHART_TOP);
      const rest = all.slice(CHART_TOP);
      other = { label: t('rep.other', { n: rest.length }), value: rest.reduce((n, x) => n + x[1], 0) };
    }
    const max = Math.max(1, ...all.map(r => r[1]));
    const bar = (label, value, muted) => `
      <div class="bar">
        <div class="bar__label${muted ? ' bar__label--muted' : ''}" title="${esc(label)}">${esc(trunc(label, 34))}</div>
        <div class="bar__track"><div class="bar__fill${muted ? ' bar__fill--muted' : ''}" style="width:${(value / max * 100).toFixed(1)}%"></div></div>
        <div class="bar__value">${fmt(value)}</div>
      </div>`;
    return `<section class="chart">
      <div class="chart__head">
        <h3 class="chart__title">${esc(def.title)}</h3>
        ${overflow ? `<span class="chart__count">${open ? total : CHART_TOP} / ${total}</span>
          <button class="chart__toggle" type="button" data-chart="${def.key}">${esc(open ? t('rep.showTop', { n: CHART_TOP }) : t('rep.showAll'))}</button>` : ''}
      </div>
      <div class="chart__body">
        ${total ? rows.map(([l, v]) => bar(l, v, false)).join('') + (other ? bar(other.label, other.value, true) : '') : `<p class="chart__empty">${esc(t('rep.noData'))}</p>`}
      </div>
    </section>`;
  }
  function totalsChart() {
    const rows = numFields.slice(0, 8).map(f => [f.label, sum(f.key)]).filter(r => r[1] !== 0);
    if (!rows.length) return '';
    const max = Math.max(1, ...rows.map(r => r[1]));
    return `<section class="chart">
      <div class="chart__head"><h3 class="chart__title">${esc(t('rep.numericTotals'))}</h3></div>
      <div class="chart__body">
        ${rows.map(([l, v], i) => `<div class="bar">
          <div class="bar__label" title="${esc(l)}">${esc(trunc(l, 34))}</div>
          <div class="bar__track"><div class="bar__fill${i % 3 === 1 ? ' bar__fill--2' : i % 3 === 2 ? ' bar__fill--3' : ''}" style="width:${(v / max * 100).toFixed(1)}%"></div></div>
          <div class="bar__value">${fmt(v)}</div>
        </div>`).join('')}
      </div>
    </section>`;
  }
  document.addEventListener('click', e => {
    const node = e.target.closest('[data-chart]');
    if (!node) return;
    const k = node.dataset.chart;
    if (expanded.has(k)) expanded.delete(k); else expanded.add(k);
    renderCharts();
  });

  // ---------- data grid ----------
  function cols() { return schema.gridCols.map(k => schema.field(k)); }
  let gridSort = '', gridDir = 1;
  function sorted(rows) {
    if (!gridSort) return rows;
    const f = schema.field(gridSort);
    const num = f && f.control === 'number';
    return rows.slice().sort((a, b) => {
      const x = a[gridSort] ?? '', y = b[gridSort] ?? '';
      const c = num ? (Number(x) || 0) - (Number(y) || 0) : String(x).localeCompare(String(y));
      return c * gridDir;
    });
  }
  function cellHtml(r, f) {
    const val = r[f.key];
    if (val == null || val === '') return '<span class="cell-sub">—</span>';
    if (f.opts) {
      const label = S.display(r, f);
      return `<div class="cell-title mono">${esc(val)}</div>${label && label !== String(val) ? `<div class="cell-sub">${esc(trunc(label, 30))}</div>` : ''}`;
    }
    if (f.control === 'number' || f.control === 'date') return `<span class="mono">${esc(val)}</span>`;
    return esc(trunc(String(val), 38));
  }
  function renderGrid() {
    const C = cols();
    const rows = sorted(matching());
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / gridPageSize));
    if (gridPage > pages) gridPage = pages;
    const slice = rows.slice((gridPage - 1) * gridPageSize, gridPage * gridPageSize);

    $('#repRowCount').textContent = total === records.length
      ? t('rep.recordsCount', { n: total })
      : t('rep.matchingCount', { a: total, b: records.length });
    $('#repGridEmpty').hidden = total !== 0;
    $('#repGrid').hidden = total === 0;
    $('#repGridFooter').hidden = total === 0;
    const hidden = schema.fields.length - C.length;
    const note = $('#repColNote');
    if (note) {
      note.hidden = hidden <= 0;
      note.textContent = hidden > 0 ? t('entry.columnsShownExport', { a: C.length, b: schema.fields.length }) : '';
    }

    $('#repGridHead').innerHTML = C.map(f => `<th class="sortable${f.control === 'number' ? ' num' : ''}${f.key === gridSort ? ' is-sorted' : ''}" data-sort="${esc(f.key)}">${esc(f.label)} <span class="sort-ind" aria-hidden="true"${f.key === gridSort ? ` data-dir="${gridDir === 1 ? 'asc' : 'desc'}"` : ''}></span></th>`).join('')
      + `<th><span class="sr-only">${esc(t('common.actions'))}</span></th>`;
    $('#repGridBody').innerHTML = slice.map(r => {
      const bad = Object.values(S.validate(r, records, schema));
      return `<tr class="${bad.length ? 'has-error' : ''}"${bad.length ? ` title="${esc(t('rep.needsAttention'))}: ${esc(bad.slice(0, 3).join(' '))}"` : ''}>
        ${C.map(f => `<td class="${f.control === 'number' ? 'num' : ''}">${cellHtml(r, f)}</td>`).join('')}
        <td class="actions"><button class="btn-actions" type="button" data-edit="${esc(r.id)}" aria-haspopup="menu" aria-expanded="false">${esc(t('common.actions'))}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button></td>
      </tr>`;
    }).join('');
    const hasNums = C.some(f => f.control === 'number');
    const totalOf = key => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
    const footLabel = total === records.length
      ? t('rep.totalAll', { n: fmt(total) })
      : t('rep.totalMatching', { n: fmt(total) });
    $('#repGridFoot').innerHTML = hasNums
      ? `<tr>${C.map((f, i) => f.control === 'number' ? `<th class="num">${fmt(totalOf(f.key))}</th>` : (i === 0 ? `<th>${esc(footLabel)}</th>` : '<th></th>')).join('')}<th></th></tr>`
      : '';

    const from = total ? (gridPage - 1) * gridPageSize + 1 : 0, to = Math.min(gridPage * gridPageSize, total);
    $('#repGridInfo').textContent = t('rep.showingRecords', { a: from, b: to, c: total });
    const pager = $('#repGridPager');
    pager.innerHTML = '';
    const arrow = (dir, p, disabled) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pager__arrow'; b.disabled = disabled;
      b.setAttribute('aria-label', dir === -1 ? t('common.prevPage') : t('common.nextPage'));
      b.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${dir === -1 ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}"/></svg>`;
      b.addEventListener('click', () => { gridPage = p; renderGrid(); });
      pager.append(b);
    };
    arrow(-1, gridPage - 1, gridPage === 1);
    for (let p = 1; p <= pages; p++) {
      if (pages > 7 && Math.abs(p - gridPage) > 2 && p !== 1 && p !== pages) {
        if (p === 2 || p === pages - 1) { const sp = document.createElement('span'); sp.className = 'pager__page'; sp.textContent = '…'; pager.append(sp); }
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pager__page'; b.textContent = p;
      if (p === gridPage) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', () => { gridPage = p; renderGrid(); });
      pager.append(b);
    }
    arrow(1, gridPage + 1, gridPage === pages);
  }

  $('#repSearch').addEventListener('input', e => {
    gridQuery = e.target.value.trim().toLowerCase();
    gridPage = 1;
    renderGrid();
  });
  document.addEventListener('change', e => {
    if (e.target.id !== 'repGridSize') return;
    gridPageSize = Number(e.target.value); gridPage = 1; renderGrid();
  });
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    const url = p => `index.html?sheet=${encodeURIComponent(schema.sheet)}${p}`;
    window.khdaRowMenu(btn, [
      { label: t('rep.editRecord'), onChoose: () => { location.href = url(`&edit=${encodeURIComponent(btn.dataset.edit)}`); } },
      { label: t('rep.openEntry'), onChoose: () => { location.href = url(''); } },
    ]);
  });

  // ---------- export ----------
  if ($('#repExport')) $('#repExport').addEventListener('click', () => {
    const head = schema.fields.map(f => f.db);
    const rows = [head, ...records.map(r => schema.fields.map(f => {
      const v = r[f.key] ?? '';
      return f.control === 'number' && v !== '' && !isNaN(Number(v)) ? Number(v) : v;
    }))];
    const name = `${schema.sheet.replace(/[^A-Za-z0-9]+/g, '_')}_report_${today()}`;
    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Data');
      XLSX.writeFile(wb, name + '.xlsx');
    } else {
      const text = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)).join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
      a.download = name + '.csv';
      document.body.append(a); a.click(); a.remove();
    }
  });

  // ---------- utils ----------
  function fmt(n) { return n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'); }
  function trunc(s, n) { return String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  $('#repGridHead').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    gridDir = key === gridSort ? -gridDir : 1;
    gridSort = key;
    gridPage = 1;
    renderGrid();
  });

  init();
})();
