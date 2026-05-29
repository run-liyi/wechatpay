/**
 * chart-theme.js — 集中式图表主题与调色板。
 *
 * 暴露语义色（income/expense/neutral）、按数据条数自动生成的高区分度分类色板，以及统一的
 * Chart.defaults，替换 renderer.js 中散落的硬编码 RGBA，为后续暗色/多主题打底。
 */
(function (global) {
  'use strict';

  // 语义色：bg(填充) / border(描边) / fill(面积图浅填充)
  const SEMANTIC = {
    income:  { bg: 'rgba(7, 193, 96, 0.8)',  border: 'rgba(7, 193, 96, 1)',  fill: 'rgba(7, 193, 96, 0.2)' },
    expense: { bg: 'rgba(250, 81, 81, 0.8)', border: 'rgba(250, 81, 81, 1)', fill: 'rgba(250, 81, 81, 0.2)' },
    neutral: { bg: 'rgba(140, 140, 140, 0.8)', border: 'rgba(140, 140, 140, 1)', fill: 'rgba(140, 140, 140, 0.2)' }
  };

  // 主色（分类柱状图单系列）
  const PRIMARY = SEMANTIC.income;

  /**
   * 生成 n 个区分度高的颜色（按黄金角在 HSL 色环上均匀散布），
   * 数据条数超过固定调色板时也不会循环重复或缺色。
   */
  function generatePalette(n, alpha = 0.8) {
    const colors = [];
    const golden = 137.508; // 黄金角
    for (let i = 0; i < n; i++) {
      const hue = (i * golden) % 360;
      const sat = 62 + (i % 3) * 8;      // 62/70/78
      const light = 52 + (i % 2) * 8;    // 52/60
      colors.push(`hsla(${hue.toFixed(1)}, ${sat}%, ${light}%, ${alpha})`);
    }
    return colors;
  }

  // 统一 Chart.js 全局默认（字体、文字色、网格、tooltip）
  function applyChartDefaults(Chart) {
    if (!Chart || !Chart.defaults) return;
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    Chart.defaults.color = '#333333';
    Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.08)';
    if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
      Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(25, 25, 25, 0.9)';
      Chart.defaults.plugins.tooltip.padding = 10;
      Chart.defaults.plugins.tooltip.cornerRadius = 6;
    }
  }

  const api = { SEMANTIC, PRIMARY, generatePalette, applyChartDefaults };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.ChartTheme = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
