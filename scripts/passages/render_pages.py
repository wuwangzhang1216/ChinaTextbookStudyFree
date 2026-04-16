#!/usr/bin/env python3
"""
render_pages.py — 把 data/passages/**/*.json 里每篇课文对应的 PDF 物理页
渲染成 JPG，放到 frontend/public/textbook-pages/{bookId}/p{n}.jpg。

**关键**：Gemini 给的 `page_hint` 是从页眉读到的**印刷页码**，和 PDF **物理页码**
差一个**固定的偏移量**（= 封面 + 扉页 + 目录占的页数，一本书内基本不变）。
所以不需要对每篇课文单独搜 —— 只要**算出这本书的 offset 一次**，然后
`物理页 = page_hint + offset` 即可。

offset 的算法：
  1. 每本书抽若干篇（用 title + 首句锚点），pymupdf 全文搜索找真实物理页
  2. 对每个成功命中的样本记录 `offset = 真实物理页 - page_hint`
  3. 取所有样本 offset 的**众数**（抗 outlier）作为本书的 offset
  4. 对所有 passage 套用该 offset

用法:
  python scripts/passages/render_pages.py [--dpi 120] [--only chinese-g1up]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import fitz  # pymupdf

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parents[2]
PASSAGES_DIR = ROOT / "data" / "passages"
OUTPUT_DIR = ROOT / "output"
PAGES_OUT = ROOT / "apps" / "web" / "public" / "textbook-pages"


def find_pdf(subject: str, textbook_stem: str) -> Path | None:
    pdf_dir = OUTPUT_DIR / subject / "pdfs"
    if not pdf_dir.exists():
        return None
    cand = pdf_dir / f"{textbook_stem}.pdf"
    if cand.exists():
        return cand
    norm = re.sub(r"\s+", "", textbook_stem)
    for p in pdf_dir.glob("*.pdf"):
        if re.sub(r"\s+", "", p.stem) == norm:
            return p
    return None


def render_page(doc: fitz.Document, page_num: int, out_path: Path, dpi: int) -> bool:
    if out_path.exists():
        return True
    idx = page_num - 1
    if idx < 0 or idx >= len(doc):
        return False
    try:
        page = doc[idx]
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        from PIL import Image
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        img.save(str(out_path), "JPEG", quality=85, optimize=True)
        return True
    except Exception as e:
        print(f"  ⚠️  {out_path.name} 渲染失败: {e}", file=sys.stderr)
        return False


# --------------------------------------------------------------------------
# 用锚点搜索 + 众数法算出本书的 offset
# --------------------------------------------------------------------------
_PUNCT_RE = re.compile(
    "[\\s，。！？、；：\u201c\u201d\u2018\u2019（）()《》\\[\\]【】,.!?\\-—_]+"
)


def normalize(s: str) -> str:
    return _PUNCT_RE.sub("", s or "")


def pick_anchors(passage: dict, k: int = 3) -> list[str]:
    """从一篇 passage 里选几个锚点子串（去重），按长度优先。

    越长的中文子串越不会和别的页冲突。最多返回 k 个，按长度降序。"""
    sents = passage.get("sentences") or []
    cands = {normalize(s) for s in sents}
    cands = [c for c in cands if len(c) >= 3]
    cands.sort(key=len, reverse=True)
    return cands[:k]


def detect_offset(
    passages: list[dict], page_texts: list[str]
) -> tuple[int, int, int]:
    """扫描 passages + PDF 全文，返回 (mode_offset, 样本数, 总尝试数)。

    每个 passage 选多个锚点子串，取**所有锚点都在同一页出现**的那一页作为真实页。
    offset = 真实页 - page_hint。累积样本后取众数。"""
    offsets: list[int] = []
    tried = 0
    for p in passages:
        hint = p.get("page_hint")
        if not isinstance(hint, int) or hint <= 0:
            continue
        anchors = pick_anchors(p, k=3)
        if not anchors:
            continue
        tried += 1
        # 找同时包含所有锚点的页（把整首诗/整段对话定位到一页内）
        matches = [
            i + 1
            for i, t in enumerate(page_texts)
            if all(a in t for a in anchors)
        ]
        # 退化：如果 all-match 失败，用最长锚点单独 match
        if not matches and anchors:
            longest = anchors[0]
            matches = [i + 1 for i, t in enumerate(page_texts) if longest in t]
        if not matches:
            continue
        # 多次命中：取最接近 page_hint 的
        chosen = min(matches, key=lambda pn: abs(pn - hint))
        offsets.append(chosen - hint)
    if not offsets:
        return (0, 0, tried)
    mode_offset, _ = Counter(offsets).most_common(1)[0]
    return (mode_offset, len(offsets), tried)


def process_book(book_json: Path, dpi: int) -> dict:
    doc_json = json.loads(book_json.read_text(encoding="utf-8"))
    book_id = doc_json["bookId"]
    subject = doc_json["subject"]
    textbook = doc_json["textbook"]
    passages = doc_json.get("passages") or []

    pdf_path = find_pdf(subject, textbook)
    if not pdf_path:
        print(f"  ❌ 找不到 PDF: {subject}/{textbook}")
        return {"book_id": book_id, "passages": [], "rendered": 0, "skipped": 0}

    pdf = fitz.open(str(pdf_path))
    page_texts = [normalize(p.get_text("text")) for p in pdf]

    # page_hint 现在已经是真实 PDF 物理页码
    # （extract_passages.py 在 _do() 里已经做了 batch_start + page_in_batch - 1）
    # 如果是老数据（page_hint 还是印刷页码），仍然做一次 offset 检测兜底
    offset, n_samples, n_tried = detect_offset(passages, page_texts)

    # 收集所有需要渲染的物理页号（每篇 ±1 兜底）
    pages_needed: set[int] = set()
    passage_map: list[dict] = []
    for p in passages:
        hint = p.get("page_hint")
        if not isinstance(hint, int) or hint <= 0:
            resolved = None
            pages = []
        else:
            # 如果 offset 接近 0（<= 1），说明 page_hint 已经是物理页，不需要修正
            # 如果 offset 很大（>= 3），说明是旧数据，需要加 offset
            actual_offset = offset if abs(offset) >= 3 else 0
            resolved = hint + actual_offset
            pages = []
            for off in (-1, 0, 1):
                pn = resolved + off
                if 1 <= pn <= len(pdf):
                    pages.append(pn)
                    pages_needed.add(pn)
        passage_map.append({
            "passage_id": p["id"],
            "title": p.get("title"),
            "page_hint": hint,
            "pdf_page": resolved,
            "pages": pages,
        })

    # 渲染
    out_dir = PAGES_OUT / book_id
    rendered = 0
    skipped = 0
    for pn in sorted(pages_needed):
        out_path = out_dir / f"p{pn}.jpg"
        if out_path.exists():
            skipped += 1
            continue
        if render_page(pdf, pn, out_path, dpi):
            rendered += 1

    # 写 mapping
    out_dir.mkdir(parents=True, exist_ok=True)
    mapping = {
        "bookId": book_id,
        "pdf_total_pages": len(pdf),
        "detected_offset": offset,
        "offset_applied": offset if abs(offset) >= 3 else 0,
        "offset_samples": n_samples,
        "passages": passage_map,
    }
    (out_dir / "pages.json").write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    pdf.close()
    return {
        "book_id": book_id,
        "passages": passage_map,
        "rendered": rendered,
        "skipped": skipped,
        "offset": offset,
        "samples": n_samples,
        "tried": n_tried,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dpi", type=int, default=120)
    ap.add_argument("--only", default=None)
    ap.add_argument("--clean", action="store_true",
                    help="先删 PAGES_OUT 下全部 jpg 再跑（用于换 offset 重跑）")
    args = ap.parse_args()

    book_files = sorted(PASSAGES_DIR.rglob("*.json"))
    book_files = [f for f in book_files if not f.name.endswith(".draft.json")]
    if args.only:
        book_files = [f for f in book_files if args.only in f.stem]
    if not book_files:
        sys.exit("❌ 没找到 passages JSON 文件")

    if args.clean and PAGES_OUT.exists():
        import shutil
        if args.only:
            target = PAGES_OUT / args.only
            if target.exists():
                shutil.rmtree(target)
        else:
            shutil.rmtree(PAGES_OUT)

    print(f"📖 {len(book_files)} 本书待处理 (dpi={args.dpi})")
    print(f"   输出目录: {PAGES_OUT}")
    print()

    tot_r = tot_s = 0
    for bf in book_files:
        res = process_book(bf, args.dpi)
        tot_r += res["rendered"]
        tot_s += res["skipped"]
        offset = res.get("offset", 0)
        samples = res.get("samples", 0)
        tried = res.get("tried", 0)
        sign = "+" if offset >= 0 else ""
        print(
            f"   {bf.stem:<20s}  offset={sign}{offset:<3}  "
            f"(样本 {samples}/{tried})  "
            f"{len(res['passages'])} 篇 / 渲染 {res['rendered']:>3} 跳过 {res['skipped']:>3}"
        )

    print()
    print(f"✅ 完成：{tot_r} 张新渲染 / {tot_s} 张已存在（跳过）")


if __name__ == "__main__":
    main()
