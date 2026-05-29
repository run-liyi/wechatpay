/**
 * core/analytics.js — 交易规范化与统计聚合核心（纯函数，与 DOM 解耦）。
 *
 * 从 renderer.js 抽出 classifyRecord / analyzeOverview / analyzeByDimension / analyzeTrend /
 * formatDate，便于单元测试与被 CLI、未来 Web 版等复用。
 *
 * 依赖 parseAmount / parseDate：Node 下经 require 注入，浏览器下取自全局（amount.js/date.js 先加载）。
 * 浏览器中各函数会挂到 window 全局，renderer.js 仍可直接调用，行为不变。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const { parseAmount } = require('../utils/amount');
    const { parseDate } = require('../utils/date');
    module.exports = factory(parseAmount, parseDate);
  } else {
    const api = factory(root.parseAmount, root.parseDate);
    root.BillCore = api;
    Object.assign(root, api); // 暴露为全局，渲染层沿用原有调用方式
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this),
function (parseAmount, parseDate) {
  'use strict';

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 统一交易规整：判定收支方向、是否已退款、金额
  function classifyRecord(record) {
    const type = record['收/支'];
    const status = (record['当前状态'] || '').toString();
    const amount = parseAmount(record['金额(元)']);
    const refunded = status.includes('已退款') || status.includes('全额退款') || status.includes('退款成功');

    let direction;
    if (type === '收入') direction = 'income';
    else if (type === '支出') direction = 'expense';
    else direction = 'neutral'; // 不计收支 / 中性交易

    return { direction, refunded, amount };
  }

  function analyzeOverview(data) {
    let totalIncome = 0, totalExpense = 0, incomeCount = 0, expenseCount = 0;
    let neutralAmount = 0, neutralCount = 0, refundedAmount = 0, refundedCount = 0;
    let dates = [];

    data.forEach(record => {
      const { direction, refunded, amount } = classifyRecord(record);
      if (direction === 'income') {
        totalIncome += amount;
        incomeCount++;
      } else if (direction === 'expense') {
        if (refunded) {
          refundedAmount += amount;
          refundedCount++;
        } else {
          totalExpense += amount;
          expenseCount++;
        }
      } else {
        neutralAmount += amount;
        neutralCount++;
      }

      const dateStr = record['交易时间'];
      if (dateStr) {
        const d = parseDate(dateStr);
        if (d) dates.push(d);
      }
    });

    dates.sort((a, b) => a - b);
    const dateRange = {
      start: dates.length > 0 ? formatDate(dates[0]) : '-',
      end: dates.length > 0 ? formatDate(dates[dates.length - 1]) : '-'
    };

    return {
      totalIncome, totalExpense, incomeCount, expenseCount,
      neutralAmount, neutralCount, refundedAmount, refundedCount, dateRange
    };
  }

  function analyzeByDimension(data, dimension) {
    const stats = {};
    data.forEach(record => {
      const key = record[dimension] || '未知';
      const { direction, refunded, amount } = classifyRecord(record);
      if (!stats[key]) {
        stats[key] = { count: 0, totalAmount: 0, incomeAmount: 0, expenseAmount: 0 };
      }
      stats[key].count++;
      stats[key].totalAmount += amount;
      if (direction === 'income') {
        stats[key].incomeAmount += amount;
      } else if (direction === 'expense' && !refunded) {
        stats[key].expenseAmount += amount;
      }
    });

    return Object.entries(stats).map(([key, value]) => ({
      name: key,
      ...value
    })).sort((a, b) => b.totalAmount - a.totalAmount);
  }

  function analyzeTrend(data, granularity) {
    const trends = {};
    data.forEach(record => {
      const dateStr = record['交易时间'];
      if (!dateStr) return;
      const date = parseDate(dateStr);
      if (!date) return;
      let key;
      switch (granularity) {
        case 'daily':
          key = formatDate(date);
          break;
        case 'weekly': {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = formatDate(weekStart);
          break;
        }
        case 'monthly':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      if (!trends[key]) {
        trends[key] = { income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };
      }

      const { direction, refunded, amount } = classifyRecord(record);
      if (direction === 'income') {
        trends[key].income += amount;
        trends[key].incomeCount++;
      } else if (direction === 'expense' && !refunded) {
        trends[key].expense += amount;
        trends[key].expenseCount++;
      }
    });

    return Object.entries(trends)
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return { formatDate, classifyRecord, analyzeOverview, analyzeByDimension, analyzeTrend };
});
