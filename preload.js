// preload.js
// 在隔离的预加载环境中运行（contextIsolation: true + sandbox: true）。
// 仅通过 contextBridge 暴露「按方法命名」的最小化 IPC 白名单，渲染层不再直接 require('electron')，
// 也不再暴露任意通道的通用 invoke——杜绝渲染进程调用未授权的 IPC 通道。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('billAPI', {
  // 打开文件选择对话框
  selectFile: () => ipcRenderer.invoke('select-file'),

  // 解析指定路径的账单文件
  parseBill: (filePath) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      return Promise.reject(new TypeError('parseBill: filePath 必须为非空字符串'));
    }
    return ipcRenderer.invoke('parse-bill-file', filePath);
  },

  // 导出分析报告
  exportReport: (reportData) => {
    if (reportData === null || typeof reportData !== 'object') {
      return Promise.reject(new TypeError('exportReport: reportData 必须为对象'));
    }
    return ipcRenderer.invoke('export-report', reportData);
  },

  // 用户配置/偏好持久化
  config: {
    getAll: () => ipcRenderer.invoke('config-get-all'),
    set: (key, value) => {
      if (typeof key !== 'string' || key === '') {
        return Promise.reject(new TypeError('config.set: key 必须为非空字符串'));
      }
      return ipcRenderer.invoke('config-set', key, value);
    },
    merge: (partial) => {
      if (partial === null || typeof partial !== 'object') {
        return Promise.reject(new TypeError('config.merge: 参数必须为对象'));
      }
      return ipcRenderer.invoke('config-merge', partial);
    }
  },

  // 本地交易持久化（再次打开免重导）
  loadTransactions: () => ipcRenderer.invoke('load-transactions'),
  saveTransactions: (transactions, metadata) => {
    if (!Array.isArray(transactions)) {
      return Promise.reject(new TypeError('saveTransactions: transactions 必须为数组'));
    }
    return ipcRenderer.invoke('save-transactions', { transactions, metadata: metadata || {} });
  },
  clearTransactions: () => ipcRenderer.invoke('clear-transactions'),

  // 静态加密存储（主密码保护）
  secure: {
    status: () => ipcRenderer.invoke('secure-status'),
    setPassword: (password) => {
      if (typeof password !== 'string' || password.length === 0) {
        return Promise.reject(new TypeError('secure.setPassword: 主密码必须为非空字符串'));
      }
      return ipcRenderer.invoke('secure-set-password', password);
    },
    unlock: (password) => {
      if (typeof password !== 'string') {
        return Promise.reject(new TypeError('secure.unlock: 主密码必须为字符串'));
      }
      return ipcRenderer.invoke('secure-unlock', password);
    },
    lock: () => ipcRenderer.invoke('secure-lock'),
    save: (data) => {
      if (data === null || typeof data !== 'object') {
        return Promise.reject(new TypeError('secure.save: data 必须为对象'));
      }
      return ipcRenderer.invoke('secure-save', data);
    },
    load: () => ipcRenderer.invoke('secure-load'),
    wipe: () => ipcRenderer.invoke('secure-wipe')
  }
});
