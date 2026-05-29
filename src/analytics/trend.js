/**
 * trend.js — 趋势支出统计的纯函数（与 DOM 解耦，便于单元测试）。
 *
 * 输入 analyzeTrend 产出的 trendData（[{date, income, expense, ...}]），
 * 输出日均/最高/最低支出及对应日期；无支出区间不参与极值，全无支出时 hasExpense=false。
 */
(function (global) {
  'use strict';

  function computeExpenseStats(trendData) {
    const empty = { hasExpense: false, avg: 0, max: 0, maxDate: null, min: 0, minDate: null };
    if (!Array.isArray(trendData) || trendData.length === 0) return empty;

    const expenseEntries = trendData.filter(d => d && d.expense > 0);
    if (expenseEntries.length === 0) return empty;

    const avg = trendData.reduce((s, d) => s + (d.expense || 0), 0) / trendData.length;
    let maxEntry = expenseEntries[0];
    let minEntry = expenseEntries[0];
    for (const d of expenseEntries) {
      if (d.expense > maxEntry.expense) maxEntry = d;
      if (d.expense < minEntry.expense) minEntry = d;
    }
    return {
      hasExpense: true,
      avg,
      max: maxEntry.expense,
      maxDate: maxEntry.date,
      min: minEntry.expense,
      minDate: minEntry.date
    };
  }

  const api = { computeExpenseStats };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.computeExpenseStats = computeExpenseStats;
    global.BillAnalytics = Object.assign(global.BillAnalytics || {}, api);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
