#!/usr/bin/env bash
# download-assets.sh — 从 GitHub Release 下载前端所需的音频和数据文件
#
# 用法:
#   bash scripts/download-assets.sh          # 下载最新 release
#   bash scripts/download-assets.sh v1.0.0   # 下载指定版本
#
# 需要: curl, tar

set -euo pipefail

REPO="wuwangzhang1216/ChinaTextbookStudyFree"
TAG="${1:-latest}"
FRONTEND_DIR="$(cd "$(dirname "$0")/../frontend" && pwd)"
PUBLIC_DIR="$FRONTEND_DIR/public"

echo "=== ChinaStudyFree 资源下载器 ==="
echo "目标: $PUBLIC_DIR/"

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

# ---- Download audio (tar.gz) ----
echo ""
echo "--- 下载音频文件 (Opus 格式) ---"
AUDIO_DIR="$PUBLIC_DIR/audio"
if [ -d "$AUDIO_DIR" ] && [ "$(find "$AUDIO_DIR" -name '*.opus' 2>/dev/null | head -1)" ]; then
  echo "  跳过 (目录已存在且含 opus 文件: $AUDIO_DIR)"
else
  echo "  下载 audio.tar.gz ..."
  curl -L --progress-bar -o "/tmp/audio.tar.gz" "$BASE_URL/audio.tar.gz"
  echo "  解压到 $PUBLIC_DIR/ ..."
  mkdir -p "$PUBLIC_DIR"
  tar xzf "/tmp/audio.tar.gz" -C "$PUBLIC_DIR"
  rm -f "/tmp/audio.tar.gz"
  echo "  完成 ✓ ($(find "$AUDIO_DIR" -name '*.opus' | wc -l) 个音频文件)"
fi

# ---- Download data (tar.gz) ----
echo ""
echo "--- 下载题库数据 (JSON) ---"
DATA_DIR="$PUBLIC_DIR/data"
if [ -d "$DATA_DIR" ] && [ "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
  echo "  跳过 (目录已存在且非空: $DATA_DIR)"
else
  echo "  下载 data.tar.gz ..."
  curl -L --progress-bar -o "/tmp/data.tar.gz" "$BASE_URL/data.tar.gz"
  echo "  解压到 $PUBLIC_DIR/ ..."
  mkdir -p "$PUBLIC_DIR"
  tar xzf "/tmp/data.tar.gz" -C "$PUBLIC_DIR"
  rm -f "/tmp/data.tar.gz"
  echo "  完成 ✓"
fi

# ---- Download textbook-pages (tar.gz) ----
echo ""
echo "--- 下载课本原页图片 ---"
PAGES_DIR="$PUBLIC_DIR/textbook-pages"
if [ -d "$PAGES_DIR" ] && [ "$(ls -A "$PAGES_DIR" 2>/dev/null)" ]; then
  echo "  跳过 (目录已存在且非空: $PAGES_DIR)"
else
  echo "  下载 textbook-pages.tar.gz ..."
  curl -L --progress-bar -o "/tmp/textbook-pages.tar.gz" "$BASE_URL/textbook-pages.tar.gz"
  echo "  解压到 $PUBLIC_DIR/ ..."
  mkdir -p "$PUBLIC_DIR"
  tar xzf "/tmp/textbook-pages.tar.gz" -C "$PUBLIC_DIR"
  rm -f "/tmp/textbook-pages.tar.gz"
  echo "  完成 ✓ ($(find "$PAGES_DIR" -type f | wc -l) 张课本页)"
fi

echo ""
echo "=== 全部下载完成! ==="
echo "现在可以运行: cd frontend && npm run dev"
