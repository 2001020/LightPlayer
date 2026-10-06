#!/usr/bin/env bash
# Places aria2c, which downloads updates over several connections, where
# Tauri expects sidecar binaries: src-tauri/binaries/aria2c-<target-triple>.
#
#   - Windows: the official static build.
#   - macOS: built from the official source with Apple TLS and only system
#     libraries (aria2 publishes no macOS build).
#   - Linux (development only): the aria2c on PATH.
#
#   scripts/fetch-aria2.sh                       # host triple
#   scripts/fetch-aria2.sh aarch64-apple-darwin
set -euo pipefail

cd "$(dirname "$0")/.."
TRIPLE="${1:-$(rustc -vV | sed -n 's/^host: //p')}"
DEST="$PWD/src-tauri/binaries"
VER=1.37.0
SRC_SHA256=60a420ad7085eb616cb6e2bdf0a7206d68ff3d37fb5a956dc44242eb2f79b66b
WIN64_SHA256=67d015301eef0b612191212d564c5bb0a14b5b9c4796b76454276a4d28d9b288
BASE="https://github.com/aria2/aria2/releases/download/release-$VER"
mkdir -p "$DEST"

ext=""
case "$TRIPLE" in
  *windows*) ext=".exe" ;;
esac
OUT="$DEST/aria2c-$TRIPLE$ext"
if [[ -f "$OUT" && -z "${FORCE:-}" ]]; then
  echo "$OUT already exists (set FORCE=1 to refresh)"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch() {
  echo "downloading $1"
  curl -fL --retry 4 --retry-delay 3 -o "$2" "$1"
  local got
  got="$( (sha256sum "$2" 2>/dev/null || shasum -a 256 "$2") | cut -d' ' -f1)"
  if [[ "$got" != "$3" ]]; then
    echo "error: checksum of $1 is $got, expected $3" >&2
    exit 1
  fi
}

case "$TRIPLE" in
  x86_64-pc-windows-msvc)
    fetch "$BASE/aria2-$VER-win-64bit-build1.zip" "$tmp/aria2.zip" "$WIN64_SHA256"
    unzip -q -j "$tmp/aria2.zip" "*/aria2c.exe" -d "$tmp"
    mv "$tmp/aria2c.exe" "$OUT"
    ;;
  aarch64-apple-darwin | x86_64-apple-darwin)
    fetch "$BASE/aria2-$VER.tar.xz" "$tmp/aria2.tar.xz" "$SRC_SHA256"
    tar -xf "$tmp/aria2.tar.xz" -C "$tmp"
    arch="${TRIPLE%%-*}"
    [[ "$arch" == aarch64 ]] && arch=arm64
    (
      cd "$tmp/aria2-$VER"
      export MACOSX_DEPLOYMENT_TARGET=12.0
      # Keep Homebrew's packages out: pkg-config finds nothing, zlib is the system's.
      export PKG_CONFIG_LIBDIR=/nonexistent PKG_CONFIG_PATH=
      ./configure --disable-dependency-tracking --disable-nls \
        --with-appletls --without-openssl --without-gnutls \
        --without-libnettle --without-libgmp --without-libgcrypt \
        --without-sqlite3 --without-libxml2 --without-libexpat \
        --without-libcares --without-libssh2 \
        --disable-bittorrent --disable-metalink --disable-websocket \
        ZLIB_CFLAGS="" ZLIB_LIBS="-lz" \
        CFLAGS="-O2 -arch $arch" CXXFLAGS="-O2 -arch $arch" LDFLAGS="-arch $arch" >/dev/null
      make -j"$(sysctl -n hw.ncpu)" >/dev/null
      strip src/aria2c
    )
    bin="$tmp/aria2-$VER/src/aria2c"
    # Only libraries every Mac has.
    if otool -L "$bin" | tail -n +2 | grep -v -E '^\s+(/usr/lib/|/System/Library/)'; then
      echo "error: aria2c links libraries outside the system" >&2
      exit 1
    fi
    mv "$bin" "$OUT"
    ;;
  *linux*)
    src="$(command -v aria2c || true)"
    if [[ -z "$src" ]]; then
      echo "error: aria2c not found on PATH (e.g. apt install aria2)" >&2
      exit 1
    fi
    cp -f "$src" "$OUT"
    ;;
  *)
    echo "unsupported target $TRIPLE" >&2
    exit 1
    ;;
esac

chmod +x "$OUT"
if [[ "$TRIPLE" != *windows* || "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]]; then
  "$OUT" --version | head -1
fi
ls -la "$OUT"
