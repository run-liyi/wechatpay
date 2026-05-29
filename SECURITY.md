# 安全策略

## 漏洞上报

如发现安全问题，请**不要**公开提交 issue。请通过私有渠道（仓库的 Security Advisory 或维护者邮箱）
报告，包含：复现步骤、影响范围、受影响版本。我们会在确认后尽快修复并致谢。

## 依赖安全审计

- 本地：`npm run audit`（完整）/ `npm run audit:ci`（仅生产依赖，高危即失败）。
- CI：`.github/workflows/security-audit.yml` 在每次 push/PR 及每周定时运行，出现高危/严重漏洞即失败。

### 已知依赖事项：`xlsx`

`xlsx`（SheetJS）在 npm 上的 `0.18.5` 存在已披露的 **原型污染** 与 **ReDoS** 公告。缓解措施：

- 本应用仅解析**用户本地选择**的账单文件，不处理网络来源的不可信输入，攻击面有限；
- 解析在主进程进行，渲染进程已启用 `contextIsolation` + `sandbox` 且全程 `textContent` 渲染，
  即使解析结果含恶意字符串也不会被执行；
- 建议升级到 SheetJS 官方发行版（其 CDN/官方源的 `0.20.2+` 已修复上述问题）。后续打包本地化 PR
  会一并评估切换到官方发行版。

## 代码签名与产物校验

- 安装包通过 electron-builder 签名，凭据全部来自环境变量，详见 [`build/sign-config.md`](build/sign-config.md)。
- 校验方式：
  - Windows：`signtool verify /pa /v <安装包>.exe`
  - macOS：`codesign --verify --deep --strict --verbose=2 <App>` 与 `spctl -a -vvv <App>`

## 隐私

本应用为纯本地工具，不上传任何账单数据。请勿向仓库提交真实账单（仓库已通过 `.gitignore`
与提交前钩子拦截，详见 README 的「提交防护」小节）。
