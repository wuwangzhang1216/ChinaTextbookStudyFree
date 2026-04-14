"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Question, LessonResult } from "@/types";
import { DEFAULT_EQUIPPED, getCosmeticById, getStarterCosmetics } from "@/lib/cosmetics";

/**
 * 错题条目，含 SRS（间隔重复）字段。
 * box / correctCount / lastReviewedAt / nextReviewDate 由 lib/srs.ts 维护。
 */
interface MistakeEntry {
  lessonId: string;
  lessonTitle?: string;
  question: Question;
  addedAt: string;
  /** SRS box（1=新错题/今天复习，2=明天，3=毕业级 7 天） */
  box?: 1 | 2 | 3;
  /** 累计答对次数 */
  correctCount?: number;
  /** 上次复习时间（ISO） */
  lastReviewedAt?: string;
  /** 下次复习日期（YYYY-MM-DD），<= today 即可复习 */
  nextReviewDate?: string;
}

/**
 * 未完成的课程会话。
 * 当用户关闭浏览器 / 切走 / 刷新时，这个对象被持久化，
 * 下次进入同一课程可以无缝恢复到上次答到的题目。
 */
export interface ActiveLessonSession {
  lessonId: string;
  index: number;
  correctCount: number;
  mistakeCount: number;
  combo: number;
  startedAt: number; // ms timestamp
}

interface ProgressState {
  // 核心进度
  xp: number;
  streak: number;
  lastActiveDate: string; // YYYY-MM-DD
  completedLessons: Record<string, LessonResult>;
  mistakesBank: MistakeEntry[];

  // 偏好
  muted: boolean;
  /** 自动朗读题干/讲解/知识卡（面向低龄）。默认 on。 */
  autoNarrate: boolean;

  // 心数系统（持久化，跨会话恢复）
  hearts: number;
  nextHeartAt: number | null; // ms timestamp

  // 每日目标
  dailyGoal: number;
  todayXp: number;
  lastXpDate: string;

  // 连胜护盾
  streakFreezes: number;

  // 未完成课程会话
  activeLesson: ActiveLessonSession | null;

  // 💎 宝石货币 / 宝箱 / 首次完美通关记录
  gems: number;
  lifetimeGems: number;
  claimedChests: Record<string, true>;
  perfectedLessons: Record<string, true>;

  // 🎨 美妆系统 v4
  /** 已解锁的 cosmetic id 集合 */
  ownedCosmetics: Record<string, true>;
  /** 当前装备的吉祥物皮肤 id */
  equippedMascotSkin: string;
  /** 当前装备的 UI 主题 id */
  equippedTheme: string;
  /** 当前装备的课程背景 id */
  equippedBackdrop: string;
  /** 已发放过的"连胜里程碑"礼物（防止重复发） */
  claimedStreakRewards: Record<number, true>;

  // ⏱️ 时间关怀（家长可选开启） v4
  /** 每日累计学习时间（毫秒，按 lastXpDate 重置） */
  todayTimeMs: number;
  /** 单日学习时间上限（毫秒），0 表示无限制 */
  dailyTimeLimitMs: number;
  /** 单次课程时长上限（毫秒），0 表示无限制 */
  sessionTimeLimitMs: number;

  // 📅 v5：每日 XP 历史 + 每日登陆奖励
  /** 每日 XP 历史 { "YYYY-MM-DD": xp }，最多保留近 60 天 */
  xpHistory: Record<string, number>;
  /** 每日完成课程数历史 { "YYYY-MM-DD": count } */
  lessonHistory: Record<string, number>;
  /** 上次领取每日登陆奖励的日期 */
  lastDailyRewardDate: string;

  // actions
  recordLessonComplete: (lessonId: string, lessonTitle: string, accuracy: number, xpGained: number) => void;
  addMistake: (lessonId: string, lessonTitle: string, question: Question) => void;
  removeMistake: (lessonId: string, questionId: number) => void;
  clearMistakesForLesson: (lessonId: string) => void;
  bumpStreakIfNeeded: () => void;
  toggleMute: () => void;
  toggleAutoNarrate: () => void;

  loseHeart: () => void;
  refreshHearts: () => void;
  refillHeartsFull: () => void; // 调试/管理用
  setDailyGoal: (goal: number) => void;

  /** 更新/写入当前进行中的课程会话 */
  upsertLessonSession: (session: ActiveLessonSession) => void;
  /** 清除进行中的会话（通关/退出/失败时调用） */
  clearLessonSession: () => void;

  // 💎 宝石 / 宝箱 / 首次完美
  addGems: (n: number) => void;
  /** 花费宝石，成功返回 true，不够返回 false */
  spendGems: (n: number) => boolean;
  /** 标记某课为已首次完美通关（幂等），返回 true 表示是首次 */
  markPerfected: (lessonId: string) => boolean;
  /** 领取宝箱（幂等），返回 true 表示是首次领取 */
  claimChest: (chestId: string) => boolean;

  // 🎨 美妆系统 actions
  /** 拥有 cosmetic（不扣 gems，比如初始赠送 / 任务奖励） */
  unlockCosmetic: (id: string) => void;
  /** 购买 cosmetic：扣 gems → 加入 owned → 自动装备。失败返回 false（gems 不够 / 已拥有 / 道具不存在） */
  purchaseCosmetic: (id: string) => { ok: boolean; reason?: string };
  /** 切换装备（必须已拥有） */
  equipCosmetic: (id: string) => boolean;

  // ⏱️ 时间关怀 actions
  setDailyTimeLimit: (ms: number) => void;
  setSessionTimeLimit: (ms: number) => void;
  /** 课程过程中按秒累加学习时间 */
  addLearningTimeMs: (ms: number) => void;

  // 🔁 连胜补卡：花 50 gems 找回昨天的 streak（不让小朋友因为漏了一天就清零）
  makeUpYesterdayStreak: () => boolean;

  /** 领取今日登陆奖励，返回获得的 gems 数；已领过返回 0 */
  claimDailyReward: () => number;

  // 📚 SRS：复习答题后的更新
  reviewMistake: (lessonId: string, questionId: number, isCorrect: boolean) => void;
}

/** 美妆系统：单次连胜里程碑奖励的 gems 数（按里程碑 stage） */
export const STREAK_MILESTONE_REWARDS: Record<number, number> = {
  3: 30,
  7: 80,
  14: 150,
  30: 300,
  60: 500,
  100: 800,
};

/** 连胜补卡价格 */
export const STREAK_MAKEUP_COST = 50;

/** 首次三星（零失误）通关的额外 XP 奖励 */
export const FIRST_PERFECT_XP_BONUS = 5;
/** 每多少课出现一个宝箱节点 */
export const CHEST_EVERY_N_LESSONS = 5;

// ============================================================
// 常量
// ============================================================

export const MAX_HEARTS = 5;
export const HEART_RECHARGE_MS = 5 * 60 * 1000; // 5 分钟
export const MAX_FREEZES = 2;
export const DAILY_GOAL_OPTIONS = [20, 50, 100, 200] as const;
export const DEFAULT_DAILY_GOAL = 50;

// ============================================================
// 工具函数
// ============================================================

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function starsFromAccuracy(acc: number): 1 | 2 | 3 {
  if (acc >= 0.95) return 3;
  if (acc >= 0.75) return 2;
  return 1;
}

/** 当前是否为周一（用于连胜护盾补给） */
function isMonday(): boolean {
  return new Date().getDay() === 1;
}

/** 保留最近 60 天的历史，防止 localStorage 持续膨胀 */
function pruneHistory<T>(history: Record<string, T>): Record<string, T> {
  const keys = Object.keys(history).sort();
  if (keys.length <= 60) return history;
  const kept = keys.slice(-60);
  const out: Record<string, T> = {};
  for (const k of kept) out[k] = history[k];
  return out;
}

/** 周末双倍 XP 标记：用于 UI 展示 */
export function isWeekendBonusActive(): boolean {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

/** 每日登陆奖励基础值（连续登陆越多奖励越大，截断到 7 日 cycle） */
export function dailyRewardForStreak(streak: number): number {
  // 1天:5 / 2:8 / 3:12 / 4:15 / 5:20 / 6:25 / 7+:30
  const table = [5, 5, 8, 12, 15, 20, 25, 30];
  return table[Math.min(streak, 7)];
}

// ============================================================
// Store
// ============================================================

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      xp: 0,
      streak: 0,
      lastActiveDate: "",
      completedLessons: {},
      mistakesBank: [],
      muted: false,
      autoNarrate: true,

      hearts: MAX_HEARTS,
      nextHeartAt: null,

      dailyGoal: DEFAULT_DAILY_GOAL,
      todayXp: 0,
      lastXpDate: "",

      streakFreezes: MAX_FREEZES,

      activeLesson: null,

      gems: 0,
      lifetimeGems: 0,
      claimedChests: {},
      perfectedLessons: {},

      // 美妆系统初值（首次启动 = 仅持有 starter 道具）
      ownedCosmetics: Object.fromEntries(
        getStarterCosmetics().map(c => [c.id, true as const]),
      ),
      equippedMascotSkin: DEFAULT_EQUIPPED.mascotSkin,
      equippedTheme: DEFAULT_EQUIPPED.uiTheme,
      equippedBackdrop: DEFAULT_EQUIPPED.lessonBackdrop,
      claimedStreakRewards: {},

      // 时间关怀（默认全部关闭，家长在 profile 里手动开）
      todayTimeMs: 0,
      dailyTimeLimitMs: 0,
      sessionTimeLimitMs: 0,

      // v5
      xpHistory: {},
      lessonHistory: {},
      lastDailyRewardDate: "",

      recordLessonComplete: (lessonId, lessonTitle, accuracy, xpGained) => {
        const stars = starsFromAccuracy(accuracy);
        // 周末双倍 XP（周六/周日）
        const day = new Date().getDay();
        const isWeekend = day === 0 || day === 6;
        if (isWeekend) {
          xpGained = xpGained * 2;
        }
        const result: LessonResult = {
          lessonId,
          stars,
          accuracy,
          completedAt: new Date().toISOString(),
        };
        const today = todayStr();

        // === 💎 gem 经济：每节课的通关奖励 ===
        // 基础：3 gems / 课
        // 二星：+5 / 三星：+10
        // 首次完美：+15
        let gemsGained = 3;
        if (stars === 2) gemsGained += 5;
        if (stars === 3) gemsGained += 10;
        const isFirstPerfect = stars === 3 && !get().perfectedLessons[lessonId];
        if (isFirstPerfect) gemsGained += 15;

        set(state => {
          const isSameDay = state.lastXpDate === today;
          const prevTodayXp = isSameDay ? state.todayXp : 0;
          const newTodayXp = prevTodayXp + xpGained;

          // === 历史聚合：用于周报 ===
          const newXpHistory = pruneHistory({
            ...state.xpHistory,
            [today]: (state.xpHistory[today] ?? 0) + xpGained,
          });
          const newLessonHistory = pruneHistory({
            ...state.lessonHistory,
            [today]: (state.lessonHistory[today] ?? 0) + 1,
          });

          // === 每日目标达成奖励：首次跨过 dailyGoal 阈值时给一次性 +20 gems ===
          let bonusGoalGems = 0;
          if (
            prevTodayXp < state.dailyGoal &&
            newTodayXp >= state.dailyGoal &&
            state.dailyGoal > 0
          ) {
            bonusGoalGems = 20;
          }
          const totalGems = gemsGained + bonusGoalGems;

          return {
            xp: state.xp + xpGained,
            completedLessons: { ...state.completedLessons, [lessonId]: result },
            todayXp: newTodayXp,
            lastXpDate: today,
            gems: state.gems + totalGems,
            lifetimeGems: state.lifetimeGems + totalGems,
            xpHistory: newXpHistory,
            lessonHistory: newLessonHistory,
          };
        });

        if (isFirstPerfect) {
          get().markPerfected(lessonId);
        }

        get().bumpStreakIfNeeded();
        // 通关后：如当前课程的错题都已掌握（用户通过），自动移除该课的错题
        // 保守起见：准确率 100% 才清理，否则保留待复习
        if (accuracy >= 0.999) {
          get().clearMistakesForLesson(lessonId);
        }
        // 记录 lessonTitle 到最近结果（未使用但便于未来）
        void lessonTitle;
      },

      addMistake: (lessonId, lessonTitle, question) => {
        const today = todayStr();
        set(state => ({
          mistakesBank: [
            ...state.mistakesBank.filter(
              m => !(m.lessonId === lessonId && m.question.id === question.id),
            ),
            {
              lessonId,
              lessonTitle,
              question,
              addedAt: new Date().toISOString(),
              // SRS 初值：box 1，今天就该复习
              box: 1,
              correctCount: 0,
              nextReviewDate: today,
            },
          ],
        }));
      },

      removeMistake: (lessonId, questionId) => {
        set(state => ({
          mistakesBank: state.mistakesBank.filter(
            m => !(m.lessonId === lessonId && m.question.id === questionId),
          ),
        }));
      },

      clearMistakesForLesson: lessonId => {
        set(state => ({
          mistakesBank: state.mistakesBank.filter(m => m.lessonId !== lessonId),
        }));
      },

      bumpStreakIfNeeded: () => {
        const today = todayStr();
        const { lastActiveDate, streak, streakFreezes } = get();
        if (lastActiveDate === today) return;
        let newStreak = streak;
        if (lastActiveDate === "") {
          newStreak = 1;
          set({ streak: 1, lastActiveDate: today });
        } else {
          const gap = daysBetween(lastActiveDate, today);
          if (gap === 1) {
            // 正常连续
            newStreak = streak + 1;
            const newFreezes =
              isMonday() && streakFreezes < MAX_FREEZES ? streakFreezes + 1 : streakFreezes;
            set({ streak: newStreak, lastActiveDate: today, streakFreezes: newFreezes });
          } else if (gap > 1) {
            const missed = gap - 1;
            if (streakFreezes >= missed) {
              newStreak = streak + 1;
              set({
                streak: newStreak,
                lastActiveDate: today,
                streakFreezes: streakFreezes - missed,
              });
            } else {
              newStreak = 1;
              set({ streak: 1, lastActiveDate: today });
            }
          }
        }

        // === 💎 连胜里程碑奖励：3/7/14/30/60/100 天 ===
        const reward = STREAK_MILESTONE_REWARDS[newStreak];
        if (reward && !get().claimedStreakRewards[newStreak]) {
          set(state => ({
            gems: state.gems + reward,
            lifetimeGems: state.lifetimeGems + reward,
            claimedStreakRewards: {
              ...state.claimedStreakRewards,
              [newStreak]: true,
            },
          }));
        }
      },

      toggleMute: () => {
        set(state => ({ muted: !state.muted }));
      },

      toggleAutoNarrate: () => {
        set(state => ({ autoNarrate: !state.autoNarrate }));
      },

      // --------------------------------------------------------
      // 心数
      // --------------------------------------------------------

      loseHeart: () => {
        const { hearts, nextHeartAt } = get();
        if (hearts <= 0) return;
        const newHearts = hearts - 1;
        // 只有原本是满心时才开始充能；否则保留已有 nextHeartAt
        const newNext = nextHeartAt ?? Date.now() + HEART_RECHARGE_MS;
        set({ hearts: newHearts, nextHeartAt: newNext });
      },

      refreshHearts: () => {
        let { hearts, nextHeartAt } = get();
        if (hearts >= MAX_HEARTS || !nextHeartAt) {
          // 确保满心时 nextHeartAt 为空
          if (hearts >= MAX_HEARTS && nextHeartAt !== null) {
            set({ nextHeartAt: null });
          }
          return;
        }
        const now = Date.now();
        let changed = false;
        while (nextHeartAt && now >= nextHeartAt && hearts < MAX_HEARTS) {
          hearts += 1;
          changed = true;
          nextHeartAt = hearts < MAX_HEARTS ? nextHeartAt + HEART_RECHARGE_MS : null;
        }
        if (changed) set({ hearts, nextHeartAt });
      },

      refillHeartsFull: () => {
        set({ hearts: MAX_HEARTS, nextHeartAt: null });
      },

      setDailyGoal: goal => {
        set({ dailyGoal: Math.max(10, Math.min(500, goal)) });
      },

      upsertLessonSession: session => {
        set({ activeLesson: session });
      },

      clearLessonSession: () => {
        set({ activeLesson: null });
      },

      // --------------------------------------------------------
      // 💎 宝石 / 宝箱 / 首次完美
      // --------------------------------------------------------

      addGems: n => {
        if (n <= 0) return;
        set(state => ({
          gems: state.gems + n,
          lifetimeGems: state.lifetimeGems + n,
        }));
      },

      spendGems: n => {
        if (n <= 0) return true;
        const { gems } = get();
        if (gems < n) return false;
        set({ gems: gems - n });
        return true;
      },

      markPerfected: lessonId => {
        const { perfectedLessons } = get();
        if (perfectedLessons[lessonId]) return false;
        set({ perfectedLessons: { ...perfectedLessons, [lessonId]: true } });
        return true;
      },

      claimChest: chestId => {
        const { claimedChests } = get();
        if (claimedChests[chestId]) return false;
        set({ claimedChests: { ...claimedChests, [chestId]: true } });
        return true;
      },

      // --------------------------------------------------------
      // 🎨 美妆系统
      // --------------------------------------------------------

      unlockCosmetic: id => {
        const item = getCosmeticById(id);
        if (!item) return;
        set(state => ({
          ownedCosmetics: { ...state.ownedCosmetics, [id]: true },
        }));
      },

      purchaseCosmetic: id => {
        const item = getCosmeticById(id);
        if (!item) return { ok: false, reason: "未找到道具" };
        const { ownedCosmetics, gems } = get();
        if (ownedCosmetics[id]) return { ok: false, reason: "已经拥有了" };
        if (gems < item.cost) return { ok: false, reason: "宝石不够" };
        set(state => ({
          gems: state.gems - item.cost,
          ownedCosmetics: { ...state.ownedCosmetics, [id]: true },
        }));
        // 自动装备购买的道具
        get().equipCosmetic(id);
        return { ok: true };
      },

      equipCosmetic: id => {
        const item = getCosmeticById(id);
        if (!item) return false;
        const { ownedCosmetics } = get();
        if (!ownedCosmetics[id]) return false;
        if (item.type === "mascot_skin") set({ equippedMascotSkin: id });
        else if (item.type === "ui_theme") set({ equippedTheme: id });
        else if (item.type === "lesson_backdrop") set({ equippedBackdrop: id });
        return true;
      },

      // --------------------------------------------------------
      // ⏱️ 时间关怀
      // --------------------------------------------------------

      setDailyTimeLimit: ms => {
        set({ dailyTimeLimitMs: Math.max(0, ms) });
      },

      setSessionTimeLimit: ms => {
        set({ sessionTimeLimitMs: Math.max(0, ms) });
      },

      addLearningTimeMs: ms => {
        if (ms <= 0) return;
        const today = todayStr();
        set(state => {
          const isSameDay = state.lastXpDate === today;
          const prev = isSameDay ? state.todayTimeMs : 0;
          return {
            todayTimeMs: prev + ms,
            lastXpDate: today,
          };
        });
      },

      // --------------------------------------------------------
      // 🔁 连胜补卡（消耗 50 gems 找回昨天的 streak）
      // --------------------------------------------------------

      // --------------------------------------------------------
      // 📚 SRS：复习答题后更新错题状态
      // --------------------------------------------------------

      reviewMistake: (lessonId, questionId, isCorrect) => {
        set(state => ({
          mistakesBank: state.mistakesBank
            .map(m => {
              if (m.lessonId !== lessonId || m.question.id !== questionId) return m;
              const today = new Date();
              const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
              if (!isCorrect) {
                // 答错 → 重置回 box 1
                return {
                  ...m,
                  box: 1 as const,
                  correctCount: 0,
                  lastReviewedAt: today.toISOString(),
                  nextReviewDate: todayDateStr,
                };
              }
              const correctCount = (m.correctCount ?? 0) + 1;
              const currentBox = m.box ?? 1;
              const nextBox: 1 | 2 | 3 = currentBox >= 3 ? 3 : ((currentBox + 1) as 2 | 3);
              const intervalDays = nextBox === 2 ? 1 : nextBox === 3 ? 3 : 7;
              const next = new Date(today);
              next.setDate(next.getDate() + intervalDays);
              const nextDateStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
              return {
                ...m,
                box: nextBox,
                correctCount,
                lastReviewedAt: today.toISOString(),
                nextReviewDate: nextDateStr,
              };
            }),
        }));
      },

      claimDailyReward: () => {
        const today = todayStr();
        const { lastDailyRewardDate, streak } = get();
        if (lastDailyRewardDate === today) return 0;
        const reward = dailyRewardForStreak(streak);
        set(state => ({
          gems: state.gems + reward,
          lifetimeGems: state.lifetimeGems + reward,
          lastDailyRewardDate: today,
        }));
        return reward;
      },

      makeUpYesterdayStreak: () => {
        const { gems, streak, lastActiveDate } = get();
        if (gems < STREAK_MAKEUP_COST) return false;
        const today = todayStr();
        // 必须是今天没活动过 + 昨天断了
        if (lastActiveDate === today) return false;
        const gap = daysBetween(lastActiveDate, today);
        if (gap < 2) return false;
        // 扣 gems + 把 lastActiveDate 设回昨天，下次 bumpStreakIfNeeded 会顺延
        set({
          gems: gems - STREAK_MAKEUP_COST,
          // 假装"昨天有学过" → 让 bumpStreakIfNeeded 看到 gap=1
          lastActiveDate: (() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          })(),
          streak,
        });
        return true;
      },
    }),
    {
      name: "csf-progress-v1",
      storage: createJSONStorage(() => localStorage),
      // 版本迁移：
      //   v1 → v2：新增 hearts / dailyGoal / freezes / activeLesson
      //   v2 → v3：新增 gems / lifetimeGems / claimedChests / perfectedLessons + autoNarrate
      //   v3 → v4：新增美妆系统 ownedCosmetics / equippedXxx + claimedStreakRewards + 时间关怀
      //   v4 → v5：新增 xpHistory / lessonHistory / lastDailyRewardDate
      version: 5,
      migrate: (persistedState: unknown) => {
        const state = (persistedState as Partial<ProgressState>) ?? {};
        const starterOwned = Object.fromEntries(
          getStarterCosmetics().map(c => [c.id, true as const]),
        );
        return {
          ...state,
          hearts: state.hearts ?? MAX_HEARTS,
          nextHeartAt: state.nextHeartAt ?? null,
          dailyGoal: state.dailyGoal ?? DEFAULT_DAILY_GOAL,
          todayXp: state.todayXp ?? 0,
          lastXpDate: state.lastXpDate ?? "",
          streakFreezes: state.streakFreezes ?? MAX_FREEZES,
          activeLesson: state.activeLesson ?? null,
          autoNarrate: state.autoNarrate ?? true,
          gems: state.gems ?? 0,
          lifetimeGems: state.lifetimeGems ?? 0,
          claimedChests: state.claimedChests ?? {},
          perfectedLessons: state.perfectedLessons ?? {},
          // v4 新字段
          ownedCosmetics: { ...starterOwned, ...(state.ownedCosmetics ?? {}) },
          equippedMascotSkin: state.equippedMascotSkin ?? DEFAULT_EQUIPPED.mascotSkin,
          equippedTheme: state.equippedTheme ?? DEFAULT_EQUIPPED.uiTheme,
          equippedBackdrop: state.equippedBackdrop ?? DEFAULT_EQUIPPED.lessonBackdrop,
          claimedStreakRewards: state.claimedStreakRewards ?? {},
          todayTimeMs: state.todayTimeMs ?? 0,
          dailyTimeLimitMs: state.dailyTimeLimitMs ?? 0,
          sessionTimeLimitMs: state.sessionTimeLimitMs ?? 0,
          xpHistory: state.xpHistory ?? {},
          lessonHistory: state.lessonHistory ?? {},
          lastDailyRewardDate: state.lastDailyRewardDate ?? "",
        } as ProgressState;
      },
    },
  ),
);
