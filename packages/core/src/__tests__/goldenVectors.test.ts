/**
 * goldenVectors.test.ts —— 逐组断言 spec/golden-vectors.json 与 TS 实现一致。
 *
 * 这份 JSON 是 web / iOS 双端的黄金向量：Swift 侧应读取同一文件跑等价断言。
 * 任何一端实现改动导致这里飘红，说明经济口径漂移，必须先改 spec 再改实现。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vectors from "../../spec/golden-vectors.json";
import {
  MAX_HEARTS,
  REVIEW_HEART_MIN_CORRECT,
  REVIEW_HEART_REWARD,
  advanceStreak,
  dailyRewardForStreak,
  lessonGemDrip,
  reviewHeartReward,
  starsFromAccuracy,
  streakMilestoneReward,
  xpForLesson,
} from "../economy";
import {
  ALL_ACHIEVEMENTS,
  latchUnlocked,
  type AchievementProgressSnapshot,
} from "../achievements";
import { getStarterCosmetics } from "../cosmetics";
import {
  BOT_NAME_POOL,
  botWeeklyGoal,
  botXpAt,
  botsForWeek,
  type LeagueTierId,
} from "../league";
import {
  getDueSrsEntries,
  isSrsGraduated,
  reviewSrsEntry,
  type SrsBox,
  type SrsMistakeEntry,
} from "../srs";
import { computeChestsForBook } from "../chestLogic";
import type { PathLessonMeta, Question } from "../types";

// ============================================================
// 黄金向量组
// ============================================================

describe("golden vectors: stars", () => {
  for (const v of vectors.stars) {
    it(`accuracy=${v.accuracy} → ${v.expStars} 星`, () => {
      expect(starsFromAccuracy(v.accuracy)).toBe(v.expStars);
    });
  }
});

describe("golden vectors: xp", () => {
  for (const v of vectors.xp) {
    it(`correct=${v.correctCount} perfect=${v.perfect} first=${v.firstPerfect} weekend=${v.isWeekend} → ${v.expXp}`, () => {
      expect(
        xpForLesson({
          correctCount: v.correctCount,
          perfect: v.perfect,
          firstPerfect: v.firstPerfect,
          isWeekend: v.isWeekend,
        }),
      ).toBe(v.expXp);
    });
  }
});

describe("golden vectors: gemDrip", () => {
  for (const v of vectors.gemDrip) {
    it(`stars=${v.stars} first=${v.isFirstPerfect} crossedGoal=${v.crossedDailyGoal} → ${v.expGems}`, () => {
      expect(
        lessonGemDrip({
          stars: v.stars as 1 | 2 | 3,
          isFirstPerfect: v.isFirstPerfect,
          crossedDailyGoal: v.crossedDailyGoal,
        }),
      ).toBe(v.expGems);
    });
  }
});

describe("golden vectors: streakAdvance", () => {
  for (const v of vectors.streakAdvance) {
    it(v.$case, () => {
      const result = advanceStreak({
        streak: v.streak,
        freezes: v.freezes,
        gapDays: v.gapDays,
        isMonday: v.isMonday,
      });
      expect(result.streak).toBe(v.expStreak);
      expect(result.freezes).toBe(v.expFreezes);
      expect(result.freezesConsumed).toBe(v.expConsumed);
    });
  }
});

describe("golden vectors: srsReview", () => {
  const FROZEN_NOW = new Date(2026, 7, 25, 10, 0, 0); // 2026-08-25（周二）

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function localDateStr(daysFromNow: number): string {
    const d = new Date(FROZEN_NOW);
    d.setDate(d.getDate() + daysFromNow);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const dummyQuestion: Question = {
    id: 1,
    type: "choice",
    score: 1,
    difficulty: 1,
    knowledge_point: "kp",
    question: "q",
    options: ["A", "B", "C", "D"],
    answer: "A",
    explanation: "e",
  };

  for (const v of vectors.srsReview) {
    it(`box${v.box} ${v.isCorrect ? "答对" : "答错"} → box${v.expBox}，${v.expIntervalDays} 天后复习`, () => {
      const entry: SrsMistakeEntry = {
        lessonId: "lesson-1",
        question: dummyQuestion,
        addedAt: FROZEN_NOW.toISOString(),
        box: v.box as SrsBox,
        correctCount: 0,
      };
      const next = reviewSrsEntry(entry, v.isCorrect);
      expect(next.box).toBe(v.expBox);
      expect(next.nextReviewDate).toBe(localDateStr(v.expIntervalDays));
    });
  }
});

describe("golden vectors: srsGraduation", () => {
  // 这组向量是 iOS Domain/SRS.swift 的镜像基准：毕业是**派生判定**，
  // 不是"只认显式 graduated 标记"。
  for (const v of vectors.srsGraduation) {
    it(`${v.$case} → ${v.expGraduated ? "毕业" : "未毕业"}`, () => {
      expect(
        isSrsGraduated({
          graduated: v.graduated ?? undefined,
          box: v.box ?? undefined,
          correctCount: v.correctCount ?? undefined,
        }),
      ).toBe(v.expGraduated);
    });
  }

  it("due 队列过滤与毕业判定同源：派生毕业的条目不再出现", () => {
    const base = {
      lessonId: "lesson-1",
      question: { id: 1 } as unknown as Question,
      addedAt: "2020-01-01T00:00:00.000Z",
      nextReviewDate: "2020-01-01", // 早就到期
    };
    const entries: SrsMistakeEntry[] = [
      { ...base, box: 3, correctCount: 2 }, // 派生毕业，无 graduated 字段
      { ...base, box: 3, correctCount: 1 }, // 未达标
      { ...base, box: 1, correctCount: 0, graduated: true }, // 显式毕业
    ];
    const due = getDueSrsEntries(entries);
    expect(due).toHaveLength(1);
    expect(due[0].box).toBe(3);
    expect(due[0].correctCount).toBe(1);
  });
});

describe("golden vectors: dailyReward", () => {
  for (const v of vectors.dailyReward) {
    it(`streak=${v.streak} → ${v.expGems} 宝石`, () => {
      expect(dailyRewardForStreak(v.streak)).toBe(v.expGems);
    });
  }
});

describe("golden vectors: milestone", () => {
  for (const v of vectors.milestone) {
    it(`streakAfter=${v.streakAfter} → ${v.expGems} 宝石`, () => {
      expect(streakMilestoneReward(v.streakAfter)).toBe(v.expGems);
    });
  }
});

describe("golden vectors: examXp", () => {
  for (const v of vectors.examXp) {
    it(`${v.$case} → ${v.expXp}`, () => {
      expect(
        xpForLesson({
          correctCount: v.correctCount,
          perfect: v.perfect,
          firstPerfect: v.firstPerfect,
          isWeekend: v.isWeekend,
          isExam: v.isExam,
        }),
      ).toBe(v.expXp);
    });
  }
});

describe("golden vectors: league", () => {
  const g = vectors.league;
  const input = { weekKey: g.weekKey, tier: g.tier as LeagueTierId, salt: g.salt };
  // weekKey=2026-08-24（周一）；周三 12:00 与周日 23:59 均为本地时区
  const wednesdayNoon = new Date(2026, 7, 26, 12, 0);
  const sundayNight = new Date(2026, 7, 30, 23, 59);

  it("15 个 bot 名单逐字一致且组内去重", () => {
    const bots = botsForWeek(input);
    const names = bots.map(b => b.name);
    expect(names).toEqual(g.names);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(BOT_NAME_POOL).toContain(name);
  });

  for (const v of g.bots) {
    it(`bot${v.botIndex}（${v.expName}）目标 ${v.expGoal}，周三午 ${v.expXpWednesdayNoon}，周日夜 ${v.expXpSundayNight}`, () => {
      expect(botsForWeek(input)[v.botIndex].name).toBe(v.expName);
      expect(botWeeklyGoal({ ...input, botIndex: v.botIndex })).toBe(v.expGoal);
      expect(botXpAt({ ...input, botIndex: v.botIndex, date: wednesdayNoon })).toBe(v.expXpWednesdayNoon);
      expect(botXpAt({ ...input, botIndex: v.botIndex, date: sundayNight })).toBe(v.expXpSundayNight);
    });
  }
});

describe("golden vectors: chestSlot", () => {
  function makeLessons(count: number): PathLessonMeta[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `book-u1-l${i + 1}`,
      title: `第 ${i + 1} 课`,
      unitNumber: 1,
      unitTitle: "第一单元",
      kpIndex: i + 1,
      kpTotal: count,
      questionCount: 10,
    }));
  }

  for (const v of vectors.chestSlot) {
    it(`单元内完成第 ${v.lessonsCompletedInUnit} 课后应有 ${v.expChests} 个宝箱`, () => {
      const slots = computeChestsForBook("book", makeLessons(v.lessonsCompletedInUnit));
      expect(slots.length).toBe(v.expChests);
    });
  }
});

// ============================================================
// 补充单测
// ============================================================

describe("latchUnlocked（只进不出账本）", () => {
  it("空账本 + 新解锁 = 新解锁", () => {
    expect(latchUnlocked([], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("进度倒退（当前集合缩水）不会回锁", () => {
    expect(latchUnlocked(["streak-7", "streak-30"], ["streak-3"])).toEqual([
      "streak-7",
      "streak-30",
      "streak-3",
    ]);
  });

  it("重复 id 去重，且保持 prevLedger 原顺序", () => {
    expect(latchUnlocked(["a", "b"], ["b", "c", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  it("不修改入参", () => {
    const prev = ["a"];
    const current = ["a", "b"];
    latchUnlocked(prev, current);
    expect(prev).toEqual(["a"]);
    expect(current).toEqual(["a", "b"]);
  });
});

describe("reviewHeartReward（复习补心，双端同口径）", () => {
  it("答对数不足门槛不补心", () => {
    expect(reviewHeartReward(REVIEW_HEART_MIN_CORRECT - 1, 0)).toBe(0);
    expect(reviewHeartReward(0, 0)).toBe(0);
  });

  it("达到门槛补 1 颗", () => {
    expect(reviewHeartReward(REVIEW_HEART_MIN_CORRECT, 0)).toBe(REVIEW_HEART_REWARD);
    expect(reviewHeartReward(REVIEW_HEART_MIN_CORRECT + 10, 2)).toBe(REVIEW_HEART_REWARD);
  });

  it("可用错题不足五道时，完成整轮仍能回心", () => {
    expect(reviewHeartReward(3, 0, 3)).toBe(1);
    expect(reviewHeartReward(2, 0, 3)).toBe(0);
    expect(reviewHeartReward(1, 0, 1)).toBe(1);
    expect(reviewHeartReward(0, 0, 0)).toBe(0);
    expect(reviewHeartReward(3, 0, Number.NaN)).toBe(0);
  });

  it("满心不再补，也不会补出上限", () => {
    expect(reviewHeartReward(20, MAX_HEARTS)).toBe(0);
    expect(reviewHeartReward(20, MAX_HEARTS + 3)).toBe(0);
    expect(reviewHeartReward(20, MAX_HEARTS - 1)).toBe(1);
  });
});

describe("first-cosmetic 成就（初始白送不算数）", () => {
  const starterIds = getStarterCosmetics().map(c => c.id);
  const achievement = ALL_ACHIEVEMENTS.find(a => a.id === "first-cosmetic")!;
  const snapshot = (ownedIds: string[]): AchievementProgressSnapshot => ({
    xp: 0,
    streak: 0,
    lifetimeGems: 0,
    completedLessons: {},
    perfectedLessons: {},
    ownedCosmetics: Object.fromEntries(ownedIds.map(id => [id, true])),
    mistakesBank: [],
  });

  it("只拥有全部初始美妆时进度为 0", () => {
    expect(achievement.getProgress(snapshot(starterIds))).toBe(0);
  });

  it("只拥有部分初始美妆（老档缺项）时进度仍为 0", () => {
    expect(achievement.getProgress(snapshot(starterIds.slice(0, 1)))).toBe(0);
  });

  it("买到第一件非初始美妆即达标", () => {
    expect(
      achievement.getProgress(snapshot([...starterIds.slice(0, 1), "skin_panda"])),
    ).toBe(1);
  });
});

describe("dailyRewardForStreak 边界", () => {
  it("负数连胜按 0 处理", () => {
    expect(dailyRewardForStreak(-5)).toBe(5);
  });

  it("超过 7 封顶在最后一档 30", () => {
    expect(dailyRewardForStreak(8)).toBe(30);
    expect(dailyRewardForStreak(365)).toBe(30);
  });

  it("6 天 → 25", () => {
    expect(dailyRewardForStreak(6)).toBe(25);
  });
});
