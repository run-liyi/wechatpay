const { test } = require('node:test');
const assert = require('node:assert');
const { parseAmount } = require('../src/utils/amount');

test('parseAmount: 货币符号/千分位/全角/单位', () => {
  assert.strictEqual(parseAmount('¥1,234.50'), 1234.5);
  assert.strictEqual(parseAmount('1,234.50元'), 1234.5);
  assert.strictEqual(parseAmount('￥1234.5'), 1234.5);
  assert.strictEqual(parseAmount('１２３４．５'), 1234.5);
  assert.strictEqual(parseAmount('  ¥ 2,000 '), 2000);
  assert.strictEqual(parseAmount('-¥50'), -50);
});

test('parseAmount: 纯数字与数值类型', () => {
  assert.strictEqual(parseAmount('100.00'), 100);
  assert.strictEqual(parseAmount('88'), 88);
  assert.strictEqual(parseAmount(12.34), 12.34);
});

test('parseAmount: 非法/占位输入返回 0 且不抛异常', () => {
  assert.strictEqual(parseAmount(''), 0);
  assert.strictEqual(parseAmount('/'), 0);
  assert.strictEqual(parseAmount('abc'), 0);
  assert.strictEqual(parseAmount(null), 0);
  assert.strictEqual(parseAmount(undefined), 0);
});
