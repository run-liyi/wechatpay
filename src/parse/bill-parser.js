/**
 * bill-parser.js — 账单解析的纯函数（不依赖 Electron / fs / XLSX，便于单元测试）。
 *
 * 提供表头归一化、列别名映射、表头定位、记录抽取与跨 sheet 去重。
 * 输入为 sheet 的二维数组（rawData），输出为标准字段记录数组。
 */

// 表头单元格归一化：去除所有空白(含全角空格)、全角括号转半角，便于容忍变体与列偏移
function normalizeHeaderCell(cell) {
  if (cell == null) return '';
  return String(cell)
    .replace(/[\s　]/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
}

// 列别名 -> 规范字段名（键为归一化后的形式）
const COLUMN_ALIASES = {
  '交易时间': '交易时间', '交易日期': '交易时间', '时间': '交易时间',
  '交易类型': '交易类型', '交易分类': '交易类型', '类型': '交易类型',
  '交易对方': '交易对方', '对方': '交易对方', '交易对方名称': '交易对方', '商户名称': '交易对方',
  '商品': '商品', '商品说明': '商品', '商品名称': '商品',
  '收/支': '收/支', '收支': '收/支', '收入/支出': '收/支', '收支类型': '收/支',
  '金额(元)': '金额(元)', '金额': '金额(元)', '交易金额': '金额(元)',
  '支付方式': '支付方式', '支付渠道': '支付方式', '收/付款方式': '支付方式', '付款方式': '支付方式',
  '当前状态': '当前状态', '交易状态': '当前状态', '状态': '当前状态',
  '交易单号': '交易单号', '订单号': '交易单号', '微信支付订单号': '交易单号', '交易订单号': '交易单号',
  '商户单号': '商户单号', '商户订单号': '商户单号',
  '备注': '备注'
};

// 逐行扫描定位表头：命中规范列达到阈值且包含「交易时间」即判定为表头行（容忍序号列/空白/变体）
function findHeaderRow(rawData) {
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (!Array.isArray(row)) continue;
    let hits = 0;
    let hasTime = false;
    for (const cell of row) {
      const canon = COLUMN_ALIASES[normalizeHeaderCell(cell)];
      if (canon) {
        hits++;
        if (canon === '交易时间') hasTime = true;
      }
    }
    if (hasTime && hits >= 3) return i;
  }
  return -1;
}

// 在单个 sheet 的二维数组中定位表头并抽取记录；无表头返回 null
function extractSheetRecords(rawData) {
  const headerRowIndex = findHeaderRow(rawData);
  if (headerRowIndex === -1) return null;

  // 列索引 -> 规范字段名（命中别名用规范名，否则保留去空白后的原始名），容忍列偏移
  const headerRow = rawData[headerRowIndex];
  const colMap = headerRow.map(cell => {
    const norm = normalizeHeaderCell(cell);
    return COLUMN_ALIASES[norm] || norm;
  });

  const records = rawData.slice(headerRowIndex + 1)
    .filter(row => Array.isArray(row) && row.some(c => c !== '' && c != null))
    .map(row => {
      const record = {};
      colMap.forEach((name, index) => {
        if (name) record[name] = row[index] != null ? row[index] : '';
      });
      return record;
    })
    .filter(record => {
      return record['交易时间'] &&
             record['交易时间'] !== '/' &&
             !record['交易时间'].toString().includes('---');
    });

  return { headerRowIndex, records };
}

// 跨 sheet 合并后去重：优先按「交易单号」，缺单号时回退到 时间+对方+金额+收支 组合键
function dedupeRecords(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const orderNo = (r['交易单号'] || '').toString().trim();
    const key = orderNo || [r['交易时间'], r['交易对方'], r['金额(元)'], r['收/支']].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

module.exports = {
  normalizeHeaderCell,
  COLUMN_ALIASES,
  findHeaderRow,
  extractSheetRecords,
  dedupeRecords
};
