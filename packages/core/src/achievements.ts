/**
 * achievements.ts —— 成就 / 徽章定义与解锁判定（纯函数）
 *
 * 拆分成两层：
 *   - **core/achievements**（本文件）：定义 ALL_ACHIEVEMENTS、computeUnlockedAchievementIds、
 *     diffNewlyUnlocked。零 DOM、零 store 依赖。所有 getProgress 函数接收一个
 *     结构化的 AchievementProgressSnapshot —— 实际的 ProgressState 通过 TS
 *     结构子类型自动满足这个接口。
 *   - **frontend/lib/achievements**（Web 端 shim）：在此基础上保留 hasUnseenAchievements /
 *     markAllSeen，依赖 localStorage + Zustand store。RN 端会有自己的 seen-tracking 实现。
 */

import { getStarterCosmetics } from "./cosmetics";

export type AchievementCategory = "milestone" | "streak" | "perfection" | "shop" | "review";

/**
 * 新档白送的初始美妆 id 集合 —— "解锁第一件聪聪的装扮"要排除它们。
 * 用 cosmetics 的 starter 标记推导（而不是减一个魔法数），
 * 将来增删 starter 或用户只拥有部分 starter 都不会错档。
 */
const STARTER_COSMETIC_IDS: ReadonlySet<string> = new Set(
  getStarterCosmetics().map(c => c.id),
);

/** 自己买/赚来的美妆件数（不含初始白送的）。 */
function ownedNonStarterCount(ownedCosmetics: Record<string, unknown>): number {
  return Object.keys(ownedCosmetics).filter(id => !STARTER_COSMETIC_IDS.has(id)).length;
}

/**
 * 成就计算所需的进度快照——只声明 ALL_ACHIEVEMENTS 真正读到的字段。
 * 任何包含这些字段的更大对象（例如 Web 的 ProgressState）都自动兼容。
 */
export interface AchievementProgressSnapshot {
  xp: number;
  streak: number;
  lifetimeGems: number;
  completedLessons: Record<string, unknown>;
  perfectedLessons: Record<string, unknown>;
  ownedCosmetics: Record<string, unknown>;
  mistakesBank: ReadonlyArray<{ correctCount?: number }>;
}

/**
 * 成就奖励分量（宝石）：轻量 20 / 中量 50 / 重量 100。
 */
export type AchievementRewardGems = 20 | 50 | 100;

export interface Achievement {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  iconKey:
    | "lightning"
    | "flame"
    | "star"
    | "crown"
    | "gem"
    | "bookmark"
    | "trophy"
    | "rocket"
    | "medal"
    | "sparkle";
  color: string;
  goal: number;
  /** 解锁奖励宝石（只发一次，解锁写入永久 unlockedAchievements 账本） */
  reward: AchievementRewardGems;
  getProgress: (s: AchievementProgressSnapshot) => number;
}

const A: Achievement[] = [
  // ===== Milestone：首次行动 =====
  {
    id: "first-lesson",
    category: "milestone",
    name: "出师告捷",
    description: "完成你的第一节课",
    iconKey: "rocket",
    color: "#1CB0F6",
    goal: 1,
    reward: 20,
    getProgress: s => Object.keys(s.completedLessons).length,
  },
  {
    id: "ten-lessons",
    category: "milestone",
    name: "学海十里",
    description: "累计完成 10 节课",
    iconKey: "bookmark",
    color: "#1CB0F6",
    goal: 10,
    reward: 50,
    getProgress: s => Object.keys(s.completedLessons).length,
  },
  {
    id: "fifty-lessons",
    category: "milestone",
    name: "百炼成钢",
    description: "累计完成 50 节课",
    iconKey: "trophy",
    color: "#A855F7",
    goal: 50,
    reward: 100,
    getProgress: s => Object.keys(s.completedLessons).length,
  },

  // ===== XP =====
  {
    id: "xp-100",
    category: "milestone",
    name: "初露锋芒",
    description: "累计 100 经验",
    iconKey: "lightning",
    color: "#1CB0F6",
    goal: 100,
    reward: 20,
    getProgress: s => s.xp,
  },
  {
    id: "xp-1000",
    category: "milestone",
    name: "经验丰富",
    description: "累计 1000 经验",
    iconKey: "lightning",
    color: "#A855F7",
    goal: 1000,
    reward: 50,
    getProgress: s => s.xp,
  },
  {
    id: "xp-5000",
    category: "milestone",
    name: "学霸认证",
    description: "累计 5000 经验",
    iconKey: "lightning",
    color: "#FFC800",
    goal: 5000,
    reward: 100,
    getProgress: s => s.xp,
  },

  // ===== Streak =====
  {
    id: "streak-3",
    category: "streak",
    name: "三日不辍",
    description: "连续学习 3 天",
    iconKey: "flame",
    color: "#FF9600",
    goal: 3,
    reward: 20,
    getProgress: s => s.streak,
  },
  {
    id: "streak-7",
    category: "streak",
    name: "一周如一日",
    description: "连续学习 7 天",
    iconKey: "flame",
    color: "#FF9600",
    goal: 7,
    reward: 50,
    getProgress: s => s.streak,
  },
  {
    id: "streak-30",
    category: "streak",
    name: "月度坚持",
    description: "连续学习 30 天",
    iconKey: "flame",
    color: "#FF4B4B",
    goal: 30,
    reward: 100,
    getProgress: s => s.streak,
  },
  {
    id: "streak-100",
    category: "streak",
    name: "百日行者",
    description: "连续学习 100 天",
    iconKey: "flame",
    color: "#FFC800",
    goal: 100,
    reward: 100,
    getProgress: s => s.streak,
  },

  // ===== Perfection =====
  {
    id: "perfect-1",
    category: "perfection",
    name: "完美初体验",
    description: "首次三星通关一节课",
    iconKey: "star",
    color: "#FFC800",
    goal: 1,
    reward: 20,
    getProgress: s => Object.keys(s.perfectedLessons).length,
  },
  {
    id: "perfect-10",
    category: "perfection",
    name: "完美十连",
    description: "三星通关 10 节课",
    iconKey: "star",
    color: "#FFC800",
    goal: 10,
    reward: 50,
    getProgress: s => Object.keys(s.perfectedLessons).length,
  },
  {
    id: "perfect-50",
    category: "perfection",
    name: "无暇修行",
    description: "三星通关 50 节课",
    iconKey: "crown",
    color: "#A855F7",
    goal: 50,
    reward: 100,
    getProgress: s => Object.keys(s.perfectedLessons).length,
  },

  // ===== Shop / Cosmetics =====
  {
    id: "first-cosmetic",
    category: "shop",
    name: "时尚启航",
    description: "解锁第一件聪聪的装扮",
    iconKey: "sparkle",
    color: "#A855F7",
    goal: 1,
    reward: 20,
    getProgress: s => ownedNonStarterCount(s.ownedCosmetics),
  },
  {
    id: "gem-collector",
    category: "shop",
    name: "宝石收藏家",
    description: "累计获得 500 颗宝石",
    iconKey: "gem",
    color: "#A855F7",
    goal: 500,
    reward: 50,
    getProgress: s => s.lifetimeGems,
  },

  // ===== Review =====
  {
    id: "first-review",
    category: "review",
    name: "知错就改",
    description: "在错题本中复习一道题",
    iconKey: "medal",
    color: "#58CC02",
    goal: 1,
    reward: 20,
    getProgress: s => s.mistakesBank.filter(m => (m.correctCount ?? 0) > 0).length,
  },
];

export const ALL_ACHIEVEMENTS: Achievement[] = A;

export function computeUnlockedAchievementIds(s: AchievementProgressSnapshot): string[] {
  return ALL_ACHIEVEMENTS.filter(a => a.getProgress(s) >= a.goal).map(a => a.id);
}

/**
 * 比较两次 store 快照，返回这次新解锁的成就。
 */
export function diffNewlyUnlocked(
  before: AchievementProgressSnapshot,
  after: AchievementProgressSnapshot,
): Achievement[] {
  const beforeSet = new Set(computeUnlockedAchievementIds(before));
  return ALL_ACHIEVEMENTS.filter(a => a.getProgress(after) >= a.goal && !beforeSet.has(a.id));
}

/**
 * 永久解锁账本合并（只进不出）：把「当前按进度算出来的解锁集合」并进
 * 已持久化的 unlockedAchievements 账本。连胜回落等导致进度倒退时，
 * 已解锁的成就不会被「回锁」，奖励也因此只会发一次。
 *
 * 返回的数组保持 prevLedger 原有顺序，新解锁的按 currentUnlockedIds
 * 顺序追加；结果去重。入参不被修改。
 */
export function latchUnlocked(
  prevLedger: ReadonlyArray<string>,
  currentUnlockedIds: ReadonlyArray<string>,
): string[] {
  const seen = new Set(prevLedger);
  const merged = [...prevLedger];
  for (const id of currentUnlockedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}
