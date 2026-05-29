const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');

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
      sandbox: true,
      webviewTag: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: '微信账单分析工具',
    backgroundColor: '#f5f5f5',
    show: false
  });

  mainWindow.loadFile('index.html');

  // 限制导航：仅允许本地 file:// 协议，阻止被脚本注入或误操作导航到外部页面
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      console.warn('已阻止导航到外部地址:', url);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 严格内容安全策略：禁止 inline/远程脚本，仅允许本地资源；图表已本地化，无需任何外部域。
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // 应用使用外部 styles.css，inline 仅用于元素 style 属性
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    });
  });

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
    const workbook = buildWorkbook(filePath);

    // 遍历工作簿的所有 sheet：账单可能被拆分到多个表（如分月导出），仅取第一个会漏数据
    let allRecords = [];
    let metadata = null;
    let parsedSheetCount = 0;

    for (const sheetName of workbook.SheetNames) {
      // 单个 sheet 异常时跳过而非整体失败，避免一张坏表拖垮多 sheet 文件
      try {
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
      } catch (sheetErr) {
        console.warn(`解析 sheet「${sheetName}」失败，已跳过：`, sheetErr && sheetErr.message);
      }
    }

    if (parsedSheetCount === 0) {
      return {
        success: false,
        reason: 'no_header',
        message: '未找到账单数据表头：请确认这是“用于个人对账”导出的微信账单（xlsx/csv），而非 PDF 或其它格式。'
      };
    }

    // 多 sheet 合并后去重（重叠时间段可能重复）；单 sheet 文件交易单号唯一，去重为无操作
    const billData = dedupeRecords(allRecords);

    // 找到了表头但没有任何有效交易行（如全部为 '/'、'---' 占位或空行）
    if (billData.length === 0) {
      return {
        success: true,
        data: [],
        metadata: metadata || {},
        totalRecords: 0,
        diagnostic: {
          reason: 'no_valid_rows',
          message: '已识别账单格式，但未找到有效交易记录（该时间段可能无交易）。'
        }
      };
    }

    return {
      success: true,
      data: billData,
      metadata: metadata || {},
      totalRecords: billData.length
    };

  } catch (error) {
    console.error('解析文件错误:', error);
    // 区分编码类异常，给出更可读的诊断
    const isEncoding = /codepage|encoding|decode|charset/i.test(String(error && error.message));
    return {
      success: false,
      reason: isEncoding ? 'encoding' : 'exception',
      message: isEncoding
        ? `文件编码异常，无法正确解码：${error.message}`
        : `文件解析失败：${error.message}`
    };
  }
});

// 在单个 sheet 的二维数组中定位表头并抽取交易记录；该 sheet 无账单表头时返回 null
// 统一的工作簿读取入口：按扩展名分流 CSV 与 Excel，杜绝 CSV 误走 Excel 路径导致乱码。
// CSV 先做编码转码再以字符串解析；若转码/解析失败（可能是误用 .csv 后缀的二进制 Excel），
// 回退按文件读取，避免漏数据。
function buildWorkbook(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const opts = { cellDates: true, dateNF: 'yyyy-mm-dd hh:mm:ss' };
  if (ext === '.csv') {
    try {
      const text = readCsvAsUtf8(filePath);
      return XLSX.read(text, { type: 'string', raw: false, ...opts });
    } catch (e) {
      console.warn('CSV 文本解析失败，回退按文件读取：', e && e.message);
      return XLSX.readFile(filePath, opts);
    }
  }
  return XLSX.readFile(filePath, opts);
}

// 读取 CSV 并统一转为 UTF-8 文本：处理 UTF-8 BOM 与 GBK/GB18030 中文编码
function readCsvAsUtf8(filePath) {
  const buf = fs.readFileSync(filePath);
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  // 若本身就是合法 UTF-8（重新编码可与原字节完全一致），直接使用
  const asUtf8 = buf.toString('utf8');
  if (Buffer.compare(Buffer.from(asUtf8, 'utf8'), buf) === 0) {
    return asUtf8;
  }
  // 否则按 GB18030（GBK 超集）解码
  return iconv.decode(buf, 'gb18030');
}

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
