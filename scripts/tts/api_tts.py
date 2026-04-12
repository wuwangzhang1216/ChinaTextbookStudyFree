#!/usr/bin/env python3
"""
api_tts.py — 通过阿里云 DashScope Qwen3-TTS API 批量合成。

- 并发请求（ThreadPoolExecutor，默认 20 worker）
- 断点续传（已存在 mp3 自动跳过）
- 自动把本地 custom voice speaker 名映射成 API 支持的 voice
- 下载返回的 wav URL 转成 mp3 写到 frontend/public/audio/<hash前2>/<hash>.opus

依赖:
  pip install dashscope python-dotenv requests soundfile
"""
from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
import soundfile as sf
from dotenv import load_dotenv

load_dotenv()
import dashscope  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"
AUDIO_ROOT = ROOT / "frontend" / "public" / "audio"

# 本地 CustomVoice speaker → DashScope qwen3-tts-flash 官方音色
# 全部映射为适合小学生的女声（Cherry/Serena/Maia 都原生支持中英混合）。
# 保留原 manifest 的 (学科, 年级) 多样性。
SPEAKER_MAP = {
    # 中文条目用的
    "vivian":   "Cherry",   # 芊悦 - 阳光积极，低中年级主力
    "serena":   "Serena",   # 苏瑶 - 温柔，高年级
    "uncle_fu": "Maia",     # 四月 - 知性温柔，科学讲解
    # 英文条目用的（Cherry/Serena 原生支持英文，中英混合也 OK）
    "sohee":    "Cherry",   # 原低年级英语女声
    "ryan":     "Cherry",   # 原中年级英语男声
    "dylan":    "Serena",   # 原高年级英语男声
}

# 归一化 instruction 里的语速描述。manifest 里为低年级写了 "语速很慢"，
# 实际听起来非常怪，统一改成 "语速自然"，保留其他风格描述。
SPEED_REPLACEMENTS = [
    ("语速很慢", "语速自然"),
    ("语速稍慢", "语速自然"),
    ("语速适中", "语速自然"),
    ("语速正常", "语速自然"),
    # 额外去掉低年级数学里会拖慢节奏的描述
    ("，数字一个一个念清楚，遇到加减乘除稍微停顿一下，让小朋友能跟上", "，数字和运算符吐字清晰"),
    # 英文
    ("Read slowly and clearly", "Read clearly at a natural pace"),
    ("Read slowly", "Read at a natural pace"),
    ("at a moderate pace", "at a natural pace"),
    ("Pronounce every syllable carefully.", "Pronounce clearly and naturally."),
]


def normalize_instruction(ins: str | None) -> str | None:
    if not ins:
        return ins
    for old, new in SPEED_REPLACEMENTS:
        ins = ins.replace(old, new)
    return ins

# language mapping
LANG_MAP = {
    "Chinese": "Chinese",
    "English": "English",
    "Auto":    "Auto",
}

_FFMPEG = shutil.which("ffmpeg")
_SF_MP3_OK: bool | None = None
_stats_lock = threading.Lock()


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
        sys.exit("❌ 未安装 ffmpeg 且 soundfile 不支持 MP3。")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        sf.write(tmp_path, audio, sr, format="WAV")
        subprocess.run(
            [_FFMPEG, "-y", "-loglevel", "error",
             "-i", tmp_path,
             "-codec:a", "libmp3lame", "-qscale:a", "5",
             str(path)],
            check=True,
        )
    finally:
        os.unlink(tmp_path)


def synth_one(item, audio_root: Path, model: str, api_key: str,
              max_retries: int = 6) -> tuple[bool, str]:
    """合成一条；返回 (成功与否, 错误信息)"""
    out_path = audio_root / item["audio_rel"]
    if out_path.exists():
        return True, "skip"

    voice = SPEAKER_MAP.get(item["speaker"])
    if voice is None:
        return False, f"unmapped speaker: {item['speaker']}"
    lang = LANG_MAP.get(item["language"], "Auto")

    kwargs = dict(
        model=model,
        api_key=api_key,
        text=item["text"],
        voice=voice,
        language_type=lang,
    )
    ins = normalize_instruction(item.get("instruction"))
    if ins:
        kwargs["instructions"] = ins

    last_err = ""
    for attempt in range(max_retries):
        try:
            resp = dashscope.MultiModalConversation.call(**kwargs)
            if resp.status_code != 200:
                last_err = f"{resp.status_code} {resp.message}"
                if resp.status_code in (429, 500, 502, 503, 504):
                    # 指数退避 + 抖动
                    time.sleep(min(30, 2 ** attempt) + (attempt * 0.3))
                    continue
                return False, last_err

            url = resp.output["audio"]["url"]
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            audio_arr, sr = sf.read(io.BytesIO(r.content))
            write_mp3(out_path, audio_arr, sr)
            return True, ""
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(1 + attempt)
    return False, last_err


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", default=str(MANIFEST_PATH))
    p.add_argument("--audio-root", default=str(AUDIO_ROOT))
    p.add_argument("--model", default="qwen3-tts-flash")
    p.add_argument("--workers", type=int, default=20)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--shard", default="0/1")
    p.add_argument("--subject", default="")
    p.add_argument("--field", default="")
    p.add_argument("--endpoint", default="intl",
                   choices=["intl", "beijing"],
                   help="intl = 新加坡国际版，beijing = 北京")
    p.add_argument("--language", default="all",
                   help="只跑指定语言（默认 all，传 Chinese/English 过滤）")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        sys.exit("❌ 未设置 DASHSCOPE_API_KEY")

    if args.endpoint == "intl":
        dashscope.base_http_api_url = "https://dashscope-intl.aliyuncs.com/api/v1"
    else:
        dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    items = manifest["items"]

    if args.language and args.language != "all":
        items = [it for it in items if it["language"] == args.language]
    if args.subject:
        items = [it for it in items if it["subject"] == args.subject]
    if args.field:
        items = [it for it in items if it["field"] == args.field]

    n, m = (int(x) for x in args.shard.split("/"))
    items = [it for i, it in enumerate(items) if i % m == n]

    audio_root = Path(args.audio_root)
    pending = [it for it in items if not (audio_root / it["audio_rel"]).exists()]
    skipped = len(items) - len(pending)
    if args.limit:
        pending = pending[: args.limit]

    print(f"📊 总量: {len(manifest['items'])}  本次范围: {len(items)}  已跳过: {skipped}  待生成: {len(pending)}")
    print(f"🌐 endpoint: {dashscope.base_http_api_url}")
    print(f"🎤 model: {args.model}   workers: {args.workers}")
    if args.dry_run or not pending:
        return

    total = len(pending)
    done = 0
    fail = 0
    t0 = time.time()

    def worker(item):
        return item, synth_one(item, audio_root, args.model, api_key)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(worker, it) for it in pending]
        for fut in as_completed(futs):
            try:
                item, (ok, err) = fut.result()
            except Exception as e:
                ok, err = False, str(e)
                item = {"hash": "????????", "subject": "?", "field": "?"}
            with _stats_lock:
                nonlocal_done[0] += 1
                if not ok:
                    nonlocal_fail[0] += 1
                    print(f"  ⚠️  {item['hash'][:8]} 失败: {err}", flush=True)
                cur = nonlocal_done[0]
                cur_fail = nonlocal_fail[0]
                if cur % 50 == 0 or cur == total:
                    elapsed = time.time() - t0
                    rate = cur / elapsed if elapsed else 0
                    eta = (total - cur) / rate if rate else 0
                    print(
                        f"  [{cur:>5}/{total}] {rate:5.1f} it/s   "
                        f"ETA {eta/60:6.1f} min   fail={cur_fail}",
                        flush=True,
                    )

    print(f"\n🎉 完成。成功 {total - fail_final[0]} 失败 {fail_final[0]}，"
          f"用时 {(time.time()-t0)/60:.1f} min")


# 简单共享计数（放外面以便 closure）
nonlocal_done = [0]
nonlocal_fail = [0]
fail_final = nonlocal_fail  # alias

if __name__ == "__main__":
    main()
