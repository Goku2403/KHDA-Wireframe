const { test } = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/shim');
const window = install();
const R = window.KHDA_RULES;

test('all 46 datasets export JSON that satisfies every table constraint', () => {
  for (const d of window.KHDA_DATASETS) {
    const out = JSON.parse(R.exportJson(d.sheet));
    assert.ok(Array.isArray(out), d.sheet + ' exports an array of rows');
    for (const r of out) {
      assert.ok(R.type(r.Rule_Type), 'Rule_Type in catalogue: ' + r.Rule_Type);
      for (const c of R.COLUMNS) assert.notStrictEqual(r[c], undefined, c + ' present');
      assert.ok(r.API_Code && r.Field_Name && r.Error_Code && r.Error_Message, 'NOT NULLs set');
      if (r.Rule_Value !== null) assert.ok(r.Rule_Value.length <= R.MAX_RULE_VALUE);
      assert.ok(r.Error_Code.length <= R.MAX_ERROR_CODE, 'Error_Code fits: ' + r.Error_Code);
      assert.ok(r.Error_Message.length <= R.MAX_ERROR_MSG, 'Error_Message fits');
    }
  }
});

test('no exported Rule_Value leaks an internal field key', () => {
  // field keys are positional ids ('f0'), meaningless to the target database
  for (const d of window.KHDA_DATASETS) {
    for (const r of R.rows(d.sheet)) {
      if (r.Rule_Value == null) continue;
      assert.ok(!/(^|[,=])f\d+([,=]|$)/.test(r.Rule_Value),
        d.sheet + ' / ' + r.Rule_Type + ' exported a raw key: ' + r.Rule_Value);
    }
  }
});

test('SQL export is syntactically plausible for every dataset', () => {
  for (const d of window.KHDA_DATASETS) {
    const sql = R.exportSql(d.sheet);
    const stmts = sql.split('\n').filter(l => l.startsWith('INSERT INTO'));
    assert.strictEqual(stmts.length, R.rows(d.sheet).length, d.sheet);
    for (const s of stmts) {
      assert.ok(s.endsWith(');'), 'statement terminated: ' + d.sheet);
      // an unescaped apostrophe would leave an odd number of quote marks
      assert.strictEqual((s.match(/'/g) || []).length % 2, 0, 'quotes balanced: ' + d.sheet);
    }
  }
});

test('CSV export has one header plus one line per rule, for every dataset', () => {
  // localStorage is untouched this far into the file, so every dataset is still derived-only
  // and no Rule_Value contains a newline. That makes the line count exact rather than a bound.
  for (const d of window.KHDA_DATASETS) {
    const lines = R.exportCsv(d.sheet).trimEnd().split('\n');
    assert.strictEqual(lines[0], R.COLUMNS.join(','), d.sheet + ' header');
    assert.strictEqual(lines.length, 1 + R.rows(d.sheet).length, d.sheet + ' line count');
  }
});

test('a value containing a comma, quote or newline survives the CSV round trip', () => {
  const sheet = window.KHDA_DATASETS[0].sheet;
  const key = window.KHDA_SCHEMA.get(sheet).fields[0].key;
  const nasty = 'SELECT 1,\n"quoted", O\'Brien';
  const made = R.addCustom(sheet, key, {
    type: 'CUSTOM_BUSINESS_RULE', value: { handler: 'H', sql: nasty },
    errorCode: 'ERR_CSV', errorMessage: 'm', order: 100,
  });
  const csv = R.exportCsv(sheet);
  assert.ok(csv.includes('""quoted""'), 'inner quotes are doubled');
  const sql = R.exportSql(sheet);
  const stmt = sql.split('\n').filter(l => l.startsWith('INSERT INTO')).pop();
  assert.strictEqual((stmt.match(/'/g) || []).length % 2, 0, 'apostrophe escaped in SQL');
  R.removeCustom(sheet, made.id);
});

test('custom rules on one dataset never leak into another', () => {
  localStorage.clear();
  const a = window.KHDA_DATASETS[0].sheet, b = window.KHDA_DATASETS[1].sheet;
  const key = window.KHDA_SCHEMA.get(a).fields[0].key;
  R.addCustom(a, key, { type: 'MIN_LENGTH', value: 5, errorCode: 'ERR_A', errorMessage: 'm', order: 40 });
  const inB = R.load(b);
  const leaked = Object.values(inB.byField).flat().filter(r => r.origin === 'custom');
  assert.strictEqual(leaked.length, 0);
});

test('a disabled rule leaves the export and comes back when re-enabled', () => {
  localStorage.clear();
  const sheet = window.KHDA_DATASETS[0].sheet;
  const key = window.KHDA_SCHEMA.get(sheet).fields[0].key;
  const rule = R.load(sheet).byField[key][0];
  const before = R.rows(sheet).length;
  R.setEnabled(sheet, rule.id, false);
  assert.strictEqual(R.rows(sheet).length, before - 1, 'disabled rule is not exported');
  assert.ok(!R.rows(sheet).some(r => r.Error_Code === rule.errorCode), 'its code is gone');
  R.setEnabled(sheet, rule.id, true);
  assert.strictEqual(R.rows(sheet).length, before, 're-enabling restores it');
});
