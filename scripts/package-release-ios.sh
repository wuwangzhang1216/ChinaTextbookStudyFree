#!/usr/bin/env bash
# package-release-ios.sh — 为 iOS 端打 GitHub Release 资源
#
# 与 package-release.sh 的区别：
#   1. opus → m4a 转码（iOS AVFoundation 不原生解 Opus）
#   2. 按 book 切包：每本教材一个 data zip + 一个 audio zip，配合 iOS 端
#      "首次进入某本书才下载这本的资源" 的渐进体验
#   3. 输出 ios-manifest.json 让 iOS 端按需查 URL/大小/校验和
#
# 用法:
#   bash scripts/package-release-ios.sh                  # 全部 book
#   bash scripts/package-release-ios.sh g1up chinese-g3up # 只打这两本
#   AAC_BITRATE=20k bash scripts/package-release-ios.sh  # 体积更小（默认 24k）
#   JOBS=8 bash scripts/package-release-ios.sh           # 并发转码 worker 数
#
# 输出到 /tmp/release-assets-ios/:
#   data-<bookId>.zip     —— books/<bookId>/ 子树
#   audio-ios-<bookId>.zip —— audio/<xx>/<sha>.m4a 子集（仅本书引用的）
#   ios-manifest.json     —— 索引 + 大小 + sha256

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PUBLIC="$ROOT/apps/web/public"
AUDIO_SRC="$WEB_PUBLIC/audio"
DATA_SRC="$WEB_PUBLIC/data"
OUT="/tmp/release-assets-ios"
TRANSCODE_CACHE="/tmp/cstf-m4a-cache"   # transcoded m4a 缓存，重复打包时可跳过

AAC_BITRATE="${AAC_BITRATE:-24k}"
JOBS="${JOBS:-4}"

if [ ! -d "$AUDIO_SRC" ]; then
  echo "❌ 找不到 $AUDIO_SRC" >&2
  echo "   请先运行: bash scripts/download-assets.sh" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "❌ 没有 ffmpeg。brew install ffmpeg" >&2
  exit 1
fi

mkdir -p "$OUT" "$TRANSCODE_CACHE"

# 选择要打的 book 列表
if [ "$#" -gt 0 ]; then
  BOOK_IDS=("$@")
else
  BOOK_IDS=()
  for d in "$DATA_SRC/books"/*/; do
    BOOK_IDS+=("$(basename "$d")")
  done
fi
echo "目标 book 数: ${#BOOK_IDS[@]}"
echo "AAC 比特率: $AAC_BITRATE  并发: $JOBS"
echo ""

# 全局 manifest（最后写入）
MANIFEST_TMP="$OUT/.ios-manifest.tmp.json"
echo '{"generatedAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","aacBitrate":"'"$AAC_BITRATE"'","books":[' > "$MANIFEST_TMP"
FIRST=1

# ---------- per-book 处理 ----------
for BOOK in "${BOOK_IDS[@]}"; do
  BOOK_DATA_DIR="$DATA_SRC/books/$BOOK"
  if [ ! -d "$BOOK_DATA_DIR" ]; then
    echo "⚠️  跳过 $BOOK：$BOOK_DATA_DIR 不存在"
    continue
  fi

  echo "=== $BOOK ==="

  # 1) 从所有 lesson/passages/stories JSON 里抽出引用的 opus 路径
  AUDIO_LIST_FILE="$OUT/.${BOOK}.opus-list"
  python3 - "$BOOK_DATA_DIR" "$AUDIO_LIST_FILE" <<'PY'
import json, os, re, sys
from pathlib import Path
book_dir = Path(sys.argv[1])
out = sys.argv[2]
shas = set()
pat = re.compile(r'/audio/([a-f0-9]{2})/([a-f0-9]+)\.opus')
for f in book_dir.rglob("*.json"):
    text = f.read_text(encoding="utf-8")
    for m in pat.finditer(text):
        shas.add((m.group(1), m.group(2)))
with open(out, "w") as fp:
    for prefix, sha in sorted(shas):
        fp.write(f"{prefix}/{sha}\n")
print(f"  引用 audio: {len(shas)} 个")
PY

  AUDIO_REF_COUNT=$(wc -l < "$AUDIO_LIST_FILE" | tr -d ' ')

  # 2) 转码 opus → m4a（写到 cache 里，避免重复打包）
  if [ "$AUDIO_REF_COUNT" -gt 0 ]; then
    echo "  转码 ($JOBS workers)..."
    < "$AUDIO_LIST_FILE" xargs -P "$JOBS" -I{} bash -c '
      rel="$1"
      src="'"$AUDIO_SRC"'/${rel}.opus"
      dst="'"$TRANSCODE_CACHE"'/${rel}.m4a"
      if [ -f "$dst" ] && [ "$dst" -nt "$src" ]; then exit 0; fi
      mkdir -p "$(dirname "$dst")"
      ffmpeg -loglevel error -y -i "$src" -c:a aac -b:a "'"$AAC_BITRATE"'" -ac 1 "$dst" || {
        echo "  ⚠ 转码失败: $rel"
      }
    ' _ {}
  fi

  # 3) 把本 book 的 m4a 打成 zip
  AUDIO_ZIP="$OUT/audio-ios-$BOOK.zip"
  rm -f "$AUDIO_ZIP"
  if [ "$AUDIO_REF_COUNT" -gt 0 ]; then
    pushd "$TRANSCODE_CACHE" >/dev/null
    sed 's/$/.m4a/' "$AUDIO_LIST_FILE" | sed 's|^|audio/|' > "$AUDIO_LIST_FILE.zipinput"
    # the file paths inside the zip should be `audio/xx/sha.m4a`
    # build a temp staging with that prefix via symlinks would be slow → use zip's -j? no, want dir
    # Workaround: temp dir of symlinks rooted at "audio/"
    STAGE="$OUT/.${BOOK}.stage"
    rm -rf "$STAGE"
    mkdir -p "$STAGE/audio"
    while read rel; do
      mkdir -p "$STAGE/audio/$(dirname "$rel")"
      ln -f "$TRANSCODE_CACHE/${rel}.m4a" "$STAGE/audio/${rel}.m4a" 2>/dev/null || \
        cp "$TRANSCODE_CACHE/${rel}.m4a" "$STAGE/audio/${rel}.m4a"
    done < "$AUDIO_LIST_FILE"
    popd >/dev/null
    (cd "$STAGE" && zip -qr "$AUDIO_ZIP" audio)
    rm -rf "$STAGE"
    rm -f "$AUDIO_LIST_FILE.zipinput"
  fi
  AUDIO_BYTES=$( [ -f "$AUDIO_ZIP" ] && stat -f %z "$AUDIO_ZIP" || echo 0 )
  AUDIO_SHA=$( [ -f "$AUDIO_ZIP" ] && shasum -a 256 "$AUDIO_ZIP" | awk '{print $1}' || echo "" )

  # 4) 打 data zip（books/<bookId>/ 子树）
  DATA_ZIP="$OUT/data-$BOOK.zip"
  rm -f "$DATA_ZIP"
  (cd "$DATA_SRC" && zip -qr "$DATA_ZIP" "books/$BOOK")
  DATA_BYTES=$(stat -f %z "$DATA_ZIP")
  DATA_SHA=$(shasum -a 256 "$DATA_ZIP" | awk '{print $1}')

  # 5) 写 manifest 条目
  if [ "$FIRST" -eq 0 ]; then echo "," >> "$MANIFEST_TMP"; fi
  FIRST=0
  cat >> "$MANIFEST_TMP" <<EOF
  {
    "bookId": "$BOOK",
    "audioRefCount": $AUDIO_REF_COUNT,
    "data": { "name": "data-$BOOK.zip", "bytes": $DATA_BYTES, "sha256": "$DATA_SHA" },
    "audio": { "name": "audio-ios-$BOOK.zip", "bytes": $AUDIO_BYTES, "sha256": "$AUDIO_SHA" }
  }
EOF

  echo "  data: $(du -h "$DATA_ZIP" | cut -f1)  audio: $( [ -f "$AUDIO_ZIP" ] && du -h "$AUDIO_ZIP" | cut -f1 || echo 0 )"

  rm -f "$AUDIO_LIST_FILE"
done

echo "" >> "$MANIFEST_TMP"
echo ']}' >> "$MANIFEST_TMP"
mv "$MANIFEST_TMP" "$OUT/ios-manifest.json"

echo ""
echo "=== 完成 ==="
echo "输出: $OUT"
TOTAL=$(du -sh "$OUT" | cut -f1)
echo "总大小: $TOTAL"
echo ""
echo "下一步: gh release create <tag> $OUT/*.zip $OUT/ios-manifest.json"
