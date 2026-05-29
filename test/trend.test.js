const { test } = require('node:test');
const assert = require('node:assert');
const { computeExpenseStats } = require('../src/analytics/trend');

test('computeExpenseStats: 空数组不报错且 hasExpense=false', () => {
  const s = computeExpenseStats([]);
  assert.strictEqual(s.hasExpense, false);
  assert.strictEqual(s.avg, 0);
  assert.strictEqual(s.maxDate, null);
});

test('computeExpenseStats: 全为收入(无支出)', () => {
  const s = computeExpenseStats([
    { date: '2026-05-13', expense: 0, income: 100 },
    { date: '2026-05-14', expense: 0, income: 50 }
  ]);
  assert.strictEqual(s.hasExpense, false);
});

test('computeExpenseStats: 极值仅取有支出区间，均值含全部区间', () => {
  const s = computeExpenseStats([
    { date: '2026-05-13', expense: 30 },
    { date: '2026-05-14', expense: 0 },
    { date: '2026-05-15', expense: 120 }
  ]);
  assert.strictEqual(s.hasExpense, true);
  assert.strictEqual(s.avg, 50);          // (30+0+120)/3
  assert.strictEqual(s.max, 120);
  assert.strictEqual(s.maxDate, '2026-05-15');
  assert.strictEqual(s.min, 30);          // 跳过 0 支出日
  assert.strictEqual(s.minDate, '2026-05-13');
});
