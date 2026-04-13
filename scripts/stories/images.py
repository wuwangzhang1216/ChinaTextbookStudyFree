"""
story_images.py — 为每篇故事生成儿童插画风格的配图

使用 google/gemini-3.1-flash-image-preview 通过 OpenRouter 生成。

使用方法：
    python story_images.py --subject chinese                     # 语文全量
    python story_images.py --subject chinese --only "g3up"       # 单本
    python story_images.py --subject all                         # 语文+英语
    python story_images.py --dry-run                             # 预览
"""

import argparse
import base64
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# 加载 .env
_env_path = PROJECT_ROOT / ".env"
if _env_path.exists():
    for _line in _env_path.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

# ============================================================
# 配置
# ============================================================
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
if not OPENROUTER_API_KEY:
    print("错误: 请设置环境变量 OPENROUTER_API_KEY")
    sys.exit(1)

API_URL = "https://openrouter.ai/api/v1/chat/completions"
IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
MAX_WORKERS = 16
MAX_RETRIES = 2

STORIES_DIR = PROJECT_ROOT / "data" / "stories"
IMAGES_DIR = PROJECT_ROOT / "frontend" / "public" / "story-images"

EXTRA_HEADERS = {
    "HTTP-Referer": "https://github.com/textbook-quiz",
    "X-OpenRouter-Title": "StoryImageGen",
}

# ============================================================
# 费用统计
# ============================================================
STATS = {"calls": 0, "success": 0, "fail": 0, "total_bytes": 0}
_STATS_LOCK = threading.Lock()


# ============================================================
# Prompt 构建
# ============================================================

GRADE_STYLE = {
    1: "extremely simple shapes, bold outlines, very bright primary colors, like a picture book for toddlers",
    2: "simple shapes, bold outlines, bright cheerful colors, picture book style for young children",
    3: "cute cartoon style, warm bright colors, friendly characters, children's storybook illustration",
    4: "cartoon illustration style, rich colors, expressive characters, children's book art",
    5: "semi-detailed illustration, warm color palette, storytelling atmosphere, middle-grade book art",
    6: "detailed illustration, sophisticated color palette, narrative depth, upper-elementary book art",
}


def build_image_prompt(story: dict, grade: int, subject: str) -> str:
    """构建图片生成 prompt。"""
    title = story.get("title", "")
    sentences = story.get("sentences", [])
    # 取前几句作为场景描述
    scene = " ".join(sentences[:4]) if sentences else title
    style = GRADE_STYLE.get(grade, GRADE_STYLE[3])

    if subject == "english":
        return (
            f"Generate a single children's book illustration for this story:\n"
            f"Title: {title}\n"
            f"Scene: {scene}\n\n"
            f"Style requirements:\n"
            f"- {style}\n"
            f"- Single scene, no panels or comic strips\n"
            f"- No text, no letters, no words, no speech bubbles\n"
            f"- Horizontal landscape orientation\n"
            f"- Warm, inviting atmosphere suitable for primary school children\n"
            f"- Characters should look cute and friendly"
        )
    else:
        return (
            f"为这个儿童故事生成一张配套插画：\n"
            f"标题：{title}\n"
            f"场景：{scene}\n\n"
            f"风格要求：\n"
            f"- {style}\n"
            f"- 单一场景，不要分格漫画\n"
            f"- 不要任何文字、字母、汉字、对话气泡\n"
            f"- 横版构图\n"
            f"- 温暖明亮的氛围，适合小学生\n"
            f"- 角色要可爱、有亲和力"
        )


# ============================================================
# 图片生成
# ============================================================
def generate_image(prompt: str) -> bytes | None:
    """调用 API 生成图片，返回 JPEG bytes 或 None。"""
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    **EXTRA_HEADERS,
                },
                json={
                    "model": IMAGE_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=120,
            )

            if resp.status_code == 429:
                wait = 10 * (attempt + 1)
                print(f"    [限速] 等待 {wait}s 后重试...")
                time.sleep(wait)
                continue

            resp.raise_for_status()
            data = resp.json()

            images = data.get("choices", [{}])[0].get("message", {}).get("images", [])
            if not images:
                print(f"    [警告] 响应无图片 (attempt {attempt+1})")
                if attempt < MAX_RETRIES:
                    time.sleep(3)
                    continue
                return None

            url = images[0].get("image_url", {}).get("url", "")
            if "," not in url:
                return None

            _, b64 = url.split(",", 1)
            return base64.b64decode(b64)

        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(5)
                continue
            print(f"    [错误] {e}")
            return None

    return None


def process_story(
    story: dict, grade: int, subject: str, book_dir: Path
) -> bool:
    """为一篇故事生成配图。返回是否成功。"""
    story_id = story["id"]
    out_path = book_dir / f"{story_id}.jpg"

    if out_path.exists():
        with _STATS_LOCK:
            STATS["success"] += 1
        return True

    prompt = build_image_prompt(story, grade, subject)

    img_bytes = generate_image(prompt)
    if not img_bytes:
        with _STATS_LOCK:
            STATS["calls"] += 1
            STATS["fail"] += 1
        return False

    out_path.write_bytes(img_bytes)
    with _STATS_LOCK:
        STATS["calls"] += 1
        STATS["success"] += 1
        STATS["total_bytes"] += len(img_bytes)
    return True


# ============================================================
# 主流程
# ============================================================
def run_subject(subject: str, only: str | None):
    subject_dir = STORIES_DIR / subject
    if not subject_dir.exists():
        print(f"  [{subject}] 故事目录不存在")
        return

    files = sorted(f for f in subject_dir.glob("*.json"))
    if only:
        files = [f for f in files if only in f.stem]

    if not files:
        print(f"  [{subject}] 未找到匹配的故事文件")
        return

    for story_file in files:
        doc = json.loads(story_file.read_text(encoding="utf-8"))
        book_id = doc.get("bookId", story_file.stem)
        grade = doc.get("grade", 3)
        stories = doc.get("stories", [])

        if not stories:
            continue

        book_dir = IMAGES_DIR / book_id
        book_dir.mkdir(parents=True, exist_ok=True)

        # 检查哪些需要生成
        todo = [s for s in stories if not (book_dir / f"{s['id']}.jpg").exists()]
        cached = len(stories) - len(todo)

        print(f"\n  [{subject}] {book_id}: {len(stories)} 篇故事, {cached} 已有, {len(todo)} 待生成")

        if not todo:
            with _STATS_LOCK:
                STATS["success"] += len(stories)
            continue

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futures = {
                ex.submit(process_story, s, grade, subject, book_dir): s
                for s in todo
            }
            done = 0
            for fut in as_completed(futures):
                s = futures[fut]
                ok = fut.result()
                done += 1
                status = "OK" if ok else "FAIL"
                print(f"    [{done}/{len(todo)}] {s['title']} - {status}")

        # 也计算缓存的
        with _STATS_LOCK:
            STATS["success"] += cached


def main():
    parser = argparse.ArgumentParser(description="为故事生成儿童插画配图")
    parser.add_argument(
        "--subject", type=str, default="chinese",
        choices=["chinese", "english", "all"],
    )
    parser.add_argument("--only", type=str, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    target = ["chinese", "english"] if args.subject == "all" else [args.subject]

    if args.dry_run:
        for sid in target:
            sdir = STORIES_DIR / sid
            files = sorted(sdir.glob("*.json")) if sdir.exists() else []
            if args.only:
                files = [f for f in files if args.only in f.stem]
            total = 0
            for f in files:
                d = json.loads(f.read_text(encoding="utf-8"))
                n = len(d.get("stories", []))
                total += n
                print(f"  [{sid}] {f.stem}: {n} 篇")
            print(f"  [{sid}] 合计 {total} 张图待生成")
        return

    print("=" * 60)
    print("故事配图生成")
    print(f"模型: {IMAGE_MODEL}")
    print(f"并发: {MAX_WORKERS}")
    print(f"输出: {IMAGES_DIR}")
    print("=" * 60)

    for sid in target:
        run_subject(sid, args.only)

    print(f"\n{'=' * 60}")
    s = STATS
    total_mb = s["total_bytes"] / 1024 / 1024
    print(f"完成: {s['success']} 成功, {s['fail']} 失败, {s['calls']} API 调用, {total_mb:.1f} MB")
    print("=" * 60)


if __name__ == "__main__":
    main()
