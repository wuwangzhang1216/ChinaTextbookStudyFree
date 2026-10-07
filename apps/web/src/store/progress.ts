"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Question, LessonResult } from "@/types";
import { DEFAULT_EQUIPPED, getCosmeticById, getStarterCosmetics } from "@/lib/cosmetics";
import {
  starsFromAccuracy,
  lessonGemDrip,
  isWeekendXpActive,
  dailyRewardForStreak,
  MAX_HEARTS,
  HEART_REGEN_SECONDS,
  HEART_REFILL_COST,
  FREEZE_COST,
  MAX_FREEZES,
  INITIAL_FREEZES,
  STREAK_MAKEUP_COST,
  STREAK_MILESTONE_REWARDS,
  DAILY_GOAL_OPTIONS,
  DEFAULT_DAILY_GOAL,
  DAILY_GOAL_BONUS,
  FIRST_PERFECT_XP_BONUS,
  REVIEW_HEART_REWARD,
  REVIEW_HEART_MIN_CORRECT,
  reviewHeartReward,
  advanceStreak,
} from "@cstf/core/economy";
import {
  readingId,
  normalizeReadingId,
  normalizeReadingMap,
  type ReadingKind,
} from "@cstf/core/reading";
import {
  ALL_ACHIEVEMENTS,
  computeUnlockedAchievementIds,
} from "@cstf/core/achievements";
import { dailyQuests, type Quest, type QuestKind } from "@cstf/core/quests";
import { reviewSrsEntry, isSrsGraduated } from "@cstf/core/srs";
import {
  LEAGUE_BOT_COUNT,
  LEAGUE_TIERS,
  UNLOCK_LESSONS,
  botWeeklyGoal,
  nextTierId,
  prevTierId,
  settleRank,
  userRank,
  weekKeyFor,
  type LeagueTierId,
} from "@cstf/core/league";
import {
  buildBackup,
  type BackupEnvelope,
  type BackupLessonResult,
  type BackupMistake,
} from "@cstf/core/backup";

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
  /** 已毕业（box3 + 答对≥2）：保留展示「已掌握」，不再进入 due 队列 */
  graduated?: boolean;
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
  // —— 以下为可选扩展字段（错题重排队列持久化），老会话缺省不影响恢复 ——
  /** 剩余待答题目 id 队列（含错题重排回队尾的顺序） */
  queueIds?: number[];
  /** 已答对（离场）的题目 id */
  solvedIds?: number[];
  /** 本次会话最高连击 */
  maxCombo?: number;
  /** 本次会话已累计 XP（展示用） */
  sessionXp?: number;
  stage?: "intro" | "practice";
  introPage?: number;
  introMode?: "warmup" | "handbook";
  introCompletedPages?: number[];
  warmupCounted?: number[];
  currentId?: number | null;
  draftAnswer?: string;
  phase?: "answering" | "checked";
  checkedCorrect?: boolean | null;
  attemptedIds?: number[];
  totalQuestions?: number;
}

/** 🚩 题目报错类型（E2：小旗子三选） */
export type ReportKind = "question_wrong" | "answer_should_count" | "audio_issue";

/** 报错类型 → 儿童友好中文标签（UI 单一事实源） */
export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  question_wrong: "题目有误",
  answer_should_count: "我的答案应该算对",
  audio_issue: "音频有问题",
};

/**
 * 🚩 一条本地报错记录（E2）：只存在本机，不上传任何服务器。
 * 「我的」页可查看与一键导出 JSON。
 */
export interface QuestionReport {
  id: string;
  lessonId: string;
  questionId: number;
  /** 题干快照（截断），列表展示用 */
  questionText: string;
  kind: ReportKind;
  createdAt: string; // ISO
  /** 当次作答（可选，「我的答案应该算对」时最有用） */
  answerGiven?: string;
}

/**
 * 通关结算单 —— recordLessonComplete 的原子返回值，
 * 对齐 iOS ProgressStore.completeLesson 的 LessonOutcome 形态。
 * 结算页/庆祝动画只读这里的数字，不再自己扒 store 二次推算。
 */
export interface LessonOutcome {
  /** 实际入账 XP（调用方经 xpForLesson 算好传入，含周末 ×2） */
  xpGained: number;
  /** 本课宝石总额（drip：基础+星级+首次三星+每日目标 +20，全含） */
  gemsGained: number;
  stars: 1 | 2 | 3;
  streakBefore: number;
  streakAfter: number;
  /** 本次通关是否推进了连胜（今天首次学习） */
  streakIncreased: boolean;
  /** 本次入账是否让今日 XP 首次跨过每日目标 */
  dailyGoalReachedNow: boolean;
  /** 本次触发的连胜里程碑宝石（0 = 未到里程碑），已计入余额 */
  milestoneGems: number;
  /** 是否该课历史首次三星 */
  isFirstPerfect: boolean;
}

/**
 * 联赛周一结算单 —— settleLeagueIfNeeded 发现跨周后写入，
 * LeagueWatcher 消费并弹「上周战报」结算幕（名次 + 段位变化 + 宝石）。
 */
export interface PendingLeagueResult {
  /** 被结算的那一周（周一 YYYY-MM-DD） */
  weekKey: string;
  /** 上周末终值名次（1..16） */
  rank: number;
  tierBefore: LeagueTierId;
  tierAfter: LeagueTierId;
  promoted: boolean;
  demoted: boolean;
  /** 名次奖励 +（晋级时）晋级奖励，已入账 */
  gems: number;
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
  /**
   * 上次靠「复习错题」赚到红心的日期（YYYY-MM-DD，"" = 从未）。
   * 每天只能靠复习补一次心 —— 否则重复进出同一批错题就能无限刷心。
   * 与 iOS ProgressStore 的 lastReviewHeartDate 同名同义。
   */
  lastReviewHeartDate: string;

  // 每日目标
  dailyGoal: number;
  todayXp: number;
  lastXpDate: string;

  // 连胜护盾
  streakFreezes: number;
  /**
   * 「护盾一次性补发」是否已经执行过（与 iOS Progress.freezesMigrated 同名同义）。
   * 没有这个开关的话，persist version 每提升一次，migrate 里的
   * `max(现值, INITIAL_FREEZES)` 就会再白送一轮护盾。
   */
  freezesMigrated: boolean;

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

  // 🎒 v6：用户选择的年级（首次进入时引导选择，决定 home 显示哪一年级的教材）
  selectedGrade: number | null;

  // 📖 v7：阅读完成记录，**规范阅读 id**（@cstf/core/reading 的
  // `reading:{kind}:{rawId}`）→ 完成时间 ISO。
  // 与课程记录彻底分离：阅读只发 XP、不发宝石、不算课时（对齐 iOS completeReading）。
  // ⚠️ 不要手拼 key：读用 isReadingDone / 写用 completeReading(readingId(kind, rawId), xp)。
  completedReadings: Record<string, string>;

  // 🏆 v8：成就永久解锁账本（只进不出，防连胜回落"回锁"；奖励只发一次）
  unlockedAchievements: Record<string, true>;
  /** 最近一次发放但尚未庆祝的连胜里程碑（DailyRewardWatcher 消费后清空） */
  pendingStreakMilestone: { streak: number; gems: number } | null;

  // 🗓️ v9：每日任务计数（对齐 iOS rollDailyIfNeeded 的 dailyXxx 三计数）
  /** 计数所属日期（YYYY-MM-DD），跨日清零 */
  dailyQuestDate: string;
  /** 今日完成课程数 */
  dailyLessons: number;
  /** 今日复习错题道数 */
  dailyReviews: number;
  /** 今日读完的课文/故事篇数 */
  dailyReadings: number;
  /** 任务领取账本，key = "YYYY-MM-DD:questId"（防重复领取） */
  claimedQuests: Record<string, true>;

  // ⏱️ v9：学习时长独立换日字段（修复 addLearningTimeMs 污染 lastXpDate）
  lastTimeDate: string;

  // 🏠 v9：首页 IA——当前正在学的教材
  activeBookId: string | null;

  // 🏆 v10：本地模拟联赛（确定性影子同学，纯单机）
  /** 每台设备一次性生成的稳定随机串——联赛 seed 的一部分（"" = 尚未生成） */
  leagueSalt: string;
  /** 当前段位 */
  leagueTier: LeagueTierId;
  /** 当前参赛周（本周周一 YYYY-MM-DD；"" = 尚未入场） */
  leagueWeekKey: string;
  /** 待展示的上周结算幕（LeagueWatcher 消费后清空） */
  pendingLeagueResult: PendingLeagueResult | null;

  // 🚩 v11：题目报错（本地列表，不上传）
  reports: QuestionReport[];

  // actions
  setSelectedGrade: (grade: number | null) => void;
  /** 设置首页当前教材（null = 未选择，回到选书流程） */
  setActiveBookId: (bookId: string | null) => void;
  /**
   * 通关记账（原子）：XP/宝石/星级/连胜推进/里程碑/每日任务计数一次完成，
   * 返回结算单 LessonOutcome 供结算页展示。
   */
  recordLessonComplete: (lessonId: string, lessonTitle: string, accuracy: number, xpGained: number, evidence?: { questionCount: number }) => LessonOutcome;
  /**
   * 完成一篇阅读（课文听读/跟读/故事）：幂等，首次才发 XP，不发通关宝石、不写课程记录。
   * id 请传 `readingId(kind, rawId)`；传历史格式也不会记错账（内部会归一化）。
   */
  completeReading: (id: string, xp: number) => void;
  /** 某篇阅读是否已完成（内部按规范 id 查表，调用方不用关心 key 格式） */
  isReadingDone: (kind: ReadingKind, rawId: string) => boolean;
  addMistake: (lessonId: string, lessonTitle: string, question: Question) => void;
  removeMistake: (lessonId: string, questionId: number) => void;
  clearMistakesForLesson: (lessonId: string) => void;
  bumpStreakIfNeeded: () => void;
  toggleMute: () => void;
  toggleAutoNarrate: () => void;

  loseHeart: () => void;
  refreshHearts: () => void;
  refillHeartsFull: () => void; // 调试/管理用
  /**
   * 补回 n 颗红心（默认 1）：先结算自然回复再封顶 MAX_HEARTS，满心清计时。
   * 对齐 iOS ProgressStore.addHeart。
   */
  addHeart: (n?: number) => void;
  /**
   * 复习一轮错题后的补心结算（Web按可用题数调整门槛）：
   * 首答正确达五题（可用题不足五题则需整轮正确）补 REVIEW_HEART_REWARD 颗，
   * 每天最多一次（lastReviewHeartDate 账本，防止刷同一批错题无限刷心）。
   * 返回实际补到的红心数（0 = 没到门槛 / 今天领过 / 已满心）。
   */
  awardReviewHeart: (correctCount: number, availableCount?: number) => number;
  /** 花 350 宝石立即补满红心（先刷新自然回复；已满不扣费返回 false） */
  buyHeartRefill: () => boolean;
  /** 花 200 宝石购买一枚连胜护盾（持有上限 2，满则返回 false） */
  buyStreakFreeze: () => boolean;
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

  /**
   * 领取今日登陆奖励。数额按「有效连胜」折算（断签未救回按 0 档）。
   * 返回 { gems, effectiveStreak }；已领过返回 gems=0。
   */
  claimDailyReward: () => { gems: number; effectiveStreak: number };

  /** 按成就账本发放一枚成就的解锁奖励（幂等），返回发放的宝石数；已在账本返回 0 */
  claimAchievement: (id: string) => number;
  /** 里程碑庆祝已展示，清除 pending 标记 */
  clearPendingStreakMilestone: () => void;

  // 📚 SRS：复习答题后的更新（core reviewSrsEntry 单一事实源）。
  // 返回 true 表示本次复习让该题「新毕业」（box3 + 答对≥2），供 UI 庆祝。
  reviewMistake: (lessonId: string, questionId: number, isCorrect: boolean) => boolean;

  /**
   * 复习会话结算：每答对一题 +5 XP（走统一记账，含每日目标判定与
   * 达标 +20 宝石），dailyReviews += reviewedCount，推进连胜。
   * 对齐 iOS ProgressStore.awardReviewXP。返回本次入账的 XP。
   */
  awardReviewXP: (correctCount: number, reviewedCount: number) => number;

  // 🗓️ 每日任务
  /** 今天的三条任务（core dailyQuests，确定性，与 iOS 同日同任务） */
  todayQuests: () => Quest[];
  /** 某类任务今天的进度值（earnXP 用今日 XP，其余用 daily 计数） */
  questProgress: (kind: QuestKind) => number;
  /**
   * 领取一条已完成任务的宝石：按 "今天:questId" 记账防重复。
   * 实发数额以任务池为准（reward 入参仅为调用方便/接口对齐）。
   * 返回 true = 领取成功。
   */
  claimQuest: (questId: string, reward: number) => boolean;
  /** 已完成且未领取的任务数（首页红点/角标用） */
  claimableQuestCount: () => number;

  // ⏱️ 时间关怀 selectors
  /** 今天已学习的毫秒数（跨日自动归零口径） */
  todayLearningTimeMs: () => number;
  /** 是否已达到家长设置的每日时长上限（未设置上限恒为 false） */
  dailyTimeLimitReached: () => boolean;

  // 🏆 联赛
  /** 联赛是否已解锁（累计完成 ≥ 10 节课） */
  leagueUnlocked: () => boolean;
  /**
   * 打开 app 时的联赛例行检查：
   *   - 首次调用生成 leagueSalt（一次性，之后稳定不变）；
   *   - 首次入场把 leagueWeekKey 设为本周（不结算）；
   *   - 发现跨周 → 按 core settleRank 结算上周终值名次：发宝石、
   *     晋降段位、写 pendingLeagueResult 供 UI 弹结算幕。
   */
  settleLeagueIfNeeded: () => void;
  /** 结算幕已展示，清除 pending 标记 */
  clearPendingLeagueResult: () => void;

  // ⚡ 跳级（jump ahead）
  /**
   * 跳级测试通过后的批量补标：把传入课程里尚未完成的批量标记为
   * completed{stars:1, accuracy:0.8}（防刷：不发 XP / 宝石 / 连胜 / 任务计数）。
   * 已完成的课程保持原成绩不动。返回本次新标记的课程数。
   */
  jumpAheadComplete: (lessonIds: string[]) => number;

  // 💾 存档备份（BackupEnvelope v1，双端互通）
  /** 导出当前进度为中立信封（core buildBackup，platform="web"） */
  exportBackup: () => BackupEnvelope;
  /**
   * 导入一个已经过 core validateBackup 规整的信封：覆盖当前进度。
   * 红心计时 / 进行中课程 / 每日任务计数等瞬态全部复位。
   */
  importBackup: (envelope: BackupEnvelope) => void;

  // 🚩 题目报错
  /** 写入一条本地报错记录（列表封顶 200 条，超出丢最旧） */
  addReport: (input: Omit<QuestionReport, "id" | "createdAt">) => void;
}

/** 每多少课出现一个宝箱节点（真值在 @cstf/core/chestLogic 中，这里 re-export 保持向后兼容） */
export { CHEST_EVERY_N_LESSONS } from "@cstf/core/chestLogic";

// ============================================================
// 常量 —— 全部来自 @cstf/core/economy（经济单一事实源），这里只 re-export
// ============================================================

export {
  MAX_HEARTS,
  MAX_FREEZES,
  FREEZE_COST,
  HEART_REFILL_COST,
  STREAK_MILESTONE_REWARDS,
  STREAK_MAKEUP_COST,
  FIRST_PERFECT_XP_BONUS,
  DAILY_GOAL_OPTIONS,
  DEFAULT_DAILY_GOAL,
  dailyRewardForStreak,
  isWeekendXpActive as isWeekendBonusActive,
  REVIEW_HEART_REWARD,
  REVIEW_HEART_MIN_CORRECT,
};

/**
 * 阅读完成 id 的单一事实源（@cstf/core/reading）。
 * UI 调用点（PassageReader / StoryReaderClient / StoryCard）统一用它拼 key：
 *   readingId("listen" | "followup", passage.id) / readingId("story", story.id)
 */
export { readingId, type ReadingKind };

/** 一颗红心的回复时长（ms），由 core HEART_REGEN_SECONDS 折算 */
export const HEART_RECHARGE_MS = HEART_REGEN_SECONDS * 1000;

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

/**
 * 一次 XP 入账的通用记账：xp / todayXp / xpHistory 累加 + 每日目标首次达成的 +20 gems 判定。
 * recordLessonComplete 与 completeReading 共用，避免两份手抄的记账逻辑漂移。
 */
function applyXpGain(
  state: ProgressState,
  xpGained: number,
  today: string,
): {
  xp: number;
  todayXp: number;
  xpHistory: Record<string, number>;
  /** 首次跨过 dailyGoal 阈值的一次性奖励（未达成为 0） */
  goalBonusGems: number;
} {
  const isSameDay = state.lastXpDate === today;
  const prevTodayXp = isSameDay ? state.todayXp : 0;
  const newTodayXp = prevTodayXp + xpGained;
  const newXpHistory = pruneHistory({
    ...state.xpHistory,
    [today]: (state.xpHistory[today] ?? 0) + xpGained,
  });
  let goalBonusGems = 0;
  if (
    prevTodayXp < state.dailyGoal &&
    newTodayXp >= state.dailyGoal &&
    state.dailyGoal > 0
  ) {
    goalBonusGems = DAILY_GOAL_BONUS;
  }
  return {
    xp: state.xp + xpGained,
    todayXp: newTodayXp,
    xpHistory: newXpHistory,
    goalBonusGems,
  };
}

/**
 * 有效连胜（展示/结算口径）：
 * gap ≤ 1 或漏掉的天数能被护盾兜住 → 连胜仍有效；否则视为 0（已断签）。
 */
function effectiveStreakOf(
  streak: number,
  lastActiveDate: string,
  streakFreezes: number,
): number {
  if (streak <= 0 || !lastActiveDate) return 0;
  const gap = daysBetween(lastActiveDate, todayStr());
  const alive = gap <= 1 || gap - 1 <= streakFreezes;
  return alive ? streak : 0;
}

/**
 * rollQuestDayIfNeeded 的纯函数内核：跨日时把每日任务计数清零。
 * 返回需要合并进 set() 的补丁（同日返回空对象），保证与本次埋点在
 * 同一个 set 里原子生效。
 */
function questDayRollover(
  state: Pick<ProgressState, "dailyQuestDate" | "dailyLessons" | "dailyReviews" | "dailyReadings">,
  today: string,
): Partial<Pick<ProgressState, "dailyQuestDate" | "dailyLessons" | "dailyReviews" | "dailyReadings">> {
  if (state.dailyQuestDate === today) return {};
  return { dailyQuestDate: today, dailyLessons: 0, dailyReviews: 0, dailyReadings: 0 };
}

/** 复习错题：每答对一题的 XP（与 iOS MistakeReviewRunnerView.xpPerCorrect 一致） */
export const REVIEW_XP_PER_CORRECT = 5;

// ============================================================
// 🏆 联赛工具
// ============================================================

/** 生成一次性的 leagueSalt（16 字节随机 hex；无 crypto 时退化到 Math.random） */
function generateLeagueSalt(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* 走兜底 */
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 某一周（weekKey = 周一 YYYY-MM-DD）的用户周 XP：
 * xpHistory 该周 7 天求和。历史保留天数不足一周时按可得数据尽力求和。
 */
export function weekXpFromHistory(
  xpHistory: Record<string, number>,
  weekKey: string,
): number {
  const [y, m, d] = weekKey.split("-").map(Number);
  if (!y || !m || !d) return 0;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(y, m - 1, d + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    sum += xpHistory[key] ?? 0;
  }
  return sum;
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
      lastReviewHeartDate: "",

      dailyGoal: DEFAULT_DAILY_GOAL,
      todayXp: 0,
      lastXpDate: "",

      streakFreezes: INITIAL_FREEZES,
      // 新装的 app 一开始就拿到 INITIAL_FREEZES，不需要再被"补发"一次
      freezesMigrated: true,

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

      // v6
      selectedGrade: null,
      setSelectedGrade: grade => set({ selectedGrade: grade }),

      // v7
      completedReadings: {},

      // v8
      unlockedAchievements: {},
      pendingStreakMilestone: null,

      // v9：每日任务计数 + 时长独立换日 + 首页教材
      dailyQuestDate: "",
      dailyLessons: 0,
      dailyReviews: 0,
      dailyReadings: 0,
      claimedQuests: {},
      lastTimeDate: "",
      activeBookId: null,
      setActiveBookId: bookId => set({ activeBookId: bookId }),

      // v10：本地模拟联赛
      leagueSalt: "",
      leagueTier: "bronze",
      leagueWeekKey: "",
      pendingLeagueResult: null,

      // v11：题目报错
      reports: [],

      leagueUnlocked: () =>
        Object.keys(get().completedLessons).length >= UNLOCK_LESSONS,

      settleLeagueIfNeeded: () => {
        // salt 一次性生成（首次调用；此后终生稳定，保证联赛确定性）
        if (!get().leagueSalt) {
          set({ leagueSalt: generateLeagueSalt() });
        }
        const state = get();
        const currentWeek = weekKeyFor();

        // 首次入场：记录本周周键，不结算
        if (state.leagueWeekKey === "") {
          set({ leagueWeekKey: currentWeek });
          return;
        }
        // 同一周：无事发生
        if (state.leagueWeekKey === currentWeek) return;

        const prevWeekKey = state.leagueWeekKey;

        // 未解锁（<10 课）期间不真正参赛：静默滚动周键
        if (!state.leagueUnlocked()) {
          set({ leagueWeekKey: currentWeek });
          return;
        }

        // === 按上周末终值结算 ===
        // bot 终值 = 周目标全额（过周后 botXpAt 收敛到 botWeeklyGoal）
        const tier = state.leagueTier;
        const salt = state.leagueSalt || get().leagueSalt;
        const botXps: number[] = [];
        for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
          botXps.push(
            botWeeklyGoal({ weekKey: prevWeekKey, tier, salt, botIndex: i }),
          );
        }
        // 用户终值 = 上周 xpHistory 求和（保留天数不足按可得数据尽力）
        const userXp = weekXpFromHistory(state.xpHistory, prevWeekKey);
        const rank = userRank({ userXp, botXps });
        const result = settleRank(rank, tier);
        const tierAfter: LeagueTierId = result.promoted
          ? nextTierId(tier)
          : result.demoted
            ? prevTierId(tier)
            : tier;

        set(s => ({
          leagueWeekKey: currentWeek,
          leagueTier: tierAfter,
          gems: s.gems + result.gems,
          lifetimeGems: s.lifetimeGems + result.gems,
          pendingLeagueResult: {
            weekKey: prevWeekKey,
            rank,
            tierBefore: tier,
            tierAfter,
            promoted: result.promoted,
            demoted: result.demoted,
            gems: result.gems,
          },
        }));
      },

      clearPendingLeagueResult: () => {
        set({ pendingLeagueResult: null });
      },

      // --------------------------------------------------------
      // ⚡ 跳级（jump ahead）
      // --------------------------------------------------------

      jumpAheadComplete: lessonIds => {
        // 跳级口径（E2 拍板）：批量 completed{stars:1, accuracy:0.8}，
        // 不发 XP / 宝石 / 连胜 / 每日任务计数（防刷）；已完成的不动。
        const now = new Date().toISOString();
        let added = 0;
        set(state => {
          const completedLessons = { ...state.completedLessons };
          for (const id of lessonIds) {
            if (completedLessons[id]) continue;
            completedLessons[id] = {
              lessonId: id,
              stars: 1,
              accuracy: 0.8,
              completedAt: now,
            };
            added += 1;
          }
          return added > 0 ? { completedLessons } : {};
        });
        return added;
      },

      // --------------------------------------------------------
      // 💾 存档备份（BackupEnvelope v1）
      // --------------------------------------------------------

      exportBackup: () => {
        const s = get();
        // Record<number,true> → JSON 键天然是字符串，这里显式转一遍
        const claimedStreakRewards: Record<string, true> = {};
        for (const k of Object.keys(s.claimedStreakRewards)) {
          claimedStreakRewards[String(k)] = true;
        }
        const completedLessons: Record<string, BackupLessonResult> = {};
        for (const [id, r] of Object.entries(s.completedLessons)) {
          completedLessons[id] = {
            stars: r.stars,
            accuracy: r.accuracy,
            completedAt: r.completedAt,
          };
        }
        const mistakesBank: BackupMistake[] = s.mistakesBank.map(m => ({
          lessonId: m.lessonId,
          questionId: m.question.id,
          box: m.box,
          correctCount: m.correctCount,
          nextReviewDate: m.nextReviewDate,
          graduated: m.graduated,
          // 题面快照：跨端导入时可直接展示（iOS 题库齐全时会忽略）
          question: m.question,
        }));
        // 🏆 成就两个字段语义不同，如实分别导出：
        //   unlockedAchievements = 「已达成」= 实时判定 ∪ 账本（账本只进不出，
        //     所以并集才是真实的已达成集）；
        //   claimedAchievements  = 「已领取（已发过宝石）」= web 的 unlockedAchievements 账本。
        // web 上 AchievementWatcher 会在解锁的同一瞬间发钱，所以两者通常相等；
        // 相等时对端（iOS）算出的「已解锁未领取」差集为空，不会重复发奖，语义依然正确。
        let unlockedForBackup: Record<string, true> = { ...s.unlockedAchievements };
        try {
          for (const id of computeUnlockedAchievementIds(s)) {
            unlockedForBackup[id] = true;
          }
        } catch {
          // 快照字段异常时保守回退到账本本身（宁可少报"已达成"，也不谎报）
          unlockedForBackup = { ...s.unlockedAchievements };
        }
        return buildBackup({
          platform: "web",
          data: {
            xp: s.xp,
            streak: s.streak,
            lastActiveDate: s.lastActiveDate,
            streakFreezes: s.streakFreezes,
            gems: s.gems,
            lifetimeGems: s.lifetimeGems,
            hearts: s.hearts,
            dailyGoal: s.dailyGoal,
            completedLessons,
            completedReadings: s.completedReadings,
            perfectedLessons: s.perfectedLessons,
            mistakesBank,
            claimedChests: s.claimedChests,
            claimedStreakRewards,
            // 每日任务领取账本必须随档走：不带的话导入端把它当瞬态清空，
            // 又从 xpHistory 复原了今日 XP，今天领过的任务立刻回到"可领取"，
            // 「导出→导入」就能无限刷宝石。
            claimedQuests: s.claimedQuests,
            lastDailyRewardDate: s.lastDailyRewardDate,
            unlockedAchievements: unlockedForBackup,
            claimedAchievements: s.unlockedAchievements,
            ownedCosmetics: s.ownedCosmetics,
            equipped: {
              mascotSkin: s.equippedMascotSkin,
              uiTheme: s.equippedTheme,
              lessonBackdrop: s.equippedBackdrop,
            },
            xpHistory: s.xpHistory,
            leagueTier: s.leagueTier,
            leagueWeekKey: s.leagueWeekKey || undefined,
          },
        });
      },

      importBackup: envelope => {
        const d = envelope.data;
        const today = todayStr();

        const completedLessons: Record<string, LessonResult> = {};
        for (const [id, r] of Object.entries(d.completedLessons)) {
          completedLessons[id] = {
            lessonId: id,
            stars: r.stars,
            accuracy: r.accuracy,
            completedAt: r.completedAt || new Date().toISOString(),
          };
        }

        // 错题本：web 复习需要题面快照，无快照的条目只能丢弃（iOS 导出会带）
        const mistakesBank: MistakeEntry[] = [];
        for (const m of d.mistakesBank) {
          if (!m.question) continue;
          mistakesBank.push({
            lessonId: m.lessonId,
            question: m.question,
            addedAt: new Date().toISOString(),
            box: m.box ?? 1,
            correctCount: m.correctCount ?? 0,
            nextReviewDate: m.nextReviewDate ?? today,
            graduated: m.graduated ?? false,
          });
        }

        const claimedStreakRewards: Record<number, true> = {};
        for (const k of Object.keys(d.claimedStreakRewards)) {
          const n = Number(k);
          if (Number.isFinite(n) && n > 0) claimedStreakRewards[n] = true;
        }

        // 🏆 web 的 unlockedAchievements 是「已发钱账本」（进账本 = 宝石已到手）。
        // 所以导入时只能吸收对端的**已领取**集：iOS 上「已解锁但还没领」的成就
        // 不进账本，导入后 AchievementWatcher 重算时会把它当新解锁正常补发宝石。
        // 若对端根本没有 claimedAchievements 字段，说明是"解锁即发钱"语义的老档，
        // 这时才回退用 unlockedAchievements（否则会把老档的奖励重复发一遍）。
        const unlockedAchievements: Record<string, true> = {
          ...(d.claimedAchievements ?? d.unlockedAchievements),
        };

        // 🗓️ 每日任务领取账本：key 是 "YYYY-MM-DD:questId"，只有**今天**的键
        // 还会被 claimQuest / claimableQuestCount 查到（更早的日期永远查不到，
        // 留着只会白占存储），所以按今天裁剪后写回，保证「导出→导入」之后
        // 今天已经领过的任务不能再领一次。
        const claimedQuests: Record<string, true> = {};
        for (const k of Object.keys(d.claimedQuests ?? {})) {
          if (k.startsWith(`${today}:`)) claimedQuests[k] = true;
        }

        // ❤️ 红心：缺心的存档必须带着回复计时进来，否则 refreshHearts 无表可走
        //（自愈守卫也会补种，这里显式设置是为了不白白浪费一个回复周期）。
        const hearts = Math.max(0, Math.min(d.hearts, MAX_HEARTS));
        const nextHeartAt = hearts >= MAX_HEARTS ? null : Date.now() + HEART_RECHARGE_MS;

        // 装扮：starter 永远保底；未知装扮 id 回退默认（跨版本 / 跨端容错）
        const ownedCosmetics: Record<string, true> = {
          ...Object.fromEntries(getStarterCosmetics().map(c => [c.id, true as const])),
          ...d.ownedCosmetics,
        };
        const safeEquip = (id: string, fallback: string) =>
          getCosmeticById(id) ? id : fallback;

        // 联赛段位：未知段位降级 bronze；leagueSalt 保留本机值（设备指纹）
        const leagueTier: LeagueTierId = LEAGUE_TIERS.some(t => t.id === d.leagueTier)
          ? (d.leagueTier as LeagueTierId)
          : "bronze";

        set({
          xp: d.xp,
          streak: d.streak,
          lastActiveDate: d.lastActiveDate,
          streakFreezes: Math.min(d.streakFreezes, 99),
          gems: d.gems,
          lifetimeGems: d.lifetimeGems,
          hearts,
          nextHeartAt,
          dailyGoal: Math.max(10, Math.min(500, d.dailyGoal || DEFAULT_DAILY_GOAL)),
          completedLessons,
          // 阅读 key 归一化（core validateBackup 已经归一过，这里幂等兜底，
          // 防止调用方绕过校验直接塞信封）
          completedReadings: normalizeReadingMap(d.completedReadings),
          perfectedLessons: d.perfectedLessons ?? {},
          mistakesBank,
          claimedChests: d.claimedChests,
          claimedStreakRewards,
          lastDailyRewardDate: d.lastDailyRewardDate,
          unlockedAchievements,
          ownedCosmetics,
          equippedMascotSkin: safeEquip(d.equipped.mascotSkin, DEFAULT_EQUIPPED.mascotSkin),
          equippedTheme: safeEquip(d.equipped.uiTheme, DEFAULT_EQUIPPED.uiTheme),
          equippedBackdrop: safeEquip(d.equipped.lessonBackdrop, DEFAULT_EQUIPPED.lessonBackdrop),
          xpHistory: d.xpHistory,
          // 今日 XP 从 xpHistory 复原（跨端同日互导也不丢当日目标进度）
          todayXp: d.xpHistory[today] ?? 0,
          lastXpDate: d.xpHistory[today] !== undefined ? today : "",
          leagueTier,
          leagueWeekKey: d.leagueWeekKey ?? "",
          // === 瞬态全部复位（不随存档迁移）===
          activeLesson: null,
          pendingStreakMilestone: null,
          pendingLeagueResult: null,
          lessonHistory: {},
          dailyQuestDate: "",
          dailyLessons: 0,
          dailyReviews: 0,
          dailyReadings: 0,
          todayTimeMs: 0,
          lastTimeDate: "",
          // ⚠️ 不是瞬态、也不进信封：
          //   claimedQuests —— 见上，按今天裁剪后随档恢复（防重复领任务宝石）；
          //   lastReviewHeartDate —— 故意不写（保持本机当前值），
          //     否则「导出→导入」就能清掉补心账本，每天刷无数颗红心；
          //   freezesMigrated —— 保持本机 true，导入不该触发护盾补发。
          claimedQuests,
        });
      },

      // --------------------------------------------------------
      // 🚩 题目报错（本地列表，不上传）
      // --------------------------------------------------------

      addReport: input => {
        const report: QuestionReport = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          ...input,
        };
        set(state => ({
          reports: [...state.reports, report].slice(-200),
        }));
      },

      recordLessonComplete: (lessonId, lessonTitle, accuracy, xpGained, evidence) => {
        // ⚠️ XP 公式（含周末 ×2）由调用方经 @cstf/core xpForLesson 算好传入，
        //    这里不再二次翻倍 —— 保证「结算展示值 == 入账值」。
        // 整个通关记账（XP/宝石/连胜/里程碑/每日任务计数）在一个 set 里
        // 原子完成，返回结算单 —— 对齐 iOS ProgressStore.completeLesson。
        const stars = evidence && evidence.questionCount < 3 ? 1 : starsFromAccuracy(accuracy);
        const today = todayStr();

        let outcome: LessonOutcome = {
          xpGained,
          gemsGained: 0,
          stars,
          streakBefore: 0,
          streakAfter: 0,
          streakIncreased: false,
          dailyGoalReachedNow: false,
          milestoneGems: 0,
          isFirstPerfect: false,
        };

        set(state => {
          const isFirstPerfect = stars === 3 && !state.perfectedLessons[lessonId];

          // 每日任务计数：跨日清零 + 今日课程数 +1
          const roll = questDayRollover(state, today);
          const dailyLessons = (roll.dailyLessons ?? state.dailyLessons) + 1;

          // XP / todayXp / xpHistory 记账 + 每日目标首次达成判定
          const xpAccount = applyXpGain(state, xpGained, today);
          const newLessonHistory = pruneHistory({
            ...state.lessonHistory,
            [today]: (state.lessonHistory[today] ?? 0) + 1,
          });
          // 💎 每课宝石 drip —— 单一事实源 @cstf/core lessonGemDrip
          //（含每日目标 +20，不再叠加 goalBonusGems）
          const dripGems = lessonGemDrip({
            stars,
            isFirstPerfect,
            crossedDailyGoal: xpAccount.goalBonusGems > 0,
          });

          // === 🔥 连胜推进（core advanceStreak，含护盾消耗与周一补给）===
          const streakBefore = state.streak;
          let streakAfter = streakBefore;
          let streakFreezes = state.streakFreezes;
          const isNewDay = state.lastActiveDate !== today;
          if (isNewDay) {
            if (state.lastActiveDate === "") {
              streakAfter = 1;
            } else {
              const adv = advanceStreak({
                streak: state.streak,
                freezes: state.streakFreezes,
                gapDays: daysBetween(state.lastActiveDate, today),
                isMonday: isMonday(),
              });
              streakAfter = adv.streak;
              streakFreezes = adv.freezes;
            }
          }

          // === 💎 连胜里程碑：3/7/14/30/60/100（每档一次，账本防重发）===
          let milestoneGems = 0;
          let claimedStreakRewards = state.claimedStreakRewards;
          let pendingStreakMilestone = state.pendingStreakMilestone;
          const milestone = STREAK_MILESTONE_REWARDS[streakAfter];
          if (isNewDay && milestone && !state.claimedStreakRewards[streakAfter]) {
            milestoneGems = milestone;
            claimedStreakRewards = { ...state.claimedStreakRewards, [streakAfter]: true };
            // 留给 DailyRewardWatcher 弹「连续 N 天！+M💎」庆祝
            pendingStreakMilestone = { streak: streakAfter, gems: milestone };
          }

          // === 只保留最好成绩：重玩得低星不回退（对齐 iOS ProgressStore）===
          // 仅当新星级 >= 旧星级时才覆盖；accuracy 取更优，completedAt 用最新
          const prior = state.completedLessons[lessonId];
          const result: LessonResult =
            prior && stars < prior.stars
              ? prior
              : {
                  lessonId,
                  stars,
                  accuracy: Math.max(accuracy, prior?.accuracy ?? 0),
                  completedAt: new Date().toISOString(),
                };

          const totalGems = dripGems + milestoneGems;

          outcome = {
            xpGained,
            gemsGained: dripGems,
            stars,
            streakBefore,
            streakAfter,
            streakIncreased: streakAfter > streakBefore,
            dailyGoalReachedNow: xpAccount.goalBonusGems > 0,
            milestoneGems,
            isFirstPerfect,
          };

          return {
            ...roll,
            dailyLessons,
            xp: xpAccount.xp,
            completedLessons: { ...state.completedLessons, [lessonId]: result },
            todayXp: xpAccount.todayXp,
            lastXpDate: today,
            gems: state.gems + totalGems,
            lifetimeGems: state.lifetimeGems + totalGems,
            xpHistory: xpAccount.xpHistory,
            lessonHistory: newLessonHistory,
            streak: streakAfter,
            lastActiveDate: today,
            streakFreezes,
            claimedStreakRewards,
            pendingStreakMilestone,
            perfectedLessons: outcome.isFirstPerfect
              ? { ...state.perfectedLessons, [lessonId]: true as const }
              : state.perfectedLessons,
          };
        });

        // 通关后：如当前课程的错题都已掌握（用户通过），自动移除该课的错题
        // 保守起见：准确率 100% 才清理，否则保留待复习
        if (accuracy >= 0.999) {
          get().clearMistakesForLesson(lessonId);
        }
        // 记录 lessonTitle 到最近结果（未使用但便于未来）
        void lessonTitle;
        return outcome;
      },

      // 📖 阅读完成（课文听读/跟读、故事）——对齐 iOS completeReading：
      // 纯 XP，不发通关宝石、不写 completedLessons/lessonHistory，重复完成不再奖励
      completeReading: (id, xp) => {
        // key 一律归一化成 core 的规范阅读 id：即使某个调用点还在传历史格式
        // （`passage-x-listen` / `story-x` / 裸 id），也不会在表里另开一个键
        // 导致重复发 XP、或与导入的存档对不上。normalizeReadingId 幂等。
        const key = normalizeReadingId(id);
        if (key === "") return; // 认不出来的残缺 id：不记账，避免污染 key 空间
        // 幂等判断只看**键是否存在**，与 isReadingDone / UI 同一口径。
        // 不能写成 `if (map[key])`：值是完成日期，老档（或另一端导出的档）里
        // 可能是空串，真值判断会把"读过但日期不详"误判成没读过 → 每次进来都能再领一次 XP。
        if (get().completedReadings[key] != null) return; // 已完成过，幂等
        const today = todayStr();
        set(state => {
          const roll = questDayRollover(state, today);
          const dailyReadings = (roll.dailyReadings ?? state.dailyReadings) + 1;
          const xpAccount = applyXpGain(state, xp, today);
          return {
            ...roll,
            dailyReadings,
            xp: xpAccount.xp,
            todayXp: xpAccount.todayXp,
            lastXpDate: today,
            xpHistory: xpAccount.xpHistory,
            gems: state.gems + xpAccount.goalBonusGems,
            lifetimeGems: state.lifetimeGems + xpAccount.goalBonusGems,
            completedReadings: {
              ...state.completedReadings,
              [key]: new Date().toISOString(),
            },
          };
        });
        get().bumpStreakIfNeeded();
      },

      isReadingDone: (kind, rawId) =>
        get().completedReadings[readingId(kind, rawId)] != null,

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

        // === 💎 连胜里程碑奖励：3/7/14/30/60/100 天（每档一次） ===
        const reward = STREAK_MILESTONE_REWARDS[newStreak];
        if (reward && !get().claimedStreakRewards[newStreak]) {
          set(state => ({
            gems: state.gems + reward,
            lifetimeGems: state.lifetimeGems + reward,
            claimedStreakRewards: {
              ...state.claimedStreakRewards,
              [newStreak]: true,
            },
            // 留给 DailyRewardWatcher 弹「连续 N 天！+M💎」庆祝
            pendingStreakMilestone: { streak: newStreak, gems: reward },
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
        if (hearts >= MAX_HEARTS) {
          // 确保满心时 nextHeartAt 为空
          if (nextHeartAt !== null) set({ nextHeartAt: null });
          return;
        }
        if (!nextHeartAt) {
          // 🩹 自愈守卫：缺心却没有回复计时 —— 这是个「死状态」，
          // 因为回心只发生在这里（要有表才走），而 loseHeart 在 hearts<=0 时
          // 直接 return 也够不着补种。任何路径（导入存档、老档迁移、
          // 手改 localStorage）写出这个组合，都会让小朋友的红心永远停在 0、
          // 一节课都点不开，刷新也救不回来。发现即补种一个回复周期。
          set({ nextHeartAt: Date.now() + HEART_RECHARGE_MS });
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

      addHeart: (n = REVIEW_HEART_REWARD) => {
        if (n <= 0) return;
        // 先结算自然回复，封顶才是按"真实心数"来的（否则会吞掉一次回心）
        get().refreshHearts();
        const { hearts } = get();
        if (hearts >= MAX_HEARTS) return;
        const next = Math.min(MAX_HEARTS, hearts + n);
        // 补满了就停表；没补满保留原计时（不重置，否则等于惩罚玩家）
        set(state => ({
          hearts: next,
          nextHeartAt: next >= MAX_HEARTS ? null : state.nextHeartAt,
        }));
      },

      awardReviewHeart: (correctCount, availableCount) => {
        const today = todayStr();
        // 每天一次的账本：不然反复进出同一批错题就能把红心刷成无限
        if (get().lastReviewHeartDate === today) return 0;
        get().refreshHearts();
        const granted = reviewHeartReward(correctCount, get().hearts, availableCount);
        // 没到门槛 / 已经满心 → 不记账本，今天晚点真赚到了还能补
        if (granted <= 0) return 0;
        get().addHeart(granted);
        set({ lastReviewHeartDate: today });
        return granted;
      },

      buyHeartRefill: () => {
        // 先结算自然回复，避免"已经回满还扣费"
        get().refreshHearts();
        const { gems, hearts } = get();
        if (hearts >= MAX_HEARTS) return false;
        if (gems < HEART_REFILL_COST) return false;
        set(state => ({
          gems: state.gems - HEART_REFILL_COST,
          hearts: MAX_HEARTS,
          nextHeartAt: null,
        }));
        return true;
      },

      buyStreakFreeze: () => {
        const { gems, streakFreezes } = get();
        if (streakFreezes >= MAX_FREEZES) return false;
        if (gems < FREEZE_COST) return false;
        set(state => ({
          gems: state.gems - FREEZE_COST,
          streakFreezes: state.streakFreezes + 1,
        }));
        return true;
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
        // 独立 lastTimeDate 换日：不再触碰 lastXpDate（修复「计时把 todayXp
        // 的换日基准污染」的老 bug）
        const today = todayStr();
        set(state => {
          const prev = state.lastTimeDate === today ? state.todayTimeMs : 0;
          return {
            todayTimeMs: prev + ms,
            lastTimeDate: today,
          };
        });
      },

      todayLearningTimeMs: () => {
        const { lastTimeDate, todayTimeMs } = get();
        return lastTimeDate === todayStr() ? todayTimeMs : 0;
      },

      dailyTimeLimitReached: () => {
        const { dailyTimeLimitMs } = get();
        if (dailyTimeLimitMs <= 0) return false; // 0 = 家长未设上限
        return get().todayLearningTimeMs() >= dailyTimeLimitMs;
      },

      // --------------------------------------------------------
      // 🔁 连胜补卡（消耗 50 gems 找回昨天的 streak）
      // --------------------------------------------------------

      // --------------------------------------------------------
      // 📚 SRS：复习答题后更新错题状态
      // --------------------------------------------------------

      reviewMistake: (lessonId, questionId, isCorrect) => {
        // core reviewSrsEntry 单一事实源（box3 答对 → 7 天后），消灭内联 fork。
        // 毕业语义：box3 + 答对≥2 → 打 graduated 标记（保留展示，不再进 due 队列）。
        let newlyGraduated = false;
        set(state => ({
          mistakesBank: state.mistakesBank.map(m => {
            if (m.lessonId !== lessonId || m.question.id !== questionId) return m;
            const wasGraduated = m.graduated === true;
            const updated: MistakeEntry = { ...reviewSrsEntry(m, isCorrect) };
            if (!isCorrect) {
              // 防御性：答错回炉（毕业条目理论上不会再进队列）
              updated.graduated = false;
            } else if (isSrsGraduated(updated)) {
              updated.graduated = true;
              if (!wasGraduated) newlyGraduated = true;
            }
            return updated;
          }),
        }));
        return newlyGraduated;
      },

      awardReviewXP: (correctCount, reviewedCount) => {
        // 对齐 iOS ProgressStore.awardReviewXP：0 对也算复习活动（计数+连胜），
        // 但没有任何复习量时不做事。
        const xpGained = Math.max(0, correctCount) * REVIEW_XP_PER_CORRECT;
        const reviewed = Math.max(0, reviewedCount);
        if (xpGained <= 0 && reviewed <= 0) return 0;
        const today = todayStr();
        set(state => {
          const roll = questDayRollover(state, today);
          const dailyReviews = (roll.dailyReviews ?? state.dailyReviews) + reviewed;
          const xpAccount = applyXpGain(state, xpGained, today);
          return {
            ...roll,
            dailyReviews,
            xp: xpAccount.xp,
            todayXp: xpAccount.todayXp,
            lastXpDate: today,
            xpHistory: xpAccount.xpHistory,
            gems: state.gems + xpAccount.goalBonusGems,
            lifetimeGems: state.lifetimeGems + xpAccount.goalBonusGems,
          };
        });
        get().bumpStreakIfNeeded();
        return xpGained;
      },

      // --------------------------------------------------------
      // 🗓️ 每日任务
      // --------------------------------------------------------

      todayQuests: () => dailyQuests(todayStr()).map(q => q.kind === "reviewMistakes" ? { ...q, title: `巩固 ${q.target} 次练习或错题` } : q),

      questProgress: kind => {
        const state = get();
        const today = todayStr();
        // earnXP 有独立的 lastXpDate 口径；其余用每日任务计数
        if (kind === "earnXP") return state.lastXpDate === today ? state.todayXp : 0;
        if (state.dailyQuestDate !== today) return 0;
        switch (kind) {
          case "finishLessons":  return state.dailyLessons;
          case "reviewMistakes": return state.dailyReviews + state.dailyLessons;
          case "readTexts":      return state.dailyReadings;
          default:               return 0;
        }
      },

      claimQuest: (questId, reward) => {
        void reward; // 实发以任务池为准，入参仅作接口对齐
        const today = todayStr();
        const quest = dailyQuests(today).find(q => q.id === questId);
        if (!quest) return false;
        const key = `${today}:${questId}`;
        if (get().claimedQuests[key]) return false;
        if (get().questProgress(quest.kind) < quest.target) return false;
        set(state => {
          let claimed: Record<string, true> = { ...state.claimedQuests, [key]: true };
          // 账本裁剪：key 以日期开头，字典序即时间序，只留最近 60 条
          const keys = Object.keys(claimed).sort();
          if (keys.length > 60) {
            claimed = {};
            for (const k of keys.slice(-60)) claimed[k] = true;
          }
          return {
            claimedQuests: claimed,
            gems: state.gems + quest.reward,
            lifetimeGems: state.lifetimeGems + quest.reward,
          };
        });
        return true;
      },

      claimableQuestCount: () => {
        const state = get();
        const today = todayStr();
        return dailyQuests(today).filter(
          q =>
            state.questProgress(q.kind) >= q.target &&
            !state.claimedQuests[`${today}:${q.id}`],
        ).length;
      },

      claimDailyReward: () => {
        const today = todayStr();
        const { lastDailyRewardDate, streak, lastActiveDate, streakFreezes } = get();
        if (lastDailyRewardDate === today) return { gems: 0, effectiveStreak: 0 };
        // 数额按「有效连胜」折算：断签且护盾兜不住 → 按 0 档发（不谎报连续天数）
        const effectiveStreak = effectiveStreakOf(streak, lastActiveDate, streakFreezes);
        const reward = dailyRewardForStreak(effectiveStreak);
        set(state => ({
          gems: state.gems + reward,
          lifetimeGems: state.lifetimeGems + reward,
          lastDailyRewardDate: today,
        }));
        return { gems: reward, effectiveStreak };
      },

      claimAchievement: id => {
        const { unlockedAchievements } = get();
        if (unlockedAchievements[id]) return 0;
        const ach = ALL_ACHIEVEMENTS.find(a => a.id === id);
        if (!ach) return 0;
        set(state => ({
          unlockedAchievements: { ...state.unlockedAchievements, [id]: true },
          gems: state.gems + ach.reward,
          lifetimeGems: state.lifetimeGems + ach.reward,
        }));
        return ach.reward;
      },

      clearPendingStreakMilestone: () => {
        set({ pendingStreakMilestone: null });
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
      //   v5 → v6：新增 selectedGrade（首次进入引导选择年级）
      //   v6 → v7：阅读奖励从"伪课程"迁出 —— completedLessons/perfectedLessons 里
      //            passage-/story- 前缀的条目移入 completedReadings，课时统计尽力回退
      //   v7 → v8：成就永久解锁账本 unlockedAchievements（当前实时解锁集一次性写入，
      //            不补发奖励）+ pendingStreakMilestone + 护盾一次性迁移 max(现值, 2)
      //   v8 → v9：每日任务计数 dailyQuestDate/dailyLessons/dailyReviews/dailyReadings
      //            + claimedQuests 领取账本 + lastTimeDate（时长独立换日）
      //            + activeBookId（首页当前教材）
      //   v9 → v10：本地模拟联赛 leagueSalt/leagueTier/leagueWeekKey
      //            + pendingLeagueResult（salt 由首次 settleLeagueIfNeeded 生成）
      //   v10 → v11：题目报错本地列表 reports（🚩 小旗子）
      //   v11 → v12：completedReadings 的 key 升级为 core 规范阅读 id
      //            （reading:{kind}:{rawId}，双端同一 key 空间）
      //            + freezesMigrated（护盾补发一次性开关）
      //            + lastReviewHeartDate（复习补心按天账本）
      version: 12,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = (persistedState as Partial<ProgressState>) ?? {};
        const starterOwned = Object.fromEntries(
          getStarterCosmetics().map(c => [c.id, true as const]),
        );

        // === v7：把历史上以 recordLessonComplete 记录的阅读（passage-/story- 伪 id）
        //     移入 completedReadings，不再污染课程记录与成就统计 ===
        const isReadingId = (id: string) =>
          id.startsWith("passage-") || id.startsWith("story-");
        const completedLessons: Record<string, LessonResult> = {};
        const completedReadings: Record<string, string> = {
          ...(state.completedReadings ?? {}),
        };
        const lessonHistory: Record<string, number> = {
          ...(state.lessonHistory ?? {}),
        };
        for (const [id, result] of Object.entries(state.completedLessons ?? {})) {
          if (isReadingId(id)) {
            completedReadings[id] =
              completedReadings[id] ?? (result.completedAt || new Date().toISOString());
            // 课时统计尽力回退：按完成日期 -1（阅读不该算课时）
            const dayKey = (result.completedAt ?? "").slice(0, 10);
            if (dayKey && lessonHistory[dayKey]) {
              lessonHistory[dayKey] = Math.max(0, lessonHistory[dayKey] - 1);
            }
          } else {
            completedLessons[id] = result;
          }
        }
        // === v12：阅读 key 归一化 —— 上面刚并进来的 `passage-*` / `story-*` 伪 id
        //     和 iOS 老档的裸 id 一起升级到规范 `reading:{kind}:{rawId}`。
        //     normalizeReadingMap 幂等，重复迁移不会出问题；同一篇被多个历史键
        //     记过时保留较早的完成日期。 ===
        const normalizedReadings = normalizeReadingMap(completedReadings);

        const perfectedLessons = Object.fromEntries(
          Object.entries(state.perfectedLessons ?? {}).filter(
            ([id]) => !isReadingId(id),
          ),
        ) as Record<string, true>;

        // === v8：成就账本 —— 把当前按进度算出来的解锁集一次性写入（不补发奖励，
        //     这些是历史解锁；此后只有真正新解锁的成就才发宝石） ===
        const unlockedAchievements: Record<string, true> = {
          ...(state.unlockedAchievements ?? {}),
        };
        try {
          for (const id of computeUnlockedAchievementIds({
            xp: state.xp ?? 0,
            streak: state.streak ?? 0,
            lifetimeGems: state.lifetimeGems ?? 0,
            completedLessons,
            perfectedLessons,
            ownedCosmetics: state.ownedCosmetics ?? {},
            mistakesBank: state.mistakesBank ?? [],
          })) {
            unlockedAchievements[id] = true;
          }
        } catch {
          /* 快照字段异常时保守跳过，账本从空开始 */
        }

        // === v8 的「护盾一次性补发」——现在有了持久开关，最多再跑这一次 ===
        // 判定「已经补发过」：显式标记，或者存档版本 ≥ 8（那次迁移当年就跑过了）。
        // 没有这个开关时，每提升一次 persist version 都会重跑 max(现值, 2)，
        // 用护盾用到 0 的小朋友每次发版都白捡 2 个。
        const freezesAlreadyToppedUp =
          state.freezesMigrated === true || fromVersion >= 8;
        const rawFreezes = state.streakFreezes ?? INITIAL_FREEZES;
        const streakFreezes = freezesAlreadyToppedUp
          ? rawFreezes
          : Math.max(rawFreezes, INITIAL_FREEZES); // 超过 2 的不没收（只封新购）

        return {
          ...state,
          hearts: state.hearts ?? MAX_HEARTS,
          nextHeartAt: state.nextHeartAt ?? null,
          lastReviewHeartDate: state.lastReviewHeartDate ?? "",
          dailyGoal: state.dailyGoal ?? DEFAULT_DAILY_GOAL,
          todayXp: state.todayXp ?? 0,
          lastXpDate: state.lastXpDate ?? "",
          streakFreezes,
          freezesMigrated: true,
          activeLesson: state.activeLesson ?? null,
          autoNarrate: state.autoNarrate ?? true,
          gems: state.gems ?? 0,
          lifetimeGems: state.lifetimeGems ?? 0,
          claimedChests: state.claimedChests ?? {},
          completedLessons,
          perfectedLessons,
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
          lessonHistory,
          lastDailyRewardDate: state.lastDailyRewardDate ?? "",
          // v6
          selectedGrade: state.selectedGrade ?? null,
          // v7 + v12（key 已升级为规范阅读 id）
          completedReadings: normalizedReadings,
          // v8
          unlockedAchievements,
          pendingStreakMilestone: state.pendingStreakMilestone ?? null,
          // v9：每日任务计数默认零值（老档从今天起重新计数）+ 独立时长换日
          dailyQuestDate: state.dailyQuestDate ?? "",
          dailyLessons: state.dailyLessons ?? 0,
          dailyReviews: state.dailyReviews ?? 0,
          dailyReadings: state.dailyReadings ?? 0,
          claimedQuests: state.claimedQuests ?? {},
          // 时长换日基准：沿用旧档的 lastXpDate 口径起步（老实现用它换日）
          lastTimeDate: state.lastTimeDate ?? state.lastXpDate ?? "",
          activeBookId: state.activeBookId ?? null,
          // v10：联赛（salt 留空，由首次 settleLeagueIfNeeded 生成）
          leagueSalt: state.leagueSalt ?? "",
          leagueTier: state.leagueTier ?? "bronze",
          leagueWeekKey: state.leagueWeekKey ?? "",
          pendingLeagueResult: state.pendingLeagueResult ?? null,
          // v11：题目报错列表
          reports: state.reports ?? [],
        } as ProgressState;
      },
    },
  ),
);
