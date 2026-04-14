/**
 * srs.ts —— 简化的 Leitner 3-box 间隔重复算法
 *
 * 设计原则：
 *   - 3 个盒子（box 1/2/3），分别对应今天 / 明天 / 3天后 / 7天后的复习节奏
 *   - 答错 → 降级回 box 1
 *   - 答对 → 升级到下一个 box
 *   - 已经在 box 3 且连续答对 N 次 → 暂时"毕业"，不再频繁出现
 *
 * 算法极简，纯前端 + 零依赖，符合公益项目"低成本高效果"的目标。
 */

import type { Question } from "./types";

export type SrsBox = 1 | 2 | 3;

export interface SrsMistakeEntry {
  lessonId: string;
  lessonTitle?: string;
  question: Question;
  /** 首次加入错题本的时间 */
  addedAt: string;
  /** 当前所在 box */
  box?: SrsBox;
  /** 总答对次数 */
  correctCount?: number;
  /** 上次复习时间（ISO） */
  lastReviewedAt?: string;
  /** 下次应当复习的日期（YYYY-MM-DD）。空 = 立即可复习 */
  nextReviewDate?: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateNDaysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 给 SRS 条目应用一次复习结果，返回新的快照（不可变）。
 */
export function reviewSrsEntry(
  entry: SrsMistakeEntry,
  isCorrect: boolean,
): SrsMistakeEntry {
  const next: SrsMistakeEntry = { ...entry };
  next.lastReviewedAt = new Date().toISOString();

  if (!isCorrect) {
    // 答错 → 重置回 box 1，今天就再练
    next.box = 1;
    next.correctCount = 0;
    next.nextReviewDate = todayStr();
    return next;
  }

  // 答对：根据当前 box 升级
  next.correctCount = (next.correctCount ?? 0) + 1;
  const currentBox = (entry.box ?? 1) as SrsBox;

  switch (currentBox) {
    case 1:
      next.box = 2;
      next.nextReviewDate = dateNDaysFromNow(1); // 明天
      break;
    case 2:
      next.box = 3;
      next.nextReviewDate = dateNDaysFromNow(3); // 3 天后
      break;
    case 3:
      next.box = 3;
      next.nextReviewDate = dateNDaysFromNow(7); // 7 天后
      break;
  }
  return next;
}

/**
 * 从错题集筛出"今天应该复习"的题目，并按优先级排序：
 *   1. box 等级低的优先（box 1 > box 2 > box 3）
 *   2. 同 box 内按 lastReviewedAt 旧的优先
 *   3. 没有 nextReviewDate 的视作立即可复习
 */
export function getDueSrsEntries(
  entries: SrsMistakeEntry[],
): SrsMistakeEntry[] {
  const today = todayStr();
  const due = entries.filter(e => {
    if (!e.nextReviewDate) return true;
    return e.nextReviewDate <= today;
  });
  return due.sort((a, b) => {
    const ba = a.box ?? 1;
    const bb = b.box ?? 1;
    if (ba !== bb) return ba - bb;
    const la = a.lastReviewedAt ?? a.addedAt ?? "";
    const lb = b.lastReviewedAt ?? b.addedAt ?? "";
    return la.localeCompare(lb);
  });
}

/**
 * 给一条新错题（首次加入）填充 SRS 默认字段。
 */
export function newSrsEntry(
  partial: Pick<SrsMistakeEntry, "lessonId" | "lessonTitle" | "question">,
): SrsMistakeEntry {
  return {
    ...partial,
    addedAt: new Date().toISOString(),
    box: 1,
    correctCount: 0,
    nextReviewDate: todayStr(),
  };
}
