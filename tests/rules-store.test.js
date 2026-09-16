const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/shim');
const window = install();
const R = window.KHDA_RULES;
const SHEET = 'Applicants - Basic Details';
const KEY0 = window.KHDA_SCHEMA.get(SHEET).fields[0].key;
const custom = over => Object.assign({
  type: 'MIN_LENGTH', value: 3, errorCode: 'ERR_X', errorMessage: 'too short', order: 40,
}, over || {});

beforeEach(() => localStorage.clear());

test('storage key matches the repo convention', () => {
  assert.strictEqual(R.storageKey(SHEET), 'khda.rules.Applicants_Basic_Details.v1');
});

test('storage key sanitization matches schema.js exactly', () => {
  for (const d of window.KHDA_DATASETS) {
    const fromSchema = window.KHDA_SCHEMA.get(d.sheet).storageKey;   // khda.hedb.<san>.v1
    const san = fromSchema.replace(/^khda\.hedb\./, '').replace(/\.v1$/, '');
    assert.strictEqual(R.storageKey(d.sheet), 'khda.rules.' + san + '.v1', d.sheet);
  }
});

test('load with nothing stored returns derived rules only', () => {
  const doc = R.load(SHEET);
  assert.ok(doc.byField[KEY0].length > 0);
  assert.ok(doc.byField[KEY0].every(r => r.origin === 'derived'));
  assert.strictEqual(doc.apiName, 'Applicants - Basic Details');
});

test('a custom rule persists and reloads', () => {
  const made = R.addCustom(SHEET, KEY0, custom());
  assert.strictEqual(made.origin, 'custom');
  const back = R.load(SHEET).byField[KEY0].filter(r => r.origin === 'custom');
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].errorCode, 'ERR_X');
});

test('custom rule ids are unique', () => {
  const a = R.addCustom(SHEET, KEY0, custom());
  const b = R.addCustom(SHEET, KEY0, custom({ type: 'PHONE_FORMAT', value: '+###' }));
  assert.notStrictEqual(a.id, b.id);
});

test('disabling a derived rule persists without deleting it', () => {
  const id = KEY0 + ':REQUIRED';
  R.setEnabled(SHEET, id, false);
  const doc = R.load(SHEET);
  assert.ok(doc.disabled.has(id));
  assert.strictEqual(doc.byField[KEY0].find(r => r.id === id).enabled, false);
});

test('removeCustom refuses a derived rule', () => {
  const made = R.addCustom(SHEET, KEY0, custom());
  assert.strictEqual(R.removeCustom(SHEET, KEY0 + ':REQUIRED'), false);
  assert.strictEqual(R.removeCustom(SHEET, made.id), true);
});

test('stored payload holds no derived rules', () => {
  R.addCustom(SHEET, KEY0, custom());
  const raw = JSON.parse(localStorage.getItem(R.storageKey(SHEET)));
  assert.ok(Object.values(raw.custom).flat().every(r => r.origin === 'custom'));
});

test('an API_Code override persists', () => {
  R.setApiCode(SHEET, 'APPLICANTS_BASIC_DETAILS');
  const doc = R.load(SHEET);
  assert.strictEqual(doc.apiCode, 'APPLICANTS_BASIC_DETAILS');
  assert.strictEqual(doc.verified, true);   // a user-set code counts as verified
});

test('rows() emits every target-table column with correct types', () => {
  const rows = R.rows(SHEET);
  assert.ok(rows.length > 0);
  const r = rows[0];
  for (const c of ['RuleID','API_Code','Field_Name','Rule_Type','Rule_Value','Error_Code',
                   'Error_Message','Execution_Order','Is_Active','API_Name']) {
    assert.ok(c in r, 'missing column ' + c);
  }
  assert.strictEqual(typeof r.RuleID, 'number');
  assert.strictEqual(typeof r.Execution_Order, 'number');
  assert.ok(r.Is_Active === 1 || r.Is_Active === 0);
});

test('rows() honours every NOT NULL and length constraint', () => {
  for (const d of window.KHDA_DATASETS) {
    for (const r of R.rows(d.sheet)) {
      assert.ok(r.API_Code && r.API_Code.length <= 100, 'API_Code ' + d.sheet);
      assert.ok(r.API_Name && r.API_Name.length <= 250, 'API_Name ' + d.sheet);
      assert.ok(r.Field_Name && r.Field_Name.length <= 100, 'Field_Name ' + d.sheet);
      assert.ok(r.Rule_Type && r.Rule_Type.length <= 50, 'Rule_Type ' + d.sheet);
      assert.ok(r.Error_Code && r.Error_Code.length <= 100, 'Error_Code ' + d.sheet);
      assert.ok(r.Error_Message && r.Error_Message.length <= 500, 'Error_Message ' + d.sheet);
      if (r.Rule_Value !== null) assert.ok(r.Rule_Value.length <= 1000, 'Rule_Value ' + d.sheet);
    }
  }
});

test('RuleID is sequential from 1 and unique', () => {
  const ids = R.rows(SHEET).map(r => r.RuleID);
  assert.deepStrictEqual(ids, ids.map((_, i) => i + 1));
});

test('rows() omits disabled rules', () => {
  const before = R.rows(SHEET).length;
  R.setEnabled(SHEET, KEY0 + ':REQUIRED', false);
  assert.strictEqual(R.rows(SHEET).length, before - 1);
});

test('SQL export escapes single quotes and renders NULL unquoted', () => {
  R.addCustom(SHEET, KEY0, custom({ errorMessage: "O'Brien said \"no\"" }));
  const sql = R.exportSql(SHEET);
  assert.ok(sql.includes('INSERT INTO'));
  assert.ok(sql.includes("O''Brien"), 'single quote must be doubled');
  assert.ok(/,\s*NULL\s*,/.test(sql), 'a null Rule_Value renders as bare NULL');
});

test('CSV export quotes fields containing commas and quotes', () => {
  const csv = R.exportCsv(SHEET);
  const head = csv.split('\n')[0];
  assert.ok(head.startsWith('RuleID,API_Code,Field_Name,Rule_Type,Rule_Value'));
  const listRow = csv.split('\n').find(l => l.includes('ALLOWED_VALUE'));
  if (listRow) assert.ok(listRow.includes('"'), 'a comma-bearing value must be quoted');
});

test('JSON export parses and matches rows()', () => {
  const out = JSON.parse(R.exportJson(SHEET));
  assert.strictEqual(out.length, R.rows(SHEET).length);
  assert.strictEqual(out[0].API_Name, 'Applicants - Basic Details');
});

test('a corrupt payload falls back to derived rules', () => {
  localStorage.setItem(R.storageKey(SHEET), '{not json');
  assert.ok(R.load(SHEET).byField[KEY0].length > 0);
});

// --- Fix round 2: findings from independent review ---

test('finding 1: wrong-shaped valid JSON does not crash load() or addCustom()', () => {
  const payloads = [{ custom: 'x' }, { custom: 5 }, { custom: [] }, { disabled: 'no' }];
  for (const p of payloads) {
    localStorage.clear();
    localStorage.setItem(R.storageKey(SHEET), JSON.stringify(p));
    assert.doesNotThrow(() => R.load(SHEET), 'load threw for ' + JSON.stringify(p));
    assert.doesNotThrow(() => R.addCustom(SHEET, KEY0, custom()), 'addCustom threw for ' + JSON.stringify(p));
    const doc = R.load(SHEET);
    assert.ok(doc.byField[KEY0].some(r => r.origin === 'custom'), 'custom rule missing after ' + JSON.stringify(p));
  }
});

test('finding 2: a custom rule with no errorCode/errorMessage/order still satisfies NOT NULL and valid SQL', () => {
  R.addCustom(SHEET, KEY0, { type: 'MIN_LENGTH', value: 3 });
  const rs = R.rows(SHEET);
  assert.ok(rs.length > 0);
  for (const r of rs) {
    assert.ok(r.Error_Code, 'Error_Code must not be empty');
    assert.ok(r.Error_Message, 'Error_Message must not be empty');
    assert.strictEqual(typeof r.Execution_Order, 'number');
    assert.ok(Number.isFinite(r.Execution_Order));
  }
  const sql = R.exportSql(SHEET);
  assert.ok(!/,\s*,/.test(sql), 'no empty SQL token');
  assert.ok(!sql.includes('undefined'), 'no "undefined" leaking into SQL');
  assert.ok(!sql.includes('NaN'), 'no "NaN" leaking into SQL');
});

test('finding 2: load() defaults a hand-edited custom rule that bypasses addCustom', () => {
  localStorage.setItem(R.storageKey(SHEET), JSON.stringify({
    custom: { [KEY0]: [{ id: 'c1', type: 'MIN_LENGTH', value: 3, origin: 'custom', enabled: true }] },
    disabled: [],
  }));
  const doc = R.load(SHEET);
  const r = doc.byField[KEY0].find(x => x.id === 'c1');
  assert.ok(r.errorCode, 'errorCode must default');
  assert.ok(r.errorMessage, 'errorMessage must default');
  assert.strictEqual(typeof r.order, 'number');
  assert.ok(Number.isFinite(r.order));
});

test('finding 3: CSV export quotes a value containing a bare carriage return', () => {
  R.addCustom(SHEET, KEY0, custom({ errorMessage: 'line1\rline2' }));
  const csv = R.exportCsv(SHEET);
  const row = csv.split('\n').find(l => l.includes('line1'));
  assert.ok(row, 'row with the CR-bearing value must be present');
  assert.ok(row.includes('"'), 'a value containing \\r must be quoted');
});

test('finding 4: exportSql coerces a non-numeric stored Execution_Order and resists injection', () => {
  localStorage.setItem(R.storageKey(SHEET), JSON.stringify({
    custom: { [KEY0]: [{
      id: 'c1', type: 'MIN_LENGTH', value: 3, errorCode: 'ERR_X', errorMessage: 'msg',
      order: '1); DROP TABLE x;--', origin: 'custom', enabled: true,
    }] },
    disabled: [],
  }));
  const sql = R.exportSql(SHEET);
  assert.ok(!sql.includes('DROP TABLE'), 'malicious order value must not leak into SQL');
  assert.ok(!/,\s*,/.test(sql), 'no empty token from bad order');
});

test('finding 5: SQL INSERT omits RuleID; JSON and CSV still include it', () => {
  const sql = R.exportSql(SHEET);
  assert.ok(!/INSERT INTO API_Validation_Rules \(\s*RuleID\s*,/.test(sql), 'SQL must not include a RuleID column');
  assert.ok(sql.includes('INSERT INTO API_Validation_Rules (API_Code,'), 'SQL columns must start with API_Code');
  const json = JSON.parse(R.exportJson(SHEET));
  assert.ok('RuleID' in json[0], 'JSON must still include RuleID');
  const csv = R.exportCsv(SHEET);
  assert.ok(csv.split('\n')[0].startsWith('RuleID,'), 'CSV header must still start with RuleID');
});

// The "otherwise" branch is guidance, not a rule — it never reaches an export, but the
// author can override what the dictionary stated and the override has to survive a reload.
test('setOtherwise overrides the derived branch and reverts when cleared', () => {
  const sheet = 'Graduates';
  const derived = R.load(sheet).otherwise;
  const key = Object.keys(derived).find(k => derived[k].mode === 'value');
  assert.ok(key, 'Graduates should derive at least one stated fallback value');

  R.setOtherwise(sheet, key, { mode: 'blank', value: '' });
  assert.deepStrictEqual(R.load(sheet).otherwise[key], { mode: 'blank', value: '' });

  R.setOtherwise(sheet, key, { mode: 'value', value: 'NA' });
  assert.deepStrictEqual(R.load(sheet).otherwise[key], { mode: 'value', value: 'NA' });

  R.setOtherwise(sheet, key, null);
  assert.deepStrictEqual(R.load(sheet).otherwise[key], derived[key], 'clearing falls back to the dictionary');
});

test('an overridden otherwise adds no rule to any export', () => {
  const sheet = 'Graduates';
  const before = JSON.parse(R.exportJson(sheet)).length;
  const key = Object.keys(R.load(sheet).otherwise)[0];
  R.setOtherwise(sheet, key, { mode: 'value', value: 'ZZZ' });
  const after = JSON.parse(R.exportJson(sheet));
  assert.strictEqual(after.length, before, 'guidance must not become a rule');
  assert.ok(!R.exportSql(sheet).includes('ZZZ'), 'guidance must not leak into SQL');
});
