const { test } = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/shim');
const window = install();
const R = window.KHDA_RULES;

const EXPECTED = ['REQUIRED','DATA_TYPE','MAX_LENGTH','MIN_LENGTH','MIN_VALUE','ALLOWED_VALUE',
  'EMAIL_FORMAT','PHONE_FORMAT','DATE_FORMAT','REFERENCE_EXISTS','REFERENCE_MATCH','UNIQUE_KEY',
  'CONDITIONAL_REQUIRED','CUSTOM_BUSINESS_RULE'];

test('exposes all 14 rule types in display order', () => {
  assert.deepStrictEqual(R.TYPES.map(t => t.id), EXPECTED);
});

test('REQUIRED and EMAIL_FORMAT take no rule value', () => {
  assert.strictEqual(R.type('REQUIRED').value, 'none');
  assert.strictEqual(R.type('EMAIL_FORMAT').value, 'none');
});

test('ALLOWED_VALUE uses the chip editor, CUSTOM_BUSINESS_RULE the sql editor', () => {
  assert.strictEqual(R.type('ALLOWED_VALUE').value, 'chips');
  assert.strictEqual(R.type('CUSTOM_BUSINESS_RULE').value, 'sql');
});

test('DATA_TYPE offers the five datatypes', () => {
  assert.deepStrictEqual(R.type('DATA_TYPE').options,
    ['INTEGER','DECIMAL','DATE','TEXT','BOOLEAN']);
});

test('type() returns undefined for an unknown id', () => {
  assert.strictEqual(R.type('NOPE'), undefined);
});

test('UNIQUE_KEY carries the composite key and uses the field-picker editor', () => {
  assert.strictEqual(R.type('UNIQUE_KEY').value, 'fields');
  assert.ok(R.ORDER.UNIQUE_KEY > R.ORDER.REFERENCE_EXISTS, 'a cross-record check runs after lookups');
});
