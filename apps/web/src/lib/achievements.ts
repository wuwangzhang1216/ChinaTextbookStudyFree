/**
 * achievements.ts —— Web 端 shim
 *
 * 解锁判定 / 成就定义 全部来自 @cstf/core/achievements（纯函数、跨端共享）。
 * 本文件只保留 Web 平台特定的 seen-tracking（基于 localStorage）。
 * RN 端会有自己的 seen-tracking 实现（AsyncStorage）。
 */

export {
  ALL_ACHIEVEMENTS,
  computeUnlockedAchievementIds,
  diffNewlyUnlocked,
} from "@cstf/core/achievements";
export type {
  Achievement,
  AchievementCategory,
  AchievementProgressSnapshot,
} from "@cstf/core/achievements";

import { computeUnlockedAchievementIds } from "@cstf/core/achievements";
import { useProgressStore } from "@/store/progress";

const SEEN_KEY = "csf-achievements-seen-v1";

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeSeen(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* noop */
  }
}

/** 当前是否存在尚未被用户查看的已解锁成就 */
export function hasUnseenAchievements(): boolean {
  if (typeof window === "undefined") return false;
  const unlocked = computeUnlockedAchievementIds(useProgressStore.getState());
  const seen = readSeen();
  return unlocked.some(id => !seen.has(id));
}

/** 把当前所有解锁标记为已读（用户进入成就墙时调用） */
export function markAllSeen(): void {
  const unlocked = computeUnlockedAchievementIds(useProgressStore.getState());
  const seen = readSeen();
  unlocked.forEach(id => seen.add(id));
  writeSeen(seen);
}
