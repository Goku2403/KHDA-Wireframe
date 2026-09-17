/* Sector model — 37 institutions × 46 datasets × 4 reporting periods.
   Deterministic demo data (seeded per institution/dataset/period) so every KHDA-side page,
   the leaderboard and the compliance history agree with each other. Nothing here is typed by
   hand per dataset: statuses, receipts, journeys and issues are generated from the dictionary.
   Plan references: DEVELOPMENT-PLAN.md §3 (pages), §6 (scoring), §7 (data model). */
(function () {
  'use strict';

  const DATA = window.KHDA_DATASETS || [];
  const S = window.KHDA_SCHEMA;
  const TODAY = new Date(2026, 9, 20); // wireframe "today" — seven weeks into Fall 2026–2027 so the cycle looks mid-flight
  const DAY = 86400000;

  // ---------- reporting periods ----------
  const PERIODS = [
    { id: '2025F', label: 'Fall · 2025–2026', short: 'Fall 25–26', start: new Date(2025, 8, 1), end: new Date(2025, 11, 31) },
    { id: '2025W', label: 'Winter · 2025–2026', short: 'Winter 25–26', start: new Date(2026, 0, 1), end: new Date(2026, 3, 30) },
    { id: '2025S', label: 'Spring · 2025–2026', short: 'Spring 25–26', start: new Date(2026, 4, 1), end: new Date(2026, 7, 31) },
    { id: '2026F', label: 'Fall · 2026–2027', short: 'Fall 26–27', start: new Date(2026, 8, 1), end: new Date(2026, 11, 31), current: true },
  ];
  const CURRENT = '2026F';

  // ---------- institutions (37 licensed HEIs) ----------
  const LOC = ['Academic City', 'Knowledge Park', 'DIFC', 'Trade Centre', 'Internet City', 'Media City', 'Design District', 'Silicon Oasis'];
  const TEAMS = ['Onboarding team', 'Quality team', 'Integration team'];
  const RAW = [
    ['University of Dubai', 'UD', 0, 1], ['American University in Dubai', 'AUD', 5, 1], ['American University in the Emirates', 'AUE', 0, 1],
    ['Abu Dhabi University — Dubai', 'ADU', 1, 1], ['Amity University Dubai', 'Amity', 0, 1], ['Hult International Business School', 'Hult', 4, 1],
    ['University of Wollongong in Dubai', 'UOWD', 1, 1], ['BITS Pilani Dubai', 'BITS', 0, 2], ['Dubai Institute of Design and Innovation', 'DIDI', 6, 2],
    ['Symbiosis International University', 'Symbiosis', 1, 2], ['Curtin University Dubai', 'Curtin', 0, 2], ['Murdoch University Dubai', 'Murdoch', 1, 2],
    ['Heriot-Watt University Dubai', 'Heriot-Watt', 1, 2], ['Middlesex University Dubai', 'Middlesex', 1, 2], ['Manipal Academy of Higher Education', 'Manipal', 0, 2],
    ['Istituto Marangoni', 'Marangoni', 2, 2], ['EM Normandie Business School', 'EM Normandie', 2, 2], ['London Business School Dubai', 'LBS', 2, 2],
    ['University of Europe for Applied Sciences', 'UE', 3, 2], ['Saint Joseph University Dubai', 'Saint Joseph', 0, 2], ['Georgetown University Qatar — Dubai', 'Georgetown', 2, 2],
    ['Luiss Business School Dubai', 'Luiss', 3, 3], ['ESCP Business School', 'ESCP', 3, 3], ['Plekhanov University Dubai', 'Plekhanov', 4, 3],
    ['British University in Dubai', 'BUiD', 0, 3], ['American University of Beirut — Dubai', 'AUB', 7, 3], ['Rochester Institute of Technology Dubai', 'RIT', 7, 3],
    ['University of Birmingham Dubai', 'Birmingham', 0, 3], ['University of Manchester Middle East', 'Manchester', 1, 3], ['SP Jain School of Global Management', 'SP Jain', 0, 3],
    ['Canadian University Dubai', 'CUD', 5, 3], ['Emirates Aviation University', 'EAU', 0, 3], ['Zayed University Dubai', 'ZU', 0, 3],
    ['Hamdan Bin Mohammed Smart University', 'HBMSU', 0, 4], ['Modul University Dubai', 'Modul', 5, 4], ['Westford University College', 'Westford', 1, 4],
    ['City University College of Ajman — Dubai', 'CUCA', 5, 4],
  ];
  const INSTITUTIONS = RAW.map(([name, short, loc, wave], i) => {
    const r = rnd('inst' + i);
    return {
      id: 'I' + String(i + 1).padStart(2, '0'), code: String(101 + i), name, short,
      location: LOC[loc], wave, waveLabel: wave === 1 ? 'Pilot Wave 1' : 'Wave ' + wave,
      owner: TEAMS[i % 3], liaison: short + ' data liaison', complexity: ['Simple', 'Moderate', 'Complex'][Math.floor(r() * 3)],
      commitment: r() < 0.85 ? 'Confirmed' : 'Pending',
      // readiness drives every generated outcome; earlier waves are further along
      readiness: Math.min(0.96, Math.max(0.15, 0.85 - (wave - 1) * 0.16 + (r() - 0.5) * 0.3)),
      channel: r() < (wave === 1 ? 0.9 : 0.6) ? 'api' : 'portal',
    };
  });

  // ---------- subject areas (derived from dataset titles) ----------
  const AREAS = ['Students & applicants', 'Employees', 'Graduates', 'Institution', 'Programs & courses', 'Research & innovation'];
  function areaOf(d) {
    const s = (d.title + ' ' + d.sheet).toLowerCase();
    if (/research|r&d|scholar|startup|intellectual|patent|innovation/.test(s)) return AREAS[5];
    if (/employee|faculty|staff|workload/.test(s)) return AREAS[1];
    if (/graduate|licensure|alumni/.test(s)) return AREAS[2];
    if (/program|course|academic_program|learning|micro|skill/.test(s)) return AREAS[4];
    if (/institut|employer|leadership|partnership|financial|obf|event|overview/.test(s)) return AREAS[3];
    return AREAS[0];
  }
  function frequencyOf(d) { return d.kind === 'Real-time' ? 'Event-based' : d.group; }
  // real-time codes get a readable title (the competitor leaks raw codes like SOD_TXN)
  function titleOf(d) {
    if (/^[A-Z0-9_]+$/.test(d.title)) return d.title.toLowerCase().replace(/_txn$/, ' transactions').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bSod\b/, 'Students of Determination');
    return d.title;
  }
  function codeOf(d) { return (d.fields[0] && d.fields[0].db ? d.fields[0].db.split('_')[0] + '_' : '') + d.sheet.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase(); }

  // ---------- deterministic randomness ----------
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { let x = hash(seed) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }

  // ---------- requirement: one row per institution × dataset × period ----------
  function requirement(inst, d, per) {
    const r = rnd('req' + inst.id + d.sheet + per.id);
    const idx = DATA.indexOf(d);
    const realtime = d.kind === 'Real-time';
    const annual = d.group === 'Annual';
    const applicable = !(annual && per.id !== '2025F' && per.id !== '2026F'); // annual datasets fall due in Fall
    const due = realtime ? null : new Date(per.start.getTime() + (8 + (idx * 7) % 84) * DAY);
    const waived = applicable && r() < 0.02;
    return { applicable, due, waived, realtime };
  }

  // ---------- submission: generated outcome per requirement ----------
  const STAGES = ['Source', 'iPaaS', 'API Hub', 'Adapter', 'Validation', 'Profiling', 'Processing', 'Published'];
  function submission(inst, d, per) {
    const req = requirement(inst, d, per);
    const r = rnd('sub' + inst.id + d.sheet + per.id);
    const base = { inst, dataset: d, period: per, req, channel: inst.channel, version: 1, receivedAt: null, status: 'not_started', rowsAccepted: 0, rowsRejected: 0, issues: [] };
    if (!req.applicable) return { ...base, status: 'not_applicable' };
    if (req.waived) return { ...base, status: 'waived' };
    const periodDone = per.end < TODAY;
    const anchor = req.due || new Date(per.start.getTime() + 30 * DAY);
    // when would it arrive? early institutions send before the due date
    const offset = Math.round((r() - inst.readiness) * 40);
    const receivedAt = new Date(anchor.getTime() + offset * DAY);
    const arrives = r() < Math.min(1, inst.readiness + 0.15);
    if (!arrives || receivedAt > TODAY) {
      // nothing received (yet): draft states show up for portal-channel institutions
      const st = !periodDone && inst.channel === 'portal' && r() < 0.35 ? (r() < 0.5 ? 'draft' : 'awaiting_approval') : 'not_started';
      return { ...base, status: st, receivedAt: null };
    }
    const rows = 40 + Math.floor(r() * 400);
    const q = r();
    let status, rowsRejected = 0;
    if (q < 0.6 + inst.readiness * 0.45) status = 'accepted';
    else if (q < 0.9 + inst.readiness * 0.1) { status = 'needs_correction'; rowsRejected = 1 + Math.floor(rows * (0.02 + r() * 0.12)); }
    else status = periodDone ? 'accepted' : (r() < 0.5 ? 'in_validation' : 'dispatched');
    const late = req.due && receivedAt > req.due;
    if (status === 'accepted' && late) status = 'late_accepted';
    const version = status === 'accepted' || status === 'late_accepted' ? (r() < 0.3 ? 2 : 1) : 1;
    const sub = { ...base, status, receivedAt, version, rowsAccepted: rows - rowsRejected, rowsRejected, channel: r() < 0.08 ? 'portal' : inst.channel };
    sub.issues = status === 'needs_correction' ? issuesFor(sub, r) : [];
    return sub;
  }

  // validation issues are drawn from the dataset's own rules (mandatory, code list, length, key…)
  function issuesFor(sub, r) {
    const d = sub.dataset;
    const fields = d.fields.filter(f => f.db);
    const n = 1 + Math.floor(r() * 3);
    const out = [];
    for (let i = 0; i < n && fields.length; i++) {
      const f = fields[Math.floor(r() * fields.length)];
      const kind = f.list ? 'code_list' : f.r === 'Yes' && r() < 0.5 ? 'mandatory' : /NUMBER/.test(f.t || '') ? 'range' : /DATE/.test(f.t || '') ? 'date' : 'length';
      const rows = Math.max(1, Math.round(sub.rowsRejected * (i === 0 ? 0.6 : 0.25)));
      out.push({
        id: 'R-' + String(hash(d.sheet + f.db) % 900 + 100), field: f.n, db: f.db, kind, rows,
        severity: kind === 'mandatory' || kind === 'code_list' ? 'Error' : 'Warning',
        rule: RULE_TEXT[kind](f),
        sample: kind === 'code_list' ? 'XX9' : kind === 'mandatory' ? '(empty)' : kind === 'range' ? '-3' : kind === 'date' ? '31/02/2026' : 'A'.repeat(12) + '…',
        fix: RULE_FIX[kind](f),
        recurring: r() < 0.3,
      });
    }
    return out;
  }
  const RULE_TEXT = {
    mandatory: f => `${f.n} is mandatory`,
    code_list: f => `${f.n} must be a value from the ${f.list} list`,
    range: f => `${f.n} must be a whole number ≥ 0`,
    date: f => `${f.n} must be a valid date not in the future (YYYY-MM-DD)`,
    length: f => `${f.n} exceeds ${(f.t || 'TEXT(255)').replace(/\D/g, '') || 255} characters`,
  };
  const RULE_FIX = {
    mandatory: f => `Provide ${f.n} for every row`,
    code_list: f => `Replace with a code from the ${f.list} reference sheet`,
    range: f => `Enter a non-negative whole number`,
    date: f => `Use YYYY-MM-DD and a date on or before today`,
    length: f => `Shorten the value or use the official list entry`,
  };

  // ---------- journey ----------
  function journey(sub) {
    const st = sub.status;
    const doneTo = { not_started: -1, not_applicable: -1, waived: -1, draft: -1, awaiting_approval: -1, dispatched: 1, in_validation: 3, needs_correction: 4, accepted: 7, late_accepted: 7 }[st];
    const failedAt = st === 'needs_correction' ? 4 : -1;
    const currentAt = st === 'draft' || st === 'awaiting_approval' ? 0 : st === 'dispatched' ? 2 : st === 'in_validation' ? 4 : -1;
    const t0 = sub.receivedAt ? sub.receivedAt.getTime() : null;
    const mins = [0, 2, 3, 9, 41, 75, 130, 190];
    return STAGES.map((name, i) => {
      let state = 'pending';
      if (i === failedAt) state = 'failed'; else if (i === currentAt) state = 'current'; else if (i <= doneTo) state = 'done';
      const at = t0 && state !== 'pending' ? new Date(t0 + mins[i] * 60000) : null;
      const ref = t0 ? (i === 1 ? 'IPS-' + (hash(sub.inst.id + sub.dataset.sheet + i) % 90000 + 10000) : i === 2 ? 'corr-' + (hash(sub.dataset.sheet + sub.period.id) % 0xfffff).toString(16) : i === 4 ? 'DQ-' + (hash(sub.period.id + sub.inst.id) % 9000 + 1000) : '') : '';
      const note = state === 'failed' ? `${sub.issues.length} rule${sub.issues.length === 1 ? '' : 's'} failed · ${sub.rowsRejected} rows rejected`
        : state === 'current' ? (i === 0 ? (st === 'draft' ? 'Draft with Data Steward' : 'Awaiting Approver sign-off') : i === 2 ? 'Token validated · awaiting adapter' : 'Rules running in the Qlik DQ layer')
        : state === 'done' ? ['Payload received', 'Routed by iPaaS', 'Auth + IP + token OK', 'Persisted to institution store', 'All rules passed', 'Profile stored', 'Processed', 'Visible in Qlik Portal'][i] : '';
      return { name, state, at, ref, note, sla: [null, '5 min', '5 min', '15 min', '2 h', '4 h', '8 h', null][i] };
    });
  }

  // ---------- roll-ups ----------
  const cache = {};
  function subsOf(inst, per) {
    const k = inst.id + per.id;
    return cache[k] || (cache[k] = DATA.map(d => submission(inst, d, per)));
  }
  const ACCEPTED = s => s.status === 'accepted' || s.status === 'late_accepted';
  const RECEIVED = s => !!s.receivedAt;
  const REQUIRED = s => s.req.applicable && !s.req.waived;

  function summary(inst, per) {
    const subs = subsOf(inst, per);
    const req = subs.filter(REQUIRED);
    const counts = {};
    subs.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
    const received = req.filter(RECEIVED);
    const accepted = req.filter(ACCEPTED);
    const needs = req.filter(s => s.status === 'needs_correction');
    const processing = req.filter(s => s.status === 'in_validation' || s.status === 'dispatched');
    const overdue = req.filter(s => s.req.due && s.req.due < TODAY && !RECEIVED(s));
    const late = req.filter(s => s.req.due && RECEIVED(s) && s.receivedAt > s.req.due);
    const rowsA = received.reduce((n, s) => n + s.rowsAccepted, 0), rowsR = received.reduce((n, s) => n + s.rowsRejected, 0);
    const dq = rowsA + rowsR ? Math.round(rowsA / (rowsA + rowsR) * 100) : null;
    const compliant = overdue.length === 0 && needs.length === 0;
    const reason = needs.length ? `${needs.length} dataset${needs.length === 1 ? '' : 's'} need correction` : overdue.length ? `${overdue.length} dataset${overdue.length === 1 ? '' : 's'} past their deadline` : 'No overdue work or open corrections';
    const state = compliant ? 'compliant' : (overdue.length > 12 || needs.length > 9) ? 'blocked' : (overdue.length > 6 || needs.length > 5) ? 'at_risk' : 'needs_follow_up';
    const lastAt = received.reduce((m, s) => !m || s.receivedAt > m ? s.receivedAt : m, null);
    return {
      inst, period: per, subs, required: req.length, received: received.length, accepted: accepted.length, needsCorrection: needs.length,
      processing: processing.length, notSubmitted: req.length - received.length, overdue: overdue.length, late: late.length,
      onTime: received.length - late.length, rowsAccepted: rowsA, rowsRejected: rowsR, dq, compliant, reason, state,
      openIssues: needs.reduce((n, s) => n + s.issues.length, 0), apiCount: received.filter(s => s.channel === 'api').length,
      lastReceivedAt: lastAt, counts,
      pct: req.length ? Math.round(accepted.length / req.length * 100) : 0,
    };
  }

  // ---------- scoring (plan §6: denominators are REQUIRED datasets, lateness deducts) ----------
  function score(inst, per) {
    const sm = summary(inst, per);
    const req = sm.subs.filter(REQUIRED);
    const withDue = req.filter(s => s.req.due);
    const onTime = withDue.filter(s => RECEIVED(s) && s.receivedAt <= s.req.due).length;
    const lateDays = withDue.filter(s => RECEIVED(s) && s.receivedAt > s.req.due).reduce((n, s) => n + Math.ceil((s.receivedAt - s.req.due) / DAY), 0);
    const coverage = Math.round(sm.accepted / Math.max(1, sm.required) * 400);
    const dq = Math.round((sm.rowsAccepted + sm.rowsRejected ? sm.rowsAccepted / (sm.rowsAccepted + sm.rowsRejected) : 0) * 250);
    const timeliness = Math.max(0, Math.round(onTime / Math.max(1, withDue.length) * 200) - lateDays);
    const automation = Math.round(sm.apiCount / Math.max(1, sm.required) * 150);
    return {
      inst, period: per, coverage, dq, timeliness, automation, total: coverage + dq + timeliness + automation,
      detail: {
        coverage: `${sm.accepted} of ${sm.required} required datasets accepted`, coverageF: `Round(${sm.accepted} ÷ ${sm.required} × 400) = ${coverage}`,
        dq: `${sm.rowsAccepted.toLocaleString()} of ${(sm.rowsAccepted + sm.rowsRejected).toLocaleString()} validated rows accepted`, dqF: `Round(${sm.rowsAccepted.toLocaleString()} ÷ ${(sm.rowsAccepted + sm.rowsRejected).toLocaleString()} × 250) = ${dq}`,
        timeliness: `${onTime} of ${withDue.length} dated datasets on time · ${lateDays} late day${lateDays === 1 ? '' : 's'} deducted`, timelinessF: `Round(${onTime} ÷ ${withDue.length} × 200) − ${lateDays} = ${timeliness}`,
        automation: `${sm.apiCount} of ${sm.required} required datasets via API`, automationF: `Round(${sm.apiCount} ÷ ${sm.required} × 150) = ${automation}`,
      },
      summary: sm,
    };
  }
  const rankCache = {};
  function ranking(perId) {
    if (rankCache[perId]) return rankCache[perId];
    const per = period(perId);
    const list = INSTITUTIONS.map(i => score(i, per));
    list.sort((a, b) => b.total - a.total || b.coverage - a.coverage || b.timeliness - a.timeliness || b.dq - a.dq);
    list.forEach((s, i) => { s.rank = i + 1; });
    const prevId = PERIODS[Math.max(0, PERIODS.findIndex(p => p.id === perId) - 1)].id;
    if (prevId !== perId) { const prev = ranking(prevId); list.forEach(s => { s.prevRank = prev.find(x => x.inst.id === s.inst.id).rank; s.movement = s.prevRank - s.rank; }); }
    else list.forEach(s => { s.prevRank = null; s.movement = 0; });
    return (rankCache[perId] = list);
  }
  function trend(inst) { return PERIODS.map(p => { const r = ranking(p.id).find(x => x.inst.id === inst.id); return { period: p, total: r.total, rank: r.rank }; }); }

  function sector(perId) {
    const per = period(perId);
    const all = INSTITUTIONS.map(i => summary(i, per));
    const sum = k => all.reduce((n, s) => n + s[k], 0);
    return {
      period: per, institutions: all, total: INSTITUTIONS.length,
      compliant: all.filter(s => s.compliant).length, needsFollowUp: all.filter(s => !s.compliant).length,
      atRisk: all.filter(s => s.state === 'at_risk' || s.state === 'blocked').length,
      required: sum('required'), received: sum('received'), accepted: sum('accepted'), needsCorrection: sum('needsCorrection'),
      processing: sum('processing'), notSubmitted: sum('notSubmitted'), rowsRejected: sum('rowsRejected'), api: sum('apiCount'),
    };
  }

  // compliance history per institution: one line per period
  function history(inst) {
    return PERIODS.map(p => {
      const sm = summary(inst, p);
      return { period: p, ...sm, missing: sm.required - sm.received, recurring: sm.subs.filter(s => s.status === 'needs_correction').map(s => s.dataset.sheet) };
    });
  }
  function recurringCorrections(inst) {
    const seen = {};
    history(inst).forEach(h => h.recurring.forEach(s => { seen[s] = (seen[s] || 0) + 1; }));
    return Object.entries(seen).filter(([, n]) => n > 1).map(([sheet, n]) => ({ sheet, periods: n, title: titleOf(DATA.find(d => d.sheet === sheet)) }));
  }

  // ---------- own institution (chosen at sign-in) ----------
  function own() {
    let id = null; try { id = localStorage.getItem('khda.institution'); } catch { /* ignore */ }
    return INSTITUTIONS.find(i => i.id === id) || INSTITUTIONS[0];
  }
  function setOwn(id) { try { localStorage.setItem('khda.institution', id); } catch { /* ignore */ } }
  function period(id) { return PERIODS.find(p => p.id === (id || currentPeriod())) || PERIODS[3]; }
  function currentPeriod() { let p = null; try { p = localStorage.getItem('khda.period'); } catch { /* ignore */ } return PERIODS.some(x => x.id === p) ? p : CURRENT; }
  function setPeriod(id) { try { localStorage.setItem('khda.period', id); } catch { /* ignore */ } }

  // ---------- labels ----------
  const STATUS = {
    not_started: ['Not started', 'chip--neutral'], draft: ['Draft', 'chip--pending'], awaiting_approval: ['Awaiting approval', 'chip--pending'],
    dispatched: ['Dispatched', 'chip--current'], in_validation: ['In validation', 'chip--current'], needs_correction: ['Needs correction', 'chip--error'],
    accepted: ['Accepted', 'chip--complete'], late_accepted: ['Late · accepted', 'chip--warning'], waived: ['Waived', 'chip--outline'], not_applicable: ['Not applicable', 'chip--outline'],
  };
  const INST_STATE = { compliant: ['Compliant', 'chip--complete'], needs_follow_up: ['Needs follow-up', 'chip--warning'], at_risk: ['At risk', 'chip--error'], blocked: ['Blocked', 'chip--error'] };
  function chip(status) { const [l, c] = STATUS[status] || [status, 'chip--neutral']; return `<span class="chip ${c}">${l}</span>`; }
  function stateChip(state) { const [l, c] = INST_STATE[state] || [state, 'chip--neutral']; return `<span class="chip ${c}">${l}</span>`; }
  function fmtDate(d) { return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
  function fmtDateTime(d) { return d ? fmtDate(d) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' (Dubai time)' : '—'; }
  function daysBetween(a, b) { return Math.round((a - b) / DAY); }
  function dueText(sub) {
    if (!sub.req.due) return 'Event-based';
    const n = daysBetween(sub.req.due, TODAY);
    if (RECEIVED(sub)) { const l = daysBetween(sub.receivedAt, sub.req.due); return l > 0 ? `Received ${l} day${l === 1 ? '' : 's'} late` : 'Received on time'; }
    return n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue` : n === 0 ? 'Due today' : `Due in ${n} day${n === 1 ? '' : 's'}`;
  }
  function freshness(sub) {
    if (!sub.receivedAt) return 'No receipt yet';
    const n = daysBetween(TODAY, sub.receivedAt);
    return (n === 0 ? 'Received today' : n === 1 ? 'Received yesterday' : `Received ${n} days ago`) + ' · ' + (sub.channel === 'api' ? 'API' : 'Portal') + ' submission';
  }

  window.KHDA_SECTOR = {
    TODAY, PERIODS, CURRENT, INSTITUTIONS, AREAS, STAGES, STATUS, INST_STATE,
    areaOf, frequencyOf, titleOf, codeOf, requirement, submission, subsOf, journey, summary, score, ranking, trend, sector, history, recurringCorrections,
    own, setOwn, period, currentPeriod, setPeriod, chip, stateChip, fmtDate, fmtDateTime, dueText, freshness, daysBetween, hash,
    ACCEPTED, RECEIVED, REQUIRED,
  };
})();
