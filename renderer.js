// 渲染进程不再直接 require('electron')；通过 preload 暴露的最小化白名单 window.billAPI 调用 IPC。

let billData = [];
let metadata = {};
let currentView = 'welcome';
let charts = {};
let fileLoaded = false;

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// 需要持久化的视图偏好下拉项
const PREF_SELECTS = ['categoryDimension', 'categorySortBy', 'categoryTopN', 'trendGranularity', 'trendDataType'];
let viewPrefs = {};

async function initializeApp() {
    setupEventListeners();
    setupNavigation();
    setupModal();
    setupPreferencePersistence();
    await restorePreferences();
    await loadPersistedData();
}

// 启动时从配置层恢复视图偏好（重启后仍保留）
async function restorePreferences() {
    if (!window.billAPI || !window.billAPI.config) return;
    try {
        const res = await window.billAPI.config.getAll();
        viewPrefs = (res && res.config && res.config.viewPrefs) || {};
        PREF_SELECTS.forEach(id => {
            const el = document.getElementById(id);
            if (el && viewPrefs[id] != null) el.value = viewPrefs[id];
        });
    } catch (e) {
        console.warn('恢复偏好失败:', e && e.message);
    }
}

// 监听偏好下拉项变化并持久化
function setupPreferencePersistence() {
    PREF_SELECTS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            viewPrefs[id] = el.value;
            if (window.billAPI && window.billAPI.config) {
                window.billAPI.config.set('viewPrefs', viewPrefs).catch(() => {});
            }
        });
    });
}

// 启动后自动加载上次保存的交易数据，无需重新选文件
async function loadPersistedData() {
    if (!window.billAPI || !window.billAPI.loadTransactions) return;
    try {
        const res = await window.billAPI.loadTransactions();
        if (!res || !res.success || !Array.isArray(res.transactions) || res.transactions.length === 0) {
            return;
        }
        billData = res.transactions;
        metadata = res.metadata || {};
        fileLoaded = true;

        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.querySelector('.file-name');
        const fileStatus = document.querySelector('.file-status');
        if (fileName) fileName.textContent = '上次保存的数据';
        if (fileStatus) {
            fileStatus.textContent = `已自动加载 ${billData.length} 条记录`;
            fileStatus.style.color = 'var(--success-color)';
        }
        if (fileInfo) fileInfo.classList.remove('hidden');
        const exportBtn = document.getElementById('exportReportBtn');
        if (exportBtn) exportBtn.disabled = false;

        switchView('overview');
        document.querySelector('.nav-item[data-view="overview"]').classList.add('active');
        document.querySelector('.nav-item[data-view="welcome"]')?.classList.remove('active');
        showNotification('info', `已自动加载上次保存的 ${billData.length} 条记录`);
    } catch (e) {
        console.warn('加载本地数据失败:', e && e.message);
    }
}

// 将当前数据持久化到本地（按交易单号去重 upsert）
async function persistData() {
    if (!window.billAPI || !window.billAPI.saveTransactions) return;
    try {
        const res = await window.billAPI.saveTransactions(billData, metadata);
        if (res && res.success && res.added != null) {
            showNotification('info', `已保存到本地（新增 ${res.added} 条，共 ${res.total} 条）`);
        }
    } catch (e) {
        console.warn('保存本地数据失败:', e && e.message);
    }
}

function setupEventListeners() {
    document.getElementById('selectFileBtn').addEventListener('click', selectFile);
    document.getElementById('exportReportBtn').addEventListener('click', exportReport);
    document.getElementById('helpBtn').addEventListener('click', showHelp);
    document.getElementById('howToGetBillBtn').addEventListener('click', showHelp);
    
    document.getElementById('categoryDimension').addEventListener('change', updateCategoryView);
    document.getElementById('categorySortBy').addEventListener('change', updateCategoryView);
    document.getElementById('categoryTopN').addEventListener('change', updateCategoryView);
    
    document.getElementById('trendGranularity').addEventListener('change', updateTrendView);
    document.getElementById('trendDataType').addEventListener('change', updateTrendView);
    
    document.getElementById('searchBtn').addEventListener('click', filterDetailData);
    document.getElementById('resetFilterBtn').addEventListener('click', resetDetailFilter);
    document.getElementById('searchKeyword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') filterDetailData();
    });
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewName = item.getAttribute('data-view');
            switchView(viewName);
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function setupModal() {
    const modal = document.getElementById('helpModal');
    const closeBtn = document.querySelector('.modal-close');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function switchView(viewName) {
    const views = document.querySelectorAll('.view-container');
    views.forEach(view => view.classList.remove('active'));
    
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
        targetView.classList.add('active');
        currentView = viewName;

        // 已加载过文件后即更新视图（含 0 条记录时显示空状态）
        if (fileLoaded) {
            updateViewData(viewName);
        }
    }
}

function updateViewData(viewName) {
    // 解析出 0 条记录时，各视图显示统一空状态占位而非空图表/空白
    if (!billData || billData.length === 0) {
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

async function selectFile() {
    const result = await window.billAPI.selectFile();
    
    if (!result.success) {
        return;
    }
    
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.querySelector('.file-name');
    const fileStatus = document.querySelector('.file-status');
    
    // 优先用主进程下发的 basename；兜底时同时按 / 和 \ 切分，兼容三平台路径
    fileName.textContent = result.fileName || extractFileName(result.filePath);
    fileStatus.textContent = '正在解析...';
    fileInfo.classList.remove('hidden');
    
    const parseResult = await window.billAPI.parseBill(result.filePath);
    
    if (!parseResult.success) {
        // 按诊断分类给出具体原因，而非泛化提示
        fileStatus.textContent = `解析失败：${parseResult.message}`;
        fileStatus.style.color = 'var(--danger-color)';
        showNotification('error', parseResult.message);
        return;
    }

    billData = parseResult.data || [];
    metadata = parseResult.metadata || {};
    fileLoaded = true;

    if (billData.length === 0) {
        // 已识别格式但无有效记录：友好诊断 + 各视图空状态，不报错
        const diagMsg = (parseResult.diagnostic && parseResult.diagnostic.message)
            || '未找到有效交易记录';
        fileStatus.textContent = diagMsg;
        fileStatus.style.color = 'var(--warning-color)';
        document.getElementById('exportReportBtn').disabled = true;
        showNotification('info', diagMsg);
    } else {
        fileStatus.textContent = `解析成功！共 ${parseResult.totalRecords} 条记录`;
        fileStatus.style.color = 'var(--success-color)';
        document.getElementById('exportReportBtn').disabled = false;
        showNotification('success', `成功加载 ${parseResult.totalRecords} 条账单记录`);
        // 持久化到本地，下次打开免重导（按交易单号去重 upsert）
        persistData();
    }

    switchView('overview');
    document.querySelector('.nav-item[data-view="overview"]').classList.add('active');
    document.querySelector('.nav-item[data-view="welcome"]')?.classList.remove('active');
}

function updateOverviewView() {
    const analysis = analyzeOverview(billData);
    
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

    document.getElementById('totalTransactions').textContent = billData.length;
    document.getElementById('dateRange').textContent = `${analysis.dateRange.start} 至 ${analysis.dateRange.end}`;
    
    document.getElementById('metaNickname').textContent = metadata.nickname || '-';
    document.getElementById('metaDateRange').textContent = 
        metadata.startTime && metadata.endTime ? `${metadata.startTime} 至 ${metadata.endTime}` : '-';
    document.getElementById('metaExportTime').textContent = metadata.exportTime || '-';
    document.getElementById('metaExportType').textContent = metadata.exportType || '-';
    
    renderIncomeExpenseChart(analysis);
}

// classifyRecord / analyzeOverview 已抽至 src/core/analytics.js（全局可用）

function renderIncomeExpenseChart(analysis) {
    const ctx = document.getElementById('incomeExpenseChart');
    showCanvas(ctx);
    
    if (charts.incomeExpense) {
        charts.incomeExpense.destroy();
    }
    
    charts.incomeExpense = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['收入', '支出'],
            datasets: [{
                label: '金额(元)',
                data: [analysis.totalIncome, analysis.totalExpense],
                backgroundColor: [
                    'rgba(7, 193, 96, 0.8)',
                    'rgba(250, 81, 81, 0.8)'
                ],
                borderColor: [
                    'rgba(7, 193, 96, 1)',
                    'rgba(250, 81, 81, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `金额: ¥${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '¥' + value;
                        }
                    }
                }
            }
        }
    });
}

function updateAnalysisView() {
    const paymentMethodStats = analyzeByDimension(billData, '支付方式');
    const transactionTypeStats = analyzeByDimension(billData, '交易类型');
    const statusStats = analyzeByDimension(billData, '当前状态');
    
    renderPaymentMethodChart(paymentMethodStats);
    renderTransactionTypeChart(transactionTypeStats);
    renderStatusStats(statusStats);
}

// analyzeByDimension 已抽至 src/core/analytics.js（全局可用）

function renderPaymentMethodChart(stats) {
    const ctx = document.getElementById('paymentMethodChart');
    showCanvas(ctx);
    
    if (charts.paymentMethod) {
        charts.paymentMethod.destroy();
    }
    
    charts.paymentMethod = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: stats.map(s => s.name),
            datasets: [{
                data: stats.map(s => s.totalAmount),
                backgroundColor: [
                    'rgba(7, 193, 96, 0.8)',
                    'rgba(87, 107, 149, 0.8)',
                    'rgba(255, 195, 0, 0.8)',
                    'rgba(250, 81, 81, 0.8)',
                    'rgba(153, 102, 255, 0.8)',
                    'rgba(255, 159, 64, 0.8)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ¥${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderTransactionTypeChart(stats) {
    const ctx = document.getElementById('transactionTypeChart');
    showCanvas(ctx);
    
    if (charts.transactionType) {
        charts.transactionType.destroy();
    }
    
    charts.transactionType = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: stats.map(s => s.name),
            datasets: [{
                data: stats.map(s => s.count),
                backgroundColor: [
                    'rgba(7, 193, 96, 0.8)',
                    'rgba(87, 107, 149, 0.8)',
                    'rgba(255, 195, 0, 0.8)',
                    'rgba(250, 81, 81, 0.8)',
                    'rgba(153, 102, 255, 0.8)',
                    'rgba(255, 159, 64, 0.8)',
                    'rgba(75, 192, 192, 0.8)',
                    'rgba(255, 99, 132, 0.8)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value}笔 (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderStatusStats(stats) {
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

function updateCategoryView() {
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
    
    let stats = analyzeByDimension(billData, dimensionKey);
    
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

function renderCategoryChart(stats, sortBy) {
    const ctx = document.getElementById('categoryChart');
    showCanvas(ctx);
    
    if (charts.category) {
        charts.category.destroy();
    }
    
    const dataKey = sortBy === 'amount' ? 'totalAmount' : 'count';
    const label = sortBy === 'amount' ? '金额(元)' : '交易次数';
    
    charts.category = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stats.map(s => s.name.length > 20 ? s.name.substring(0, 20) + '...' : s.name),
            datasets: [{
                label: label,
                data: stats.map(s => s[dataKey]),
                backgroundColor: 'rgba(7, 193, 96, 0.8)',
                borderColor: 'rgba(7, 193, 96, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: stats.length > 10 ? 'y' : 'x',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (sortBy === 'amount') {
                                return `金额: ¥${context.parsed.y || context.parsed.x}`;
                            } else {
                                return `次数: ${context.parsed.y || context.parsed.x}`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        callback: function(value) {
                            if (sortBy === 'amount' && stats.length <= 10) {
                                return '¥' + value;
                            }
                            return value;
                        }
                    }
                },
                y: {
                    ticks: {
                        callback: function(value) {
                            if (sortBy === 'amount' && stats.length > 10) {
                                return '¥' + value;
                            }
                            return value;
                        }
                    }
                }
            }
        }
    });
}

function renderCategoryTable(stats) {
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

function updateTrendView() {
    const granularity = document.getElementById('trendGranularity').value;
    const dataType = document.getElementById('trendDataType').value;
    
    const trendData = analyzeTrend(billData, granularity);
    renderTrendChart(trendData, dataType);
    updateTrendStats(trendData);
}

// analyzeTrend 已抽至 src/core/analytics.js（全局可用）

function renderTrendChart(trendData, dataType) {
    const ctx = document.getElementById('trendChart');
    showCanvas(ctx);
    
    if (charts.trend) {
        charts.trend.destroy();
    }
    
    const datasets = [];
    
    if (dataType === 'both' || dataType === 'income') {
        datasets.push({
            label: '收入',
            data: trendData.map(d => d.income),
            borderColor: 'rgba(7, 193, 96, 1)',
            backgroundColor: 'rgba(7, 193, 96, 0.2)',
            tension: 0.3,
            fill: true
        });
    }
    
    if (dataType === 'both' || dataType === 'expense') {
        datasets.push({
            label: '支出',
            data: trendData.map(d => d.expense),
            borderColor: 'rgba(250, 81, 81, 1)',
            backgroundColor: 'rgba(250, 81, 81, 0.2)',
            tension: 0.3,
            fill: true
        });
    }
    
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.map(d => d.date),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ¥${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '¥' + value;
                        }
                    }
                }
            }
        }
    });
}

function updateTrendStats(trendData) {
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

function updateDetailView() {
    filterDetailData();
}

function filterDetailData() {
    const keyword = document.getElementById('searchKeyword').value.toLowerCase();
    const filterType = document.getElementById('filterType').value;
    const filterStatus = document.getElementById('filterStatus').value;
    
    let filtered = billData.filter(record => {
        const matchKeyword = !keyword || 
            (record['交易对方'] && record['交易对方'].toLowerCase().includes(keyword)) ||
            (record['商品'] && record['商品'].toLowerCase().includes(keyword));
        
        const matchType = filterType === 'all' || 
            (filterType === 'income' && record['收/支'] === '收入') ||
            (filterType === 'expense' && record['收/支'] === '支出');
        
        const matchStatus = filterStatus === 'all' || record['当前状态'] === filterStatus;
        
        return matchKeyword && matchType && matchStatus;
    });
    
    const totalAmount = filtered.reduce((sum, record) => {
        return sum + parseAmount(record['金额(元)']);
    }, 0);
    
    document.getElementById('filteredCount').textContent = filtered.length;
    document.getElementById('filteredAmount').textContent = `¥${totalAmount.toFixed(2)}`;
    
    renderDetailTable(filtered);
}

function resetDetailFilter() {
    document.getElementById('searchKeyword').value = '';
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterStatus').value = 'all';
    filterDetailData();
}

function renderDetailTable(data) {
    const container = document.getElementById('detailTable');

    if (data.length === 0) {
        container.replaceChildren();
        const empty = document.createElement('p');
        empty.style.cssText = 'padding: 2rem; text-align: center; color: var(--text-secondary);';
        empty.textContent = '暂无数据';
        container.appendChild(empty);
        return;
    }

    const rows = data.map(record => {
        const amountClass = record['收/支'] === '收入' ? 'amount-income' : 'amount-expense';
        const amount = parseAmount(record['金额(元)']);
        return [
            record['交易时间'] || '-',
            record['交易类型'] || '-',
            record['交易对方'] || '-',
            record['商品'] || '-',
            record['收/支'] || '-',
            { text: `¥${amount.toFixed(2)}`, className: amountClass },
            record['支付方式'] || '-',
            record['当前状态'] || '-'
        ];
    });

    renderTable(container, ['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)', '支付方式', '当前状态'], rows);
}

async function exportReport() {
    if (billData.length === 0) {
        showNotification('error', '没有可导出的数据');
        return;
    }
    
    const overview = analyzeOverview(billData);
    const categoryStats = analyzeByDimension(billData, '交易对方');
    const dailyTrend = analyzeTrend(billData, 'daily');
    
    const reportData = {
        summary: {
            '总收入': overview.totalIncome,
            '收入笔数': overview.incomeCount,
            '总支出': overview.totalExpense,
            '支出笔数': overview.expenseCount,
            '净收支': overview.totalIncome - overview.totalExpense,
            '总交易笔数': billData.length,
            '账单开始日期': overview.dateRange.start,
            '账单结束日期': overview.dateRange.end
        },
        categoryData: categoryStats.slice(0, 50).map((stat, index) => ({
            '排名': index + 1,
            '商户名称': stat.name,
            '交易次数': stat.count,
            '总金额': stat.totalAmount,
            '收入金额': stat.incomeAmount,
            '支出金额': stat.expenseAmount
        })),
        dailyData: dailyTrend.map(trend => ({
            '日期': trend.date,
            '收入': trend.income,
            '收入笔数': trend.incomeCount,
            '支出': trend.expense,
            '支出笔数': trend.expenseCount,
            '净收支': trend.income - trend.expense
        })),
        detailData: billData.map(record => ({
            '交易时间': record['交易时间'],
            '交易类型': record['交易类型'],
            '交易对方': record['交易对方'],
            '商品': record['商品'],
            '收/支': record['收/支'],
            '金额(元)': record['金额(元)'],
            '支付方式': record['支付方式'],
            '当前状态': record['当前状态']
        }))
    };
    
    const result = await window.billAPI.exportReport(reportData);
    
    if (result.success) {
        showNotification('success', '报告导出成功！');
    } else {
        showNotification('error', result.message);
    }
}

function showHelp() {
    const modal = document.getElementById('helpModal');
    modal.classList.add('active');
}

function showNotification(type, message) {
    console.log(`[${String(type).toUpperCase()}] ${message}`);

    const container = document.getElementById('toastContainer');
    if (!container) return; // 容器缺失时退化为仅日志，保证健壮

    const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
    const kind = icons[type] ? type : 'info';

    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = icons[kind];

    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message; // textContent 避免任何注入

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', '关闭通知');
    closeBtn.textContent = '×';

    toast.append(icon, msg, closeBtn);
    container.appendChild(toast);

    // 入场动画
    requestAnimationFrame(() => toast.classList.add('toast-show'));

    let timer = null;
    const dismiss = () => {
        if (!toast.isConnected) return;
        clearTimeout(timer);
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        const remove = () => toast.remove();
        toast.addEventListener('transitionend', remove, { once: true });
        setTimeout(remove, 400); // 兜底，确保最终被移除
    };

    const AUTO_MS = type === 'error' ? 6000 : 3500;
    timer = setTimeout(dismiss, AUTO_MS);
    // 悬停暂停、移出后稍候关闭
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1500); });
    closeBtn.addEventListener('click', dismiss);
}

// formatDate 已抽至 src/core/analytics.js（全局可用）

// 构建统一的空状态占位节点（图标 + 主标题 + 可选引导）
function createEmptyState(title, hint) {
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-state-icon';
    icon.textContent = '📭';
    const t = document.createElement('p');
    t.className = 'empty-state-title';
    t.textContent = title || '暂无数据';
    wrap.append(icon, t);
    if (hint) {
        const h = document.createElement('p');
        h.className = 'empty-state-hint';
        h.textContent = hint;
        wrap.appendChild(h);
    }
    return wrap;
}

function setEmptyState(containerId, title, hint) {
    const el = document.getElementById(containerId);
    if (el) el.replaceChildren(createEmptyState(title, hint));
}

// 让 canvas 重新可见并移除其同级空状态占位（数据恢复时调用）
function showCanvas(canvas) {
    if (!canvas) return;
    canvas.style.display = '';
    const parent = canvas.parentElement;
    if (parent) {
        const es = parent.querySelector('.empty-state');
        if (es) es.remove();
    }
}

// 隐藏 canvas 并在其容器内显示空状态占位
function setChartEmpty(canvasId, title) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.style.display = 'none';
    const parent = canvas.parentElement;
    if (parent && !parent.querySelector('.empty-state')) {
        parent.appendChild(createEmptyState(title));
    }
}

// 为指定视图渲染统一空状态（解析出 0 条记录时）
function renderEmptyStateForView(viewName) {
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    switch (viewName) {
        case 'overview':
            setText('totalIncome', '¥0.00'); setText('incomeCount', '0笔');
            setText('totalExpense', '¥0.00'); setText('expenseCount', '0笔');
            setText('netBalance', '¥0.00'); setText('balanceStatus', '-');
            setText('totalTransactions', '0'); setText('dateRange', '-');
            setText('metaNickname', metadata.nickname || '-');
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
function renderTable(container, headers, rows) {
    const table = document.createElement('table');

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(cells => {
        const tr = document.createElement('tr');
        cells.forEach(cell => {
            const td = document.createElement('td');
            if (cell !== null && typeof cell === 'object') {
                td.textContent = cell.text != null ? String(cell.text) : '';
                if (cell.className) td.className = cell.className;
            } else {
                td.textContent = cell != null ? String(cell) : '';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.replaceChildren(table);
}
