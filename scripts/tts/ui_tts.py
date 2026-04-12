#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ui_tts.py — 为前端 UI 激励语 / 动作语音生成 TTS mp3。

这些短句不在题库里，collect_texts.py 扫不到，所以单独维护一份硬编码列表。
使用 DashScope Qwen3-TTS API，输出到 frontend/public/audio/ 下，
路径规则和 collect_texts.py / build-data.ts 完全一致（sha1 内容寻址）。

用法:
  python scripts/tts/ui_tts.py              # 生成全部
  python scripts/tts/ui_tts.py --dry-run    # 只打印，不合成
  python scripts/tts/ui_tts.py --limit 3    # 只跑 3 条（冒烟测试）

依赖:
  pip install dashscope python-dotenv requests soundfile
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
import soundfile as sf
from dotenv import load_dotenv

load_dotenv()

# Windows GBK stdout 兼容：统一 UTF-8 输出
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

import dashscope  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
AUDIO_ROOT = ROOT / "frontend" / "public" / "audio"

# ============================================================
# 语音角色配置
# ============================================================
# 所有 UI 短句都用 Cherry（芊悦）——阳光积极的年轻女声，
# 最适合给小学生的短促激励语句。
#
# 按情绪分 4 组 instruction，让同一个 voice 听起来不单调：
#   praise   — 答对，兴奋夸奖
#   comfort  — 答错，温柔鼓励
#   hype     — 连击/里程碑，热血激昂
#   neutral  — 按钮文案 / 通用提示，平静清晰
# ============================================================

VOICE_PROFILES = {
    "praise": {
        "voice": "Cherry",
        "language": "Chinese",
        "instruction": (
            "用非常开心、兴奋的语气说，像一个热情的小学老师在夸奖学生，"
            "声音明亮上扬，带着真诚的欣喜和骄傲，语速稍快。"
        ),
    },
    "comfort": {
        "voice": "Cherry",
        "language": "Chinese",
        "instruction": (
            "用温柔、安慰、鼓励的语气说，像一个关心学生的老师在安慰小朋友，"
            "声音柔和下沉，充满耐心和信任，语速自然偏慢。"
        ),
    },
    "hype": {
        "voice": "Cherry",
        "language": "Chinese",
        "instruction": (
            "用超级激动、热血沸腾的语气说，像游戏主播在解说精彩操作，"
            "声音洪亮有力，节奏紧凑，充满能量和震撼感！"
        ),
    },
    "neutral": {
        "voice": "Cherry",
        "language": "Chinese",
        "instruction": (
            "用清晰自然、亲切的语气说，像小学老师在课堂上给出简短指示，"
            "吐字清楚，不急不慢。"
        ),
    },
}

# ============================================================
# UI 短句列表
# ============================================================
# (text, profile_key, category)
# category 仅用于日志分组，不影响生成逻辑。

UI_PHRASES: list[tuple[str, str, str]] = [
    # ---------- FeedbackPanel: 答对 ----------
    ("太棒了！",     "praise",  "feedback_praise"),
    ("完美！",       "praise",  "feedback_praise"),
    ("做得好！",     "praise",  "feedback_praise"),
    ("天才！",       "praise",  "feedback_praise"),
    ("继续保持！",   "praise",  "feedback_praise"),
    ("漂亮！",       "praise",  "feedback_praise"),

    # ---------- FeedbackPanel: 答错 ----------
    ("再想想",       "comfort", "feedback_comfort"),
    ("差一点",       "comfort", "feedback_comfort"),
    ("加油",         "comfort", "feedback_comfort"),
    ("没关系",       "comfort", "feedback_comfort"),
    ("下次就对！",   "comfort", "feedback_comfort"),

    # ---------- LessonRunner 吉祥物气泡: 答对 ----------
    ("太棒!",        "praise",  "bubble_praise"),
    ("完美!",        "praise",  "bubble_praise"),
    ("漂亮!",        "praise",  "bubble_praise"),
    ("好厉害!",      "praise",  "bubble_praise"),
    ("继续!",        "praise",  "bubble_praise"),

    # ---------- LessonRunner 吉祥物气泡: 答错 ----------
    ("别灰心!",      "comfort", "bubble_comfort"),
    ("再来一次!",    "comfort", "bubble_comfort"),
    ("没关系!",      "comfort", "bubble_comfort"),
    ("加油!",        "comfort", "bubble_comfort"),

    # ---------- LessonRunner 吉祥物气泡: 连击 ----------
    ("连击!",        "hype",    "bubble_combo"),
    ("火力全开!",    "hype",    "bubble_combo"),
    ("势不可挡!",    "hype",    "bubble_combo"),

    # ---------- ComboOverlay: 连击里程碑 ----------
    ("连击 三连!",     "hype",    "combo_overlay"),
    ("连击 五连!",     "hype",    "combo_overlay"),
    ("连击 十连!",     "hype",    "combo_overlay"),

    # ---------- IntroCard 气泡 ----------
    ("一起学！",     "praise",  "intro_bubble"),
    ("超级重要!",    "hype",    "intro_bubble"),
    ("别踩坑哦!",    "comfort", "intro_bubble"),
    ("你最棒!",      "praise",  "intro_bubble"),

    # ---------- CompletionScreen ----------
    ("完成!",        "praise",  "completion"),
    ("零失误",       "hype",    "completion"),

    # ---------- 按钮 / 通用动作 ----------
    ("继续",         "neutral", "button"),
    ("检查",         "neutral", "button"),
    ("继续学习",     "neutral", "button"),
    ("听全文",       "neutral", "button"),
    ("跟读",         "neutral", "button"),
    ("开始练习",     "neutral", "button"),
]


# ============================================================
# 工具函数（与 collect_texts.py / build-data.ts 完全一致）
# ============================================================

def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def text_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def audio_rel(text: str) -> str:
    h = text_hash(text)
    return f"{h[:2]}/{h}.opus"


# ============================================================
# MP3 写入（复用 api_tts.py 的逻辑）
# ============================================================

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


# ============================================================
# DashScope 合成单条
# ============================================================

def synth_one(
    text: str,
    profile: dict,
    out_path: Path,
    model: str,
    api_key: str,
    max_retries: int = 6,
) -> tuple[bool, str]:
    """合成一条；返回 (成功与否, 错误信息)"""
    if out_path.exists():
        return True, "skip"

    kwargs = dict(
        model=model,
        api_key=api_key,
        text=text,
        voice=profile["voice"],
        language_type=profile["language"],
    )
    if profile.get("instruction"):
        kwargs["instructions"] = profile["instruction"]

    last_err = ""
    for attempt in range(max_retries):
        try:
            resp = dashscope.MultiModalConversation.call(**kwargs)
            if resp.status_code != 200:
                last_err = f"{resp.status_code} {resp.message}"
                if resp.status_code in (429, 500, 502, 503, 504):
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


# ============================================================
# 构建条目列表
# ============================================================

def build_items() -> list[dict]:
    """去重、生成 hash、匹配 profile，返回待合成列表。"""
    seen: set[str] = set()
    items: list[dict] = []

    for text, profile_key, category in UI_PHRASES:
        norm = normalize(text)
        h = text_hash(norm)
        if h in seen:
            continue
        seen.add(h)

        profile = VOICE_PROFILES[profile_key]
        items.append({
            "hash": h,
            "text": norm,
            "audio_rel": audio_rel(norm),
            "profile_key": profile_key,
            "category": category,
            **profile,
        })

    return items


# ============================================================
# 主流程
# ============================================================

def main():
    import argparse
    p = argparse.ArgumentParser(description="UI 激励语 TTS 生成")
    p.add_argument("--model", default="qwen3-tts-flash")
    p.add_argument("--workers", type=int, default=8,
                   help="并发数（UI 短句量少，8 就够了）")
    p.add_argument("--limit", type=int, default=0, help="只跑前 N 条")
    p.add_argument("--endpoint", default="intl", choices=["intl", "beijing"])
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        sys.exit("❌ 未设置 DASHSCOPE_API_KEY")

    if args.endpoint == "intl":
        dashscope.base_http_api_url = "https://dashscope-intl.aliyuncs.com/api/v1"
    else:
        dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

    items = build_items()
    pending = [it for it in items if not (AUDIO_ROOT / it["audio_rel"]).exists()]
    skipped = len(items) - len(pending)

    if args.limit:
        pending = pending[:args.limit]

    # 打印概览
    print(f"🎯 UI 短句 TTS")
    print(f"   总条目: {len(items)}（去重后）")
    print(f"   已存在: {skipped}")
    print(f"   待生成: {len(pending)}")
    print(f"   🌐 endpoint: {dashscope.base_http_api_url}")
    print(f"   🎤 model: {args.model}   workers: {args.workers}")
    print()

    # 按 category 分组打印
    from collections import Counter
    cat_counts = Counter(it["category"] for it in items)
    for cat, n in sorted(cat_counts.items()):
        print(f"   {cat:20s} {n:>3} 条")
    print()

    # 按 profile 打印语音配置
    for pk, pf in VOICE_PROFILES.items():
        count = sum(1 for it in items if it["profile_key"] == pk)
        if count:
            print(f"   🔊 {pk:10s} ({count:>2} 条) voice={pf['voice']}  "
                  f"instruction={pf['instruction'][:30]}...")
    print()

    if args.dry_run:
        print("--- dry-run: 详细条目 ---")
        for it in items:
            exists = "✓" if (AUDIO_ROOT / it["audio_rel"]).exists() else "✗"
            print(f"  [{exists}] {it['hash'][:8]}  {it['profile_key']:8s}  "
                  f"{it['category']:20s}  {it['text']}")
        return

    if not pending:
        print("✅ 全部已存在，无需生成！")
        return

    total = len(pending)
    done = 0
    fail = 0
    t0 = time.time()

    def worker(item):
        profile = {
            "voice": item["voice"],
            "language": item["language"],
            "instruction": item["instruction"],
        }
        out_path = AUDIO_ROOT / item["audio_rel"]
        return item, synth_one(item["text"], profile, out_path, args.model, api_key)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(worker, it) for it in pending]
        for fut in as_completed(futs):
            item, (ok, err) = fut.result()
            done += 1
            if not ok:
                fail += 1
                print(f"  ⚠️  {item['hash'][:8]} 失败: {err}  text={item['text']}")
            else:
                elapsed = time.time() - t0
                print(f"  ✓ [{done:>3}/{total}] {item['text']:10s}  "
                      f"{item['profile_key']}  {elapsed:.1f}s")

    elapsed = time.time() - t0
    print(f"\n🎉 完成！成功 {total - fail} / 失败 {fail}，"
          f"用时 {elapsed:.1f}s")
    print(f"📁 输出: {AUDIO_ROOT}")

    # 写一份 ui_manifest.json 方便前端 build-data 查找
    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total": len(items),
        "items": [
            {
                "text": it["text"],
                "hash": it["hash"],
                "audio_rel": it["audio_rel"],
                "audio_path": f"/audio/{it['audio_rel']}",
                "profile": it["profile_key"],
                "category": it["category"],
            }
            for it in items
        ],
    }
    manifest_path = Path(__file__).resolve().parent / "ui_manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"📝 清单: {manifest_path}")


if __name__ == "__main__":
    main()
