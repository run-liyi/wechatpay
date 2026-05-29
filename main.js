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
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rawData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      raw: false,
      dateNF: 'yyyy-mm-dd hh:mm:ss'
    });

    let headerRowIndex = -1;
    for (let i = 0; i < rawData.length; i++) {
      if (rawData[i][0] === '交易时间') {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return { 
        success: false, 
        message: '未找到账单数据表头，请确认文件格式是否正确' 
      };
    }

    const headers = rawData[headerRowIndex];
    const dataRows = rawData.slice(headerRowIndex + 1);

    const billData = dataRows
      .filter(row => row && row.length > 0 && row[0])
      .map(row => {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = row[index] || '';
        });
        return record;
      })
      .filter(record => {
        return record['交易时间'] && 
               record['交易时间'] !== '/' && 
               !record['交易时间'].toString().includes('---');
      });

    const metadata = extractMetadata(rawData, headerRowIndex);

    return {
      success: true,
      data: billData,
      metadata: metadata,
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
