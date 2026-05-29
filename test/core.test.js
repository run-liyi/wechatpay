const { test } = require('node:test');
const assert = require('node:assert');
const { classifyRecord, analyzeOverview, analyzeByDimension, analyzeTrend } = require('../src/core/analytics');

const rec = (o) => Object.assign({ '交易时间': '2026-05-13 10:00:00', '交易类型': '商户消费', '交易对方': '店A', '商品': 'x', '收/支': '支出', '金额(元)': '10', '支付方式': '零钱', '当前状态': '支付成功' }, o);

test('classifyRecord: 收支方向与退款判定', () => {
  assert.strictEqual(classifyRecord(rec({ '收/支': '收入' })).direction, 'income');
  assert.strictEqual(classifyRecord(rec({ '收/支': '支出' })).direction, 'expense');
  assert.strictEqual(classifyRecord(rec({ '收/支': '不计收支' })).direction, 'neutral');
  assert.strictEqual(classifyRecord(rec({ '当前状态': '已退款' })).refunded, true);
  assert.strictEqual(classifyRecord(rec({ '金额(元)': '¥1,234.50' })).amount, 1234.5);
});

test('analyzeOverview: 已退款剔除、净收支正确、中性单列', () => {
  const data = [
    rec({ '收/支': '收入', '金额(元)': '100' }),
    rec({ '收/支': '支出', '金额(元)': '30' }),
    rec({ '收/支': '支出', '金额(元)': '20', '当前状态': '已退款' }), // 退款，剔除
    rec({ '收/支': '不计收支', '金额(元)': '500' })                    // 中性
  ];
  const a = analyzeOverview(data);
  assert.strictEqual(a.totalIncome, 100);
  assert.strictEqual(a.totalExpense, 30);          // 不含退款 20
  assert.strictEqual(a.expenseCount, 1);
  assert.strictEqual(a.refundedAmount, 20);
  assert.strictEqual(a.refundedCount, 1);
  assert.strictEqual(a.neutralAmount, 500);
  assert.strictEqual(a.neutralCount, 1);
  assert.strictEqual(a.totalIncome - a.totalExpense, 70); // 净收支
});

test('analyzeByDimension: 维度聚合且退款不计入支出额', () => {
  const data = [
    rec({ '支付方式': '零钱', '金额(元)': '10' }),
    rec({ '支付方式': '零钱', '金额(元)': '40', '当前状态': '已退款' }),
    rec({ '支付方式': '银行卡', '收/支': '收入', '金额(元)': '100' })
  ];
  const stats = analyzeByDimension(data, '支付方式');
  const byName = Object.fromEntries(stats.map(s => [s.name, s]));
  assert.strictEqual(byName['零钱'].expenseAmount, 10); // 退款 40 不计入
  assert.strictEqual(byName['零钱'].count, 2);
  assert.strictEqual(byName['银行卡'].incomeAmount, 100);
});

test('analyzeTrend: 按日聚合，退款不计入支出', () => {
  const data = [
    rec({ '交易时间': '2026-05-13 09:00:00', '金额(元)': '30' }),
    rec({ '交易时间': '2026-05-13 18:00:00', '金额(元)': '20', '当前状态': '已退款' }),
    rec({ '交易时间': '2026-05-14 12:00:00', '收/支': '收入', '金额(元)': '50' })
  ];
  const t = analyzeTrend(data, 'daily');
  assert.strictEqual(t.length, 2);
  assert.strictEqual(t[0].date, '2026-05-13');
  assert.strictEqual(t[0].expense, 30);  // 退款 20 不计入
  assert.strictEqual(t[1].income, 50);
});
