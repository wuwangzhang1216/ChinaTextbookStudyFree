"""
story_pipeline.py — LLM 生成分级故事 + 阅读理解题 Pipeline

根据已有的教材大纲（output/{subject}/outlines/），为每个单元生成 2-3 篇
与单元主题和词汇匹配的分级短故事，配套阅读理解题。

使用方法：
    export OPENROUTER_API_KEY="sk-or-..."

    python story_pipeline.py --subject chinese                     # 语文全量
    python story_pipeline.py --subject english --only "三年级上册" # 英语单测
    python story_pipeline.py --subject all                         # 语文+英语
    python story_pipeline.py --subject chinese --verify            # 只验证不生成
    python story_pipeline.py --dry-run                             # 预览
"""

import os
import sys
import json
import re
import time
import threading
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI

# 项目根目录 & 模块搜索路径
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))          # scripts/stories/
sys.path.insert(0, str(PROJECT_ROOT / "scripts" / "quiz"))        # scripts/quiz/

# 加载 .env
_env_path = PROJECT_ROOT / ".env"
if _env_path.exists():
    for _line in _env_path.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

from prompts import build_knowledge_points_detail  # from scripts/quiz/
from prompts_story import (                         # from scripts/stories/
    STORY_PROMPT_CHINESE,
    STORY_PROMPT_ENGLISH,
    STORY_SCHEMA,
    GRADE_CONSTRAINTS_CHINESE,
    GRADE_CONSTRAINTS_ENGLISH,
)
from subjects import SUBJECTS, get_grade_semester   # from scripts/quiz/

# ============================================================
# 配置
# ============================================================
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
if not OPENROUTER_API_KEY:
    print("错误: 请设置环境变量 OPENROUTER_API_KEY")
    sys.exit(1)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

GENERATE_MODEL = "google/gemini-3-flash-preview"
MAX_WORKERS = 4
DEFAULT_STORIES_PER_UNIT = 2

EXTRA_HEADERS = {
    "HTTP-Referer": "https://github.com/textbook-quiz",
    "X-OpenRouter-Title": "StoryPipeline",
}

OUTPUT_DIR = PROJECT_ROOT / "output"
STORY_DIR = PROJECT_ROOT / "data" / "stories"

# ============================================================
# 费用统计
# ============================================================
COST_STATS = {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0}
_COST_LOCK = threading.Lock()


def record_usage(completion) -> None:
    usage = getattr(completion, "usage", None)
    if usage is None:
        return
    cost = getattr(usage, "cost", None)
    if cost is None and hasattr(usage, "model_dump"):
        cost = usage.model_dump().get("cost")
    pin = getattr(usage, "prompt_tokens", 0) or 0
    pout = getattr(usage, "completion_tokens", 0) or 0
    with _COST_LOCK:
        COST_STATS["calls"] += 1
        COST_STATS["prompt_tokens"] += pin
        COST_STATS["completion_tokens"] += pout
        if cost is not None:
            COST_STATS["cost"] += float(cost)


# ============================================================
# 年级提取
# ============================================================
GRADE_MAP = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6}


def extract_grade(stem: str) -> int:
    """从文件名提取年级数字。匹配 'X年级上/下册' 模式，避免被 '三年级起点' 误导。"""
    import re
    m = re.search(r"([一二三四五六])年级[上下]册", stem)
    if m:
        return GRADE_MAP[m.group(1)]
    # fallback: 从后往前找最后一个 "X年级"
    for ch in ["六", "五", "四", "三", "二", "一"]:
        idx = stem.rfind(f"{ch}年级")
        if idx >= 0:
            return GRADE_MAP[ch]
    return 3


def extract_semester(stem: str) -> str:
    if "下册" in stem:
        return "down"
    return "up"


def make_book_id(subject: str, grade: int, semester: str) -> str:
    """生成 bookId，如 chinese-g3up。"""
    sem = "up" if semester == "up" else "down"
    return f"{subject}-g{grade}{sem}"


# ============================================================
# 故事生成
# ============================================================
def generate_stories_for_unit(
    subject: str,
    textbook_name: str,
    unit: dict,
    grade: int,
    story_count: int,
) -> dict:
    """调用 LLM 为一个单元生成故事。"""
    kp_detail = build_knowledge_points_detail(unit)

    if subject == "chinese":
        constraints = GRADE_CONSTRAINTS_CHINESE[grade]
        prompt = STORY_PROMPT_CHINESE.format(
            textbook=textbook_name,
            unit_number=unit["unit_number"],
            unit_title=unit["title"],
            story_count=story_count,
            knowledge_points_detail=kp_detail,
            grade_label=constraints["label"],
            min_sentences=constraints["min_sentences"],
            max_sentences=constraints["max_sentences"],
            max_chars=constraints["max_chars_per_sentence"],
            min_vocab=constraints["min_vocab"],
        )
    else:  # english
        constraints = GRADE_CONSTRAINTS_ENGLISH[grade]
        prompt = STORY_PROMPT_ENGLISH.format(
            textbook=textbook_name,
            unit_number=unit["unit_number"],
            unit_title=unit["title"],
            story_count=story_count,
            knowledge_points_detail=kp_detail,
            grade_label=constraints["label"],
            min_sentences=constraints["min_sentences"],
            max_sentences=constraints["max_sentences"],
            max_words=constraints["max_words_per_sentence"],
            min_vocab=constraints["min_vocab"],
        )

    completion = client.chat.completions.create(
        model=GENERATE_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=8000,
        response_format={"type": "json_schema", "json_schema": STORY_SCHEMA},
        extra_headers=EXTRA_HEADERS,
        extra_body={"usage": {"include": True}},
    )
    record_usage(completion)

    content = completion.choices[0].message.content.strip()
    return json.loads(content)


# ============================================================
# 验证
# ============================================================
def validate_stories(data: dict, subject: str, grade: int) -> list[str]:
    """验证生成的故事数据。返回问题列表。"""
    issues = []
    stories = data.get("stories", [])

    if not stories:
        issues.append("没有生成任何故事")
        return issues

    if subject == "chinese":
        constraints = GRADE_CONSTRAINTS_CHINESE.get(grade, {})
        tf_answers = ("对", "错")
    else:
        constraints = GRADE_CONSTRAINTS_ENGLISH.get(grade, {})
        tf_answers = ("True", "False")

    min_s = constraints.get("min_sentences", 3)
    max_s = constraints.get("max_sentences", 20)

    for i, story in enumerate(stories):
        prefix = f"故事{i+1}「{story.get('title', '?')}」"

        # 句数检查
        slen = len(story.get("sentences", []))
        if slen < min_s or slen > max_s:
            issues.append(f"{prefix} 句数 {slen}，期望 {min_s}~{max_s}")

        # 题目检查
        questions = story.get("questions", [])
        if len(questions) < 3:
            issues.append(f"{prefix} 题目只有 {len(questions)} 道，至少需要 3 道")

        types_seen = set()
        for q in questions:
            qtype = q.get("type", "")
            types_seen.add(qtype)
            ans = q.get("answer", "")
            opts = q.get("options", [])

            if qtype == "true_false":
                if ans not in tf_answers:
                    issues.append(f"{prefix} 题{q.get('id')} true_false answer 应为 {tf_answers}，实际 '{ans}'")
                if opts:
                    issues.append(f"{prefix} 题{q.get('id')} true_false 不应有 options")

            elif qtype == "choice":
                if len(opts) != 4:
                    issues.append(f"{prefix} 题{q.get('id')} choice 应有 4 选项，实际 {len(opts)}")
                if ans and ans not in opts:
                    issues.append(f"{prefix} 题{q.get('id')} choice answer 不在 options 中")

            elif qtype == "fill_blank_text":
                if not ans.strip():
                    issues.append(f"{prefix} 题{q.get('id')} fill_blank_text answer 为空")
                if opts:
                    issues.append(f"{prefix} 题{q.get('id')} fill_blank_text 不应有 options")

            if not q.get("explanation", "").strip():
                issues.append(f"{prefix} 题{q.get('id')} 解析为空")

        # 确保三种题型都有
        for required in ["true_false", "choice", "fill_blank_text"]:
            if required not in types_seen:
                issues.append(f"{prefix} 缺少题型 {required}")

    return issues


# ============================================================
# 处理单本教材
# ============================================================
def process_textbook(
    stem: str,
    subject: str,
    story_count: int,
):
    """为一本教材的所有单元生成故事。"""
    outline_dir = OUTPUT_DIR / subject / "outlines"
    outline_path = outline_dir / f"{stem}.json"

    if not outline_path.exists():
        print(f"  [跳过] 大纲不存在: {outline_path}")
        return

    outline = json.loads(outline_path.read_text(encoding="utf-8"))
    units = outline.get("units", [])
    if not units:
        print(f"  [跳过] 大纲无单元信息")
        return

    grade = extract_grade(stem)
    semester = extract_semester(stem)
    book_id = make_book_id(subject, grade, semester)
    textbook_name = outline.get("textbook", get_grade_semester(stem))

    # 缓存目录
    cache_dir = STORY_DIR / subject / ".cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    # 输出路径
    out_dir = STORY_DIR / subject
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{book_id}.json"

    print(f"\n  [{subject}] {textbook_name} (grade={grade}, bookId={book_id})")
    print(f"    单元数: {len(units)}, 每单元 {story_count} 篇故事")

    all_stories = []
    story_idx = 0

    def _do_unit(unit):
        nonlocal story_idx
        unit_num = unit["unit_number"]
        cache_file = cache_dir / f"{book_id}_unit{unit_num}.json"

        if cache_file.exists():
            print(f"    [缓存] 第{unit_num}单元「{unit['title']}」")
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            return unit_num, cached, []

        print(f"    [生成] 第{unit_num}单元「{unit['title']}」...")
        result = generate_stories_for_unit(
            subject=subject,
            textbook_name=textbook_name,
            unit=unit,
            grade=grade,
            story_count=story_count,
        )

        issues = validate_stories(result, subject, grade)

        # 写缓存
        cache_file.write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        return unit_num, result, issues

    # 并行生成
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(_do_unit, u): u for u in units}
        results_by_unit = {}
        for fut in as_completed(futures):
            unit_num, result, issues = fut.result()
            results_by_unit[unit_num] = (result, issues)
            tag = f" [警告:{len(issues)}项]" if issues else ""
            print(f"    [完成] 第{unit_num}单元{tag}")

    # 按单元顺序组装
    for unit in units:
        unit_num = unit["unit_number"]
        if unit_num not in results_by_unit:
            continue
        result, issues = results_by_unit[unit_num]
        for si, story in enumerate(result.get("stories", [])):
            story_idx += 1
            story_record = {
                "id": f"{book_id}-s{story_idx}",
                "unitNumber": unit_num,
                "unitTitle": unit["title"],
                "storyIndex": si + 1,
                "title": story["title"],
                "language": "Chinese" if subject == "chinese" else "English",
                "sentences": story["sentences"],
                "vocabulary_used": story.get("vocabulary_used", []),
                "questions": story["questions"],
            }
            if issues:
                story_record["_validation_issues"] = issues
            all_stories.append(story_record)

    # 写最终输出
    subject_cfg = SUBJECTS[subject]
    output_data = {
        "bookId": book_id,
        "subject": subject,
        "textbook": subject_cfg["display_name"] + textbook_name,
        "grade": grade,
        "stories": all_stories,
    }

    out_path.write_text(
        json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"    [输出] {out_path} ({len(all_stories)} 篇故事)")


# ============================================================
# 验证模式
# ============================================================
def verify_all(subject: str):
    """验证已生成的所有故事文件。"""
    story_dir = STORY_DIR / subject
    if not story_dir.exists():
        print(f"  [{subject}] 目录不存在: {story_dir}")
        return

    files = sorted(story_dir.glob("*.json"))
    if not files:
        print(f"  [{subject}] 没有故事文件")
        return

    total_stories = 0
    total_issues = 0
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        grade = data.get("grade", 3)
        issues = validate_stories(data, subject, grade)
        n_stories = len(data.get("stories", []))
        total_stories += n_stories
        total_issues += len(issues)

        status = f"OK {n_stories}篇" if not issues else f"NG {n_stories}篇, {len(issues)}项问题"
        print(f"  {f.name}: {status}")
        for iss in issues:
            print(f"    - {iss}")

    print(f"\n  [{subject}] 合计: {total_stories} 篇故事, {total_issues} 项问题")


# ============================================================
# 主流程
# ============================================================
def run_subject(subject: str, only: str | None, story_count: int):
    subject_cfg = SUBJECTS[subject]
    outline_dir = OUTPUT_DIR / subject / "outlines"

    if not outline_dir.exists():
        print(f"  [{subject}] 大纲目录不存在: {outline_dir}")
        return

    outlines = sorted(outline_dir.glob("*.json"))
    if only:
        outlines = [o for o in outlines if only in o.stem]

    if not outlines:
        print(f"  [{subject}] 未找到匹配的大纲文件")
        return

    print(f"\n{'#' * 60}")
    print(f"# 学科: {subject_cfg['display_name']} ({subject})")
    print(f"# 教材数: {len(outlines)}")
    print(f"{'#' * 60}")

    for outline_path in outlines:
        try:
            process_textbook(outline_path.stem, subject, story_count)
        except Exception as e:
            print(f"  [错误] {outline_path.stem}: {e}")
            import traceback
            traceback.print_exc()


def main():
    parser = argparse.ArgumentParser(description="LLM 生成分级故事 + 阅读理解题")
    parser.add_argument(
        "--subject", type=str, default="chinese",
        choices=["chinese", "english", "all"],
        help="语文/英语/全部（默认 chinese）",
    )
    parser.add_argument(
        "--only", type=str, default=None,
        help="只处理包含该关键词的教材，如 '三年级上册'",
    )
    parser.add_argument(
        "--stories-per-unit", type=int, default=DEFAULT_STORIES_PER_UNIT,
        help=f"每单元生成几篇故事（默认 {DEFAULT_STORIES_PER_UNIT}）",
    )
    parser.add_argument(
        "--verify", action="store_true",
        help="只验证已有数据，不生成",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="只显示会处理哪些教材",
    )
    args = parser.parse_args()

    target_subjects = ["chinese", "english"] if args.subject == "all" else [args.subject]

    if args.verify:
        print("=" * 60)
        print("验证模式：检查已生成的故事文件")
        print("=" * 60)
        for sid in target_subjects:
            verify_all(sid)
        return

    if args.dry_run:
        for sid in target_subjects:
            outline_dir = OUTPUT_DIR / sid / "outlines"
            outlines = sorted(outline_dir.glob("*.json")) if outline_dir.exists() else []
            if args.only:
                outlines = [o for o in outlines if args.only in o.stem]
            print(f"\n[{sid}] {SUBJECTS[sid]['display_name']} - {len(outlines)} 本教材:")
            for o in outlines:
                data = json.loads(o.read_text(encoding="utf-8"))
                n_units = len(data.get("units", []))
                print(f"  {o.stem} ({n_units} 单元 × {args.stories_per_unit} 篇 = {n_units * args.stories_per_unit} 篇)")
        print("\n(dry-run 模式，未实际执行)")
        return

    print("=" * 60)
    print("LLM 故事生成 Pipeline")
    print(f"模型: {GENERATE_MODEL}")
    print(f"每单元故事数: {args.stories_per_unit}")
    print(f"目标学科: {args.subject}")
    print("=" * 60)

    for sid in target_subjects:
        run_subject(sid, args.only, args.stories_per_unit)

    # 汇总
    print(f"\n{'=' * 60}")
    print("Pipeline 完成！")
    for sid in target_subjects:
        story_dir = STORY_DIR / sid
        files = list(story_dir.glob("*.json")) if story_dir.exists() else []
        total = sum(
            len(json.loads(f.read_text(encoding="utf-8")).get("stories", []))
            for f in files
        )
        print(f"  [{sid}] {len(files)} 本 / {total} 篇故事")
    print(f"{'=' * 60}")

    # 费用
    s = COST_STATS
    print(f"\nAPI 用量: {s['calls']} 调用, {s['prompt_tokens']:,} 输入tokens, {s['completion_tokens']:,} 输出tokens, ${s['cost']:.4f}")


if __name__ == "__main__":
    main()
