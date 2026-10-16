#!/usr/bin/env python3
"""
edge_tts_batch.py — 免费批量语音合成（微软 Edge 朗读，零 API Key，只需联网）。

与 api_tts.py（阿里云 DashScope，需付费 Key）**完全相同的 manifest / 输出路径 /
断点续传 / 并发语义**，可作为免费替代或补充：没有 DASHSCOPE_API_KEY 时，
用本脚本也能生成全站 TTS 音频。

用法:
    pip install edge-tts                 # 免费开源（MIT），无需任何 Key

    python scripts/tts/edge_tts_batch.py --dry-run          # 先看有多少条
    python scripts/tts/edge_tts_batch.py --limit 50         # 先试 50 条
    python scripts/tts/edge_tts_batch.py                    # 全量
    python scripts/tts/edge_tts_batch.py --language English # 只跑英文

依赖:
    pip install edge-tts>=7.0

说明:
    - 输出路径 / 命名与 api_tts.py 一致（audio_root/<audio_rel>），两者产物可直接混用；
    - 断点续传：已存在的文件自动跳过；
    - 需要 edge-tts >= 7.x：旧版本不带 Sec-MS-GEC v2 令牌，会被微软服务返回 403；
    - edge-tts 为 MIT 开源项目（https://github.com/rany2/edge-tts）；
    - 该方案走微软公共服务，仅供学习交流，请遵守微软服务条款。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("❌ 未安装 edge-tts。请先执行: pip install edge-tts>=7.0")

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"
AUDIO_ROOT = ROOT / "apps" / "web" / "public" / "audio"

# manifest speaker → 微软 Edge 音色（与 api_tts.py 的 SPEAKER_MAP 同键，换成免费音色）。
# 中文默认温暖女声（适合小学生）；英文用美式男女声。
SPEAKER_MAP = {
    # 中文条目
    "vivian":   "zh-CN-XiaoxiaoNeural",   # 晓晓 - 温暖阳光，低中年级主力
    "serena":   "zh-CN-XiaoyiNeural",     # 晓伊 - 温柔，高年级
    "uncle_fu": "zh-CN-XiaohanNeural",    # 晓函 - 知性温柔，科学讲解
    # 英文条目
    "sohee":    "en-US-AnnaNeural",       # 女声，低年级英语
    "ryan":     "en-US-GuyNeural",        # 男声，中年级英语
    "dylan":    "en-US-AriaNeural",       # 女声，高年级英语
}

DEFAULT_VOICE_ZH = "zh-CN-XiaoxiaoNeural"
DEFAULT_VOICE_EN = "en-US-AnnaNeural"


def pick_voice(item: dict, voice_zh: str, voice_en: str) -> str:
    speaker = item.get("speaker")
    if speaker in SPEAKER_MAP:
        return SPEAKER_MAP[speaker]
    if item.get("language") == "English":
        return voice_en
    return voice_zh


async def synth_one(
    item: dict,
    audio_root: Path,
    rate: str,
    volume: str,
    pitch: str,
    voice_zh: str,
    voice_en: str,
    max_retries: int = 5,
) -> tuple[bool, str]:
    """合成一条；返回 (成功与否, 错误信息)。已存在则跳过。"""
    out_path = audio_root / item["audio_rel"]
    if out_path.exists():
        return True, "skip"

    voice = pick_voice(item, voice_zh, voice_en)
    text = item.get("text", "")
    if not text:
        return False, "empty text"

    last_err = ""
    for attempt in range(max_retries):
        try:
            communicate = edge_tts.Communicate(
                text=text, voice=voice, rate=rate, volume=volume, pitch=pitch
            )
            audio = bytearray()
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio":
                    audio.extend(chunk["data"])
            if not audio:
                last_err = "empty audio stream"
            else:
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_bytes(audio)
                return True, ""
        except Exception as e:  # noqa: BLE001 - 批量任务里任何错误都重试
            last_err = f"{type(e).__name__}: {e}"
        # 指数退避 + 抖动
        await asyncio.sleep(min(10, 2**attempt) + attempt * 0.3)
    return False, last_err


async def run(args: argparse.Namespace) -> None:
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    items = manifest["items"]

    # 与 api_tts.py 相同的过滤 / 分片语义
    if args.language and args.language != "all":
        items = [it for it in items if it.get("language") == args.language]
    if args.subject:
        items = [it for it in items if it.get("subject") == args.subject]
    if args.field:
        items = [it for it in items if it.get("field") == args.field]

    n, m = (int(x) for x in args.shard.split("/"))
    items = [it for i, it in enumerate(items) if i % m == n]

    audio_root = Path(args.audio_root)
    pending = [it for it in items if not (audio_root / it["audio_rel"]).exists()]
    skipped = len(items) - len(pending)
    if args.limit:
        pending = pending[: args.limit]

    print(f"📊 总量: {len(manifest['items'])}  本次范围: {len(items)}  "
          f"已跳过: {skipped}  待生成: {len(pending)}")
    print(f"🎤 引擎: EdgeTTS(免费)   workers: {args.workers}   "
          f"rate: {args.rate}   中文音色: {args.voice_zh}   英文音色: {args.voice_en}")
    if args.dry_run or not pending:
        return

    total = len(pending)
    done = 0
    fail = 0
    t0 = time.time()
    stats_lock = asyncio.Lock()
    sem = asyncio.Semaphore(args.workers)

    async def worker(item: dict) -> tuple[dict, bool, str]:
        async with sem:
            ok, err = await synth_one(
                item, audio_root, args.rate, args.volume, args.pitch,
                args.voice_zh, args.voice_en,
            )
            return item, ok, err

    tasks = [asyncio.create_task(worker(it)) for it in pending]
    for coro in asyncio.as_completed(tasks):
        item, ok, err = await coro
        async with stats_lock:
            done += 1
            if not ok:
                fail += 1
                print(f"  ⚠️  {str(item.get('hash', '?'))[:8]} 失败: {err}", flush=True)
            if done % 50 == 0 or done == total:
                elapsed = time.time() - t0
                rate_n = done / elapsed if elapsed else 0
                eta = (total - done) / rate_n if rate_n else 0
                print(
                    f"  [{done:>5}/{total}] {rate_n:5.1f} it/s   "
                    f"ETA {eta / 60:6.1f} min   fail={fail}",
                    flush=True,
                )

    print(f"\n🎉 完成。成功 {total - fail} 失败 {fail}，用时 {(time.time() - t0) / 60:.1f} min")


def main() -> None:
    p = argparse.ArgumentParser(description="免费批量 TTS（微软 Edge 朗读，零 API Key）")
    p.add_argument("--manifest", default=str(MANIFEST_PATH))
    p.add_argument("--audio-root", default=str(AUDIO_ROOT))
    p.add_argument("--workers", type=int, default=16,
                   help="并发数（Edge 服务较敏感，默认 16，勿过大）")
    p.add_argument("--limit", type=int, default=0, help="只生成前 N 条（调试用）")
    p.add_argument("--shard", default="0/1", help="分片，如 0/4 表示只跑 1/4")
    p.add_argument("--subject", default="")
    p.add_argument("--field", default="")
    p.add_argument("--language", default="all",
                   help="只跑指定语言（默认 all，传 Chinese/English 过滤）")
    p.add_argument("--rate", default="-5%", help="语速（默认 -5%%，略慢适合小学生）")
    p.add_argument("--volume", default="+0%")
    p.add_argument("--pitch", default="+0Hz")
    p.add_argument("--voice-zh", default=DEFAULT_VOICE_ZH, help="中文兜底音色")
    p.add_argument("--voice-en", default=DEFAULT_VOICE_EN, help="英文兜底音色")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
