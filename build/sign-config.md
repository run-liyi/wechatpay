# 代码签名配置说明

本项目通过 **electron-builder** 进行多平台打包与代码签名。**所有签名凭据均来自环境变量，绝不入库**。

## Windows（Authenticode）

electron-builder 会自动读取以下环境变量对 NSIS 安装包签名：

| 变量 | 说明 |
| --- | --- |
| `CSC_LINK` | 证书文件路径或 base64（.pfx/.p12） |
| `CSC_KEY_PASSWORD` | 证书密码 |

> 已移除 `build.win.sign = null`（该值会**禁用**签名）。在未提供上述变量的环境中，
> electron-builder 会跳过签名并继续构建未签名包，便于本地开发。

## macOS（签名 + 公证）

`build.mac` 已开启 `hardenedRuntime` 并指定 `build/entitlements.mac.plist`。所需变量：

| 变量 | 说明 |
| --- | --- |
| `CSC_LINK` / `CSC_KEY_PASSWORD` | Developer ID Application 证书及密码 |
| `APPLE_ID` | 苹果开发者账号 |
| `APPLE_APP_SPECIFIC_PASSWORD` | App 专用密码（用于 notarytool 公证） |
| `APPLE_TEAM_ID` | 团队 ID |

## 在 CI 中注入

将上述值配置为仓库 Secrets，并在工作流中映射为环境变量（详见后续 release 流水线 PR）。
**切勿**将证书或密码提交到仓库。

## 验证签名

- Windows：`signtool verify /pa /v 微信账单分析工具-Setup.exe`
- macOS：`codesign --verify --deep --strict --verbose=2 微信账单分析工具.app` 与 `spctl -a -vvv 微信账单分析工具.app`
