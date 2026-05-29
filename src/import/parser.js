/**
 * parser.js — 账单解析编排（纯函数，不依赖 Electron / fs / XLSX）。
 *
 * 输入：各 sheet 的二维数组（rawSheets，由主进程用 XLSX 读出后传入）。
 * 输出：规整后的标准交易记录数组、元数据、成功解析的 sheet 数。
 *
 * 复用 bill-parser 的表头定位/记录抽取/去重，并通过 record-model 规整为统一模型。
 * 可独立 require 调用，便于单元测试与后续多源适配。
 */
const { extractSheetRecords, dedupeRecords } = require('../parse/bill-parser');
const { normalizeRecord } = require('./record-model');

// 从说明区（表头之前的行）提取微信账单元数据
function extractMetadata(rawData, headerRowIndex) {
  const metadata = {
    nickname: '', startTime: '', endTime: '', exportType: '', exportTime: '',
    totalCount: 0, incomeCount: 0, incomeAmount: 0,
    expenseCount: 0, expenseAmount: 0, neutralCount: 0, neutralAmount: 0
  };

  for (let i = 0; i < headerRowIndex; i++) {
    const row = rawData[i];
    if (!row || !row[0]) continue;
    const text = row[0].toString();

    if (text.includes('微信昵称')) {
      const m = text.match(/微信昵称：\[(.+?)\]/);
      if (m) metadata.nickname = m[1];
    }
    if (text.includes('起始时间')) {
      const s = text.match(/起始时间：\[(.+?)\]/);
      const e = text.match(/终止时间：\[(.+?)\]/);
      if (s) metadata.startTime = s[1];
      if (e) metadata.endTime = e[1];
    }
    if (text.includes('导出类型')) {
      const m = text.match(/导出类型：\[(.+?)\]/);
      if (m) metadata.exportType = m[1];
    }
    if (text.includes('导出时间')) {
      const m = text.match(/导出时间：\[(.+?)\]/);
      if (m) metadata.exportTime = m[1];
    }
    if (text.match(/^共\d+笔记录/)) {
      const m = text.match(/共(\d+)笔记录/);
      if (m) metadata.totalCount = parseInt(m[1]);
    }
    if (text.includes('收入：')) {
      const c = text.match(/收入：(\d+)笔/);
      const a = text.match(/(\d+\.?\d*)元/);
      if (c) metadata.incomeCount = parseInt(c[1]);
      if (a) metadata.incomeAmount = parseFloat(a[1]);
    }
    if (text.includes('支出：')) {
      const c = text.match(/支出：(\d+)笔/);
      const a = text.match(/(\d+\.?\d*)元/);
      if (c) metadata.expenseCount = parseInt(c[1]);
      if (a) metadata.expenseAmount = parseFloat(a[1]);
    }
    if (text.includes('中性交易：')) {
      const c = text.match(/中性交易：(\d+)笔/);
      const a = text.match(/(\d+\.?\d*)元/);
      if (c) metadata.neutralCount = parseInt(c[1]);
      if (a) metadata.neutralAmount = parseFloat(a[1]);
    }
  }
  return metadata;
}

/**
 * 解析多个 sheet 的二维数组，合并、规整、去重。
 * @param {Array<Array<Array>>} rawSheets 每个元素是一个 sheet 的二维数组
 * @param {string} source 来源标识，默认 'wechat'
 * @returns {{records: object[], metadata: object|null, parsedSheetCount: number}}
 */
function parseSheets(rawSheets, source = 'wechat') {
  let allRecords = [];
  let metadata = null;
  let parsedSheetCount = 0;

  for (const rawData of rawSheets || []) {
    const parsed = extractSheetRecords(rawData);
    if (!parsed) continue;
    allRecords = allRecords.concat(parsed.records.map(r => normalizeRecord(r, source)));
    parsedSheetCount++;
    if (!metadata) metadata = extractMetadata(rawData, parsed.headerRowIndex);
  }

  return { records: dedupeRecords(allRecords), metadata, parsedSheetCount };
}

module.exports = { parseSheets, extractMetadata };
