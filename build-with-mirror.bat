@echo off
echo 正在使用国内镜像源打包应用...
echo.

REM 设置淘宝镜像源
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

echo 镜像源配置：
echo ELECTRON_MIRROR=%ELECTRON_MIRROR%
echo ELECTRON_BUILDER_BINARIES_MIRROR=%ELECTRON_BUILDER_BINARIES_MIRROR%
echo.

echo 开始打包...
npm run build:win

echo.
echo 打包完成！
pause
