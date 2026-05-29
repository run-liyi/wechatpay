/**
 * record-model.js — 跨来源统一的标准交易记录模型。
 *
 * 不同来源（微信 / 支付宝 / 银行流水）解析出的原始记录字段不一，本模块定义统一字段并提供
 * normalizeRecord，把原始记录规整为标准结构，并标注来源（source），为多源适配打基础。
 *
 * 为保持与既有渲染层兼容，标准记录仍以中文字段名为键（渲染层按这些键读取），
 * 额外补充 `来源` / `source` 字段。
 */

// 标准字段（中文键，渲染层直接消费）
const STANDARD_FIELDS = [
  '交易时间', '交易类型', '交易对方', '商品', '收/支',
  '金额(元)', '支付方式', '当前状态', '交易单号', '商户单号', '备注'
];

const SOURCE_LABELS = {
  wechat: '微信支付',
  alipay: '支付宝',
  bank: '银行流水',
  unknown: '未知来源'
};

/**
 * 把（已按规范字段名抽取的）原始记录规整为标准记录。
 * @param {object} raw 原始记录（键为规范中文字段名）
 * @param {string} source 来源标识，默认 'wechat'
 */
function normalizeRecord(raw, source = 'wechat') {
  const record = {};
  for (const field of STANDARD_FIELDS) {
    const v = raw && raw[field];
    record[field] = v != null ? v : '';
  }
  record['来源'] = SOURCE_LABELS[source] || SOURCE_LABELS.unknown;
  record.source = source;
  return record;
}

module.exports = { STANDARD_FIELDS, SOURCE_LABELS, normalizeRecord };
