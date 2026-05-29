// ui.js — DOM 工具：toast 通知、空状态占位、安全表格渲染、canvas 显隐。

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
