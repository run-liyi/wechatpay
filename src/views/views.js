// views.js — 视图层：视图切换与各视图渲染（概览/分析/分类/趋势）。
import { renderTable, setChartEmpty, setEmptyState } from '../dom/ui.js';
import { renderCategoryChart, renderIncomeExpenseChart, renderPaymentMethodChart, renderTransactionTypeChart, renderTrendChart } from '../charts/charts.js';
import { updateDetailView } from './detail-table.js';
import { state } from '../state.js';
import { computeExpenseStats } from '../analytics/trend.js';
import { analyzeByDimension, analyzeOverview, analyzeTrend, classifyRecord } from '../core/analytics.js';

export function switchView(viewName) {
    const views = document.querySelectorAll('.view-container');
    views.forEach(view => view.classList.remove('active'));
    
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
        targetView.classList.add('active');
        state.currentView = viewName;

        // 已加载过文件后即更新视图（含 0 条记录时显示空状态）
        if (state.fileLoaded) {
            updateViewData(viewName);
        }
    }
}

export function updateViewData(viewName) {
    // 解析出 0 条记录时，各视图显示统一空状态占位而非空图表/空白
    if (!state.billData || state.billData.length === 0) {
        renderEmptyStateForView(viewName);
        return;
    }
    switch(viewName) {
        case 'overview':
            updateOverviewView();
            break;
        case 'analysis':
            updateAnalysisView();
            break;
        case 'category':
            updateCategoryView();
            break;
        case 'trend':
            updateTrendView();
            break;
        case 'detail':
            updateDetailView();
            break;
    }
}

export function updateOverviewView() {
    const analysis = analyzeOverview(state.billData);
    
    document.getElementById('totalIncome').textContent = `¥${analysis.totalIncome.toFixed(2)}`;
    document.getElementById('incomeCount').textContent = `${analysis.incomeCount}笔`;
    
    document.getElementById('totalExpense').textContent = `¥${analysis.totalExpense.toFixed(2)}`;
    // 已退款支出已从有效支出剔除，附注说明
    document.getElementById('expenseCount').textContent = analysis.refundedCount > 0
        ? `${analysis.expenseCount}笔（不含已退款${analysis.refundedCount}笔）`
        : `${analysis.expenseCount}笔`;

    const netBalance = analysis.totalIncome - analysis.totalExpense;
    document.getElementById('netBalance').textContent = `¥${netBalance.toFixed(2)}`;
    document.getElementById('balanceStatus').textContent = netBalance >= 0 ? '收入大于支出' : '支出大于收入';

    // 中性交易（不计收支）单独展示
    const neutralEl = document.getElementById('totalNeutral');
    if (neutralEl) {
        neutralEl.textContent = `¥${analysis.neutralAmount.toFixed(2)}`;
        const nc = document.getElementById('neutralCount');
        if (nc) nc.textContent = `${analysis.neutralCount}笔`;
    }

    document.getElementById('totalTransactions').textContent = state.billData.length;
    document.getElementById('dateRange').textContent = `${analysis.dateRange.start} 至 ${analysis.dateRange.end}`;
    
    document.getElementById('metaNickname').textContent = state.metadata.nickname || '-';
    document.getElementById('metaDateRange').textContent = 
        state.metadata.startTime && state.metadata.endTime ? `${state.metadata.startTime} 至 ${state.metadata.endTime}` : '-';
    document.getElementById('metaExportTime').textContent = state.metadata.exportTime || '-';
    document.getElementById('metaExportType').textContent = state.metadata.exportType || '-';
    
    renderIncomeExpenseChart(analysis);
}

// classifyRecord / analyzeOverview 已抽至 src/core/analytics.js（全局可用）

export function updateAnalysisView() {
    const paymentMethodStats = analyzeByDimension(state.billData, '支付方式');
    const transactionTypeStats = analyzeByDimension(state.billData, '交易类型');
    const statusStats = analyzeByDimension(state.billData, '当前状态');
    
    renderPaymentMethodChart(paymentMethodStats);
    renderTransactionTypeChart(transactionTypeStats);
    renderStatusStats(statusStats);
}

// analyzeByDimension 已抽至 src/core/analytics.js（全局可用）

export function renderStatusStats(stats) {
    const container = document.getElementById('statusStats');

    const rows = stats.map(stat => [
        stat.name,
        stat.count,
        `¥${stat.totalAmount.toFixed(2)}`,
        { text: `¥${stat.incomeAmount.toFixed(2)}`, className: 'amount-income' },
        { text: `¥${stat.expenseAmount.toFixed(2)}`, className: 'amount-expense' }
    ]);

    renderTable(container, ['状态', '交易笔数', '总金额', '收入', '支出'], rows);
}

export function updateCategoryView() {
    const dimension = document.getElementById('categoryDimension').value;
    const sortBy = document.getElementById('categorySortBy').value;
    const topN = document.getElementById('categoryTopN').value;
    
    let dimensionKey;
    switch(dimension) {
        case 'merchant':
            dimensionKey = '交易对方';
            break;
        case 'type':
            dimensionKey = '交易类型';
            break;
        case 'paymentMethod':
            dimensionKey = '支付方式';
            break;
    }
    
    let stats = analyzeByDimension(state.billData, dimensionKey);
    
    if (sortBy === 'amount') {
        stats.sort((a, b) => b.totalAmount - a.totalAmount);
    } else {
        stats.sort((a, b) => b.count - a.count);
    }
    
    if (topN !== 'all') {
        stats = stats.slice(0, parseInt(topN));
    }
    
    renderCategoryChart(stats, sortBy);
    renderCategoryTable(stats);
}

export function renderCategoryTable(stats) {
    const container = document.getElementById('categoryTable');

    const rows = stats.map((stat, index) => [
        index + 1,
        stat.name,
        stat.count,
        `¥${stat.totalAmount.toFixed(2)}`,
        { text: `¥${stat.incomeAmount.toFixed(2)}`, className: 'amount-income' },
        { text: `¥${stat.expenseAmount.toFixed(2)}`, className: 'amount-expense' }
    ]);

    renderTable(container, ['排名', '名称', '交易次数', '总金额', '收入', '支出'], rows);
}

export function updateTrendView() {
    const granularity = document.getElementById('trendGranularity').value;
    const dataType = document.getElementById('trendDataType').value;
    
    const trendData = analyzeTrend(state.billData, granularity);
    renderTrendChart(trendData, dataType);
    updateTrendStats(trendData);
}

// analyzeTrend 已抽至 src/core/analytics.js（全局可用）

export function updateTrendStats(trendData) {
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    // 纯计算交由 computeExpenseStats（已抽离便于单测）：含空数据/全无支出兜底
    const stats = computeExpenseStats(trendData);

    if (!stats.hasExpense) {
        setText('avgDailyExpense', '¥0.00');
        setText('maxDailyExpense', '¥0.00');
        setText('maxExpenseDate', '暂无支出');
        setText('minDailyExpense', '¥0.00');
        setText('minExpenseDate', '暂无支出');
        return;
    }

    setText('avgDailyExpense', `¥${stats.avg.toFixed(2)}`);
    setText('maxDailyExpense', `¥${stats.max.toFixed(2)}`);
    setText('maxExpenseDate', stats.maxDate);
    setText('minDailyExpense', `¥${stats.min.toFixed(2)}`);
    setText('minExpenseDate', stats.minDate);
}

export function renderEmptyStateForView(viewName) {
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    switch (viewName) {
        case 'overview':
            setText('totalIncome', '¥0.00'); setText('incomeCount', '0笔');
            setText('totalExpense', '¥0.00'); setText('expenseCount', '0笔');
            setText('netBalance', '¥0.00'); setText('balanceStatus', '-');
            setText('totalTransactions', '0'); setText('dateRange', '-');
            setText('metaNickname', state.metadata.nickname || '-');
            setChartEmpty('incomeExpenseChart', '暂无数据');
            break;
        case 'analysis':
            setChartEmpty('paymentMethodChart', '暂无数据');
            setChartEmpty('transactionTypeChart', '暂无数据');
            setEmptyState('statusStats', '暂无数据', '请导入包含交易记录的账单');
            break;
        case 'category':
            setChartEmpty('categoryChart', '暂无数据');
            setEmptyState('categoryTable', '暂无数据', '请导入包含交易记录的账单');
            break;
        case 'trend':
            setChartEmpty('trendChart', '暂无数据');
            updateTrendStats([]); // 复用 PR7 的空数据兜底
            break;
        case 'detail':
            setEmptyState('detailTable', '暂无数据', '请导入包含交易记录的账单');
            setText('filteredCount', '0');
            setText('filteredAmount', '¥0.00');
            break;
    }
}

/**
 * 安全地把数据渲染为表格，避免 innerHTML 拼接导致的 XSS。
 * 所有单元格内容均通过 textContent 写入，不会被解释为 HTML。
 * @param {HTMLElement} container 目标容器
 * @param {string[]} headers 表头文本数组
 * @param {Array<Array<string|number|{text:string,className?:string}>>} rows 行数据
 */
