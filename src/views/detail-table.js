// detail-table.js — 明细查询：虚拟滚动 + 列排序 + 关键词/类型/状态筛选。
import { setEmptyState } from '../dom/ui.js';
import { state } from '../state.js';
import { parseAmount } from '../utils/amount.js';
import { parseDate } from '../utils/date.js';

export function updateDetailView() {
    filterDetailData();
}

export function filterDetailData() {
    const keyword = document.getElementById('searchKeyword').value.toLowerCase();
    const filterType = document.getElementById('filterType').value;
    const filterStatus = document.getElementById('filterStatus').value;
    
    let filtered = state.billData.filter(record => {
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

export function resetDetailFilter() {
    document.getElementById('searchKeyword').value = '';
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterStatus').value = 'all';
    filterDetailData();
}

// 明细表列定义（type 决定排序比较方式）
const DETAIL_COLUMNS = [
    { key: '交易时间', label: '交易时间', type: 'date' },
    { key: '交易类型', label: '交易类型', type: 'text' },
    { key: '交易对方', label: '交易对方', type: 'text' },
    { key: '商品', label: '商品', type: 'text' },
    { key: '收/支', label: '收/支', type: 'text' },
    { key: '金额(元)', label: '金额(元)', type: 'amount' },
    { key: '支付方式', label: '支付方式', type: 'text' },
    { key: '当前状态', label: '当前状态', type: 'text' }
];
const DETAIL_ROW_H = 40;
let detailData = [];
let detailSort = { key: null, dir: 1 }; // dir: 1 升序, -1 降序

export function applyDetailSort() {
    const { key, dir } = detailSort;
    if (!key) return;
    const col = DETAIL_COLUMNS.find(c => c.key === key);
    detailData.sort((a, b) => {
        if (col.type === 'amount') {
            return (parseAmount(a[key]) - parseAmount(b[key])) * dir;
        }
        if (col.type === 'date') {
            const ad = parseDate(a[key]); const bd = parseDate(b[key]);
            return ((ad ? ad.getTime() : 0) - (bd ? bd.getTime() : 0)) * dir;
        }
        return String(a[key] || '').localeCompare(String(b[key] || ''), 'zh') * dir;
    });
}

// 明细表：虚拟滚动（仅渲染可视区行）+ 点击表头多列排序
export function renderDetailTable(data) {
    const container = document.getElementById('detailTable');
    detailData = data.slice();
    applyDetailSort();

    if (detailData.length === 0) {
        setEmptyState('detailTable', '暂无数据', '调整筛选条件或导入账单后查看');
        return;
    }

    container.replaceChildren();
    const table = document.createElement('div');
    table.className = 'vtable';

    // 表头（可点击排序）
    const header = document.createElement('div');
    header.className = 'vtable-header';
    DETAIL_COLUMNS.forEach(col => {
        const th = document.createElement('div');
        th.className = 'vtable-cell vtable-th';
        th.textContent = col.label;
        const arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        if (detailSort.key === col.key) {
            th.classList.add(detailSort.dir > 0 ? 'sort-asc' : 'sort-desc');
            arrow.textContent = detailSort.dir > 0 ? '▲' : '▼';
        } else {
            arrow.textContent = '↕';
        }
        th.appendChild(arrow);
        th.addEventListener('click', () => {
            if (detailSort.key === col.key) detailSort.dir = -detailSort.dir;
            else detailSort = { key: col.key, dir: 1 };
            renderDetailTable(detailData); // 用当前数据重排重绘
        });
        header.appendChild(th);
    });

    // 滚动体 + 撑高占位 + 视口
    const body = document.createElement('div');
    body.className = 'vtable-body';
    const spacer = document.createElement('div');
    spacer.className = 'vtable-spacer';
    spacer.style.height = (detailData.length * DETAIL_ROW_H) + 'px';
    const viewport = document.createElement('div');
    viewport.className = 'vtable-viewport';
    spacer.appendChild(viewport);
    body.appendChild(spacer);

    const renderWindow = () => {
        const scrollTop = body.scrollTop;
        const viewH = body.clientHeight || 480;
        const start = Math.max(0, Math.floor(scrollTop / DETAIL_ROW_H) - 5);
        const end = Math.min(detailData.length, Math.ceil((scrollTop + viewH) / DETAIL_ROW_H) + 5);
        viewport.style.transform = `translateY(${start * DETAIL_ROW_H}px)`;
        viewport.replaceChildren();
        for (let i = start; i < end; i++) {
            const rec = detailData[i];
            const row = document.createElement('div');
            row.className = 'vtable-row' + (i % 2 ? ' odd' : '');
            DETAIL_COLUMNS.forEach(col => {
                const cell = document.createElement('div');
                cell.className = 'vtable-cell';
                if (col.type === 'amount') {
                    cell.textContent = `¥${parseAmount(rec[col.key]).toFixed(2)}`;
                    cell.classList.add(rec['收/支'] === '收入' ? 'amount-income' : 'amount-expense');
                } else {
                    cell.textContent = rec[col.key] || '-';
                }
                row.appendChild(cell);
            });
            viewport.appendChild(row);
        }
    };

    body.addEventListener('scroll', renderWindow);
    table.appendChild(header);
    table.appendChild(body);
    container.appendChild(table);
    renderWindow();
}
