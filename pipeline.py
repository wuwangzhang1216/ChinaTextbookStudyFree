"""
pipeline.py - 中国小学多学科教材 → AI题库生成 Pipeline v3

支持学科：math / chinese / english / science

使用方法：
    export OPENROUTER_API_KEY="sk-or-..."
    pip install openai requests pypdf

    python pipeline.py --subject math                       # 数学全量（默认）
    python pipeline.py --subject chinese --only "三年级上册" # 单测
    python pipeline.py --subject english                    # 英语全量（8 册）
    python pipeline.py --subject all                        # 4 学科全跑
    python pipeline.py --list-subjects                      # 列出学科与教材

可选参数：
    --batch-size 5      # PDF 拆分时每批页数（默认 10）
"""

import os
import sys
import json
import base64
import shutil
import time
import threading
import argparse
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI

# 加载 .env 文件中的环境变量
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

import prompts as P
from prompts import (
    PAGE_EXTRACT_PROMPT,
    OUTLINE_PROMPT,
    OUTLINE_SCHEMA,
    build_knowledge_points_detail,
)
from subjects import (
    SUBJECTS,
    SubjectConfig,
    ALL_SUBJECT_IDS,
    get_subject_cfg,
    get_grade_semester,
)


# ============================================================
# 配置
# ============================================================
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
if not OPENROUTER_API_KEY:
    print("错误: 请设置环境变量 OPENROUTER_API_KEY")
    print("  export OPENROUTER_API_KEY='sk-or-...'")
    sys.exit(1)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

EXTRACT_MODEL = "google/gemini-3.1-flash-lite-preview"
GENERATE_MODEL = "google/gemini-3-flash-preview"

MAX_WORKERS = 8  # 并发数

EXTRA_HEADERS = {
    "HTTP-Referer": "https://github.com/textbook-quiz",
    "X-OpenRouter-Title": "TextbookQuizPipeline",
}

GITHUB_RAW_BASE = "https://raw.githubusercontent.com/TapXWorld/ChinaTextbook/master"

OUTPUT_DIR = Path("output")


# ============================================================
# 费用统计
# ============================================================
COST_STATS = {
    "extract": {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0},
    "outline": {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0},
    "quiz":    {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0},
}
_COST_LOCK = threading.Lock()


def record_usage(step: str, completion) -> None:
    usage = getattr(completion, "usage", None)
    if usage is None:
        return
    cost = getattr(usage, "cost", None)
    if cost is None and hasattr(usage, "model_dump"):
        cost = usage.model_dump().get("cost")
    pin = getattr(usage, "prompt_tokens", 0) or 0
    pout = getattr(usage, "completion_tokens", 0) or 0
    with _COST_LOCK:
        s = COST_STATS[step]
        s["calls"] += 1
        s["prompt_tokens"] += pin
        s["completion_tokens"] += pout
        if cost is not None:
            s["cost"] += float(cost)


def print_cost_summary() -> None:
    print(f"\n{'=' * 60}")
    print("API 用量与费用统计")
    print(f"{'=' * 60}")
    print(f"{'步骤':<10}{'调用次数':<10}{'输入tokens':<14}{'输出tokens':<14}{'费用(USD)':<12}")
    total_calls = total_pin = total_pout = total_cost = 0
    for step, label in [("extract", "PDF提取"), ("outline", "大纲生成"), ("quiz", "题目生成")]:
        s = COST_STATS[step]
        print(f"{label:<10}{s['calls']:<10}{s['prompt_tokens']:<14,}{s['completion_tokens']:<14,}${s['cost']:<11.4f}")
        total_calls += s["calls"]
        total_pin += s["prompt_tokens"]
        total_pout += s["completion_tokens"]
        total_cost += s["cost"]
    print("-" * 60)
    print(f"{'合计':<10}{total_calls:<10}{total_pin:<14,}{total_pout:<14,}${total_cost:<11.4f}")
    print(f"{'=' * 60}")


# ============================================================
# 学科目录
# ============================================================
def build_dirs(subject_id: str) -> dict[str, Path]:
    """每个学科有自己的 output/{subject}/{pdfs,markdown,outlines,quizzes,knowledge}/"""
    base = OUTPUT_DIR / subject_id
    return {
        "base": base,
        "pdf": base / "pdfs",
        "markdown": base / "markdown",
        "outline": base / "outlines",
        "quiz": base / "quizzes",
        "knowledge": base / "knowledge",
    }


def setup_dirs(dirs: dict[str, Path]) -> None:
    for key, p in dirs.items():
        if key == "base":
            continue
        p.mkdir(parents=True, exist_ok=True)


def migrate_legacy_math_data_if_needed() -> None:
    """v2 之前数学数据是平层的（output/pdfs 等），迁移到 output/math/。一次性。"""
    legacy_subdirs = ["pdfs", "markdown", "outlines", "quizzes", "knowledge"]
    legacy_paths = [OUTPUT_DIR / d for d in legacy_subdirs]
    existing = [p for p in legacy_paths if p.exists()]
    if not existing:
        return

    print("[迁移] 检测到旧的平层数学数据，移动到 output/math/")
    math_dir = OUTPUT_DIR / "math"
    math_dir.mkdir(exist_ok=True)
    for p in existing:
        target = math_dir / p.name
        if target.exists():
            print(f"  [跳过] {target} 已存在")
            continue
        shutil.move(str(p), str(target))
        print(f"  [移动] {p} → {target}")


# ============================================================
# Step 0: 下载 PDF
# ============================================================
def download_pdf(filename: str, subject_cfg: SubjectConfig, dirs: dict[str, Path]) -> Path:
    out_path = dirs["pdf"] / filename
    if out_path.exists():
        print(f"  [跳过] {filename} 已存在")
        return out_path

    url = f"{GITHUB_RAW_BASE}/{subject_cfg['github_path']}/{requests.utils.quote(filename)}"
    print(f"  [下载] {filename} ...")
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    out_path.write_bytes(resp.content)
    print(f"  [完成] {len(resp.content) / 1024 / 1024:.1f} MB")
    return out_path


# ============================================================
# Step 1: 拆分 PDF 为批次
# ============================================================
def split_pdf_pages(pdf_path: Path, dirs: dict[str, Path], batch_size: int = 10):
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(pdf_path))
    total = len(reader.pages)
    stem = pdf_path.stem
    batch_dir = dirs["pdf"] / f"{stem}_batches"
    batch_dir.mkdir(exist_ok=True)

    batch_paths = []
    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        batch_path = batch_dir / f"{stem}_p{start + 1}-{end}.pdf"

        if batch_path.exists():
            batch_paths.append(batch_path)
            continue

        writer = PdfWriter()
        for i in range(start, end):
            writer.add_page(reader.pages[i])
        with open(batch_path, "wb") as f:
            writer.write(f)

        batch_paths.append(batch_path)

    print(f"  [拆分] {total}页 → {len(batch_paths)}个批次 (每批{batch_size}页)")
    return batch_paths, total


# ============================================================
# Step 2: Gemini 逐批提取 markdown
# ============================================================
def extract_batch(
    batch_path: Path,
    grade_semester: str,
    subject_cfg: SubjectConfig,
    page_range: str,
    total_pages: int,
    prev_summary: str,
) -> str:
    pdf_b64 = base64.b64encode(batch_path.read_bytes()).decode()

    prompt = PAGE_EXTRACT_PROMPT.format(
        subject_name=subject_cfg["display_name"],
        publisher_label=subject_cfg["publisher_label"],
        grade_semester=grade_semester,
        page_range=page_range,
        total_pages=total_pages,
        prev_summary=prev_summary if prev_summary else "（这是第一批，无前置内容）",
    )

    completion = client.chat.completions.create(
        model=EXTRACT_MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:application/pdf;base64,{pdf_b64}"},
                    },
                ],
            }
        ],
        max_tokens=8000,
        extra_headers=EXTRA_HEADERS,
        extra_body={"usage": {"include": True}},
    )
    record_usage("extract", completion)

    return completion.choices[0].message.content.strip()


# ============================================================
# Step 3: 合并 markdown + 生成大纲 JSON
# ============================================================
def extract_pdf_full(
    pdf_path: Path,
    subject_cfg: SubjectConfig,
    dirs: dict[str, Path],
    batch_size: int = 10,
):
    stem = pdf_path.stem
    grade_semester = get_grade_semester(stem)

    batches, total_pages = split_pdf_pages(pdf_path, dirs, batch_size)
    cache_dir = dirs["pdf"] / f"{stem}_batches"

    md_results: dict[int, str] = {}
    todo: list[tuple[int, Path, str, Path]] = []
    for i, batch_path in enumerate(batches):
        cache_file = cache_dir / f"{batch_path.stem}.md"
        if cache_file.exists():
            md_results[i] = cache_file.read_text(encoding="utf-8")
        else:
            page_range = batch_path.stem.split("_p")[-1]
            todo.append((i, batch_path, page_range, cache_file))

    cached = len(batches) - len(todo)
    if cached:
        print(f"  [缓存] 命中 {cached}/{len(batches)} 个批次")

    if todo:
        print(f"  [并行提取] {len(todo)} 个批次，{MAX_WORKERS} 路并发")

        def _do_extract(args):
            i, batch_path, page_range, cache_file = args
            md = extract_batch(
                batch_path,
                grade_semester=grade_semester,
                subject_cfg=subject_cfg,
                page_range=page_range,
                total_pages=total_pages,
                prev_summary="",
            )
            cache_file.write_text(md, encoding="utf-8")
            return i, md

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futures = {ex.submit(_do_extract, t): t for t in todo}
            done = 0
            for fut in as_completed(futures):
                i, md = fut.result()
                md_results[i] = md
                done += 1
                print(f"    [完成] 批次 {i + 1}/{len(batches)} ({done}/{len(todo)})")

    all_md_parts = []
    for i, batch_path in enumerate(batches):
        all_md_parts.append(
            f"\n\n<!-- 页码: {batch_path.stem.split('_p')[-1]} -->\n\n{md_results[i]}"
        )
    full_markdown = "\n".join(all_md_parts)
    (dirs["markdown"] / f"{stem}.md").write_text(full_markdown, encoding="utf-8")
    print(f"  [合并] 总markdown: {len(full_markdown)} chars")

    # 大纲生成
    print(f"  [大纲] 生成结构化大纲JSON ({len(full_markdown)} chars 输入)...")
    outline_prompt = OUTLINE_PROMPT.format(
        content=full_markdown,
        subject_name=subject_cfg["display_name"],
        publisher_label=subject_cfg["publisher_label"],
        curriculum=subject_cfg["curriculum"],
    )
    completion = client.chat.completions.create(
        model=GENERATE_MODEL,
        messages=[{"role": "user", "content": outline_prompt}],
        max_tokens=8000,
        response_format={"type": "json_schema", "json_schema": OUTLINE_SCHEMA},
        extra_headers=EXTRA_HEADERS,
        extra_body={"usage": {"include": True}},
    )
    record_usage("outline", completion)

    json_str = completion.choices[0].message.content.strip()
    outline_json = json.loads(json_str)

    (dirs["outline"] / f"{stem}.json").write_text(
        json.dumps(outline_json, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"  [完成] {len(outline_json.get('units', []))} 个单元")
    return full_markdown, outline_json


# ============================================================
# Step 4: 生成题目 + 知识点全解
# ============================================================
def generate_quiz_for_unit(subject_cfg: SubjectConfig, textbook: str, unit: dict) -> dict:
    kp_detail = build_knowledge_points_detail(unit)

    prompt_template = getattr(P, subject_cfg["quiz_prompt"])
    schema = getattr(P, subject_cfg["quiz_schema"])

    prompt = prompt_template.format(
        textbook=textbook,
        unit_number=unit["unit_number"],
        unit_title=unit["title"],
        knowledge_points_detail=kp_detail,
    )

    print(f"    [生成] 第{unit['unit_number']}单元: {unit['title']}")

    completion = client.chat.completions.create(
        model=GENERATE_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=16000,
        response_format={"type": "json_schema", "json_schema": schema},
        extra_headers=EXTRA_HEADERS,
        extra_body={"usage": {"include": True}},
    )
    record_usage("quiz", completion)

    content = completion.choices[0].message.content.strip()
    return json.loads(content)


def generate_knowledge_markdown(quiz_data: dict) -> str:
    lines = []
    textbook = quiz_data.get("textbook", "")
    unit = quiz_data.get("unit", "")
    unit_number = quiz_data.get("unit_number", "")

    lines.append(f"# {textbook} - 第{unit_number}单元: {unit}")
    lines.append(f"\n## 知识点全解\n")

    for kp in quiz_data.get("knowledge_summary", []):
        lines.append(f"### {kp.get('point', '')}")
        lines.append(f"\n**核心概念**: {kp.get('core_concept', '')}\n")
        if kp.get("key_formula"):
            lines.append(f"**重要公式/规则**: {kp['key_formula']}\n")
        if kp.get("common_mistakes"):
            lines.append("**常见错误**:")
            for m in kp["common_mistakes"]:
                lines.append(f"- {m}")
            lines.append("")
        if kp.get("tips"):
            lines.append(f"**学习技巧**: {kp['tips']}\n")

    return "\n".join(lines)


# ============================================================
# Step 5: 质量检查（按学科适配题型）
# ============================================================
def validate_quiz(quiz_data: dict, subject_cfg: SubjectConfig) -> list[str]:
    issues = []
    allowed_types = set(subject_cfg["question_types"])

    for test_key in ["unit_test", "exam"]:
        test = quiz_data.get(test_key, {})
        questions = test.get("questions", [])
        total_score = test.get("total_score", 100)

        # 分数和
        score_sum = sum(q.get("score", 0) for q in questions)
        if score_sum != total_score:
            issues.append(f"[{test_key}] 分数总和 {score_sum} ≠ 目标 {total_score}")

        for q in questions:
            qid = q.get("id")
            qtype = q.get("type", "")
            opts = q.get("options", [])
            ans = q.get("answer", "")

            # 难度
            if q.get("difficulty", 0) not in (1, 2, 3):
                issues.append(f"[{test_key}] 题{qid} 难度 {q.get('difficulty')} 越界")

            # 题型必须在学科允许列表中
            if qtype not in allowed_types:
                issues.append(f"[{test_key}] 题{qid} 题型 {qtype} 不在学科允许列表 {sorted(allowed_types)}")

            # choice 必须 4 项
            if qtype == "choice":
                if len(opts) != 4:
                    issues.append(f"[{test_key}] 选择题{qid} options 应为 4 项，实际 {len(opts)}")
                if ans:
                    # 容忍空格差异
                    ans_norm = "".join(ans.split())
                    opts_norm = ["".join(o.split()) for o in opts]
                    if ans not in opts and ans_norm not in opts_norm:
                        issues.append(f"[{test_key}] 选择题{qid} answer 不在 options 中")

            # true_false 答案
            if qtype == "true_false":
                if ans not in ("对", "错"):
                    issues.append(f"[{test_key}] 判断题{qid} answer 应为'对'或'错'，实际 '{ans}'")
                if opts:
                    issues.append(f"[{test_key}] 判断题{qid} 不应有 options")

            # fill_blank（数字）
            if qtype in ("fill_blank", "calculation"):
                if not ans.isdigit():
                    issues.append(f"[{test_key}] {qtype}题{qid} answer 应为纯整数字符串，实际 '{ans}'")
                if opts:
                    issues.append(f"[{test_key}] {qtype}题{qid} 不应有 options")

            # fill_blank_text（文字）
            if qtype == "fill_blank_text":
                if not ans.strip():
                    issues.append(f"[{test_key}] fill_blank_text题{qid} answer 为空")
                if opts:
                    issues.append(f"[{test_key}] fill_blank_text题{qid} 不应有 options")

            # matching
            if qtype == "matching":
                if len(opts) != 8:
                    issues.append(f"[{test_key}] 连线题{qid} options 应为 8 项（前4左+后4右），实际 {len(opts)}")
                # answer 形式 "A-1,B-2,C-3,D-4"
                parts = [p.strip() for p in ans.split(",")]
                if len(parts) != 4:
                    issues.append(f"[{test_key}] 连线题{qid} answer 应有 4 对，实际 {len(parts)}")
                else:
                    keys = sorted(p.split("-")[0] for p in parts if "-" in p)
                    vals = sorted(p.split("-")[1] for p in parts if "-" in p)
                    if keys != ["A", "B", "C", "D"]:
                        issues.append(f"[{test_key}] 连线题{qid} 左列键应是 A,B,C,D")
                    if vals != ["1", "2", "3", "4"]:
                        issues.append(f"[{test_key}] 连线题{qid} 右列值应是 1,2,3,4")

            # word_order
            if qtype == "word_order":
                if not (2 <= len(opts) <= 6):
                    issues.append(f"[{test_key}] 排序题{qid} options 应为 2-6 项，实际 {len(opts)}")
                ans_parts = [p.strip() for p in ans.split(",")]
                if sorted(ans_parts) != sorted(opts):
                    issues.append(f"[{test_key}] 排序题{qid} answer 词语集合与 options 不匹配")

            # 答案非空
            if not ans.strip():
                issues.append(f"[{test_key}] 题{qid} 答案为空")

            # 解析非空
            if not q.get("explanation", "").strip():
                issues.append(f"[{test_key}] 题{qid} 解析为空")

    return issues


# ============================================================
# 主流程：处理单本教材
# ============================================================
def process_textbook(filename: str, subject_id: str, batch_size: int = 10):
    subject_cfg = get_subject_cfg(subject_id)
    dirs = build_dirs(subject_id)
    setup_dirs(dirs)

    stem = Path(filename).stem
    grade_semester = get_grade_semester(stem)

    print(f"\n{'=' * 60}")
    print(f"处理: {filename}")
    print(f"学科: {subject_cfg['display_name']} | 年级: {grade_semester}")
    print(f"{'=' * 60}")

    # Step 0
    pdf_path = download_pdf(filename, subject_cfg, dirs)

    # Step 1-3: 提取 + 大纲
    outline_path = dirs["outline"] / f"{stem}.json"
    if outline_path.exists():
        print(f"  [跳过提取] 大纲已存在")
        outline = json.loads(outline_path.read_text(encoding="utf-8"))
    else:
        _, outline = extract_pdf_full(pdf_path, subject_cfg, dirs, batch_size)
        time.sleep(2)

    # Step 4: 生成题目
    textbook_name = outline.get("textbook", grade_semester)
    units = outline.get("units", [])

    if not units:
        print(f"  [跳过] 没有解析到单元信息")
        return

    todo_units = []
    for unit in units:
        quiz_file = dirs["quiz"] / f"{stem}_unit{unit['unit_number']}.json"
        if quiz_file.exists():
            print(f"    [跳过] 第{unit['unit_number']}单元已生成")
        else:
            todo_units.append(unit)

    if not todo_units:
        return

    print(f"  [并行生成] {len(todo_units)} 个单元，{MAX_WORKERS} 路并发")

    def _do_unit(unit):
        quiz_data = generate_quiz_for_unit(subject_cfg, textbook_name, unit)
        issues = validate_quiz(quiz_data, subject_cfg)
        if issues:
            quiz_data["_validation_issues"] = issues
        quiz_file = dirs["quiz"] / f"{stem}_unit{unit['unit_number']}.json"
        knowledge_file = dirs["knowledge"] / f"{stem}_unit{unit['unit_number']}.md"
        quiz_file.write_text(
            json.dumps(quiz_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        knowledge_file.write_text(generate_knowledge_markdown(quiz_data), encoding="utf-8")
        return unit, issues

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(_do_unit, u): u for u in todo_units}
        for fut in as_completed(futures):
            unit = futures[fut]
            try:
                u, issues = fut.result()
                tag = f" [警告:{len(issues)}项]" if issues else ""
                print(f"    [完成] 第{u['unit_number']}单元 {u['title']}{tag}")
            except Exception as e:
                print(f"    [错误] 第{unit['unit_number']}单元: {e}")


# ============================================================
# 跑一个学科的所有教材
# ============================================================
def run_subject(subject_id: str, only: str | None, batch_size: int):
    subject_cfg = get_subject_cfg(subject_id)
    textbooks = list(subject_cfg["textbooks"])

    if only:
        textbooks = [t for t in textbooks if only in t]
        if not textbooks:
            print(f"[{subject_id}] 未找到包含 '{only}' 的教材")
            return

    print(f"\n{'#' * 60}")
    print(f"# 学科: {subject_cfg['display_name']} ({subject_id})")
    print(f"# 教材数量: {len(textbooks)}")
    print(f"{'#' * 60}")

    for filename in textbooks:
        try:
            process_textbook(filename, subject_id, batch_size)
        except Exception as e:
            print(f"  [错误] {filename}: {e}")
            import traceback
            traceback.print_exc()
            continue


# ============================================================
# CLI 入口
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="小学多学科教材 AI 题库生成 Pipeline v3")
    parser.add_argument(
        "--subject", type=str, default="math",
        choices=["math", "chinese", "english", "science", "all"],
        help="要处理的学科（默认 math）",
    )
    parser.add_argument(
        "--batch-size", type=int, default=10,
        help="PDF 拆分时每批页数（默认10）",
    )
    parser.add_argument(
        "--only", type=str, default=None,
        help="只处理包含该关键词的教材，如 '三年级上册'",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="只显示会处理哪些教材，不实际执行",
    )
    parser.add_argument(
        "--list-subjects", action="store_true",
        help="列出所有已配置学科和教材清单后退出",
    )
    args = parser.parse_args()

    if args.list_subjects:
        for sid in ALL_SUBJECT_IDS:
            cfg = SUBJECTS[sid]
            print(f"\n[{sid}] {cfg['display_name']} · {cfg['publisher_label']}")
            print(f"  课标: {cfg['curriculum']}")
            print(f"  GitHub: {cfg['github_path']}")
            print(f"  年级范围: {cfg['grade_range'][0]}-{cfg['grade_range'][1]}")
            print(f"  题型: {cfg['question_types']}")
            print(f"  教材数: {len(cfg['textbooks'])}")
            for i, t in enumerate(cfg["textbooks"], 1):
                print(f"    {i}. {t}")
        return

    # 数学旧数据兜底迁移
    if args.subject in ("math", "all"):
        migrate_legacy_math_data_if_needed()

    print("=" * 60)
    print("小学多学科教材 AI 题库生成 Pipeline v3")
    print(f"提取模型: {EXTRACT_MODEL}")
    print(f"生成模型: {GENERATE_MODEL}")
    print(f"每批页数: {args.batch_size}")
    print(f"目标学科: {args.subject}")
    print("=" * 60)

    if args.dry_run:
        target_subjects = ALL_SUBJECT_IDS if args.subject == "all" else [args.subject]
        for sid in target_subjects:
            cfg = SUBJECTS[sid]
            tb = cfg["textbooks"]
            if args.only:
                tb = [t for t in tb if args.only in t]
            print(f"\n[{sid}] {cfg['display_name']} - 将处理 {len(tb)} 本:")
            for f in tb:
                print(f"  {get_grade_semester(Path(f).stem)}: {f}")
        print("\n(dry-run模式，未实际执行)")
        return

    target_subjects = ALL_SUBJECT_IDS if args.subject == "all" else [args.subject]
    for sid in target_subjects:
        run_subject(sid, args.only, args.batch_size)

    # 汇总
    print(f"\n{'=' * 60}")
    print("Pipeline 完成！汇总：")
    for sid in target_subjects:
        d = build_dirs(sid)
        outlines = list(d["outline"].glob("*.json")) if d["outline"].exists() else []
        quizzes = list(d["quiz"].glob("*.json")) if d["quiz"].exists() else []
        total_q = 0
        total_issues = 0
        for qf in quizzes:
            try:
                data = json.loads(qf.read_text(encoding="utf-8"))
                for key in ["unit_test", "exam"]:
                    total_q += len(data.get(key, {}).get("questions", []))
                total_issues += len(data.get("_validation_issues", []))
            except Exception:
                pass
        print(f"  [{sid}] {len(outlines)} 本大纲 / {len(quizzes)} 单元题库 / {total_q} 题 / {total_issues} 项警告")
    print(f"{'=' * 60}")

    print_cost_summary()


if __name__ == "__main__":
    main()
