/**
 * achievements.ts —— 成就 / 徽章系统
 *
 * 不依赖额外的 store —— 直接从 useProgressStore 推导出"已解锁的成就 id 集合"。
 * 已读状态写在 localStorage 里（key: csf-achievements-seen-v1），
 * 每个成就 id 一旦被用户在成就墙看过就标记为 seen，否则在底部导航上点红点提醒。
 *
 * 解锁判断是 **纯函数** —— 输入当前 store 快照，输出 unlocked id 数组。
 * 这样可以在任何时机调用（每次 lesson complete / 进入成就页 / 服务器同步等）。
 */

import { useProgressStore } from "@/store/progress";

export type AchievementCategory = "milestone" | "streak" | "perfection" | "shop" | "review";

export interface Achievement {
  id: string;
  category: AchievementCategory;
  /** 中文显示名 */
  name: string;
  /** 解锁条件描述 */
  description: string;
  /** 图标颜色（hex） + Lucide-style 名（仅作分类标签，渲染层映射 SVG） */
  iconKey: "lightning" | "flame" | "star" | "crown" | "gem" | "bookmark" | "trophy" | "rocket" | "medal" | "sparkle";
  /** 高亮色 */
  color: string;
  /** 解锁所需进度值（用于显示进度条） */
  goal: number;
  /** 从 ProgressState 中提取当前进度值 */
  getProgress: (s: ReturnType<typeof useProgressStore.getState>) => number;
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
    getProgress: s => Object.keys(s.perfectedLessons).length,
  },

  // ===== Shop / Cosmetics =====
  {
    id: "first-cosmetic",
    category: "shop",
    name: "时尚启航",
    description: "解锁第一件美妆道具",
    iconKey: "sparkle",
    color: "#A855F7",
    goal: 1,
    getProgress: s => Math.max(0, Object.keys(s.ownedCosmetics).length - 3), // starter 3 件
  },
  {
    id: "gem-collector",
    category: "shop",
    name: "宝石收藏家",
    description: "累计获得 500 颗宝石",
    iconKey: "gem",
    color: "#A855F7",
    goal: 500,
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
    getProgress: s => s.mistakesBank.filter(m => (m.correctCount ?? 0) > 0).length,
  },
];

export const ALL_ACHIEVEMENTS: Achievement[] = A;

export function computeUnlockedAchievementIds(
  s: ReturnType<typeof useProgressStore.getState>,
): string[] {
  return ALL_ACHIEVEMENTS.filter(a => a.getProgress(s) >= a.goal).map(a => a.id);
}

// ============================================================
// Seen / Unseen 状态（localStorage 持久化）
// ============================================================

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

/**
 * 比较两次 store 快照，返回**这次新解锁**的成就 id。
 * 用于"刚刚解锁"的弹窗提示。
 */
export function diffNewlyUnlocked(
  before: ReturnType<typeof useProgressStore.getState>,
  after: ReturnType<typeof useProgressStore.getState>,
): Achievement[] {
  const beforeSet = new Set(computeUnlockedAchievementIds(before));
  return ALL_ACHIEVEMENTS.filter(a => a.getProgress(after) >= a.goal && !beforeSet.has(a.id));
}
