const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const { SecureStore } = require('./src/secure-store');
const { parseSheets } = require('./src/import/parser');
const { TransactionStore } = require('./src/store/db');
const { ConfigStore } = require('./src/storage/store');

let secureStore = null;
let txStore = null;
let configStore = null;

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

  // 优先加载 Vite 构建产物（dist）；开发热更新时加载 Vite dev server；否则回退源 index.html
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadFile('index.html');
  }

  // 限制导航：仅允许本地 file:// 协议，阻止被脚本注入或误操作导航到外部页面
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      console.warn('已阻止导航到外部地址:', url);
    }
  });

  // 拒绝在应用内打开新窗口；仅 http(s) 白名单链接交由系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 禁止附加 <webview>，杜绝嵌入式外部内容
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
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
  // 静态加密存储置于 userData 目录，落盘内容全程密文
  secureStore = new SecureStore(path.join(app.getPath('userData'), 'bill-secure.enc'));
  // 本地交易持久化（再次打开免重导）
  txStore = new TransactionStore(path.join(app.getPath('userData'), 'transactions.json'));
  // 用户配置/偏好持久化（预算、归类规则、界面偏好等）
  configStore = new ConfigStore(path.join(app.getPath('userData'), 'config.json'));

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

    // 主进程仅负责 I/O：把各 sheet 读为二维数组（单表异常隔离），纯解析逻辑交由 parser 模块
    const rawSheets = [];
    for (const sheetName of workbook.SheetNames) {
      try {
        rawSheets.push(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          raw: false,
          dateNF: 'yyyy-mm-dd hh:mm:ss'
        }));
      } catch (sheetErr) {
        console.warn(`读取 sheet「${sheetName}」失败，已跳过：`, sheetErr && sheetErr.message);
      }
    }

    const { records: billData, metadata, parsedSheetCount } = parseSheets(rawSheets, 'wechat');

    if (parsedSheetCount === 0) {
      return {
        success: false,
        reason: 'no_header',
        message: '未找到账单数据表头：请确认这是“用于个人对账”导出的微信账单（xlsx/csv），而非 PDF 或其它格式。'
      };
    }

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

// ===== 静态加密存储 IPC =====
ipcMain.handle('secure-status', () => ({
  initialized: secureStore.isInitialized(),
  unlocked: secureStore.isUnlocked()
}));

ipcMain.handle('secure-set-password', (event, password) => {
  try {
    secureStore.initialize(password);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('secure-unlock', (event, password) => ({
  success: secureStore.unlock(password)
}));

ipcMain.handle('secure-lock', () => {
  secureStore.lock();
  return { success: true };
});

ipcMain.handle('secure-save', (event, data) => {
  try {
    secureStore.save(data);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('secure-load', () => {
  try {
    return { success: true, data: secureStore.load() };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('secure-wipe', () => {
  secureStore.wipe();
  return { success: true };
});

// ===== 本地交易持久化 IPC =====
ipcMain.handle('load-transactions', () => {
  try {
    const { transactions, metadata } = txStore.load();
    return { success: true, transactions, metadata };
  } catch (e) {
    return { success: false, message: e.message, transactions: [], metadata: {} };
  }
});

ipcMain.handle('save-transactions', (event, payload) => {
  try {
    const records = (payload && payload.transactions) || [];
    const metadata = (payload && payload.metadata) || {};
    const result = txStore.save(records, metadata);
    return { success: true, ...result };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('clear-transactions', () => {
  try {
    txStore.clear();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

// ===== 用户配置 IPC =====
ipcMain.handle('config-get-all', () => {
  try {
    return { success: true, config: configStore.getAll() };
  } catch (e) {
    return { success: false, message: e.message, config: {} };
  }
});

ipcMain.handle('config-set', (event, key, value) => {
  try {
    configStore.set(key, value);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('config-merge', (event, partial) => {
  try {
    configStore.merge(partial);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
});
