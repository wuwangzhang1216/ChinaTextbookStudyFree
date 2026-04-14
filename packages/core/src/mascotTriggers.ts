/**
 * mascotTriggers.ts —— 上下文感知的 Mascot 表情/反应决策
 *
 * Duolingo 让 mascot 显得"有人设"的关键：不同情境给不同情绪而非永远只有
 * happy/sad 二选一。本文件把 LessonRunner 的运行时上下文映射成具体的
 * MascotMood + MascotReaction，让 Mascot 看起来像在"读懂"用户。
 *
 * 纯函数 + 零依赖，方便单元测试。
 */

import type { MascotMood, MascotReaction } from "./types";

export interface MascotTriggerContext {
  /** 这次答题对错 */
  isCorrect: boolean;
  /** 是否本节课全程零失误（包括这一题） */
  isPerfectSession: boolean;
  /** 这一题在本 session 已尝试几次（多次答错同题时 > 1） */
  attemptCount: number;
  /** 当前剩余心数 */
  remainingHearts: number;
  /** 答完这一题之后的 combo */
  combo: number;
  /** 本节课最大 combo */
  maxCombo: number;
  /** 答到第几题 (0-indexed) / 总题数 */
  index: number;
  total: number;
  /** 本 session 已答对题数 */
  totalCorrectInSession: number;
}

/**
 * 决定 mascot 的"持续表情"（happy/cheer/sad/think/proud/embarrassed...）
 *
 * 这是 reactTo 之外的"基底心情"，会在动画结束后保持。
 */
export function decideMascotMood(ctx: MascotTriggerContext): MascotMood {
  const isLastQuestion = ctx.index + 1 >= ctx.total;

  if (ctx.isCorrect) {
    // 完美 session 的最后一题答对 → 全程满分 → 骄傲
    if (isLastQuestion && ctx.isPerfectSession) return "proud";
    // 心数告急却答对 → 松一口气，开心
    if (ctx.remainingHearts === 1) return "happy";
    // 高 combo → 欢呼
    if (ctx.combo >= 5) return "cheer";
    return "happy";
  }

  // 答错分支
  // 心数告急时答错 → 尴尬（要失败了）
  if (ctx.remainingHearts <= 1) return "embarrassed";
  // 重复答错同题 → 失望
  if (ctx.attemptCount >= 2) return "sad";
  // 一般答错 → 思考重来
  return "think";
}

/**
 * 决定 mascot 的"一次性反应动画"。
 *
 * 这是 react 动画的触发，相同 reaction 通过 reactKey 重置触发。
 */
export function decideMascotReaction(ctx: MascotTriggerContext): MascotReaction {
  const isLastQuestion = ctx.index + 1 >= ctx.total;

  if (ctx.isCorrect) {
    // 完美 session 通关的最后一题 → 升级特效
    if (isLastQuestion && ctx.isPerfectSession) return "levelup";
    // 连击里程碑 → 同样升级特效（更隆重）
    if (ctx.combo === 3 || ctx.combo === 5 || ctx.combo === 10) return "levelup";
    return "correct";
  }

  return "wrong";
}

/**
 * 答题反馈气泡文案池：按情绪 mood 分组。
 * showBubble 时根据 mood 抽一句，比无脑 PRAISE/COMFORT 更有人味。
 */
export const BUBBLES_BY_MOOD: Record<MascotMood, readonly string[]> = {
  happy: ["太棒!", "答对啦!", "继续!", "漂亮!", "对的!"],
  cheer: ["完美!", "好厉害!", "太牛了!", "无敌!", "棒棒哒!"],
  proud: ["你太棒了!", "实力派!", "学霸预定!", "我为你骄傲!"],
  sad: ["别灰心!", "再来一次!", "差一点点!", "下次一定!"],
  think: ["想想看?", "再仔细一点!", "别急!", "慢慢来!"],
  embarrassed: ["小心呀!", "保住心心!", "稳住!", "深呼吸!"],
  wave: ["加油!", "我们一起!"],
  surprise: ["哇!", "诶?", "厉害厉害!"],
};

export function pickBubble(mood: MascotMood): string {
  const pool = BUBBLES_BY_MOOD[mood] ?? BUBBLES_BY_MOOD.happy;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 把 mood 映射到 SpeechBubble 的 tone（neutral/primary/danger）
 */
export function moodToTone(mood: MascotMood): "neutral" | "primary" | "danger" {
  switch (mood) {
    case "cheer":
    case "proud":
    case "happy":
      return "primary";
    case "sad":
    case "embarrassed":
      return "danger";
    default:
      return "neutral";
  }
}
