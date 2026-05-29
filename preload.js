// preload.js
// 在隔离的预加载环境中运行（contextIsolation: true + sandbox: true）。
// 仅通过 contextBridge 暴露受控的 IPC 入口给渲染进程，渲染层不再直接 require('electron')。
//
// 说明：本 PR 先建立安全基线（关闭 nodeIntegration、开启 contextIsolation/sandbox），
// 暴露一个最小的 invoke 桥接以保持现有功能可用；后续 PR 将进一步收敛为按方法命名的
// 白名单接口（selectFile / parseBill / exportReport）并加入参数校验。
const { contextBridge, ipcRenderer } = require('electron');

// 允许的 IPC 通道白名单（与主进程 ipcMain.handle 注册的通道一致）。
const ALLOWED_CHANNELS = ['select-file', 'parse-bill-file', 'export-report'];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  }
});
