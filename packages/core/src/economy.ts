/**
 * economy.ts —— 经济系统单一事实源（Wave B 统一口径）
 *
 * 这里是 web / iOS 双端共同遵守的经济数值表与纯函数。任何一端不得偏离；
 * Swift 侧需要按 spec/golden-vectors.json 镜像同名常量与函数并跑同一组黄金向量。
 *
 * 覆盖范围：
 *   - 课程 XP（首答计分 + 零失误 + 首次三星 + 周末双倍）
 *   - 星级（accuracy → 1/2/3 星）
 *   - 每课宝石 drip（星级加成 + 首次三星 + 每日目标）
 *   - 红心（上限 / 回复节奏 / 补满价格）
 *   - 连胜护盾（价格 / 上限 / 周一补给）与连胜推进（advanceStreak）
 *   - 连胜里程碑宝石 / 每日登录奖励 / 连胜补卡
 *   - 每日目标档位 / 阅读 XP
 */

// ============================================================
// ⭐ 星级
// ============================================================

/** 三星线：首答正确率 ≥ 0.95 */
export const THREE_STAR_ACCURACY = 0.95;
/** 二星线：首答正确率 ≥ 0.80（web 端从 0.75 上调对齐） */
export const TWO_STAR_ACCURACY = 0.8;

/**
 * 由首答正确率（首答答对数 / 总题数）计算星级。
 * ≥0.95 → 3 星；≥0.80 → 2 星；否则 1 星。
 */
export function starsFromAccuracy(accuracy: number): 1 | 2 | 3 {
  if (accuracy >= THREE_STAR_ACCURACY) return 3;
  if (accuracy >= TWO_STAR_ACCURACY) return 2;
  return 1;
}

// ============================================================
// ⚡ 课程 XP
// ============================================================

/** 每道首答答对的题 = 10 XP */
export const XP_PER_CORRECT = 10;
/** 零失误（首答全对）额外 +5 XP */
export const PERFECT_XP_BONUS = 5;
/** 该课历史首次达成三星，额外 +5 XP */
export const FIRST_PERFECT_XP_BONUS = 5;
/** 周末（本地时间周六/周日）XP 总额整体 ×2，且必须在 UI 可见 */
export const WEEKEND_XP_MULTIPLIER = 2;
/** 单元挑战（exam 课）XP 总额整体 ×2，与周末双倍可叠加（宝石 drip 不翻倍） */
export const EXAM_XP_MULTIPLIER = 2;

export interface LessonXpInput {
  /** 首答答对的题数 */
  correctCount: number;
  /** 是否零失误（首答全对） */
  perfect: boolean;
  /** 是否该课历史首次达成 3 星 */
  firstPerfect: boolean;
  /** 本地时间是否为周六/周日 */
  isWeekend: boolean;
  /** 是否单元挑战课（"{bookId}-u{n}-exam"）；缺省 false */
  isExam?: boolean;
}

/**
 * 一节课的 XP 总额：
 *   base = correctCount × 10；perfect +5；firstPerfect +5；
 *   单元挑战对总额 ×2；周末再对总额 ×2（两者可叠加 = ×4）。
 */
export function xpForLesson(input: LessonXpInput): number {
  let xp = input.correctCount * XP_PER_CORRECT;
  if (input.perfect) xp += PERFECT_XP_BONUS;
  if (input.firstPerfect) xp += FIRST_PERFECT_XP_BONUS;
  if (input.isExam) xp *= EXAM_XP_MULTIPLIER;
  if (input.isWeekend) xp *= WEEKEND_XP_MULTIPLIER;
  return xp;
}

/** 本地时间是否处于周末双倍 XP（周六/周日） */
export function isWeekendXpActive(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// ============================================================
// 💎 每课宝石 drip
// ============================================================

/** 每节课基础宝石 */
export const LESSON_GEM_BASE = 3;
/** 2 星宝石加成 */
export const LESSON_GEM_TWO_STAR_BONUS = 5;
/** 3 星宝石加成（替代 2 星加成，不叠加） */
export const LESSON_GEM_THREE_STAR_BONUS = 10;
/** 该课历史首次三星，额外宝石 */
export const FIRST_PERFECT_GEM_BONUS = 15;
/** 当日首次跨过每日目标的一次性宝石奖励 */
export const DAILY_GOAL_BONUS = 20;

export interface LessonGemDripInput {
  stars: 1 | 2 | 3;
  /** 该课历史首次三星 */
  isFirstPerfect: boolean;
  /** 本次入账是否让 todayXp 当日首次跨过每日目标 */
  crossedDailyGoal: boolean;
}

/**
 * 每课宝石 drip：基础 3；2 星 +5；3 星 +10（星级加成取档，不叠加）；
 * 首次三星 +15；当日首次跨过每日目标 +20。
 */
export function lessonGemDrip(input: LessonGemDripInput): number {
  let gems = LESSON_GEM_BASE;
  if (input.stars === 3) gems += LESSON_GEM_THREE_STAR_BONUS;
  else if (input.stars === 2) gems += LESSON_GEM_TWO_STAR_BONUS;
  if (input.isFirstPerfect) gems += FIRST_PERFECT_GEM_BONUS;
  if (input.crossedDailyGoal) gems += DAILY_GOAL_BONUS;
  return gems;
}

// ============================================================
// ❤️ 红心
// ============================================================

/** 红心上限 */
export const MAX_HEARTS = 5;
/** 每颗红心的回复时长（秒） */
export const HEART_REGEN_SECONDS = 300;
/** 一次性补满红心的宝石价格 */
export const HEART_REFILL_COST = 350;

/**
 * 复习奖励红心：一轮错题复习里至少答对 REVIEW_HEART_MIN_CORRECT 题，
 * 补回 REVIEW_HEART_REWARD 颗心（不超过 MAX_HEARTS）。
 * 双端必须引用这两个常量——历史上 iOS 有、web 没有，导致同一轮复习收益不一致。
 */
export const REVIEW_HEART_REWARD = 1;
export const REVIEW_HEART_MIN_CORRECT = 5;

/**
 * 一轮复习结束后应补的红心数（已满心则为 0）。
 * @param correctCount 本轮答对题数
 * @param hearts 当前红心数
 * @param availableCount 本轮可用题数；不足五题时需整轮首答正确
 */
export function reviewHeartReward(correctCount: number, hearts: number, availableCount = REVIEW_HEART_MIN_CORRECT): number {
  if (!Number.isFinite(correctCount) || !Number.isInteger(availableCount) || availableCount < 1) return 0;
  if (correctCount < Math.min(REVIEW_HEART_MIN_CORRECT, availableCount)) return 0;
  return Math.min(REVIEW_HEART_REWARD, Math.max(0, MAX_HEARTS - hearts));
}

// ============================================================
// 🛡️ 连胜护盾 & 连胜推进
// ============================================================

/** 护盾售价（宝石） */
export const FREEZE_COST = 200;
/** 护盾持有上限（满时购买按钮置灰显示 2/2；老档超过 2 的不没收，只封新购） */
export const MAX_FREEZES = 2;
/** 新档初始护盾数 */
export const INITIAL_FREEZES = 2;

/** 连胜补卡价格：仅当今天未学且 gap≥2（护盾不够救）时可用，把 lastActiveDate 拨回昨天 */
export const STREAK_MAKEUP_COST = 50;

export interface StreakAdvanceInput {
  /** 当前连胜 */
  streak: number;
  /** 当前护盾数 */
  freezes: number;
  /** lastActiveDate 与今天相差的天数（0=同日；负数=时钟回拨） */
  gapDays: number;
  /** 今天本地时间是否为周一（护盾补给日） */
  isMonday: boolean;
}

export interface StreakAdvanceResult {
  streak: number;
  freezes: number;
  /** 本次消耗的护盾数 */
  freezesConsumed: number;
}

/**
 * 连胜推进（沿用 bumpStreak 语义的纯函数版）：
 *   - gapDays == 0（同日）或 < 0（时钟回拨）：不变，不消耗。
 *   - gapDays == 1：streak+1；**周一补给规则**：若今天是周一且护盾未满，自动补 1（封顶 MAX_FREEZES）。
 *   - gapDays >= 2：缺勤 missed = gapDays-1；护盾足够则消耗 missed 颗并 streak+1，
 *     不够则 streak 归 1（护盾保留不消耗）。
 */
export function advanceStreak(input: StreakAdvanceInput): StreakAdvanceResult {
  const { streak, freezes, gapDays, isMonday } = input;
  if (gapDays <= 0) {
    return { streak, freezes, freezesConsumed: 0 };
  }
  if (gapDays === 1) {
    const topped = isMonday && freezes < MAX_FREEZES ? freezes + 1 : freezes;
    return { streak: streak + 1, freezes: topped, freezesConsumed: 0 };
  }
  const missed = gapDays - 1;
  if (freezes >= missed) {
    return { streak: streak + 1, freezes: freezes - missed, freezesConsumed: missed };
  }
  return { streak: 1, freezes, freezesConsumed: 0 };
}

// ============================================================
// 🔥 连胜里程碑 & 每日登录奖励
// ============================================================

/**
 * 连胜里程碑宝石（每档一次，记入 claimedStreakRewards 账本）。
 */
export const STREAK_MILESTONE_REWARDS: Record<number, number> = {
  3: 30,
  7: 80,
  14: 150,
  30: 300,
  60: 500,
  100: 800,
};

/** 达到某连胜天数应发的里程碑宝石；非里程碑档返回 0。 */
export function streakMilestoneReward(streakAfter: number): number {
  return STREAK_MILESTONE_REWARDS[streakAfter] ?? 0;
}

/**
 * 每日登录奖励表：index = min(有效连胜, 7)。
 * 每日一次，记入 lastDailyRewardDate 账本。
 */
export const DAILY_REWARD_TABLE = [5, 5, 8, 12, 15, 20, 25, 30] as const;

/** 按有效连胜取每日登录奖励宝石数。 */
export function dailyRewardForStreak(streak: number): number {
  const idx = Math.min(Math.max(0, Math.floor(streak)), DAILY_REWARD_TABLE.length - 1);
  return DAILY_REWARD_TABLE[idx];
}

// ============================================================
// 🎯 每日目标
// ============================================================

/** 每日目标档位（XP）。老用户已选超出档位的值保留现值，仅选项列表变。 */
export const DAILY_GOAL_OPTIONS = [20, 50, 100, 200] as const;
export const DEFAULT_DAILY_GOAL = 50;

// ============================================================
// 📖 阅读 XP（纯 XP，无宝石）
// ============================================================

/**
 * 阅读类活动 XP：课文听读 5；跟读 10；
 * 故事测验 accuracy ≥ goodThreshold(0.8) → 15，否则 5。
 */
export const READING_XP = {
  /** 课文听读 */
  listen: 5,
  /** 跟读 */
  followup: 10,
  /** 故事测验达标（accuracy ≥ goodThreshold） */
  storyGood: 15,
  /** 故事测验未达标 */
  storyBase: 5,
  /** 故事测验达标线 */
  goodThreshold: 0.8,
} as const;

/** 故事测验按正确率取 XP。 */
export function storyQuizXp(accuracy: number): number {
  return accuracy >= READING_XP.goodThreshold ? READING_XP.storyGood : READING_XP.storyBase;
}
