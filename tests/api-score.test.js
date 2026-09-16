const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { install } = require('./helpers/shim');
const window = install();
require(path.resolve(__dirname, '../js/api-data.js'));

const A = window.KHDA_API;
const DATASETS = window.KHDA_DATASETS;

test('the roster is 37 institutions with distinct codes', () => {
  assert.strictEqual(A.roster.length, 37);
  assert.strictEqual(new Set(A.roster.map(i => i.code)).size, 37);
  for (const i of A.roster) assert.ok(i.name && i.name.length > 2, 'named: ' + i.code);
});

test('every institution carries one ledger row per dataset', () => {
  for (const inst of A.roster) {
    assert.strictEqual(inst.ledger.length, DATASETS.length, inst.name);
    assert.deepStrictEqual(inst.ledger.map(r => r.sheet), DATASETS.map(d => d.sheet));
    for (const row of inst.ledger) assert.ok(A.STATUSES.includes(row.status), row.status);
  }
});

test('every score lands inside 0-100', () => {
  for (const inst of A.roster) {
    const s = A.score(inst);
    assert.ok(s.total >= 0 && s.total <= 100, inst.name + ' scored ' + s.total);
    assert.strictEqual(s.total, Math.round(s.total), 'total is an integer');
  }
});

test('coverage divides by the 46 required, not by what was submitted', () => {
  const full = { ledger: DATASETS.map(d => ({ sheet: d.sheet, status: 'accepted' })), lastCallDays: 0 };
  assert.strictEqual(A.score(full).coverage, 50);
  assert.strictEqual(A.score(full).total, 100);

  // nine datasets sent, all clean, must not outrank forty sent with a few corrections
  const nine = {
    ledger: DATASETS.map((d, i) => ({ sheet: d.sheet, status: i < 9 ? 'accepted' : 'non-submitted' })),
    lastCallDays: 0,
  };
  const forty = {
    ledger: DATASETS.map((d, i) => ({ sheet: d.sheet, status: i < 36 ? 'accepted' : i < 40 ? 'needs-correction' : 'non-submitted' })),
    lastCallDays: 0,
  };
  assert.ok(A.score(forty).total > A.score(nine).total,
    'forty sent (' + A.score(forty).total + ') beats nine sent (' + A.score(nine).total + ')');
});

test('accuracy is zero, not full marks, when nothing was attempted', () => {
  const silent = { ledger: DATASETS.map(d => ({ sheet: d.sheet, status: 'non-submitted' })), lastCallDays: null };
  const s = A.score(silent);
  assert.strictEqual(s.accuracy, 0);
  assert.strictEqual(s.coverage, 0);
  assert.strictEqual(s.total, 0);
});

test('freshness decays with the last call and is zero when there never was one', () => {
  const led = DATASETS.map(d => ({ sheet: d.sheet, status: 'accepted' }));
  assert.strictEqual(A.score({ ledger: led, lastCallDays: null }).freshness, 0);
  assert.strictEqual(A.score({ ledger: led, lastCallDays: 3 }).freshness, 20);
  assert.strictEqual(A.score({ ledger: led, lastCallDays: 7 }).freshness, 20);
  assert.strictEqual(A.score({ ledger: led, lastCallDays: 90 }).freshness, 0);
  const mid = A.score({ ledger: led, lastCallDays: 30 }).freshness;
  assert.ok(mid > 0 && mid < 20, 'a month old sits between the two: ' + mid);
});

test('stars are a half-step value in 0-5 that tracks the score', () => {
  let prev = -1;
  for (const inst of [...A.roster].sort((a, b) => A.score(a).total - A.score(b).total)) {
    const s = A.score(inst);
    assert.ok(s.stars >= 0 && s.stars <= 5, s.stars);
    assert.strictEqual(s.stars * 2, Math.round(s.stars * 2), 'half-step: ' + s.stars);
    assert.ok(s.stars >= prev, 'stars never fall as the score rises');
    prev = s.stars;
  }
});

test('the seed is stable, so two loads agree', () => {
  const first = A.roster.map(i => [i.code, A.score(i).total, i.tier]);
  delete window.KHDA_API;
  delete require.cache[path.resolve(__dirname, '../js/api-data.js')];
  require(path.resolve(__dirname, '../js/api-data.js'));
  const second = window.KHDA_API.roster.map(i => [i.code, window.KHDA_API.score(i).total, i.tier]);
  assert.deepStrictEqual(second, first);
});

test('the summary reconciles against 37 x 46 rows', () => {
  const s = window.KHDA_API.summary();
  assert.strictEqual(s.rows, 37 * DATASETS.length);
  const sum = A.STATUSES.reduce((n, k) => n + s.counts[k], 0);
  assert.strictEqual(sum, s.rows);
  assert.strictEqual(s.consuming + s.notConsuming, s.institutions);
  assert.strictEqual(s.errorRows, s.counts['needs-correction']);
  assert.ok(s.avgScore >= 0 && s.avgScore <= 100);
});

test('the roster spans all four onboarding waves and every tier is represented', () => {
  const waves = window.KHDA_API.byWave();
  assert.deepStrictEqual(waves.map(w => w.total), A.WAVE_SIZES);
  for (const w of waves) assert.ok(w.consuming <= w.total);

  const tiers = window.KHDA_API.summary().tiers;
  for (const k of ['active', 'dormant', 'not-integrated']) {
    assert.ok(tiers[k] > 0, 'the page needs at least one ' + k + ' institution to show');
  }
});

test('sector call volume has one entry per week and is non-negative', () => {
  const v = window.KHDA_API.volume();
  assert.strictEqual(v.length, A.WEEKS);
  for (const n of v) assert.ok(Number.isFinite(n) && n >= 0, n);
  assert.ok(v.some(n => n > 0), 'some traffic exists');
});
