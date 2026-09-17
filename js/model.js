/* Institution submission model — where each of the 46 datasets stands for a reporting period:
   submitted (portal or API) → received → validation → quality review → accepted, or returned with records
   to reconcile. Demo state is generated deterministically from the dictionary; drafts and submissions made
   in this browser (data entry page, reconciliation page) override it. Read by status, reconciliation and API. */
(function () {
  'use strict';
  const DATA = window.KHDA_DATASETS || [];
  const S = window.KHDA_SCHEMA;
  if (!S || !DATA.length) return;
  const DAY = 86400000;
  const t = (k, v) => (window.t ? window.t(k, v) : k);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  // fixed demo "today" inside the current reporting period so the picture is stable from day to day
  const TODAY = new Date(2025, 10, 10);
  const INSTITUTION = { code: '75', name: 'United Arab Emirates University', short: 'UAEU' };
  const PERIODS = [
    { id: '2024F', label: 'Fall 2024–25', start: new Date(2024, 8, 1), end: new Date(2024, 11, 31) },
    { id: '2024W', label: 'Winter 2024–25', start: new Date(2025, 0, 1), end: new Date(2025, 3, 30) },
    { id: '2024S', label: 'Spring 2024–25', start: new Date(2025, 4, 1), end: new Date(2025, 7, 31) },
    { id: '2025F', label: 'Fall 2025–26', start: new Date(2025, 8, 1), end: new Date(2025, 11, 31), current: true },
  ];

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { let x = hash(seed) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }

  // ---------- dataset helpers ----------
  const codeOf = d => d.sheet.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
  const draftKey = d => 'khda.hedb.' + d.sheet.replace(/[^A-Za-z0-9]+/g, '_') + '.v1';
  // real-time sheets are named by their table code in the dictionary; show a readable name
  function titleOf(d) {
    if (!/^[A-Z0-9_]+$/.test(d.title)) return d.title;
    return d.title.toLowerCase().replace(/_txn$/, ' transactions').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bSod\b/, 'Students of Determination');
  }

  // ---------- subject areas (the six the sector reports by) ----------
  const AREAS = ['students', 'employees', 'graduates', 'institution', 'programs', 'research'];
  function areaOf(d) {
    const s = (d.title + ' ' + d.sheet).toLowerCase();
    if (/research|r&d|scholar|startup|intellectual|patent|innovation|publication/.test(s)) return 'research';
    if (/employee|faculty|staff|workload/.test(s)) return 'employees';
    if (/graduate|licensure|alumni/.test(s)) return 'graduates';
    if (/program|course|academic_program|learning|micro|skill|clo/.test(s)) return 'programs';
    if (/institut|employer|leadership|partnership|financial|obf|event|overview|self report/.test(s)) return 'institution';
    return 'students';
  }

  // ---------- vocabulary ----------
  // status → [label, chip modifier, index of the current journey stage]
  // labels are i18n keys (stage.N, st.<status>) resolved through t() at render time
  const STAGES = ['stage.0', 'stage.1', 'stage.2', 'stage.3', 'stage.4'];
  const STATUS = {
    not_started: ['st.not_started', 'neutral', -1],
    draft: ['st.draft', 'pending', -1],
    submitted: ['st.submitted', 'current', 0],
    validation: ['st.validation', 'current', 2],
    review: ['st.review', 'current', 3],
    returned_v: ['st.returned_v', 'error', 2],
    returned_q: ['st.returned_q', 'error', 3],
    accepted: ['st.accepted', 'complete', 4],
    accepted_late: ['st.accepted_late', 'warning', 4],
    na: ['st.na', 'outline', -1],
  };
  const SOURCE = { returned_v: 'recon.byValidation', returned_q: 'recon.byReview' };
  const label = st => t((STATUS[st] || [st])[0]);

  // ---------- rules: validation rules come from the dictionary, quality-review rules are cross-record checks ----------
  const ruleCache = {};
  function rulesFor(d) {
    if (ruleCache[d.sheet]) return ruleCache[d.sheet];
    const sc = S.get(d.sheet), out = [];
    const id = (p, f, k) => p + '-' + String(hash(d.sheet + (f ? f.db : '') + k) % 9000 + 1000);
    sc.fields.forEach(f => {
      if (f.required) out.push({ id: id('V', f, 'm'), src: 'returned_v', kind: 'Mandatory', field: f, text: `${f.label} must be provided`, fix: `Provide ${f.label} for the record`, sample: '(empty)' });
      if (f.listName) out.push({ id: id('V', f, 'c'), src: 'returned_v', kind: 'Code list', field: f, text: `${f.label} must be a code from the ${f.listName} list`, fix: `Use a code from the ${f.listName} reference list`, sample: 'XX9' });
      if (f.maxLen) out.push({ id: id('V', f, 'l'), src: 'returned_v', kind: 'Length', field: f, text: `${f.label} is text up to ${f.maxLen} characters`, fix: 'Shorten the value', sample: 'A'.repeat(12) + '…' });
      if (f.control === 'number') out.push({ id: id('V', f, 'n'), src: 'returned_v', kind: 'Range', field: f, text: `${f.label} is a ${f.integer ? 'whole' : 'decimal'} number${f.min != null ? ' of ' + f.min + ' or more' : ''}`, fix: 'Enter a valid number', sample: '-3' });
      if (f.control === 'date') out.push({ id: id('V', f, 'd'), src: 'returned_v', kind: 'Date', field: f, text: `${f.label} is a date in YYYY-MM-DD, not in the future`, fix: 'Use YYYY-MM-DD on or before today', sample: '31/02/2025' });
    });
    if (sc.pk.length) out.push({ id: id('V', null, 'pk'), src: 'returned_v', kind: 'Primary key', field: null, text: `${sc.pk.map(k => (sc.fields.find(f => f.key === k) || {}).label || k).join(' + ')} must be unique`, fix: 'Remove or merge the duplicate record', sample: 'duplicate key' });
    out.push({ id: id('Q', null, 'ref'), src: 'returned_q', kind: 'Reference', field: sc.fields[0] || null, text: 'Record refers to a person, programme or institution KHDA does not have on file', fix: 'Correct the identifier, or submit the parent record first', sample: '7841-2 not on file' });
    out.push({ id: id('Q', null, 'hist'), src: 'returned_q', kind: 'Consistency', field: sc.fields[1] || null, text: 'Value differs from the previous period for the same record', fix: 'Confirm the change, or restore the previous value', sample: 'AE → IN' });
    const num = sc.fields.find(f => f.control === 'number');
    if (num) out.push({ id: id('Q', num, 'stat'), src: 'returned_q', kind: 'Outlier', field: num, text: `${num.label} is far outside the institution's own history`, fix: 'Verify the figure and its unit; add a note if it is correct', sample: '4,120 (usual 310)' });
    out.push({ id: id('Q', null, 'dup'), src: 'returned_q', kind: 'Duplicate', field: null, text: 'Record was also reported by another institution for the same period', fix: 'Confirm the enrolment or transfer with the other institution', sample: 'also reported by 108' });
    return (ruleCache[d.sheet] = out);
  }

  // ---------- requirement and generated state ----------
  function requirement(d, per) {
    const idx = DATA.indexOf(d);
    const realtime = d.kind === 'Real-time', annual = d.group === 'Annual';
    const applicable = !(annual && !/F$/.test(per.id));   // annual datasets are collected in the Fall period
    const due = realtime ? null : new Date(per.start.getTime() + (8 + (idx * 7) % 84) * DAY);
    return { applicable, due, realtime };
  }
  function generated(d, per) {
    const req = requirement(d, per), r = rnd('sub' + d.sheet + per.id);
    const base = { dataset: d, period: per, req, channel: 'api', version: 1, receivedAt: null, status: 'not_started', rows: 0, returnedCount: 0 };
    if (!req.applicable) return { ...base, status: 'na' };
    const periodDone = per.end < TODAY;
    const anchor = req.due || new Date(per.start.getTime() + 30 * DAY);
    const receivedAt = new Date(anchor.getTime() + Math.round((r() - 0.72) * 40) * DAY + (9 + hash(d.sheet + per.id) % 8) * 3600000 + (hash(d.sheet) % 60) * 60000);
    const arrives = r() < 0.86;
    if (!arrives || receivedAt > TODAY) return { ...base, status: !periodDone && r() < 0.3 ? 'draft' : 'not_started' };
    const rows = 40 + Math.floor(r() * 400), q = r();
    let status, returnedCount = 0;
    if (q < 0.62) status = 'accepted';
    else if (q < 0.75) { status = 'returned_v'; returnedCount = 1 + Math.floor(rows * (0.02 + r() * 0.08)); }
    else if (q < 0.88) { status = 'returned_q'; returnedCount = 1 + Math.floor(rows * (0.01 + r() * 0.05)); }
    else status = periodDone ? 'accepted' : (r() < 0.5 ? 'validation' : 'review');
    if (status === 'accepted' && req.due && receivedAt > req.due) status = 'accepted_late';
    return { ...base, status, receivedAt, rows, returnedCount, channel: r() < 0.75 ? 'api' : 'portal', version: r() < 0.25 ? 2 : 1 };
  }
  // record-level detail behind a returned dataset
  function returnedRecords(sub) {
    if (!sub.returnedCount || !SOURCE[sub.status]) return [];
    const rules = rulesFor(sub.dataset).filter(x => x.src === sub.status);
    const r = rnd('ret' + sub.dataset.sheet + sub.period.id + sub.version);
    const sc = S.get(sub.dataset.sheet), keyF = sc.fields.find(f => sc.pk.includes(f.key)) || sc.fields[0];
    const fixed = ls.get('khda.recon.fixed.v1', {})[sub.dataset.sheet] || [];
    return Array.from({ length: Math.min(sub.returnedCount, 40) }, (_, i) => {
      const rule = rules[Math.floor(r() * rules.length)];
      const id = String(1000 + Math.floor(r() * 9000));
      return { id, rule, record: INSTITUTION.code + '-' + id, keyLabel: keyF ? keyF.label : 'Record', field: rule.field ? rule.field.label : '—', db: rule.field ? rule.field.db : '', value: rule.sample, fixed: fixed.includes(id) };
    });
  }
  // what this browser did (data entry drafts, resubmissions) wins over the generated state
  function submission(d, per) {
    let sub = generated(d, per);
    if (per.current) {
      const draft = ls.get(draftKey(d), {});
      const ev = ls.get('khda.sub.events.v1', []).filter(e => e.sheet === d.sheet).pop();
      if (ev) sub = { ...sub, status: ev.status, receivedAt: new Date(ev.at), channel: ev.channel || sub.channel, version: ev.version || sub.version, rows: ev.rows != null ? ev.rows : sub.rows, returnedCount: ev.returnedCount || 0, live: true };
      else if (draft.submittedAt) sub = { ...sub, status: 'validation', receivedAt: new Date(draft.submittedAt), channel: 'portal', rows: (draft.records || []).length, returnedCount: 0, live: true };
      else if ((draft.records || []).length && !sub.receivedAt) sub = { ...sub, status: 'draft', rows: draft.records.length };
    }
    sub.returned = returnedRecords(sub);
    sub.receipt = sub.receivedAt ? receiptFor(sub) : null;
    return sub;
  }
  function receiptFor(sub) {
    const payload = [INSTITUTION.code, sub.dataset.sheet, sub.period.id, sub.version, sub.receivedAt.toISOString()].join('|');
    return { id: 'KHDA-' + sub.period.id + '-' + INSTITUTION.code + '-' + String(hash(payload) % 9000 + 1000), at: sub.receivedAt };
  }
  function subs(per) { per = per || period(); return DATA.map(d => submission(d, per)); }

  // ---------- journey per submission ----------
  function journey(sub) {
    const idx = STATUS[sub.status][2];
    const failed = sub.status === 'returned_v' ? 2 : sub.status === 'returned_q' ? 3 : -1;
    const t0 = sub.receivedAt ? sub.receivedAt.getTime() : null;
    const mins = [0, 1, 25, 300, 1440];
    return STAGES.map((name, i) => {
      const state = i === failed ? 'failed' : (i < idx || (i === idx && idx === 4)) ? 'done' : i === idx ? 'current' : 'pending';
      const at = t0 && state !== 'pending' ? new Date(t0 + mins[i] * 60000) : null;
      const note = [
        t(sub.channel === 'api' ? 'journey.sentApi' : 'journey.sentPortal'),
        sub.receipt ? t('journey.receipt', { r: sub.receipt.id }) : t('journey.receiptPending'),
        state === 'failed' ? t('journey.failedV', { n: sub.returnedCount }) : t('journey.rulesNote'),
        state === 'failed' ? t('journey.failedQ', { n: sub.returnedCount }) : t('journey.reviewNote'),
        t('journey.acceptedNote'),
      ][i];
      return { name: t(name), state, at, note, sla: [null, t('sla.minutes'), t('sla.hour'), t('sla.day'), null][i] };
    });
  }

  // ---------- roll-ups ----------
  const REQ = s => s.req.applicable;
  const RECEIVED = s => !!s.receivedAt;
  const ACCEPTED = s => s.status === 'accepted' || s.status === 'accepted_late';
  const RETURNED = s => s.status === 'returned_v' || s.status === 'returned_q';
  const IN_REVIEW = s => ['submitted', 'validation', 'review'].includes(s.status);
  function summary(per) {
    per = per || period(); const all = subs(per), req = all.filter(REQ);
    const rec = req.filter(RECEIVED), acc = req.filter(ACCEPTED), ret = req.filter(RETURNED), rev = req.filter(IN_REVIEW);
    const overdue = req.filter(s => s.req.due && s.req.due < TODAY && !RECEIVED(s));
    const dueSoon = req.filter(s => s.req.due && !RECEIVED(s) && s.req.due >= TODAY && (s.req.due - TODAY) / DAY <= 14);
    return {
      period: per, all, required: req.length, received: rec.length, accepted: acc.length, returned: ret.length, inReview: rev.length,
      returnedV: ret.filter(s => s.status === 'returned_v').length, returnedQ: ret.filter(s => s.status === 'returned_q').length,
      notSubmitted: req.length - rec.length, overdue: overdue.length, dueSoon: dueSoon.length, drafts: req.filter(s => s.status === 'draft').length,
      rows: rec.reduce((n, s) => n + s.rows, 0), returnedRows: ret.reduce((n, s) => n + s.returnedCount, 0), api: rec.filter(s => s.channel === 'api').length,
      pct: req.length ? Math.round(acc.length / req.length * 100) : 0,
    };
  }

  // ---------- period ----------
  function currentPeriod() { const q = new URLSearchParams(location.search).get('period'); if (q && PERIODS.some(x => x.id === q)) { ls.set('khda.period', q); return q; } const p = ls.get('khda.period', null); return PERIODS.some(x => x.id === p) ? p : '2025F'; }
  function period(id) { return PERIODS.find(p => p.id === (id || currentPeriod())) || PERIODS[3]; }
  function setPeriod(id) { ls.set('khda.period', id); }

  // ---------- actions (demo) ----------
  function record(ev) {
    const l = ls.get('khda.sub.events.v1', []);
    const now = new Date(), at = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    l.push({ ...ev, at: ev.at || at.toISOString() }); ls.set('khda.sub.events.v1', l);
  }
  function queue(items) { const p = ls.get('khda.sub.pending', []); const now = Date.now(); items.forEach(([ms, ev]) => p.push({ at: now + ms, ev })); ls.set('khda.sub.pending', p); }
  function markFixed(sheet, ids, on) {
    const f = ls.get('khda.recon.fixed.v1', {}); const cur = new Set(f[sheet] || []);
    ids.forEach(id => on === false ? cur.delete(id) : cur.add(id)); f[sheet] = [...cur]; ls.set('khda.recon.fixed.v1', f);
  }
  function clearFixed(sheet) { const f = ls.get('khda.recon.fixed.v1', {}); delete f[sheet]; ls.set('khda.recon.fixed.v1', f); }

  // ---------- labels ----------
  const fmtDate = d => d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = d => d ? fmtDate(d) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
  const daysBetween = (a, b) => Math.round((a - b) / DAY);
  function dueText(sub) {
    if (!sub.req.due) return t('status.eventBased');
    if (RECEIVED(sub)) { const l = daysBetween(sub.receivedAt, sub.req.due); return l > 0 ? t('due.late', { n: l }) : t('due.onTime'); }
    const n = daysBetween(sub.req.due, TODAY);
    return n < 0 ? t('due.overdue', { n: -n }) : n === 0 ? t('due.today') : t('due.in', { n });
  }

  function freshness(sub) { if (!sub.receivedAt) return t('status.noReceipt'); const n = daysBetween(TODAY, sub.receivedAt); return n <= 0 ? t('fresh.today') : n === 1 ? t('fresh.yesterday') : t('fresh.daysAgo', { n }); }

  window.KHDA_MODEL = { TODAY, DAY, INSTITUTION, PERIODS, STAGES, STATUS, SOURCE, label, AREAS, areaOf, codeOf, draftKey, titleOf, rulesFor, requirement, submission, subs, journey, summary, currentPeriod, period, setPeriod, record, queue, markFixed, clearFixed, fmtDate, fmtDateTime, daysBetween, dueText, freshness, hash, ls, REQ, RECEIVED, ACCEPTED, RETURNED, IN_REVIEW };
})();
