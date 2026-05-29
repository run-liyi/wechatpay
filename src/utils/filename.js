/**
 * filename.js — 跨平台文件名提取（同时按 / 与 \ 切分）。
 * 浏览器全局（window.extractFileName / BillUtils）与 CommonJS 双形态导出。
 */
(function (global) {
  'use strict';

  function extractFileName(p) {
    if (p == null) return '';
    const parts = String(p).split(/[\\/]/);
    return parts[parts.length - 1] || '';
  }

  const api = { extractFileName };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.extractFileName = extractFileName;
    global.BillUtils = Object.assign(global.BillUtils || {}, api);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
