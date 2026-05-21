# Assets 文件夹

此文件夹用于存放应用图标等资源文件。

## 图标文件

打包应用时需要以下图标文件：

- `icon.png` - 通用图标 (512x512 或更大)
- `icon.ico` - Windows 图标
- `icon.icns` - macOS 图标

## 如何生成图标

1. 准备一个 512x512 或更大的 PNG 图片
2. 使用在线工具或专业软件生成不同格式：
   - Windows (.ico): https://icoconvert.com/
   - macOS (.icns): https://cloudconvert.com/png-to-icns

## 临时方案

如果暂时没有图标文件，应用仍可正常运行，只是会使用默认的 Electron 图标。
