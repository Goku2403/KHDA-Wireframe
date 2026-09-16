/* KHDA — API integration telemetry.

   There is no backend behind this wireframe, so the picture of which institution is
   calling the API, and how cleanly the data lands, is *derived* rather than random: a
   seeded generator keyed on the institution code. Every reload, every browser and every
   reviewer therefore sees the same 37 institutions with the same numbers, which is what
   makes the screen reviewable at all — a Math.random() page cannot be discussed.

   Nothing here is hand-listed per institution or per dataset. The roster comes from the
   dictionary's Institutional Codes list and the 46-row ledger comes from KHDA_DATASETS,
   so both follow the metadata the rest of the portal is built on. */
(function () {
  'use strict';

  const DATASETS = window.KHDA_DATASETS || [];
  const LISTS = window.KHDA_LISTS || {};

  const ROSTER_SIZE = 37;              // Dubai HEIs in scope (planning brief, §4)
  const WAVE_SIZES = [7, 14, 13, 3];   // Pilot Wave 1 … Wave 4 — sums to 37
  const WEEKS = 12;                    // the call-volume window the chart draws

  /* ROSTER_NOTE — the dictionary publishes 136 CAA-licensed institutions and does not mark
     which of them are the 37 Dubai HEIs in scope for Release 1. Until the real roster
     arrives we derive a stable stand-in: names carrying a Dubai-linked keyword first, then
     the remainder in code order, cut at 37. The codes and names themselves are real. */
  const DUBAI_HINT = /dubai|zayed|hamdan|rashid|emirates|heriot|middlesex|manipal|amity|murdoch|wollongong|birmingham|hult|synergy|islamic azad|canadian|british|american college/i;

  // A submitted row is one that reached KHDA at all; only "needs correction" is an error.
  const STATUSES = ['accepted', 'processing', 'needs-correction', 'non-submitted'];

  // Realistic integration failures, held as i18n keys so the drawer can render them in
  // either language rather than leaking an English literal out of a data module.
  const ERRORS = [
    'api.err.schema', 'api.err.reference', 'api.err.pk', 'api.err.mandatory',
    'api.err.period', 'api.err.auth', 'api.err.type', 'api.err.encoding',
  ];

  // ---------- deterministic generator ----------

  // mulberry32: small, fast, and stable across engines, which matters because the tests
  // assert the same numbers Node sees are the ones the browser draws.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  // ---------- roster ----------

  function rosterNames() {
    const codes = LISTS['Institutional Codes'] || [];
    const rows = codes
      .map(([code, name]) => ({ code: Number(code), name: String(name) }))
      .filter(x => Number.isFinite(x.code) && x.name)
      .sort((a, b) => a.code - b.code);

    const hinted = rows.filter(x => DUBAI_HINT.test(x.name));
    const rest = rows.filter(x => !DUBAI_HINT.test(x.name));
    return hinted.concat(rest).slice(0, ROSTER_SIZE).sort((a, b) => a.code - b.code);
  }

  // Wave 1 is the pilot, so the earliest codes carry it and the waves fill in order.
  function waveOf(index) {
    let seen = 0;
    for (let w = 0; w < WAVE_SIZES.length; w++) {
      seen += WAVE_SIZES[w];
      if (index < seen) return w + 1;
    }
    return WAVE_SIZES.length;
  }

  // How far along a wave is expected to be. The pilot is nearly all live; the last wave has
  // barely started — which is the whole point of the page, so it is modelled, not random.
  const WAVE_READINESS = { 1: 0.86, 2: 0.62, 3: 0.42, 4: 0.12 };

  // Status mix per tier. Each row is [accepted, processing, needs-correction] and whatever
  // is left over is non-submitted, so the four always sum to 1.
  const MIX = {
    active: [0.62, 0.10, 0.12],
    dormant: [0.38, 0.05, 0.17],
    portal: [0.22, 0.03, 0.10],
    none: [0, 0, 0],
  };

  function statusFor(r, mix) {
    const roll = r();
    if (roll < mix[0]) return 'accepted';
    if (roll < mix[0] + mix[1]) return 'processing';
    if (roll < mix[0] + mix[1] + mix[2]) return 'needs-correction';
    return 'non-submitted';
  }

  function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'hei';
  }

  function build(row, index) {
    // Hashing the code spreads adjacent codes to unrelated streams, so institutions 14 and
    // 15 do not come out as near-twins.
    const r = rng(Math.imul(row.code + 1, 2654435761));
    const wave = waveOf(index);

    const roll = r();
    const ready = WAVE_READINESS[wave];
    const tier = roll < ready ? 'active' : roll < ready + 0.22 ? 'dormant' : 'not-integrated';
    const channel = tier === 'not-integrated' ? (r() < 0.55 ? 'portal' : 'none') : 'api';

    const mix = tier === 'active' ? MIX.active
      : tier === 'dormant' ? MIX.dormant
        : channel === 'portal' ? MIX.portal : MIX.none;

    // Days rather than timestamps: the offset is what the seed fixes, so a score computed
    // today and a score computed next week stay comparable instead of decaying apart.
    const lastCallDays = tier === 'active' ? int(r, 0, 6)
      : tier === 'dormant' ? int(r, 21, 60)
        : null;

    const ledger = DATASETS.map(d => {
      const status = statusFor(r, mix);
      const sent = status !== 'non-submitted';
      const errorCount = status === 'needs-correction' ? int(r, 1, 38) : 0;
      return {
        sheet: d.sheet,
        title: d.title,
        group: d.group,
        status,
        channel: sent ? channel : null,
        lastDays: sent ? int(r, 0, 45) : null,
        errorCount,
        topError: status === 'needs-correction' ? pick(r, ERRORS) : null,
      };
    });

    const accepted = ledger.filter(x => x.status === 'accepted').length;

    // Call volume tracks how much the institution actually files, so the chart and the
    // table cannot tell different stories. A dormant institution's traffic stops partway.
    const stop = tier === 'dormant' ? int(r, 3, 8) : WEEKS;
    const weekly = Array.from({ length: WEEKS }, (_, w) => {
      if (tier === 'not-integrated' || w >= stop) return 0;
      const base = 6 + accepted * 2.4;
      return Math.max(0, Math.round(base * (0.55 + r() * 0.9)));
    });

    return {
      code: row.code,
      name: row.name,
      wave,
      tier,
      channel,
      contact: { name: 'Data Office', email: 'data.office@' + slug(row.name) + '.ac.ae' },
      lastCallDays,
      callsThisCycle: weekly.reduce((n, x) => n + x, 0),
      weekly,
      ledger,
    };
  }

  const roster = rosterNames().map(build);
  const byCode = new Map(roster.map(i => [i.code, i]));

  // ---------- rating ----------

  const COVERAGE_MAX = 50, ACCURACY_MAX = 30, FRESHNESS_MAX = 20;
  const FRESH_FULL = 7, FRESH_ZERO = 60;   // days

  /* The competitor's readiness score divides by *what was submitted*, so an institution
     that sent nine datasets cleanly outranked one that sent forty. Here coverage always
     divides by the 46 required, and accuracy is zero — not full marks — when nothing was
     attempted, so silence can never look like perfection. */
  function score(inst) {
    const total = inst.ledger.length || 1;
    const accepted = inst.ledger.filter(x => x.status === 'accepted').length;
    const errored = inst.ledger.filter(x => x.status === 'needs-correction').length;
    const attempted = inst.ledger.filter(x => x.status !== 'non-submitted').length;

    const coverage = COVERAGE_MAX * (accepted / total);
    const accuracy = attempted ? ACCURACY_MAX * (1 - errored / attempted) : 0;

    const d = inst.lastCallDays;
    const freshness = d == null ? 0
      : d <= FRESH_FULL ? FRESHNESS_MAX
        : d >= FRESH_ZERO ? 0
          : FRESHNESS_MAX * (1 - (d - FRESH_FULL) / (FRESH_ZERO - FRESH_FULL));

    const raw = coverage + accuracy + freshness;
    const rounded = Math.max(0, Math.min(100, Math.round(raw)));
    return {
      total: rounded,
      stars: Math.round(rounded / 10) / 2,   // 0–5 in half-star steps
      coverage: Math.round(coverage * 10) / 10,
      accuracy: Math.round(accuracy * 10) / 10,
      freshness: Math.round(freshness * 10) / 10,
      accepted, errored, attempted, required: total,
    };
  }

  const consuming = inst => inst.tier === 'active' || inst.tier === 'dormant';

  // ---------- aggregates ----------

  function summary() {
    const counts = { accepted: 0, processing: 0, 'needs-correction': 0, 'non-submitted': 0 };
    let errorRows = 0, scoreSum = 0;

    for (const inst of roster) {
      for (const row of inst.ledger) counts[row.status]++;
      errorRows += inst.ledger.filter(x => x.status === 'needs-correction').length;
      scoreSum += score(inst).total;
    }

    const tiers = { active: 0, dormant: 0, 'not-integrated': 0 };
    for (const inst of roster) tiers[inst.tier]++;

    return {
      institutions: roster.length,
      datasets: DATASETS.length,
      rows: roster.length * DATASETS.length,
      tiers,
      consuming: tiers.active + tiers.dormant,
      notConsuming: tiers['not-integrated'],
      counts,
      errorRows,
      avgScore: roster.length ? Math.round(scoreSum / roster.length) : 0,
    };
  }

  // Consuming vs total for each onboarding wave, for the adoption chart.
  function byWave() {
    return WAVE_SIZES.map((_, i) => {
      const w = i + 1;
      const members = roster.filter(x => x.wave === w);
      return { wave: w, total: members.length, consuming: members.filter(consuming).length };
    });
  }

  // Calls per week across the whole sector, oldest week first.
  function volume() {
    return Array.from({ length: WEEKS }, (_, w) =>
      roster.reduce((n, inst) => n + inst.weekly[w], 0));
  }

  window.KHDA_API = {
    roster,
    get: code => byCode.get(Number(code)) || null,
    score,
    summary,
    byWave,
    volume,
    consuming,
    STATUSES,
    ERRORS,
    WEEKS,
    WAVE_SIZES,
  };
})();
