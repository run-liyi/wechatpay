/**
 * amount.js — 健壮的金额解析工具。
 *
 * 微信/银行账单的「金额(元)」列可能出现：货币符号（¥ ￥ $）、千分位逗号（1,234.50）、
 * 全角数字与符号（１２３４．５０，）、前后空白、以及「元」等单位后缀。直接 parseFloat 会
 * 在这些情况下得到 NaN，旧代码再用 `|| 0` 静默归零，导致收支统计偏小。
 *
 * parseAmount 先做全角归一化，再剥离货币符号/单位/千分位，最后提取数值；无法解析时返回 0
 * 并打印一次可诊断告警（而非静默吞掉）。
 *
 * 该文件同时支持浏览器 <script> 全局引入（window.parseAmount / window.BillUtils.parseAmount）
 * 与 CommonJS（module.exports），便于后续单元测试直接 require。
 */
(function (global) {
  'use strict';

  // 全角 → 半角（数字、点、逗号、正负号）
  function toHalfWidth(s) {
    return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
            .replace(/．/g, '.')   // ．
            .replace(/，/g, ',')   // ，
            .replace(/＋/g, '+')   // ＋
            .replace(/[－−‒–—]/g, '-'); // － − 等各种横线
  }

  function parseAmount(raw) {
    if (raw === null || raw === undefined) return 0;
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0;

    let s = String(raw).trim();
    if (s === '') return 0;

    // 全角归一化
    s = toHalfWidth(s);
    // 去除货币符号、常见单位与空白
    s = s.replace(/[¥￥$€£\s]/g, '').replace(/元|人民币|RMB|CNY/gi, '');
    // 去千分位逗号
    s = s.replace(/,/g, '');

    // 提取数值（允许前置正负号、可选小数）
    const m = s.match(/[-+]?\d+(?:\.\d+)?/);
    if (!m) {
      // 仅在确有内容却无法解析时告警，避免对 '/'、'-' 这类占位符过度噪声
      if (/\d/.test(s)) {
        // 含数字却仍无法匹配，几乎不会发生，但仍提示
        warnOnce(raw);
      }
      return 0;
    }
    const n = parseFloat(m[0]);
    return isFinite(n) ? n : 0;
  }

  // 简单去重，避免同一异常值刷屏
  const _warned = new Set();
  function warnOnce(raw) {
    const key = String(raw);
    if (_warned.has(key)) return;
    _warned.add(key);
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[parseAmount] 无法解析金额，按 0 处理：', raw);
    }
  }

  const api = { parseAmount, toHalfWidth };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.parseAmount = parseAmount;
    global.BillUtils = Object.assign(global.BillUtils || {}, api);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
