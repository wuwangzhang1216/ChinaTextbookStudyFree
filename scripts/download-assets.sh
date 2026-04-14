#!/usr/bin/env bash
# download-assets.sh — 从 GitHub Release 下载前端所需的音频和数据文件
#
# 用法:
#   bash scripts/download-assets.sh              # 下载最新 release
#   bash scripts/download-assets.sh v1.1.0-assets # 下载指定版本
#
# 需要: curl, tar, python3 (处理 Windows 反斜杠路径的 zip)

set -euo pipefail

REPO="wuwangzhang1216/ChinaTextbookStudyFree"
TAG="${1:-latest}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PUBLIC_DIR="$FRONTEND_DIR/public"
DATA_SRC_DIR="$ROOT_DIR/data"

echo "=== ChinaStudyFree 资源下载器 ==="
echo "目标: $PUBLIC_DIR/  和  $DATA_SRC_DIR/"

# Resolve tag
if [ "$TAG" = "latest" ]; then
  echo "查询最新 release..."
  TAG=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*: "//;s/".*//')
  if [ -z "$TAG" ]; then
    echo "错误: 无法获取最新 release tag。请手动指定版本号。"
    exit 1
  fi
fi

echo "版本: $TAG"
BASE_URL="https://github.com/$REPO/releases/download/$TAG"

# 解压 zip 的同时把 Windows 反斜杠路径修正为正斜杠。
# release 里的 zip 没有顶层目录（直接就是 books/、chinese-g1down/ 等），
# 所以调用方必须传入正确的目标目录。
extract_zip() {
  local zip_path="$1" dest="$2"
  mkdir -p "$dest"
  python3 - "$zip_path" "$dest" <<'PY'
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    for name in z.namelist():
        fixed = name.replace('\\', '/')
        target = os.path.join(dst, fixed)
        if fixed.endswith('/'):
            os.makedirs(target, exist_ok=True)
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with z.open(name) as sf, open(target, 'wb') as df:
            df.write(sf.read())
PY
}

download() {
  local name="$1" out="$2"
  echo "  下载 $name ..."
  curl -L --progress-bar -o "$out" "$BASE_URL/$name"
}

# ---- audio.tar.gz ----
echo ""
echo "--- 下载音频文件 (Opus 格式, ~870MB) ---"
AUDIO_DIR="$PUBLIC_DIR/audio"
if [ -d "$AUDIO_DIR" ] && [ "$(find "$AUDIO_DIR" -name '*.opus' 2>/dev/null | head -1)" ]; then
  echo "  跳过 (目录已存在且含 opus 文件: $AUDIO_DIR)"
else
  download "audio.tar.gz" "/tmp/audio.tar.gz"
  echo "  解压到 $PUBLIC_DIR/ ..."
  mkdir -p "$PUBLIC_DIR"
  tar xzf "/tmp/audio.tar.gz" -C "$PUBLIC_DIR"
  rm -f "/tmp/audio.tar.gz"
  echo "  完成 ✓ ($(find "$AUDIO_DIR" -name '*.opus' | wc -l) 个音频文件)"
fi

# ---- data.zip ----
echo ""
echo "--- 下载题库数据 (JSON, ~4MB) ---"
DATA_DIR="$PUBLIC_DIR/data"
if [ -d "$DATA_DIR" ] && [ -f "$DATA_DIR/index.json" ]; then
  echo "  跳过 (目录已存在且含 index.json: $DATA_DIR)"
else
  download "data.zip" "/tmp/data.zip"
  echo "  解压到 $DATA_DIR/ ..."
  extract_zip "/tmp/data.zip" "$DATA_DIR"
  rm -f "/tmp/data.zip"
  echo "  完成 ✓"
fi

# ---- textbook-pages.zip ----
echo ""
echo "--- 下载课本原页扫描图 (JPG, ~192MB) ---"
PAGES_DIR="$PUBLIC_DIR/textbook-pages"
if [ -d "$PAGES_DIR" ] && [ "$(find "$PAGES_DIR" -name '*.jpg' 2>/dev/null | head -1)" ]; then
  echo "  跳过 (目录已存在且含 jpg 文件: $PAGES_DIR)"
else
  download "textbook-pages.zip" "/tmp/textbook-pages.zip"
  echo "  解压到 $PAGES_DIR/ ..."
  extract_zip "/tmp/textbook-pages.zip" "$PAGES_DIR"
  rm -f "/tmp/textbook-pages.zip"
  echo "  完成 ✓ ($(find "$PAGES_DIR" -name '*.jpg' | wc -l) 张课本扫描页)"
fi

# ---- story-images.zip ----
echo ""
echo "--- 下载故事配图 (JPEG, ~368MB) ---"
STORY_IMG_DIR="$PUBLIC_DIR/story-images"
if [ -d "$STORY_IMG_DIR" ] && [ "$(find "$STORY_IMG_DIR" -name '*.jpg' 2>/dev/null | head -1)" ]; then
  echo "  跳过 (目录已存在且含 jpg 文件: $STORY_IMG_DIR)"
else
  download "story-images.zip" "/tmp/story-images.zip"
  echo "  解压到 $STORY_IMG_DIR/ ..."
  extract_zip "/tmp/story-images.zip" "$STORY_IMG_DIR"
  rm -f "/tmp/story-images.zip"
  echo "  完成 ✓ ($(find "$STORY_IMG_DIR" -name '*.jpg' | wc -l) 张故事配图)"
fi

# ---- data-source.zip (passages + stories 源 JSON, 仓库根目录) ----
echo ""
echo "--- 下载 passages/stories 源 JSON (~811KB) ---"
if [ -d "$DATA_SRC_DIR/passages" ] && [ -d "$DATA_SRC_DIR/stories" ]; then
  echo "  跳过 (passages 和 stories 目录已存在)"
else
  download "data-source.zip" "/tmp/data-source.zip"
  echo "  解压到 $DATA_SRC_DIR/ ..."
  extract_zip "/tmp/data-source.zip" "$DATA_SRC_DIR"
  rm -f "/tmp/data-source.zip"
  echo "  完成 ✓"
fi

echo ""
echo "=== 全部下载完成! ==="
echo "现在可以运行: cd frontend && npm run dev"
