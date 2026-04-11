#!/usr/bin/env bash
# run_shard.sh N/M MAX_ITEMS
# 循环调用 batch_tts.py --shard N/M --max-items K，直到没有待生成条目。
# 目的：规避 qwen-tts 在 MPS 上的内存累积泄漏。

set -u
cd "$(dirname "$0")/../.."

SHARD="${1:?usage: run_shard.sh N/M MAX}"
MAX="${2:-150}"
LOG_DIR="scripts/tts/logs"
mkdir -p "$LOG_DIR"
IDX="${SHARD%/*}"
OUT="$LOG_DIR/shard_${IDX}.log"

source .venv-tts/bin/activate

# 禁用 MPS 缓存分配器 —— 避免长时间运行后 GPU 内存碎片化导致速率暴跌
export PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0

iter=0
while true; do
  iter=$((iter+1))
  echo "=== [$(date +%H:%M:%S)] shard=$SHARD iter=$iter max=$MAX ===" >> "$OUT"
  python -u scripts/tts/batch_tts.py --shard "$SHARD" --max-items "$MAX" >> "$OUT" 2>&1
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "=== python exited rc=$rc, sleeping 5s before retry ===" >> "$OUT"
    sleep 5
    continue
  fi
  # 若已无待生成条目，batch_tts.py 会直接打印并正常退出 —— 我们用 dry-run 判断
  remaining=$(python -u scripts/tts/batch_tts.py --shard "$SHARD" --dry-run 2>/dev/null | awk '/待生成/ {print $2}' | tr -d ':')
  if [ -z "$remaining" ] || [ "$remaining" = "0" ]; then
    echo "=== shard $SHARD 全部完成，退出 ===" >> "$OUT"
    break
  fi
done
