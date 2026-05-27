const { ipcRenderer } = require('electron');

let billData = [];
let metadata = {};
let currentView = 'welcome';
let charts = {};

// Bill-file cell values (counterparty, product, status, etc.) are untrusted input.
// They get interpolated into innerHTML below, and the renderer runs with Node
// integration enabled, so an unescaped value is a remote-code-execution sink.
// Escape the five HTML-significant characters before any such interpolation.
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    setupNavigation();
    setupModal();
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
        
        if (billData.length > 0) {
            updateViewData(viewName);
        }
    }
}

function updateViewData(viewName) {
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
    const result = await ipcRenderer.invoke('select-file');
    
    if (!result.success) {
        return;
    }
    
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.querySelector('.file-name');
    const fileStatus = document.querySelector('.file-status');
    
    fileName.textContent = result.filePath.split('\\').pop();
    fileStatus.textContent = '正在解析...';
    fileInfo.classList.remove('hidden');
    
    const parseResult = await ipcRenderer.invoke('parse-bill-file', result.filePath);
    
    if (!parseResult.success) {
        fileStatus.textContent = `解析失败: ${parseResult.message}`;
        fileStatus.style.color = 'var(--danger-color)';
        showNotification('error', parseResult.message);
        return;
    }
    
    billData = parseResult.data;
    metadata = parseResult.metadata;
    
    fileStatus.textContent = `解析成功！共 ${parseResult.totalRecords} 条记录`;
    fileStatus.style.color = 'var(--success-color)';
    
    document.getElementById('exportReportBtn').disabled = false;
    
    showNotification('success', `成功加载 ${parseResult.totalRecords} 条账单记录`);
    
    switchView('overview');
    document.querySelector('.nav-item[data-view="overview"]').classList.add('active');
    document.querySelector('.nav-item[data-view="welcome"]')?.classList.remove('active');
}

function updateOverviewView() {
    const analysis = analyzeOverview(billData);
    
    document.getElementById('totalIncome').textContent = `¥${analysis.totalIncome.toFixed(2)}`;
    document.getElementById('incomeCount').textContent = `${analysis.incomeCount}笔`;
    
    document.getElementById('totalExpense').textContent = `¥${analysis.totalExpense.toFixed(2)}`;
    document.getElementById('expenseCount').textContent = `${analysis.expenseCount}笔`;
    
    const netBalance = analysis.totalIncome - analysis.totalExpense;
    document.getElementById('netBalance').textContent = `¥${netBalance.toFixed(2)}`;
    document.getElementById('balanceStatus').textContent = netBalance >= 0 ? '收入大于支出' : '支出大于收入';
    
    document.getElementById('totalTransactions').textContent = billData.length;
    document.getElementById('dateRange').textContent = `${analysis.dateRange.start} 至 ${analysis.dateRange.end}`;
    
    document.getElementById('metaNickname').textContent = metadata.nickname || '-';
    document.getElementById('metaDateRange').textContent = 
        metadata.startTime && metadata.endTime ? `${metadata.startTime} 至 ${metadata.endTime}` : '-';
    document.getElementById('metaExportTime').textContent = metadata.exportTime || '-';
    document.getElementById('metaExportType').textContent = metadata.exportType || '-';
    
    renderIncomeExpenseChart(analysis);
}

function analyzeOverview(data) {
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let dates = [];
    
    data.forEach(record => {
        const amount = parseFloat(record['金额(元)']) || 0;
        const type = record['收/支'];
        const dateStr = record['交易时间'];
        
        if (type === '收入') {
            totalIncome += amount;
            incomeCount++;
        } else if (type === '支出') {
            totalExpense += amount;
            expenseCount++;
        }
        
        if (dateStr) {
            dates.push(new Date(dateStr));
        }
    });
    
    dates.sort((a, b) => a - b);
    const dateRange = {
        start: dates.length > 0 ? formatDate(dates[0]) : '-',
        end: dates.length > 0 ? formatDate(dates[dates.length - 1]) : '-'
    };
    
    return {
        totalIncome,
        totalExpense,
        incomeCount,
        expenseCount,
        dateRange
    };
}

function renderIncomeExpenseChart(analysis) {
    const ctx = document.getElementById('incomeExpenseChart');
    
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

function analyzeByDimension(data, dimension) {
    const stats = {};
    
    data.forEach(record => {
        const key = record[dimension] || '未知';
        const amount = parseFloat(record['金额(元)']) || 0;
        const type = record['收/支'];
        
        if (!stats[key]) {
            stats[key] = {
                count: 0,
                totalAmount: 0,
                incomeAmount: 0,
                expenseAmount: 0
            };
        }
        
        stats[key].count++;
        stats[key].totalAmount += amount;
        
        if (type === '收入') {
            stats[key].incomeAmount += amount;
        } else if (type === '支出') {
            stats[key].expenseAmount += amount;
        }
    });
    
    return Object.entries(stats).map(([key, value]) => ({
        name: key,
        ...value
    })).sort((a, b) => b.totalAmount - a.totalAmount);
}

function renderPaymentMethodChart(stats) {
    const ctx = document.getElementById('paymentMethodChart');
    
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
    
    let html = '<table><thead><tr><th>状态</th><th>交易笔数</th><th>总金额</th><th>收入</th><th>支出</th></tr></thead><tbody>';
    
    stats.forEach(stat => {
        html += `
            <tr>
                <td>${escapeHtml(stat.name)}</td>
                <td>${stat.count}</td>
                <td>¥${stat.totalAmount.toFixed(2)}</td>
                <td class="amount-income">¥${stat.incomeAmount.toFixed(2)}</td>
                <td class="amount-expense">¥${stat.expenseAmount.toFixed(2)}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
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
    
    let html = '<table><thead><tr><th>排名</th><th>名称</th><th>交易次数</th><th>总金额</th><th>收入</th><th>支出</th></tr></thead><tbody>';
    
    stats.forEach((stat, index) => {
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(stat.name)}</td>
                <td>${stat.count}</td>
                <td>¥${stat.totalAmount.toFixed(2)}</td>
                <td class="amount-income">¥${stat.incomeAmount.toFixed(2)}</td>
                <td class="amount-expense">¥${stat.expenseAmount.toFixed(2)}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function updateTrendView() {
    const granularity = document.getElementById('trendGranularity').value;
    const dataType = document.getElementById('trendDataType').value;
    
    const trendData = analyzeTrend(billData, granularity);
    renderTrendChart(trendData, dataType);
    updateTrendStats(trendData);
}

function analyzeTrend(data, granularity) {
    const trends = {};
    
    data.forEach(record => {
        const dateStr = record['交易时间'];
        if (!dateStr) return;
        
        const date = new Date(dateStr);
        let key;
        
        switch(granularity) {
            case 'daily':
                key = formatDate(date);
                break;
            case 'weekly':
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                key = formatDate(weekStart);
                break;
            case 'monthly':
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                break;
        }
        
        if (!trends[key]) {
            trends[key] = {
                income: 0,
                expense: 0,
                incomeCount: 0,
                expenseCount: 0
            };
        }
        
        const amount = parseFloat(record['金额(元)']) || 0;
        const type = record['收/支'];
        
        if (type === '收入') {
            trends[key].income += amount;
            trends[key].incomeCount++;
        } else if (type === '支出') {
            trends[key].expense += amount;
            trends[key].expenseCount++;
        }
    });
    
    return Object.entries(trends)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

function renderTrendChart(trendData, dataType) {
    const ctx = document.getElementById('trendChart');
    
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
    const expenses = trendData.map(d => d.expense);
    const avgExpense = expenses.reduce((a, b) => a + b, 0) / expenses.length;
    const maxExpense = Math.max(...expenses);
    const minExpense = Math.min(...expenses);
    
    const maxIndex = expenses.indexOf(maxExpense);
    const minIndex = expenses.indexOf(minExpense);
    
    document.getElementById('avgDailyExpense').textContent = `¥${avgExpense.toFixed(2)}`;
    document.getElementById('maxDailyExpense').textContent = `¥${maxExpense.toFixed(2)}`;
    document.getElementById('maxExpenseDate').textContent = trendData[maxIndex].date;
    document.getElementById('minDailyExpense').textContent = `¥${minExpense.toFixed(2)}`;
    document.getElementById('minExpenseDate').textContent = trendData[minIndex].date;
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
        return sum + (parseFloat(record['金额(元)']) || 0);
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
        container.innerHTML = '<p style="padding: 2rem; text-align: center; color: var(--text-secondary);">暂无数据</p>';
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>交易时间</th>
                    <th>交易类型</th>
                    <th>交易对方</th>
                    <th>商品</th>
                    <th>收/支</th>
                    <th>金额(元)</th>
                    <th>支付方式</th>
                    <th>当前状态</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    data.forEach(record => {
        const amountClass = record['收/支'] === '收入' ? 'amount-income' : 'amount-expense';
        const amount = parseFloat(record['金额(元)']) || 0;
        
        html += `
            <tr>
                <td>${escapeHtml(record['交易时间'] || '-')}</td>
                <td>${escapeHtml(record['交易类型'] || '-')}</td>
                <td>${escapeHtml(record['交易对方'] || '-')}</td>
                <td>${escapeHtml(record['商品'] || '-')}</td>
                <td>${escapeHtml(record['收/支'] || '-')}</td>
                <td class="${amountClass}">¥${amount.toFixed(2)}</td>
                <td>${escapeHtml(record['支付方式'] || '-')}</td>
                <td>${escapeHtml(record['当前状态'] || '-')}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
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
    
    const result = await ipcRenderer.invoke('export-report', reportData);
    
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
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
