import { defineConfig } from 'vite';

// Vite 配置（适配 Electron 渲染进程）
// - base './'：产物用相对路径引用，便于 Electron 以 file:// 加载 dist
// - target 'chrome'：仅需兼容 Electron 内置的 Chromium
// - 其余应用脚本为经典脚本，由 Vite 原样拷贝到 dist
export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: 'index.html'
    },
    // 解析/统计等模块保持 CommonJS（供 main 进程与 node --test 复用），
    // 由 commonjs 插件转换为命名导出供渲染层 ESM 引入。
    commonjsOptions: {
      include: [
        /node_modules/,
        /src[\\/]utils[\\/]/,
        /src[\\/]core[\\/]/,
        /src[\\/]analytics[\\/]/,
        /chart-theme\.js$/
      ],
      transformMixedEsModules: true
    }
  },
  server: {
    port: 5173
  }
});
