#!/usr/bin/env bash
# package-release.sh — 打包音频和数据文件为 GitHub Release 附件
#
# 输出到 /tmp/release-assets/ 目录:
#   - audio-part1.zip ~ audio-partN.zip  (每个 <1.5GB, GitHub 限制 2GB)
#   - data.zip                           (题库 JSON)

set -euo pipefail

FRONTEND="e:/ChinaStudyFree/frontend"
AUDIO_DIR="$FRONTEND/public/audio"
DATA_DIR="$FRONTEND/public/data"
OUT="/tmp/release-assets"

rm -rf "$OUT"
mkdir -p "$OUT"

# ---- Package data.zip ----
echo "=== 打包 data.zip ==="
cd "$FRONTEND/public"
zip -r "$OUT/data.zip" data/ -x '*.DS_Store'
echo "data.zip: $(du -sh "$OUT/data.zip" | cut -f1)"

# ---- Package audio as split zips ----
echo ""
echo "=== 打包音频文件 (Opus) ==="
cd "$AUDIO_DIR"

# Count opus files
TOTAL=$(find . -name "*.opus" | wc -l)
echo "共 $TOTAL 个 Opus 文件"

# List all opus files, split into chunks of ~1GB each
# Each opus file ~7KB, so ~140K files per 1GB
# With 66K files at ~7KB = ~460MB total, so 1 zip should be enough
# But let's split at 1.5GB zip size to be safe

find . -name "*.opus" | sort > /tmp/opus-list.txt

# Try single zip first — if under 1.5GB, use it
echo "创建 audio-part1.zip ..."
cd "$AUDIO_DIR"
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
