const { test } = require('node:test');
const assert = require('node:assert');
const { parseDate } = require('../src/utils/date');

const ymd = d => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('parseDate: 多种分隔符格式', () => {
  assert.strictEqual(ymd(parseDate('2026-05-13 11:33:05')), '2026-05-13');
  assert.strictEqual(ymd(parseDate('2026/05/13')), '2026-05-13');
  assert.strictEqual(ymd(parseDate('2026.05.13')), '2026-05-13');
  assert.strictEqual(ymd(parseDate('2026年5月13日')), '2026-05-13');
  assert.strictEqual(ymd(parseDate('2026-05-13T09:08:07')), '2026-05-13');
});

test('parseDate: 含时间部分被正确解析', () => {
  const d = parseDate('2026-05-13 11:33:05');
  assert.strictEqual(d.getHours(), 11);
  assert.strictEqual(d.getMinutes(), 33);
  assert.strictEqual(d.getSeconds(), 5);
});

test('parseDate: 非法日期返回 null', () => {
  assert.strictEqual(parseDate('2026-13-01'), null); // 月越界
  assert.strictEqual(parseDate('2026-02-31'), null); // 日越界（进位被拒绝）
  assert.strictEqual(parseDate(''), null);
  assert.strictEqual(parseDate('/'), null);
  assert.strictEqual(parseDate('not a date'), null);
});
