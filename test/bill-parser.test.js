const { test } = require('node:test');
const assert = require('node:assert');
const { findHeaderRow, extractSheetRecords, dedupeRecords, normalizeHeaderCell } = require('../src/parse/bill-parser');

const STD_HEADER = ['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)', '支付方式', '当前状态'];

test('normalizeHeaderCell: 去空白与全角括号归一', () => {
  assert.strictEqual(normalizeHeaderCell(' 交易时间 '), '交易时间');
  assert.strictEqual(normalizeHeaderCell('金额（元）'), '金额(元)');
});

test('findHeaderRow: 标准表头定位', () => {
  const raw = [['微信支付账单明细'], STD_HEADER, ['2026-05-13', '商户消费', '店A', 'x', '支出', '10', '零钱', '支付成功']];
  assert.strictEqual(findHeaderRow(raw), 1);
});

test('extractSheetRecords: 序号列偏移 + 别名 + 表头空白', () => {
  const raw = [
    ['说明行'],
    ['序号', ' 交易时间 ', '类型', '对方', '商品', '收支', '金额', '付款方式', '状态'],
    ['1', '2026-05-13 10:00', '商户消费', '店A', 'x', '支出', '10', '零钱', '支付成功']
  ];
  const r = extractSheetRecords(raw);
  assert.ok(r);
  assert.strictEqual(r.records.length, 1);
  assert.strictEqual(r.records[0]['交易时间'], '2026-05-13 10:00');
  assert.strictEqual(r.records[0]['金额(元)'], '10');
  assert.strictEqual(r.records[0]['收/支'], '支出');
});

test('extractSheetRecords: 无表头返回 null；过滤 / 与 --- 占位行', () => {
  assert.strictEqual(extractSheetRecords([['乱七八糟'], ['a', 'b', 'c']]), null);
  const raw = [STD_HEADER,
    ['/', '', '', '', '', '', '', ''],
    ['2026-05-13', '商户消费', '店A', 'x', '支出', '10', '零钱', '支付成功'],
    ['------', '', '', '', '', '', '', '']
  ];
  assert.strictEqual(extractSheetRecords(raw).records.length, 1);
});

test('dedupeRecords: 按交易单号去重（缺号回退组合键）', () => {
  const recs = [
    { '交易时间': 't1', '交易对方': 'A', '金额(元)': '10', '收/支': '支出', '交易单号': 'X1' },
    { '交易时间': 't2', '交易对方': 'B', '金额(元)': '20', '收/支': '支出', '交易单号': 'X1' }, // 重复单号
    { '交易时间': 't3', '交易对方': 'C', '金额(元)': '30', '收/支': '支出', '交易单号': '' },
    { '交易时间': 't3', '交易对方': 'C', '金额(元)': '30', '收/支': '支出', '交易单号': '' }   // 组合键重复
  ];
  const out = dedupeRecords(recs);
  assert.strictEqual(out.length, 2);
});
