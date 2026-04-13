/**
 * chestLogic.ts — 宝箱节点的位置计算 + 奖励随机
 *
 * 设计原则：
 *   - 不改 outline.json，纯客户端计算
 *   - 每单元内每 N 课后插入一个 chest slot
 *   - chestId 稳定：`${bookId}-u${unit}-chest-${indexInUnit}`
 *   - 依赖 lesson.id 的集合是 determinstic 的，所以同一个 book 再次渲染时 id 一致
 */

import { CHEST_EVERY_N_LESSONS } from "@/store/progress";
import type { PathLessonMeta } from "@/components/PathMap";

export interface ChestSlot {
  id: string;
  /** 这个 chest 出现在这节课之后 */
  afterLessonId: string;
  unitNumber: number;
  unitTitle: string;
  /** 单元内第几个宝箱（0-indexed），用于 chestId */
  indexInUnit: number;
}

/**
 * 扫描所有 lessons，在每单元内每 N 课之后插入一个 chest slot。
 * 只在"紧跟"N 的倍数位置放 chest，不在单元末尾补 chest（避免奇怪的视觉跳动）。
 */
export function computeChestsForBook(
  bookId: string,
  lessons: PathLessonMeta[],
  interval = CHEST_EVERY_N_LESSONS,
): ChestSlot[] {
  const slots: ChestSlot[] = [];
  // 按单元分组，保持原顺序
  const unitIndices = new Map<number, number>();

  for (const l of lessons) {
    const countInUnit = (unitIndices.get(l.unitNumber) ?? 0) + 1;
    unitIndices.set(l.unitNumber, countInUnit);

    // 到达 interval 倍数（比如第 5 / 10 / 15 课）时，在这节课之后插入 chest
    if (countInUnit % interval === 0) {
      const indexInUnit = countInUnit / interval - 1;
      slots.push({
        id: `${bookId}-u${l.unitNumber}-chest-${indexInUnit}`,
        afterLessonId: l.id,
        unitNumber: l.unitNumber,
        unitTitle: l.unitTitle,
        indexInUnit,
      });
    }
  }

  return slots;
}

/**
 * 给定一个 bookId 和"刚完成的 lesson id"，查是否紧跟一个 chest slot。
 * 用于课程通关时判定"要不要开箱"。
 */
export function findChestAfterLesson(
  bookId: string,
  lessons: PathLessonMeta[],
  lessonId: string,
): ChestSlot | null {
  const chests = computeChestsForBook(bookId, lessons);
  return chests.find(c => c.afterLessonId === lessonId) ?? null;
}

/**
 * 三档可变奖励 —— 模拟 Duolingo 的"variable reward"心理机制。
 * - 85% 普通：[10, 20] gems
 * - 10% 惊喜：[21, 30] gems
 * -  5% 超级惊喜：[40, 50] gems（值得截图分享）
 *
 * 对应的 rarity tier 给前端用，可以让超级惊喜走更夸张的开箱动画。
 */
export type ChestRewardTier = "common" | "rare" | "epic";

export interface ChestRewardResult {
  gems: number;
  tier: ChestRewardTier;
}

export function rollChestReward(): ChestRewardResult {
  const roll = Math.random();
  if (roll < 0.85) {
    return { gems: Math.round(10 + Math.random() * 10), tier: "common" };
  }
  if (roll < 0.95) {
    return { gems: Math.round(21 + Math.random() * 9), tier: "rare" };
  }
  return { gems: Math.round(40 + Math.random() * 10), tier: "epic" };
}
