/* One-file export of the whole submission: the summary, the analytics and every record.
   Lives on its own so any page can offer it — bind it to a button by id.

   Sheets: Summary, Datasets, Analytics, then one per dataset that holds records.
   Written with js/template.js, so it works with no internet connection. */
(function () {
  'use strict';

  const S = window.KHDA_SCHEMA;
  const DATA = window.KHDA_DATASETS || [];
  if (!S || !DATA.length) return;

  const t = (k, v) => (window.t ? window.t(k, v) : k);
  const CYCLE = '2025 – 26';
  const CADENCES = ['Semester', 'Annual', 'Real-time'];

  // Cadence decides the window a dataset falls in: semester datasets are collected twice a
  // year, annual ones once, and real-time feeds stay open throughout. The dashboard chart
  // reads these too, so the page and the workbook can never drift apart.
  const WINDOWS = [
    { month: 'jan', groups: { Semester: 1, Annual: 0, 'Real-time': 1 } },
    { month: 'feb', groups: { Semester: 0, Annual: 0, 'Real-time': 1 } },
    { month: 'mar', groups: { Semester: 0, Annual: 1, 'Real-time': 1 } },
    { month: 'apr', groups: { Semester: 1, Annual: 0, 'Real-time': 1 } },
  ];

  function draftOf(sheet) {
    try { return JSON.parse(localStorage.getItem('khda.hedb.' + sheet.replace(/[^A-Za-z0-9]+/g, '_') + '.v1') || '{}'); }
    catch { return {}; }
  }

  // ---------- current state of every dataset ----------
  function snapshot() {
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
    const totals = {
      datasets: rows.length,
      started: rows.filter(r => r.records > 0).length,
      submitted: rows.filter(r => r.status === 'submitted').length,
      errors: rows.reduce((n, r) => n + r.errors, 0),
      records: rows.reduce((n, r) => n + r.records, 0),
      fields: rows.reduce((n, r) => n + r.fields, 0),
    };
    return { rows, totals };
  }

  function institution(rows) {
    const tally = new Map();
    for (const r of rows) {
      if (!r.records) continue;
      const schema = S.get(r.sheet);
      const f = schema.fields.find(x => /institution\s*name/i.test(x.label) && x.derivedFrom)
        || schema.fields.find(x => /institution\s*name/i.test(x.label));
      if (!f) continue;
      for (const rec of (draftOf(r.sheet).records || [])) {
        const v = String(rec[f.key] || '').trim();
        if (v) tally.set(v, (tally.get(v) || 0) + 1);
      }
    }
    const best = [...tally].sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : t('dash.institutionFallback');
  }

  // ---------- sheets ----------
  function safeSheetName(want, taken) {
    const base = String(want).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = base, n = 2;
    while (taken.has(name.toLowerCase())) {
      const tail = ' (' + n++ + ')';
      name = base.slice(0, 31 - tail.length).trim() + tail;
    }
    taken.add(name.toLowerCase());
    return name;
  }

  function statusCounts(set) {
    return {
      submitted: set.filter(r => r.status === 'submitted').length,
      progress: set.filter(r => r.status === 'progress' || r.status === 'errors').length,
      notStarted: set.filter(r => r.status === 'new').length,
    };
  }

  function summarySheet(rows, totals, stamp) {
    const all = statusCounts(rows);
    const out = [
      [t('dash.export.summaryTitle')],
      [],
      [t('dash.export.institution'), institution(rows)],
      [t('dash.export.cycle'), CYCLE],
      [t('dash.export.generated'), stamp],
      [],
      [t('dash.export.measure'), t('dash.export.value')],
      [t('dash.export.datasetsTotal'), totals.datasets],
      [t('dash.meter.started'), totals.started],
      [t('dash.state.submitted'), all.submitted],
      [t('dash.state.progress'), all.progress],
      [t('dash.state.new'), all.notStarted],
      [t('dash.meter.records'), totals.records],
      [t('dash.meter.attention'), totals.errors],
      [t('dash.export.fieldsTotal'), totals.fields],
      [],
      [t('dash.export.byCadence'), t('dash.export.datasetsTotal'), t('dash.state.submitted'), t('common.records')],
    ];
    for (const g of CADENCES) {
      const set = rows.filter(r => r.group === g);
      out.push([t('group.' + g), set.length, statusCounts(set).submitted, set.reduce((n, r) => n + r.records, 0)]);
    }
    return { name: 'Summary', rows: out, opts: { cols: [38, 22, 18, 18] } };
  }

  function datasetsSheet(rows) {
    const head = [
      t('dash.export.reference'), t('dash.export.dataset'), t('cat.sheet'), t('dash.export.cadence'),
      t('dash.export.fields'), t('common.records'), t('dash.meter.attention'),
      t('dash.export.status'), t('dash.export.submittedOn'),
    ];
    const body = rows.map(r => [
      r.ref, r.title, r.sheet, t('group.' + r.group), r.fields, r.records, r.errors,
      t('dash.status.' + r.status), r.submittedAt ? r.submittedAt.slice(0, 10) : '',
    ]);
    return { name: 'Datasets', rows: [head, ...body], opts: { freeze: true, cols: [16, 34, 28, 14, 10, 10, 20, 14, 14] } };
  }

  function analyticsSheet(rows, totals) {
    const out = [[t('dash.analyticsTitle')], []];

    out.push([t('dash.progressTitle'), t('dash.state.submitted'), t('dash.state.progress'), t('dash.state.new')]);
    for (const [label, set] of [
      [t('dash.scopePeriodic'), rows.filter(r => !r.realtime)],
      [t('dash.scopeRealtime'), rows.filter(r => r.realtime)],
    ]) {
      const c = statusCounts(set);
      out.push([label, c.submitted, c.progress, c.notStarted]);
    }

    out.push([], [t('dash.calendarTitle'), t('group.Semester'), t('group.Annual'), t('group.Real-time'), t('common.total')]);
    const perGroup = {};
    for (const g of CADENCES) perGroup[g] = rows.filter(r => r.group === g).length;
    for (const w of WINDOWS) {
      const cells = CADENCES.map(g => (w.groups[g] ? perGroup[g] : 0));
      out.push([t('dash.month.' + w.month), ...cells, cells.reduce((a, b) => a + b, 0)]);
    }

    const share = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
    out.push([], [t('dash.export.meter'), t('dash.export.value'), t('dash.export.outOf'), t('dash.export.share')]);
    out.push([t('dash.meter.started'), totals.started, totals.datasets, share(totals.started, totals.datasets)]);
    out.push([t('dash.state.submitted'), totals.submitted, totals.datasets, share(totals.submitted, totals.datasets)]);
    out.push([t('dash.meter.records'), totals.records, '', '']);
    out.push([t('dash.meter.attention'), totals.errors, totals.records, share(totals.errors, totals.records)]);

    out.push([], [t('dash.export.topDatasets'), t('common.records'), t('dash.meter.attention')]);
    rows.slice().filter(r => r.records).sort((a, b) => b.records - a.records).slice(0, 10)
      .forEach(r => out.push([r.title, r.records, r.errors]));

    return { name: 'Analytics', rows: out, opts: { cols: [34, 18, 18, 18, 14] } };
  }

  function dataSheets(rows, taken) {
    const out = [];
    for (const r of rows) {
      if (!r.records) continue;
      const schema = S.get(r.sheet);
      const records = draftOf(r.sheet).records || [];
      out.push({
        name: safeSheetName(r.title, taken),
        rows: [
          schema.fields.map(f => f.db),
          ...records.map(rec => schema.fields.map(f => {
            const v = rec[f.key] == null ? '' : rec[f.key];
            return f.control === 'number' && v !== '' && !isNaN(Number(v)) ? Number(v) : String(v);
          })),
        ],
        opts: { freeze: true, cols: schema.fields.map(f => Math.min(40, Math.max(14, f.db.length + 4))) },
      });
    }
    return out;
  }

  function sheetsFor(stamp) {
    const { rows, totals } = snapshot();
    const taken = new Set(['summary', 'datasets', 'analytics']);
    return {
      totals,
      sheets: [summarySheet(rows, totals, stamp), datasetsSheet(rows), analyticsSheet(rows, totals), ...dataSheets(rows, taken)],
    };
  }

  // ---------- download ----------
  function saveBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function csvOf(grid) {
    const q = v => (/[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    return grid.map(r => r.map(q).join(',')).join('\r\n');
  }

  function run(btn) {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
    const fileStamp = now.toISOString().slice(0, 10);
    if (btn) btn.disabled = true;
    try {
      if (!window.KHDA_XLSX) throw new Error('workbook writer unavailable');
      const { sheets, totals } = sheetsFor(stamp);
      saveBlob(window.KHDA_XLSX.build(sheets, []), 'HEDB_Submission_Export_' + fileStamp + '.xlsx');
      if (window.khdaToast) {
        window.khdaToast('success', t('dash.export.doneTitle'),
          t('dash.export.doneText', { a: sheets.length, b: totals.records.toLocaleString('en-US') }));
      }
    } catch (err) {
      // without the workbook writer, hand over the dataset register as CSV
      const { rows } = snapshot();
      saveBlob(new Blob(['﻿' + csvOf(datasetsSheet(rows).rows)], { type: 'text/csv;charset=utf-8' }),
        'HEDB_Submission_Export_' + fileStamp + '.csv');
      if (window.khdaToast) window.khdaToast('info', t('dash.export.csvTitle'), t('dash.export.csvText'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bind(id) {
    const btn = document.getElementById(id || 'exportAll');
    if (!btn) return;
    const { totals } = snapshot();
    btn.disabled = !totals.records;
    btn.title = totals.records ? t('dash.export.title') : t('dash.export.nothing');
    btn.addEventListener('click', () => run(btn));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bind());
  else bind();

  window.KHDA_EXPORT = { snapshot, sheetsFor, run, bind, CYCLE, WINDOWS, CADENCES };
})();
