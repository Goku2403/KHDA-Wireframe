/* Assistant — every question comes back as a report: a headline answer, key figures, an interactive graph
   (bars, columns, donut, trend) and the underlying table, downloadable as an Excel workbook. Answers are
   composed from the dictionary, the rule library, the requirement table and the submission history only —
   nothing is generated free-text. Institution users are scoped to their own institution; KHDA staff see the
   sector. The assistant opens as a right-side sheet (same pattern as the dataset details sheet). */
(function () {
  'use strict';
  const K = window.KHDA_SECTOR, R = window.KHDA_ROLES, S = window.KHDA_SCHEMA;
  const DATA = window.KHDA_DATASETS || [];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (!K || !R) return;

  const HOST_ID = 'chatbotHost';
  const COLORS = ['var(--primary)', 'var(--info)', 'var(--success)', 'var(--warning)', 'var(--error)', '#6750A4', '#00897B', '#8D6E63', '#5C6BC0', '#D81B60'];
  const KINDS = { bars: 'Bars', columns: 'Columns', donut: 'Donut', trend: 'Trend' };
  let open = false, log = [];

  const N = n => (typeof n === 'number' ? n.toLocaleString() : String(n == null ? '—' : n));
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const plural = (n, w) => `${N(n)} ${w}${n === 1 ? '' : 's'}`;
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const tally = (list, keyOf, valueOf) => { const m = {}; list.forEach(x => { const k = keyOf(x); m[k] = (m[k] || 0) + (valueOf ? valueOf(x) : 1); }); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); };
  const src = (label, href) => `<a class="bot__src" href="${href}">${esc(label)}</a>`;

  function scopeInst() { return R.role().team === 'inst' ? K.own() : null; }
  function per() { return K.period(); }

  function findDataset(q) {
    const s = q.toLowerCase();
    return DATA.map(d => ({ d, score: [K.titleOf(d), d.sheet, K.codeOf(d)].reduce((n, x) => n + (s.includes(x.toLowerCase()) ? x.length : 0), 0) }))
      .filter(x => x.score).sort((a, b) => b.score - a.score).map(x => x.d)[0]
      || DATA.find(d => { const w = K.titleOf(d).toLowerCase().split(/\W+/).filter(x => x.length > 4); return w.length && w.every(x => s.includes(x)); });
  }
  function findInst(q) {
    if (scopeInst()) return null; // institution users only ever see their own institution
    const s = q.toLowerCase();
    // whole-word match on the short name, so "overdue" never matches "UE" and "graduates" never matches "ADU"
    const words = s.split(/[^a-z0-9-]+/);
    return K.INSTITUTIONS.find(i => words.includes(i.short.toLowerCase()) || s.includes(i.name.toLowerCase()));
  }

  // ---------- report builders (each answer returns { html, sources, report }) ----------
  // report: { title, subtitle, file, kpis: [{ label, value, note }], columns: [], rows: [[]],
  //           kind, kinds, chart: { unit, label, series: [{ name, value }] }, trend?: { x: [], unit, lines: [{ name, values }] } }
  const rep = o => ({ kinds: ['bars', 'columns', 'donut'], kind: 'bars', ...o });

  function trendOf(i) {
    const h = K.history(i), t = K.trend(i);
    return { x: h.map(x => x.period.label), unit: '', lines: [{ name: 'Accepted datasets', values: h.map(x => x.accepted) }, { name: 'Need correction', values: h.map(x => x.needsCorrection) }, { name: 'Score ÷ 10', values: t.map(x => Math.round(x.total / 10)) }] };
  }
  function overviewInst(i, p) {
    const subs = K.subsOf(i, p).filter(K.REQUIRED);
    const areas = tally(subs, s => K.areaOf(s.dataset)).map(a => a.name);
    const rows = areas.map(a => { const l = subs.filter(s => K.areaOf(s.dataset) === a); const acc = l.filter(K.ACCEPTED).length; return [a, l.length, acc, l.filter(s => s.status === 'needs_correction').length, l.filter(s => s.req.due && s.req.due < K.TODAY && !K.RECEIVED(s)).length, l.filter(s => !K.RECEIVED(s)).length, pct(acc, l.length) + '%']; });
    const sm = K.summary(i, p);
    return rep({
      title: `${i.short} · submission overview`, subtitle: `${p.label} · ${plural(sm.required, 'required dataset')} across ${plural(areas.length, 'subject area')}`, file: `${i.short}-overview-${p.id}`,
      kpis: [{ label: 'Accepted', value: `${sm.accepted} / ${sm.required}`, note: pct(sm.accepted, sm.required) + '% of required' }, { label: 'Need correction', value: sm.needsCorrection, note: plural(sm.openIssues, 'open rule') }, { label: 'Overdue', value: sm.overdue, note: sm.overdue ? 'past their due date' : 'nothing past due' }, { label: 'Data quality', value: sm.dq == null ? '—' : sm.dq + '%', note: `${N(sm.rowsRejected)} rows to fix` }],
      columns: ['Subject area', 'Required', 'Accepted', 'Need correction', 'Overdue', 'Not submitted', 'Coverage'], rows,
      kinds: ['bars', 'columns', 'donut', 'trend'], chart: { series: rows.map(r => ({ name: r[0], value: r[2] })), label: 'Accepted datasets by subject area' },
      trend: trendOf(i), sources: [src('Dashboard', 'dashboard.html'), src('Submission status', 'status.html')],
    });
  }
  function overviewSector(p) {
    const sec = K.sector(p.id);
    const list = sec.institutions.slice().sort((a, b) => b.pct - a.pct);
    return rep({
      title: 'Sector · compliance overview', subtitle: `${p.label} · ${sec.total} institutions · ${N(sec.required)} required datasets`, file: `sector-compliance-${p.id}`,
      kpis: [{ label: 'Compliant', value: sec.compliant, note: `of ${sec.total} institutions` }, { label: 'Need follow-up', value: sec.needsFollowUp, note: `${sec.atRisk} at risk or blocked` }, { label: 'Accepted', value: pct(sec.accepted, sec.required) + '%', note: `${N(sec.accepted)} of ${N(sec.required)}` }, { label: 'Rows to fix', value: N(sec.rowsRejected), note: 'await correction' }],
      columns: ['Institution', 'Wave', 'State', 'Accepted', 'Required', 'Need correction', 'Overdue', 'Data quality'], rows: list.map(s => [s.inst.name, s.inst.waveLabel, K.INST_STATE[s.state][0], s.accepted, s.required, s.needsCorrection, s.overdue, s.dq == null ? '—' : s.dq + '%']),
      kind: 'donut', kinds: ['donut', 'bars', 'columns'], chart: { series: tally(list, s => K.INST_STATE[s.state][0]), label: 'Institutions by state' },
      sources: [src('Sector home', 'sector.html'), src('Monitor · matrix', 'khda-monitor.html?view=matrix')],
    });
  }

  function answer(q) {
    const s = q.toLowerCase();
    const inst = findInst(q) || scopeInst();
    const scoped = scopeInst();
    const p = per();
    const ds = findDataset(q);
    const i = inst || K.INSTITUTIONS[0];

    // corrections — why was a dataset returned?
    if (/why|reject|fail|correction|issue|wrong|return/.test(s) && (ds || inst)) {
      const subs = K.subsOf(i, p).filter(x => x.status === 'needs_correction' && (!ds || x.dataset === ds));
      if (!subs.length) {
        const r = overviewInst(i, p);
        return { html: `<p>${esc(i.short)} has no dataset needing correction${ds ? ' for ' + esc(K.titleOf(ds)) : ''} in ${esc(p.label)}. Here is the current position instead.</p>`, sources: r.sources, report: r };
      }
      if (ds || subs.length === 1) {
        const x = subs[0], total = x.rowsAccepted + x.rowsRejected;
        const rows = x.issues.slice().sort((a, b) => b.rows - a.rows).map(is => [is.id, is.rule, is.rows, pct(is.rows, total) + '%', is.fix]);
        return {
          html: `<p><strong>${esc(K.titleOf(x.dataset))}</strong> for ${esc(i.short)} was returned on ${esc(K.fmtDate(x.receivedAt))}: <strong>${N(x.rowsRejected)}</strong> of ${N(total)} rows failed ${plural(x.issues.length, 'rule')}. The biggest fix is <em>${esc(rows[0][4])}</em> (${N(rows[0][2])} rows).</p>`,
          sources: [src('Reconciliation report', `remediation.html?inst=${i.id}&sheet=${encodeURIComponent(x.dataset.sheet)}`), src('Rule configuration', 'configuration.html?sheet=' + encodeURIComponent(x.dataset.sheet)), src('Dictionary · ' + x.dataset.sheet, 'submissions.html?details=' + encodeURIComponent(x.dataset.sheet))],
          report: rep({
            title: `${K.titleOf(x.dataset)} · validation outcome`, subtitle: `${i.short} · ${p.label} · received ${K.fmtDate(x.receivedAt)} · version ${x.version}`, file: `${i.short}-${x.dataset.sheet}-reconciliation-${p.id}`,
            kpis: [{ label: 'Rows failed', value: N(x.rowsRejected), note: pct(x.rowsRejected, total) + '% of ' + N(total) }, { label: 'Rules triggered', value: x.issues.length, note: 'across the dataset' }, { label: 'Rows accepted', value: N(x.rowsAccepted), note: 'kept on resubmit' }, { label: 'Status', value: 'Returned', note: K.dueText(x) }],
            columns: ['Rule', 'Description', 'Rows failed', 'Share', 'Suggested fix'], rows,
            chart: { series: rows.map(r => ({ name: r[0] + ' · ' + r[1], value: r[2] })), label: 'Rows failed by rule' },
          }),
        };
      }
      const rows = subs.slice().sort((a, b) => b.rowsRejected - a.rowsRejected).map(x => { const top = x.issues.slice().sort((a, b) => b.rows - a.rows)[0]; return [K.titleOf(x.dataset), K.areaOf(x.dataset), K.fmtDate(x.receivedAt), x.rowsRejected, x.issues.length, top ? `${top.id} · ${top.rule}` : '—']; });
      const rowsR = subs.reduce((n, x) => n + x.rowsRejected, 0), rules = subs.reduce((n, x) => n + x.issues.length, 0);
      return {
        html: `<p><strong>${plural(subs.length, 'dataset')}</strong> need correction for ${esc(i.short)} in ${esc(p.label)} — ${N(rowsR)} rows across ${plural(rules, 'rule')}. Start with <strong>${esc(rows[0][0])}</strong> (${N(rows[0][3])} rows).</p>`,
        sources: [src('Reconciliation report', 'remediation.html?inst=' + i.id), src('Reconciliation workbench', 'reconciliation.html')],
        report: rep({
          title: `${i.short} · datasets needing correction`, subtitle: `${p.label} · ${plural(subs.length, 'dataset')} returned by validation`, file: `${i.short}-corrections-${p.id}`,
          kpis: [{ label: 'Datasets', value: subs.length, note: 'need correction' }, { label: 'Rows to fix', value: N(rowsR), note: 'failed validation' }, { label: 'Rules', value: rules, note: 'triggered' }, { label: 'Subject areas', value: tally(subs, x => K.areaOf(x.dataset)).length, note: 'affected' }],
          columns: ['Dataset', 'Subject area', 'Received', 'Rows failed', 'Rules', 'Top rule'], rows,
          chart: { series: rows.map(r => ({ name: r[0], value: r[3] })), label: 'Rows failed by dataset' },
        }),
      };
    }

    // deadlines
    if (/overdue|late|deadline|due/.test(s)) {
      if (scoped || inst) {
        const req = K.subsOf(i, p).filter(x => K.REQUIRED(x) && x.req.due);
        const list = req.filter(x => x.req.due < K.TODAY && !K.RECEIVED(x)).sort((a, b) => a.req.due - b.req.due);
        const soon = req.filter(x => !K.RECEIVED(x) && x.req.due >= K.TODAY && K.daysBetween(x.req.due, K.TODAY) <= 14);
        const rows = list.map(x => [K.titleOf(x.dataset), K.areaOf(x.dataset), K.frequencyOf(x.dataset), K.fmtDate(x.req.due), -K.daysBetween(x.req.due, K.TODAY), K.STATUS[x.status][0]]);
        return {
          html: `<p>${esc(i.short)} has <strong>${plural(list.length, 'overdue dataset')}</strong> in ${esc(p.label)}${list.length ? `; the oldest is <strong>${esc(rows[0][0])}</strong>, ${plural(rows[0][4], 'day')} past its due date` : ''}. ${plural(soon.length, 'dataset')} fall due in the next 14 days.</p>`,
          sources: [src('Requirement table · ' + p.label, scoped ? 'dashboard.html' : 'khda-monitor.html?inst=' + i.id), src('Submission status', 'status.html')],
          report: rep({
            title: `${i.short} · overdue datasets`, subtitle: `${p.label} · as of ${K.fmtDate(K.TODAY)}`, file: `${i.short}-overdue-${p.id}`,
            kpis: [{ label: 'Overdue', value: list.length, note: 'required datasets' }, { label: 'Longest overdue', value: list.length ? plural(rows[0][4], 'day') : '—', note: list.length ? trunc(rows[0][0], 28) : '' }, { label: 'Due in 14 days', value: soon.length, note: 'not yet received' }, { label: 'On time so far', value: pct(req.filter(x => K.RECEIVED(x) && x.receivedAt <= x.req.due).length, req.filter(K.RECEIVED).length) + '%', note: 'of received datasets' }],
            columns: ['Dataset', 'Subject area', 'Frequency', 'Due date', 'Days overdue', 'Status'], rows,
            chart: { series: tally(list, x => K.areaOf(x.dataset)), label: 'Overdue datasets by subject area' },
          }),
        };
      }
      const sec = K.sector(p.id).institutions.filter(x => x.overdue).sort((a, b) => b.overdue - a.overdue);
      return {
        html: `<p><strong>${sec.length}</strong> of ${K.INSTITUTIONS.length} institutions have overdue datasets in ${esc(p.label)}; the most overdue is <strong>${esc(sec[0].inst.short)}</strong> with ${sec[0].overdue}.</p>`,
        sources: [src('Sector home', 'sector.html'), src('Requirement table', 'khda-compliance.html')],
        report: rep({
          title: 'Sector · overdue datasets by institution', subtitle: `${p.label} · as of ${K.fmtDate(K.TODAY)}`, file: `sector-overdue-${p.id}`,
          kpis: [{ label: 'Institutions', value: sec.length, note: 'with overdue work' }, { label: 'Overdue datasets', value: sec.reduce((n, x) => n + x.overdue, 0), note: 'sector-wide' }, { label: 'Most overdue', value: sec[0].overdue, note: sec[0].inst.short }, { label: 'Blocked', value: sec.filter(x => x.state === 'blocked').length, note: 'institutions' }],
          columns: ['Institution', 'Wave', 'Overdue', 'Need correction', 'Not submitted', 'State'], rows: sec.map(x => [x.inst.name, x.inst.waveLabel, x.overdue, x.needsCorrection, x.notSubmitted, K.INST_STATE[x.state][0]]),
          chart: { series: sec.slice(0, 10).map(x => ({ name: x.inst.short, value: x.overdue })), label: 'Top 10 institutions by overdue datasets' },
        }),
      };
    }

    // ranking
    if (/rank|score|leaderboard|position|points/.test(s)) {
      const all = K.ranking(p.id), r = all.find(x => x.inst.id === i.id);
      const avg = Math.round(all.reduce((n, x) => n + x.total, 0) / all.length);
      const comp = [['Coverage', r.coverage, 400, r.detail.coverage], ['Data quality', r.dq, 250, r.detail.dq], ['Timeliness', r.timeliness, 200, r.detail.timeliness], ['Automation', r.automation, 150, r.detail.automation]];
      const t = K.trend(i), prev = t[Math.max(0, K.PERIODS.findIndex(x => x.id === p.id) - 1)];
      return {
        html: `<p><strong>${esc(i.short)}</strong> is ranked <strong>#${r.rank}</strong> of ${all.length} with <strong>${N(r.total)}</strong> / 1,000 points in ${esc(p.label)}${r.movement ? ` (${r.movement > 0 ? '▲ up' : '▼ down'} ${Math.abs(r.movement)} since ${esc(prev.period.label)})` : ''}. Sector average is ${N(avg)}; the biggest gap to full marks is ${esc(comp.slice().sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]))[0][0].toLowerCase())}.</p>`,
        sources: [src('Leaderboard · how scores are calculated', (scoped ? 'leaderboard.html' : 'khda-leaderboard.html') + '#how')],
        report: rep({
          title: `${i.short} · score breakdown`, subtitle: `${p.label} · rank #${r.rank} of ${all.length} · ${N(r.total)} / 1,000`, file: `${i.short}-score-${p.id}`,
          kpis: [{ label: 'Rank', value: '#' + r.rank, note: r.movement ? (r.movement > 0 ? '▲ ' : '▼ ') + Math.abs(r.movement) + ' vs last period' : 'unchanged' }, { label: 'Total', value: N(r.total), note: '/ 1,000 points' }, { label: 'Sector average', value: N(avg), note: r.total >= avg ? '+' + (r.total - avg) + ' above' : (r.total - avg) + ' below' }, { label: 'Leader', value: N(all[0].total), note: all[0].inst.short }],
          columns: ['Component', 'Points', 'Maximum', 'Share', 'How it was scored'], rows: comp.map(c => [c[0], c[1], c[2], pct(c[1], c[2]) + '%', c[3]]),
          kind: 'columns', kinds: ['columns', 'bars', 'donut', 'trend'], chart: { series: comp.map(c => ({ name: c[0], value: c[1] })), label: 'Points by component' },
          trend: { x: t.map(x => x.period.label), unit: '', lines: [{ name: 'Total score', values: t.map(x => x.total) }, { name: 'Sector average', values: K.PERIODS.map(pp => { const l = K.ranking(pp.id); return Math.round(l.reduce((n, x) => n + x.total, 0) / l.length); }) }] },
        }),
      };
    }

    // sector compliance
    if (/compliant|follow.?up|at risk|sector|how many institutions/.test(s) && !scoped) {
      const r = overviewSector(p), sec = K.sector(p.id);
      return { html: `<p>In ${esc(p.label)}: <strong>${sec.compliant}</strong> compliant, <strong>${sec.needsFollowUp}</strong> need follow-up (${sec.atRisk} at risk or blocked). ${N(sec.accepted)} of ${N(sec.required)} required datasets are accepted and ${N(sec.rowsRejected)} rows await correction.</p>`, sources: r.sources, report: r };
    }

    // email draft
    if (/email|draft|remind|follow up with/.test(s) && inst) {
      const sm = K.summary(inst, p);
      return {
        html: `<p>Draft for ${esc(inst.short)}:</p><blockquote class="bot__quote">Dear ${esc(inst.short)} team,<br>We are following up on your ${esc(p.label)} submissions: ${sm.notSubmitted} not submitted, ${sm.needsCorrection} need correction, ${sm.processing} processing. ${sm.accepted} of ${sm.required} datasets are accepted. Please review the attached report.<br>KHDA Data</blockquote>`,
        sources: [src('Open composer', 'khda-monitor.html?inst=' + inst.id + '&email=1'), src('Reconciliation report', 'remediation.html?inst=' + inst.id)],
        report: rep({
          title: `${inst.short} · attachment for the follow-up`, subtitle: `${p.label} · status of ${plural(sm.required, 'required dataset')}`, file: `${inst.short}-followup-${p.id}`,
          kpis: [{ label: 'Accepted', value: `${sm.accepted} / ${sm.required}`, note: pct(sm.accepted, sm.required) + '%' }, { label: 'Not submitted', value: sm.notSubmitted, note: `${sm.overdue} overdue` }, { label: 'Need correction', value: sm.needsCorrection, note: `${N(sm.rowsRejected)} rows` }, { label: 'Processing', value: sm.processing, note: 'in validation' }],
          columns: ['Dataset', 'Subject area', 'Status', 'Due date', 'Received', 'Rows failed'], rows: sm.subs.filter(K.REQUIRED).filter(x => !K.ACCEPTED(x)).map(x => [K.titleOf(x.dataset), K.areaOf(x.dataset), K.STATUS[x.status][0], K.fmtDate(x.req.due), K.fmtDate(x.receivedAt), x.rowsRejected]),
          kind: 'donut', kinds: ['donut', 'bars', 'columns'], chart: { series: tally(sm.subs.filter(K.REQUIRED), x => K.STATUS[x.status][0]), label: 'Required datasets by status' },
        }),
      };
    }

    // dictionary
    if (/dictionary|changed|2027|version/.test(s)) {
      const areas = tally(DATA, d => K.areaOf(d)).map(a => a.name);
      const rows = areas.map(a => { const l = DATA.filter(d => K.areaOf(d) === a); const f = l.flatMap(d => (S ? S.get(d.sheet).fields : d.fields)); return [a, l.length, f.length, f.filter(x => x.required).length, f.filter(x => x.listName || (x.opts && x.opts.length)).length]; });
      const fields = rows.reduce((n, r) => n + r[2], 0);
      return {
        html: `<p>The portal runs HEDB Data Dictionary <strong>2026</strong>: ${DATA.length} datasets and ${N(fields)} fields across ${plural(areas.length, 'subject area')}. Dictionary 2027 is a data change, not a code change — forms, templates, validation and this assistant regenerate from the new file, and both versions keep their effective periods.</p>`,
        sources: [src('Rule configuration · versions', 'configuration.html'), src('Submissions catalogue', 'submissions.html')],
        report: rep({
          title: 'Data Dictionary 2026 · coverage', subtitle: `${DATA.length} datasets · ${N(fields)} fields`, file: 'dictionary-2026-coverage',
          kpis: [{ label: 'Datasets', value: DATA.length, note: 'in scope' }, { label: 'Fields', value: N(fields), note: 'defined' }, { label: 'Mandatory', value: N(rows.reduce((n, r) => n + r[3], 0)), note: 'must be supplied' }, { label: 'Coded', value: N(rows.reduce((n, r) => n + r[4], 0)), note: 'match a reference list' }],
          columns: ['Subject area', 'Datasets', 'Fields', 'Mandatory', 'Coded'], rows,
          chart: { series: rows.map(r => ({ name: r[0], value: r[2] })), label: 'Fields by subject area' },
        }),
      };
    }

    // channels & credentials
    if (/api|credential|client id|secret|whitelist|allowlist|sandbox|channel|automation/.test(s)) {
      const subs = (scoped || inst ? K.subsOf(i, p) : K.INSTITUTIONS.flatMap(x => K.subsOf(x, p))).filter(x => K.REQUIRED(x) && K.RECEIVED(x));
      const api = subs.filter(x => x.channel === 'api').length;
      const areas = tally(subs, x => K.areaOf(x.dataset)).map(a => a.name);
      const rows = areas.map(a => { const l = subs.filter(x => K.areaOf(x.dataset) === a), n = l.filter(x => x.channel === 'api').length; return [a, n, l.length - n, l.length, pct(n, l.length) + '%']; });
      const who = scoped || inst ? i.short : 'the sector';
      return {
        html: `<p>Datasets reach KHDA either through the portal (form or Excel upload) or through the REST API with the institution's credentials — one client ID per environment (sandbox, production), a secret shown once, and an IP allowlist managed by KHDA IT. For ${esc(who)} in ${esc(p.label)}, <strong>${pct(api, subs.length)}%</strong> of received datasets arrived via the API (${N(api)} of ${N(subs.length)}).</p>`,
        sources: [src('REST API', 'api.html'), src('Credentials', 'credentials.html'), src('Onboarding board', 'onboarding.html')],
        report: rep({
          title: `${scoped || inst ? i.short : 'Sector'} · submission channels`, subtitle: `${p.label} · ${N(subs.length)} received datasets`, file: `${scoped || inst ? i.short : 'sector'}-channels-${p.id}`,
          kpis: [{ label: 'Via API', value: N(api), note: pct(api, subs.length) + '% of received' }, { label: 'Via portal', value: N(subs.length - api), note: 'form or Excel upload' }, { label: 'Automation points', value: scoped || inst ? K.score(i, p).automation : '—', note: '/ 150 on the leaderboard' }, { label: 'Subject areas', value: areas.length, note: 'with submissions' }],
          columns: ['Subject area', 'Via API', 'Via portal', 'Received', 'API share'], rows,
          kind: 'donut', kinds: ['donut', 'bars', 'columns'], chart: { series: [{ name: 'REST API', value: api }, { name: 'Portal', value: subs.length - api }], label: 'Received datasets by channel' },
        }),
      };
    }

    // rules for a dataset
    if (/rule|mandatory|validation|field/.test(s) && ds) {
      const sc = S ? S.get(ds.sheet) : { fields: ds.fields, pk: [] };
      const mand = sc.fields.filter(f => f.required), coded = sc.fields.filter(f => f.listName || (f.opts && f.opts.length));
      const pk = sc.pk.map(k => (sc.fields.find(f => f.key === k) || {}).label || k);
      const rows = sc.fields.map(f => [f.label, f.type || f.control || '—', f.required ? 'Yes' : 'No', f.listName || (f.opts && f.opts.length ? `${f.opts.length} values` : '—'), pk.includes(f.label) ? 'Yes' : '']);
      return {
        html: `<p><strong>${esc(K.titleOf(ds))}</strong> has ${sc.fields.length} fields: <strong>${mand.length}</strong> mandatory, <strong>${coded.length}</strong> coded (must match a reference list)${pk.length ? `, primary key ${esc(pk.join(' + '))}` : ''}. The same rules apply in the form, the Excel template, the API and the reconciliation report.</p>`,
        sources: [src('Rule configuration · ' + ds.sheet, 'configuration.html?sheet=' + encodeURIComponent(ds.sheet)), src('Specification', 'submissions.html?details=' + encodeURIComponent(ds.sheet))],
        report: rep({
          title: `${K.titleOf(ds)} · field rules`, subtitle: `${K.codeOf(ds)} · ${K.frequencyOf(ds)} · ${K.areaOf(ds)}`, file: `${ds.sheet}-rules`,
          kpis: [{ label: 'Fields', value: sc.fields.length, note: 'in the dictionary' }, { label: 'Mandatory', value: mand.length, note: pct(mand.length, sc.fields.length) + '% of fields' }, { label: 'Coded', value: coded.length, note: 'reference-list checks' }, { label: 'Primary key', value: pk.length || '—', note: pk.length ? 'field' + (pk.length === 1 ? '' : 's') : 'not declared' }],
          columns: ['Field', 'Type', 'Mandatory', 'Coded list', 'Primary key'], rows,
          kind: 'donut', kinds: ['donut', 'bars', 'columns'], chart: { series: [{ name: 'Mandatory & coded', value: mand.filter(f => coded.includes(f)).length }, { name: 'Mandatory only', value: mand.filter(f => !coded.includes(f)).length }, { name: 'Coded only', value: coded.filter(f => !mand.includes(f)).length }, { name: 'Optional free text', value: sc.fields.filter(f => !mand.includes(f) && !coded.includes(f)).length }], label: 'Fields by rule type' },
        }),
      };
    }

    // one dataset — its journey across periods
    if (ds) {
      const hist = K.PERIODS.map(pp => K.subsOf(i, pp).find(y => y.dataset === ds));
      const x = hist[K.PERIODS.findIndex(pp => pp.id === p.id)];
      const rows = hist.map(h => [h.period.label, K.STATUS[h.status][0], K.fmtDate(h.req.due), K.fmtDate(h.receivedAt), h.channel === 'api' ? 'API' : 'Portal', h.rowsAccepted, h.rowsRejected]);
      return {
        html: `<p><strong>${esc(K.titleOf(ds))}</strong> (${esc(K.codeOf(ds))}) — ${esc(K.frequencyOf(ds))}, ${ds.fields.length} fields, subject area ${esc(K.areaOf(ds))}. For ${esc(i.short)} in ${esc(p.label)}: <strong>${K.STATUS[x.status][0]}</strong> · ${esc(K.dueText(x))} · ${esc(K.freshness(x))}.</p>`,
        sources: [src('Specification', 'submissions.html?details=' + encodeURIComponent(ds.sheet)), src('Journey', (scoped ? 'submissions.html?details=' : 'khda-monitor.html?inst=' + i.id + '&sheet=') + encodeURIComponent(ds.sheet))],
        report: rep({
          title: `${K.titleOf(ds)} · ${i.short} across periods`, subtitle: `${K.codeOf(ds)} · ${K.frequencyOf(ds)} · ${hist.filter(K.ACCEPTED).length} of ${hist.filter(K.REQUIRED).length} required periods accepted`, file: `${i.short}-${ds.sheet}-history`,
          kpis: [{ label: 'Current status', value: K.STATUS[x.status][0], note: K.dueText(x) }, { label: 'Rows accepted', value: N(x.rowsAccepted), note: p.label }, { label: 'Rows failed', value: N(x.rowsRejected), note: plural(x.issues.length, 'rule') }, { label: 'Channel', value: x.channel === 'api' ? 'API' : 'Portal', note: x.receivedAt ? 'received ' + K.fmtDate(x.receivedAt) : 'no receipt yet' }],
          columns: ['Period', 'Status', 'Due date', 'Received', 'Channel', 'Rows accepted', 'Rows failed'], rows,
          kind: 'columns', kinds: ['columns', 'bars', 'trend'], chart: { series: hist.map(h => ({ name: h.period.label, value: h.rowsAccepted })), label: 'Rows accepted by period' },
          trend: { x: hist.map(h => h.period.label), unit: '', lines: [{ name: 'Rows accepted', values: hist.map(h => h.rowsAccepted) }, { name: 'Rows failed', values: hist.map(h => h.rowsRejected) }] },
        }),
      };
    }

    // progress over time
    if (/trend|progress|history|over time|improv|compare/.test(s)) {
      const h = K.history(i), t = K.trend(i);
      const rows = h.map((x, k) => [x.period.label, x.required, x.accepted, pct(x.accepted, x.required) + '%', x.needsCorrection, x.overdue, x.dq == null ? '—' : x.dq + '%', t[k].total, '#' + t[k].rank]);
      const first = h[0], last = h[h.length - 1], delta = pct(last.accepted, last.required) - pct(first.accepted, first.required);
      const rec = K.recurringCorrections(i);
      return {
        html: `<p>Across ${h.length} reporting periods ${esc(i.short)} moved from <strong>${pct(first.accepted, first.required)}%</strong> to <strong>${pct(last.accepted, last.required)}%</strong> of required datasets accepted, and from rank #${t[0].rank} to #${t[t.length - 1].rank}. Recurring corrections: ${rec.slice(0, 3).map(x => esc(x.title)).join(', ') || 'none'}.</p>`,
        sources: [src('Compliance history', scoped ? 'compliance.html' : 'khda-compliance.html?inst=' + i.id)],
        report: rep({
          title: `${i.short} · progress across periods`, subtitle: `${first.period.label} → ${last.period.label}`, file: `${i.short}-progress`,
          kpis: [{ label: 'Coverage now', value: pct(last.accepted, last.required) + '%', note: (delta >= 0 ? '+' : '') + delta + ' pts since ' + first.period.label }, { label: 'Rank now', value: '#' + t[t.length - 1].rank, note: 'was #' + t[0].rank }, { label: 'Best period', value: h.slice().sort((a, b) => pct(b.accepted, b.required) - pct(a.accepted, a.required))[0].period.label, note: 'by coverage' }, { label: 'Recurring', value: rec.length, note: 'datasets returned twice+' }],
          columns: ['Period', 'Required', 'Accepted', 'Coverage', 'Need correction', 'Overdue', 'Data quality', 'Score', 'Rank'], rows,
          kind: 'trend', kinds: ['trend', 'columns', 'bars'], chart: { series: h.map(x => ({ name: x.period.label, value: x.accepted })), label: 'Accepted datasets by period' },
          trend: { x: h.map(x => x.period.label), unit: '%', lines: [{ name: 'Coverage %', values: h.map(x => pct(x.accepted, x.required)) }, { name: 'Data quality %', values: h.map(x => x.dq || 0) }] },
        }),
      };
    }

    // an institution (KHDA staff)
    if (inst && !scoped) {
      const sm = K.summary(inst, p), r = overviewInst(inst, p);
      return { html: `<p><strong>${esc(inst.name)}</strong> (${esc(inst.waveLabel)}, ${esc(inst.location)}) — <strong>${K.INST_STATE[sm.state][0]}</strong>: ${sm.accepted} of ${sm.required} accepted, ${sm.needsCorrection} need correction, ${sm.overdue} overdue, data quality ${sm.dq == null ? '—' : sm.dq + '%'}. Owner ${esc(inst.owner)} · liaison ${esc(inst.liaison)}.</p>`, sources: [src('Institution monitor', 'khda-monitor.html?inst=' + inst.id), src('Compliance history', 'khda-compliance.html?inst=' + inst.id)], report: r };
    }

    // anything else — the current position for the scope
    const r = scoped ? overviewInst(i, p) : overviewSector(p);
    return { html: `<p>Here is the current position for ${scoped ? esc(i.short) : 'the sector'} in ${esc(p.label)}. Ask about a dataset, a deadline, a correction, a ranking${scoped ? '' : ' or an institution'} for a focused report.</p>`, sources: r.sources, report: r };
  }

  function suggestions() {
    return scopeInst()
      ? ['Which datasets are overdue?', 'Why was Graduates rejected?', 'What is my rank?', 'Show my progress over time', 'Rules for Employee - Basic Details', 'How much do we send via the API?']
      : ['Which institutions need follow-up?', 'Which datasets are overdue for BITS?', 'Why was Graduates rejected for AUE?', 'Draft an email to Curtin', 'What is the rank of Hult?', 'Progress of AUE over time'];
  }

  // ---------- graphs (inline SVG on DS tokens; every mark carries a tooltip) ----------
  const color = (k, s) => s.color || COLORS[k % COLORS.length];
  function svgBars(ch) {
    const list = ch.series.slice(0, 12), max = Math.max(1, ...list.map(s => s.value)), W = 600, lw = 190, rh = 30, H = list.length * rh + 4;
    return `<svg class="bot-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ch.label)}">${list.map((s, k) => { const y = k * rh, w = Math.max(3, Math.round((W - lw - 72) * s.value / max)); return `<g class="bot-chart__mark"><title>${esc(s.name)}: ${N(s.value)}${ch.unit || ''}</title><text x="${lw - 10}" y="${y + 20}" text-anchor="end" class="bot-chart__label">${esc(trunc(s.name, 26))}</text><rect x="${lw}" y="${y + 6}" width="${w}" height="18" rx="4" fill="${color(k, s)}"/><text x="${lw + w + 8}" y="${y + 20}" class="bot-chart__value">${N(s.value)}${ch.unit || ''}</text></g>`; }).join('')}</svg>`;
  }
  function svgColumns(ch) {
    const list = ch.series.slice(0, 12), W = 600, H = 240, L = 44, Rr = 12, T = 28, B = 48, max = Math.max(1, ...list.map(s => s.value));
    const cw = (W - L - Rr) / list.length, bw = Math.min(56, cw * 0.62), ih = H - T - B;
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => { const y = T + ih - ih * f; return `<line x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}" class="bot-chart__grid"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" class="bot-chart__tick">${N(Math.round(max * f))}</text>`; }).join('');
    return `<svg class="bot-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ch.label)}">${grid}${list.map((s, k) => { const h = Math.max(2, Math.round(ih * s.value / max)), x = L + k * cw + (cw - bw) / 2, y = T + ih - h; return `<g class="bot-chart__mark"><title>${esc(s.name)}: ${N(s.value)}${ch.unit || ''}</title><rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${color(k, s)}"/><text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" class="bot-chart__value">${N(s.value)}${ch.unit || ''}</text><text x="${x + bw / 2}" y="${H - B + 18}" text-anchor="middle" class="bot-chart__label">${esc(trunc(s.name, Math.max(6, Math.floor(cw / 7))))}</text></g>`; }).join('')}</svg>`;
  }
  function svgDonut(ch) {
    const list = ch.series.filter(s => s.value > 0), total = list.reduce((n, s) => n + s.value, 0) || 1, r = 64, c = 2 * Math.PI * r; let acc = 0;
    const arcs = list.map((s, k) => { const len = c * s.value / total, off = c * acc / total; acc += s.value; return `<circle class="bot-chart__mark" r="${r}" cx="90" cy="90" fill="none" stroke="${color(k, s)}" stroke-width="24" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"><title>${esc(s.name)}: ${N(s.value)} (${pct(s.value, total)}%)</title></circle>`; }).join('');
    return `<div class="bot-donut"><svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="${esc(ch.label)}">${arcs}<text x="90" y="86" text-anchor="middle" class="bot-donut__total">${N(total)}</text><text x="90" y="106" text-anchor="middle" class="bot-donut__sub">total</text></svg>
      <div class="legend legend--wrap bot-donut__legend">${list.map((s, k) => `<span class="legend__item"><span class="legend__dot" style="background:${color(k, s)}"></span><span class="legend__label">${esc(s.name)}</span><span class="legend__value">${N(s.value)}<small class="muted"> · ${pct(s.value, total)}%</small></span></span>`).join('')}</div></div>`;
  }
  function svgTrend(tr) {
    const W = 600, H = 240, L = 44, Rr = 20, T = 20, B = 40, ih = H - T - B, iw = W - L - Rr;
    const max = Math.max(1, ...tr.lines.flatMap(l => l.values)) * (tr.unit === '%' ? 1 : 1.1), n = tr.x.length;
    const X = k => L + (n === 1 ? iw / 2 : iw * k / (n - 1)), Y = v => T + ih - ih * v / max;
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => `<line x1="${L}" x2="${W - Rr}" y1="${Y(max * f)}" y2="${Y(max * f)}" class="bot-chart__grid"/><text x="${L - 8}" y="${Y(max * f) + 4}" text-anchor="end" class="bot-chart__tick">${N(Math.round(max * f))}${tr.unit || ''}</text>`).join('');
    const lines = tr.lines.map((l, k) => { const pts = l.values.map((v, j) => [X(j), Y(v)]); const d = pts.map((p, j) => (j ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' '); return `<g class="bot-chart__line"><path d="${d} L${pts[pts.length - 1][0]} ${T + ih} L${pts[0][0]} ${T + ih} Z" fill="${color(k, l)}" opacity="0.08"/><path d="${d}" fill="none" stroke="${color(k, l)}" stroke-width="2.5" stroke-linejoin="round"/>${pts.map((p, j) => `<g class="bot-chart__mark"><title>${esc(l.name)} · ${esc(tr.x[j])}: ${N(l.values[j])}${tr.unit || ''}</title><circle cx="${p[0]}" cy="${p[1]}" r="5" fill="var(--surface)" stroke="${color(k, l)}" stroke-width="2.5"/></g>`).join('')}</g>`; }).join('');
    const xl = tr.x.map((x, j) => `<text x="${X(j)}" y="${H - B + 20}" text-anchor="middle" class="bot-chart__label">${esc(x)}</text>`).join('');
    return `<svg class="bot-chart" viewBox="0 0 ${W} ${H}" role="img">${grid}${xl}${lines}</svg><div class="legend legend--wrap">${tr.lines.map((l, k) => `<span class="legend__item"><span class="legend__dot" style="background:${color(k, l)}"></span><span class="legend__label">${esc(l.name)}</span></span>`).join('')}</div>`;
  }
  function graph(r, kind) {
    if (kind === 'trend' && r.trend) return svgTrend(r.trend);
    if (kind === 'donut') return svgDonut(r.chart);
    if (kind === 'columns') return svgColumns(r.chart);
    return svgBars(r.chart);
  }
  function table(r) {
    const num = k => typeof (r.rows[0] || [])[k] === 'number';
    return `<div class="table-wrap bot-table"><table class="data-table data-table--fit"><thead><tr>${r.columns.map((c, k) => `<th${num(k) ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.rows.length ? r.rows.map(row => `<tr>${row.map(c => `<td${typeof c === 'number' ? ' class="num"' : ''}>${esc(N(c))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${r.columns.length}" class="muted">No rows for this report.</td></tr>`}</tbody></table></div>`;
  }

  // ---------- Excel ----------
  function ensureXlsx() {
    if (window.KHDA_XLSX) return Promise.resolve(window.KHDA_XLSX);
    return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'js/template.js'; sc.onload = () => (window.KHDA_XLSX ? res(window.KHDA_XLSX) : rej()); sc.onerror = rej; document.head.append(sc); });
  }
  function saveBlob(blob, filename) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function workbook(m) {
    const r = m.report, scoped = scopeInst();
    const meta = [['Report', r.title], ['Scope', r.subtitle], ['Prepared for', scoped ? scoped.name : 'KHDA · ' + R.role().label], ['Reporting period', per().label], ['Question', m.question], ['Generated', new Date().toLocaleString('en-GB')], [], ['Key figure', 'Value', 'Note'], ...r.kpis.map(k => [k.label, k.value, k.note || ''])];
    const sheets = [
      { name: 'Report', rows: [r.columns, ...r.rows], opts: { freeze: true, cols: r.columns.map((c, k) => Math.min(60, Math.max(c.length + 2, ...r.rows.map(row => String(row[k] == null ? '' : row[k]).length + 2)))) } },
      { name: 'Summary', rows: meta, opts: { cols: [22, 48, 32] } },
      { name: 'Graph data', rows: [['Series', 'Value'], ...r.chart.series.map(s => [s.name, s.value])], opts: { cols: [40, 14] } },
    ];
    if (r.trend) sheets.push({ name: 'Trend', rows: [['Period', ...r.trend.lines.map(l => l.name)], ...r.trend.x.map((x, j) => [x, ...r.trend.lines.map(l => l.values[j])])], opts: { cols: [16, ...r.trend.lines.map(() => 20)] } });
    return sheets;
  }
  function download(m) {
    const name = (m.report.file || 'assistant-report').replace(/[^\w.-]+/g, '-');
    ensureXlsx().then(X => { saveBlob(X.build(workbook(m), []), name + '.xlsx'); toast('Excel report ready', name + '.xlsx · ' + plural(m.report.rows.length, 'row') + ', key figures and graph data'); })
      .catch(() => { const q = v => (/[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v)); saveBlob(new Blob([[m.report.columns, ...m.report.rows].map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }), name + '.csv'); toast('Report ready', name + '.csv'); });
  }
  function toast(title, text) { if (window.khdaToast) window.khdaToast('success', title, text); }

  // ---------- render ----------
  function reportHtml(m, idx) {
    const r = m.report, kind = m.kind || r.kind, view = m.view || 'graph';
    const kinds = (r.kinds || ['bars']).filter(k => k !== 'trend' || r.trend);
    return `<section class="bot-report" data-i="${idx}">
      <div class="bot-report__head"><div><div class="bot-report__title"><span class="bot-report__icon">${ICON.report}</span>${esc(r.title)}</div><div class="bot-report__sub">${esc(r.subtitle)}</div></div><span class="chip chip--outline">${plural(r.rows.length, 'row')}</span></div>
      <div class="bot-report__kpis">${r.kpis.map((k, n) => `<div class="bot-kpi" style="--kpi:${COLORS[n % COLORS.length]}"><div class="bot-kpi__label">${esc(k.label)}</div><div class="bot-kpi__value">${esc(k.value)}</div>${k.note ? `<div class="bot-kpi__note">${esc(k.note)}</div>` : ''}</div>`).join('')}</div>
      <div class="bot-report__tools">
        <div class="segmented segmented--sm" role="group" aria-label="View"><button type="button" data-view="graph" aria-pressed="${view === 'graph'}">Graph view</button><button type="button" data-view="table" aria-pressed="${view === 'table'}">Table</button></div>
        ${view === 'graph' ? `<div class="segmented segmented--sm" role="group" aria-label="Graph type">${kinds.map(k => `<button type="button" data-kind="${k}" aria-pressed="${k === kind}">${KINDS[k]}</button>`).join('')}</div>` : ''}
      </div>
      <div class="bot-report__view">${view === 'graph' ? `<div class="bot-report__caption">${esc(kind === 'trend' && r.trend ? 'Trend across reporting periods' : r.chart.label || '')}</div>${graph(r, kind)}` : table(r)}</div>
      <div class="bot-report__foot"><button type="button" class="btn btn--primary btn--sm" data-xlsx>${ICON.xlsx}Download Excel</button>${m.sources && m.sources.length ? `<div class="bot__sources">Sources: ${m.sources.join(' · ')}</div>` : ''}</div>
    </section>`;
  }
  const ICON = {
    spark: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
    report: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
    xlsx: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };
  const stamp = d => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  function msgHtml(m, idx) {
    if (m.who === 'user') return `<div class="bot-row bot-row--user"><div class="bot__msg bot__msg--user">${esc(m.text)}</div><div class="bot-row__time">${stamp(m.at)}</div></div>`;
    if (m.who === 'typing') return `<div class="bot-row bot-row--bot"><span class="bot-avatar bot-avatar--sm">${ICON.spark}</span><div class="bot__msg bot__msg--bot bot__msg--typing" aria-label="Preparing your report"><span></span><span></span><span></span></div></div>`;
    return `<div class="bot-row bot-row--bot"><span class="bot-avatar bot-avatar--sm">${ICON.spark}</span><div class="bot-row__body"><div class="bot__msg bot__msg--bot">${m.html}${m.report ? reportHtml(m, idx) : ''}</div><div class="bot-row__time">${stamp(m.at)} · Report ready</div></div></div>`;
  }
  function welcome(scoped) {
    const feats = [['Report', 'Key figures and the full table behind them'], ['Graph view', 'Bars, columns, donut or trend — switch any time'], ['Excel', 'One click downloads the workbook']];
    return `<div class="bot-welcome">
      <span class="bot-avatar bot-avatar--lg">${ICON.spark}</span>
      <div class="bot-feats">${feats.map(([t, d]) => `<div class="bot-feat"><div class="bot-feat__t">${t}</div><div class="bot-feat__d">${d}</div></div>`).join('')}</div>
      <div class="bot-suggest">${suggestions().map(q => `<button type="button" class="bot-suggest__item" data-q="${esc(q)}"><span>${esc(q)}</span>${ICON.arrow}</button>`).join('')}</div>
    </div>`;
  }
  function render() {
    let host = document.getElementById(HOST_ID);
    if (!host) { host = document.createElement('div'); host.id = HOST_ID; document.body.append(host); }
    const scoped = scopeInst();
    document.body.classList.toggle('is-sheeting', open);
    host.innerHTML = `<div class="modal-backdrop sheet-backdrop bot-backdrop" id="botBackdrop"${open ? '' : ' hidden'}>
      <aside class="sheet bot-sheet" role="dialog" aria-modal="true" aria-label="Assistant">
        <div class="bot-sheet__top">
          <span class="bot-avatar">${ICON.spark}</span>
          <div class="bot-sheet__titles"><h2 class="bot-sheet__title">Assistant</h2></div>
          <button class="icon-btn sheet__close" type="button" id="botClose" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="sheet__body bot__log" id="botLog">${log.length ? log.map(msgHtml).join('') : welcome(scoped)}</div>
        ${log.length ? `<div class="bot__chips">${suggestions().map(q => `<button type="button" class="chip chip--outline" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
        <form class="bot-composer" id="botForm"><div class="bot-composer__field"><input id="botInput" placeholder="Ask anything about your data…" autocomplete="off" aria-label="Ask the assistant"></div><button class="bot-composer__send" type="submit" aria-label="Ask">${ICON.send}</button></form>
      </aside>
    </div>`;
    if (open) {
      host.querySelector('#botClose').addEventListener('click', toggle);
      host.querySelector('#botBackdrop').addEventListener('click', e => { if (e.target.id === 'botBackdrop') toggle(); });
      host.querySelector('#botForm').addEventListener('submit', e => { e.preventDefault(); ask(host.querySelector('#botInput').value); });
      host.querySelector('.bot-sheet').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });
      host.querySelector('#botLog').addEventListener('click', e => {
        const sec = e.target.closest('.bot-report'); if (!sec) return;
        const m = log[+sec.dataset.i], v = e.target.closest('[data-view]'), k = e.target.closest('[data-kind]');
        if (e.target.closest('[data-xlsx]')) { download(m); return; }
        if (v) m.view = v.dataset.view; else if (k) m.kind = k.dataset.kind; else return;
        sec.outerHTML = reportHtml(m, +sec.dataset.i);
      });
      const l = host.querySelector('#botLog'); l.scrollTop = l.scrollHeight;
      host.querySelector('#botInput').focus();
    }
  }
  let pending = null;
  function ask(q) {
    q = (q || '').trim(); if (!q || pending) return;
    log.push({ who: 'user', text: q, at: new Date() });
    log.push({ who: 'typing' });
    render();
    const a = answer(q);
    pending = setTimeout(() => { pending = null; log.pop(); log.push({ who: 'bot', question: q, html: a.html, sources: a.sources, report: a.report, at: new Date() }); render(); }, 650);
  }
  function toggle() { open = !open; render(); const b = document.getElementById('chatbotToggle'); if (b) b.setAttribute('aria-expanded', String(open)); }

  document.addEventListener('click', e => { if (e.target.closest('#chatbotToggle')) toggle(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(); });
  render();
  window.KHDA_BOT = { ask, toggle, answer };
})();
