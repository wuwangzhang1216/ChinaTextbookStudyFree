#!/usr/bin/env python3
"""
batch_tts.py — 消费 manifest.json，把每条文本合成 mp3 写入
frontend/public/audio/<hash[:2]>/<hash>.opus。

支持:
  - 断点续跑（已存在的 mp3 自动跳过）
  - 分片：--shard 0/4 让多终端并行
  - 限速 / 限量：--limit N 用于 smoke test
  - 仅按 subject 跑：--subject math
  - 输出 mp3（优先 soundfile 原生 MP3，失败回退 ffmpeg）

依赖:
  pip install qwen-tts soundfile
  brew install ffmpeg libsndfile  # 任一即可
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"
AUDIO_ROOT = ROOT / "frontend" / "public" / "audio"


def get_device():
    if torch.cuda.is_available():
        try:
            import flash_attn  # noqa: F401
            attn = "flash_attention_2"
            print(f"✅ 使用 CUDA GPU ({torch.cuda.get_device_name(0)}) + flash-attn2")
        except Exception:
            attn = "sdpa"
            print(f"✅ 使用 CUDA GPU ({torch.cuda.get_device_name(0)}) + sdpa（未装 flash-attn）")
        return "cuda:0", torch.bfloat16, attn
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        print("✅ 使用 Apple MPS (M 系列芯片)")
        return "mps", torch.float16, "sdpa"
    print("⚠️  使用 CPU（速度较慢）")
    return "cpu", torch.float32, "sdpa"


# ---------------------------------------------------------------------------
# WAV → MP3
# ---------------------------------------------------------------------------
_FFMPEG = shutil.which("ffmpeg")
_SF_MP3_OK: bool | None = None


def _try_sf_mp3(path: Path, audio, sr: int) -> bool:
    global _SF_MP3_OK
    if _SF_MP3_OK is False:
        return False
    try:
        sf.write(str(path), audio, sr, format="MP3")
        _SF_MP3_OK = True
        return True
    except Exception:
        _SF_MP3_OK = False
        return False


def write_mp3(path: Path, audio, sr: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    if _try_sf_mp3(path, audio, sr):
        return
    if not _FFMPEG:
        sys.exit(
            "❌ soundfile 不支持 MP3 且未安装 ffmpeg。\n"
            "   brew install ffmpeg  或  brew install libsndfile"
        )
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        sf.write(tmp_path, audio, sr, format="WAV")
        subprocess.run(
            [
                _FFMPEG, "-y", "-loglevel", "error",
                "-i", tmp_path,
                "-codec:a", "libmp3lame", "-qscale:a", "5",
                str(path),
            ],
            check=True,
        )
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Qwen3-TTS 批量从 manifest 合成")
    parser.add_argument("--manifest", default=str(MANIFEST_PATH))
    parser.add_argument("--audio-root", default=str(AUDIO_ROOT))
    parser.add_argument("--model-size", default="1.7B", choices=["0.6B", "1.7B"])
    parser.add_argument("--shard", default="0/1",
                        help="N/M 分片：当前是第 N 片，总共 M 片（0-indexed）")
    parser.add_argument("--limit", type=int, default=0, help="只跑前 N 条（smoke test）")
    parser.add_argument("--max-items", type=int, default=0,
                        help="本次进程最多跑 N 条后退出（供外层循环防止 MPS 泄漏）")
    parser.add_argument("--subject", default="", help="只跑指定学科")
    parser.add_argument("--field", default="", help="只跑指定字段（question/option/...）")
    parser.add_argument("--batch-size", type=int, default=1,
                        help="一次推理多少条，>1 时走批量模式（显著提速）")
    parser.add_argument("--dry-run", action="store_true", help="不真的合成，只统计")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    items = manifest["items"]

    # 过滤
    if args.subject:
        items = [it for it in items if it["subject"] == args.subject]
    if args.field:
        items = [it for it in items if it["field"] == args.field]

    # 分片
    shard_n, shard_m = (int(x) for x in args.shard.split("/"))
    items = [it for i, it in enumerate(items) if i % shard_m == shard_n]

    audio_root = Path(args.audio_root)

    # 跳过已存在
    pending = [it for it in items if not (audio_root / it["audio_rel"]).exists()]
    skipped = len(items) - len(pending)

    if args.limit:
        pending = pending[: args.limit]
    if args.max_items:
        pending = pending[: args.max_items]

    print(f"📊 manifest 总数: {len(manifest['items'])}")
    print(f"   本次范围:   {len(items)}（shard={args.shard}）")
    print(f"   已存在跳过: {skipped}")
    print(f"   待生成:     {len(pending)}")
    if args.dry_run or not pending:
        return

    device, dtype, attn_impl = get_device()

    print(f"🔄 加载模型 Qwen/Qwen3-TTS-12Hz-{args.model_size}-CustomVoice ...")
    from qwen_tts import Qwen3TTSModel

    model = Qwen3TTSModel.from_pretrained(
        f"Qwen/Qwen3-TTS-12Hz-{args.model_size}-CustomVoice",
        device_map=device,
        dtype=dtype,
        attn_implementation=attn_impl,
    )
    print("✅ 模型加载完成\n")

    total = len(pending)
    t0 = time.time()
    fail = 0
    has_mps = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()

    def cleanup():
        gc.collect()
        if has_mps:
            try:
                torch.mps.empty_cache()
            except Exception:
                pass

    def run_one(item):
        """单条推理（用于 batch 失败回退）"""
        with torch.inference_mode():
            wavs, sr = model.generate_custom_voice(
                text=item["text"],
                language=item["language"],
                speaker=item["speaker"],
                instruct=item["instruction"],
            )
        write_mp3(audio_root / item["audio_rel"], wavs[0], sr)
        del wavs

    def run_batch(batch):
        """批量推理一组 items"""
        with torch.inference_mode():
            wavs, sr = model.generate_custom_voice(
                text=[it["text"] for it in batch],
                language=[it["language"] for it in batch],
                speaker=[it["speaker"] for it in batch],
                instruct=[it["instruction"] for it in batch],
            )
        for it, wav in zip(batch, wavs):
            write_mp3(audio_root / it["audio_rel"], wav, sr)
        del wavs

    bs = max(1, args.batch_size)
    idx = 0
    i = 0
    while i < total:
        batch = pending[i : i + bs]
        i += len(batch)
        try:
            if len(batch) == 1:
                run_one(batch[0])
            else:
                run_batch(batch)
            idx += len(batch)
        except KeyboardInterrupt:
            print("\n🛑 中断 — 已生成的文件保留，下次重跑会续传")
            raise
        except Exception as e:
            print(f"  ⚠️  batch of {len(batch)} failed: {e} — 回退逐条重试")
            cleanup()
            for it in batch:
                try:
                    run_one(it)
                    idx += 1
                except KeyboardInterrupt:
                    raise
                except Exception as e2:
                    fail += 1
                    print(f"    ⚠️  {it['hash'][:8]} 失败: {e2}")
                cleanup()

        cleanup()

        elapsed = time.time() - t0
        rate = idx / elapsed if elapsed else 0
        eta = (total - idx) / rate if rate else 0
        last = batch[-1]
        print(
            f"  [{idx:>5}/{total}] bs={len(batch)} {rate:5.2f} item/s   "
            f"ETA {eta/60:6.1f} min   fail={fail}   {last['subject']:7s} {last['field']:11s}",
            flush=True,
        )

    print(f"\n🎉 完成。生成 {total - fail} 条，失败 {fail} 条，"
          f"总耗时 {(time.time()-t0)/60:.1f} min")
    print(f"📁 输出: {audio_root}")


if __name__ == "__main__":
    main()
