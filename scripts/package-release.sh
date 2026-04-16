#!/usr/bin/env bash
# package-release.sh — 打包所有生成资源为 GitHub Release 附件
#
# 输出到 /tmp/release-assets/ 目录:
#   - audio-part1.zip ~ audio-partN.zip  (TTS 音频, 每个 <1.5GB)
#   - data.zip                           (题库/故事 JSON)
#   - story-images.zip                   (AI 故事配图)
#   - textbook-pages.zip                 (课本原页 JPG)

set -euo pipefail

FRONTEND="$(cd "$(dirname "$0")/.." && pwd)/apps/web"
AUDIO_DIR="$FRONTEND/public/audio"
DATA_DIR="$FRONTEND/public/data"
IMAGES_DIR="$FRONTEND/public/story-images"
PAGES_DIR="$FRONTEND/public/textbook-pages"
OUT="/tmp/release-assets"

rm -rf "$OUT"
mkdir -p "$OUT"

# ---- data.zip ----
echo "=== 打包 data.zip ==="
cd "$FRONTEND/public"
zip -r "$OUT/data.zip" data/ -x '*.DS_Store'
echo "data.zip: $(du -sh "$OUT/data.zip" | cut -f1)"

# ---- story-images.zip ----
if [ -d "$IMAGES_DIR" ]; then
  echo ""
  echo "=== 打包 story-images.zip ==="
  cd "$FRONTEND/public"
  zip -r "$OUT/story-images.zip" story-images/ -x '*.DS_Store'
  echo "story-images.zip: $(du -sh "$OUT/story-images.zip" | cut -f1)"
fi

# ---- textbook-pages.zip ----
if [ -d "$PAGES_DIR" ]; then
  echo ""
  echo "=== 打包 textbook-pages.zip ==="
  cd "$FRONTEND/public"
  zip -r "$OUT/textbook-pages.zip" textbook-pages/ -x '*.DS_Store'
  echo "textbook-pages.zip: $(du -sh "$OUT/textbook-pages.zip" | cut -f1)"
fi

# ---- audio (split zips) ----
echo ""
echo "=== 打包音频文件 (Opus) ==="
cd "$AUDIO_DIR"

TOTAL=$(find . -name "*.opus" | wc -l)
echo "共 $TOTAL 个 Opus 文件"

find . -name "*.opus" | sort > /tmp/opus-list.txt

echo "创建 audio-part1.zip ..."
cat /tmp/opus-list.txt | zip -@ "$OUT/audio-part1.zip"

SIZE=$(stat -c%s "$OUT/audio-part1.zip" 2>/dev/null || stat -f%z "$OUT/audio-part1.zip" 2>/dev/null)
SIZE_MB=$((SIZE / 1024 / 1024))
echo "audio-part1.zip: ${SIZE_MB}MB"

if [ "$SIZE_MB" -gt 1500 ]; then
  echo "文件过大，需要分片..."
  rm "$OUT/audio-part1.zip"

  TOTAL_FILES=$(wc -l < /tmp/opus-list.txt)
  PARTS=$(( (SIZE_MB / 1400) + 1 ))
  FILES_PER_PART=$(( TOTAL_FILES / PARTS + 1 ))

  split -l "$FILES_PER_PART" /tmp/opus-list.txt /tmp/opus-chunk-

  i=1
  for chunk in /tmp/opus-chunk-*; do
    echo "创建 audio-part${i}.zip ..."
    cd "$AUDIO_DIR"
    cat "$chunk" | zip -@ "$OUT/audio-part${i}.zip"
    echo "  $(du -sh "$OUT/audio-part${i}.zip" | cut -f1)"
    i=$((i + 1))
  done
  rm -f /tmp/opus-chunk-*
fi

rm -f /tmp/opus-list.txt

echo ""
echo "=== 打包完成 ==="
ls -lh "$OUT/"
echo ""
echo "总大小: $(du -sh "$OUT" | cut -f1)"
