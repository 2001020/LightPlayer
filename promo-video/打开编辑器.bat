@echo off
chcp 65001 >nul
rem 双击打开 LightPlayer 宣传片文字编辑器（Windows）。
cd /d "%~dp0"

where npm >nul 2>nul || goto :nonode
if exist node_modules goto :run

echo 第一次运行，正在安装依赖...
call npm install || goto :failed

:run
echo 编辑器会在浏览器中打开。导出视频期间请不要关闭这个窗口。
call npm run editor
pause
exit /b

:nonode
echo 需要先安装 Node.js（20 或更新版本）：https://nodejs.org
pause
exit /b 1

:failed
echo 安装依赖失败，请检查网络后重试。
pause
exit /b 1
