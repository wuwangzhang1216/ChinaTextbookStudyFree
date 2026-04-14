/**
 * grade.ts — 答案判分逻辑
 *
 * 不同题型有不同的判分规则。容忍：空格、全/半角、中英文标点、数字格式。
 */

import type { Question } from "./types";

const TRUE_VALUES = new Set(["对", "正确", "true", "T", "✓", "√", "Y", "yes"]);
const FALSE_VALUES = new Set(["错", "错误", "false", "F", "✗", "×", "N", "no"]);

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/，/g, ",")
    .replace(/。/g, ".")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/：/g, ":");
}

/** 把分数 "3/4" 之类规范化 */
function normalizeNumeric(s: string): string {
  return normalize(s)
    .replace(/[^\d\-./%a-z]/g, "") // 去掉单位/汉字（保留数字、分数、百分号、字母用于"米"等）
    .replace(/^0+(\d)/, "$1");
}

export function gradeAnswer(question: Question, userAnswer: string): boolean {
  if (!userAnswer || !userAnswer.trim()) return false;
  const correct = question.answer;

  switch (question.type) {
    case "true_false": {
      const u = normalize(userAnswer);
      const c = normalize(correct);
      const userIsTrue = TRUE_VALUES.has(userAnswer.trim()) || TRUE_VALUES.has(u);
      const userIsFalse = FALSE_VALUES.has(userAnswer.trim()) || FALSE_VALUES.has(u);
      const correctIsTrue = TRUE_VALUES.has(correct.trim()) || TRUE_VALUES.has(c);
      if (userIsTrue || userIsFalse) return userIsTrue === correctIsTrue;
      return u === c;
    }

    case "choice": {
      // 答案可能是 "B"、"B. 60秒" 或直接存选项内容（如 "○○○○○○"）
      const u = userAnswer.trim().toUpperCase().charAt(0);
      let c = correct.trim().toUpperCase().charAt(0);
      // 若 answer 不是单个字母 A-D，则在 options 里反查下标
      if (!/^[A-D]$/.test(c) && question.options && question.options.length) {
        const cn = normalize(correct);
        const idx = question.options.findIndex(o => {
          const stripped = o.replace(/^[A-D][.、]\s*/, "");
          return normalize(o) === cn || normalize(stripped) === cn;
        });
        if (idx >= 0) c = String.fromCharCode(65 + idx);
      }
      return u === c;
    }

    case "fill_blank":
    case "calculation":
    case "word_problem": {
      // 多种容错：完全相等、normalize 相等、纯数字相等
      if (normalize(userAnswer) === normalize(correct)) return true;
      const un = normalizeNumeric(userAnswer);
      const cn = normalizeNumeric(correct);
      if (un && cn && un === cn) return true;
      // 数值容差（小数）
      const uf = parseFloat(un);
      const cf = parseFloat(cn);
      if (!isNaN(uf) && !isNaN(cf) && Math.abs(uf - cf) < 1e-6) return true;
      return false;
    }

    case "fill_blank_text": {
      // 文字填空（中文 / 英文单词）— 去空格、去大小写、去标点严格对比
      return normalizeText(userAnswer) === normalizeText(correct);
    }

    case "word_order": {
      // 用户答案应该是用逗号连接的词语序列
      const u = normalizeWordOrder(userAnswer);
      const c = normalizeWordOrder(correct);
      return u === c;
    }

    case "matching": {
      // 配对：A-1,B-2,C-3,D-4 顺序无关，集合相等即可
      const userPairs = parseMatchingAnswer(userAnswer);
      const correctPairs = parseMatchingAnswer(correct);
      if (userPairs.size !== correctPairs.size) return false;
      for (const [k, v] of userPairs) {
        if (correctPairs.get(k) !== v) return false;
      }
      return true;
    }

    default:
      return normalize(userAnswer) === normalize(correct);
  }
}

/** 文字填空规范化：trim、小写、去空格、去标点 */
function normalizeText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？：；,.!?:;()（）"'`]/g, "");
}

/** 排序题规范化：去掉空格，统一英文逗号 */
function normalizeWordOrder(s: string): string {
  return s.trim().replace(/，/g, ",").replace(/\s+/g, "");
}

/** 解析连线答案 "A-1,B-2,C-3,D-4" → Map { A: 1, B: 2, ... } */
function parseMatchingAnswer(s: string): Map<string, string> {
  const map = new Map<string, string>();
  const cleaned = s.trim().replace(/，/g, ",").replace(/\s+/g, "");
  if (!cleaned) return map;
  for (const pair of cleaned.split(",")) {
    const [k, v] = pair.split("-");
    if (k && v) map.set(k.toUpperCase(), v);
  }
  return map;
}
