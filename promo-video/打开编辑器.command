#!/bin/bash
# 双击打开 LightPlayer 宣传片文字编辑器（macOS）。
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

if ! command -v npm >/dev/null 2>&1; then
  echo "需要先安装 Node.js（20 或更新版本）：https://nodejs.org"
  read -n 1 -s -r -p "按任意键关闭"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "第一次运行，正在安装依赖…"
  if ! npm install; then
    read -n 1 -s -r -p "安装失败，按任意键关闭"
    exit 1
  fi
fi

echo "编辑器会在浏览器中打开。导出视频期间请不要关闭这个窗口。"
npm run editor
