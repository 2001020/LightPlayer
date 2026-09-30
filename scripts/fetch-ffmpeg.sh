#!/usr/bin/env bash
# Downloads static ffmpeg/ffprobe builds and places them where Tauri expects
# sidecar binaries: src-tauri/binaries/<name>-<target-triple>.
#
#   scripts/fetch-ffmpeg.sh                 # host triple
#   scripts/fetch-ffmpeg.sh aarch64-apple-darwin
#   FFMPEG_SOURCE=system scripts/fetch-ffmpeg.sh   # link the ffmpeg on PATH (dev only)
set -euo pipefail

cd "$(dirname "$0")/.."
TRIPLE="${1:-$(rustc -vV | sed -n 's/^host: //p')}"
DEST="src-tauri/binaries"
SOURCE="${FFMPEG_SOURCE:-static}"
TAG="${FFMPEG_STATIC_TAG:-b6.1.1}"
mkdir -p "$DEST"

ext=""
case "$TRIPLE" in
  *windows*) ext=".exe" ;;
esac

if [[ "$SOURCE" == "system" || "$TRIPLE" == *linux* ]]; then
  for tool in ffmpeg ffprobe; do
    src="$(command -v "$tool" || true)"
    if [[ -z "$src" ]]; then
      echo "error: $tool not found on PATH" >&2
      exit 1
    fi
    cp -f "$src" "$DEST/$tool-$TRIPLE$ext"
    echo "copied $src -> $DEST/$tool-$TRIPLE$ext"
  done
  exit 0
fi

case "$TRIPLE" in
  aarch64-apple-darwin) STATIC_ARCH="darwin-arm64"; RIEDL_ARCH="arm64" ;;
  x86_64-apple-darwin)  STATIC_ARCH="darwin-x64";   RIEDL_ARCH="amd64" ;;
  x86_64-pc-windows-msvc) STATIC_ARCH="win32-x64";  RIEDL_ARCH="" ;;
  *) echo "unsupported target $TRIPLE" >&2; exit 1 ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch_static() {
  local tool="$1"
  local url="https://github.com/eugeneware/ffmpeg-static/releases/download/$TAG/$tool-$STATIC_ARCH.gz"
  echo "downloading $url"
  curl -fL --retry 4 --retry-delay 3 -o "$tmp/$tool.gz" "$url" || return 1
  gunzip -f "$tmp/$tool.gz"
  mv "$tmp/$tool" "$DEST/$tool-$TRIPLE$ext"
}

fetch_riedl() {
  local tool="$1"
  [[ -n "$RIEDL_ARCH" ]] || return 1
  local url="https://ffmpeg.martin-riedl.de/redirect/latest/macos/$RIEDL_ARCH/release/$tool.zip"
  echo "downloading $url"
  curl -fL --retry 4 --retry-delay 3 -o "$tmp/$tool.zip" "$url" || return 1
  unzip -o -q "$tmp/$tool.zip" -d "$tmp/$tool-dir"
  mv "$tmp/$tool-dir/$tool" "$DEST/$tool-$TRIPLE$ext"
}

for tool in ffmpeg ffprobe; do
  if [[ -f "$DEST/$tool-$TRIPLE$ext" && -z "${FORCE:-}" ]]; then
    echo "$DEST/$tool-$TRIPLE$ext already exists (set FORCE=1 to refresh)"
    continue
  fi
  fetch_static "$tool" || fetch_riedl "$tool" || { echo "failed to download $tool" >&2; exit 1; }
  chmod +x "$DEST/$tool-$TRIPLE$ext"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    xattr -c "$DEST/$tool-$TRIPLE$ext" 2>/dev/null || true
    "$DEST/$tool-$TRIPLE$ext" -hide_banner -version | head -1
  fi
done
ls -la "$DEST"
