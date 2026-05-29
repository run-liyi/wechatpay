/**
 * date.js — 稳健的日期解析工具。
 *
 * 账单时间字符串（如「2026-05-13 11:33:05」「2026/05/13」「2026.05.13」「2026年5月13日」）
 * 直接交给 `new Date(str)` 在不同运行时解析结果不稳定，甚至得到 Invalid Date 后静默传播，
 * 导致日期范围与周/月聚合错乱。
 *
 * parseDate 先按常见账单格式显式匹配（分隔符 - / . 年月日 与可选时间部分），失败时再尝试一次
 * 受校验的 `new Date`，无法解析时返回 null，交由上层安全跳过。
 *
 * 同时支持浏览器 <script> 全局引入与 CommonJS（便于单元测试）。
 */
(function (global) {
  'use strict';

  function parseDate(input) {
    if (input == null) return null;
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

    const s = String(input).trim();
    if (s === '') return null;

    // yyyy(-|/|.|年) MM (-|/|.|月) dd (日)?  可选  HH:mm(:ss)?
    const m = s.match(
      /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
    );
    if (m) {
      const [, y, mo, da, hh, mi, ss] = m;
      const year = Number(y), month = Number(mo), day = Number(da);
      // 基本范围校验，避免 13 月、32 日被 Date 滚动进位
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const d = new Date(year, month - 1, day, Number(hh || 0), Number(mi || 0), Number(ss || 0));
      if (isNaN(d.getTime()) || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
      return d;
    }

    // 受校验的兜底：仅接受能解析为有效日期的字符串（如标准 ISO）
    const fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  const api = { parseDate };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.parseDate = parseDate;
    global.BillUtils = Object.assign(global.BillUtils || {}, api);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
