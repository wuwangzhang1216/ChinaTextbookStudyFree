#!/usr/bin/env bash
# build-seed-zip.sh — 重建 apps/mobile 的离线种子包
#
# 把一本教材的 data + 第一节 lesson 引用的音频（转成 m4a）打成
# apps/mobile/ChinaTextbookStudy/Resources/seed-data.zip，供 SeedInstaller
# 在首启时解压到 Application Support/cstf/。
#
# 用法:
#   bash scripts/build-seed-zip.sh                  # 默认 g1up + g1up-u1-kp1
#   bash scripts/build-seed-zip.sh g2up g2up-u1-kp1 # 换一本书 + 换一节课
#
# 体积参考: g1up + 49 个 24k AAC m4a ≈ 630 KB

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOOK_ID="${1:-g1up}"
LESSON_ID="${2:-g1up-u1-kp1}"
DATA_DIR="$ROOT/apps/web/public/data/books/$BOOK_ID"
AUDIO_SRC="$ROOT/apps/web/public/audio"
OUT="$ROOT/apps/mobile/ChinaTextbookStudy/Resources/seed-data.zip"
STAGE="/tmp/cstf-seed-stage"

if [ ! -d "$DATA_DIR" ]; then
  echo "❌ 找不到 $DATA_DIR" >&2
  echo "   请先运行: bash scripts/download-assets.sh" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "❌ 没有 ffmpeg。brew install ffmpeg" >&2
  exit 1
fi

LESSON_JSON="$DATA_DIR/lessons/$LESSON_ID.json"
if [ ! -f "$LESSON_JSON" ]; then
  echo "❌ 找不到 lesson 文件: $LESSON_JSON" >&2
  exit 1
fi

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE/data/books" "$STAGE/audio"
cp -R "$DATA_DIR" "$STAGE/data/books/"

echo "=== 抽取 $LESSON_ID 引用的音频 ==="
python3 - "$LESSON_JSON" > /tmp/cstf-seed-audio.txt <<'PY'
import json, re, sys
text = open(sys.argv[1]).read()
shas = sorted(set(re.findall(r'/audio/([a-f0-9]{2})/([a-f0-9]+)\.opus', text)))
for prefix, sha in shas:
    print(f"{prefix}/{sha}")
PY
COUNT=$(wc -l < /tmp/cstf-seed-audio.txt | tr -d ' ')
echo "  $COUNT 个 audio sha"

echo "=== 转码 opus → m4a (24k mono AAC) ==="
i=0
while read rel; do
  i=$((i+1))
  src="$AUDIO_SRC/${rel}.opus"
  dst="$STAGE/audio/${rel}.m4a"
  mkdir -p "$(dirname "$dst")"
  ffmpeg -loglevel error -y -i "$src" -c:a aac -b:a 24k -ac 1 "$dst" 2>&1 || echo "  ⚠ 转码失败: $rel"
done < /tmp/cstf-seed-audio.txt

echo "=== 打包 ==="
(cd "$STAGE" && zip -qr "$OUT" data audio)
SIZE=$(du -h "$OUT" | cut -f1)
echo "完成 → $OUT ($SIZE)"
rm -f /tmp/cstf-seed-audio.txt
