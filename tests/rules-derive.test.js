const { test } = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/shim');
const window = install();
const R = window.KHDA_RULES, S = window.KHDA_SCHEMA;

const schema = S.get('Applicants - Basic Details');
const derived = R.derive(schema);
const KEY0 = schema.fields[0].key;

test('every field gets an entry', () => {
  assert.strictEqual(Object.keys(derived).length, schema.fields.length);
});

test('a mandatory coded field derives REQUIRED and REFERENCE_EXISTS', () => {
  assert.strictEqual(schema.fields[0].label, 'Institution Code');
  const t = derived[KEY0].map(r => r.type);
  assert.ok(t.includes('REQUIRED'));
  assert.ok(t.includes('REFERENCE_EXISTS'));
});

test('every derived rule populates the NOT NULL columns', () => {
  for (const key of Object.keys(derived)) {
    for (const r of derived[key]) {
      assert.ok(r.errorCode && r.errorCode.length <= 100, 'Error_Code set, <=100: ' + r.type);
      assert.ok(r.errorMessage && r.errorMessage.length <= 500, 'Error_Message set, <=500');
      assert.strictEqual(typeof r.order, 'number');
      assert.strictEqual(r.origin, 'derived');
      assert.strictEqual(r.enabled, true);
    }
  }
});

test('error codes are unique within a field and upper-snake', () => {
  const codes = derived[KEY0].map(r => r.errorCode);
  assert.strictEqual(new Set(codes).size, codes.length);
  codes.forEach(c => assert.match(c, /^ERR_[A-Z0-9_]+$/));
});

test('REQUIRED runs before format rules', () => {
  const req = derived[KEY0].find(r => r.type === 'REQUIRED');
  const ref = derived[KEY0].find(r => r.type === 'REFERENCE_EXISTS');
  assert.ok(req.order < ref.order);
});

test('serialize renders each value shape as a Rule_Value string', () => {
  assert.strictEqual(R.serialize('REQUIRED', null), null);
  assert.strictEqual(R.serialize('MAX_LENGTH', 255), '255');
  assert.strictEqual(R.serialize('ALLOWED_VALUE', ['PR', 'BOT']), 'PR,BOT');
  assert.strictEqual(R.serialize('REFERENCE_EXISTS', { table: 'MST_X', column: 'C' }), 'MST_X.C');
  assert.strictEqual(R.serialize('CONDITIONAL_REQUIRED', { field: 'executivePosition', op: '=', value: 'BOT' }), 'executivePosition=BOT');
  assert.strictEqual(R.serialize('CUSTOM_BUSINESS_RULE', { handler: 'H', sql: 'SELECT 1' }), 'SELECT 1');
});

test('no derived Rule_Value exceeds nvarchar(1000) in any dataset', () => {
  for (const d of window.KHDA_DATASETS) {
    const s = S.get(d.sheet), v = R.derive(s);
    for (const key of Object.keys(v)) {
      for (const r of v[key]) {
        const sv = R.serialize(r.type, r.value);
        if (sv != null) assert.ok(sv.length <= 1000,
          d.sheet + ' ' + r.type + ' is ' + sv.length + ' chars');
      }
    }
  }
});

test('a field on an oversized list derives REFERENCE_EXISTS but not ALLOWED_VALUE', () => {
  // "Universities" serializes to ~19k chars, far past nvarchar(1000)
  let found = false;
  for (const d of window.KHDA_DATASETS) {
    const s = S.get(d.sheet), v = R.derive(s);
    for (const f of s.fields) {
      if (f.listName !== 'Universities') continue;
      found = true;
      const t = v[f.key].map(r => r.type);
      assert.ok(!t.includes('ALLOWED_VALUE'), 'oversized list must not become an enum');
      assert.ok(t.includes('REFERENCE_EXISTS'));
    }
  }
  assert.ok(found, 'at least one field references Universities');
});

test('a short list still derives ALLOWED_VALUE', () => {
  const f = schema.fields.find(x => x.listName === 'Degree or Program Level');
  assert.ok(f);
  assert.ok(derived[f.key].map(r => r.type).includes('ALLOWED_VALUE'));
});

test('apiCode uses an uppercase sheet name as-is and marks it verified', () => {
  const r = R.apiCode('PERSON_PROFILE');
  assert.strictEqual(r.code, 'PERSON_PROFILE');
  assert.strictEqual(r.verified, true);
});

test('apiCode marks a derived code unverified', () => {
  const r = R.apiCode('OBF self report');
  assert.strictEqual(r.verified, false);
  assert.match(r.code, /^[A-Z0-9_]+$/);
});

test('cross-field limits derive a CUSTOM_BUSINESS_RULE', () => {
  const withCross = window.KHDA_DATASETS.map(d => S.get(d.sheet)).find(s => s.cross.length);
  assert.ok(withCross);
  const dv = R.derive(withCross), c = withCross.cross[0];
  const rule = dv[c.key].find(r => r.type === 'CUSTOM_BUSINESS_RULE');
  assert.ok(rule);
  assert.strictEqual(rule.value.handler, 'CrossFieldLimit');
});

test('derive is pure', () => {
  assert.deepStrictEqual(R.derive(schema), R.derive(schema));
});

test('error codes are unique within every field of every dataset', () => {
  for (const d of window.KHDA_DATASETS) {
    const s = S.get(d.sheet), v = R.derive(s);
    for (const key of Object.keys(v)) {
      const codes = v[key].map(r => r.errorCode);
      assert.strictEqual(new Set(codes).size, codes.length,
        d.sheet + ' field ' + key + ' has duplicate Error_Codes: ' + codes.join(', '));
    }
  }
});

test('apiCode verification splits 34 verified / 12 unverified across all datasets', () => {
  let verified = 0, unverified = 0;
  for (const d of window.KHDA_DATASETS) {
    if (R.apiCode(d.sheet).verified) verified++; else unverified++;
  }
  assert.strictEqual(verified, 34);
  assert.strictEqual(unverified, 12);
});

test('serialize resolves field keys to database columns when given a schema', () => {
  const [a, b] = schema.fields;
  // without a schema the raw key survives, so serialize stays usable standalone
  assert.strictEqual(R.serialize('REFERENCE_MATCH', [a.key, b.key]), a.key + ',' + b.key);
  assert.strictEqual(R.serialize('CONDITIONAL_REQUIRED', { field: a.key, op: '=', value: 'BOT' }),
    a.key + '=BOT');
  // with one, the exported value names the columns the database actually has
  assert.strictEqual(R.serialize('REFERENCE_MATCH', [a.key, b.key], schema), a.db + ',' + b.db);
  assert.strictEqual(R.serialize('CONDITIONAL_REQUIRED', { field: a.key, op: '=', value: 'BOT' }, schema),
    a.db + '=BOT');
  // ALLOWED_VALUE holds literal codes, not field keys, so a schema must not rewrite them
  assert.strictEqual(R.serialize('ALLOWED_VALUE', ['f0', 'BOT'], schema), 'f0,BOT');
});

test('exported rows name database columns, never internal field keys', () => {
  const sheet = 'Applicants - Basic Details';
  const [a, b] = schema.fields;
  R.addCustom(sheet, a.key, { type: 'REFERENCE_MATCH', value: [a.key, b.key] });
  const row = R.rows(sheet).find(r => r.Rule_Type === 'REFERENCE_MATCH');
  assert.strictEqual(row.Rule_Value, a.db + ',' + b.db);
  assert.ok(!/\bf\d+\b/.test(row.Rule_Value), 'no raw field keys in Rule_Value');
});

test('a declared primary key derives a UNIQUE_KEY naming every member', () => {
  // the dictionary declares "Primary key (Institution Code, Academic period, Degree, Specialization)"
  assert.ok(schema.pk.length > 1, 'this sheet has a composite key');
  const last = schema.pk[schema.pk.length - 1];
  const rule = derived[last].find(r => r.type === 'UNIQUE_KEY');
  assert.ok(rule, 'the key hangs off its last member, where schema.js reports the clash');
  assert.deepStrictEqual(rule.value, schema.pk);
  assert.strictEqual(rule.errorMessage, 'A record with this key combination already exists.');
  // and it must not be duplicated onto the other members
  const all = Object.values(derived).flat().filter(r => r.type === 'UNIQUE_KEY');
  assert.strictEqual(all.length, 1);
});

test('the exported UNIQUE_KEY names database columns, not field keys', () => {
  const row = R.rows('Applicants - Basic Details').find(r => r.Rule_Type === 'UNIQUE_KEY');
  assert.ok(row, 'the key reaches the export');
  assert.strictEqual(row.Rule_Value, schema.pk.map(k => schema.field(k).db).join(','));
});

test('every sheet derives at most one UNIQUE_KEY, from its key or its whole row', () => {
  let withKey = 0, wholeRow = 0, tooLong = 0;
  for (const d of window.KHDA_DATASETS) {
    const sc = S.get(d.sheet);
    const keys = R.rows(d.sheet).filter(r => r.Rule_Type === 'UNIQUE_KEY');
    assert.ok(keys.length <= 1, d.sheet + ' has at most one');
    if (sc.pk.length) {
      withKey++;
      assert.strictEqual(keys.length, 1, d.sheet);
      assert.strictEqual(keys[0].Rule_Value, sc.pk.map(k => sc.field(k).db).join(','));
    } else if (keys.length) {
      // no declared key, so the whole row is the key
      wholeRow++;
      assert.strictEqual(keys[0].Rule_Value, sc.fields.map(f => f.db).join(','));
      assert.strictEqual(keys[0].Error_Message, 'An identical record has already been entered.');
    } else {
      // skipped only because the column list would overrun Rule_Value
      tooLong++;
      assert.ok(sc.fields.map(f => f.db).join(',').length > R.MAX_RULE_VALUE, d.sheet);
    }
  }
  assert.strictEqual(withKey, 26, '26 of the 46 sheets declare a primary key');
  assert.strictEqual(wholeRow + tooLong, 20);
});

test('a looked-up field derives REFERENCE_MATCH against its source', () => {
  // "Institution Name should match with the Institution code as per list"
  const looked = schema.fields.find(f => f.derivedFrom);
  assert.ok(looked, 'this sheet has a looked-up field');
  const rule = derived[looked.key].find(r => r.type === 'REFERENCE_MATCH');
  assert.ok(rule, 'the lookup is expressed as a cross-field match');
  assert.deepStrictEqual(rule.value, [looked.key, looked.derivedFrom]);
});

test('the dictionary placeholder is parsed, numeric or not', () => {
  const grad = S.get('Graduates');
  const eid = grad.fields.find(f => /emirates id/i.test(f.label));
  assert.strictEqual(eid.placeholder, '999999999999999', 'spaces in the sheet are stripped');
  const eth = grad.fields.find(f => /ethbara/i.test(f.label));
  assert.strictEqual(eth.placeholder, 'NA', 'a placeholder need not be numeric');
});

test('a conditional mandatory derives CONDITIONAL_REQUIRED against the right field', () => {
  const sc = S.get('Students - Enrollments');
  const target = sc.fields.find(f => /reason why emirates id/i.test(f.label));
  const rule = R.derive(sc)[target.key].find(r => r.type === 'CONDITIONAL_REQUIRED');
  assert.ok(rule, 'the condition is derived');
  const src = sc.fields.find(f => /^emirates id$/i.test(f.label));
  assert.strictEqual(rule.value.field, src.key);
  assert.strictEqual(rule.value.op, '=');
  assert.strictEqual(rule.value.value, '999999999999999');
});

test('an "in" condition keeps its list and exports it readably', () => {
  const sc = S.get('Students - Enrollments');
  const row = R.rows('Students - Enrollments')
    .find(r => r.Rule_Type === 'CONDITIONAL_REQUIRED' && /\(/.test(r.Rule_Value));
  assert.ok(row, 'at least one condition is a list');
  // a word operator is spaced so it stays readable: COLUMN in (A,B,C)
  assert.match(row.Rule_Value, /^[A-Za-z0-9_]+ in \([A-Z]{2}(,[A-Z]{2})+\)$/);
});

test('a cross-dataset requirement becomes SQL against the other table', () => {
  for (const sheet of ['Students - Internship', 'Students - Scholarship']) {
    const row = R.rows(sheet).find(r => r.Rule_Type === 'CUSTOM_BUSINESS_RULE' && /EXISTS/.test(r.Rule_Value));
    assert.ok(row, sheet + ' derives the cross-dataset rule');
    // it must name the other dataset's table and the column that has to be filled
    assert.match(row.Rule_Value, /FROM STUDENTS_ENROLLMENTS x/);
    assert.match(row.Rule_Value, /x\.Enroll_Missing_EID/);
    // and join the two datasets on the field the condition is about
    assert.match(row.Rule_Value, /x\.Enroll_Emirates_ID = /);
    assert.match(row.Error_Message, /must be provided in Students - Enrollments/);
  }
});

test('conditions only ever reference a field that exists in the dataset', () => {
  for (const d of window.KHDA_DATASETS) {
    const sc = S.get(d.sheet);
    for (const c of sc.conditional) {
      assert.ok(sc.field(c.key), d.sheet + ' target exists');
      assert.ok(sc.field(c.field), d.sheet + ' condition source exists');
      // a same-dataset condition always points at a different field; a cross-dataset one
      // is about this very field, with the requirement living in the other dataset
      if (!c.requires) assert.notStrictEqual(c.key, c.field, d.sheet);
      else assert.strictEqual(c.key, c.field, d.sheet);
    }
  }
});

test('the Key Constraints column is read for every dataset, not a favoured few', () => {
  let touched = 0, withText = 0;
  for (const d of window.KHDA_DATASETS) {
    const sc = S.get(d.sheet);
    const cond = new Set(sc.conditional.map(c => c.key));
    const hasText = sc.fields.some(f => String(f.keyText || '').trim());
    if (!hasText) continue;
    withText++;
    const consumed = sc.fields.some(f => f.placeholder || f.min != null || f.nullableByDictionary
      || cond.has(f.key) || sc.pk.includes(f.key) || f.derivedFrom)
      || sc.cross.length > 0;
    if (consumed) touched++;
  }
  assert.strictEqual(touched, withText,
    'every dataset that states constraints has at least one of them read');
});

test('a placeholder is a value, never prose or punctuation', () => {
  for (const d of window.KHDA_DATASETS) {
    for (const f of S.get(d.sheet).fields) {
      if (!f.placeholder) continue;
      assert.doesNotMatch(f.placeholder, /[.,;]$/, d.sheet + ' / ' + f.label);
      assert.match(f.placeholder, /^(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+|[+]?[0-9][0-9.-]*|[A-Za-z]{2,4})$/,
        d.sheet + ' / ' + f.label + ' = ' + f.placeholder);
    }
  }
});

test('a placeholder is field guidance, never an exported rule', () => {
  // no record can fail "use 999999999999999 if not available", so it is not a rule; it stays
  // on the field for the UI and the review, and never reaches Rule_Value
  let fields = 0;
  for (const d of window.KHDA_DATASETS) {
    fields += S.get(d.sheet).fields.filter(f => f.placeholder).length;
    for (const r of R.rows(d.sheet)) {
      assert.notStrictEqual(r.Rule_Type, 'PLACEHOLDER_VALUE', d.sheet);
    }
  }
  assert.ok(fields > 0, 'placeholders are still parsed');
  assert.strictEqual(R.type('PLACEHOLDER_VALUE'), undefined, 'the type is gone from the catalogue');
});
