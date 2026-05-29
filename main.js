const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: '微信账单分析工具',
    backgroundColor: '#f5f5f5',
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '微信账单文件', extensions: ['xlsx', 'xls', 'csv'] },
      { name: 'Excel文件', extensions: ['xlsx', 'xls'] },
      { name: 'CSV文件', extensions: ['csv'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    title: '选择微信账单文件'
  });

  if (result.canceled) {
    return { success: false, message: '用户取消选择' };
  }

  const filePath = result.filePaths[0];
  // 由主进程用 path.basename 计算文件名，跨平台一致（避免渲染层手工切分路径分隔符）
  return { success: true, filePath, fileName: path.basename(filePath) };
});

ipcMain.handle('parse-bill-file', async (event, filePath) => {
  try {
    const workbook = XLSX.readFile(filePath, { 
      cellDates: true,
      dateNF: 'yyyy-mm-dd hh:mm:ss'
    });
    
    // 遍历工作簿的所有 sheet：账单可能被拆分到多个表（如分月导出），仅取第一个会漏数据
    let allRecords = [];
    let metadata = null;
    let parsedSheetCount = 0;

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        dateNF: 'yyyy-mm-dd hh:mm:ss'
      });

      const parsed = extractSheetRecords(rawData);
      if (!parsed) continue; // 该 sheet 无账单表头，跳过

      allRecords = allRecords.concat(parsed.records);
      parsedSheetCount++;
      // 元数据取首个含表头 sheet 的说明区
      if (!metadata) metadata = extractMetadata(rawData, parsed.headerRowIndex);
    }

    if (parsedSheetCount === 0) {
      return {
        success: false,
        message: '未找到账单数据表头，请确认文件格式是否正确'
      };
    }

    // 多 sheet 合并后去重（重叠时间段可能重复）；单 sheet 文件交易单号唯一，去重为无操作
    const billData = dedupeRecords(allRecords);

    return {
      success: true,
      data: billData,
      metadata: metadata || {},
      totalRecords: billData.length
    };

  } catch (error) {
    console.error('解析文件错误:', error);
    return {
      success: false,
      message: `文件解析失败: ${error.message}`
    };
  }
});

// 在单个 sheet 的二维数组中定位表头并抽取交易记录；该 sheet 无账单表头时返回 null
// 表头单元格归一化：去除所有空白(含全角空格)、全角括号转半角，便于容忍变体与列偏移
function normalizeHeaderCell(cell) {
  if (cell == null) return '';
  return String(cell)
    .replace(/[\s　]/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
}

// 列别名 -> 规范字段名（键为归一化后的形式）
const COLUMN_ALIASES = {
  '交易时间': '交易时间', '交易日期': '交易时间', '时间': '交易时间',
  '交易类型': '交易类型', '交易分类': '交易类型', '类型': '交易类型',
  '交易对方': '交易对方', '对方': '交易对方', '交易对方名称': '交易对方', '商户名称': '交易对方',
  '商品': '商品', '商品说明': '商品', '商品名称': '商品',
  '收/支': '收/支', '收支': '收/支', '收入/支出': '收/支', '收支类型': '收/支',
  '金额(元)': '金额(元)', '金额': '金额(元)', '交易金额': '金额(元)', '金额(元)': '金额(元)',
  '支付方式': '支付方式', '支付渠道': '支付方式', '收/付款方式': '支付方式', '付款方式': '支付方式',
  '当前状态': '当前状态', '交易状态': '当前状态', '状态': '当前状态',
  '交易单号': '交易单号', '订单号': '交易单号', '微信支付订单号': '交易单号', '交易订单号': '交易单号',
  '商户单号': '商户单号', '商户订单号': '商户单号',
  '备注': '备注'
};

// 逐行扫描定位表头：命中规范列达到阈值且包含「交易时间」即判定为表头行（容忍序号列/空白/变体）
function findHeaderRow(rawData) {
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (!Array.isArray(row)) continue;
    let hits = 0;
    let hasTime = false;
    for (const cell of row) {
      const canon = COLUMN_ALIASES[normalizeHeaderCell(cell)];
      if (canon) {
        hits++;
        if (canon === '交易时间') hasTime = true;
      }
    }
    if (hasTime && hits >= 3) return i;
  }
  return -1;
}

function extractSheetRecords(rawData) {
  const headerRowIndex = findHeaderRow(rawData);
  if (headerRowIndex === -1) return null;

  // 列索引 -> 规范字段名（命中别名用规范名，否则保留去空白后的原始名），容忍列偏移
  const headerRow = rawData[headerRowIndex];
  const colMap = headerRow.map(cell => {
    const norm = normalizeHeaderCell(cell);
    return COLUMN_ALIASES[norm] || norm;
  });

  const records = rawData.slice(headerRowIndex + 1)
    .filter(row => Array.isArray(row) && row.some(c => c !== '' && c != null))
    .map(row => {
      const record = {};
      colMap.forEach((name, index) => {
        if (name) record[name] = row[index] != null ? row[index] : '';
      });
      return record;
    })
    .filter(record => {
      return record['交易时间'] &&
             record['交易时间'] !== '/' &&
             !record['交易时间'].toString().includes('---');
    });

  return { headerRowIndex, records };
}

// 跨 sheet 合并后去重：优先按「交易单号」，缺单号时回退到 时间+对方+金额+收支 组合键
function dedupeRecords(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const orderNo = (r['交易单号'] || '').toString().trim();
    const key = orderNo || [r['交易时间'], r['交易对方'], r['金额(元)'], r['收/支']].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function extractMetadata(rawData, headerRowIndex) {
  const metadata = {
    nickname: '',
    startTime: '',
    endTime: '',
    exportType: '',
    exportTime: '',
    totalCount: 0,
    incomeCount: 0,
    incomeAmount: 0,
    expenseCount: 0,
    expenseAmount: 0,
    neutralCount: 0,
    neutralAmount: 0
  };

  for (let i = 0; i < headerRowIndex; i++) {
    const row = rawData[i];
    if (!row || !row[0]) continue;
    
    const text = row[0].toString();
    
    if (text.includes('微信昵称')) {
      const match = text.match(/微信昵称：\[(.+?)\]/);
      if (match) metadata.nickname = match[1];
    }
    
    if (text.includes('起始时间')) {
      const startMatch = text.match(/起始时间：\[(.+?)\]/);
      const endMatch = text.match(/终止时间：\[(.+?)\]/);
      if (startMatch) metadata.startTime = startMatch[1];
      if (endMatch) metadata.endTime = endMatch[1];
    }
    
    if (text.includes('导出类型')) {
      const match = text.match(/导出类型：\[(.+?)\]/);
      if (match) metadata.exportType = match[1];
    }
    
    if (text.includes('导出时间')) {
      const match = text.match(/导出时间：\[(.+?)\]/);
      if (match) metadata.exportTime = match[1];
    }
    
    if (text.match(/^共\d+笔记录/)) {
      const match = text.match(/共(\d+)笔记录/);
      if (match) metadata.totalCount = parseInt(match[1]);
    }
    
    if (text.includes('收入：')) {
      const countMatch = text.match(/收入：(\d+)笔/);
      const amountMatch = text.match(/(\d+\.?\d*)元/);
      if (countMatch) metadata.incomeCount = parseInt(countMatch[1]);
      if (amountMatch) metadata.incomeAmount = parseFloat(amountMatch[1]);
    }
    
    if (text.includes('支出：')) {
      const countMatch = text.match(/支出：(\d+)笔/);
      const amountMatch = text.match(/(\d+\.?\d*)元/);
      if (countMatch) metadata.expenseCount = parseInt(countMatch[1]);
      if (amountMatch) metadata.expenseAmount = parseFloat(amountMatch[1]);
    }
    
    if (text.includes('中性交易：')) {
      const countMatch = text.match(/中性交易：(\d+)笔/);
      const amountMatch = text.match(/(\d+\.?\d*)元/);
      if (countMatch) metadata.neutralCount = parseInt(countMatch[1]);
      if (amountMatch) metadata.neutralAmount = parseFloat(amountMatch[1]);
    }
  }

  return metadata;
}

ipcMain.handle('export-report', async (event, reportData) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出分析报告',
      defaultPath: `微信账单分析报告_${new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [
        { name: 'Excel文件', extensions: ['xlsx'] }
      ]
    });

    if (result.canceled) {
      return { success: false, message: '用户取消导出' };
    }

    const workbook = XLSX.utils.book_new();
    
    const summarySheet = XLSX.utils.json_to_sheet([reportData.summary]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, '汇总统计');
    
    if (reportData.categoryData && reportData.categoryData.length > 0) {
      const categorySheet = XLSX.utils.json_to_sheet(reportData.categoryData);
      XLSX.utils.book_append_sheet(workbook, categorySheet, '分类统计');
    }
    
    if (reportData.dailyData && reportData.dailyData.length > 0) {
      const dailySheet = XLSX.utils.json_to_sheet(reportData.dailyData);
      XLSX.utils.book_append_sheet(workbook, dailySheet, '每日统计');
    }
    
    if (reportData.detailData && reportData.detailData.length > 0) {
      const detailSheet = XLSX.utils.json_to_sheet(reportData.detailData);
      XLSX.utils.book_append_sheet(workbook, detailSheet, '明细数据');
    }

    XLSX.writeFile(workbook, result.filePath);

    return { 
      success: true, 
      message: '报告导出成功',
      filePath: result.filePath
    };

  } catch (error) {
    console.error('导出报告错误:', error);
    return {
      success: false,
      message: `导出失败: ${error.message}`
    };
  }
});
