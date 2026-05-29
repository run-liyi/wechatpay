// app.js — 应用入口：全局状态、初始化、事件绑定、文件选择/导出、持久化与偏好。

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
    if (window.ChartTheme && window.Chart) {
        ChartTheme.applyChartDefaults(window.Chart);
    }
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
