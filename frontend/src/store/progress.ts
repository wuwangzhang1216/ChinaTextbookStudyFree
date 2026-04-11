"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Question, LessonResult } from "@/types";

interface MistakeEntry {
  lessonId: string;
  lessonTitle?: string;
  question: Question;
  addedAt: string;
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

  // actions
  recordLessonComplete: (lessonId: string, lessonTitle: string, accuracy: number, xpGained: number) => void;
  addMistake: (lessonId: string, lessonTitle: string, question: Question) => void;
  removeMistake: (lessonId: string, questionId: number) => void;
  clearMistakesForLesson: (lessonId: string) => void;
  bumpStreakIfNeeded: () => void;
  toggleMute: () => void;

  loseHeart: () => void;
  refreshHearts: () => void;
  refillHeartsFull: () => void; // 调试/管理用
  setDailyGoal: (goal: number) => void;

  /** 更新/写入当前进行中的课程会话 */
  upsertLessonSession: (session: ActiveLessonSession) => void;
  /** 清除进行中的会话（通关/退出/失败时调用） */
  clearLessonSession: () => void;
}

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

      hearts: MAX_HEARTS,
      nextHeartAt: null,

      dailyGoal: DEFAULT_DAILY_GOAL,
      todayXp: 0,
      lastXpDate: "",

      streakFreezes: MAX_FREEZES,

      activeLesson: null,

      recordLessonComplete: (lessonId, lessonTitle, accuracy, xpGained) => {
        const result: LessonResult = {
          lessonId,
          stars: starsFromAccuracy(accuracy),
          accuracy,
          completedAt: new Date().toISOString(),
        };
        const today = todayStr();
        set(state => {
          const todayXp = state.lastXpDate === today ? state.todayXp + xpGained : xpGained;
          return {
            xp: state.xp + xpGained,
            completedLessons: { ...state.completedLessons, [lessonId]: result },
            todayXp,
            lastXpDate: today,
          };
        });
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
        set(state => ({
          mistakesBank: [
            ...state.mistakesBank.filter(
              m => !(m.lessonId === lessonId && m.question.id === question.id),
            ),
            { lessonId, lessonTitle, question, addedAt: new Date().toISOString() },
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
        if (lastActiveDate === "") {
          set({ streak: 1, lastActiveDate: today });
          return;
        }
        const gap = daysBetween(lastActiveDate, today);
        if (gap === 1) {
          // 正常连续
          const newStreak = streak + 1;
          // 周一自动补充护盾（最多到上限）
          const newFreezes =
            isMonday() && streakFreezes < MAX_FREEZES ? streakFreezes + 1 : streakFreezes;
          set({ streak: newStreak, lastActiveDate: today, streakFreezes: newFreezes });
        } else if (gap > 1) {
          const missed = gap - 1;
          if (streakFreezes >= missed) {
            // 护盾生效：保留连胜
            set({
              streak: streak + 1,
              lastActiveDate: today,
              streakFreezes: streakFreezes - missed,
            });
          } else {
            // 连胜中断
            set({ streak: 1, lastActiveDate: today });
          }
        }
      },

      toggleMute: () => {
        set(state => ({ muted: !state.muted }));
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
    }),
    {
      name: "csf-progress-v1",
      storage: createJSONStorage(() => localStorage),
      // 版本迁移：v1 → v2（新增 hearts / dailyGoal / freezes 等字段）
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = (persistedState as Partial<ProgressState>) ?? {};
        return {
          ...state,
          hearts: state.hearts ?? MAX_HEARTS,
          nextHeartAt: state.nextHeartAt ?? null,
          dailyGoal: state.dailyGoal ?? DEFAULT_DAILY_GOAL,
          todayXp: state.todayXp ?? 0,
          lastXpDate: state.lastXpDate ?? "",
          streakFreezes: state.streakFreezes ?? MAX_FREEZES,
          activeLesson: state.activeLesson ?? null,
        } as ProgressState;
      },
    },
  ),
);
