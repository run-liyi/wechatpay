const { test } = require('node:test');
const assert = require('node:assert');
const { parseSheets, extractMetadata } = require('../src/import/parser');
const { normalizeRecord, STANDARD_FIELDS } = require('../src/import/record-model');

const HEADER = ['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)', '支付方式', '当前状态', '交易单号', '商户单号', '备注'];
const meta = ['微信支付账单明细', '微信昵称：[演示用户]', '共2笔记录', '----列表----'];
function row(t, amt, io, order) {
  return [t, '商户消费', '店A', 'x', io, amt, '零钱', '支付成功', order, 'H1', ''];
}

test('normalizeRecord: 补齐标准字段并标注来源', () => {
  const r = normalizeRecord({ '交易时间': 't', '金额(元)': '10' }, 'wechat');
  for (const f of STANDARD_FIELDS) assert.ok(f in r);
  assert.strictEqual(r['来源'], '微信支付');
  assert.strictEqual(r.source, 'wechat');
  assert.strictEqual(r['交易对方'], ''); // 缺失字段补空
});

test('parseSheets: 合并多 sheet、去重、规整、元数据', () => {
  const s1 = [...meta.map(t => [t]), HEADER, row('2026-05-13 10:00', '10', '支出', 'O1'), row('2026-05-13 11:00', '20', '收入', 'O2')];
  const s2 = [[ '六月' ], HEADER, row('2026-06-01 10:00', '30', '支出', 'O2'), row('2026-06-01 11:00', '40', '支出', 'O3')]; // O2 与 s1 重复
  const { records, metadata, parsedSheetCount } = parseSheets([s1, s2], 'wechat');
  assert.strictEqual(parsedSheetCount, 2);
  assert.strictEqual(records.length, 3);             // O1,O2,O3（O2 去重）
  assert.strictEqual(metadata.nickname, '演示用户');  // 取首个含表头 sheet
  assert.strictEqual(records[0].source, 'wechat');
});

test('parseSheets: 无表头时 parsedSheetCount=0', () => {
  const { parsedSheetCount, records } = parseSheets([[['乱'], ['a', 'b']]]);
  assert.strictEqual(parsedSheetCount, 0);
  assert.strictEqual(records.length, 0);
});

test('extractMetadata: 解析收入/支出/中性笔数金额', () => {
  const raw = [['微信昵称：[张三]'], ['收入：2笔 100.00元'], ['支出：3笔 50.50元'], ['中性交易：1笔 500.00元'], HEADER];
  const m = extractMetadata(raw, 4);
  assert.strictEqual(m.nickname, '张三');
  assert.strictEqual(m.incomeCount, 2);
  assert.strictEqual(m.expenseCount, 3);
  assert.strictEqual(m.neutralCount, 1);
  assert.strictEqual(m.neutralAmount, 500);
});
