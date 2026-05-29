# vendor/

本目录存放**本地化**的第三方运行时资源，使应用离线可用、并满足严格 CSP（不加载任何外部域脚本）。

- `chart.umd.js` — Chart.js 4.4.1 的 UMD 构建（取自 npm 包 `chart.js@4.4.1` 的 `dist/chart.umd.js`，
  已移除末尾 sourceMappingURL 注释）。在浏览器中通过 `<script>` 引入后会挂载全局 `window.Chart`。

> 说明：`chart.js` 仍在 `package.json` 中作为依赖记录（版本来源）。该 vendored 副本为打包器接入前的
> 过渡方案；后续引入 Vite 后将改为由打包器从 `node_modules` 引入并移除此副本。
