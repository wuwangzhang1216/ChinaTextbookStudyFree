"""
就地清理：扫描所有 subject 的 quiz 文件，把单道无效题（matching 重复、word_order 词集不匹配、
choice 答案不在 options、fill_blank 类型错误等）从 questions 数组里删除，
保留其他正确题，重写 JSON。

最终每个 unit 可能少于 23 题，但所有保留的题都通过验证。
"""

import json
import sys
import glob
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from subjects import get_subject_cfg, ALL_SUBJECT_IDS


def question_is_valid(q: dict, allowed_types: set) -> tuple[bool, str]:
    qtype = q.get("type", "")
    opts = q.get("options", [])
    ans = q.get("answer", "")

    if qtype not in allowed_types:
        return False, f"type {qtype} not allowed"
    if not ans.strip():
        return False, "empty answer"
    if not q.get("explanation", "").strip():
        return False, "empty explanation"
    if q.get("difficulty", 0) not in (1, 2, 3):
        return False, "bad difficulty"

    if qtype == "choice":
        if len(opts) != 4:
            return False, "options != 4"
        ans_norm = "".join(ans.split())
        opts_norm = ["".join(o.split()) for o in opts]
        if ans not in opts and ans_norm not in opts_norm:
            return False, "answer not in options"
    elif qtype == "true_false":
        if ans not in ("对", "错"):
            return False, "TF answer wrong"
        if opts:
            return False, "TF has options"
    elif qtype in ("fill_blank", "calculation"):
        if not ans.isdigit():
            return False, "not pure integer"
        if opts:
            return False, "has options"
    elif qtype == "fill_blank_text":
        if opts:
            return False, "has options"
    elif qtype == "matching":
        if len(opts) != 8:
            return False, "options != 8"
        parts = [p.strip() for p in ans.split(",")]
        if len(parts) != 4:
            return False, "answer not 4 pairs"
        keys = sorted(p.split("-")[0] for p in parts if "-" in p)
        vals = sorted(p.split("-")[1] for p in parts if "-" in p)
        if keys != ["A", "B", "C", "D"]:
            return False, "keys not A-D"
        if vals != ["1", "2", "3", "4"]:
            return False, "vals not 1-4 permutation"
    elif qtype == "word_order":
        if not (2 <= len(opts) <= 6):
            return False, "options size out of range"
        ans_parts = [p.strip() for p in ans.split(",")]
        if sorted(ans_parts) != sorted(opts):
            return False, "answer set != options set"

    return True, ""


def clean_quiz_file(path: Path, allowed_types: set) -> tuple[int, int]:
    """Returns (removed, kept) count."""
    data = json.loads(path.read_text(encoding="utf-8"))
    # Drop stale validation issues
    data.pop("_validation_issues", None)

    removed = 0
    kept = 0
    for test_key in ["unit_test", "exam"]:
        test = data.get(test_key, {})
        questions = test.get("questions", [])
        new_questions = []
        for q in questions:
            ok, _reason = question_is_valid(q, allowed_types)
            if ok:
                new_questions.append(q)
                kept += 1
            else:
                removed += 1
        # Renumber IDs
        for i, q in enumerate(new_questions, 1):
            q["id"] = i
        # Update total_score to reflect kept questions
        test["questions"] = new_questions
        test["total_score"] = sum(q.get("score", 0) for q in new_questions)

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return removed, kept


def main():
    grand_removed = 0
    grand_kept = 0
    for subject in ["chinese", "english", "science"]:
        cfg = get_subject_cfg(subject)
        allowed = set(cfg["question_types"])
        sub_removed = 0
        sub_kept = 0
        files = sorted(glob.glob(f"output/{subject}/quizzes/*.json"))
        for f in files:
            r, k = clean_quiz_file(Path(f), allowed)
            sub_removed += r
            sub_kept += k
        grand_removed += sub_removed
        grand_kept += sub_kept
        print(f"  {subject}: removed {sub_removed} bad questions, kept {sub_kept}")
    print()
    print(f"TOTAL: removed {grand_removed} bad questions, kept {grand_kept}")


if __name__ == "__main__":
    main()
